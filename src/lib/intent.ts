import Database from "better-sqlite3";
import { mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { groqChat, GroqRateLimitedError, GroqUnavailableError } from "./groq";
import { recordGroqRate } from "./rate-tracker";

/**
 * Query-intent expansion ("Discuss mode").
 *
 * A single natural-language query can mean very different things to different
 * sources ("3d printing filaments" → raw .stl/.gcode files on GitHub vs. a
 * materials dataset on Kaggle). `expandQuery` asks Groq to return 1–4 related
 * search terms (the original always first) and Cairn fans out over them,
 * merging the results so the user gets a fuller picture.
 *
 * Behaviour on any Groq failure is strictly *silent fallback*: the original
 * query is used alone and Basic-mode behaviour is unchanged. Expansions are
 * cached in SQLite for 7 days (and served stale for up to 7 more), so repeat
 * queries stop consuming Groq quota almost immediately.
 */

export interface IntentExpansion {
  terms: string[];
  explanation: string;
}

let db: Database.Database | null = null;

const STALE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function getDb(): Database.Database {
  if (db) return db;
  const isVercel = process.env.VERCEL === "1";
  const file =
    process.env.CAIRN_CACHE_PATH ??
    process.env.DATAFORGE_CACHE_PATH ??
    path.join(process.cwd(), ".cairn", "cache.db");
  const dir = path.dirname(file);
  if (!isVercel && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  db = new Database(file);
  db.exec(`
    CREATE TABLE IF NOT EXISTS intent_cache (
      query TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
  return db;
}

interface IntentRow {
  payload: string;
  created_at: number;
}

function parsePayload(raw: string): IntentExpansion | null {
  try {
    const parsed = JSON.parse(raw) as { terms?: unknown; explanation?: unknown };
    if (
      !Array.isArray(parsed.terms) ||
      parsed.terms.length < 1 ||
      !parsed.terms.every((t) => typeof t === "string" && t.length > 0)
    ) {
      return null;
    }
    return {
      terms: (parsed.terms as string[]).slice(0, 4),
      explanation:
        typeof parsed.explanation === "string" ? parsed.explanation : "",
    };
  } catch {
    return null;
  }
}

const SYSTEM_PROMPT = [
  "You expand a user's search query into related search terms for federated ",
  "search across mixed data sources (datasets, papers, code, ML models).",
  "Respond ONLY with JSON: {\"terms\": [\"...\"], \"explanation\": \"short text\"}.",
  "Rules:",
  "- Always include the user's exact original query as terms[0].",
  "- Add at most 3 additional paraphrases or closely-related alternative phrasings.",
  "- Terms must be plain search phrases (no operators, no URLs, lowercase).",
  "- explanation: one short sentence, e.g. \"expanded to: rna-seq data, transcriptomics\".",
].join(" ");

export async function expandQuery(
  query: string,
  opts: { signal?: AbortSignal; fresh?: boolean } = {},
): Promise<IntentExpansion> {
  const trimmed = query.trim();
  const fallback: IntentExpansion = { terms: [trimmed], explanation: "" };
  if (!trimmed) return fallback;

  const now = Date.now();
  const row = opts.fresh
    ? undefined
    : (getDb()
        .prepare("SELECT payload, created_at FROM intent_cache WHERE query = ?")
        .get(trimmed) as IntentRow | undefined);

  if (row) {
    const parsed = parsePayload(row.payload);
    if (parsed) {
      if (now - row.created_at < STALE_TTL_MS) {
        return parsed;
      }
      getDb().prepare("DELETE FROM intent_cache WHERE query = ?").run(trimmed);
    }
  }

  try {
    const user = [
      `Query: "${trimmed}"`,
      'Return JSON: {"terms": [original, related...], "explanation": "..."}',
    ].join("\n");
    const result = await groqChat(SYSTEM_PROMPT, user, {
      maxTokens: 180,
      temperature: 0.3,
      json: true,
      signal: opts.signal,
    });
    recordGroqRate(result.rate);

    let expansion = parsePayload(result.content);
    if (!expansion) return fallback;

    // The original query must always be first — a model that reorders terms
    // otherwise changes which term the source-status chip is keyed to.
    if (expansion.terms[0]?.toLowerCase() !== trimmed.toLowerCase()) {
      expansion = {
        terms: [trimmed, ...expansion.terms.filter((t) => t.toLowerCase() !== trimmed.toLowerCase())].slice(0, 4),
        explanation: expansion.explanation,
      };
    }

    getDb()
      .prepare(
        "INSERT INTO intent_cache (query, payload, created_at) VALUES (?, ?, ?)",
      )
      .run(trimmed, JSON.stringify(expansion), now);

    return expansion;
  } catch (err) {
    if (err instanceof GroqRateLimitedError || err instanceof GroqUnavailableError) {
      // Silent fallback — Basic-mode behaviour is preserved.
      return fallback;
    }
    return fallback;
  }
}