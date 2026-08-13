import { fetchJson } from "@/lib/fetch";
import { formatBytes, formatCount, stripHtml } from "@/lib/format";
import { normalizeLicense } from "@/lib/license";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult } from "@/lib/types";
import type { SourceAdapter } from "./types";

const API = (q: string) =>
  `https://zenodo.org/api/records?q=${encodeURIComponent(
    q,
  )}&size=8&type=dataset`;

interface ZenodoFile {
  key: string;
  size: number | null;
  links: { self?: string; content?: string };
}

interface ZenodoRecord {
  id: number;
  metadata: {
    title: string;
    description?: string;
    license?: { id?: string; title?: string } | null;
    publication_date?: string;
    creators?: { name?: string }[];
    version?: string;
  };
  stats?: { downloads?: number; views?: number };
  files?: ZenodoFile[];
}

interface ZenodoResponse {
  hits: { hits: ZenodoRecord[] };
}

export const zenodo: SourceAdapter = {
  id: "zenodo",
  displayName: "Zenodo",
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    const data = await fetchJson<ZenodoResponse>(API(query), { signal });
    const hits = data.hits?.hits ?? [];

    return hits.map((record) => {
      const files = record.files ?? [];
      const sizeBytes =
        files.reduce(
          (sum, f) => sum + (typeof f.size === "number" ? f.size : 0),
          0,
        ) || null;
      const license = normalizeLicense(record.metadata.license?.id);
      const csv = files.find((f) => /\.csv$/i.test(f.key));

      return {
        source: "zenodo",
        sourceId: String(record.id),
        url: `https://zenodo.org/records/${record.id}`,
        title: record.metadata.title,
        type: "dataset",
        description: stripHtml(record.metadata.description ?? ""),
        size: formatBytes(sizeBytes),
        sizeBytes,
        license: license.license,
        licenseRaw: license.raw ?? record.metadata.license?.title ?? null,
        preview: csv
          ? {
              type: "csv",
              url:
                csv.links?.content ??
                csv.links?.self ??
                `https://zenodo.org/api/records/${record.id}/files/${encodeURIComponent(csv.key)}/content`,
              note: `${csv.key} (sampled)`,
            }
          : { type: "none", url: null },
        snippet: buildSnippet({
          source: "zenodo",
          sourceId: String(record.id),
          title: record.metadata.title,
          type: "dataset",
          query,
          preview: csv
            ? { type: "csv", url: csv.links?.content ?? csv.links?.self ?? "" }
            : { type: "none", url: null },
          metadata: {},
        }),
        metadata: {
          published: record.metadata.publication_date,
          creators: (record.metadata.creators ?? [])
            .slice(0, 2)
            .map((c) => c.name)
            .join(", "),
          version: record.metadata.version ?? null,
          files: files.length,
          downloads: record.stats?.downloads ?? null,
        },
        authors: (record.metadata.creators ?? [])
          .map((c) => c.name ?? "")
          .filter(Boolean),
        publishedAt: record.metadata.publication_date ?? null,
        updatedAt: record.metadata.publication_date ?? null,
        popularity: record.stats?.downloads ?? null,
        popularityLabel: record.stats?.downloads
          ? `${formatCount(record.stats.downloads)} downloads`
          : null,
      };
    });
  },
};
