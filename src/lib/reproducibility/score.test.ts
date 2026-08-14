import { afterEach, describe, expect, it, jest } from "@jest/globals";
import {
  combineScore,
  provisionalParts,
  scoreLicense,
  scoreLiveness,
  scoreMaintenance,
  scoreMetadata,
  scoreTone,
} from "./score";

afterEach(() => {
  jest.useRealTimers();
});

describe("scoreMetadata", () => {
  it("scores richly described, sized, dated items at 1", () => {
    const part = scoreMetadata({
      description: "x".repeat(200),
      size: "1.2 GB",
      updatedAt: "2026-01-01T00:00:00Z",
    });
    expect(part.score).toBe(1);
    expect(part.state).toBe("ok");
  });

  it("scores bare items low", () => {
    const part = scoreMetadata({});
    expect(part.score).toBe(0);
    expect(part.detail).toContain("no description");
    expect(part.detail).toContain("no size");
  });

  it("splits description substance into 0.4 / 0.7 / 1 tiers", () => {
    expect(scoreMetadata({ description: "short" }).score).toBeCloseTo(0.2, 5);
    expect(
      scoreMetadata({ description: "x".repeat(60), size: "1 MB" }).score,
    ).toBeCloseTo(0.7 * 0.5 + 0.25, 5);
  });
});

describe("scoreLicense", () => {
  it("scores permissive licenses highly", () => {
    expect(scoreLicense("Public Domain", null).score).toBe(1);
    expect(scoreLicense("MIT", "MIT").score).toBe(0.9);
    expect(scoreLicense("Apache-2.0", null).score).toBe(0.9);
    expect(scoreLicense("CC-BY", null).score).toBe(0.9);
  });

  it("scores non-commercial and unknown licenses lower", () => {
    expect(scoreLicense("CC-BY-NC", null).score).toBe(0.6);
    expect(scoreLicense("Unknown", null).score).toBe(0.2);
  });
});

describe("scoreLiveness", () => {
  it("maps up / down / unknown", () => {
    expect(scoreLiveness("up")).toMatchObject({ score: 1, state: "ok" });
    expect(scoreLiveness("down")).toMatchObject({ score: 0, state: "ok" });
    expect(scoreLiveness("unknown")).toMatchObject({
      score: 0.5,
      state: "unknown",
    });
  });
});

describe("scoreMaintenance", () => {
  it("treats missing data as unknown with neutral score", () => {
    expect(scoreMaintenance(null)).toMatchObject({ score: 0.5, state: "unknown" });
  });

  it("scores by recency of last activity", () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    expect(scoreMaintenance("2025-11-01T00:00:00Z").score).toBe(1); // ~2 months
    expect(scoreMaintenance("2024-06-01T00:00:00Z").score).toBe(0.7); // ~1.5 years
    expect(scoreMaintenance("2020-01-01T00:00:00Z").score).toBe(0.3); // stale
  });
});

describe("combineScore", () => {
  it("blends parts with the documented weights to a 0-100 total", () => {
    const result = combineScore(
      scoreMetadata({ description: "x".repeat(200), size: "1 GB", updatedAt: "2026-01-01" }),
      scoreLicense("MIT", null),
      scoreLiveness("up"),
      scoreMaintenance("2025-12-01T00:00:00Z"),
    );
    expect(result.total).toBeGreaterThanOrEqual(90);
  });

  it("flags estimating while liveness/maintenance are pending", () => {
    const result = combineScore(
      scoreMetadata({}),
      scoreLicense("Unknown", null),
      { score: 0.5, state: "pending", detail: "checking…" },
      { score: 0.5, state: "pending", detail: "checking…" },
    );
    expect(result.estimating).toBe(true);
  });

  it("is not estimating once all parts resolve", () => {
    const result = combineScore(
      scoreMetadata({}),
      scoreLicense("Unknown", null),
      scoreLiveness("up"),
      scoreMaintenance(null),
    );
    expect(result.estimating).toBe(false);
  });
});

describe("provisionalParts", () => {
  it("provides neutral pending estimates for lazy components", () => {
    const parts = provisionalParts(
      scoreMetadata({}),
      scoreLicense("Unknown", null),
    );
    expect(parts.liveness.state).toBe("pending");
    expect(parts.liveness.score).toBe(0.5);
    expect(parts.maintenance.state).toBe("pending");
    expect(parts.maintenance.score).toBe(0.5);
  });
});

describe("scoreTone", () => {
  it("maps total to green/amber/red", () => {
    expect(scoreTone(70)).toBe("green");
    expect(scoreTone(69)).toBe("amber");
    expect(scoreTone(40)).toBe("amber");
    expect(scoreTone(39)).toBe("red");
  });
});