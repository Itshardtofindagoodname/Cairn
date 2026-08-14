/**
 * Central site constants used by metadata, sitemap, robots, manifest,
 * llms.txt and structured data. Override the canonical origin at build time
 * with NEXT_PUBLIC_SITE_URL — everything else derives from it.
 */

export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://cairn-search.vercel.app";

export const SITE_NAME = "Cairn";

export const SITE_TITLE = "Cairn — Search open datasets, models, papers & code";

export const SITE_DESCRIPTION =
  "A federated search engine for open data and ML. Type one query and Cairn fans out to Hugging Face, arXiv, GitHub, Zenodo, data.gov, OpenML and Kaggle in parallel, streams the results back live, and ranks every one with a transparent Reproducibility Score. No paid API keys required.";

export const SITE_KEYWORDS = [
  "dataset search",
  "search datasets",
  "open data",
  "hugging face search",
  "arxiv search",
  "github code search",
  "zenodo",
  "data.gov",
  "openml",
  "kaggle search",
  "machine learning datasets",
  "find datasets",
  "reproducibility score",
  "dataset discovery",
  "research data search",
];

export const LOGO_PATH = "/icon";
export const LOGO_URL = `${SITE_URL}${LOGO_PATH}`;
export const ICON_PATH = "/apple-icon";
