import {
  inverseDocumentFrequency,
  maxRawScore,
  scoreTfIdf,
  tokenize,
} from "./tfidf";
import type { RankBreakdown, SourceResult } from "./types";

/**
 * Multi-signal ranking engine.
 *
 * Every result gets a transparent score made of three named signals blended
 * with explicit weights. The breakdown is attached to the result (`rank`) and
 * streamed over SSE so the UI can show "Relevance 0.72 · Authority 0.41 ·
 * Recency 0.9" on every card — the score is explainable, not a black box.
 *
 *   total = 0.5 * relevance + 0.3 * authority + 0.2 * recency
 *
 * - relevance: TF-IDF of title+description vs the query (see tfidf.ts).
 * - authority: log-scaled popularity per source (HF downloads/likes, Zenodo
 *   downloads, GitHub stars, citations), min-max normalized
 *   within the batch so no source's raw numbers dominate.
 * - recency: exponential half-life decay on publish/update date.
 *
 * Ranking runs per batch as results stream in over SSE — each source's results
 * are ranked in isolation the moment they arrive (relevance/idf is computed
 * over that batch's corpus), so the client never waits for a final blocking
 * sort.
 */

/** Public, named blend weights — tweak these, not magic numbers. */
export const RANKING_WEIGHTS = {
  relevance: 0.5,
  authority: 0.3,
  recency: 0.2,
} as const;

/** Exponential half-life for the recency signal (in days). 2 years. */
export const RECENCY_HALF_LIFE_DAYS = 730;

/** Half-life in milliseconds. */
export const RECENCY_HALF_LIFE_MS = RECENCY_HALF_LIFE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Pull the raw authority number out of a result. Each adapter is expected to
 * surface its own popularity metric in `result.popularity`. Returns null when
 * the source has no meaningful popularity signal (e.g. arXiv, data.gov).
 */
function rawPopularity(result: SourceResult): number | null {
  if (typeof result.popularity === "number" && Number.isFinite(result.popularity)) {
    return result.popularity;
  }
  return null;
}

/**
 * Log-scale then min-max normalize a list of raw popularity values.
 * log10(1+x) collapses the huge range (HF downloads can hit millions, S2
 * citations tens of thousands) so no single source dominates the signal.
 */
function normalizeAuthority(
  values: (number | null)[],
): number[] {
  const logs = values.map((v) => (v === null ? null : Math.log10(1 + v)));
  const finite = logs.filter((v): v is number => v !== null);
  const max = finite.length ? Math.max(...finite) : 0;
  const min = finite.length ? Math.min(...finite) : 0;
  const range = max - min;
  return logs.map((v) =>
    v === null ? 0 : range === 0 ? (v > 0 ? 1 : 0) : (v - min) / range,
  );
}

function dateMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

/**
 * Exponential recency decay: a result published `t` ms ago scores
 * 0.5 ** (t / halfLife). Fresh items ~1.0, items at the half-life ~0.5,
 * ancient items decay toward 0 but never hit a hard cliff. Unknown dates get
 * a neutral 0.5 so they neither dominate nor vanish.
 */
export function recencyScore(publishedAt: string | null | undefined): number {
  const ms = dateMs(publishedAt);
  if (ms === null) return 0.5;
  const ageMs = Date.now() - ms;
  return Math.pow(0.5, ageMs / RECENCY_HALF_LIFE_MS);
}

function relevanceScore(
  query: string,
  result: SourceResult,
  corpus: string[],
): number {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return 0;

  const docTokens = tokenize(`${result.title} ${result.description}`);
  const corpusTokenized = corpus.map((text) => tokenize(text));
  const idf = inverseDocumentFrequency(corpusTokenized);
  const maxRaw = maxRawScore(corpusTokenized, queryTokens, idf);
  const hit = scoreTfIdf(docTokens, queryTokens, idf, maxRaw);
  return hit.score;
}

/**
 * Rank a single batch of results against a query. Mutates a copy and attaches
 * `rank` to each result. Returns the batch sorted by total score descending.
 */
export function rankBatch(query: string, results: SourceResult[]): SourceResult[] {
  if (results.length === 0) return results;

  const corpus = results.map((r) => `${r.title} ${r.description}`);
  const authority = normalizeAuthority(results.map(rawPopularity));

  const ranked = results.map((result, i) => {
    const relevance = relevanceScore(query, result, corpus);
    const authoritySignal = authority[i];
    const recency = recencyScore(result.publishedAt ?? result.updatedAt);
    const total =
      RANKING_WEIGHTS.relevance * relevance +
      RANKING_WEIGHTS.authority * authoritySignal +
      RANKING_WEIGHTS.recency * recency;

    const breakdown: RankBreakdown = {
      relevance: round(relevance),
      authority: round(authoritySignal),
      recency: round(recency),
      total: round(total),
    };
    return { ...result, rank: breakdown };
  });

  return ranked.sort((a, b) => (b.rank?.total ?? 0) - (a.rank?.total ?? 0));
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
