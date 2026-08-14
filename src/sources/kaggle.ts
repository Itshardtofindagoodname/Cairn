import { formatBytes, formatCount } from "@/lib/format";
import { normalizeLicense } from "@/lib/license";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult } from "@/lib/types";
import {
  SourceAuthContext,
  SourceAdapter,
  SourceHandoffError,
} from "./types";
import {
  isKaggleHandoff,
  recordKaggleRequest,
} from "@/lib/kaggle-rate-tracker";
import { DATASETS_LIST_URL, KERNELS_LIST_URL, kaggleFetch } from "@/lib/kaggle-api";

/**
 * Kaggle REST API (https://www.kaggle.com/docs/api).
 *
 * Auth is HTTP Basic with `username:key` (the legacy kaggle.json pair — the
 * official kaggle client sends exactly this). There are two credential paths:
 *
 *   1. Shared key  — KAGGLE_USERNAME / KAGGLE_KEY env vars, used by everyone.
 *      Consumption is tracked in SQLite (src/lib/kaggle-rate-tracker.ts).
 *      Kaggle publishes NO numeric rate limits (dynamic limiting, 429 +
 *      Retry-After), so we treat a conservative configurable budget as the
 *      quota and flip to "handoff mode" at ~75% — before a real 429.
 *   2. Personal key — a user's own key, sent request-scoped from the browser
 *      (encrypted client-side, never stored server-side). Using it never
 *      touches the shared quota.
 *
 * When no usable key exists, the adapter does not crash: it throws a
 * SourceHandoffError so the UI shows a quiet "connect your account" chip.
 */

interface KaggleDataset {
  ref?: string;
  title?: string;
  subtitle?: string | null;
  ownerName?: string | null;
  totalBytes?: number | null;
  lastUpdated?: string | null;
  downloadCount?: number | null;
  voteCount?: number | null;
  usabilityRating?: number | null;
  licenseName?: string | null;
  url?: string | null;
  isPrivate?: boolean;
  tags?: { name?: string }[] | null;
}

interface KaggleKernel {
  ref?: string;
  title?: string;
  author?: string | null;
  lastRunTime?: string | null;
  totalVotes?: number | null;
  totalViews?: number | null;
  language?: string | null;
  kernelType?: string | null;
  isPrivate?: boolean;
  url?: string | null;
}

type KaggleListResponse = KaggleDataset[] | KaggleKernel[];

function resolveCredentials(auth?: SourceAuthContext): {
  username: string;
  key: string;
} | null {
  const personal = auth?.kaggle;
  if (personal?.username && personal?.key) {
    return { username: personal.username, key: personal.key };
  }
  const username = process.env.KAGGLE_USERNAME;
  const key = process.env.KAGGLE_KEY;
  if (username && key) return { username, key };
  return null;
}

function datasetToResult(item: KaggleDataset, query: string): SourceResult | null {
  const ref = item.ref ?? "";
  if (!ref || item.isPrivate) return null;
  const license = normalizeLicense(item.licenseName);
  const sizeBytes =
    typeof item.totalBytes === "number" && item.totalBytes > 0
      ? item.totalBytes
      : null;
  const tags = (item.tags ?? []).map((t) => t.name).filter(Boolean) as string[];

  const descriptionParts: string[] = [];
  if (item.subtitle) descriptionParts.push(item.subtitle);
  if (item.usabilityRating != null)
    descriptionParts.push(`usability ${(item.usabilityRating * 100).toFixed(0)}/100`);
  if (tags.length) descriptionParts.push(`Tags: ${tags.slice(0, 5).join(", ")}`);

  return {
    source: "kaggle",
    sourceId: ref,
    url: item.url ?? `https://www.kaggle.com/datasets/${ref}`,
    title: item.title ?? ref,
    type: "dataset",
    description: descriptionParts.join(" · ") || `Kaggle dataset ${ref}`,
    size: formatBytes(sizeBytes),
    sizeBytes,
    license: license.license,
    licenseRaw: license.raw ?? null,
    preview: { type: "none", url: null },
    snippet: buildSnippet({
      source: "kaggle",
      sourceId: ref,
      title: item.title ?? ref,
      type: "dataset",
      query,
      preview: { type: "none", url: null },
      metadata: { ref },
    }),
    metadata: {
      downloads: item.downloadCount ?? null,
      votes: item.voteCount ?? null,
      usability: item.usabilityRating ?? null,
      updated: item.lastUpdated?.slice(0, 10) ?? null,
      owner: item.ownerName ?? null,
      tags,
    },
    authors: item.ownerName ? [item.ownerName] : [],
    publishedAt: null,
    updatedAt: item.lastUpdated ?? null,
    popularity: item.downloadCount ?? item.voteCount ?? null,
    popularityLabel:
      typeof item.downloadCount === "number" && item.downloadCount > 0
        ? `${formatCount(item.downloadCount)} downloads`
        : typeof item.voteCount === "number" && item.voteCount > 0
          ? `${formatCount(item.voteCount)} votes`
          : null,
  };
}

function kernelToResult(item: KaggleKernel, query: string): SourceResult | null {
  const ref = item.ref ?? "";
  if (!ref || item.isPrivate) return null;

  return {
    source: "kaggle",
    sourceId: ref,
    url: item.url ?? `https://www.kaggle.com/code/${ref}`,
    title: item.title ?? ref,
    type: "repo",
    description:
      `Kaggle ${item.kernelType ?? "notebook"}${item.language ? ` · ${item.language}` : ""}` +
      (item.lastRunTime ? ` · last run ${item.lastRunTime.slice(0, 10)}` : ""),
    size: null,
    sizeBytes: null,
    license: "Unknown",
    licenseRaw: null,
    preview: { type: "none", url: null },
    snippet: buildSnippet({
      source: "kaggle",
      sourceId: ref,
      title: item.title ?? ref,
      type: "repo",
      query,
      preview: { type: "none", url: null },
      metadata: { ref },
    }),
    metadata: {
      votes: item.totalVotes ?? null,
      views: item.totalViews ?? null,
      language: item.language ?? null,
      kernelType: item.kernelType ?? null,
      updated: item.lastRunTime?.slice(0, 10) ?? null,
      author: item.author ?? null,
    },
    authors: item.author ? [item.author] : [],
    publishedAt: null,
    updatedAt: item.lastRunTime ?? null,
    popularity: item.totalVotes ?? item.totalViews ?? null,
    popularityLabel:
      typeof item.totalVotes === "number" && item.totalVotes > 0
        ? `${formatCount(item.totalVotes)} votes`
        : typeof item.totalViews === "number" && item.totalViews > 0
          ? `${formatCount(item.totalViews)} views`
          : null,
  };
}

export const kaggle: SourceAdapter = {
  id: "kaggle",
  displayName: "Kaggle",
  async search(query: string, signal?: AbortSignal, auth?: SourceAuthContext): Promise<SourceResult[]> {
    const creds = resolveCredentials(auth);
    if (!creds) {
      // No shared key configured and no personal key connected. Kaggle is
      // normally hidden from the UI in this state; if we get here, return
      // nothing quietly rather than failing the whole search.
      return [];
    }

    const usingShared = !(auth?.kaggle?.username && auth?.kaggle?.key);

    if (usingShared && isKaggleHandoff()) {
      throw new SourceHandoffError(
        "Kaggle is having trouble connecting — connect your own account?",
      );
    }

    const [datasetsRes, kernelsRes] = await Promise.all([
      kaggleFetch<KaggleListResponse>(DATASETS_LIST_URL(query), creds, { signal, tag: "datasets" }),
      kaggleFetch<KaggleListResponse>(KERNELS_LIST_URL(query), creds, { signal, tag: "kernels" }),
    ]);

    // A shared-key round-trip consumed budget.
    if (usingShared) {
      recordKaggleRequest();
    }

    // The datasets endpoint is the authoritative credential check. A 401/403
    // here means Kaggle rejected the key itself — a genuine auth/config
    // problem, NOT exhausted quota. It must not surface as the quota-based
    // "connect your own account" handoff: that's misleading (a broken shared
    // key isn't fixed by the user connecting their own key, and the kernels
    // endpoint below rejects legacy Basic auth even for valid keys). Log the
    // real cause for the app owner; the user gets a neutral error instead.
    if (!datasetsRes.ok && (datasetsRes.status === 401 || datasetsRes.status === 403)) {
      if (!usingShared) {
        throw new SourceHandoffError(
          "Your Kaggle connection failed. Reconnect in Kaggle settings to include results.",
        );
      }
      console.error(
        `[cairn:kaggle] shared KAGGLE_USERNAME/KAGGLE_KEY rejected by the datasets endpoint (HTTP ${datasetsRes.status}). ` +
          "Check KAGGLE_USERNAME / KAGGLE_KEY in the server environment — users cannot fix this by connecting their own key.",
      );
      throw new Error("Kaggle is temporarily unavailable.");
    }

    if (!datasetsRes.ok && datasetsRes.status === 429) {
      if (usingShared) {
        recordKaggleRequest();
      }
      throw new SourceHandoffError(
        usingShared
          ? "Kaggle is having trouble connecting — connect your own account?"
          : "Kaggle is rate-limited on your account right now. Try again in a moment.",
      );
    }

    // Kernels is an independent endpoint and can be unavailable without the
    // source being broken: Kaggle currently rejects legacy Basic auth on
    // /api/v1/kernels/list even for valid keys while datasets/list still
    // works. Isolate it — log the detail and keep the dataset results.
    let kernelResults: KaggleKernel[] = [];
    if (kernelsRes.ok) {
      kernelResults = Array.isArray(kernelsRes.data) ? (kernelsRes.data as KaggleKernel[]) : [];
    } else {
      const reason =
        kernelsRes.status === 401 || kernelsRes.status === 403
          ? "rejected credentials (HTTP " +
            kernelsRes.status +
            ") — legacy Basic auth appears unsupported on this endpoint"
          : kernelsRes.status === 429
            ? "rate-limited (HTTP 429)"
            : `failed (HTTP ${kernelsRes.status})`;
      console.warn(
        `[cairn:kaggle] kernels endpoint ${reason} — kernels results omitted for this search (user=${creds.username}).`,
      );
    }

    const datasets = Array.isArray(datasetsRes.data) ? (datasetsRes.data as KaggleDataset[]) : [];

    const out: SourceResult[] = [];
    for (const d of datasets) {
      const r = datasetToResult(d, query);
      if (r) out.push(r);
    }
    for (const k of kernelResults) {
      const r = kernelToResult(k, query);
      if (r) out.push(r);
    }
    return out.slice(0, 16);
  },
};