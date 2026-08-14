import type { LicenseId } from "../types";

export interface ReproPart {
  /** 0..1 sub-score for this component. */
  score: number;
  /** ok = resolved; pending = still being estimated (badge shows pulse); unknown = nothing usable. */
  state: "ok" | "pending" | "unknown";
  detail?: string;
}

export interface ReproParts {
  metadata: ReproPart;
  license: ReproPart;
  liveness: ReproPart;
  maintenance: ReproPart;
}

export interface ReproScore {
  /** 0..100. */
  total: number;
  parts: ReproParts;
  /** True while liveness/maintenance are still resolving. */
  estimating: boolean;
}

/**
 * Reproducibility Score — a transparent 0-100 trust signal.
 *
 *   metadata    0.20  description substance + size + dates present
 *   license     0.20  permissive/open-license baseline
 *   liveness    0.35  is the result's own page still reachable?
 *   maintenance 0.25  how recently was the underlying work updated?
 *
 * Metadata + license are computed instantly from data already in the card.
 * Liveness + maintenance are fetched lazily (IntersectionObserver) from the
 * /api/liveness and /api/maintenance routes (each cached 24h). While those are
 * pending they contribute a neutral 0.5 so the total stays meaningful, and
 * `estimating: true` lets the badge pulse until the data arrives.
 *
 * Nothing here is a black box — every component maps to a human-readable
 * detail string shown in the badge's popover.
 */

export function scoreMetadata(parts: {
  description?: string;
  size?: string | null;
  publishedAt?: string | null;
  updatedAt?: string | null;
}): ReproPart {
  const desc = (parts.description ?? "").trim();
  const descScore =
    desc.length === 0 ? 0 : desc.length < 50 ? 0.4 : desc.length < 150 ? 0.7 : 1;
  const hasSize = Boolean(parts.size);
  const hasDates = Boolean(parts.publishedAt || parts.updatedAt);
  const score = 0.5 * descScore + 0.25 * (hasSize ? 1 : 0) + 0.25 * (hasDates ? 1 : 0);

  const bits: string[] = [];
  if (descScore === 0) bits.push("no description");
  else bits.push(descScore >= 1 ? "rich description" : "thin description");
  bits.push(hasSize ? "size listed" : "no size");
  bits.push(hasDates ? "dates present" : "no dates");

  return { score, state: "ok", detail: bits.join(" · ") };
}

export function scoreLicense(license: LicenseId, raw: string | null): ReproPart {
  let score: number;
  switch (license) {
    case "Public Domain":
      score = 1;
      break;
    case "MIT":
    case "Apache-2.0":
    case "CC-BY":
      score = 0.9;
      break;
    case "CC-BY-NC":
      score = 0.6;
      break;
    default:
      score = 0.2;
  }
  return {
    score,
    state: "ok",
    detail: raw || (license === "Unknown" ? "no license declared" : license),
  };
}

export function scoreLiveness(status: "up" | "down" | "unknown"): ReproPart {
  switch (status) {
    case "up":
      return { score: 1, state: "ok", detail: "page reachable" };
    case "down":
      return { score: 0, state: "ok", detail: "page is unreachable" };
    default:
      return { score: 0.5, state: "unknown", detail: "reachability unknown" };
  }
}

const RECENT_MS = 180 * 24 * 60 * 60 * 1000; // ~6 months
const STALE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2 years

export function scoreMaintenance(lastPushIso: string | null): ReproPart {
  if (!lastPushIso) {
    return { score: 0.5, state: "unknown", detail: "no activity data" };
  }
  const age = Date.now() - new Date(lastPushIso).getTime();
  if (!Number.isFinite(age)) {
    return { score: 0.5, state: "unknown", detail: "no activity data" };
  }
  if (age <= RECENT_MS) {
    return { score: 1, state: "ok", detail: "actively maintained" };
  }
  if (age <= STALE_MS) {
    return { score: 0.7, state: "ok", detail: "maintained recently" };
  }
  return { score: 0.3, state: "ok", detail: "stale — update it yourself" };
}

export function combineScore(
  metadata: ReproPart,
  license: ReproPart,
  liveness: ReproPart,
  maintenance: ReproPart,
): ReproScore {
  const parts: ReproParts = { metadata, license, liveness, maintenance };
  const raw =
    0.2 * metadata.score +
    0.2 * license.score +
    0.35 * liveness.score +
    0.25 * maintenance.score;
  const estimating = liveness.state === "pending" || maintenance.state === "pending";
  return { total: Math.round(raw * 100), parts, estimating };
}

/** Provisional parts with neutral 0.5 estimates for the lazy components. */
export function provisionalParts(
  metadata: ReproPart,
  license: ReproPart,
): ReproParts {
  return {
    metadata,
    license,
    liveness: { score: 0.5, state: "pending", detail: "checking reachability…" },
    maintenance: { score: 0.5, state: "pending", detail: "checking maintenance…" },
  };
}

export function scoreTone(total: number): "green" | "amber" | "red" {
  if (total >= 70) return "green";
  if (total >= 40) return "amber";
  return "red";
}