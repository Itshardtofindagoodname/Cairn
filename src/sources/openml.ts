import { fetchJson } from "@/lib/fetch";
import { formatCount } from "@/lib/format";
import { normalizeLicense } from "@/lib/license";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult } from "@/lib/types";
import type { SourceAdapter } from "./types";

/**
 * OpenML REST API (https://docs.openml.org/ecosystem/Rest/):
 *
 * OpenML is resource-based, not keyword-search based. There is no general
 * free-text search endpoint like the other sources have — `/data/list/search`
 * does not exist (HTTP 412), and the only name filter,
 * `/data/list/data_name/{name}/...`, is an *exact* (case-insensitive) match
 * that also returns HTTP 412 when nothing matches. JSON requires the
 * `/api/v1/json/` path; `/api/v1/` defaults to XML. All reads are anonymous.
 *
 * So the adapter searches in tiers and degrades gracefully instead of
 * erroring out on free-text queries:
 *   1. Exact dataset name match       (`data_name/{query}`)
 *   2. Exact match per space-separated token, unioned ("climate change" → "climate")
 *   3. Client-side name-substring match over the full active catalog
 *      (`status/active/limit/10000`) — the closest the API allows to a
 *      keyword search, used only when tiers 1-2 find nothing.
 *
 * The list endpoint omits `licence`, `default_target_attribute` and
 * `upload_date`, so each result is enriched with a small `/data/{did}` fetch
 * (best-effort, never fatal).
 */

const LIST_LIMIT = 20;
const RESULT_LIMIT = 10;
const CATALOG_LIMIT = 10000;
const NAME_TIMEOUT_MS = 5_000;
const CATALOG_TIMEOUT_MS = 20_000;

const listUrl = (name: string, limit = LIST_LIMIT) =>
  `https://www.openml.org/api/v1/json/data/list/data_name/${encodeURIComponent(
    name,
  )}/status/active/limit/${limit}/`;

const catalogUrl = () =>
  `https://www.openml.org/api/v1/json/data/list/status/active/limit/${CATALOG_LIMIT}/`;

const detailUrl = (did: string) =>
  `https://www.openml.org/api/v1/json/data/${did}/`;

interface OpenMLQuality {
  name: string;
  value: string;
}

interface OpenMLDataset {
  did: string;
  name: string;
  version?: string;
  format?: string;
  status?: string;
  licence?: string | null;
  quality?: OpenMLQuality[];
  /** Internal ranking used by the substring fallback. */
  _tokenHits?: number;
}

interface OpenMLDetail {
  licence?: string | null;
  default_target_attribute?: string | null;
  upload_date?: string;
  visibility?: string;
  format?: string;
  creator?: string;
}

interface OpenMLListResponse {
  data: { dataset?: OpenMLDataset[] };
}

interface OpenMLDetailResponse {
  data_set_description?: OpenMLDetail;
}

function qualityValue(
  dataset: OpenMLDataset,
  name: string,
): number | null {
  const q = dataset.quality?.find((item) => item.name === name);
  if (!q) return null;
  const value = Number(q.value);
  return Number.isFinite(value) ? value : null;
}

/** Tier 1+2: exact `data_name` match. 412 (no results) is a normal outcome. */
async function searchExact(
  query: string,
  signal?: AbortSignal,
): Promise<OpenMLDataset[]> {
  try {
    const data = await fetchJson<OpenMLListResponse>(listUrl(query), {
      signal,
      timeoutMs: NAME_TIMEOUT_MS,
    });
    return data?.data?.dataset ?? [];
  } catch {
    return [];
  }
}

/** Tier 2: union of exact matches for each meaningful query word. */
async function searchByTokens(
  query: string,
  signal?: AbortSignal,
): Promise<OpenMLDataset[]> {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3)
    .slice(0, 2);
  const settled = await Promise.allSettled(
    tokens.map((t) =>
      fetchJson<OpenMLListResponse>(listUrl(t), {
        signal,
        timeoutMs: NAME_TIMEOUT_MS,
      }).catch(() => null),
    ),
  );
  return settled.flatMap((r) =>
    r.status === "fulfilled" && r.value ? r.value.data?.dataset ?? [] : [],
  );
}

/** Tier 3: substring match over the full active catalog (graceful fallback). */
async function searchBySubstring(
  query: string,
  signal?: AbortSignal,
): Promise<OpenMLDataset[]> {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= 3);
  if (tokens.length === 0) return [];

  // If the catalog fetch itself fails (network/timeout), degrade to "no
  // results" rather than surfacing a source-wide error — free-text queries
  // are already best-effort, so they should never take the whole source down.
  let data: OpenMLListResponse | null = null;
  try {
    data = await fetchJson<OpenMLListResponse>(catalogUrl(), {
      signal,
      timeoutMs: CATALOG_TIMEOUT_MS,
    });
  } catch {
    return [];
  }

  const datasets = data?.data?.dataset ?? [];
  const matches: OpenMLDataset[] = [];

  for (const dataset of datasets) {
    const name = (dataset.name ?? "").toLowerCase();
    const hitCount = tokens.reduce(
      (n, t) => n + (name.includes(t) ? 1 : 0),
      0,
    );
    if (hitCount > 0) {
      matches.push({ ...dataset, _tokenHits: hitCount });
    }
  }
  matches.sort((a, b) => (b._tokenHits ?? 0) - (a._tokenHits ?? 0));
  return matches;
}

/** Keep the newest version of each dataset name (list returns all versions). */
function dedupeByName(datasets: OpenMLDataset[]): OpenMLDataset[] {
  const byName = new Map<string, OpenMLDataset>();
  for (const dataset of datasets) {
    const key = (dataset.name ?? "").toLowerCase();
    const existing = byName.get(key);
    if (!existing || Number(dataset.did) > Number(existing.did)) {
      byName.set(key, dataset);
    }
  }
  return [...byName.values()];
}

/** Best-effort `/data/{did}` fetch; the list response lacks licence/target. */
async function fetchDetail(
  did: string,
  signal?: AbortSignal,
): Promise<OpenMLDetail | null> {
  try {
    const data = await fetchJson<OpenMLDetailResponse>(detailUrl(did), {
      signal,
    });
    return data?.data_set_description ?? null;
  } catch {
    return null;
  }
}

function toResult(
  dataset: OpenMLDataset,
  detail: OpenMLDetail | null,
  query: string,
): SourceResult {
  const did = dataset.did;
  const license = normalizeLicense(detail?.licence ?? dataset.licence ?? null);

  const instances = qualityValue(dataset, "NumberOfInstances");
  const features = qualityValue(dataset, "NumberOfFeatures");
  const classes = qualityValue(dataset, "NumberOfClasses");
  const target = detail?.default_target_attribute ?? null;

  const parts = [`OpenML dataset #${did}${dataset.version ? ` v${dataset.version}` : ""}`];
  if (instances !== null) parts.push(`${formatCount(instances)} rows`);
  if (features !== null) parts.push(`${formatCount(features)} features`);
  if (classes !== null) parts.push(`${formatCount(classes)} classes`);
  if (target) parts.push(`target: ${target}`);

  return {
    source: "openml",
    sourceId: did,
    url: `https://www.openml.org/d/${did}`,
    title: dataset.name,
    type: "dataset",
    description: parts.join(" · "),
    size: null,
    sizeBytes: null,
    license: license.license,
    licenseRaw: license.raw ?? null,
    preview: {
      type: "csv",
      url: `https://www.openml.org/data/v1/get_csv/${did}`,
      note: "original format may be ARFF; CSV conversion used",
    },
    snippet: buildSnippet({
      source: "openml",
      sourceId: did,
      title: dataset.name,
      type: "dataset",
      query,
      preview: {
        type: "csv",
        url: `https://www.openml.org/data/v1/get_csv/${did}`,
      },
      metadata: { did },
    }),
    metadata: {
      did,
      version: dataset.version ?? null,
      format: detail?.format ?? dataset.format ?? null,
      target,
      uploaded: detail?.upload_date?.slice(0, 10) ?? null,
      instances,
      features,
    },
    authors: detail?.creator ? [detail.creator] : [],
    publishedAt: detail?.upload_date ?? null,
    updatedAt: detail?.upload_date ?? null,
    popularity: null,
  };
}

export const openML: SourceAdapter = {
  id: "openml",
  displayName: "OpenML",
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    let datasets = await searchExact(query, signal);
    if (datasets.length === 0) datasets = await searchByTokens(query, signal);
    if (datasets.length === 0) datasets = await searchBySubstring(query, signal);

    const unique = dedupeByName(datasets).slice(0, RESULT_LIMIT);
    const enriched = await Promise.all(
      unique.map(async (dataset) => ({
        dataset,
        detail: await fetchDetail(dataset.did, signal),
      })),
    );

    return enriched
      .filter(({ detail }) => !detail?.visibility || detail.visibility === "public")
      .map(({ dataset, detail }) => toResult(dataset, detail, query));
  },
};
