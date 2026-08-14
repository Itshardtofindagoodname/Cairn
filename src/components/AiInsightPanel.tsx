"use client";

import { useEffect, useRef, useState } from "react";
import { Clock3, Loader2, Sparkles, WifiOff } from "lucide-react";
import type { InsightOutcome } from "@/lib/ai-insight";
import type { MergedResult } from "@/lib/types";
import { requestInsight } from "@/lib/insight-batcher";

interface AiInsightPanelProps {
  result: MergedResult;
  enabled: boolean;
  onReachedCap: () => void;
}

function panelFor(outcome: InsightOutcome | null, loading: boolean) {
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
        <Clock3 className="h-3.5 w-3.5" aria-hidden />
        Insight queued — Groq is busy right now. Try again in a moment.
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
  const [done, setDone] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (!enabled || startedRef.current) return;
    startedRef.current = true;
    const req = {
      source: result.origins[0].source,
      sourceId: result.origins[0].sourceId,
      title: result.title,
      description: result.description,
      snippet: result.origins[0].snippet,
      metadata: result.origins[0].metadata as Record<string, string | number | null>,
    };
    void requestInsight(req).then((o) => {
      setOutcome(o);
      setDone(true);
      if (o.status === "daily-limit") onReachedCap();
    });
  }, [enabled, result, onReachedCap]);

  if (!enabled) return null;

  const loading = !done;

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-3 py-2">
      <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-violet-300">
        <Sparkles className="h-3 w-3" aria-hidden />
        AI Insight
      </div>
      {panelFor(outcome, loading)}
    </div>
  );
}