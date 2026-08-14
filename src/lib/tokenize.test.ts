import { describe, expect, it } from "@jest/globals";
import {
  DEDUPE_STOPWORDS,
  MIN_TOKEN_LENGTH,
  RANKING_STOPWORDS,
  tokenize,
} from "./tokenize";

describe("tokenize", () => {
  it("lowercases and splits on non-alphanumerics", () => {
    expect(tokenize("Hello World")).toEqual(["hello", "world"]);
    expect(tokenize("CIFAR-10")).toEqual(["cifar", "10"]);
    expect(tokenize("pandas.read_csv()")).toEqual(["pandas", "read", "csv"]);
  });

  it("drops ranking stopwords by default", () => {
    expect(tokenize("The quick brown fox")).toEqual(["quick", "brown", "fox"]);
    expect(tokenize("a dataset of models")).toEqual([]);
  });

  it("enforces a minimum token length", () => {
    expect(tokenize("x y ab")).toEqual(["ab"]);
    expect(tokenize("x y ab", { minTokenLength: 1 })).toEqual(["x", "y", "ab"]);
  });

  it("normalizes combining diacritics by default", () => {
    expect(tokenize("cafe\u0301 au lait")).toEqual(["cafe", "au", "lait"]);
  });

  it("respects custom stopword sets", () => {
    expect(
      tokenize("data science", { stopwords: new Set(["data"]) }),
    ).toEqual(["science"]);
    expect(tokenize("data science", { stopwords: new Set() })).toEqual([
      "data",
      "science",
    ]);
  });

  it("keeps domain terms in the dedupe stopword set", () => {
    expect(tokenize("dataset", { stopwords: DEDUPE_STOPWORDS })).toEqual([]);
    expect(tokenize("model zoo", { stopwords: DEDUPE_STOPWORDS })).toEqual([
      "zoo",
    ]);
  });

  it("returns empty tokens for empty or stopword-only input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("the and of")).toEqual([]);
  });

  it("exposes the ranking constants", () => {
    expect(MIN_TOKEN_LENGTH).toBe(2);
    expect(RANKING_STOPWORDS.has("dataset")).toBe(true);
    expect(DEDUPE_STOPWORDS.has("of")).toBe(true);
  });
});
