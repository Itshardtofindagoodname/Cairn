# Cairn — App Scorecard

> Score date: 2026-08-14 · App: Cairn (Next.js 16, `dataforge/`) · Scale: 1–10
> per axis. Everything below was verified against the current source tree.

## Summary

| Axis | Score | Verdict |
| --- | --- | --- |
| Tests | **7 / 10** | 9 suites / 89 unit tests (Jest + ts-jest). No integration/E2E/CI yet. |
| SEO | **8.5 / 10** | Rich metadata, structured data, sitemap + robots. Weak on surface area. |
| AEO (Answer Engine Opt.) | **8.5 / 10** | `llms.txt`, AI-bot allowlist, FAQPage schema. |
| GEO (Generative Engine Opt.) | **8 / 10** | Citeable structured data + LLM-friendly docs; no provenance/geo markup. |
| Security | **7 / 10** | Good crypto handling of keys; no CSP/HSTS, no per-client rate limit. |
| Privacy | **9 / 10** | No accounts, no analytics, no query logs, on-device key encryption. |
| Scalability | **6 / 10** | Clever caching, but serverless-per-instance SQLite + long SSE limits growth. |
| Performance | **7.5 / 10** | Streaming, LRU + SQLite cache, range-fetch previews. |
| Accessibility | **7.5 / 10** | Radix primitives, aria-hidden decorative icons, semantic h1. |
| Maintainability | **8.5 / 10** | Clean adapter architecture, typed, excellent README, 89 unit tests. |

**Overall: ~7.7 / 10** — a well-architected, privacy-forward app with strong
metadata/AEO work and now a real unit-test layer over its core algorithms,
dragged down mainly by a caching design that does not share state across
serverless instances.

---

## Tests — 7 / 10

- **Jest + ts-jest** wired up (`jest.config.js`, `npm test`, node env,
  `@jest/globals` imports so ESLint stays clean).
- **9 suites / 89 tests** covering every pure-logic module:
  `tokenize`, `tfidf`, `ranking`, `dedupe`, `merge`, `license`, `format`,
  `lru-cache`, and the `reproducibility/score` engine (time-based cases use
  fake timers).
- Writing the tests surfaced **three real bugs, now fixed**:
  1. `dedupe.ts` — `normalizeId` stripped `doi`/`arxiv` but not their colons,
     so `"doi:10.5281/…"` normalized to `":10.5281/…"` and exact-ID merges
     silently never fired.
  2. `merge.ts` — cross-result comparison read `group.doi`/`group.arxivId`/
     `group.authors`, which were never stored on the group (they live in
     `origins[0]`), so DOI/author-based dedupe never triggered.
  3. `license.ts` — `"CC BY-NC 4.0"` (space form) fell through to `CC-BY`.

**Gaps** (why not higher): no component/`jsdom` tests, no API-route
integration tests (e.g. `/api/search` with mocked providers), no
`kaggle-store` crypto round-trip test, no E2E, and the suite is not yet wired
into CI.

**Recommendations:** add an integration test that hits `/api/search` with a
mocked provider; a `kaggle-store` AES round-trip test; a smoke E2E for the
search flow; run `npm test` in CI alongside `npm run lint`.

---

## SEO — 8.5 / 10

**Strengths**
- Full `Metadata` object in `src/app/layout.tsx`: title template, description,
  keywords, authors/creator/publisher, canonical, OpenGraph, Twitter card, and
  a detailed `robots` block with `googleBot` `max-image-preview: large`.
- File conventions all present and correct: `robots.ts`, `sitemap.ts`,
  `manifest.ts`, `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx`
  (generated 1200×630 PNG — verified).
- Rich JSON-LD: `WebSite` **with `SearchAction`** (great for a search engine),
  `SoftwareApplication`, `Organization`, and a 6-item `FAQPage`.
- Query, scope, type and mode are persisted in the URL (`?q=&source=&type=`)
  so shareable/restorable state also maps to crawlable URL space.

**Gaps**
- Single page: sitemap lists only `/` (`src/app/sitemap.ts`). No per-route
  titles, no landing pages per provider/type (e.g. `/source/arxiv`), which caps
  organic surface area.
- No `hreflang`/i18n (fine for English-only, but no `alternates` languages).
- Generated icon/OG images have no cache-busting static filenames (runtime
  routes, acceptable on Next 16).

**Recommendations:** add provider/type landing routes, expand the sitemap, add
an `Organization` contact + `sameAs` links.

---

## AEO (Answer Engine Optimization) — 8.5 / 10

**Strengths**
- `public/llms.txt` and `public/llms-full.txt` serve clean, LLM-friendly
  summaries of what the app is, how it works, its sources and its limits.
- `src/app/robots.ts` **explicitly allowlists** answer-engine crawlers
  (GPTBot, OAI-SearchBot, ChatGPT-User, ClaudeBot, Claude-Web, anthropic-ai,
  PerplexityBot, Google-Extended, GeminiBot) — a deliberate AEO posture.
- `FAQPage` JSON-LD gives direct, citable answers to the questions people and
  engines actually ask ("Is Cairn free?", "Which sources?", "How is the score
  calculated?", "Does Cairn host datasets?").
- `SearchAction` schema tells engines the site is a search target.

**Gaps**
- No machine-readable `answer` blocks beyond the FAQ; no per-page LLM summaries
  in-page (the `llms.txt` content lives only in static files).
- `llms.txt` is not linked from the home page (engines usually discover it by
  convention, so minor).

---

## GEO (Generative Engine Optimization) — 8 / 10

Generative engines synthesize answers and prefer pages that are directly
citable. Cairn scores well because its claims are grounded in structured data
(FAQPage, SoftwareApplication featureList) and plain-language copy that quotes
providers rather than paraphrasing them. `llms.txt` + AI-crawler allowlisting
also help it get *ingested*.

**Gaps** for full GEO maturity:
- No `citation`, `ResearchProject`, or dataset-level schema to make individual
  results / the Reproducibility Score citable by generative engines.
- No `provenance`/source-attribution microdata on the results themselves
  (each card already shows "Also on:" origins — could be marked up).
- Provider names and score weights (the exact `0.50×0.30×0.20` blend) are
  described in prose, not in parseable schema.

---

## Security — 7 / 10

**Strengths**
- Kaggle personal keys: **AES-256-GCM** encrypted on-device; key in IndexedDB,
  ciphertext in localStorage; sent only as request-scoped headers for a single
  search; never persisted server-side (`src/lib/kaggle-store.ts`).
- Keys validated against the real Kaggle API before storage
  (`src/app/api/kaggle/validate/route.ts`).
- Preview proxy (`src/app/api/preview/route.ts`) is allowlist-restricted
  (integrated providers + `*.gov`) and never stores files; CSV previews use
  HTTP `Range` requests (bounded to ~50KB).
- The only `dangerouslySetInnerHTML` is the **server-side, static** JSON-LD
  (`src/app/layout.tsx`) — no user/provider HTML is ever injected; all result
  rendering is React-escaped.
- `public/.well-known/security.txt` present.

**Gaps**
- **No CSP**, HSTS, or other security headers (`next.config.ts` sets none).
- **No per-client rate limiting** on `/api/search` (only provider-quota guards:
  Kaggle shared budget, AI-insight daily cap, Groq headroom tracking). A client
  can fan out unlimited anonymous searches → provider abuse + cost.
- SQLite file (`better-sqlite3`) is an on-server cache; no auth boundary around
  `/api/liveness`, `/api/maintenance` (harmless, but an attacker can use them
  as an SSRF-ish probe of arbitrary URLs — verify the liveness route
  restricts which hosts it probes).

**Recommendations:** add CSP + HSTS via `next.config.ts` `headers()`; add a
simple in-memory/rate-limit guard on `/api/search`; confirm `/api/liveness`
host allowlist.

---

## Privacy — 9 / 10

- **No accounts, no analytics, no server-side query logs** (About + llms.txt
  state it; no tracking SDKs in the bundle).
- Searches are anonymous; provider responses are cached locally in SQLite
  (2h TTL) + LRU — caches store *responses*, not who asked.
- Cross-user AI Insight cache is keyed by `sha1(source|sourceId)` — no user
  identity attached (`src/lib/ai-insight.ts`).
- Personal Kaggle credentials never leave the device in plaintext and are only
  ever sent to Kaggle for the user's own search.
- No cookie/consent machinery needed because nothing is stored.

**Gaps:** privacy promises are self-documented but there is no dedicated
`/privacy` policy page (matters once shared publicly), and the shared Kaggle
key + provider IP addresses are visible to upstream providers by design.

---

## Scalability — 6 / 10

**Strengths**
- `Promise.allSettled` fan-out isolates slow/failing sources (`src/app/api/search/route.ts`).
- Two-tier cache: in-process LRU (100 entries, sub-ms) over a SQLite 2h TTL
  cache — cuts provider load dramatically for repeat queries.
- Intent expansions (7d) and AI Insights (21d, cross-user) cached in the same file.
- Conservative provider budgets (Kaggle shared budget, AI daily cap, Groq
  headroom <20% → queue) protect free-tier upstream quotas.

**Limits**
- On Vercel the SQLite cache is **per-lambda-instance** (README admits it) — at
  scale, cache hit-rate collapses and provider fan-out repeats per instance.
- SSE streams require a long-lived function; on serverless this ties up a
  function per search and can hit platform duration limits during slow
  multi-source responses.
- `better-sqlite3` is a native module in a single file — write contention once
  traffic grows; no horizontal story for the shared cache.
- No upstream/aggregate request coalescing across users (identical concurrent
  queries each hit providers).

**Recommendations:** move the cache to a shared KV/Redis layer (or accept
per-region sharding), add request coalescing per `query::source::type`, and
consider chunked/non-SSE polling fallback for very long searches.

---

## Performance — 7.5 / 10

- Results stream over fetch-based SSE as each source responds — first paint is
  fast and progressive (`src/lib/sse-client.ts`).
- Reproducibility liveness/maintenance probes are lazy (`IntersectionObserver`)
  and cached 24h; repro badge is instantly meaningful with neutral 0.5 fill.
- Preview proxy fetches only ~50KB via Range; files never re-hosted.
- LRU gives sub-ms back-to-back identical searches.
- Note: the header logo is now an inline lucide icon — no raster download for
  the page mark (removed the 1254×1254 PNG from the header path).

**Gaps:** the whole page is client-rendered search UI (`"use client"`), so
initial HTML for the search surface is thin; OG/icon generation runs at runtime
routes (prerendered statically here — fine).

---

## Accessibility — 7.5 / 10

- Radix primitives (dialog, select, toggle-group, switch, tooltip, popover)
  bring keyboard + ARIA behaviour by default.
- Decorative icons are `aria-hidden`; the brand mark is decorative next to the
  real `<h1>` "Cairn"; `lang="en"` set; focus-visible styles on interactive
  controls.
- Contrast: amber-on-zinc text used sparingly; muted `text-zinc-400/500` on
  `#09090b` is borderline for small text — worth an audit.

**Gaps:** no automated a11y test (axe) in CI; streaming results have no
`aria-live` region, so screen readers won't announce new cards as they arrive.

---

## Maintainability — 8.5 / 10

- One `SourceAdapter` interface per provider, registry-driven (`src/sources/index.ts`);
  adding a source auto-wires dropdown, ranking, dedupe and snippets.
- Clear layering (`sources` → `lib` → `components` → `app`), shared types,
  no dead code found, `eslint` clean.
- 89 unit tests guard the core algorithms and already caught three real bugs.
- Excellent README documenting architecture, env vars, deploy, and limits.
- The AGENTS/CLAUDE agent-rule files and `.env.example` are repo-hygiene wins.

**Gaps:** no CI pipeline running `npm test` yet, and some legacy-compat strings
(e.g. legacy `DATAFORGE_CACHE_PATH` env) that could be retired.

---

## Final notes

Highest-leverage fixes, in order: (1) ~~add automated tests~~ — done (89
unit tests, `npm test`); wire them into CI next, (2) add CSP + HSTS and a
`/api/search` rate guard, (3) move the cache to a shared store for real scale,
(4) expand SEO surface with provider/type landing pages, (5) add `aria-live`
to the streaming list.
