import type { SourceId, SourceResult } from "@/lib/types";

/**
 * Optional, request-scoped credentials handed to an adapter for a single
 * search. Currently only used by the Kaggle adapter (a user's own API key).
 * Keys are provided by the browser on a per-request basis and never stored
 * server-side.
 */
export interface SourceAuthContext {
  kaggle?: { username?: string; key?: string } | null;
}

export interface SourceAdapter {
  id: SourceId;
  displayName: string;
  search(
    query: string,
    signal?: AbortSignal,
    auth?: SourceAuthContext,
  ): Promise<SourceResult[]>;
}

/**
 * Thrown by an adapter when the upstream API is rate-limited in a way that is
 * expected and worth surfacing as a distinct UI state ("rate-limited" chip)
 * rather than a generic failure — used by the GitHub adapter for its 60/hr
 * anonymous budget.
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

/**
 * Thrown by an adapter when it could not produce results because its shared
 * credential budget is exhausted or unusable, and the user can recover by
 * providing their own credentials. Surfaced as a "handoff" chip in the UI
 * that prompts the user to connect their own account (e.g. Kaggle).
 */
export class SourceHandoffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SourceHandoffError";
  }
}
