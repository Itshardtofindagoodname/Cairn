# DataForge

A federated dataset, model & paper search engine — "Google for open data and
ML". One search bar fans out to **Hugging Face**, **arXiv**, **GitHub**,
**Zenodo**, **Semantic Scholar**, **data.gov** and **OpenML** in parallel,
streams results back live over **SSE** as each source responds, ranks every
result with an explainable multi-signal score, and **stitches the results into
a cross-source provenance graph** so you can see that an arXiv paper, the
dataset it introduced, the models trained on it and the repo implementing it
actually refer to the same thing.

No paid APIs. No LLM calls for extraction or ranking — the relevant algorithms
are hand-written. No database server — caching runs on a local SQLite file.

## Run it (2 commands)

```bash
npm install
npm run dev
```

Open http://localhost:3000. That's it — every integrated source works
anonymously. `.env.example` documents the two *optional* knobs (`HF_TOKEN`,
`GITHUB_TOKEN`); neither is required.

> Node.js 18.17+ required (better-sqlite3 is a native module; prebuilt binaries
> ship for common platforms).

## What's inside

### Streaming fan-out

```
          GET /api/search?q=…&source=…        (Next.js Route Handler, Node)
           │
browser ───┤ fans out in parallel ──▶ Hugging Face    ◀── datasets + models
(SSE)      │                           arXiv          ◀── papers (abstracts)
           │                           GitHub         ◀── repos (stars)
           │                           Zenodo         ◀── datasets (downloads)
           │                           Semantic Scholar ◀─ papers (citations)
           │                           data.gov        ◀─ US gov datasets
           │                           OpenML          ◀─ ML datasets
           │   each source pushes its normalized, RANKED results as they arrive
           │   failures → "unavailable"; rate limits → "rate-limited" chip
           ▼
      SQLite cache (better-sqlite3, 2h TTL, per-source)
```

- Each source resolves independently in a `Promise.allSettled` fan-out, so a
  slow or failing API never blocks the others.
- Results are streamed over a native `EventSource`, so the first source to
  answer appears immediately rather than after the slowest one.
- A 2-hour per-source SQLite cache keeps repeated searches free and quiet.

### Provider-scope dropdown

A Radix `Select` next to the search bar narrows the fan-out to **"All sources"**
(default) or any single source (each with its own lucide icon and color from
`sourceMeta.ts`). When you pick one source, `/api/search` **does not fetch the
others at all** — it's a real latency win, not a cosmetic filter. The selection
is persisted in the URL (`?source=arxiv`), so a scoped search is shareable and
restores on load.

### Ranking engine

Every result gets a transparent score made of **three named signals blended
with explicit weights** — no black box:

```
total = 0.50 × relevance  +  0.30 × authority  +  0.20 × recency
```

- **Relevance (TF-IDF)** — `src/lib/tfidf.ts` is a hand-implemented
  term-frequency × inverse-document-frequency scorer (no ML library). It scores
  each result's title + description against the query over that batch's corpus
  and normalizes so the best result in a batch is 1.0, making scores comparable
  across sources regardless of corpus size.
- **Authority (popularity)** — each source exposes its own metric (HF
  downloads/likes, Zenodo downloads, GitHub stars, Semantic Scholar citations).
  Values are `log10(1+x)`-scaled then min-max normalized within the batch, so a
  million-download dataset doesn't swamp a well-cited paper with "only" tens of
  thousands of citations.
- **Recency (half-life decay)** — published/updated dates decay exponentially
  with a tunable half-life (`RECENCY_HALF_LIFE_DAYS = 730`, i.e. ~2 years). An
  item at the half-life scores 0.5; ancient items decay smoothly toward zero;
  unknown dates get a neutral 0.5. No hardcoded cliff.

Ranking runs **as a streaming post-process per batch**: each source's results
are scored and sorted the moment they arrive, never in a final blocking step.

Each card shows its score (e.g. `0.64`) as a chip; hovering opens a Radix
popover breaking it into **Relevance · Authority · Recency** with micro-bars —
the formula is visible on every result, not a hidden detail.

### Improved dedupe & merge

Merging now combines multiple signals instead of a naive title match:

- **Exact DOI or arXiv-ID match** → definitively the same item.
- **Strong token-overlap title match** (Jaccard) → same item.
- **Moderate title match + real author/creator overlap** → same item (weaker
  title + shared authors is strong evidence).

Merged cards keep the **highest-ranked origin's metadata as primary** and list
every other source under "Also on: HF, Zenodo". Each origin keeps its own
snippet, license and arXiv/DOI, so you don't lose provenance information by
merging.

### Code snippets, previews, licenses

- Per-source copy-paste loading code (`datasets.load_dataset(...)`,
  `openml.datasets.get_dataset(...)`, `git clone …`, `pandas.read_csv(…)`, …).
- Preview: CSV datasets fetch the first ~50KB via an HTTP `Range` request
  (PapaParse); HF models show `config.json`. Files are never re-hosted.
- Every license string is normalized to `MIT · Apache-2.0 · CC-BY · CC-BY-NC ·
  Public Domain · Unknown`, with a "commercially usable only" filter.

## The centerpiece: the cross-source provenance graph

> The problem this project is built to tackle: a paper, the dataset it
> introduced, the models trained on that dataset, and the code implementing it
> are usually scattered across arXiv, HF, GitHub, Zenodo, Semantic Scholar and
> OpenML **with no shared IDs connecting them**. DataForge stitches them
> together.

The graph comes from a **deterministic, rule-based pipeline** (no LLM calls —
the point is that the extraction is real, inspectable logic). It lives in two
modules:

### 1. Entity extraction — `src/lib/entities.ts`

From each result's title + description/abstract (+ the GitHub README), we pull
candidate dataset/model/paper names:

- a **curated seed vocabulary** of well-known ML names (`imagenet`, `cifar-10`,
  `bert`, `clip`, …) matched case-insensitively as substrings;
- **known-pattern regexes** for compact ML-style names (`Word-NNNk`, `X-v2`,
  bare acronyms like `ViT`, `YOLOv8`);
- **quoted names** such as `"my-dataset"` or `` `text-davinci-003` ``;
- **capitalized multi-word noun phrases** (Title Case chains).

Every mention gets a kind (dataset/model/paper/unknown) and a heuristic
confidence, and is normalized for cross-source matching.

### 2. Cross-source resolution & graph — `src/lib/graph.ts`

Given results from different sources that mention overlapping entities, a
small in-memory graph is built per search session:

- **Nodes** = individual results (papers, datasets, models, repos), colored and
  iconed by source and type.
- **Edges** = one of three honest relationship kinds:
  - `same-entity-as` — both cards' *text* references the same normalized entity
    name, or they share an exact arXiv ID / DOI;
  - `mentions` — one card's text references another card's own title (e.g. an
    arXiv abstract naming "ImageNet" while a HF card is titled ImageNet);
  - `same-author-as` — author/creator sets overlap.

Resolution couples the **exact DOI/arXiv-ID** signal from the dedupe stage with
**normalized string matching** (case, punctuation and version-suffix
insensitive, via `normalizeEntityName`). Every edge carries a `confidence` and a
human-readable `reason`, both shown in the UI.

### The UI

A **List / Graph** toggle (lucide `List` / `Network`) switches between the
result cards and an interactive graph. The graph uses **d3-force** for a
lightweight force-directed layout over a custom SVG render — no physics engine
hand-rolled, no paid dependency:

- nodes are colored/iconed by source (legend bottom-right) and by type;
- edges are colored/labeled by relationship kind;
- **hovering an edge** shows *why* it exists ("shared arXiv id: 2103.00112" /
  "title match: 0.89" / "both mention "ImageNet"");
- **clicking a node** opens that result's full card inline.

### Honest limits (a feature, not a weakness)

Entity resolution across sources with no shared IDs is genuinely hard, and we
say so out loud rather than claiming a "solved" system:

- **False positives** — a capitalized phrase like "State Of The Art" can be
  caught as a (weak) entity, or two unrelated "ImageNet" variants can be linked.
  Rule-based extraction over-generates by design.
- **False negatives** — a repo that never spells the dataset's name, or a paper
  using an alias not in the seed vocabulary, simply won't resolve. Adding names
  to `SEED_VOCAB` immediately improves recall.

All edges are explained and confidence-weighted in the UI so you can judge a
link for yourself. This is a foundation for entity linking, not an overclaim —
which is exactly the right thing to demonstrate when you understand how hard
the problem actually is.

## Project structure

```
src/
├── app/
│   ├── api/
│   │   ├── search/route.ts     # SSE fan-out search (scopes to ?source=)
│   │   └── preview/route.ts    # ~50KB Range-fetch preview proxy
│   ├── layout.tsx
│   └── page.tsx                # home page (renders SearchApp)
├── components/                 # search UI (client components)
│   ├── SearchApp.tsx           # SSE orchestration + state + view toggle
│   ├── SearchBar.tsx
│   ├── SourceSelect.tsx        # Radix provider-scope dropdown
│   ├── SourceTracker.tsx       # per-source status chips ("rate-limited")
│   ├── ResultCard.tsx          # normalized card (score popover, origins)
│   ├── ResultList.tsx
│   ├── GraphView.tsx           # d3-force provenance graph
│   ├── ScorePopover.tsx        # ranking breakdown (Relevance/Authority/Recency)
│   ├── PreviewPanel.tsx
│   ├── CodeBlock.tsx
│   ├── LicenseFilter.tsx
│   └── sourceMeta.ts           # source/type/license colors, icons, labels
├── lib/
│   ├── types.ts                # shared types (SourceResult, MergedResult, …)
│   ├── cache.ts                # better-sqlite3 cache (2h TTL)
│   ├── tfidf.ts                # hand-implemented TF-IDF (relevance signal)
│   ├── ranking.ts              # weighted blend: relevance/authority/recency
│   ├── dedupe.ts               # exact-ID + title + author-overlap matching
│   ├── merge.ts                # merge into cards, primary = highest rank
│   ├── entities.ts             # rule-based dataset/model/paper extraction
│   ├── graph.ts                # cross-source provenance graph builder
│   ├── license.ts              # license normalization + commercial map
│   ├── snippets.ts             # per-source code snippet generator
│   ├── fetch.ts                # JSON/text fetch w/ timeout + abort
│   └── format.ts               # bytes/params/hash helpers
└── sources/                    # one adapter per source
    ├── types.ts                # SourceAdapter interface + SourceRateLimitedError
    ├── huggingface.ts
    ├── arxiv.ts                # Atom XML, abstract-only, no key
    ├── github.ts               # optional GITHUB_TOKEN; rate-limit aware
    ├── zenodo.ts
    ├── semanticscholar.ts      # citations feed ranking
    ├── datagov.ts
    ├── openml.ts               # resource-list-based w/ graceful fallback
    └── index.ts                # registry
```

**Adding a source** = implement `SourceAdapter` (`search(query, signal):
Promise<SourceResult[]>`), surface a `popularity` value for ranking, and add it
to the `SOURCES` registry in `src/sources/index.ts`. The UI, dropdown, ranking,
dedupe, graph and snippets adapt automatically.

## How each source is queried

| Source | API | Auth | Notes |
| --- | --- | --- | --- |
| Hugging Face | `api.datasets` + `api.models` | none (optional `HF_TOKEN`) | datasets *and* models; downloads/likes → authority |
| arXiv | `export.arxiv.org/api` (Atom XML) | none | requires the `.../api` path; returns **only** abstracts, never full text — everything downstream is built around abstract-level data |
| GitHub | `search/repositories` | none (optional `GITHUB_TOKEN`) | anonymous = 60 req/hr → visible "rate-limited" chip when exhausted; README fetched for entity extraction |
| Zenodo | Records REST API | none | downloads → authority |
| Semantic Scholar | Graph API `paper/search` | none | citations → authority; shares a throttled anonymous pool |
| data.gov | current catalog search API (DCAT/OpenSearch JSON) | none | the legacy CKAN endpoint was retired in 2025 |
| OpenML | REST resource-list API | none | resource-list based, not keyword-search — see below |

### OpenML: degrading gracefully (fixed)

OpenML's REST API is **resource-list based**, not a general keyword-search
endpoint like the others. There is no `/data/list/search`. It requires the
`.../json/` path (the default is XML), and its only name filter, `data_name`, is
an *exact* match that returns HTTP 412 when nothing matches. All reads are
anonymous.

So `src/sources/openml.ts` searches in tiers and degrades gracefully instead of
erroring out on free-text queries:

1. exact dataset-name match (`data_name/{query}`);
2. exact match per query token, unioned;
3. client-side **name-substring** match over the active catalog (the closest the
   API allows to keyword search) as the final fallback.

### arXiv: abstract-only, by design

The arXiv Atom API returns **title + abstract + authors + categories — never
the full paper text**. Every downstream component (ranking's relevance signal,
entity extraction for the graph) is deliberately designed around
abstract-level data. This isn't a limitation to hack around; the abstract is
precisely the text that surfaces the dataset/model names the provenance graph
needs.

## Environment

Copy `.env.example` to `.env.local` only if you want to override defaults.
Optional knobs:

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATAFORGE_CACHE_PATH` | `.dataforge/cache.db` | SQLite cache location (auto-switches to `/tmp` on Vercel) |
| `HF_TOKEN` | — | Optional HF read token (gated repos / higher rate limits) |
| `GITHUB_TOKEN` | — | Optional GitHub token: raises search from 60 → 5,000 req/hr |

The app is fully functional anonymously — GitHub just shows a rate-limited chip
once its free 60/hr budget is gone unless a token is set.

## Notes & limits

- **Caching**: each source's normalized response is cached ~2h keyed by
  `source:query`. On Vercel the cache lives in `/tmp` and is per-lambda-instance
  — still free, just not globally shared.
- **Preview proxy**: allows HTTP range-fetching only from the integrated
  providers (plus `*.gov` hosts). It never stores files. If you self-host and
  want a wider allowlist, edit `ALLOWED_HOST_SUFFIXES` in
  `src/app/preview/route.ts`.
- **Provenance graph**: in-memory per search session, not a persistent graph
  database — intentionally scoped, this isn't Neo4j. See the honest-limits
  section above for what it can and can't resolve.
- **Papers With Code** is not integrated: Meta shut it down in July 2025 and it
  now redirects to HF Trending Papers — not worth scraping a redirect.

## Deploy to Vercel (free tier)

The app is ready to deploy as-is:

```bash
npx vercel
```

or push to GitHub and import the repo at https://vercel.com/new. No build
settings or environment variables are required.

## Roadmap

- More seed vocabulary in `entities.ts` for better graph recall.
- Additional sources implementing `SourceAdapter` (the interface is trivial).
- Ranked snippet feedback / search history in the UI.