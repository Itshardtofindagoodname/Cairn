import { fetchJson } from "@/lib/fetch";
import { formatBytes } from "@/lib/format";
import { normalizeLicense } from "@/lib/license";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult } from "@/lib/types";
import type { SourceAdapter } from "./types";

/**
 * data.gov replaced its legacy CKAN catalog in 2025 with a new Flask app
 * backed by OpenSearch. Search JSON: GET /search?q=…&format=json returns
 * records with a DCAT-USA metadata shape (https://catalog.data.gov/api).
 */
const API = (q: string) =>
  `https://catalog.data.gov/search?q=${encodeURIComponent(
    q,
  )}&rows=8&format=json`;

interface DataGovDistribution {
  format?: string;
  mediaType?: string;
  accessURL?: string;
  downloadURL?: string;
  description?: string;
}

interface DataGovRecord {
  slug: string;
  identifier?: string;
  title: string;
  description?: string;
  organization?: string | null;
  publisher?: string | null;
  keyword?: string[] | null;
  theme?: string[] | null;
  distribution_titles?: string[] | null;
  dcat?: {
    license?: string;
    modified?: string;
    publisher?: { name?: string } | null;
    distribution?: DataGovDistribution[];
  };
}

interface DataGovResponse {
  results: DataGovRecord[];
}

const DOWNLOADABLE_FORMATS = new Set(["CSV", "JSON", "TSV"]);

export const dataGov: SourceAdapter = {
  id: "datagov",
  displayName: "data.gov",
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    const data = await fetchJson<DataGovResponse>(API(query), { signal });
    const records = data?.results ?? [];

    return records
      .map((record): SourceResult => {
        const dcat = record.dcat;
        const distributions = dcat?.distribution ?? [];
        const sizeBytes = null; // the catalog does not publish file sizes
        const license = normalizeLicense(dcat?.license);

        const csv = distributions.find((d) => {
          const fmt = (d.format ?? "").toUpperCase();
          return (
            DOWNLOADABLE_FORMATS.has(fmt) &&
            (d.downloadURL || d.accessURL)
          );
        }) ?? null;
        const previewUrl = csv?.downloadURL || csv?.accessURL || null;

        return {
          source: "datagov",
          sourceId: record.slug || record.identifier || record.title,
          url: `https://catalog.data.gov/dataset/${record.slug || record.identifier}`,
          title: record.title,
          type: "dataset",
          description: record.description ?? "",
          size: formatBytes(sizeBytes),
          sizeBytes,
          license: license.license,
          licenseRaw: license.raw ?? null,
          preview: previewUrl
            ? { type: "csv", url: previewUrl, note: `${csv?.format ?? "CSV"} (sampled)` }
            : { type: "none", url: null },
          snippet: buildSnippet({
            source: "datagov",
            sourceId: record.slug || record.identifier || record.title,
            title: record.title,
            type: "dataset",
            query,
            preview: previewUrl
              ? { type: "csv", url: previewUrl }
              : { type: "none", url: null },
            metadata: {},
          }),
          metadata: {
            updated: dcat?.modified?.slice(0, 10) ?? null,
            organization:
              dcat?.publisher?.name ?? record.organization ?? null,
            resources: distributions.length,
            formats: [
              ...new Set(
                distributions
                  .map((d) => (d.format ?? "").toUpperCase())
                  .filter(Boolean),
              ),
            ].slice(0, 5),
            themes: (record.theme ?? []).slice(0, 5),
          },
          authors: [],
          publishedAt: null,
          updatedAt: dcat?.modified ?? null,
          popularity: null,
        };
      })
      .filter(
        (r) => !!r.title && !r.title.toLowerCase().includes("(archived)"),
      );
  },
};
