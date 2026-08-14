"use client";

import { motion } from "framer-motion";
import { AlertCircle, SearchX } from "lucide-react";
import type { MergedResult } from "@/lib/types";
import { ResultCard } from "./ResultCard";
import { Spinner } from "./Spinner";
import type { SearchMode } from "./ModeToggle";

interface ResultListProps {
  results: MergedResult[];
  phase: "idle" | "streaming" | "done";
  query: string;
  anyResults: boolean;
  allFailed?: boolean;
  sourceCount?: number;
  groqAvailable?: boolean;
  onAiInsightCapReached?: () => void;
  mode: SearchMode;
}

export function ResultList({
  results,
  phase,
  query,
  anyResults,
  allFailed = false,
  sourceCount = 0,
  groqAvailable = false,
  onAiInsightCapReached,
  mode,
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
      {results.map((result, i) => (
        <motion.div
          key={result.uid}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: "easeOut", delay: Math.min(i * 0.04, 0.4) }}
        >
          <ResultCard
            result={result}
            groqAvailable={groqAvailable}
            onAiInsightCapReached={onAiInsightCapReached}
            mode={mode}
          />
        </motion.div>
      ))}
    </div>
  );
}
