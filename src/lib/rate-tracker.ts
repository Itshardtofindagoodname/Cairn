import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import type { GroqRateInfo } from "./groq";

/**
 * Persistent Groq rate tracking.
 *
 * Groq returns `x-ratelimit-remaining-requests` (requests/day) and
 * `x-ratelimit-remaining-tokens` (tokens/min) headers on every response.
 * Cairn records the most recent observation in SQLite so the "should I queue
 * instead of calling?" decision is made from Groq's own reported headroom,
 * not guesswork. When either dimension drops below ~20% remaining, new AI
 * work is queued ("Insight queued…") rather than firing into a 429.
 */

let db: Database.Database | null = null;

const QUEUE_THRESHOLD = 0.2;

function getDb(): Database.Database {
  if (db) return db;
  const isVercel = process.env.VERCEL === "1";
  const file =
    process.env.CAIRN_CACHE_PATH ??
    process.env.DATAFORGE_CACHE_PATH ??
    path.join(process.cwd(), ".cairn", "cache.db");
  const dir = path.dirname(file);
  if (!isVercel && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new Database(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS groq_rate (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  return db;
}

/** Persist the most recent rate-limit observation from a Groq response. */
export function recordGroqRate(rate: GroqRateInfo): void {
  getDb()
    .prepare(
      `INSERT INTO groq_rate (id, payload, updated_at) VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    )
    .run(JSON.stringify(rate), Date.now());
}

function readRate(): { payload: string; updated_at: number } | null {
  const row = getDb()
    .prepare("SELECT payload, updated_at FROM groq_rate WHERE id = 1")
    .get() as { payload: string; updated_at: number } | undefined;
  return row ?? null;
}

function ratio(remaining: number | null, limit: number | null): number | null {
  if (remaining === null || limit === null || limit <= 0) return null;
  return Math.max(0, Math.min(1, remaining / limit));
}

/** Min of the requests/day and tokens/min ratios, or 1 when unknown. */
export function groqRemainingRatio(now = Date.now()): number {
  const row = readRate();
  if (!row) return 1;
  // Ignore stale observations (older than 2 minutes — TPM resets fast).
  if (now - row.updated_at > 2 * 60 * 1000) return 1;
  try {
    const rate = JSON.parse(row.payload) as GroqRateInfo;
    const candidates = [
      ratio(rate.remainingRequests, rate.limitRequests),
      ratio(rate.remainingTokens, rate.limitTokens),
    ].filter((v): v is number => v !== null);
    if (candidates.length === 0) return 1;
    return Math.min(...candidates);
  } catch {
    return 1;
  }
}

/** True when Groq reports under ~20% headroom on either axis — queue instead. */
export function groqShouldQueue(now = Date.now()): boolean {
  return groqRemainingRatio(now) < QUEUE_THRESHOLD;
}