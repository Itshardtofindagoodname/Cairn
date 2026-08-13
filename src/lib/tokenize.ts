/**
 * Shared tokenization for ranking (TF-IDF) and dedupe (Jaccard).
 *
 * Two stopword sets are provided:
 * - RANKING_STOPWORDS: excludes domain-neutral terms for relevance scoring
 * - DEDUPE_STOPWORDS: excludes only structural stopwords for title matching
 */

export const RANKING_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "has", "have", "in", "into", "is", "it", "its", "of", "on", "or", "such",
  "that", "the", "their", "then", "there", "these", "they", "this", "to",
  "was", "were", "will", "with", "you", "your",
  "dataset", "datasets", "data", "model", "models", "paper", "papers",
  "repo", "repos", "repository", "set", "using", "use", "used", "via",
]);

export const DEDUPE_STOPWORDS = new Set([
  "the", "a", "an", "and", "or", "of", "for", "in", "on", "to", "with",
  "at", "by", "from",
  "dataset", "datasets", "data", "model", "models", "set", "paper", "papers",
  "repo", "repositories",
]);

export const MIN_TOKEN_LENGTH = 2;

export interface TokenizeOptions {
  stopwords?: Set<string>;
  minTokenLength?: number;
  normalizeUnicode?: boolean;
}

/**
 * Split a string into normalized (lowercase) tokens.
 * Default behavior matches TF-IDF expectations (unicode-normalized, stopwords removed).
 */
export function tokenize(text: string, options: TokenizeOptions = {}): string[] {
  const {
    stopwords = RANKING_STOPWORDS,
    minTokenLength = MIN_TOKEN_LENGTH,
    normalizeUnicode = true,
  } = options;

  let normalized = text.toLowerCase();
  if (normalizeUnicode) {
    normalized = normalized.replace(/[\u0300-\u036f]/g, "");
  }

  return normalized
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length >= minTokenLength && !stopwords.has(t));
}
