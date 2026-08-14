"use client";

import { RefreshCw, X } from "lucide-react";

interface InterpretChipProps {
  terms: string[];
  explanation: string;
  onDismiss: () => void;
  onReinterpret: () => void;
  disabled: boolean;
}

export function InterpretChip({
  terms,
  explanation,
  onDismiss,
  onReinterpret,
  disabled,
}: InterpretChipProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-xs text-violet-200">
      <span className="flex items-center gap-1.5 font-medium">
        <RefreshCw className="h-3.5 w-3.5 text-violet-300" aria-hidden />
        Interpreted as:
      </span>
      <span className="flex flex-wrap gap-1">
        {terms.map((term, i) => (
          <span
            key={term}
            className="rounded-md bg-violet-500/20 px-1.5 py-0.5 font-mono text-[11px] text-violet-100"
          >
            {i > 0 ? "+" : ""}
            {term}
          </span>
        ))}
      </span>
      {explanation && (
        <span className="hidden text-violet-300/80 sm:inline">· {explanation}</span>
      )}
      <span className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onReinterpret}
          disabled={disabled}
          className="rounded-md px-1.5 py-0.5 text-violet-300 transition hover:bg-violet-500/20 hover:text-violet-100 disabled:opacity-50"
        >
          Re-interpret
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss interpretation"
          className="rounded-md p-0.5 text-violet-300 transition hover:bg-violet-500/20 hover:text-violet-100"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      </span>
    </div>
  );
}