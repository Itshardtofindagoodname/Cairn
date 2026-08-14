import type { InsightOutcome, InsightRequest } from "@/lib/ai-insight";

/**
 * Client-side batching for AI Insight.
 *
 * Cards request insights on demand; requests are debounced 2s into a single
 * POST /api/insight so a page full of results costs one (or few) Groq calls.
 * Shared across components via a module-level queue.
 *
 * The server processes the batch in order and returns outcomes in the same
 * order, so the client matches by index — no key hashing needed in the browser.
 */

const pending = new Map<
  string,
  { req: InsightRequest; resolvers: ((o: InsightOutcome) => void)[] }
>();

let timer: ReturnType<typeof setTimeout> | null = null;
let inflight: Promise<void> | null = null;

/**
 * Module-level pub/sub so the "Refresh Insight" toolbar can re-fire every card
 * that is currently showing "Insight queued — Groq is busy right now."
 * Panels subscribe on mount; the toolbar calls `refreshQueuedInsights()`.
 */
type InsightRefreshListener = () => void;
const refreshListeners = new Set<InsightRefreshListener>();

export function subscribeInsightRefresh(fn: InsightRefreshListener): () => void {
  refreshListeners.add(fn);
  return () => {
    refreshListeners.delete(fn);
  };
}

export function refreshQueuedInsights(): void {
  for (const fn of [...refreshListeners]) fn();
}

export function requestInsight(req: InsightRequest): Promise<InsightOutcome> {
  const key = `${req.source}|${req.sourceId}`;
  const existing = pending.get(key);
  if (existing) {
    return new Promise<InsightOutcome>((resolve) => existing.resolvers.push(resolve));
  }
  const promise = new Promise<InsightOutcome>((resolve) =>
    pending.set(key, { req, resolvers: [resolve] }),
  );
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flush();
  }, 2000);
  return promise;
}

async function flush(): Promise<void> {
  timer = null;
  if (inflight) {
    await inflight;
    return;
  }
  const batch = [...pending.values()];
  pending.clear();
  if (batch.length === 0) return;

  inflight = (async () => {
    const results = batch.map((b) => b.req);
    let outcomes: InsightOutcome[] = [];
    try {
      const res = await fetch("/api/insight", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // AI Insight is a Discuss-mode feature; the API route rejects
          // requests that don't carry this marker (defense in depth).
          "x-cairn-mode": "discuss",
        },
        body: JSON.stringify({ results }),
      });
      if (!res.ok) throw new Error(`insight HTTP ${res.status}`);
      const data = (await res.json()) as { outcomes?: InsightOutcome[] };
      if (Array.isArray(data.outcomes)) outcomes = data.outcomes;
    } catch {
      outcomes = [];
    }
    batch.forEach((b, i) => {
      const outcome = outcomes[i] ?? { status: "error" as const };
      b.resolvers.forEach((r) => r(outcome));
    });
  })();

  try {
    await inflight;
  } finally {
    inflight = null;
    if (timer === null && pending.size > 0) {
      // New requests arrived mid-flight — flush them too.
      timer = setTimeout(() => void flush(), 200);
    }
  }
}