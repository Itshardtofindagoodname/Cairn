import { fetchJson } from "@/lib/fetch";
import { formatCount } from "@/lib/format";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult } from "@/lib/types";
import type { SourceAdapter } from "./types";
import { SourceRateLimitedError } from "./types";

/**
 * Semantic Scholar Graph API (https://api.semanticscholar.org/api-docs/).
 *
 * Free tier: basic paper search works without a key but the shared anonymous
 * pool is aggressively rate-limited (HTTP 429 is common under bursts). We
 * retry with backoff a few times; if we keep getting 429 we surface it as a
 * rate-limited state instead of a generic failure.
 *
 * Citations feed the ranking engine's authority signal.
 */

const API = (q: string, limit: number) =>
  `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    q,
  )}&limit=${limit}&fields=title,abstract,year,citationCount,externalIds,authors,venue,url,publicationDate,externalIds`;

const MAX_RETRIES = 3;
const BASE_RETRY_MS = 1200;

interface S2Author {
  name?: string;
}
interface S2Paper {
  paperId?: string;
  title?: string;
  abstract?: string | null;
  year?: number | null;
  citationCount?: number | null;
  venue?: string | null;
  publicationDate?: string | null;
  url?: string | null;
  externalIds?: {
    ArXiv?: string | null;
    DOI?: string | null;
    DBLP?: string | null;
    CorpusId?: number | null;
  } | null;
  authors?: S2Author[];
}
interface S2Response {
  data?: S2Paper[];
  total?: number;
  message?: string;
}

export const semanticscholar: SourceAdapter = {
  id: "semanticscholar",
  displayName: "Semantic Scholar",
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    const limit = 8;
    const data = await withBackoff(async () => {
      try {
        return await fetchJson<S2Response>(API(query, limit), { signal });
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        const code = message.match(/HTTP (\d+)/)?.[1];
        if (code === "429") throw new SourceRateLimitedError("Semantic Scholar is rate-limited (shared free pool). Try again in a minute.", 30);
        throw err;
      }
    });

    const papers = data?.data ?? [];
    return papers
      .filter((p) => p.title)
      .map((paper): SourceResult => {
        const arxivId = paper.externalIds?.ArXiv
          ? paper.externalIds.ArXiv.replace(/v\d+$/i, "")
          : null;
        const doi = paper.externalIds?.DOI ?? null;
        const paperId = paper.paperId ?? arxivId ?? doi ?? "?";
        const title = paper.title ?? "";
        const venue = paper.venue ?? null;
        const year = paper.year ?? null;

        const parts = ["Paper"];
        if (venue) parts.push(venue);
        if (year) parts.push(String(year));
        const description = paper.abstract
          ? paper.abstract
          : parts.join(" · ");

        return {
          source: "semanticscholar",
          sourceId: paperId,
          url: paper.url ?? `https://api.semanticscholar.org/${paperId}`,
          title,
          type: "paper",
          description,
          size: null,
          sizeBytes: null,
          license: "Unknown",
          licenseRaw: null,
          preview: { type: "none", url: null },
          snippet: buildSnippet({
            source: "semanticscholar",
            sourceId: paperId,
            title,
            type: "paper",
            query,
            preview: { type: "none", url: null },
            metadata: { paperId, venue },
          }),
          metadata: {
            paperId,
            venue,
            year,
            citationCount: paper.citationCount ?? null,
            arxivId,
            doi,
          },
          authors: (paper.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
          publishedAt: paper.publicationDate
            ? `${paper.publicationDate}T00:00:00Z`
            : year
              ? `${year}-01-01T00:00:00Z`
              : null,
          updatedAt: null,
          doi,
          arxivId,
          popularity: paper.citationCount ?? null,
          popularityLabel: paper.citationCount
            ? `${formatCount(paper.citationCount)} citations`
            : null,
        };
      });
  },
};

async function withBackoff<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (err instanceof SourceRateLimitedError) throw err;
      if (attempt < MAX_RETRIES - 1) {
        await sleep(BASE_RETRY_MS * Math.pow(2, attempt));
      }
    }
  }
  throw lastError;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
