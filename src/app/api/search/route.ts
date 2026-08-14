import type { NextRequest } from "next/server";
import { cacheGet, cacheSet } from "@/lib/cache";
import { rankBatch } from "@/lib/ranking";
import { searchLru } from "@/lib/lru-cache";
import { expandQuery } from "@/lib/intent";
import {
  SOURCES,
  SourceRateLimitedError,
  SourceHandoffError,
  type SourceAdapter,
} from "@/sources";
import {
  TYPE_FILTERS,
  type SourceId,
  type SourceResult,
  type TypeFilter,
} from "@/lib/types";
import type { SourceAuthContext } from "@/sources/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 45;

const encoder = new TextEncoder();

function sse(event: string, data: unknown): Uint8Array {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const sseHeaders: Record<string, string> = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
};

interface SearchRequest {
  q?: string;
  source?: string;
  type?: string;
  expand?: boolean;
  fresh?: boolean;
  kaggle?: { username?: string; key?: string } | null;
}

function validType(raw: string | undefined | null): TypeFilter {
  if (raw && (TYPE_FILTERS as readonly string[]).includes(raw)) {
    return raw as TypeFilter;
  }
  return "all";
}

async function parseRequest(request: NextRequest): Promise<SearchRequest> {
  const params = request.nextUrl.searchParams;
  let body: Partial<SearchRequest> = {};
  if (request.method === "POST") {
    body = (await request.json().catch(() => ({}))) as Partial<SearchRequest>;
  }
  const kaggleUsername =
    body.kaggle?.username?.trim() || request.headers.get("x-cairn-kaggle-username")?.trim();
  const kaggleKey =
    body.kaggle?.key?.trim() || request.headers.get("x-cairn-kaggle-key")?.trim();
  return {
    q: (body.q ?? params.get("q") ?? "").toString().trim().slice(0, 120),
    source: (body.source ?? params.get("source") ?? "")
      .toString()
      .trim()
      .toLowerCase(),
    type: (body.type ?? params.get("type") ?? "all").toString().trim().toLowerCase(),
    expand: body.expand === true || params.get("expand") === "1",
    fresh: body.fresh === true || params.get("fresh") === "1",
    kaggle:
      kaggleUsername && kaggleKey
        ? { username: kaggleUsername, key: kaggleKey }
        : null,
  };
}

async function handle(request: NextRequest) {
  const { q, source: sourceParam, type: typeParam, expand, fresh, kaggle } =
    await parseRequest(request);
  const typeFilter = validType(typeParam);

  if (!q) {
    return new Response(
      sse("error", { message: "Missing query" }) as unknown as BodyInit,
      { headers: sseHeaders },
    );
  }

  const activeSources = sourceParam
    ? SOURCES.filter((s) => s.id === sourceParam)
    : SOURCES;
  if (activeSources.length === 0) {
    return new Response(
      sse("error", { message: `Unknown source: ${sourceParam}` }) as unknown as BodyInit,
      { headers: sseHeaders },
    );
  }

  const auth: SourceAuthContext = { kaggle };
  const overall = new AbortController();

  const underlyingSource: UnderlyingDefaultSource = {
    start(controller) {
      let closed = false;
      let finished = false;

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
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      void (async () => {
        const signal = overall.signal;

        // Kick off intent expansion in parallel with the term-0 fan-out so a
        // Groq round-trip never delays the first results.
        const expansionPromise = expand
          ? expandQuery(q, { signal, fresh })
          : Promise.resolve(null);

        // Accumulate per-source across every expansion term; each source's
        // term-0 results are streamed the moment they land so the client shows
        // them without waiting for the slowest provider.
        const accumulated = new Map<SourceId, SourceResult[]>();
        const term0Counts = new Map<SourceId, number>();

        const runSource = async (adapter: SourceAdapter, term: string, isFirst: boolean) => {
          if (signal.aborted) return;
          try {
            const cacheKey = `${adapter.id}:${term.toLowerCase()}:${typeFilter}`;
            let results = searchLru.get(cacheKey) as SourceResult[] | undefined;
            if (!results) {
              const sqlite = cacheGet(cacheKey);
              if (sqlite) {
                results = JSON.parse(sqlite) as SourceResult[];
              } else {
                results = await adapter.search(term, signal, auth);
                cacheSet(cacheKey, JSON.stringify(results));
              }
              searchLru.set(cacheKey, results);
            }
            // Server-side result-type filter (AND-combined with provider scope).
            const filtered =
              typeFilter === "all"
                ? results
                : results.filter((r) => r.type === typeFilter);
            accumulated.set(adapter.id, [
              ...(accumulated.get(adapter.id) ?? []),
              ...filtered,
            ]);
            if (isFirst) {
              // Emit this source's results immediately instead of waiting for
              // every provider to finish — the client renders each batch as it
              // streams in, keeping slow sources' results out of the critical
              // path.
              const ranked = rankBatch(term, filtered);
              term0Counts.set(adapter.id, filtered.length);
              push("source-status", {
                source: adapter.id,
                status: "ok",
                count: ranked.length,
              });
              push("source-result", { source: adapter.id, results: ranked });
            }
          } catch (err) {
            if (signal.aborted) return;
            if (!isFirst) return; // failures on expansion terms are silent
            if (err instanceof SourceRateLimitedError) {
              push("source-status", {
                source: adapter.id,
                status: "rate-limited",
                message: err.message,
                count: 0,
              });
            } else if (err instanceof SourceHandoffError) {
              push("source-status", {
                source: adapter.id,
                status: "handoff",
                message: err.message,
                count: 0,
              });
            } else {
              push("source-status", {
                source: adapter.id,
                status: "error",
                message: err instanceof Error ? err.message : "Unknown error",
                count: 0,
              });
            }
          }
        };

        // Term 0 = the user's literal query, always.
        await Promise.allSettled(activeSources.map((s) => runSource(s, q, true)));

        // Then any intent expansion, if Groq answered (silent fallback otherwise).
        const expansion = await expansionPromise;
        if (expansion && expansion.terms.length > 1 && !signal.aborted) {
          push("expansion", {
            terms: expansion.terms,
            explanation: expansion.explanation,
          });
          for (const term of expansion.terms.slice(1)) {
            if (signal.aborted) break;
            await Promise.allSettled(activeSources.map((s) => runSource(s, term, false)));
          }
        }

        // Re-emit only the sources whose result set grew after intent
        // expansion; term-0 results were already streamed above. Updated
        // source-status keeps the count badge in sync with the richer results.
        for (const adapter of activeSources) {
          if (signal.aborted) return;
          const all = accumulated.get(adapter.id) ?? [];
          if (all.length === 0) continue;
          if ((term0Counts.get(adapter.id) ?? 0) === all.length) continue;
          const ranked = rankBatch(q, all);
          push("source-status", {
            source: adapter.id,
            status: "ok",
            count: ranked.length,
          });
          push("source-result", { source: adapter.id, results: ranked });
        }

        push("done", { sources: activeSources.map((s) => s.id) });
        finish();
      })().catch(() => finish());
    },
    cancel() {
      overall.abort();
    },
  };

  const stream = new ReadableStream(underlyingSource);
  return new Response(stream, { headers: sseHeaders });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}