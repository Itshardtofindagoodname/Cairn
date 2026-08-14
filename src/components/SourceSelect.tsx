"use client";

import * as Select from "@radix-ui/react-select";
import {
  AlertCircle,
  ChevronDown,
  Globe2,
  KeyRound,
  Loader2,
  TriangleAlert,
} from "lucide-react";
import { SOURCE_IDS, type SourceId, type SourceState } from "@/lib/types";
import { SOURCE_META } from "./sourceMeta";

export type SourceScope = "all" | SourceId;

interface SourceSelectProps {
  value: SourceScope;
  onChange: (scope: SourceScope) => void;
  /** When false, the Kaggle option is hidden (no shared key configured). */
  kaggleAvailable?: boolean;
  /** Per-source search status/counts, rendered inline in the dropdown. */
  states?: Record<SourceId, SourceState>;
  onConnectKaggle?: () => void;
  /** False before any search has run — hides the status spinners/checks. */
  active?: boolean;
}

function aggregateStatus(
  scopes: SourceId[],
  states: Record<SourceId, SourceState> | undefined,
): SourceState["status"] {
  const statuses = scopes.map((id) => states?.[id]?.status ?? "pending");
  if (statuses.length > 0 && statuses.every((s) => s === "ok")) return "ok";
  if (statuses.some((s) => s === "error")) return "error";
  if (statuses.some((s) => s === "rate-limited")) return "rate-limited";
  if (statuses.some((s) => s === "handoff")) return "handoff";
  if (statuses.some((s) => s === "streaming")) return "streaming";
  return "pending";
}

function StatusIcon({ status, title }: { status: SourceState["status"]; title?: string }) {
  // "ok" renders nothing — a settled count badge already conveys readiness.
  if (status === "ok") return null;
  const icon = (() => {
    if (status === "pending" || status === "streaming") {
      return <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" aria-hidden />;
    }
    if (status === "rate-limited") {
      return <TriangleAlert className="h-3.5 w-3.5 text-amber-400" aria-hidden />;
    }
    if (status === "handoff") {
      return <TriangleAlert className="h-3.5 w-3.5 text-sky-400" aria-hidden />;
    }
    return <AlertCircle className="h-3.5 w-3.5 text-red-400" aria-hidden />;
  })();
  return (
    <span title={title} className="inline-flex">
      {icon}
    </span>
  );
}

function CountBadge({ count, status }: { count: number; status: SourceState["status"] }) {
  // Don't claim "0" while a source is still pending/streaming — its count
  // isn't known yet. Once it settles (ok/error/rate-limited/handoff) show the
  // real number, including 0.
  if (status === "pending" || status === "streaming") return null;
  return (
    <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[11px] font-semibold text-zinc-300">
      {count}
    </span>
  );
}

export function SourceSelect({
  value,
  onChange,
  kaggleAvailable = true,
  states,
  onConnectKaggle,
  active = true,
}: SourceSelectProps) {
  const scopes = SOURCE_IDS.filter((id) => kaggleAvailable || id !== "kaggle");
  const effectiveValue = !kaggleAvailable && value === "kaggle" ? "all" : value;
  const selected = effectiveValue === "all" ? null : SOURCE_META[effectiveValue];

  const countOf = (id: SourceId) => states?.[id]?.count ?? 0;
  const totalCount = scopes.reduce((n, id) => n + countOf(id), 0);
  const allStatus = aggregateStatus(scopes, states);

  const triggerCount = effectiveValue === "all" ? totalCount : countOf(effectiveValue);
  const triggerStatus =
    effectiveValue === "all" ? allStatus : states?.[effectiveValue]?.status ?? "pending";
  const searching = triggerStatus === "pending" || triggerStatus === "streaming";

  return (
    <Select.Root value={effectiveValue} onValueChange={(v) => onChange(v as SourceScope)}>
      <Select.Trigger
        aria-label="Scope search to a single source"
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-2xl border border-zinc-700/70 bg-zinc-900/70 px-3.5 text-sm font-medium text-zinc-200 shadow-lg shadow-black/30 outline-none transition focus:border-amber-500/60 focus:ring-4 focus:ring-amber-500/10"
      >
        {selected ? (
          <selected.icon className={`h-4 w-4 ${selected.text}`} aria-hidden />
        ) : (
          <Globe2 className="h-4 w-4 text-amber-400" aria-hidden />
        )}
        <Select.Value placeholder="All sources" />
        {active &&
          triggerStatus !== "pending" &&
          triggerStatus !== "streaming" && (
            <CountBadge count={triggerCount} status={triggerStatus} />
          )}
        {active && searching && (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-500" aria-hidden />
        )}
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-zinc-500" aria-hidden />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[220px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl shadow-black/40"
        >
          <Select.Viewport>
            <Select.Item
              value="all"
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-200 outline-none transition select-none data-[highlighted]:bg-zinc-700/70"
            >
              <Globe2 className="h-4 w-4 text-amber-400" aria-hidden />
              <Select.ItemText>All sources</Select.ItemText>
              <span className="ml-auto flex items-center gap-2">
                {active && <CountBadge count={totalCount} status={allStatus} />}
                {active && <StatusIcon status={allStatus} />}
              </span>
            </Select.Item>
            {scopes.map((id) => {
              const meta = SOURCE_META[id];
              const status = states?.[id]?.status ?? "pending";
              return (
                <Select.Item
                  key={id}
                  value={id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-200 outline-none transition select-none data-[highlighted]:bg-zinc-700/70"
                >
                  <meta.icon className={`h-4 w-4 ${meta.text}`} aria-hidden />
                  <Select.ItemText>{meta.label}</Select.ItemText>
                  <span className="ml-auto flex items-center gap-2">
                    {active && (
                      <CountBadge count={countOf(id)} status={status} />
                    )}
                    {active && (
                      <StatusIcon status={status} title={states?.[id]?.message} />
                    )}
                  </span>
                </Select.Item>
              );
            })}
          </Select.Viewport>
          {onConnectKaggle && states?.kaggle?.status === "handoff" && (
            <div className="border-t border-zinc-800 p-1">
              <button
                type="button"
                onClick={onConnectKaggle}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-sky-300 transition hover:bg-zinc-700/70"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden />
                Kaggle needs your key — connect
              </button>
            </div>
          )}
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
