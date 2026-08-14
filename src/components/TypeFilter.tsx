"use client";

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { TYPE_FILTERS, TYPE_FILTER_LABELS, type TypeFilter } from "@/lib/types";

interface TypeFilterProps {
  value: TypeFilter;
  onChange: (value: TypeFilter) => void;
}

export function TypeFilter({ value, onChange }: TypeFilterProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as TypeFilter);
      }}
      aria-label="Filter by result type"
      className="inline-flex h-9 items-center gap-0.5 rounded-xl border border-zinc-700/70 bg-zinc-900/70 p-1 shadow-lg shadow-black/30"
    >
      {TYPE_FILTERS.map((t) => (
        <ToggleGroup.Item
          key={t}
          value={t}
          aria-label={`Show ${TYPE_FILTER_LABELS[t].toLowerCase()}`}
          className="inline-flex h-full cursor-pointer items-center rounded-lg px-2.5 text-xs font-medium text-zinc-400 outline-none transition data-[state=on]:bg-zinc-700 data-[state=on]:text-zinc-100 hover:data-[state=off]:text-zinc-200"
        >
          {TYPE_FILTER_LABELS[t]}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}