import {
  BarChart3,
  Code2,
  Database,
  FileText,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
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
                query into related search terms — “3d printing filaments”
                becomes “3d printing filaments, fdm materials, slicer settings”
                — and Cairn fans out over all of them, merging the results. The
                interpretation is shown as a chip you can dismiss or
                re-interpret. If the AI is unavailable, Cairn quietly searches
                your exact words.
              </p>
            </div>
          </div>
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
        </div>

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <Code2 className="h-4 w-4 text-zinc-400" aria-hidden />
              Every result is loadable
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Each card&apos;s “Code” tab contains copy-pasteable loading code for
              that exact item (kagglehub for Kaggle, git clone for GitHub,
              datasets.load for Hugging Face, and so on). Nothing is
              re-hosted — you always end up at the original provider.
            </p>
          </div>
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-zinc-200">
              <RefreshCw className="h-4 w-4 text-zinc-400" aria-hidden />
              Caching &amp; privacy
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-zinc-400">
              Provider responses are cached locally in SQLite (per-process LRU
              on top) so repeat searches are instant and respectful. Your
              personal Kaggle key, if you connect one, is encrypted on your
              device and only ever sent to Kaggle for your own search — never
              stored server-side.
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
          budget and flips to a calm “connect your own account” state well
          before Kaggle&apos;s dynamic limiting would kick in — you can always
          connect your own key for uninterrupted results.
        </div>
      </div>
    </section>
  );
}