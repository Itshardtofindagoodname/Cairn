import { XMLParser } from "fast-xml-parser";
import { fetchText } from "@/lib/fetch";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult } from "@/lib/types";
import type { SourceAdapter } from "./types";

/**
 * arXiv API (https://arxiv.org/help/api).
 *
 * The Atom XML endpoint requires no key. IMPORTANT: the API returns only
 * title + abstract + authors + categories — never the full paper text. Every
 * downstream consumer (ranking, entity extraction, provenance) is designed
 * around abstract-level data, not full text.
 *
 * Search syntax: search_query=all:{query} does free-text matching over the
 * full metadata. We sort by relevance (sortBy=relevance) which the API
 * supports for metadata queries.
 */

const API = (q: string, limit: number) =>
  `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(
    `all:${q}`,
  )}&start=0&max_results=${limit}&sortBy=relevance&sortOrder=descending`;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  trimValues: true,
});

interface ArxivAuthor {
  name?: string;
}
interface ArxivEntry {
  id?: string;
  title?: string;
  summary?: string;
  published?: string;
  updated?: string;
  author?: ArxivAuthor | ArxivAuthor[];
  "arxiv:primary_category"?: { "@_term"?: string };
  category?: { "@_term"?: string } | { "@_term"?: string }[];
}

interface ArxivFeed {
  feed?: {
    entry?: ArxivEntry | ArxivEntry[];
  };
}

/** Strip the version suffix from an arXiv id: "2201.00978v1" -> "2201.00978". */
export function bareArxivId(idOrUrl: string): string {
  const match = idOrUrl.match(/abs\/([\w.]+)/) ?? idOrUrl.match(/(\d{4}\.\d{4,5})/);
  const id = match?.[1] ?? idOrUrl;
  return id.replace(/v\d+$/i, "");
}

function toAuthors(entry: ArxivEntry): string[] {
  const authors = Array.isArray(entry.author) ? entry.author : entry.author ? [entry.author] : [];
  return authors.map((a) => a.name ?? "").filter(Boolean);
}

function toCategories(entry: ArxivEntry): string[] {
  const raw = Array.isArray(entry.category) ? entry.category : entry.category ? [entry.category] : [];
  const cats = raw.map((c) => c["@_term"] ?? "").filter(Boolean);
  if (entry["arxiv:primary_category"]?.["@_term"]) {
    cats.unshift(entry["arxiv:primary_category"]["@_term"]);
  }
  return [...new Set(cats)];
}

export const arxiv: SourceAdapter = {
  id: "arxiv",
  displayName: "arXiv",
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    const limit = 8;
    const xml = await fetchText(API(query, limit), { signal });
    const feed = parser.parse(xml) as ArxivFeed;
    const entries = Array.isArray(feed.feed?.entry) ? feed.feed.entry : feed.feed?.entry ? [feed.feed.entry] : [];

    return entries.map((entry): SourceResult => {
      const id = entry.id ?? "";
      const arxivId = bareArxivId(id);
      const title = (entry.title ?? "").replace(/\s+/g, " ").trim();
      const categories = toCategories(entry);
      const abstract = (entry.summary ?? "").replace(/\s+/g, " ").trim();
      const url = `https://arxiv.org/abs/${arxivId}`;

      return {
        source: "arxiv",
        sourceId: arxivId,
        url,
        title,
        type: "paper",
        description: abstract,
        size: null,
        sizeBytes: null,
        license: "Unknown",
        licenseRaw: null,
        preview: { type: "none", url: null },
        snippet: buildSnippet({
          source: "arxiv",
          sourceId: arxivId,
          title,
          type: "paper",
          query,
          preview: { type: "none", url: null },
          metadata: { arxivId },
        }),
        metadata: {
          arxivId,
          categories,
          primaryCategory: categories[0] ?? null,
        },
        authors: toAuthors(entry),
        publishedAt: entry.published ?? null,
        updatedAt: entry.updated ?? null,
        arxivId,
        doi: null,
        popularity: null,
      };
    });
  },
};
