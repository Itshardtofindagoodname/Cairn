import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";

export interface MaintenanceResult {
  /** Only set for GitHub repos (the "is it being maintained?" component). */
  status: "github" | "none";
  lastPush: string | null;
  archived: boolean | null;
  detail: string | null;
}

/**
 * Maintenance signal for the Reproducibility Score.
 *
 * For GitHub repositories we use the GitHub API (no auth needed for public
 * repos): `GET repos/{owner}/{name}` → `pushed_at` + `archived`. Cached 24h.
 * For everything else the client falls back to the result's own `updatedAt`.
 */

let db: Database.Database | null = null;

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
    CREATE TABLE IF NOT EXISTS maintenance_cache (
      url_hash TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      checked_at INTEGER NOT NULL
    );
  `);
  return db;
}

function hash(url: string): string {
  return createHash("sha1").update(url).digest("hex");
}

/** Extract owner/name from a github.com URL, e.g. https://github.com/foo/bar. */
export function githubRepoFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
  } catch {
    /* not a URL */
  }
  return null;
}

interface GitHubRepoResponse {
  pushed_at?: string;
  archived?: boolean;
}

export async function getMaintenance(url: string): Promise<MaintenanceResult> {
  const repo = githubRepoFromUrl(url);
  if (!repo) return { status: "none", lastPush: null, archived: null, detail: null };

  const db = getDb();
  const key = hash(url);

  const row = db
    .prepare("SELECT payload, checked_at FROM maintenance_cache WHERE url_hash = ?")
    .get(key) as { payload: string; checked_at: number } | undefined;
  if (row && Date.now() - row.checked_at < CACHE_TTL_MS) {
    try {
      return JSON.parse(row.payload) as MaintenanceResult;
    } catch {
      /* fall through to refetch */
    }
  }

  let result: MaintenanceResult;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "Cairn/1.0" },
      cache: "no-store",
    });
    if (res.ok) {
      const data = (await res.json()) as GitHubRepoResponse;
      result = {
        status: "github",
        lastPush: data.pushed_at ?? null,
        archived: data.archived ?? false,
        detail: data.archived ? "archived — read-only" : "active repo",
      };
    } else {
      result = {
        status: "none",
        lastPush: null,
        archived: null,
        detail: "GitHub API unavailable",
      };
    }
  } catch {
    result = { status: "none", lastPush: null, archived: null, detail: null };
  }

  db.prepare(
    `INSERT INTO maintenance_cache (url_hash, payload, checked_at) VALUES (?, ?, ?)
     ON CONFLICT(url_hash) DO UPDATE SET payload = excluded.payload, checked_at = excluded.checked_at`,
  ).run(key, JSON.stringify(result), Date.now());

  return result;
}