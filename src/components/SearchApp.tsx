"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, List, Network } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { SourceTracker } from "./SourceTracker";
import { ResultList } from "./ResultList";
import { LicenseFilter } from "./LicenseFilter";
import { GraphView } from "./GraphView";
import { SourceSelect, type SourceScope } from "./SourceSelect";
import { mergeResults } from "@/lib/merge";
import { buildProvenanceGraph } from "@/lib/graph";
import { isCommerciallyUsable } from "@/lib/license";
import { SOURCE_IDS, type SourceId, type SourceResult, type SourceState } from "@/lib/types";

function emptyResults(): Record<SourceId, SourceResult[]> {
  return Object.fromEntries(
    SOURCE_IDS.map((id) => [id, [] as SourceResult[]]),
  ) as Record<SourceId, SourceResult[]>;
}

function initialStates(): Record<SourceId, SourceState> {
  return Object.fromEntries(
    SOURCE_IDS.map((id) => [id, { status: "pending", count: 0 } as SourceState]),
  ) as Record<SourceId, SourceState>;
}

const EXAMPLES = [
  "wikipedia",
  "sentiment analysis",
  "diabetes",
  "climate change",
  "imagenet",
  "housing",
];

type Phase = "idle" | "streaming" | "done";
type ViewMode = "list" | "graph";

function readSourceScope(url: URL): SourceScope {
  const raw = url.searchParams.get("source");
  if (raw && (SOURCE_IDS as readonly string[]).includes(raw)) return raw as SourceId;
  return "all";
}

function readQuery(url: URL): string {
  return (url.searchParams.get("q") ?? "").trim().slice(0, 120);
}

export function SearchApp() {
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<Record<SourceId, SourceResult[]>>(emptyResults);
  const [states, setStates] = useState<Record<SourceId, SourceState>>(initialStates);
  const [commercialOnly, setCommercialOnly] = useState(false);
  const [scope, setScope] = useState<SourceScope>(() =>
    typeof window === "undefined"
      ? "all"
      : readSourceScope(new URL(window.location.href)),
  );
  const [view, setView] = useState<ViewMode>("list");
  const esRef = useRef<EventSource | null>(null);
  const doneRef = useRef(false);

  const activeSources = useMemo<SourceId[]>(
    () => (scope === "all" ? [...SOURCE_IDS] : [scope]),
    [scope],
  );

  // Restore a shareable search from the URL on first mount (?q=…&source=…).
  const initializedRef = useRef(false);

  const runSearch = useCallback(
    (raw: string) => {
      const q = raw.trim();
      if (!q) return;

      esRef.current?.close();
      doneRef.current = false;
      setQuery(q);
      setPhase("streaming");
      setResults(emptyResults());
      setStates(initialStates());

      // Persist the search (and provider scope) in the URL so it's shareable.
      const url = new URL(window.location.href);
      url.searchParams.set("q", q);
      if (scope === "all") url.searchParams.delete("source");
      else url.searchParams.set("source", scope);
      window.history.replaceState(null, "", url.toString());

      const es = new EventSource(
        scope === "all"
          ? `/api/search?q=${encodeURIComponent(q)}`
          : `/api/search?q=${encodeURIComponent(q)}&source=${encodeURIComponent(scope)}`,
      );
      esRef.current = es;

      es.addEventListener("source-status", (event) => {
        const d = JSON.parse((event as MessageEvent).data) as {
          source: SourceId;
          status: SourceState["status"];
          count?: number;
          message?: string;
        };
        setStates((prev) => ({
          ...prev,
          [d.source]: {
            status: d.status,
            count: d.count ?? 0,
            message: d.message,
          },
        }));
      });

      es.addEventListener("source-result", (event) => {
        const d = JSON.parse((event as MessageEvent).data) as {
          source: SourceId;
          results: SourceResult[];
        };
        setResults((prev) => ({ ...prev, [d.source]: d.results }));
      });

      es.addEventListener("done", () => {
        doneRef.current = true;
        setPhase("done");
        es.close();
        esRef.current = null;
      });

      es.addEventListener("error", () => {
        if (!doneRef.current) {
          setPhase("done");
          es.close();
          esRef.current = null;
        }
      });
    },
    [scope],
  );

  // Restore a shareable search from the URL on first mount (?q=…&source=…).
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const url = new URL(window.location.href);
    const initialQuery = readQuery(url);
    // Mount-time restore from a shareable URL is an intentional one-shot init.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (initialQuery) runSearch(initialQuery);
  }, [runSearch]);

  useEffect(
    () => () => {
      esRef.current?.close();
    },
    [],
  );

  const merged = useMemo(
    () => mergeResults(activeSources.flatMap((s) => results[s])),
    [results, activeSources],
  );
  const filtered = useMemo(
    () =>
      commercialOnly
        ? merged.filter((m) =>
            m.origins.some((o) => isCommerciallyUsable(o.license)),
          )
        : merged,
    [merged, commercialOnly],
  );
  const graph = useMemo(() => buildProvenanceGraph(filtered), [filtered]);
  const anyResults = useMemo(
    () => activeSources.some((s) => results[s].length > 0),
    [results, activeSources],
  );
  const totalRaw = useMemo(
    () => merged.reduce((n, m) => n + m.origins.length, 0),
    [merged],
  );
  const allFailed = useMemo(
    () =>
      phase === "done" &&
      !anyResults &&
      activeSources.every((s) => states[s].status === "error"),
    [phase, anyResults, states, activeSources],
  );

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-20">
      <header className="pt-16 pb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <Database className="h-6 w-6 text-amber-400" aria-hidden />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-50 sm:text-5xl">
          DataForge
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          One query across Hugging Face, arXiv, GitHub, Zenodo, Semantic
          Scholar, data.gov &amp; OpenML — datasets, papers and models stream in
          live, ranked, and stitched into a provenance graph.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <SearchBar onSubmit={runSearch} disabled={phase === "streaming"} />
        </div>
        <SourceSelect value={scope} onChange={setScope} />
      </div>

      {phase === "idle" && (
        <div className="mt-6 text-center">
          <p className="text-xs uppercase tracking-widest text-zinc-600">
            Try
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => runSearch(ex)}
                className="rounded-full border border-zinc-700/80 bg-zinc-900/60 px-3.5 py-1.5 text-sm text-zinc-300 transition hover:border-amber-500/50 hover:text-amber-300"
              >
                {ex}
              </button>
            ))}
          </div>
        </div>
      )}

      {phase !== "idle" && (
        <div className="mt-6 space-y-4">
          <SourceTracker states={states} sources={activeSources} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <LicenseFilter
              commercialOnly={commercialOnly}
              onChange={setCommercialOnly}
              shown={filtered.length}
              total={totalRaw}
            />
            <div className="flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-900/60 p-1">
              <button
                type="button"
                onClick={() => setView("list")}
                aria-pressed={view === "list"}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  view === "list"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <List className="h-3.5 w-3.5" aria-hidden /> List
              </button>
              <button
                type="button"
                onClick={() => setView("graph")}
                aria-pressed={view === "graph"}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  view === "graph"
                    ? "bg-zinc-700 text-zinc-100"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Network className="h-3.5 w-3.5" aria-hidden /> Graph
              </button>
            </div>
          </div>

          {view === "graph" ? (
            <GraphView graph={graph} />
          ) : (
            <ResultList
              results={filtered}
              phase={phase}
              query={query}
              anyResults={anyResults}
              allFailed={allFailed}
              sourceCount={activeSources.length}
            />
          )}
        </div>
      )}
    </div>
  );
}
