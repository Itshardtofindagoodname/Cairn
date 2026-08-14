import type { LicenseId, ResultType, SourceId } from "@/lib/types";
import type { LucideIcon } from "lucide-react";
import {
  Cloud,
  Database,
  FileText,
  GitFork,
  Landmark,
  Cpu,
  FlaskConical,
  BarChart3,
} from "lucide-react";

export const SOURCE_META: Record<
  SourceId,
  {
    label: string;
    short: string;
    text: string;
    bg: string;
    border: string;
    dot: string;
    icon: LucideIcon;
  }
> = {
  huggingface: {
    label: "Hugging Face",
    short: "HF",
    text: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    dot: "bg-amber-400",
    icon: Cloud,
  },
  zenodo: {
    label: "Zenodo",
    short: "Zenodo",
    text: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/30",
    dot: "bg-sky-400",
    icon: Database,
  },
  datagov: {
    label: "data.gov",
    short: "data.gov",
    text: "text-emerald-400",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
    dot: "bg-emerald-400",
    icon: Landmark,
  },
  openml: {
    label: "OpenML",
    short: "OpenML",
    text: "text-rose-400",
    bg: "bg-rose-400/10",
    border: "border-rose-400/30",
    dot: "bg-rose-400",
    icon: FlaskConical,
  },
  arxiv: {
    label: "arXiv",
    short: "arXiv",
    text: "text-red-400",
    bg: "bg-red-400/10",
    border: "border-red-400/30",
    dot: "bg-red-400",
    icon: FileText,
  },
  github: {
    label: "GitHub",
    short: "GitHub",
    text: "text-zinc-300",
    bg: "bg-zinc-300/10",
    border: "border-zinc-300/30",
    dot: "bg-zinc-300",
    icon: GitFork,
  },
  kaggle: {
    label: "Kaggle",
    short: "Kaggle",
    text: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/30",
    dot: "bg-sky-400",
    icon: BarChart3,
  },
};

export const TYPE_META: Record<
  ResultType,
  { label: string; text: string; bg: string; border: string; icon: LucideIcon }
> = {
  dataset: {
    label: "Dataset",
    text: "text-blue-300",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: Database,
  },
  model: {
    label: "Model",
    text: "text-violet-300",
    bg: "bg-violet-500/10",
    border: "border-violet-500/30",
    icon: Cpu,
  },
  paper: {
    label: "Paper",
    text: "text-red-300",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: FileText,
  },
  repo: {
    label: "Repo",
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: GitFork,
  },
};

export const LICENSE_META: Record<
  LicenseId,
  { label: string; commercial: boolean | null; text: string; bg: string }
> = {
  MIT: { label: "MIT", commercial: true, text: "text-emerald-300", bg: "bg-emerald-500/10" },
  "Apache-2.0": {
    label: "Apache-2.0",
    commercial: true,
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
  },
  "CC-BY": {
    label: "CC-BY",
    commercial: true,
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
  },
  "CC-BY-NC": {
    label: "CC-BY-NC",
    commercial: false,
    text: "text-amber-300",
    bg: "bg-amber-500/10",
  },
  "Public Domain": {
    label: "Public Domain",
    commercial: true,
    text: "text-emerald-300",
    bg: "bg-emerald-500/10",
  },
  Unknown: {
    label: "Unknown",
    commercial: null,
    text: "text-zinc-400",
    bg: "bg-zinc-500/10",
  },
};

export function formatMeta(metadata: Record<string, unknown>): {
  downloads: string | null;
  likes: string | null;
  updated: string | null;
  version: string | null;
} {
  const num = (v: unknown): string | null =>
    typeof v === "number" && Number.isFinite(v) ? v.toLocaleString("en-US") : null;
  return {
    downloads: num(metadata.downloads),
    likes: num(metadata.likes),
    updated:
      typeof metadata.updated === "string" ? metadata.updated : null,
    version:
      typeof metadata.version === "string" ? `v${metadata.version}` : null,
  };
}
