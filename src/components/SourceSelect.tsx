"use client";

import * as Select from "@radix-ui/react-select";
import { Check, ChevronDown, Globe2 } from "lucide-react";
import { SOURCE_IDS, type SourceId } from "@/lib/types";
import { SOURCE_META } from "./sourceMeta";

export type SourceScope = "all" | SourceId;

interface SourceSelectProps {
  value: SourceScope;
  onChange: (scope: SourceScope) => void;
  /** When false, the Kaggle option is hidden (no shared key configured). */
  kaggleAvailable?: boolean;
}

export function SourceSelect({
  value,
  onChange,
  kaggleAvailable = true,
}: SourceSelectProps) {
  const scopes = SOURCE_IDS.filter((id) => kaggleAvailable || id !== "kaggle");
  const effectiveValue =
    !kaggleAvailable && value === "kaggle" ? "all" : value;
  const selected = effectiveValue === "all" ? null : SOURCE_META[effectiveValue];

  return (
    <Select.Root
      value={effectiveValue}
      onValueChange={(v) => onChange(v as SourceScope)}
    >
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
        <Select.Icon>
          <ChevronDown className="h-4 w-4 text-zinc-500" aria-hidden />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[180px] overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 p-1 shadow-xl shadow-black/40"
        >
          <Select.Viewport>
            <Select.Item
              value="all"
              className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-200 outline-none transition select-none data-[highlighted]:bg-zinc-700/70"
            >
              <Globe2 className="h-4 w-4 text-amber-400" aria-hidden />
              <Select.ItemText>All sources</Select.ItemText>
              <Select.ItemIndicator className="ml-auto">
                <Check className="h-4 w-4 text-amber-400" aria-hidden />
              </Select.ItemIndicator>
            </Select.Item>
            {scopes.map((id) => {
              const meta = SOURCE_META[id];
              return (
                <Select.Item
                  key={id}
                  value={id}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-zinc-200 outline-none transition select-none data-[highlighted]:bg-zinc-700/70"
                >
                  <meta.icon className={`h-4 w-4 ${meta.text}`} aria-hidden />
                  <Select.ItemText>{meta.label}</Select.ItemText>
                  <Select.ItemIndicator className="ml-auto">
                    <Check className="h-4 w-4 text-amber-400" aria-hidden />
                  </Select.ItemIndicator>
                </Select.Item>
              );
            })}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
