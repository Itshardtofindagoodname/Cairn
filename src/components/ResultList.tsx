"use client";

import { AlertCircle, SearchX } from "lucide-react";
import type { MergedResult } from "@/lib/types";
import { ResultCard } from "./ResultCard";
import { Spinner } from "./Spinner";

interface ResultListProps {
  results: MergedResult[];
  phase: "idle" | "streaming" | "done";
  query: string;
  anyResults: boolean;
  allFailed?: boolean;
  sourceCount?: number;
}

export function ResultList({
  results,
  phase,
  query,
  anyResults,
  allFailed = false,
  sourceCount = 0,
}: ResultListProps) {
  if (phase === "idle") return null;

  if (results.length === 0) {
    if (phase === "streaming") {
      return (
        <div className="flex items-center justify-center gap-3 py-16 text-sm text-zinc-500">
          <Spinner className="h-4 w-4" />
          {anyResults
            ? "Still waiting for more sources…"
            : `Searching ${sourceCount || "the"} sources in parallel…`}
        </div>
      );
    }
    if (allFailed) {
      return (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <AlertCircle className="h-8 w-8 text-amber-400" aria-hidden />
          <p className="text-lg font-medium text-zinc-300">All sources unavailable</p>
          <p className="max-w-sm text-sm text-zinc-500">
            None of the integrated providers answered for “{query}”. This is
            usually a temporary rate limit — try again in a moment.
          </p>
        </div>
      );
    }
    return (
      <div className="flex flex-col items-center gap-2 py-16 text-center">
        <SearchX className="h-8 w-8 text-zinc-600" aria-hidden />
        <p className="text-lg font-medium text-zinc-300">No results</p>
        <p className="max-w-sm text-sm text-zinc-500">
          Nothing matched “{query}”. Try a broader term or a different spelling.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {results.map((result) => (
        <ResultCard key={result.uid} result={result} />
      ))}
    </div>
  );
}
