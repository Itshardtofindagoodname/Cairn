export const SOURCE_IDS = [
  "huggingface",
  "zenodo",
  "datagov",
  "openml",
  "arxiv",
  "semanticscholar",
  "github",
  "kaggle",
] as const;

export type SourceId = (typeof SOURCE_IDS)[number];

/** Everything a result can be once every source is normalized. */
export type ResultType = "dataset" | "model" | "paper" | "repo";

export const LICENSE_IDS = [
  "MIT",
  "Apache-2.0",
  "CC-BY",
  "CC-BY-NC",
  "Public Domain",
  "Unknown",
] as const;

export type LicenseId = (typeof LICENSE_IDS)[number];

/** Licenses that allow unrestricted commercial use. */
export const COMMERCIAL_LICENSES: readonly LicenseId[] = [
  "MIT",
  "Apache-2.0",
  "CC-BY",
  "Public Domain",
];

export interface PreviewInfo {
  type: "csv" | "json" | "none";
  url: string | null;
  note?: string;
}

/** Per-signal ranking breakdown attached to a result by the ranking engine. */
export interface RankBreakdown {
  /** TF-IDF relevance of title+description against the query (0..1). */
  relevance: number;
  /** Log-scaled, min-max-normalized popularity/authority (0..1). */
  authority: number;
  /** Exponential half-life decay on publish/update date (0..1). */
  recency: number;
  /** Weighted blend of the three (0..1). */
  total: number;
}

/** A single result as returned by one source adapter. */
export interface SourceResult {
  source: SourceId;
  /** Source-specific identifier, e.g. a HF repo id or Zenodo record id. */
  sourceId: string;
  /** Canonical link to the source page for this item. */
  url: string;
  title: string;
  type: ResultType;
  description: string;
  /** Human readable size, e.g. "1.2 GB". Null when unknown. */
  size: string | null;
  sizeBytes: number | null;
  license: LicenseId;
  licenseRaw: string | null;
  preview: PreviewInfo;
  /** Copy-pasteable loading code. */
  snippet: string;
  metadata: Record<string, unknown>;
  /** Author/creator names (used for dedupe + author-overlap matching). */
  authors?: string[];
  /** ISO date the item was published, if known. */
  publishedAt?: string | null;
  /** ISO date the item was last updated, if known. */
  updatedAt?: string | null;
  /** Raw popularity/authority value for this source's ranking signal. */
  popularity?: number | null;
  /** Human label for the popularity value, e.g. "12,345 downloads". */
  popularityLabel?: string | null;
  /** DOI, when the source exposes one. */
  doi?: string | null;
  /** arXiv id (bare, e.g. "2103.00112"), when known. */
  arxivId?: string | null;
  /** Attached by the ranking engine before results are streamed. */
  rank?: RankBreakdown;
}

/** An origin merged into a single result card. */
export interface Origin {
  source: SourceId;
  sourceId: string;
  url: string;
  license: LicenseId;
  licenseRaw: string | null;
  preview: PreviewInfo;
  snippet: string;
  rank?: RankBreakdown;
  authors?: string[];
  publishedAt?: string | null;
  updatedAt?: string | null;
  metadata?: Record<string, unknown>;
  doi?: string | null;
  arxivId?: string | null;
  popularity?: number | null;
  popularityLabel?: string | null;
}

/** A deduplicated result shown in the UI; `origins` may span multiple sources. */
export interface MergedResult {
  uid: string;
  title: string;
  type: ResultType;
  description: string;
  size: string | null;
  origins: Origin[];
  /** Primary card ranking (highest-ranked origin's breakdown). */
  rank?: RankBreakdown;
  authors?: string[];
  publishedAt?: string | null;
  updatedAt?: string | null;
  doi?: string | null;
  arxivId?: string | null;
  popularity?: number | null;
  popularityLabel?: string | null;
}

export type SourceStatus =
  | "pending"
  | "streaming"
  | "ok"
  | "error"
  | "rate-limited"
  | "handoff";

export interface SourceState {
  status: SourceStatus;
  count: number;
  message?: string;
}

/** Type filter options shown in the result-type chip group. */
export const TYPE_FILTERS = ["all", "dataset", "model", "paper", "repo"] as const;
export type TypeFilter = (typeof TYPE_FILTERS)[number];

/** UI label for a result-type filter value. */
export const TYPE_FILTER_LABELS: Record<TypeFilter, string> = {
  all: "All",
  dataset: "Datasets",
  model: "Models",
  paper: "Papers",
  repo: "Code",
};
