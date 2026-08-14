import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

let resolvedPath: string | null = null;

/**
 * True when running inside a Vercel serverless/lambda runtime. Vercel sets
 * `VERCEL=1` on every deployment (plus `VERCEL_ENV=production|preview|…`).
 */
export function isVercel(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

/**
 * Resolve the SQLite cache file location.
 *
 * Vercel only guarantees `/tmp` as writable (and it is ephemeral, per
 * instance), so the default resolves to `/tmp/dataforge/cache.db` there —
 * never a repo-relative path like `.cairn/cache.db` that assumes a
 * persistent local filesystem. An explicit CAIRN_CACHE_PATH or the legacy
 * DATAFORGE_CACHE_PATH env var always wins.
 */
export function resolveCachePath(): string {
  if (resolvedPath) return resolvedPath;
  const explicit =
    process.env.CAIRN_CACHE_PATH ?? process.env.DATAFORGE_CACHE_PATH;
  if (explicit) {
    resolvedPath = explicit;
  } else if (isVercel()) {
    resolvedPath = path.join("/tmp", "dataforge", "cache.db");
  } else {
    resolvedPath = path.join(process.cwd(), ".cairn", "cache.db");
  }
  return resolvedPath;
}

/**
 * Open the shared SQLite database: ensure the parent directory exists first
 * (Vercel cold starts have no prior /tmp state), then open and apply schema.
 *
 * Any failure — unwritable directory, corrupt file, native module problem —
 * is caught and logged with the `[cache init failed]` tag so callers can
 * DEGRADE to running without caching. The cache is an optimization, never a
 * hard dependency of a search.
 */
export function initSqlite(schema: string): Database.Database | null {
  try {
    const file = resolveCachePath();
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file);
    db.exec(schema);
    return db;
  } catch (err) {
    console.error(
      `[cache init failed] SQLite cache unavailable — running without caching: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
