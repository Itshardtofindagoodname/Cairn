import type { SourceId, SourceResult } from "@/lib/types";

export interface SourceAdapter {
  id: SourceId;
  displayName: string;
  search(query: string, signal?: AbortSignal): Promise<SourceResult[]>;
}

/**
 * Thrown by an adapter when the upstream API is rate-limited in a way that is
 * expected and worth surfacing as a distinct UI state ("rate-limited" chip)
 * rather than a generic failure — used by the GitHub adapter for its 60/hr
 * anonymous budget and by Semantic Scholar when its shared free pool is busy.
 */
export class SourceRateLimitedError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "SourceRateLimitedError";
  }
}
