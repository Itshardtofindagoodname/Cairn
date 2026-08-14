"use client";

import { Search, X } from "lucide-react";
import { Spinner } from "./Spinner";

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (query: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export function SearchBar({
  value,
  onChange,
  onSubmit,
  disabled,
  placeholder = "Search datasets, models, papers & code across 8 sources…",
}: SearchBarProps) {
  const submit = () => {
    if (value.trim()) onSubmit(value);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="group relative"
    >
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        aria-label="Search open datasets, models, papers and code"
        className="w-full rounded-2xl border border-zinc-700/70 bg-zinc-900/70 py-4 pl-12 pr-28 text-base text-zinc-100 shadow-lg shadow-black/30 outline-none transition placeholder:text-zinc-500 focus:border-amber-500/60 focus:bg-zinc-900 focus:ring-4 focus:ring-amber-500/10"
      />
      <Search
        className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-500"
        aria-hidden
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            onSubmit("");
          }}
          aria-label="Clear search"
          title="Clear search"
          className="absolute right-28 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      )}
      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
      >
        {disabled ? (
          <span className="flex items-center gap-2">
            <Spinner className="h-3.5 w-3.5" />
            Searching
          </span>
        ) : (
          "Search"
        )}
      </button>
    </form>
  );
}
