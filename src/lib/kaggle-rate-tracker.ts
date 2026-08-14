import Database from "better-sqlite3";
import { initSqlite } from "./sqlite";

/**
 * Shared-key Kaggle usage tracker.
 *
 * Kaggle does NOT publish numeric API rate limits — it uses "dynamic rate
 * limiting" and only signals exhaustion with an HTTP 429 + Retry-After header
 * (https://www.kaggle.com/docs/api). So instead of trusting an undocumented
 * number, Cairn tracks how many searches were made with the shared
 * KAGGLE_USERNAME/KAGGLE_KEY and treats a *conservative, configurable budget*
 * as the quota. When usage crosses ~75% we flip to "handoff mode" and ask the
 * user to connect their own key — well before a real 429 could happen.
 *
 * Requests made with a user's personal key are NOT counted here (they never
 * touch the shared quota).
 */

let db: Database.Database | null = null;

/** Estimated shared-key request budget per rolling window. Overridable. */
const SHARED_BUDGET = Number(process.env.KAGGLE_SHARED_BUDGET ?? 120);
/** Rolling window length in minutes. */
const WINDOW_MINUTES = Number(process.env.KAGGLE_SHARED_WINDOW_MIN ?? 60);
/** Flip to handoff at this fraction of the budget. */
const HANDOFF_THRESHOLD = 0.75;

const WINDOW_MS = WINDOW_MINUTES * 60 * 1000;

function getDb(): Database.Database | null {
  if (!db) {
    db = initSqlite(`
      CREATE TABLE IF NOT EXISTS kaggle_usage (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        used INTEGER NOT NULL DEFAULT 0,
        window_start INTEGER NOT NULL
      );
    `);
  }
  return db;
}

interface UsageRow {
  used: number;
  window_start: number;
}

function currentWindowStart(now: number): number {
  return now - (now % WINDOW_MS);
}

function readUsage(now: number): UsageRow {
  const handle = getDb();
  if (!handle) return { used: 0, window_start: currentWindowStart(now) };
  const row = handle
    .prepare("SELECT used, window_start FROM kaggle_usage WHERE id = 1")
    .get() as UsageRow | undefined;
  if (!row) return { used: 0, window_start: currentWindowStart(now) };
  if (now - row.window_start >= WINDOW_MS) return { used: 0, window_start: currentWindowStart(now) };
  return row;
}

/** Record one shared-key request. Resets the window when it expires. */
export function recordKaggleRequest(now = Date.now()): void {
  const handle = getDb();
  if (!handle) {
    console.log(
      "[cairn:kaggle-rate] shared usage tracking disabled (cache unavailable)",
    );
    return;
  }
  const usage = readUsage(now);
  const nextUsed = usage.used + 1;
  handle
    .prepare(
      `INSERT INTO kaggle_usage (id, used, window_start)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         used = excluded.used,
         window_start = excluded.window_start`,
    )
    .run(nextUsed, usage.window_start);
  // Sanity check: log the computed usage ratio on every shared request so a
  // premature handoff is immediately visible as a wrong counter, not a mystery.
  const ratio = Math.min(1, nextUsed / SHARED_BUDGET);
  console.log(
    `[cairn:kaggle-rate] shared usage now ${nextUsed}/${SHARED_BUDGET} (${Math.round(
      ratio * 100,
    )}%) — handoff at ${Math.round(HANDOFF_THRESHOLD * 100)}%`,
  );
}

/** Fraction (0..1) of the shared budget consumed in the current window. */
export function kaggleSharedUsageRatio(now = Date.now()): number {
  if (SHARED_BUDGET <= 0) return 1;
  const usage = readUsage(now);
  return Math.min(1, usage.used / SHARED_BUDGET);
}

/** True once the shared budget is ~75% consumed — enter handoff mode. */
export function isKaggleHandoff(now = Date.now()): boolean {
  return kaggleSharedUsageRatio(now) >= HANDOFF_THRESHOLD;
}

/** Human-readable budget status for debugging/tooltips. */
export function kaggleUsageSummary(now = Date.now()): {
  used: number;
  limit: number;
  ratio: number;
  handoff: boolean;
} {
  const usage = readUsage(now);
  const ratio = kaggleSharedUsageRatio(now);
  return {
    used: usage.used,
    limit: SHARED_BUDGET,
    ratio: Math.round(ratio * 100),
    handoff: ratio >= HANDOFF_THRESHOLD,
  };
}