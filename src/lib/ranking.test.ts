import { afterEach, describe, expect, it, jest } from "@jest/globals";
import type { SourceResult } from "./types";
import {
  RANKING_WEIGHTS,
  RECENCY_HALF_LIFE_DAYS,
  rankBatch,
  recencyScore,
} from "./ranking";

function makeResult(overrides: Partial<SourceResult>): SourceResult {
  return {
    source: "arxiv",
    sourceId: "1",
    url: "https://example.com/1",
    title: "",
    type: "paper",
    description: "",
    size: null,
    sizeBytes: null,
    license: "Unknown",
    licenseRaw: null,
    preview: { type: "none", url: null },
    snippet: "",
    metadata: {},
    ...overrides,
  };
}

afterEach(() => {
  jest.useRealTimers();
});

describe("recencyScore", () => {
  it("scores a just-published item close to 1", () => {
    const now = Date.now();
    expect(recencyScore(new Date(now).toISOString())).toBeCloseTo(1, 2);
  });

  it("scores an item at the half-life close to 0.5", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const halfLifeAgo = new Date(
      Date.now() - RECENCY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(recencyScore(halfLifeAgo)).toBeCloseTo(0.5, 2);
  });

  it("decays old items toward zero", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const ancient = new Date("2000-01-01T00:00:00Z").toISOString();
    expect(recencyScore(ancient)).toBeLessThan(0.1);
  });

  it("returns a neutral 0.5 when the date is unknown or invalid", () => {
    expect(recencyScore(null)).toBe(0.5);
    expect(recencyScore(undefined)).toBe(0.5);
    expect(recencyScore("not-a-date")).toBe(0.5);
  });
});

describe("rankBatch", () => {
  it("sorts results by total score descending", () => {
    const results = [
      makeResult({
        sourceId: "a",
        title: "Climate change 2026",
        description: "A study of climate change",
        publishedAt: new Date().toISOString(),
        popularity: 100,
      }),
      makeResult({
        sourceId: "b",
        title: "Wheat futures",
        description: "Commodity prices",
        publishedAt: new Date().toISOString(),
        popularity: 1,
      }),
    ];
    const ranked = rankBatch("climate change", results);
    expect(ranked[0].sourceId).toBe("a");
    expect(ranked[0].rank!.total).toBeGreaterThan(ranked[1].rank!.total);
  });

  it("blends the three signals with the documented weights", () => {
    const weights = RANKING_WEIGHTS;
    const r = makeResult({
      sourceId: "perfect",
      title: "Climate change",
      description: "Climate change research",
      publishedAt: new Date().toISOString(),
      popularity: 1000000,
    });
    const batch = [r];
    const ranked = rankBatch("climate change", batch);
    const b = ranked[0].rank!;
    // relevance ≈ 1, authority ≈ 1 (single item min==max => 1 when >0),
    // recency ≈ 1 (fresh) → total ≈ 1.
    expect(b.relevance).toBe(1);
    expect(b.authority).toBe(1);
    expect(b.recency).toBeCloseTo(1, 2);
    expect(b.total).toBeCloseTo(1, 1);
    expect(b.total).toBeCloseTo(
      weights.relevance * b.relevance +
        weights.authority * b.authority +
        weights.recency * b.recency,
      3,
    );
  });

  it("normalizes authority via log-scaling so bigger popularity wins within a batch", () => {
    const results = [
      makeResult({
        sourceId: "small",
        title: "Climate change",
        description: "Climate change research",
        publishedAt: new Date().toISOString(),
        popularity: 100,
      }),
      makeResult({
        sourceId: "huge",
        title: "Climate change",
        description: "Climate change research",
        publishedAt: new Date().toISOString(),
        popularity: 1000000,
      }),
    ];
    const ranked = rankBatch("climate change", results);
    expect(ranked[0].sourceId).toBe("huge");
    expect(ranked[1].rank!.authority).toBe(0);
  });

  it("attaches rounded breakdowns to every result", () => {
    const ranked = rankBatch("climate change", [
      makeResult({ title: "Climate change", description: "research" }),
    ]);
    const b = ranked[0].rank!;
    for (const v of [b.relevance, b.authority, b.recency, b.total]) {
      expect(Math.round(v * 1000)).toBeCloseTo(v * 1000, 0);
    }
  });

  it("returns an empty batch unchanged", () => {
    expect(rankBatch("climate change", [])).toEqual([]);
  });

  it("gives results with unknown dates a neutral recency contribution", () => {
    const results = [
      makeResult({
        sourceId: "undated",
        title: "Climate change",
        description: "research",
      }),
      makeResult({
        sourceId: "fresh",
        title: "Climate change",
        description: "research",
        publishedAt: new Date().toISOString(),
      }),
    ];
    const ranked = rankBatch("climate change", results);
    expect(ranked.find((r) => r.sourceId === "undated")!.rank!.recency).toBe(0.5);
    expect(ranked.find((r) => r.sourceId === "fresh")!.rank!.recency).toBeCloseTo(1, 2);
  });
});