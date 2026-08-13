import type { NextRequest } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { rankBatch } from "@/lib/ranking";
import { SOURCES, SourceRateLimitedError, type SourceAdapter } from "@/sources";
import type { SourceId, SourceResult } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * GET /api/search?q=...&source=... — SSE stream.
 *
 * Fans out to every source in parallel and pushes each source's normalized,
 * RANKED results as they arrive. Ranking is a per-batch streaming post-process
 * (each batch is scored the moment it's ready), never a final blocking step.
 *
 * `source` (optional): scope to a single source (e.g. ?source=arxiv). When set,
 * the OTHER sources are not even fetched — a real latency win, not a
 * fetch-then-hide filter.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 120);
  const sourceParam = (params.get("source") ?? "").trim().toLowerCase();

  if (!q) {
    return new Response(sse("error", { message: "Missing query" }) as unknown as BodyInit, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const activeSources = sourceParam
    ? SOURCES.filter((s) => s.id === sourceParam)
    : SOURCES;
  if (activeSources.length === 0) {
    return new Response(sse("error", { message: `Unknown source: ${sourceParam}` }) as unknown as BodyInit, {
      headers: { "Content-Type": "text/event-stream" },
    });
  }

  const overall = new AbortController();
  let closed = false;
  let finished = false;

  const underlyingSource: UnderlyingDefaultSource = {
    start(controller) {
      const pending = new Set<SourceId>(activeSources.map((s) => s.id));

      const push = (event: string, data: unknown) => {
        if (!closed) {
          try {
            controller.enqueue(sse(event, data));
          } catch {
            // client went away
          }
        }
      };

      const finish = () => {
        if (finished) return;
        finished = true;
        push("done", { sources: [...pending] });
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const runSource = async (adapter: SourceAdapter) => {
        try {
          const cacheKey = `${adapter.id}:${q.toLowerCase()}`;
          let results: SourceResult[] | null = null;
          const cached = cacheGet(cacheKey);
          if (cached) {
            results = JSON.parse(cached) as SourceResult[];
          } else {
            results = await adapter.search(q, overall.signal);
            cacheSet(cacheKey, JSON.stringify(results));
          }

          // Streaming post-process: rank this batch before pushing it.
          const ranked = rankBatch(q, results);

          push("source-status", {
            source: adapter.id,
            status: "ok",
            count: ranked.length,
          });
          push("source-result", { source: adapter.id, results: ranked });
        } catch (err) {
          if (overall.signal.aborted) return;
          if (err instanceof SourceRateLimitedError) {
            push("source-status", {
              source: adapter.id,
              status: "rate-limited",
              message: err.message,
              count: 0,
            });
          } else {
            const message =
              err instanceof Error ? err.message : "Unknown error";
            push("source-status", {
              source: adapter.id,
              status: "error",
              message,
              count: 0,
            });
          }
        } finally {
          pending.delete(adapter.id);
          if (pending.size === 0) finish();
        }
      };

      void Promise.allSettled(activeSources.map((adapter) => runSource(adapter))).then(
        () => {
          // Safety net: never leave the stream hanging if a bug slipped through.
          setTimeout(() => {
            if (!finished) finish();
          }, 2000);
        },
      );
    },
    cancel() {
      // Browser disconnected — stop all upstream work.
      overall.abort();
      closed = true;
      finished = true;
    },
  };

  const stream = new ReadableStream(underlyingSource);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      Connection: "keep-alive",
    },
  });
}
