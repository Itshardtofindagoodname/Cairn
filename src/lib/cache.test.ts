import { describe, expect, it, beforeEach, afterEach } from "@jest/globals";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Cold-start simulation for the SQLite cache on Vercel.
 *
 * cache.ts and sqlite.ts keep their singletons (db handle, resolved path) at
 * module scope — exactly like a lambda instance that warms up once and then
 * reuses them. To simulate a fresh instance we reset the module registry
 * before each case, mirroring a cold start where /tmp has no prior state.
 */

const ENV_KEYS = [
  "VERCEL",
  "VERCEL_ENV",
  "CAIRN_CACHE_PATH",
  "DATAFORGE_CACHE_PATH",
] as const;

function withEnv(
  values: Partial<Record<(typeof ENV_KEYS)[number], string>>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const saved = new Map<(typeof ENV_KEYS)[number], string | undefined>();
  for (const key of ENV_KEYS) {
    saved.set(key, process.env[key]);
    if (values[key] === undefined) delete process.env[key];
    else process.env[key] = values[key];
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const key of ENV_KEYS) {
        const prev = saved.get(key);
        if (prev === undefined) delete process.env[key];
        else process.env[key] = prev;
      }
    });
}

/** Reload cache.ts (and its sqlite.ts dependency) as a fresh module graph. */
async function freshCache(): Promise<typeof import("./cache")> {
  jest.resetModules();
  return import("./cache");
}

/** Reload sqlite.ts as a fresh module graph. */
async function freshSqlite(): Promise<typeof import("./sqlite")> {
  jest.resetModules();
  return import("./sqlite");
}

describe("cache cold start (Vercel-like)", () => {
  let tmpRoot: string;
  let lastCache: typeof import("./cache") | null = null;

  beforeEach(() => {
    tmpRoot = mkdtempSync(path.join(os.tmpdir(), "cairn-cache-test-"));
    lastCache = null;
  });

  afterEach(() => {
    // Release the SQLite handle before deleting temp files (Windows refuses
    // to remove an open database file).
    lastCache?.closeCache();
    lastCache = null;
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("resolves to /tmp/dataforge/cache.db on Vercel when no env override is set", async () => {
    withEnv({ VERCEL: "1", VERCEL_ENV: "production" }, async () => {
      const { resolveCachePath: resolve } = await freshSqlite();
      expect(resolve()).toBe(path.join("/tmp", "dataforge", "cache.db"));
    });
  });

  it("resolves to the repo-relative .cairn path locally (no Vercel env)", async () => {
    withEnv({}, async () => {
      const { resolveCachePath: resolve } = await freshSqlite();
      expect(resolve()).toBe(path.join(process.cwd(), ".cairn", "cache.db"));
    });
  });

  it("cold start with a missing directory creates it and round-trips", async () => {
    const dbPath = path.join(tmpRoot, "fresh", "subdir", "cache.db");
    await withEnv({ VERCEL: "1", DATAFORGE_CACHE_PATH: dbPath }, async () => {
      const cache = await freshCache();
      lastCache = cache;
      expect(cache.cacheGet("a")).toBeNull();
      cache.cacheSet("a", JSON.stringify([1, 2, 3]));
      expect(cache.cacheGet("a")).toBe(JSON.stringify([1, 2, 3]));
    });
  });

  it("degrades to null (no throw) when the cache directory cannot be created", async () => {
    // Make the parent path unwritable-in-effect: dirname is an existing file,
    // so mkdirSync throws before the Database is ever opened.
    const blocker = path.join(tmpRoot, "blocker");
    writeFileSync(blocker, "not a directory");
    const dbPath = path.join(blocker, "cache.db");
    await withEnv({ VERCEL: "1", DATAFORGE_CACHE_PATH: dbPath }, async () => {
      const cache = await freshCache();
      lastCache = cache;
      expect(() => cache.cacheGet("a")).not.toThrow();
      expect(cache.cacheGet("a")).toBeNull();
      expect(() => cache.cacheSet("a", "x")).not.toThrow();
    });
  });

  it("cold start still returns a value from a pre-existing /tmp database", async () => {
    const existing = path.join(tmpRoot, "warm");
    const { initSqlite } = await freshSqlite();
    // Prime a "previous instance's" database.
    await withEnv(
      { DATAFORGE_CACHE_PATH: path.join(existing, "cache.db") },
      async () => {
        const db = initSqlite(
          "CREATE TABLE IF NOT EXISTS cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at INTEGER NOT NULL);",
        );
        db?.prepare(
          "INSERT INTO cache (key, payload, created_at) VALUES (?, ?, ?)",
        ).run("warm", "payload", Date.now());
        db?.close();
      },
    );

    await withEnv(
      { VERCEL: "1", DATAFORGE_CACHE_PATH: path.join(existing, "cache.db") },
      async () => {
        const cache = await freshCache();
        lastCache = cache;
        expect(cache.cacheGet("warm")).toBe("payload");
      },
    );
  });
});

describe("resolveCachePath", () => {
  it("prefers CAIRN_CACHE_PATH over DATAFORGE_CACHE_PATH", async () => {
    await withEnv(
      { CAIRN_CACHE_PATH: "/a/cache.db", DATAFORGE_CACHE_PATH: "/b/cache.db" },
      async () => {
        const { resolveCachePath: resolve } = await freshSqlite();
        expect(resolve()).toBe("/a/cache.db");
      },
    );
  });
});
