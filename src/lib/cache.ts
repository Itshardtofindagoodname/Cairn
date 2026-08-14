import Database from "better-sqlite3";
import { initSqlite } from "./sqlite";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

let db: Database.Database | null = null;

/**
 * File-based SQLite cache (better-sqlite3, zero infra).
 * On Vercel the filesystem is ephemeral, so we use /tmp there —
 * the cache just lives for the lifetime of a lambda instance.
 * If the DB can't be opened the cache degrades to a no-op: callers get
 * null/void and fetch live from each source instead of crashing.
 */
function getDb(): Database.Database | null {
  if (!db) {
    db = initSqlite(`
      CREATE TABLE IF NOT EXISTS cache (
        key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export function cacheGet(key: string): string | null {
  try {
    const handle = getDb();
    if (!handle) return null;
    const row = handle
      .prepare("SELECT payload, created_at FROM cache WHERE key = ?")
      .get(key) as { payload: string; created_at: number } | undefined;
    if (!row) return null;
    if (Date.now() - row.created_at > TTL_MS) {
      handle.prepare("DELETE FROM cache WHERE key = ?").run(key);
      return null;
    }
    return row.payload;
  } catch (err) {
    console.error(
      `[cache read failed] ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}

export function cacheSet(key: string, payload: string): void {
  try {
    const handle = getDb();
    if (!handle) return;
    handle
      .prepare(
        `INSERT INTO cache (key, payload, created_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           payload = excluded.payload,
           created_at = excluded.created_at`,
      )
      .run(key, payload, Date.now());
  } catch (err) {
    console.error(
      `[cache write failed] ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Close the underlying SQLite handle. Primarily for tests/hot-reload. */
export function closeCache(): void {
  if (db) {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    db = null;
  }
}
