/**
 * Deterministic, rule-based entity extraction — no LLM calls.
 *
 * From a result's title + description (+ GitHub README) we pull candidate
 * mentions of datasets, models and papers. This is intentionally naive and
 * explainable: capitalized noun phrases, known-pattern matches (CIFAR-10,
 * ImageNet-1k, GPT-4), quoted names, and a curated seed vocabulary. The goal
 * is not SOTA NER — it's a transparent, reproducible signal for the
 * provenance graph, and it demonstrates real extraction logic.
 *
 * Honest caveat: rules over-generate ("State Of The Art" gets caught as a
 * phrase) and under-generate (rare names miss the seed list). The graph layer
 * accounts for that with normalization + confidence scoring.
 */

export type EntityKind = "dataset" | "model" | "paper" | "unknown";

export interface EntityMention {
  /** Display form as extracted from the text. */
  name: string;
  /** Normalized key used for cross-source matching. */
  normalized: string;
  kind: EntityKind;
  /** 0..1 heuristic confidence in this being a real ML entity. */
  confidence: number;
}

/**
 * Curated seed vocabulary of common ML datasets/models/papers. Matched
 * case-insensitively as substrings so "ImageNet", "imagenet-1k" and "ImageNet
 * 2012" all resolve. Adding more names here immediately improves the graph.
 */
const SEED_VOCAB: { name: string; kind: EntityKind }[] = [
  { name: "imagenet", kind: "dataset" },
  { name: "imagenet-21k", kind: "dataset" },
  { name: "cifar-10", kind: "dataset" },
  { name: "cifar-100", kind: "dataset" },
  { name: "mnist", kind: "dataset" },
  { name: "fashion-mnist", kind: "dataset" },
  { name: "svhn", kind: "dataset" },
  { name: "coco", kind: "dataset" },
  { name: "open images", kind: "dataset" },
  { name: "pascal voc", kind: "dataset" },
  { name: "squad", kind: "dataset" },
  { name: "glue", kind: "dataset" },
  { name: "superglue", kind: "dataset" },
  { name: "wikitext", kind: "dataset" },
  { name: "wikitext-103", kind: "dataset" },
  { name: "bookcorpus", kind: "dataset" },
  { name: "the pile", kind: "dataset" },
  { name: "laion-400m", kind: "dataset" },
  { name: "laion-5b", kind: "dataset" },
  { name: "common crawl", kind: "dataset" },
  { name: "celeb-a", kind: "dataset" },
  { name: "celeba", kind: "dataset" },
  { name: "ffhq", kind: "dataset" },
  { name: "lsun", kind: "dataset" },
  { name: "places365", kind: "dataset" },
  { name: "kinetics", kind: "dataset" },
  { name: "nyu depth", kind: "dataset" },
  { name: "tacred", kind: "dataset" },
  { name: "qnli", kind: "dataset" },
  { name: "mnli", kind: "dataset" },
  { name: "rte", kind: "dataset" },
  { name: "sst-2", kind: "dataset" },
  { name: "sentiment140", kind: "dataset" },
  { name: "bert", kind: "model" },
  { name: "roberta", kind: "model" },
  { name: "distilbert", kind: "model" },
  { name: "albert", kind: "model" },
  { name: "electra", kind: "model" },
  { name: "xlnet", kind: "model" },
  { name: "t5", kind: "model" },
  { name: "bart", kind: "model" },
  { name: "gpt", kind: "model" },
  { name: "gpt-2", kind: "model" },
  { name: "gpt-3", kind: "model" },
  { name: "gpt-4", kind: "model" },
  { name: "llama", kind: "model" },
  { name: "llama-2", kind: "model" },
  { name: "llama-3", kind: "model" },
  { name: "mistral", kind: "model" },
  { name: "mixtral", kind: "model" },
  { name: "falcon", kind: "model" },
  { name: "opt", kind: "model" },
  { name: "bloom", kind: "model" },
  { name: "vicuna", kind: "model" },
  { name: "alpaca", kind: "model" },
  { name: "gemma", kind: "model" },
  { name: "resnet", kind: "model" },
  { name: "resnet-50", kind: "model" },
  { name: "vgg", kind: "model" },
  { name: "inception", kind: "model" },
  { name: "mobilenet", kind: "model" },
  { name: "efficientnet", kind: "model" },
  { name: "densenet", kind: "model" },
  { name: "alexnet", kind: "model" },
  { name: "vit", kind: "model" },
  { name: "swin transformer", kind: "model" },
  { name: "deit", kind: "model" },
  { name: "convnext", kind: "model" },
  { name: "clip", kind: "model" },
  { name: "yolo", kind: "model" },
  { name: "yolov5", kind: "model" },
  { name: "yolov8", kind: "model" },
  { name: "faster r-cnn", kind: "model" },
  { name: "mask r-cnn", kind: "model" },
  { name: "stable diffusion", kind: "model" },
  { name: "sd-xl", kind: "model" },
  { name: "dall-e", kind: "model" },
  { name: "stylegan", kind: "model" },
  { name: "cyclegan", kind: "model" },
  { name: "pix2pix", kind: "model" },
  { name: "whisper", kind: "model" },
  { name: "wav2vec", kind: "model" },
  { name: "attention is all you need", kind: "paper" },
  { name: "attention is all you need.", kind: "paper" },
  { name: "masked autoencoders", kind: "paper" },
  { name: "an image is worth", kind: "paper" },
  { name: "denoising diffusion", kind: "paper" },
];

/** Known-pattern regexes for compact ML-style names (CIFAR-10, ImageNet-1k, GPT-4). */
const KNOWN_PATTERNS: { re: RegExp; kind: EntityKind }[] = [
  // "Word-NNNk", "Word-NNN", "WORD-NNN"  (e.g. ImageNet-1k, CIFAR-10, SB-100K)
  { re: /\b([A-Z][A-Za-z0-9]{1,20}(?:-[0-9]+[kK]?|-[0-9]{2,4}(?:k|K)?))\b/g, kind: "dataset" },
  // "Word-v2", "Word-v3" model versions (e.g. Llama-v2, T5-v1_1)
  { re: /\b([A-Z][A-Za-z0-9]{1,20}-v[0-9][A-Za-z0-9_]*)\b/g, kind: "model" },
  // bare uppercase alnum tokens ≥ 4 chars that look like acronyms (BERT, LLaMA, ViT)
  { re: /\b([A-Z]{2,}[0-9]*)\b/g, kind: "model" },
];

const CAPITALIZED_WORDS = /\b[A-Z][a-z]{2,}\b/g;
const PHRASE_STOPWORDS = new Set([
  "the", "this", "that", "with", "from", "into", "over", "using", "based",
  "under", "through", "toward", "towards", "across", "within", "state", "of",
  "for", "and", "or", "on", "in", "at", "a", "an", "our", "their", "we",
]);

const MIN_CONFIDENCE = 0.35;

/** Normalize an entity name for cross-source matching. */
export function normalizeEntityName(name: string): string {
  return name
    .toLowerCase()
    .replace(/-(\d+[kK]?)/g, "$1")     // ImageNet-1k → imagenet1k, CIFAR-10 → cifar10
    .replace(/[\s_-]+/g, " ")          // any separators → single space
    .replace(/[^a-z0-9 ]+/g, "")       // strip remaining punctuation
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract candidate entity mentions from a blob of text.
 * Deterministic and repeatable: same input → same output.
 */
export function extractEntities(text: string): EntityMention[] {
  if (!text || text.length < 4) return [];
  const mentions: EntityMention[] = [];

  const add = (name: string, kind: EntityKind, confidence: number) => {
    const clean = name.trim();
    if (clean.length < 2 || clean.length > 60) return;
    const normalized = normalizeEntityName(clean);
    if (normalized.length < 2) return;
    mentions.push({ name: clean, normalized, kind, confidence });
  };

  const lower = text.toLowerCase();

  // 1. Seed vocabulary — substring match, case-insensitive.
  for (const seed of SEED_VOCAB) {
    // Avoid trivial "the" etc. — all seeds are distinctive names.
    if (lower.includes(seed.name)) {
      add(seed.name, seed.kind, 0.95);
    }
  }

  // 2. Known patterns (compact names with digits).
  for (const { re, kind } of KNOWN_PATTERNS) {
    for (const match of text.matchAll(re)) {
      add(match[1], kind, 0.8);
    }
  }

  // 3. Quoted names ("my-dataset", `text-davinci-003`).
  for (const match of text.matchAll(/["'`]([A-Za-z0-9][A-Za-z0-9 _./-]{2,30})["'`]/g)) {
    add(match[1], "unknown", 0.7);
  }

  // 4. Capitalized multi-word noun phrases (2–5 words, Title Case).
  const words = text.match(CAPITALIZED_WORDS) ?? [];
  let phrase: string[] = [];
  for (const word of words) {
    const w = word.toLowerCase();
    if (!PHRASE_STOPWORDS.has(w) && w.length > 2) {
      phrase.push(word);
    } else if (phrase.length >= 2) {
      add(phrase.join(" "), "unknown", 0.45);
      phrase = [];
    } else {
      phrase = [];
    }
  }
  if (phrase.length >= 2) add(phrase.join(" "), "unknown", 0.45);

  // Dedupe by normalized form, keep the highest confidence.
  const byNorm = new Map<string, EntityMention>();
  for (const m of mentions) {
    const existing = byNorm.get(m.normalized);
    if (!existing || m.confidence > existing.confidence) {
      byNorm.set(m.normalized, m);
    }
  }

  return [...byNorm.values()]
    .filter((m) => m.confidence >= MIN_CONFIDENCE)
    .sort((a, b) => b.confidence - a.confidence);
}

/** Extract entities from a result card (title + description + README). */
export function extractResultEntities(parts: {
  title?: string | null;
  description?: string | null;
  readme?: string | null;
}): EntityMention[] {
  const text = [parts.title, parts.description, parts.readme]
    .filter((p): p is string => Boolean(p && p.length > 0))
    .join("\n\n");
  return extractEntities(text);
}
