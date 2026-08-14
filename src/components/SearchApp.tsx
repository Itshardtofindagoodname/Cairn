"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database } from "lucide-react";
import { SearchBar } from "./SearchBar";
import { SourceTracker } from "./SourceTracker";
import { ResultList } from "./ResultList";
import { LicenseFilter } from "./LicenseFilter";
import { SourceSelect, type SourceScope } from "./SourceSelect";
import { ModeToggle, type SearchMode } from "./ModeToggle";
import { TypeFilter } from "./TypeFilter";
import { InterpretChip } from "./InterpretChip";
import { InsightRefreshMenu } from "./InsightRefreshMenu";
import { KaggleConnectDialog } from "./KaggleConnectDialog";
import { mergeResults } from "@/lib/merge";
import { isCommerciallyUsable } from "@/lib/license";
import { streamSearch } from "@/lib/sse-client";
import { loadKaggleCredentials } from "@/lib/kaggle-store";
import {
  SOURCE_IDS,
  TYPE_FILTERS,
  TYPE_FILTER_LABELS,
  type SourceId,
  type SourceResult,
  type SourceState,
  type TypeFilter as TypeFilterValue,
} from "@/lib/types";

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

interface ExpansionInfo {
  terms: string[];
  explanation: string;
}

function readSourceScope(url: URL): SourceScope {
  const raw = url.searchParams.get("source");
  if (raw && (SOURCE_IDS as readonly string[]).includes(raw)) return raw as SourceId;
  return "all";
}

function readTypeFilter(url: URL): TypeFilterValue {
  const raw = url.searchParams.get("type");
  if (raw && (TYPE_FILTERS as readonly string[]).includes(raw)) return raw as TypeFilterValue;
  return "all";
}

function readMode(url: URL): SearchMode {
  return url.searchParams.get("mode") === "discuss" ? "discuss" : "basic";
}

function readQuery(url: URL): string {
  return (url.searchParams.get("q") ?? "").trim().slice(0, 120);
}

export function SearchApp() {
  const [inputValue, setInputValue] = useState("");
  const [query, setQuery] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [results, setResults] = useState<Record<SourceId, SourceResult[]>>(emptyResults);
  const [states, setStates] = useState<Record<SourceId, SourceState>>(initialStates);
  const [commercialOnly, setCommercialOnly] = useState(false);
  // Keep these identical on server and client so SSR hydration matches. URL
  // params (?source=…&type=…&mode=…) are applied post-mount in the restore
  // effect below instead of being read here from `window` (reading the URL in
  // a useState initializer made the client's first render diverge from the
  // server's HTML, which broke the Radix ToggleGroups' data-state attributes).
  const [scope, setScope] = useState<SourceScope>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilterValue>("all");
  const [mode, setMode] = useState<SearchMode>("basic");
  const [expansion, setExpansion] = useState<ExpansionInfo | null>(null);
  const [expansionDismissed, setExpansionDismissed] = useState(false);
  const [kaggleCreds, setKaggleCreds] = useState<{ username: string; key: string } | null>(null);
  const [kaggleConnectOpen, setKaggleConnectOpen] = useState(false);
  const [config, setConfig] = useState<{
    kaggleAvailable: boolean;
    groqAvailable: boolean;
    aiInsightDailyCap: number;
  }>({ kaggleAvailable: false, groqAvailable: false, aiInsightDailyCap: 0 });
  const [insightCapReached, setInsightCapReached] = useState(false);

  // ---- refs mirroring state so runSearch (stable, empty deps) always reads
  // the latest values without stale closures.
  const abortRef = useRef<AbortController | null>(null);
  const committedRef = useRef("");
  const scopeRef = useRef(scope);
  const typeRef = useRef(typeFilter);
  const modeRef = useRef(mode);
  const credsRef = useRef(kaggleCreds);
  const initializedRef = useRef(false);
  // True while the mount-time URL restore is applying scope/type/mode state, so
  // the live re-trigger effect below doesn't re-run a search that the restore
  // is about to launch itself (avoids a double-search when creds load fast).
  const restoringRef = useRef(false);

  useEffect(() => {
    scopeRef.current = scope;
  }, [scope]);
  useEffect(() => {
    typeRef.current = typeFilter;
  }, [typeFilter]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    credsRef.current = kaggleCreds;
  }, [kaggleCreds]);

  const activeSources = useMemo<SourceId[]>(
    () => (scope === "all" ? [...SOURCE_IDS] : [scope]),
    [scope],
  );

  const runSearch = useCallback((raw: string, opts?: { fresh?: boolean }) => {
    const q = raw.trim().slice(0, 120);
    if (!q) {
      // Empty-query guard: never launch a search for nothing (fixes the
      // infinite-loop edge case when the query field is cleared).
      committedRef.current = "";
      setQuery("");
      setPhase("idle");
      setResults(emptyResults());
      setStates(initialStates());
      setExpansion(null);
      // The Clear button empties the URL too, so a refreshed tab starts clean.
      const url = new URL(window.location.href);
      url.searchParams.delete("q");
      url.searchParams.delete("source");
      url.searchParams.delete("type");
      url.searchParams.delete("mode");
      window.history.replaceState(null, "", url.toString());
      return;
    }

    abortRef.current?.abort();
    committedRef.current = q;
    setInputValue(q);
    setQuery(q);
    setPhase("streaming");
    setResults(emptyResults());
    setStates(initialStates());
    setExpansion(null);
    setExpansionDismissed(false);
    setInsightCapReached(false);

    const scopeNow = scopeRef.current;
    const typeNow = typeRef.current;
    const modeNow = modeRef.current;
    const credsNow = credsRef.current;
    const discuss = modeNow === "discuss";

    // Persist the search (query, provider scope, type filter, mode) in the URL
    // so it's shareable and restorable on load.
    const url = new URL(window.location.href);
    url.searchParams.set("q", q);
    if (scopeNow === "all") url.searchParams.delete("source");
    else url.searchParams.set("source", scopeNow);
    if (typeNow === "all") url.searchParams.delete("type");
    else url.searchParams.set("type", typeNow);
    if (discuss) url.searchParams.set("mode", "discuss");
    else url.searchParams.delete("mode");
    window.history.replaceState(null, "", url.toString());

    const controller = new AbortController();
    abortRef.current = controller;

    const headers: Record<string, string> = {};
    if (credsNow?.username) headers["x-cairn-kaggle-username"] = credsNow.username;
    if (credsNow?.key) headers["x-cairn-kaggle-key"] = credsNow.key;

    void streamSearch(
      "/api/search",
      {
        headers,
        body: {
          q,
          ...(scopeNow === "all" ? {} : { source: scopeNow }),
          type: typeNow,
          expand: discuss,
          fresh: opts?.fresh ?? false,
        },
      },
      {
        onEvent: (event, data) => {
          if (controller.signal.aborted) return;
          if (event === "source-status") {
            const d = data as {
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
          } else if (event === "source-result") {
            const d = data as { source: SourceId; results: SourceResult[] };
            setResults((prev) => ({ ...prev, [d.source]: d.results }));
          } else if (event === "expansion") {
            const d = data as ExpansionInfo;
            if (d.terms.length > 1) setExpansion(d);
          } else if (event === "done") {
            setPhase("done");
          } else if (event === "error") {
            setPhase("done");
          }
        },
        onEnd: () => {
          if (!controller.signal.aborted) setPhase("done");
        },
      },
    );
  }, []);

  // Live re-trigger: changing the provider scope OR the result-type filter
  // re-runs the search with the SAME committed query (this was the bug —
  // filters didn't re-run the query at all).
  useEffect(() => {
    if (!initializedRef.current) return;
    if (restoringRef.current) return;
    const q = committedRef.current;
    if (q) runSearch(q);
  }, [scope, typeFilter, runSearch]);

  // Load server capability flags (Kaggle shared key / Groq availability).
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) setConfig(d);
      })
      .catch(() => {});
  }, []);

  // Restore a shareable search from the URL on first mount (?q=…&source=…&type=…).
  // The user's stored Kaggle key loads BEFORE the search so a restored search
  // never fires without the personal creds (they load asynchronously, so the
  // old code raced the restore against the IndexedDB read and sent no key).
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const url = new URL(window.location.href);
    const initialQuery = readQuery(url);
    // Sync provider scope / type filter / mode from the URL AFTER hydration so
    // the server and client render the same first paint (no mismatch), then the
    // controls reflect the shared link.
    const scopeNow = readSourceScope(url);
    const typeNow = readTypeFilter(url);
    const modeNow = readMode(url);
    scopeRef.current = scopeNow;
    typeRef.current = typeNow;
    modeRef.current = modeNow;
    restoringRef.current = true;
    setScope(scopeNow);
    setTypeFilter(typeNow);
    setMode(modeNow);
    void (async () => {
      let creds: { username: string; key: string } | null = null;
      try {
        creds = await loadKaggleCredentials();
      } catch {
        creds = null;
      }
      credsRef.current = creds;
      setKaggleCreds(creds);
      restoringRef.current = false;
      if (initialQuery) runSearch(initialQuery);
    })();
  }, [runSearch]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
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

  const handleCredentialsChanged = useCallback(() => {
    loadKaggleCredentials()
      .then((creds) => {
        // Sync the ref synchronously BEFORE the re-run: runSearch reads
        // credsRef.current inline, and the [kaggleCreds] effect only syncs it
        // after a re-render. Without this the post-connect re-search sends the
        // PREVIOUS (possibly revoked) key and Kaggle answers 401.
        credsRef.current = creds;
        setKaggleCreds(creds);
        if (creds && committedRef.current) runSearch(committedRef.current);
      })
      .catch(() => {});
  }, [runSearch]);

  return (
    <div className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col px-4 pb-20">
      <header className="pt-16 pb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10">
          <Database className="h-6 w-6 text-amber-400" aria-hidden />
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-zinc-50 sm:text-5xl">
          Cairn
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-zinc-400 sm:text-base">
          One query across Hugging Face, arXiv, GitHub, Zenodo,
          data.gov, OpenML &amp; Kaggle — datasets, papers, models and
          code stream in live, ranked by a transparent Reproducibility Score.
        </p>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex-1">
          <SearchBar
            value={inputValue}
            onChange={setInputValue}
            onSubmit={runSearch}
            disabled={phase === "streaming"}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SourceSelect
            value={scope}
            onChange={setScope}
            kaggleAvailable={config.kaggleAvailable}
          />
          <ModeToggle value={mode} onChange={setMode} />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <TypeFilter value={typeFilter} onChange={setTypeFilter} />
        <LicenseFilter
          commercialOnly={commercialOnly}
          onChange={setCommercialOnly}
          shown={filtered.length}
          total={totalRaw}
        />
        {config.groqAvailable && mode === "discuss" && (
          <span className="ml-auto hidden text-xs text-zinc-500 sm:inline">
            Discuss mode expands your query via AI for richer coverage.
          </span>
        )}
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
          {expansion && !expansionDismissed && mode === "discuss" && (
            <InterpretChip
              terms={expansion.terms}
              explanation={expansion.explanation}
              onDismiss={() => setExpansionDismissed(true)}
              onReinterpret={() => runSearch(committedRef.current, { fresh: true })}
              disabled={phase === "streaming"}
            />
          )}

          <SourceTracker
            states={states}
            sources={activeSources}
            onConnectKaggle={() => setKaggleConnectOpen(true)}
          />

          {insightCapReached && (
            <div className="rounded-xl border border-zinc-700 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-400">
              Daily AI insight limit reached for {TYPE_FILTER_LABELS[typeFilter]} results —
              insights are capped per day on the free tier. Come back tomorrow.
            </div>
          )}

          {config.groqAvailable && mode === "discuss" && (
            <div className="flex items-center justify-end">
              <InsightRefreshMenu />
            </div>
          )}

          <ResultList
            results={filtered}
            phase={phase}
            query={query}
            anyResults={anyResults}
            allFailed={allFailed}
            sourceCount={activeSources.length}
            groqAvailable={config.groqAvailable}
            onAiInsightCapReached={() => setInsightCapReached(true)}
            mode={mode}
          />
        </div>
      )}

      <KaggleConnectDialog
        open={kaggleConnectOpen}
        onOpenChange={setKaggleConnectOpen}
        connectedUsername={kaggleCreds?.username ?? null}
        onCredentialsChanged={handleCredentialsChanged}
      />
    </div>
  );
}