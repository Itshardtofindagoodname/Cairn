"use client";

import * as Popover from "@radix-ui/react-popover";
import { Gauge } from "lucide-react";
import type { RankBreakdown } from "@/lib/types";

function Bar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span>{label}</span>
        <span className="font-mono text-zinc-200">{value.toFixed(2)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700/60">
        <div
          className="h-full rounded-full bg-amber-400/80"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** Score breakdown popover — the ranking formula made visible on every card. */
export function ScorePopover({ rank }: { rank: RankBreakdown }) {
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={`Ranked ${rank.total.toFixed(2)} out of 1`}
          className="inline-flex cursor-help items-center gap-1.5 rounded-md bg-zinc-800/80 px-2 py-0.5 text-[11px] font-medium text-amber-300 transition hover:bg-zinc-700/80"
        >
          <Gauge className="h-3.5 w-3.5" aria-hidden />
          {rank.total.toFixed(2)}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          sideOffset={6}
          className="z-50 w-56 rounded-xl border border-zinc-700 bg-zinc-800 p-3 shadow-lg shadow-black/30"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-100">How it ranked</span>
            <span className="rounded bg-amber-400/15 px-1.5 py-0.5 font-mono text-[11px] text-amber-300">
              {rank.total.toFixed(2)}
            </span>
          </div>
          <div className="space-y-2.5">
            <Bar label="Relevance (TF-IDF)" value={rank.relevance} />
            <Bar label="Authority" value={rank.authority} />
            <Bar label="Recency" value={rank.recency} />
          </div>
          <p className="mt-2.5 text-[10px] leading-relaxed text-zinc-500">
            Total = 0.5·relevance + 0.3·authority + 0.2·recency
          </p>
          <Popover.Arrow className="fill-zinc-700" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
