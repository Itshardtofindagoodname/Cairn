"use client";

import { AlertCircle, CheckCircle2, Loader2, TimerReset, TriangleAlert } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { SourceId, SourceState } from "@/lib/types";
import { SOURCE_META } from "./sourceMeta";

const STATUS_TEXT: Record<SourceState["status"], string> = {
  pending: "waiting",
  streaming: "searching",
  ok: "ready",
  error: "unavailable",
  "rate-limited": "rate-limited",
  handoff: "connect account",
};

function StatusIcon({
  status,
  className,
}: {
  status: SourceState["status"];
  className: string;
}) {
  if (status === "pending" || status === "streaming") {
    return <Loader2 className={`animate-spin ${className}`} aria-hidden />;
  }
  if (status === "ok") {
    return <CheckCircle2 className={className} aria-hidden />;
  }
  if (status === "rate-limited") {
    return <TimerReset className={className} aria-hidden />;
  }
  if (status === "handoff") {
    return <TriangleAlert className={className} aria-hidden />;
  }
  return <AlertCircle className={className} aria-hidden />;
}

function StatusChip({
  source,
  state,
  onConnectKaggle,
}: {
  source: SourceId;
  state: SourceState;
  onConnectKaggle?: (source: SourceId) => void;
}) {
  const meta = SOURCE_META[source];
  const busy = state.status === "pending" || state.status === "streaming";
  const ok = state.status === "ok";
  const failed = state.status === "error";
  const rateLimited = state.status === "rate-limited";
  const handoff = state.status === "handoff";
  const dimmed = failed || rateLimited || handoff;
  const iconColor = dimmed ? "text-zinc-500" : meta.text;

  const content = (
    <div
      role="status"
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs transition ${
        handoff
          ? "cursor-pointer border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20"
          : dimmed
            ? "border-zinc-800 bg-zinc-900/50"
            : `${meta.bg} ${meta.border}`
      }`}
    >
      <StatusIcon status={state.status} className={`h-3.5 w-3.5 ${iconColor}`} />
      <span className={`font-medium ${ok || busy ? "text-zinc-200" : "text-zinc-400"}`}>
        {meta.label}
      </span>
      {ok && (
        <span
          className={`rounded px-1.5 py-px text-[10px] font-semibold ${meta.bg} ${meta.text}`}
        >
          {state.count}
        </span>
      )}
      <span className={`text-[11px] ${handoff ? "text-sky-300" : dimmed ? "text-zinc-500" : "text-zinc-500"}`}>
        {STATUS_TEXT[state.status]}
      </span>
    </div>
  );

  const wrapped = handoff ? (
    <button
      type="button"
      onClick={() => onConnectKaggle?.(source)}
      className="inline-flex"
    >
      {content}
    </button>
  ) : (
    content
  );

  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{wrapped}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="z-50 max-w-xs rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg shadow-black/30"
        >
          {handoff
            ? state.message ?? "Kaggle needs your own key — click to connect."
            : failed
              ? state.message ?? "Source unavailable."
              : rateLimited
                ? state.message ?? "Rate limit reached — try again later or add GITHUB_TOKEN."
                : `Searching ${meta.label}`}
          <Tooltip.Arrow className="fill-zinc-700" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function SourceTracker({
  states,
  sources,
  onConnectKaggle,
}: {
  states: Record<SourceId, SourceState>;
  sources: SourceId[];
  onConnectKaggle?: (source: SourceId) => void;
}) {
  return (
    <Tooltip.Provider>
      <div className="flex flex-wrap items-center gap-2">
        {sources.map((id) => (
          <StatusChip
            key={id}
            source={id}
            state={states[id]}
            onConnectKaggle={onConnectKaggle}
          />
        ))}
      </div>
    </Tooltip.Provider>
  );
}