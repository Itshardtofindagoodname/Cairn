import { formatCount } from "@/lib/format";
import { normalizeLicense } from "@/lib/license";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult } from "@/lib/types";
import type { SourceAdapter } from "./types";
import { SourceRateLimitedError } from "./types";

/**
 * GitHub REST API (https://docs.github.com/en/rest/search).
 *
 * Anonymous: 60 requests/hr. With GITHUB_TOKEN: 5,000/hr. The app must work
 * fully anonymously, so we use the token only when present. When the
 * anonymous budget is exhausted we surface a visible "rate-limited" state
 * instead of failing silently.
 *
 * The README is fetched (best-effort) for entity extraction — it's the only
 * real "code-adjacent" text GitHub search gives us, and it's how the
 * provenance graph can tie a repo to a dataset/model it implements.
 */

const SEARCH_API = (q: string, limit: number) =>
  `https://api.github.com/search/repositories?q=${encodeURIComponent(
    q,
  )}&per_page=${limit}&sort=stars&order=desc`;

const README_API = (fullName: string) =>
  `https://api.github.com/repos/${fullName}/readme`;

function authHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

interface GitHubRepo {
  id?: number;
  full_name?: string;
  name?: string;
  html_url?: string;
  description?: string | null;
  stargazers_count?: number;
  forks_count?: number;
  updated_at?: string;
  created_at?: string;
  language?: string | null;
  topics?: string[];
  license?: { spdx_id?: string | null; name?: string | null } | null;
  owner?: { login?: string } | null;
  homepage?: string | null;
  archived?: boolean;
}
interface GitHubSearchResponse {
  items?: GitHubRepo[];
  total_count?: number;
}

export const github: SourceAdapter = {
  id: "github",
  displayName: "GitHub",
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    const limit = 8;
    const data = await fetchWithRateLimit<GitHubSearchResponse>(SEARCH_API(query, limit), signal, authHeaders());
    const repos = data?.items ?? [];

    const results: SourceResult[] = [];
    for (const repo of repos) {
      if (!repo.full_name || repo.archived) continue;

      const fullName = repo.full_name;
      const stars = repo.stargazers_count ?? 0;
      let readme: string | null = null;
      if (process.env.GITHUB_TOKEN || results.length < 3) {
        readme = await fetchReadme(fullName, signal).catch(() => null);
      }

      const license = normalizeLicense(repo.license?.spdx_id ?? repo.license?.name);
      const topics = (repo.topics ?? []).slice(0, 5);
      const description = repo.description || (topics.length ? `Topics: ${topics.join(", ")}` : `GitHub repository ${fullName}`);

      results.push({
        source: "github",
        sourceId: fullName,
        url: repo.html_url ?? `https://github.com/${fullName}`,
        title: fullName,
        type: "repo",
        description,
        size: null,
        sizeBytes: null,
        license: license.license,
        licenseRaw: license.raw ?? null,
        preview: { type: "none", url: null },
        snippet: buildSnippet({
          source: "github",
          sourceId: fullName,
          title: fullName,
          type: "repo",
          query,
          preview: { type: "none", url: null },
          metadata: {},
        }),
        metadata: {
          stars,
          forks: repo.forks_count ?? 0,
          language: repo.language ?? null,
          topics,
          updated: repo.updated_at?.slice(0, 10) ?? null,
          owner: repo.owner?.login ?? null,
          homepage: repo.homepage ?? null,
          starsLabel: stars ? `${formatCount(stars)} stars` : null,
        },
        authors: repo.owner?.login ? [repo.owner.login] : [],
        publishedAt: repo.created_at ?? null,
        updatedAt: repo.updated_at ?? null,
        popularity: stars,
        popularityLabel: stars ? `${formatCount(stars)} stars` : null,
        readme,
      });
    }
    return results;
  },
};

/**
 * Fetch with GitHub rate-limit awareness. We peek at the X-RateLimit-*
 * headers to distinguish "budget exhausted" (a visible, expected state) from
 * "token invalid" or other errors.
 */
async function fetchWithRateLimit<T>(
  url: string,
  signal: AbortSignal | undefined,
  headers: Record<string, string>,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    const remaining = res.headers.get("X-RateLimit-Remaining");
    const limit = res.headers.get("X-RateLimit-Limit");

    if (res.status === 403 && remaining === "0") {
      const used = process.env.GITHUB_TOKEN ? "token" : "anonymous";
      throw new SourceRateLimitedError(
        `GitHub ${used} rate limit reached (${limit ?? "?"}/hr). Add GITHUB_TOKEN for 5,000/hr.`,
        3600,
      );
    }
    if (res.status === 401 || res.status === 403) {
      // Bad token — fall back to anonymous for this request rather than failing.
      if (process.env.GITHUB_TOKEN) {
        const anonymous = await fetch(url, { signal: controller.signal, cache: "no-store" });
        if (!anonymous.ok) throw new Error(`HTTP ${anonymous.status}`);
        return (await anonymous.json()) as T;
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Best-effort raw README fetch; never fatal. Raw markdown text. */
async function fetchReadme(
  fullName: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github.raw+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const token = process.env.GITHUB_TOKEN;
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(README_API(fullName), { headers, signal: controller.signal, cache: "no-store" });
    if (res.status === 403 || res.status === 429) return null;
    if (!res.ok) return null;
    const text = await res.text();
    return text.slice(0, 20_000);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}
