import { fetchJson } from "@/lib/fetch";
import { formatBytes, formatCount, formatParams } from "@/lib/format";
import { normalizeLicense } from "@/lib/license";
import { buildSnippet } from "@/lib/snippets";
import type { SourceResult, LicenseId } from "@/lib/types";
import type { SourceAdapter } from "./types";

const DATASETS_API = (q: string) =>
  `https://huggingface.co/api/datasets?search=${encodeURIComponent(
    q,
  )}&limit=8&full=true`;
const MODELS_API = (q: string) =>
  `https://huggingface.co/api/models?search=${encodeURIComponent(
    q,
  )}&limit=8&full=true`;

interface HFDataset {
  id: string;
  tags?: string[];
  private?: boolean;
  cardData?: {
    license?: string;
    description?: string;
    summary?: string;
    tags?: string[];
  };
  siblings?: { rfilename: string; size?: number }[];
  downloads?: number;
  likes?: number;
  lastModified?: string;
  createdAt?: string;
  description?: string;
}

interface HFModel {
  id: string;
  pipeline_tag?: string;
  tags?: string[];
  private?: boolean;
  cardData?: { license?: string; description?: string; tags?: string[] };
  safetensors?: { total?: number };
  downloads?: number;
  likes?: number;
  lastModified?: string;
  createdAt?: string;
}

function hfLicense(
  tags: string[] | undefined,
  cardData: HFDataset["cardData"],
): { license: LicenseId; raw: string | null } {
  const fromTag = (tags ?? []).find((t) => t.startsWith("license:"));
  const raw =
    fromTag?.slice("license:".length) ??
    cardData?.license ??
    (cardData?.tags ?? []).find((t) => t.startsWith("license:"))?.slice(
      "license:".length,
    ) ??
    null;
  return normalizeLicense(raw);
}

function hfDatasetToResult(item: HFDataset, query: string): SourceResult {
  const tags = item.tags ?? [];
  const cardTags = item.cardData?.tags ?? [];
  const license = hfLicense(tags, item.cardData);
  const sizeBytes =
    item.siblings?.reduce(
      (sum, s) => sum + (typeof s.size === "number" ? s.size : 0),
      0,
    ) ?? null;

  const csvSibling = item.siblings?.find((s) => /\.csv$/i.test(s.rfilename));
  const description =
    item.description ||
    item.cardData?.description ||
    item.cardData?.summary ||
    cardTags.filter(
      (t) => !t.startsWith("license:") && t !== "paperswithcode",
    ).join(", ") ||
    tags.filter((t) => !t.startsWith("license:")).slice(0, 6).join(", ");

  return {
    source: "huggingface",
    sourceId: item.id,
    url: `https://huggingface.co/datasets/${item.id}`,
    title: item.id,
    type: "dataset",
    description,
    size: formatBytes(sizeBytes),
    sizeBytes,
    license: license.license,
    licenseRaw: license.raw,
    preview: csvSibling
      ? {
          type: "csv",
          url: `https://huggingface.co/datasets/${item.id}/resolve/main/${csvSibling.rfilename}`,
          note: `${csvSibling.rfilename} (sampled)`,
        }
      : { type: "none", url: null },
    snippet: buildSnippet({
      source: "huggingface",
      sourceId: item.id,
      title: item.id,
      type: "dataset",
      query,
      preview: csvSibling
        ? {
            type: "csv",
            url: `https://huggingface.co/datasets/${item.id}/resolve/main/${csvSibling.rfilename}`,
          }
        : { type: "none", url: null },
      metadata: {},
    }),
    metadata: {
      downloads: item.downloads,
      likes: item.likes,
      files: item.siblings?.length ?? 0,
      updated: item.lastModified?.slice(0, 10) ?? null,
    },
    authors: [],
    publishedAt: item.createdAt ?? null,
    updatedAt: item.lastModified ?? null,
    popularity: item.downloads ?? item.likes ?? null,
    popularityLabel: item.downloads ? `${formatCount(item.downloads)} downloads` : null,
  };
}

function hfModelToResult(item: HFModel, query: string): SourceResult {
  const tags = item.tags ?? [];
  const license = hfLicense(tags, item.cardData);
  const params = item.safetensors?.total ?? null;
  const description =
    item.cardData?.description ||
    tags.filter((t) => !t.startsWith("license:")).slice(0, 6).join(", ") ||
    item.pipeline_tag ||
    "";

  return {
    source: "huggingface",
    sourceId: item.id,
    url: `https://huggingface.co/${item.id}`,
    title: item.id,
    type: "model",
    description,
    size: formatParams(params),
    sizeBytes: null,
    license: license.license,
    licenseRaw: license.raw,
    preview: {
      type: "json",
      url: `https://huggingface.co/${item.id}/raw/main/config.json`,
      note: "config.json",
    },
    snippet: buildSnippet({
      source: "huggingface",
      sourceId: item.id,
      title: item.id,
      type: "model",
      query,
      preview: { type: "json", url: null },
      metadata: { pipelineTag: item.pipeline_tag ?? "text-generation" },
    }),
    metadata: {
      downloads: item.downloads,
      likes: item.likes,
      pipelineTag: item.pipeline_tag ?? null,
      params,
      updated: item.lastModified?.slice(0, 10) ?? null,
    },
    authors: [],
    publishedAt: item.createdAt ?? null,
    updatedAt: item.lastModified ?? null,
    popularity: item.downloads ?? item.likes ?? null,
    popularityLabel: item.downloads ? `${formatCount(item.downloads)} downloads` : null,
  };
}

export const huggingFace: SourceAdapter = {
  id: "huggingface",
  displayName: "Hugging Face",
  async search(query: string, signal?: AbortSignal): Promise<SourceResult[]> {
    const [datasets, models] = await Promise.all([
      fetchJson<HFDataset[]>(DATASETS_API(query), { signal }),
      fetchJson<HFModel[]>(MODELS_API(query), { signal }),
    ]);
    const out: SourceResult[] = [];
    for (const d of datasets ?? []) {
      if (d.private) continue;
      out.push(hfDatasetToResult(d, query));
    }
    for (const m of models ?? []) {
      if (m.private) continue;
      out.push(hfModelToResult(m, query));
    }
    return out.slice(0, 16);
  },
};
