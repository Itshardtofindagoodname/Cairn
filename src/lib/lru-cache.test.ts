import { describe, expect, it } from "@jest/globals";
import { LruCache } from "./lru-cache";

describe("LruCache", () => {
  it("stores and retrieves values", () => {
    const cache = new LruCache<string>(10);
    expect(cache.get("a")).toBeUndefined();
    cache.set("a", "1");
    expect(cache.get("a")).toBe("1");
    expect(cache.has("a")).toBe(true);
    expect(cache.size).toBe(1);
  });

  it("updates an existing key in place without growing", () => {
    const cache = new LruCache<string>(10);
    cache.set("a", "1");
    cache.set("a", "2");
    expect(cache.size).toBe(1);
    expect(cache.get("a")).toBe("2");
  });

  it("evicts the least-recently-used entry past capacity", () => {
    const cache = new LruCache<string>(2);
    cache.set("a", "1", 100);
    cache.set("b", "2", 200);
    cache.set("c", "3", 300);
    expect(cache.has("a")).toBe(false);
    expect(cache.has("b")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("refreshes recency on get so hot keys survive eviction", () => {
    const cache = new LruCache<string>(2);
    cache.set("a", "1", 100);
    cache.set("b", "2", 200);
    expect(cache.get("a", 300)).toBe("1");
    cache.set("c", "3", 400);
    expect(cache.has("b")).toBe(false);
    expect(cache.has("a")).toBe(true);
    expect(cache.has("c")).toBe(true);
  });

  it("tracks the current size", () => {
    const cache = new LruCache<number>(3);
    expect(cache.size).toBe(0);
    cache.set("x", 1);
    cache.set("y", 2);
    expect(cache.size).toBe(2);
  });
});