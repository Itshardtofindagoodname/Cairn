import { sameItemConfidence } from "./dedupe";
import { hashString } from "./format";
import type { MergedResult, Origin, SourceResult } from "./types";

/**
 * Merge per-source results into deduplicated cards.
 *
 * Dedupe is multi-signal: exact DOI/arXiv-id matches always collapse, strong
 * title matches collapse, and weaker title matches collapse when the author
 * sets genuinely overlap. The highest-ranked origin becomes the card's primary
 * metadata; every other source is listed under `origins` ("Also on: …").
 */
export function mergeResults(results: SourceResult[]): MergedResult[] {
  const groups: MergedResult[] = [];

  for (const result of results) {
    const target = {
      title: result.title,
      authors: result.authors,
      doi: result.doi,
      arxivId: result.arxivId,
    };
    let best: { group: MergedResult; confidence: number } | null = null;

    for (const group of groups) {
      const primary = group.origins[0];
      const confidence = sameItemConfidence(target, {
        title: group.title,
        authors: primary.authors,
        doi: primary.doi,
        arxivId: primary.arxivId,
      });
      if (confidence > 0 && (!best || confidence > best.confidence)) {
        best = { group, confidence };
      }
    }

    if (best) {
      const existing = best.group;
      const origin: Origin = {
        source: result.source,
        sourceId: result.sourceId,
        url: result.url,
        license: result.license,
        licenseRaw: result.licenseRaw,
        preview: result.preview,
        snippet: result.snippet,
        rank: result.rank,
        authors: result.authors,
        publishedAt: result.publishedAt ?? null,
        updatedAt: result.updatedAt ?? null,
        metadata: result.metadata,
        doi: result.doi ?? null,
        arxivId: result.arxivId ?? null,
        popularity: result.popularity ?? null,
        popularityLabel: result.popularityLabel ?? null,
      };
      existing.origins.push(origin);

      // Keep the highest-ranked origin as primary metadata.
      const primaryIndex = existing.origins.reduce(
        (maxIdx, o, i) =>
          (o.rank?.total ?? 0) > (existing.origins[maxIdx].rank?.total ?? 0)
            ? i
            : maxIdx,
        0,
      );
      if (primaryIndex > 0) {
        const [primary] = existing.origins.splice(primaryIndex, 1);
        existing.origins.unshift(primary);
      }
    } else {
      groups.push({
        uid: `d:${hashString(result.title.toLowerCase())}`,
        title: result.title,
        type: result.type,
        description: result.description,
        size: result.size,
        origins: [
          {
            source: result.source,
            sourceId: result.sourceId,
            url: result.url,
            license: result.license,
            licenseRaw: result.licenseRaw,
            preview: result.preview,
            snippet: result.snippet,
            rank: result.rank,
            authors: result.authors,
            publishedAt: result.publishedAt ?? null,
            updatedAt: result.updatedAt ?? null,
            metadata: result.metadata,
            doi: result.doi ?? null,
            arxivId: result.arxivId ?? null,
            popularity: result.popularity ?? null,
            popularityLabel: result.popularityLabel ?? null,
          },
        ],
      });
    }
  }

  return groups
    .map((g) => {
      const origin = g.origins[0];
      return {
        ...g,
        rank: origin.rank,
        authors: origin.authors,
        publishedAt: origin.publishedAt ?? null,
        updatedAt: origin.updatedAt ?? null,
        doi: origin.doi ?? null,
        arxivId: origin.arxivId ?? null,
        popularity: origin.popularity ?? null,
        popularityLabel: origin.popularityLabel ?? null,
      };
    })
    .sort((a, b) => (b.rank?.total ?? 0) - (a.rank?.total ?? 0));
}
