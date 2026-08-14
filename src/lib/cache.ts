import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

const TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

let db: Database.Database | null = null;

/**
 * File-based SQLite cache (better-sqlite3, zero infra).
 * On Vercel the filesystem is ephemeral, so we use /tmp there —
 * the cache just lives for the lifetime of a lambda instance.
 */
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
    CREATE TABLE IF NOT EXISTS cache (
      key TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

export function cacheGet(key: string): string | null {
  const row = getDb()
    .prepare("SELECT payload, created_at FROM cache WHERE key = ?")
    .get(key) as { payload: string; created_at: number } | undefined;
  if (!row) return null;
  if (Date.now() - row.created_at > TTL_MS) {
    getDb().prepare("DELETE FROM cache WHERE key = ?").run(key);
    return null;
  }
  return row.payload;
}

export function cacheSet(key: string, payload: string): void {
  getDb()
    .prepare(
      `INSERT INTO cache (key, payload, created_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         payload = excluded.payload,
         created_at = excluded.created_at`,
    )
    .run(key, payload, Date.now());
}
