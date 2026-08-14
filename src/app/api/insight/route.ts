import type { NextRequest } from "next/server";
import {
  getAiInsight,
  type InsightRequest,
  type InsightOutcome,
} from "@/lib/ai-insight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/insight { results: InsightRequest[] }
 *
 * Produces AI Insight snapshots for a batch of results. The client debounces
 * (2s) so a single search that shows N cards issues one batched call here.
 * The server processes results sequentially — never in parallel — to keep the
 * free Groq tier's tokens/min quota well under control.
 *
 * Every outcome is a benign status (ok/queued/daily-limit/unavailable/error),
 * never an exception.
 */
export async function POST(request: NextRequest) {
  // Defense in depth: AI Insight is a Discuss-mode feature. Without the marker
  // that only the Discuss-mode client sends, this route is a no-op — so even a
  // direct hit while in Basic mode never reaches Groq or the insight cache.
  if (request.headers.get("x-cairn-mode") !== "discuss") {
    return Response.json({ outcomes: [] });
  }

  const body = (await request.json().catch(() => ({}))) as {
    results?: InsightRequest[];
  };
  const results = Array.isArray(body.results) ? body.results.slice(0, 20) : [];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40_000);

  const outcomes: InsightOutcome[] = [];
  try {
    for (const item of results) {
      if (controller.signal.aborted) break;
      outcomes.push(await getAiInsight(item, { signal: controller.signal }));
    }
  } finally {
    clearTimeout(timeout);
  }

  return Response.json({ outcomes });
}