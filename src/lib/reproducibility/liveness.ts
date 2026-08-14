import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export type LivenessStatus = "up" | "down" | "unknown";

export interface LivenessResult {
  status: LivenessStatus;
  latencyMs: number | null;
}

/**
 * Reachability probe for the Reproducibility Score's "liveness" component.
 * Performs a cheap HEAD request (3s timeout) against the result's own URL and
 * caches the answer in SQLite for 24 hours so repeat searches don't hammer
 * upstream hosts.
 */

let db: Database.Database | null = null;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 3000;

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
    CREATE TABLE IF NOT EXISTS liveness_cache (
      url_hash TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      latency_ms INTEGER,
      checked_at INTEGER NOT NULL
    );
  `);
  return db;
}

function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

function readCache(hash: string): { status: LivenessStatus; latency_ms: number | null } | null {
  const row = getDb()
    .prepare("SELECT status, latency_ms FROM liveness_cache WHERE url_hash = ?")
    .get(hash) as { status: LivenessStatus; latency_ms: number | null } | undefined;
  if (!row) return null;
  return { status: row.status, latency_ms: row.latency_ms };
}

export async function checkLiveness(url: string): Promise<LivenessResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "unknown", latencyMs: null };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: "unknown", latencyMs: null };
  }

  const hash = urlHash(url);
  const db = getDb();

  const row = db
    .prepare("SELECT checked_at FROM liveness_cache WHERE url_hash = ?")
    .get(hash) as { checked_at: number } | undefined;
  if (row && Date.now() - row.checked_at < CACHE_TTL_MS) {
    const cached = readCache(hash);
    if (cached) return { status: cached.status, latencyMs: cached.latency_ms };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();
  let status: LivenessStatus = "unknown";
  let latencyMs: number | null = null;
  try {
    const res = await fetch(parsed, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    latencyMs = Date.now() - start;
    status = res.ok || res.status === 401 || res.status === 403 ? "up" : "down";
  } catch {
    status = "unknown";
  } finally {
    clearTimeout(timer);
  }

  db.prepare(
    `INSERT INTO liveness_cache (url_hash, status, latency_ms, checked_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(url_hash) DO UPDATE SET status = excluded.status, latency_ms = excluded.latency_ms, checked_at = excluded.checked_at`,
  ).run(hash, status, latencyMs, Date.now());

  return { status, latencyMs };
}