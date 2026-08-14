"use client";

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { MessageSquareText, Zap } from "lucide-react";

export type SearchMode = "basic" | "discuss";

const MODES: { value: SearchMode; label: string; icon: typeof Zap }[] = [
  { value: "basic", label: "Basic", icon: Zap },
  { value: "discuss", label: "Discuss", icon: MessageSquareText },
];

interface ModeToggleProps {
  value: SearchMode;
  onChange: (mode: SearchMode) => void;
}

export function ModeToggle({ value, onChange }: ModeToggleProps) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v as SearchMode);
      }}
      aria-label="Search mode"
      className="inline-flex h-11 shrink-0 items-center gap-0.5 rounded-2xl border border-zinc-700/70 bg-zinc-900/70 p-1 shadow-lg shadow-black/30"
    >
      {MODES.map((m) => (
        <ToggleGroup.Item
          key={m.value}
          value={m.value}
          aria-label={m.label}
          className="inline-flex h-full cursor-pointer items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-zinc-400 outline-none transition data-[state=on]:bg-amber-500 data-[state=on]:text-zinc-950 hover:data-[state=off]:text-zinc-200"
        >
          <m.icon className="h-4 w-4" aria-hidden />
          {m.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}