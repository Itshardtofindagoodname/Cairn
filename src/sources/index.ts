import type { SourceAdapter } from "./types";
import { huggingFace } from "./huggingface";
import { zenodo } from "./zenodo";
import { dataGov } from "./datagov";
import { openML } from "./openml";
import { arxiv } from "./arxiv";
import { github } from "./github";
import { kaggle } from "./kaggle";

export * from "./types";

export const SOURCES: SourceAdapter[] = [
  huggingFace,
  arxiv,
  github,
  zenodo,
  dataGov,
  openML,
  kaggle,
];
