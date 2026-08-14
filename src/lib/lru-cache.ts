/**
 * In-memory LRU cache that sits *above* the per-source SQLite cache.
 *
 * SQLite handles durability and cross-restart reuse; this layer handles
 * sub-millisecond hits for identical queries issued back-to-back (e.g. when
 * the user toggles the type filter and the fan-out re-runs with the same
 * provider selection). It is intentionally small (100 entries) and lives only
 * for the life of the server process.
 *
 * Cached per-source payloads are the *raw* results for a `query::source::type`
 * key — replays skip source fetches entirely, then merge/rank/dedupe runs as
 * normal so behavior stays identical to a cold fetch.
 */

interface LruEntry<V> {
  key: string;
  value: V;
  lastUsed: number;
}

export class LruCache<V> {
  private map = new Map<string, LruEntry<V>>();
  private readonly max: number;

  constructor(max = 100) {
    this.max = max;
  }

  get(key: string, now = Date.now()): V | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    entry.lastUsed = now;
    // Refresh recency order.
    this.map.delete(key);
    this.map.set(key, entry);
    return entry.value;
  }

  set(key: string, value: V, now = Date.now()): void {
    const existing = this.map.get(key);
    if (existing) {
      existing.value = value;
      existing.lastUsed = now;
      this.map.delete(key);
      this.map.set(key, existing);
      return;
    }
    if (this.map.size >= this.max) {
      const oldest = this.map.keys().next().value as string | undefined;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { key, value, lastUsed: now });
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }
}

export const searchLru = new LruCache<unknown>(100);