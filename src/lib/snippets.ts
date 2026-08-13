import type { PreviewInfo, SourceId, ResultType } from "./types";

export interface SnippetContext {
  source: SourceId;
  sourceId: string;
  title: string;
  type: ResultType;
  query: string;
  preview: PreviewInfo;
  metadata: Record<string, unknown>;
}

/** Build copy-pasteable loading code for a given result/origin. */
export function buildSnippet(ctx: SnippetContext): string {
  switch (ctx.source) {
    case "huggingface":
      return ctx.type === "model"
        ? hfModelSnippet(ctx.sourceId, ctx.metadata.pipelineTag)
        : hfDatasetSnippet(ctx.sourceId);
    case "zenodo":
      return ctx.preview.type === "csv" && ctx.preview.url
        ? curlSnippet(ctx.preview.url)
        : zenodoApiSnippet(ctx.query);
    case "datagov":
      return ctx.preview.type === "csv" && ctx.preview.url
        ? pandasSnippet(ctx.preview.url)
        : ckanApiSnippet(ctx.query);
    case "openml":
      return ctx.preview.type === "csv" && ctx.preview.url
        ? pandasSnippet(ctx.preview.url)
        : openmlSnippet(ctx.metadata.did);
    case "arxiv":
      return arxivSnippet(ctx.sourceId);
    case "semanticscholar":
      return semanticScholarSnippet(ctx.sourceId);
    case "github":
      return githubSnippet(ctx.sourceId);
    default:
      return `# "${ctx.title}" is not yet available from ${ctx.source}.`;
  }
}

function hfDatasetSnippet(id: string): string {
  return `# pip install datasets
from datasets import load_dataset

dataset = load_dataset("${id}")
# dataset["train"]  ->  a pandas-friendly Arrow table`;
}

function hfModelSnippet(id: string, pipelineTag: unknown): string {
  const task = typeof pipelineTag === "string" ? pipelineTag : "text-generation";
  return `# pip install transformers
from transformers import pipeline

pipe = pipeline("${task}", model="${id}")
# print(pipe("Hello, world!"))`;
}

function zenodoApiSnippet(query: string): string {
  return `import requests

r = requests.get(
    "https://zenodo.org/api/records",
    params={"q": "${escapeQuery(query)}", "size": 10, "type": "dataset"},
    headers={"Accept": "application/json"},
)
records = r.json()["hits"]["hits"]
for rec in records:
    print(rec["metadata"]["title"])`;
}

function ckanApiSnippet(query: string): string {
  return `import requests

r = requests.get(
    "https://catalog.data.gov/search",
    params={"q": "${escapeQuery(query)}", "rows": 10, "format": "json"},
)
records = r.json()["results"]
for rec in records:
    print(rec["title"], rec["dcat"]["license"])`;
}

function pandasSnippet(url: string): string {
  return `import pandas as pd

df = pd.read_csv("${url}")
print(df.head())
# print(df.info())`;
}

function curlSnippet(url: string): string {
  return `# download directly
curl -L -o dataset.csv "${url}"`;
}

function openmlSnippet(did: unknown): string {
  const id = typeof did === "string" || typeof did === "number" ? did : "?";
  return `# pip install openml
import openml

dataset = openml.datasets.get_dataset(${id})
X, y, categorical, attribute_names = dataset.get_data(
    target=dataset.default_target_attribute
)
print(X.head())`;
}

function arxivSnippet(arxivId: string): string {
  return `# download the PDF from arXiv (no key required)
curl -L "https://arxiv.org/pdf/${arxivId}.pdf" -o ${arxivId}.pdf
# view the abstract page:
# https://arxiv.org/abs/${arxivId}`;
}

function semanticScholarSnippet(paperId: string): string {
  return `# pip install requests
import requests

r = requests.get(
    "https://api.semanticscholar.org/graph/v1/paper/${paperId}",
    params={"fields": "title,abstract,citationCount,year"},
)
paper = r.json()
print(paper["title"], paper["citationCount"])`;
}

function githubSnippet(repoPath: string): string {
  return `# clone the repository (public repos, no auth required)
git clone https://github.com/${repoPath}.git
cd ${repoPath.split("/").pop() ?? repoPath}`;
}

function escapeQuery(q: string): string {
  return q.replace(/"/g, '\\"');
}
