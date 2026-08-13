import { extractEntities, normalizeEntityName, type EntityMention } from "./entities";
import { authorOverlap, sameItemConfidence } from "./dedupe";
import type { MergedResult, SourceId } from "./types";

/**
 * Cross-source provenance graph — the project's centerpiece.
 *
 * The core problem: a paper, the dataset it introduced, the models trained on
 * that dataset and the code implementing it are scattered across arXiv, HF,
 * GitHub, Zenodo, Semantic Scholar and OpenML with NO shared IDs. DataForge
 * stitches them together heuristically:
 *
 *   1. entities.ts extracts candidate dataset/model/paper names from each
 *      result's title + description (+ README).
 *   2. This module resolves them ACROSS sources using normalized string
 *      matching (case/punctuation/version-suffix insensitive) plus exact
 *      DOI/arXiv-ID matches where available.
 *   3. Three edge kinds encode the relationships we can honestly claim:
 *        - "mentions"        A result's text references another result's title.
 *        - "same-entity-as"  two results discuss the same named entity
 *                            (or share an exact arXiv id / DOI).
 *        - "same-author-as"  author/creator sets overlap.
 *
 * Honest caveat (by design, not a bug): this is heuristic entity resolution,
 * not a solved NER/pipeline. False positives (two different "ImageNet"
 * datasets) and false negatives (a repo that never spells the dataset name)
 * both occur. We expose confidence on every edge so the UI can show *why* a
 * link exists, and the README discusses the tradeoffs openly.
 */

export type EdgeKind = "mentions" | "same-entity-as" | "same-author-as";

export interface GraphNode {
  id: string;
  uid: string;
  title: string;
  type: MergedResult["type"];
  source: SourceId;
  rank: number;
  /** d3-force mutates x/y in place. */
  x?: number;
  y?: number;
  entities: EntityMention[];
  result: MergedResult;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  /** Human-readable explanation shown on hover, e.g. "shared arXiv id". */
  reason: string;
  confidence: number;
}

export interface ProvenanceGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

/** Merge entities from all origins of a card (they can disagree). */
function cardEntities(card: MergedResult): EntityMention[] {
  const all: EntityMention[] = [];
  const seen = new Set<string>();
  for (const origin of card.origins) {
    const text = [card.title, card.description, origin.readme]
      .filter((p): p is string => Boolean(p && p.length > 0))
      .join("\n\n");
    for (const m of extractEntities(text)) {
      if (!seen.has(m.normalized)) {
        seen.add(m.normalized);
        all.push(m);
      }
    }
  }
  return all;
}

/** Is this entity essentially the card's own title (self-reference)? */
function isSelfMention(card: MergedResult, normalized: string): boolean {
  return normalizeEntityName(card.title) === normalized;
}

/** Build the provenance graph for a search session. Pure + deterministic. */
export function buildProvenanceGraph(results: MergedResult[]): ProvenanceGraph {
  const nodes: GraphNode[] = results.map((result, i) => ({
    id: `n${i}`,
    uid: result.uid,
    title: result.title,
    type: result.type,
    source: result.origins[0]?.source ?? "huggingface",
    rank: result.rank?.total ?? 0,
    entities: cardEntities(result),
    result,
  }));

  const edges = new Map<string, GraphEdge>();
  const addEdge = (
    a: GraphNode,
    b: GraphNode,
    kind: EdgeKind,
    reason: string,
    confidence: number,
  ) => {
    if (a.id === b.id || confidence <= 0) return;
    const key = [a.id, b.id, kind].sort().join("|");
    const existing = edges.get(key);
    if (!existing || confidence > existing.confidence) {
      edges.set(key, { id: key, source: a.id, target: b.id, kind, reason, confidence });
    }
  };

  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i];
      const b = nodes[j];

      // --- Exact-ID signal (definitive). ---
      if (a.result.arxivId && b.result.arxivId && a.result.arxivId === b.result.arxivId) {
        addEdge(a, b, "same-entity-as", `shared arXiv id: ${a.result.arxivId}`, 1);
        continue;
      }
      if (a.result.doi && b.result.doi && a.result.doi === b.result.doi) {
        addEdge(a, b, "same-entity-as", `shared DOI: ${a.result.doi}`, 1);
        continue;
      }

      // --- Entity mentions across the two cards. ---
      const aEntities = new Map(a.entities.map((m) => [m.normalized, m]));
      const bEntities = new Map(b.entities.map((m) => [m.normalized, m]));

      for (const [norm, ma] of aEntities) {
        const mb = bEntities.get(norm);
        if (!mb) continue;

        // Both mention the same entity.
        if (!isSelfMention(a.result, norm) && !isSelfMention(b.result, norm)) {
          const conf = (ma.confidence + mb.confidence) / 2;
          addEdge(a, b, "same-entity-as", `both mention “${ma.name}”`, conf);
        }
        // A's text references B's own title.
        if (isSelfMention(b.result, norm)) {
          addEdge(a, b, "mentions", `${a.title.slice(0, 60)} references “${ma.name}”`, ma.confidence);
        }
        // B's text references A's own title.
        if (isSelfMention(a.result, norm)) {
          addEdge(b, a, "mentions", `${b.title.slice(0, 60)} references “${mb.name}”`, mb.confidence);
        }
      }

      // --- Title similarity as a same-entity signal. ---
      // Threshold aligned with dedupe OVERLAP_THRESHOLD (0.62) for consistency.
      // Graph edges below 1.0 are hints, not definitive merges.
      const titleSim = sameItemConfidence(
        { title: a.title, authors: a.result.authors, doi: a.result.doi, arxivId: a.result.arxivId },
        { title: b.title, authors: b.result.authors, doi: b.result.doi, arxivId: b.result.arxivId },
      );
      if (titleSim >= 0.62 && titleSim < 1) {
        addEdge(a, b, "same-entity-as", `title match: ${titleSim.toFixed(2)}`, titleSim);
      }

      // --- Author overlap. ---
      const ao = authorOverlap(a.result.authors, b.result.authors);
      if (ao >= 0.5) {
        addEdge(a, b, "same-author-as", `author overlap: ${(ao * 100).toFixed(0)}%`, ao);
      }
    }
  }

  return { nodes, edges: [...edges.values()] };
}

/** Which sources are represented in the graph (for the legend). */
export function graphSources(graph: ProvenanceGraph): SourceId[] {
  return [...new Set(graph.nodes.map((n) => n.source))];
}
