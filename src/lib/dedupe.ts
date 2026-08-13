import { tokenize as tokenizeShared, DEDUPE_STOPWORDS } from "./tokenize";

function tokenize(title: string): string[] {
  return tokenizeShared(title, { stopwords: DEDUPE_STOPWORDS, minTokenLength: 2, normalizeUnicode: false });
}

function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1).fill(0);
  const curr = new Array(b.length + 1).fill(0);
  for (let j = 0; j <= b.length; j += 1) prev[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= b.length; j += 1) prev[j] = curr[j];
  }
  return prev[b.length];
}

const OVERLAP_THRESHOLD = 0.62;
const SINGLE_TOKEN_MAX_EDIT = 2;

/**
 * Heuristic: are two titles likely the same thing? Combines token
 * overlap (Jaccard) with a small Levenshtein fallback for short titles.
 */
export function areSameTitle(titleA: string, titleB: string): boolean {
  const tokensA = tokenize(titleA);
  const tokensB = tokenize(titleB);
  if (!tokensA.length || !tokensB.length) {
    // both reduce to empty -> compare raw lowercase strings
    return titleA.toLowerCase() === titleB.toLowerCase();
  }
  const setA = new Set(tokensA);
  const setB = new Set(tokensB);
  const overlap = jaccard(setA, setB);

  if (overlap >= OVERLAP_THRESHOLD) return true;

  // single-token titles: allow small typos ("cifar10" vs "cifar-10")
  if (tokensA.length === 1 && tokensB.length === 1) {
    const distance = levenshtein(tokensA[0], tokensB[0]);
    const len = Math.max(tokensA[0].length, tokensB[0].length);
    return distance <= Math.min(SINGLE_TOKEN_MAX_EDIT, Math.floor(len * 0.25));
  }
  return false;
}

/** Normalize an arXiv id / DOI for exact comparison. */
function normalizeId(id: string | null | undefined): string | null {
  if (!id) return null;
  const trimmed = id.trim().toLowerCase();
  if (!trimmed) return null;
  // Strip any leading prefix a source may tack on ("arxiv:2103.00112",
  // "doi:10.5281/…", URLs).
  return trimmed.replace(/^(arxiv|doi|http:\/\/arxiv\.org\/abs\/|https:\/\/arxiv\.org\/abs\/|https?:\/\/doi\.org\/)/, "");
}

/** Exact-ID match: shared arXiv id or DOI is a definitive same-item signal. */
export function haveExactIdMatch(
  doiA: string | null | undefined,
  arxivA: string | null | undefined,
  doiB: string | null | undefined,
  arxivB: string | null | undefined,
): boolean {
  const aDoi = normalizeId(doiA);
  const bDoi = normalizeId(doiB);
  if (aDoi && bDoi && aDoi === bDoi) return true;

  const aArxiv = normalizeId(arxivA);
  const bArxiv = normalizeId(arxivB);
  if (aArxiv && bArxiv && aArxiv === bArxiv) return true;
  return false;
}

/** Jaccard overlap of two author/creator name sets. */
export function authorOverlap(
  authorsA: string[] | undefined,
  authorsB: string[] | undefined,
): number {
  const norm = (names: string[] | undefined) =>
    new Set(
      (names ?? [])
        .map((n) => (typeof n === "string" ? n.trim().toLowerCase().replace(/[^a-z .'-]/g, "") : ""))
        .filter((n) => n.length > 1),
    );
  const a = norm(authorsA);
  const b = norm(authorsB);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const name of a) if (b.has(name)) inter += 1;
  return inter / Math.min(a.size, b.size);
}

/** Author sets are "overlapping" when ≥ 1/3 of the smaller set is shared. */
const AUTHOR_OVERLAP_THRESHOLD = 0.34;
/** With author support, a weaker title match is enough to merge. */
const AUTHOR_SUPPORTED_TITLE_THRESHOLD = 0.45;

/**
 * Full same-item decision, combining all available signals:
 *   - exact DOI / arXiv-id match  → definitely the same item
 *   - strong title match          → same item
 *   - moderate title match + real author overlap → same item
 * Returns the match strength as a 0..1 confidence so the merge can rank by it.
 */
export function sameItemConfidence(
  a: {
    title: string;
    authors?: string[];
    doi?: string | null;
    arxivId?: string | null;
  },
  b: {
    title: string;
    authors?: string[];
    doi?: string | null;
    arxivId?: string | null;
  },
): number {
  if (
    haveExactIdMatch(a.doi, a.arxivId, b.doi, b.arxivId)
  ) {
    return 1;
  }

  const tokensA = tokenize(a.title);
  const tokensB = tokenize(b.title);
  const titleSim = tokensA.length && tokensB.length
    ? jaccard(new Set(tokensA), new Set(tokensB))
    : a.title.toLowerCase() === b.title.toLowerCase()
      ? 1
      : 0;

  // Single-token fuzzy fallback (cifar10 vs cifar-10).
  let titleScore = titleSim;
  if (tokensA.length === 1 && tokensB.length === 1 && titleSim < OVERLAP_THRESHOLD) {
    const distance = levenshtein(tokensA[0], tokensB[0]);
    const len = Math.max(tokensA[0].length, tokensB[0].length);
    if (distance <= Math.min(SINGLE_TOKEN_MAX_EDIT, Math.floor(len * 0.25))) {
      titleScore = 0.8;
    }
  }

  if (titleScore >= OVERLAP_THRESHOLD) return titleScore;

  const authorSim = authorOverlap(a.authors, b.authors);
  if (
    authorSim >= AUTHOR_OVERLAP_THRESHOLD &&
    titleScore >= AUTHOR_SUPPORTED_TITLE_THRESHOLD
  ) {
    return Math.min(0.95, titleScore + 0.3 * authorSim);
  }
  return 0;
}

/** Convenience boolean wrapper for call sites that just need yes/no. */
export function areSameItem(
  a: {
    title: string;
    authors?: string[];
    doi?: string | null;
    arxivId?: string | null;
  },
  b: {
    title: string;
    authors?: string[];
    doi?: string | null;
    arxivId?: string | null;
  },
): boolean {
  return sameItemConfidence(a, b) > 0;
}
