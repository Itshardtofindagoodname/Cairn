# Cairn

A federated dataset, model, paper & code search engine — "Google for open data
and ML". One search bar fans out to **Hugging Face**, **arXiv**, **GitHub**,
**Zenodo**, **Semantic Scholar**, **data.gov**, **OpenML** and **Kaggle** in
parallel, streams results back live over SSE as each source responds, ranks
every result with an explainable multi-signal score, and gives each one a
transparent **Reproducibility Score** so you can tell at a glance whether it's
worth a download.

No paid APIs required for Basic search. No LLM calls for extraction or ranking
— the relevant algorithms are hand-written. No database server — caching runs
on a local SQLite file with a small in-process LRU on top.

## Run it (2 commands)

```bash
npm install
npm run dev
```

Open http://localhost:3000. Every integrated source works anonymously; the
optional knobs (Groq, Kaggle, HF/GitHub tokens) are documented in
`.env.example`.

> Node.js 18.17+ required (better-sqlite3 is a native module; prebuilt binaries
> ship for common platforms). Production builds use `next build --webpack`
> because the Turbopack bundler can crash on some Windows hosts during the
> emit phase.

## What's inside

### Streaming fan-out

```
          POST /api/search   (Next.js Route Handler, Node; SSE over fetch)
           │
 browser ───┤ fans out in parallel ──▶ Hugging Face    ◀── datasets + models
(streaming) │                          arXiv          ◀── papers (abstracts)
           │                          GitHub         ◀── repos (stars)
           │                          Zenodo         ◀── datasets (downloads)
           │                          Semantic Scholar ◀─ papers (citations)
           │                          data.gov        ◀─ US gov datasets
           │                          OpenML          ◀─ ML datasets
           │                          Kaggle          ◀─ datasets + notebooks
           │   each source pushes its normalized, RANKED results as they arrive
           │   failures → "unavailable"; rate limits → "rate-limited" chip;
           │   shared-key exhausted → "connect account" (handoff) chip
           ▼
      in-memory LRU (100 entries) → SQLite cache (better-sqlite3, 2h TTL)
```

- Each source resolves independently in a `Promise.allSettled` fan-out, so a
  slow or failing API never blocks the others.
- Results are streamed over **fetch-based SSE** (`src/lib/sse-client.ts`).
  `EventSource` can't send POST bodies or custom headers, which are needed for
  the type filter, the Discuss-mode intent expansion flag, and your own Kaggle
  credentials — so Cairn streams the same `text/event-stream` format over a
  `fetch` POST.
- A per-source SQLite cache (2h TTL) keeps repeated searches free and quiet; an
  in-process LRU (`src/lib/lru-cache.ts`, 100 entries, keyed
  `query::source::type`) makes identical back-to-back searches sub-millisecond.

### Provider-scope dropdown

A Radix `Select` next to the search bar narrows the fan-out to **"All sources"**
(default) or any single source (each with its own lucide icon and color from
`sourceMeta.ts`). When you pick one source, `/api/search` **does not fetch the
others at all** — it's a real latency win, not a cosmetic filter. The selection
is persisted in the URL (`?source=arxiv`), so a scoped search is shareable and
restores on load.

### Result-type filter

A chip group (All / Datasets / Models / Papers / Code) filters results **on the
server** (`?type=…`), AND-combined with the provider scope. Changing it or the
provider **re-runs the current query live** — the server cache is type-aware, so
the re-run is usually instant.

### Two search modes

- **Basic** — fast keyword search. Your query goes out verbatim to every
  source, results stream in, merge and rank. No API keys required.
- **Discuss** — ask in plain language. Groq (optional key) expands your query
  into related search terms and Cairn fans out over all of them, merging the
  results. The interpretation appears as a chip you can dismiss or
  re-interpret. If the AI is unavailable, Cairn **silently falls back** to your
  exact words — Basic-mode behaviour is never changed.

### The Reproducibility Score

Every card carries a 0–100 score so you can tell at a glance whether something
is worth a download. It's not a black box — hovering the badge shows exactly
how each part scored:

```
total = 0.20 × metadata  +  0.20 × license  +  0.35 × liveness  +  0.25 × maintenance
```

- **Metadata (20%)** — description substance, size listed, dates present.
  Computed instantly from the card.
- **License (20%)** — permissive/open licenses (MIT, Apache-2.0, CC-BY, public
  domain) score high; non-commercial (CC-BY-NC) mid; missing low. Computed
  instantly from the card.
- **Liveness (35%)** — is the result's own page still reachable? A HEAD probe
  (`/api/liveness`, 3s timeout) fetched lazily via `IntersectionObserver` when
  the card becomes visible, cached 24h.
- **Maintenance (25%)** — how recently was the work updated? For GitHub repos
  this uses the GitHub API's `pushed_at` (`/api/maintenance`, cached 24h);
  otherwise the card's own `updatedAt` is used.

While liveness/maintenance are still resolving the badge pulses and those
components contribute a neutral 0.5, so the total is meaningful immediately and
settles as data arrives.

### AI Insight

Each card can ask Groq for a short "so what" trust snapshot (headline +
~100 words): freshness, scale, red flags, whether the metadata suggests it's
reproducible and safe to reuse. Requests are debounced 2s client-side into a
single batched `POST /api/insight`, results are cached **cross-user** in SQLite
(keyed by `sha1(source|sourceId)`, 21-day TTL), and a daily cap
(`AI_INSIGHT_DAILY_CAP`, default 50) keeps the free tier safe. When Groq's own
rate headers report <20% headroom, Cairn reports "Insight queued…" instead of
burning a doomed call.

### Kaggle: graceful shared-key handoff

Kaggle is the only source that doesn't work anonymously. If a shared
`KAGGLE_USERNAME`/`KAGGLE_KEY` is configured, Cairn searches Kaggle for
everyone using that quota. Kaggle publishes **no numeric rate limits** (dynamic
limiting, signaled only by HTTP 429 + Retry-After), so Cairn tracks its own
conservative, configurable budget (`KAGGLE_SHARED_BUDGET` requests per
`KAGGLE_SHARED_WINDOW_MIN` minutes, default 120/hr) in SQLite. At ~75% of the
budget, searches stop spending the shared quota and the Kaggle chip flips to a
calm **"connect account"** state that opens the connection dialog — well before
a real 429 could happen.

Users can always connect their own Kaggle key:

- The key is **encrypted on the device** (AES-256-GCM; the symmetric key lives
  in IndexedDB, the ciphertext in localStorage — see `src/lib/kaggle-store.ts`)
  and sent to the server only as request-scoped headers on a single search POST,
  never persisted server-side.
- Credentials are validated with one real call to the Kaggle API
  (`/api/kaggle/validate`) before they're stored.
- A personal key bypasses the shared quota entirely.

### Ranking engine

Every result gets a transparent score made of **three named signals blended
with explicit weights** — no black box:

```
total = 0.50 × relevance  +  0.30 × authority  +  0.20 × recency
```

- **Relevance (TF-IDF)** — `src/lib/tfidf.ts` is a hand-implemented
  term-frequency × inverse-document-frequency scorer (no ML library). It scores
  each result's title + description against the query over that batch's corpus
  and normalizes so the best result in a batch is 1.0.
- **Authority (popularity)** — each source exposes its own metric (HF
  downloads/likes, Zenodo downloads, GitHub stars, Semantic Scholar citations,
  Kaggle downloads). Values are `log10(1+x)`-scaled then min-max normalized
  within the batch.
- **Recency (half-life decay)** — published/updated dates decay exponentially
  with a tunable half-life (`RECENCY_HALF_LIFE_DAYS = 730`, ~2 years). Unknown
  dates get a neutral 0.5.

Ranking runs **as a streaming post-process per batch**: each source's results
are scored and sorted the moment they arrive, never in a final blocking step.
Each card shows its score chip; hovering opens a Radix popover breaking it into
**Relevance · Authority · Recency** with micro-bars.

### Dedupe & merge

Merging combines multiple signals instead of a naive title match:

- **Exact DOI or arXiv-ID match** → definitively the same item.
- **Strong token-overlap title match** (Jaccard) → same item.
- **Moderate title match + real author/creator overlap** → same item.

Merged cards keep the **highest-ranked origin's metadata as primary** and list
every other source under "Also on: HF, Zenodo". Each origin keeps its own
snippet, license, arXiv/DOI and updated date.

### Code snippets, previews, licenses

- Per-source copy-paste loading code (`datasets.load_dataset(...)`,
  `kagglehub.dataset_download(...)`, `git clone …`, `pandas.read_csv(…)`, …).
- Preview: CSV datasets fetch the first ~50KB via an HTTP `Range` request
  (PapaParse); HF models show `config.json`. Files are never re-hosted.
- Every license string is normalized to `MIT · Apache-2.0 · CC-BY · CC-BY-NC ·
  Public Domain · Unknown`, with a "commercially usable only" filter.

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── search/route.ts         # SSE fan-out (POST body + GET back-compat:
│   │   │                           #   provider scope, type filter, intent expansion,
│   │   │                           #   personal Kaggle key, LRU + SQLite cache)
│   │   ├── config/route.ts         # capability flags (kaggle/groq availability)
│   │   ├── kaggle/validate/route.ts# verify a personal Kaggle key (one real call)
│   │   ├── liveness/route.ts       # HEAD reachability probe (Repro score, 24h cache)
│   │   ├── maintenance/route.ts    # GitHub pushed_at (Repro score, 24h cache)
│   │   ├── insight/route.ts        # batched AI Insight (sequential, daily-capped)
│   │   └── preview/route.ts        # ~50KB Range-fetch preview proxy
│   ├── layout.tsx
│   └── page.tsx                    # home page (SearchApp + About section)
├── components/                     # search UI (client components)
│   ├── SearchApp.tsx               # orchestration, filters, mode, expansion, Kaggle
│   ├── SearchBar.tsx               # controlled input
│   ├── ModeToggle.tsx              # Basic / Discuss (Radix toggle-group)
│   ├── TypeFilter.tsx              # All / Datasets / Models / Papers / Code
│   ├── InterpretChip.tsx           # intent-expansion chip (dismiss / re-interpret)
│   ├── KaggleConnectDialog.tsx     # encrypted personal-key connect
│   ├── SourceSelect.tsx            # Radix provider-scope dropdown (Kaggle-aware)
│   ├── SourceTracker.tsx           # per-source status chips (rate-limited/handoff)
│   ├── ResultCard.tsx              # normalized card (+ Repro badge + AI Insight)
│   ├── ResultList.tsx              # framer-motion stream-in
│   ├── ReproScoreBadge.tsx         # 0-100 badge + popover breakdown (lazy probe)
│   ├── AiInsightPanel.tsx          # per-card AI trust snapshot
│   ├── ScorePopover.tsx            # ranking breakdown (Relevance/Authority/Recency)
│   ├── PreviewPanel.tsx / CodeBlock.tsx / LicenseFilter.tsx / About.tsx
│   └── sourceMeta.ts               # source/type/license colors, icons, labels
├── lib/
│   ├── types.ts                    # shared types (SourceResult, MergedResult, …)
│   ├── cache.ts                    # better-sqlite3 cache (2h TTL)
│   ├── lru-cache.ts                # in-process LRU above SQLite
│   ├── sse-client.ts               # fetch-based SSE stream (POST + headers)
│   ├── tfidf.ts                    # hand-implemented TF-IDF (relevance signal)
│   ├── ranking.ts                  # weighted blend: relevance/authority/recency
│   ├── dedupe.ts / merge.ts        # dedupe + merge into cards
│   ├── license.ts                  # license normalization + commercial map
│   ├── snippets.ts                 # per-source code snippet generator
│   ├── fetch.ts / format.ts
│   ├── groq.ts                     # Groq chat client (rate headers captured)
│   ├── rate-tracker.ts             # Groq remaining ratio (<20% → queue)
│   ├── intent.ts                   # Discuss-mode expansion (7d cache, silent fallback)
│   ├── ai-insight.ts               # insight generation (cross-user cache, daily cap)
│   ├── insight-batcher.ts          # client-side 2s debounce batching
│   ├── kaggle-store.ts             # encrypted personal-key storage (WebCrypto/IndexedDB)
│   ├── kaggle-rate-tracker.ts      # shared-key budget → handoff mode
│   └── reproducibility/            # score.ts (weights) + liveness.ts + maintenance.ts
└── sources/                        # one adapter per source
    ├── types.ts                    # SourceAdapter + SourceRateLimitedError + SourceHandoffError
    ├── huggingface.ts / arxiv.ts / github.ts / zenodo.ts
    ├── semanticscholar.ts / datagov.ts / openml.ts / kaggle.ts
    └── index.ts                    # registry
```

**Adding a source** = implement `SourceAdapter` (`search(query, signal, auth):
Promise<SourceResult[]>`), surface a `popularity` value for ranking, and add it
to the `SOURCES` registry in `src/sources/index.ts`. The UI, dropdown, ranking,
dedupe and snippets adapt automatically.

## How each source is queried

| Source | API | Auth | Notes |
| --- | --- | --- | --- |
| Hugging Face | `api.datasets` + `api.models` | none (optional `HF_TOKEN`) | datasets *and* models; downloads/likes → authority |
| arXiv | `export.arxiv.org/api` (Atom XML) | none | requires the `.../api` path; returns **only** abstracts, never full text — everything downstream is built around abstract-level data |
| GitHub | `search/repositories` | none (optional `GITHUB_TOKEN`) | anonymous = 60 req/hr → visible "rate-limited" chip when exhausted |
| Zenodo | Records REST API | none | downloads → authority |
| Semantic Scholar | Graph API `paper/search` | none | citations → authority; shares a throttled anonymous pool |
| data.gov | current catalog search API (DCAT/OpenSearch JSON) | none | the legacy CKAN endpoint was retired in 2025 |
| OpenML | REST resource-list API | none | resource-list based, not keyword-search — see below |
| Kaggle | REST API (`/api/v1/datasets/list`, `/kernels/list`) | HTTP Basic: shared key, or personal key | datasets + notebooks; see the handoff section above |

### OpenML: degrading gracefully

OpenML's REST API is **resource-list based**, not a general keyword-search
endpoint. There is no `/data/list/search`. It requires the `.../json/` path
(the default is XML), and its only name filter, `data_name`, is an *exact*
match that returns HTTP 412 when nothing matches. All reads are anonymous.

So `src/sources/openml.ts` searches in tiers and degrades gracefully:

1. exact dataset-name match (`data_name/{query}`);
2. exact match per query token, unioned;
3. client-side **name-substring** match over the active catalog as the final
   fallback.

### arXiv: abstract-only, by design

The arXiv Atom API returns **title + abstract + authors + categories — never
the full paper text**. Everything downstream (ranking's relevance signal,
dedupe, snippets) is deliberately designed around abstract-level data.

## Environment

Copy `.env.example` to `.env.local` only if you want to override defaults.
Optional knobs:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CAIRN_CACHE_PATH` | `.cairn/cache.db` | SQLite cache location (auto-switches to `/tmp` on Vercel). Legacy `DATAFORGE_CACHE_PATH` is still honoured. |
| `HF_TOKEN` | — | Optional HF read token (gated repos / higher rate limits) |
| `GITHUB_TOKEN` | — | Optional GitHub token: raises search from 60 → 5,000 req/hr |
| `KAGGLE_USERNAME` / `KAGGLE_KEY` | — | Optional **shared** Kaggle credentials that let everyone search Kaggle |
| `KAGGLE_SHARED_BUDGET` | `120` | Estimated shared-key requests per window before handoff |
| `KAGGLE_SHARED_WINDOW_MIN` | `60` | Rolling window for the shared budget |
| `GROQ_API_KEY` | — | Enables Discuss mode + AI Insight (without it those features stay quietly off) |
| `GROQ_MODEL` | `llama-3.1-8b-instant` | Model for all Groq calls. Free-tier default ≈ 14,400 req/day; raise to e.g. `llama-3.3-70b-versatile` if your key has room |
| `AI_INSIGHT_DAILY_CAP` | `50` | Max AI Insight generations per day across all users |

The app is fully functional anonymously in Basic mode. GitHub just shows a
rate-limited chip once its free 60/hr budget is gone unless a token is set.

## Notes & limits

- **Caching**: each source's normalized response is cached ~2h keyed by
  `source:query:type` in SQLite, with a 100-entry in-process LRU on top. On
  Vercel the cache lives in `/tmp` and is per-lambda-instance — still free, just
  not globally shared. Intent expansions (7d) and AI Insights (21d, cross-user)
  are cached in the same SQLite file.
- **Groq free-tier honesty**: Cairn reads Groq's real `x-ratelimit-*` headers on
  every response and queues AI work once either axis reports <20% headroom. The
  intent/insight features always degrade to a calm state rather than an error.
- **Preview proxy**: allows HTTP range-fetching only from the integrated
  providers (plus `*.gov` hosts). It never stores files. If you self-host and
  want a wider allowlist, edit `ALLOWED_HOST_SUFFIXES` in
  `src/app/preview/route.ts`.
- **Kaggle keys are per-device**: personal keys live only in your browser
  (encrypted) and are sent straight to Kaggle for your search; the server never
  persists them.
- **Papers With Code** is not integrated: Meta shut it down in July 2025 and it
  now redirects to HF Trending Papers — not worth scraping a redirect.

## Deploy to Vercel (free tier)

The app is ready to deploy as-is:

```bash
npx vercel
```

or push to GitHub and import the repo at https://vercel.com/new. No build
settings or environment variables are required. For Kaggle in production,
either set the shared key pair or leave it unset (Kaggle then only appears if a
user connects their own key after a shared budget — or never, in a fully
anonymous deploy).

## Roadmap

- More sources implementing `SourceAdapter` (the interface is trivial).
- Ranked snippet feedback / search history in the UI.
- A "deep dive" mode that expands individual results into related items.