"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, RefreshCw } from "lucide-react";
import { refreshQueuedInsights } from "@/lib/insight-batcher";

export function InsightRefreshMenu() {
  const [open, setOpen] = useState(false);

  const refresh = () => {
    setOpen(false);
    refreshQueuedInsights();
  };

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Refresh AI insights"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700/70 bg-zinc-900/70 px-2.5 py-1.5 text-xs font-medium text-zinc-300 transition hover:border-violet-500/40 hover:text-violet-300"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden />
          Refresh Insight
          <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={6}
          className="z-50 w-64 rounded-xl border border-zinc-700 bg-zinc-800 p-1 shadow-lg shadow-black/30"
        >
          <button
            type="button"
            onClick={refresh}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-zinc-200 transition hover:bg-zinc-700"
          >
            <RefreshCw className="h-3.5 w-3.5 text-violet-300" aria-hidden />
            Retry all queued insights
          </button>
          <p className="px-2.5 pb-1.5 pt-1 text-[10px] leading-snug text-zinc-500">
            Re-fetches every card currently showing “Insight queued — Groq is
            busy right now.”
          </p>
          <Popover.Arrow className="fill-zinc-700" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
