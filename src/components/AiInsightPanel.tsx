"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Loader2, RefreshCw, Sparkles, WifiOff } from "lucide-react";
import type { InsightOutcome, InsightRequest } from "@/lib/ai-insight";
import type { MergedResult } from "@/lib/types";
import { requestInsight, subscribeInsightRefresh } from "@/lib/insight-batcher";

interface AiInsightPanelProps {
  result: MergedResult;
  enabled: boolean;
  onReachedCap: () => void;
}

function panelFor(
  outcome: InsightOutcome | null,
  loading: boolean,
  onRetry: () => void,
) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-violet-300">
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
        Asking an AI to vet this result…
      </div>
    );
  }
  if (outcome?.status === "queued") {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-zinc-400">
        <Clock3 className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          Insight queued — Groq is busy right now. Try again in a moment.
        </span>
        <button
          type="button"
          onClick={onRetry}
          aria-label="Retry AI insight for this result"
          title="Retry now"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-zinc-300 transition hover:border-violet-500/50 hover:text-violet-300"
        >
          <RefreshCw className="h-3 w-3" aria-hidden />
          Retry
        </button>
      </div>
    );
  }
  if (outcome?.status === "daily-limit") {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-zinc-400">
        <Clock3 className="h-3.5 w-3.5" aria-hidden />
        Daily AI insight limit reached — come back tomorrow.
      </div>
    );
  }
  if (outcome?.status === "unavailable" || outcome?.status === "error") {
    return (
      <div className="flex items-center gap-2 py-1 text-xs text-zinc-400">
        <WifiOff className="h-3.5 w-3.5" aria-hidden />
        Couldn&apos;t fetch an insight for this one.
      </div>
    );
  }
  if (outcome?.insight) {
    return (
      <div className="space-y-1 py-1">
        <p className="text-sm font-semibold text-violet-200">
          {outcome.insight.headline}
        </p>
        <p className="text-xs leading-relaxed text-zinc-400">
          {outcome.insight.detail}
        </p>
      </div>
    );
  }
  return null;
}

export function AiInsightPanel({ result, enabled, onReachedCap }: AiInsightPanelProps) {
  const [outcome, setOutcome] = useState<InsightOutcome | null>(null);
  const [loading, setLoading] = useState(false);
  const startedRef = useRef(false);

  const req = useMemo<InsightRequest>(
    () => ({
      source: result.origins[0].source,
      sourceId: result.origins[0].sourceId,
      title: result.title,
      description: result.description,
      snippet: result.origins[0].snippet,
      metadata: result.origins[0].metadata as Record<string, string | number | null>,
    }),
    [result],
  );

  const request = useCallback(() => {
    setLoading(true);
    void requestInsight(req).then((o) => {
      setOutcome(o);
      setLoading(false);
      if (o.status === "daily-limit") onReachedCap();
    });
  }, [req, onReachedCap]);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    request();
  }, [enabled, request]);

  // "Refresh Insight" toolbar action re-fires every card that is queued.
  useEffect(() => {
    if (!enabled) return;
    return subscribeInsightRefresh(() => {
      if (outcome?.status === "queued" && !loading) request();
    });
  }, [enabled, request, outcome, loading]);

  if (!enabled) return null;

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
        <Sparkles className="h-3 w-3" aria-hidden />
        AI Insight
      </div>
      {panelFor(outcome, loading, () => request())}
    </div>
  );
}
