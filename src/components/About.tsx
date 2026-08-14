import {
  Activity,
  BarChart3,
  Code2,
  Database,
  FileText,
  HardDrive,
  Lock,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";

const SOURCES = [
  { name: "Hugging Face", type: "datasets & models" },
  { name: "arXiv", type: "papers" },
  { name: "GitHub", type: "code repositories" },
  { name: "Zenodo", type: "datasets" },
  { name: "data.gov", type: "government datasets" },
  { name: "OpenML", type: "ML datasets" },
  { name: "Kaggle", type: "datasets & notebooks" },
];

const WEIGHTS = [
  { label: "Metadata", weight: "20%", note: "description substance, size, dates present" },
  { label: "License", weight: "20%", note: "permissive vs. non-commercial vs. missing" },
  { label: "Liveness", weight: "35%", note: "is the result's own page still reachable?" },
  { label: "Maintenance", weight: "25%", note: "how recently was the work updated?" },
];

const STEPS = [
  { name: "Fan out", note: "your query goes to all seven providers in parallel" },
  { name: "Stream", note: "each source pushes its own ranked results as they arrive" },
  { name: "Merge & rank", note: "duplicates collapse; a reproducibility signal orders the mix" },
  { name: "Load", note: "every card ships with copy-paste code to reproduce it" },
];

export function About() {
  return (
    <section id="about" className="relative z-10 mx-auto w-full max-w-4xl px-4 pb-20">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-6 sm:p-8">
        <h2 className="text-2xl font-bold text-zinc-100">What is Cairn?</h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400">
          Cairn is a federated search engine for the open research ecosystem. A
          single query is fanned out across seven independent providers in
          parallel, and datasets, papers, models and code stream back live as
          they arrive. Results are deduplicated across sources, ranked by a
          transparent reproducibility signal, and every card ships with the
          exact code to load or download what you found.
        </p>

        <div className="mt-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Activity className="h-4 w-4 text-amber-400" aria-hidden />
            How a search works
          </h3>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {STEPS.map((s, i) => (
              <li
                key={s.name}
                className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
              >
                <span className="mt-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-bold text-amber-300">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{s.name}</p>
                  <p className="text-xs text-zinc-500">{s.note}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Each provider resolves independently, so a slow or failing API never
            blocks the others — you see &quot;unavailable&quot; or a
            &quot;rate-limited&quot; chip for that source while the rest keep
            streaming. Results are pushed over fetch-based SSE (server-sent
            events), the same format a chat UI would use, so the first cards
            appear in under a second.
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Database className="h-4 w-4 text-amber-400" aria-hidden />
              Sources
            </h3>
            <ul className="mt-3 space-y-1.5 text-sm text-zinc-400">
              {SOURCES.map((s) => (
                <li key={s.name} className="flex items-center justify-between gap-3 border-b border-zinc-800/60 py-1">
                  <span className="font-medium text-zinc-300">{s.name}</span>
                  <span className="text-xs text-zinc-500">{s.type}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-6">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <Zap className="h-4 w-4 text-amber-400" aria-hidden />
                Basic mode
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Fast keyword search. Your query goes out verbatim to every
                source, results stream in, merge and rank. No API keys required
                for any source.
              </p>
            </div>
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
                <MessageSquareText className="h-4 w-4 text-violet-400" aria-hidden />
                Discuss mode
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                Ask in plain language. An AI (Groq, optional key) expands your
                query into related search terms — &quot;3d printing filaments&quot;
                becomes &quot;3d printing filaments, fdm materials, slicer settings&quot;
                — and Cairn fans out over all of them, merging the results. The
                interpretation is shown as a chip you can dismiss or
                re-interpret. If the AI is unavailable, Cairn quietly searches
                your exact words. Expansions are cached for 7 days, so repeat
                queries stop consuming Groq quota almost immediately.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <Sparkles className="h-4 w-4 text-amber-400" aria-hidden />
            AI Insight
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            For every result, Cairn can generate a short plain-language
            &quot;why you might care&quot; — what the item is, who made it, how
            it&apos;s used and licensed, and the practical caveats before you
            download. Insights are generated on-demand (one click per card),
            cached per result for 21 days, and rate-limited globally so one
            person can&apos;t burn a day&apos;s worth of free quota. A card whose
            insight is still being written shows a &quot;Retry&quot; button; if
            the AI is busy or unavailable it degrades to a calm
            &quot;queued&quot; state instead of failing.
          </p>
        </div>

        <div className="mt-8">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
            <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
            The Reproducibility Score
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-zinc-400">
            Every card carries a 0–100 score so you can tell at a glance whether
            something is worth a download. It&apos;s not a black box — hover the
            badge to see exactly how each part scored:
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {WEIGHTS.map((w) => (
              <div
                key={w.label}
                className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5"
              >
                <span className="mt-0.5 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-xs font-bold text-amber-300">
                  {w.weight}
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-200">{w.label}</p>
                  <p className="text-xs text-zinc-500">{w.note}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-zinc-400">
            Metadata and license score instantly from the card itself. Liveness
            (is the page still reachable?) and maintenance (how recently
            updated?) are checked lazily as each card scrolls into view and are
            cached for 24 hours — while pending they contribute a neutral 0.5
            and the badge pulses until the data arrives.
          </p>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <HardDrive className="h-4 w-4 text-zinc-400" aria-hidden />
              Caching &amp; performance
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Provider responses are cached twice: an in-memory LRU for
              sub-millisecond hits on back-to-back identical queries, and a
              zero-infrastructure SQLite file (2-hour TTL) for cross-restart
              reuse. Nothing is re-hosted — the cache stores the search payload,
              not your data.
            </p>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Lock className="h-4 w-4 text-zinc-400" aria-hidden />
              Privacy &amp; security
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Searches are anonymous — no accounts, no analytics, no server-side
              logs of your queries. If you connect a personal Kaggle key it is
              AES-256-GCM encrypted on your device, never sent to Cairn&apos;s
              server, and only ever forwarded to Kaggle for the search you
              asked for.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Code2 className="h-4 w-4 text-zinc-400" aria-hidden />
              Every result is loadable
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Each card&apos;s &quot;Code&quot; tab contains copy-pasteable loading code for
              that exact item (kagglehub for Kaggle, git clone for GitHub,
              datasets.load for Hugging Face, and so on). You always end up at
              the original provider.
            </p>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <RefreshCw className="h-4 w-4 text-zinc-400" aria-hidden />
              Scope &amp; filters
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Narrow by type (datasets, papers, models, code) or by license, and
              pick exactly which providers to fan out to. Type and scope changes
              re-run only the sources you touched, so switching filters stays
              fast and doesn&apos;t re-fetch what you already have.
            </p>
          </div>
        </div>

        <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-xs leading-relaxed text-zinc-500">
          <h4 className="mb-1 flex items-center gap-1.5 font-semibold text-zinc-400">
            <BarChart3 className="h-3.5 w-3.5" aria-hidden />
            About Kaggle
          </h4>
          <FileText className="sr-only" aria-hidden />
          Cairn uses a small shared Kaggle key when available. Kaggle doesn&apos;t
          publish numeric rate limits, so Cairn tracks its own conservative
          budget and flips to a calm &quot;connect your own account&quot; state well
          before Kaggle&apos;s dynamic limiting would kick in — you can always
          connect your own key for uninterrupted results.
        </div>
      </div>
    </section>
  );
}
