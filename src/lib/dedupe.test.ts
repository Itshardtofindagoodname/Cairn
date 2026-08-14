import { describe, expect, it } from "@jest/globals";
import {
  areSameItem,
  areSameTitle,
  authorOverlap,
  haveExactIdMatch,
  levenshtein,
  sameItemConfidence,
} from "./dedupe";

describe("levenshtein", () => {
  it("computes edit distance", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
    expect(levenshtein("", "abc")).toBe(3);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("abc", "abc")).toBe(0);
    expect(levenshtein("cifar10", "cifar-10")).toBe(1);
  });
});

describe("areSameTitle", () => {
  it("matches identical titles regardless of case/punctuation", () => {
    expect(areSameTitle("Sentiment Analysis", "sentiment analysis")).toBe(true);
    expect(areSameTitle("The CIFAR-10 dataset", "cifar 10")).toBe(true);
  });

  it("allows single-token typos within the edit budget", () => {
    expect(areSameTitle("cifar10", "cifar10")).toBe(true);
  });

  it("rejects clearly different titles", () => {
    expect(areSameTitle("Climate change data", "Wheat futures")).toBe(false);
    expect(areSameTitle("cifar10", "imagenet")).toBe(false);
  });
});

describe("haveExactIdMatch", () => {
  it("matches DOIs despite prefix variants", () => {
    expect(
      haveExactIdMatch(
        "doi:10.5281/zenodo.1234",
        null,
        "https://doi.org/10.5281/zenodo.1234",
        null,
      ),
    ).toBe(true);
  });

  it("matches arXiv ids despite prefixes", () => {
    expect(
      haveExactIdMatch(null, "arxiv:2103.00112", null, "2103.00112"),
    ).toBe(true);
  });

  it("returns false when ids differ or are missing", () => {
    expect(haveExactIdMatch("10.1/x", null, "10.1/y", null)).toBe(false);
    expect(haveExactIdMatch(null, null, null, null)).toBe(false);
    expect(haveExactIdMatch("10.1/x", null, null, null)).toBe(false);
  });
});

describe("authorOverlap", () => {
  it("returns the overlap ratio of the smaller set", () => {
    expect(
      authorOverlap(["Ada Lovelace", "Grace Hopper"], ["Ada Lovelace"]),
    ).toBe(1);
    expect(
      authorOverlap(["Ada Lovelace"], ["Ada Lovelace", "Grace Hopper"]),
    ).toBe(1);
    expect(authorOverlap(["Ada Lovelace"], ["Grace Hopper"])).toBe(0);
  });

  it("handles missing author lists", () => {
    expect(authorOverlap(undefined, ["Ada Lovelace"])).toBe(0);
    expect(authorOverlap(undefined, undefined)).toBe(0);
  });
});

describe("sameItemConfidence / areSameItem", () => {
  it("returns 1 for an exact DOI match", () => {
    expect(
      sameItemConfidence(
        { title: "Anything", doi: "10.5281/zenodo.1" },
        { title: "Anything else", doi: "doi:10.5281/zenodo.1" },
      ),
    ).toBe(1);
  });

  it("returns 1 for identical titles", () => {
    expect(
      sameItemConfidence(
        { title: "Wheat futures" },
        { title: "wheat futures" },
      ),
    ).toBe(1);
  });

  it("accepts moderate title matches when authors genuinely overlap", () => {
    const a = {
      title: "Deep learning for climate prediction",
      authors: ["Ada Lovelace", "Grace Hopper"],
    };
    const b = {
      title: "Deep learning for weather prediction",
      authors: ["Grace Hopper", "Ada Lovelace", "Alan Turing"],
    };
    expect(areSameItem(a, b)).toBe(true);
    expect(sameItemConfidence(a, b)).toBeGreaterThan(0.4);
  });

  it("rejects a moderate title match when authors do not overlap", () => {
    const a = {
      title: "Deep learning for climate prediction",
      authors: ["Ada Lovelace"],
    };
    const b = {
      title: "Deep learning for weather prediction",
      authors: ["Grace Hopper"],
    };
    expect(areSameItem(a, b)).toBe(false);
  });

  it("rejects weak title matches without author support", () => {
    const a = {
      title: "Deep learning for climate prediction",
      authors: ["Ada Lovelace"],
    };
    const b = {
      title: "Machine learning for weather forecasting",
      authors: ["Grace Hopper"],
    };
    expect(areSameItem(a, b)).toBe(false);
  });
});