/**
 * Hand-implemented TF-IDF (term frequency × inverse document frequency).
 *
 * This is intentionally dependency-free and self-contained — the point of
 * writing it by hand is to make the relevance signal inspectable and easy to
 * explain. Nothing here calls an ML library.
 *
 * Pipeline used by the ranking engine:
 *   1. tokenize(text)  — lowercase, keep alphanumerics, drop stopwords.
 *   2. tf(term, doc)   — term frequency inside a single document.
 *   3. idf(term, docs) — inverse document frequency across a corpus:
 *        idf = ln( (1 + N) / (1 + df) ) + 1
 *      where N is the corpus size and df is how many docs contain the term.
 *      The "+1" keeps the value positive for terms in every document.
 *   4. score(doc, query) — sum over query terms of tf-idf, normalized so the
 *      top document in a batch scores exactly 1.0 (makes the 0..1 signal
 *      comparable across sources regardless of corpus size).
 */

import { tokenize as tokenizeShared, RANKING_STOPWORDS } from "./tokenize";

export const MIN_TOKEN_LENGTH = 2;

/** Split a string into normalized (lowercase) tokens for ranking. */
export function tokenize(text: string): string[] {
  return tokenizeShared(text, { stopwords: RANKING_STOPWORDS, minTokenLength: MIN_TOKEN_LENGTH });
}

/** Term frequencies within a single document. */
export function termFrequency(tokens: string[]): Map<string, number> {
  const tf = new Map<string, number>();
  for (const token of tokens) tf.set(token, (tf.get(token) ?? 0) + 1);
  return tf;
}

/** Document frequency for a corpus of token arrays. */
export function documentFrequency(docs: string[][]): Map<string, number> {
  const df = new Map<string, number>();
  for (const tokens of docs) {
    const seen = new Set(tokens);
    for (const token of seen) df.set(token, (df.get(token) ?? 0) + 1);
  }
  return df;
}

/** Inverse document frequency for a corpus (smoothed). */
export function inverseDocumentFrequency(
  docs: string[][],
): Map<string, number> {
  const df = documentFrequency(docs);
  const n = docs.length;
  const idf = new Map<string, number>();
  for (const [term, freq] of df) {
    idf.set(term, Math.log((1 + n) / (1 + freq)) + 1);
  }
  return idf;
}

export interface TfIdfScore {
  /** 0..1, normalized so the best document in the corpus scores 1.0. */
  score: number;
  /** Raw sum of tf-idf before normalization (for diagnostics). */
  raw: number;
  /** Which query terms actually matched (and their weights). */
  hits: { term: string; weight: number }[];
}

/**
 * Score a single document's tokens against query tokens using TF-IDF over the
 * given corpus. The score is the cosine-free dot product of (query ∩ doc)
 * tf-idf weights, normalized to the max over the corpus so it stays 0..1.
 */
export function scoreTfIdf(
  docTokens: string[],
  queryTokens: string[],
  idf: Map<string, number>,
  maxRaw: number,
): TfIdfScore {
  const tf = termFrequency(docTokens);
  let raw = 0;
  const hits: { term: string; weight: number }[] = [];

  for (const term of new Set(queryTokens)) {
    const weight = tf.get(term);
    if (!weight) continue;
    const idfValue = idf.get(term) ?? 0;
    const contribution = weight * idfValue;
    raw += contribution;
    hits.push({ term, weight: contribution });
  }

  const score = maxRaw > 0 ? raw / maxRaw : 0;
  return { score, raw, hits };
}

/** Highest raw tf-idf sum across a corpus of documents — the normalizer. */
export function maxRawScore(
  docs: string[][],
  queryTokens: string[],
  idf: Map<string, number>,
): number {
  let max = 0;
  for (const tokens of docs) {
    const tf = termFrequency(tokens);
    let raw = 0;
    for (const term of new Set(queryTokens)) {
      const weight = tf.get(term);
      if (weight) raw += weight * (idf.get(term) ?? 0);
    }
    if (raw > max) max = raw;
  }
  return max;
}
