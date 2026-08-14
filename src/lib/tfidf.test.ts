import { describe, expect, it } from "@jest/globals";
import {
  documentFrequency,
  inverseDocumentFrequency,
  maxRawScore,
  scoreTfIdf,
  termFrequency,
  tokenize,
} from "./tfidf";

describe("termFrequency", () => {
  it("counts occurrences per token", () => {
    const tf = termFrequency(["climate", "change", "climate"]);
    expect(tf.get("climate")).toBe(2);
    expect(tf.get("change")).toBe(1);
    expect(tf.get("wheat")).toBeUndefined();
  });
});

describe("documentFrequency", () => {
  it("counts documents containing each token (not occurrences)", () => {
    const df = documentFrequency([
      ["climate", "change", "climate"],
      ["climate"],
      ["wheat"],
    ]);
    expect(df.get("climate")).toBe(2);
    expect(df.get("change")).toBe(1);
    expect(df.get("wheat")).toBe(1);
  });
});

describe("inverseDocumentFrequency", () => {
  it("gives rarer terms a higher weight", () => {
    const idf = inverseDocumentFrequency([["a", "b"], ["a", "c"]]);
    expect(idf.get("a")).toBeCloseTo(Math.log(3 / 3) + 1, 5); // in all docs
    expect(idf.get("b")).toBeCloseTo(Math.log(3 / 2) + 1, 5); // rare
    expect(idf.get("b")!).toBeGreaterThan(idf.get("a")!);
  });
});

describe("scoreTfIdf / maxRawScore", () => {
  const docs = [
    ["climate", "change"],
    ["climate"],
    ["wheat"],
  ];
  const query = ["climate", "change"];
  const idf = inverseDocumentFrequency(docs);

  it("normalizes the best matching document to exactly 1.0", () => {
    const max = maxRawScore(docs, query, idf);
    const best = scoreTfIdf(docs[0], query, idf, max);
    const partial = scoreTfIdf(docs[1], query, idf, max);
    expect(best.score).toBe(1);
    expect(partial.score).toBeLessThan(1);
  });

  it("reports which query terms hit and their weights", () => {
    const max = maxRawScore(docs, query, idf);
    const hit = scoreTfIdf(docs[0], query, idf, max);
    expect(hit.hits.map((h) => h.term).sort()).toEqual(["change", "climate"]);
    expect(hit.raw).toBeGreaterThan(0);
  });

  it("scores 0 with no hits when no query term matches", () => {
    const max = maxRawScore(docs, query, idf);
    const miss = scoreTfIdf(["wheat"], query, idf, max);
    expect(miss.score).toBe(0);
    expect(miss.hits).toEqual([]);
  });

  it("handles an empty query token set", () => {
    const max = maxRawScore(docs, [], idf);
    expect(scoreTfIdf(docs[0], [], idf, max).score).toBe(0);
  });

  it("works end-to-end from raw text via tokenize", () => {
    const texts = [
      "Climate change is real",
      "Wheat prices this quarter",
    ];
    const corpus = texts.map(tokenize);
    const q = tokenize("climate change");
    const idf2 = inverseDocumentFrequency(corpus);
    const max = maxRawScore(corpus, q, idf2);
    const climate = scoreTfIdf(corpus[0], q, idf2, max);
    const wheat = scoreTfIdf(corpus[1], q, idf2, max);
    expect(climate.score).toBe(1);
    expect(wheat.score).toBe(0);
  });
});