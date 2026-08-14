import { describe, expect, it } from "@jest/globals";
import type { RankBreakdown, SourceResult } from "./types";
import { mergeResults } from "./merge";

function makeResult(overrides: Partial<SourceResult>): SourceResult {
  return {
    source: "huggingface",
    sourceId: "1",
    url: "https://hf.co/1",
    title: "",
    type: "dataset",
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

function rank(total: number): RankBreakdown {
  return { relevance: 0.5, authority: 0.3, recency: 0.2, total };
}

describe("mergeResults", () => {
  it("collapses results that share an exact DOI", () => {
    const results = [
      makeResult({
        source: "zenodo",
        title: "Climate data",
        doi: "10.5281/zenodo.1234",
        rank: rank(0.8),
      }),
      makeResult({
        source: "datagov",
        title: "Climate data (Zenodo mirror)",
        doi: "https://doi.org/10.5281/zenodo.1234",
        rank: rank(0.6),
      }),
    ];
    const merged = mergeResults(results);
    expect(merged).toHaveLength(1);
    expect(merged[0].origins.map((o) => o.source).sort()).toEqual([
      "datagov",
      "zenodo",
    ]);
  });

  it("collapses strong title matches even without ids", () => {
    const merged = mergeResults([
      makeResult({ source: "huggingface", title: "Wheat futures", rank: rank(0.7) }),
      makeResult({ source: "zenodo", title: "wheat futures", rank: rank(0.5) }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].origins).toHaveLength(2);
  });

  it("keeps distinct items as separate cards", () => {
    const merged = mergeResults([
      makeResult({ sourceId: "a", title: "Climate data", rank: rank(0.9) }),
      makeResult({ sourceId: "b", title: "Wheat futures", rank: rank(0.8) }),
    ]);
    expect(merged).toHaveLength(2);
  });

  it("uses the highest-ranked origin as primary card metadata", () => {
    const merged = mergeResults([
      makeResult({
        source: "zenodo",
        sourceId: "z1",
        title: "Climate data",
        doi: "10.5281/zenodo.9",
        rank: rank(0.4),
      }),
      makeResult({
        source: "huggingface",
        sourceId: "hf1",
        title: "Climate data (mirror)",
        doi: "10.5281/zenodo.9",
        rank: rank(0.9),
      }),
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].origins).toHaveLength(2);
    expect(merged[0].origins[0].source).toBe("huggingface");
    expect(merged[0].rank!.total).toBe(0.9);
  });

  it("sorts cards by total rank descending", () => {
    const merged = mergeResults([
      makeResult({ sourceId: "low", title: "Zebra stripes", rank: rank(0.2) }),
      makeResult({ sourceId: "high", title: "Apples", rank: rank(0.9) }),
    ]);
    expect(merged[0].uid).toBe("d:" + hashOf("apples"));
  });

  it("returns an empty array for no input", () => {
    expect(mergeResults([])).toEqual([]);
  });

  it("preserves origin details for every merged source", () => {
    const merged = mergeResults([
      makeResult({
        source: "huggingface",
        sourceId: "hf1",
        title: "Climate data",
        license: "MIT",
        url: "https://hf.co/c",
        rank: rank(0.8),
      }),
      makeResult({
        source: "zenodo",
        sourceId: "z1",
        title: "climate data",
        license: "CC-BY",
        url: "https://zenodo.org/c",
        rank: rank(0.5),
      }),
    ]);
    const origins = merged[0].origins;
    expect(origins.find((o) => o.source === "huggingface")!.license).toBe("MIT");
    expect(origins.find((o) => o.source === "zenodo")!.license).toBe("CC-BY");
  });
});

function hashOf(title: string): string {
  // FNV-1a 32-bit — same algorithm as src/lib/format.ts hashString.
  let hash = 0x811c9dc5;
  for (let i = 0; i < title.length; i += 1) {
    hash ^= title.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}