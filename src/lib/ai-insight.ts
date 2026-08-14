import Database from "better-sqlite3";
import { createHash } from "node:crypto";
import { initSqlite } from "./sqlite";
import { groqChat, GroqRateLimitedError, GroqUnavailableError } from "./groq";
import { recordGroqRate, groqShouldQueue } from "./rate-tracker";

/**
 * "AI Insight" — a short, per-result trust snapshot produced by Groq.
 *
 * Design:
 * - Cross-user SQLite cache keyed by `sha1(source|sourceId)`, TTL 21 days, so
 *   the same result is only ever explained once per user AND shared across
 *   users (the most popular results are explained once, ever).
 * - Daily cap (AI_INSIGHT_DAILY_CAP, default 50/day) so the free Groq tier
 *   (14.4k req/day for the model below) is never blown by one user.
 * - Rate-aware: when Groq reports <20% headroom (rate-tracker.ts) we report
 *   "queued" instead of burning a doomed call.
 * - Every failure degrades to a benign status — never a thrown error.
 *
 * max_tokens is kept small (~200) on purpose: insights are 1 headline +
 * ~100 words, which is the right cost/benefit for the free tier.
 */

export interface AiInsight {
  headline: string;
  detail: string;
}

export type InsightStatus = "ok" | "queued" | "daily-limit" | "unavailable" | "error";

export interface InsightOutcome {
  status: InsightStatus;
  key?: string;
  insight?: AiInsight;
}

export interface InsightRequest {
  source: string;
  sourceId: string;
  title: string;
  description: string;
  snippet?: string;
  metadata?: Record<string, string | number | null>;
}

let db: Database.Database | null = null;

const CACHE_TTL_MS = 21 * 24 * 60 * 60 * 1000;
const DAILY_CAP = Number(process.env.AI_INSIGHT_DAILY_CAP ?? 50);
const MAX_TOKENS = 200;

function getDb(): Database.Database | null {
  if (!db) {
    db = initSqlite(`
      CREATE TABLE IF NOT EXISTS ai_insights (
        result_key TEXT PRIMARY KEY,
        payload TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS ai_insight_daily (
        date TEXT PRIMARY KEY,
        count INTEGER NOT NULL
      );
    `);
  }
  return db;
}

export function insightKey(source: string, sourceId: string): string {
  return createHash("sha1").update(`${source}|${sourceId}`).digest("hex");
}

function today(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function aiInsightDailyRemaining(now = Date.now()): number {
  if (DAILY_CAP <= 0) return 0;
  const handle = getDb();
  if (!handle) return DAILY_CAP;
  const row = handle
    .prepare("SELECT count FROM ai_insight_daily WHERE date = ?")
    .get(today(now)) as { count: number } | undefined;
  return Math.max(0, DAILY_CAP - (row?.count ?? 0));
}

function consumeDaily(now = Date.now()): void {
  const handle = getDb();
  if (!handle) return;
  handle
    .prepare(
      `INSERT INTO ai_insight_daily (date, count) VALUES (?, 1)
       ON CONFLICT(date) DO UPDATE SET count = count + 1`,
    )
    .run(today(now));
}

function cacheLookup(key: string, now = Date.now()): AiInsight | null {
  const handle = getDb();
  if (!handle) return null;
  const row = handle
    .prepare("SELECT payload, created_at FROM ai_insights WHERE result_key = ?")
    .get(key) as { payload: string; created_at: number } | undefined;
  if (!row) return null;
  if (now - row.created_at > CACHE_TTL_MS) {
    handle.prepare("DELETE FROM ai_insights WHERE result_key = ?").run(key);
    return null;
  }
  try {
    const parsed = JSON.parse(row.payload) as AiInsight;
    if (typeof parsed.headline === "string" && typeof parsed.detail === "string") return parsed;
  } catch {
    /* fall through to regenerate */
  }
  return null;
}

function trim(text: string | undefined | null, max: number): string {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function contextFrom(req: InsightRequest): string {
  const parts = [`Title: ${trim(req.title, 140)}`];
  if (req.description) parts.push(`Description: ${trim(req.description, 320)}`);
  if (req.snippet) parts.push(`Usage snippet: ${trim(req.snippet, 240)}`);
  if (req.metadata) {
    const meta = Object.entries(req.metadata)
      .filter(([, v]) => v !== null && v !== undefined && v !== "")
      .map(([k, v]) => `${k}=${v}`)
      .join(", ");
    if (meta) parts.push(`Metadata: ${trim(meta, 240)}`);
  }
  return parts.join("\n");
}

const SYSTEM_PROMPT = [
  "You evaluate one search result (dataset, paper, model, or code repo) for a ",
  "researcher deciding whether it is worth downloading and reusing.",
  "Respond ONLY with JSON: {\"headline\": \"...\", \"detail\": \"...\"}.",
  "Rules:",
  "- headline: one hard-hitting takeaway, <= 60 chars, no quotes.",
  "- detail: 2-3 sentences, <= 100 words. Assess freshness, scale/popularity, ",
  "and whether the metadata suggests it is reproducible and safe to reuse.",
  "- Be honest about red flags (old last-update, tiny popularity, missing license).",
  "- Never invent facts not present in the provided context.",
].join(" ");

export async function getAiInsight(req: InsightRequest, opts: { signal?: AbortSignal } = {}): Promise<InsightOutcome> {
  const key = insightKey(req.source, req.sourceId);

  const cached = cacheLookup(key);
  if (cached) return { status: "ok", key, insight: cached };

  if (aiInsightDailyRemaining() <= 0) {
    return { status: "daily-limit", key };
  }
  if (groqShouldQueue()) {
    return { status: "queued", key };
  }

  try {
    const user = contextFrom(req);
    if (!user) return { status: "error", key };

    const result = await groqChat(SYSTEM_PROMPT, user, {
      maxTokens: MAX_TOKENS,
      temperature: 0.4,
      json: true,
      signal: opts.signal,
    });
    recordGroqRate(result.rate);

    const parsed = safeParse(result.content);
    if (!parsed) return { status: "error", key };

    consumeDaily();
    getDb()
      ?.prepare(
        "INSERT INTO ai_insights (result_key, payload, created_at) VALUES (?, ?, ?)",
      )
      .run(key, JSON.stringify(parsed), Date.now());

    return { status: "ok", key, insight: parsed };
  } catch (err) {
    if (err instanceof GroqRateLimitedError) {
      // One quiet retry after a short backoff — 429s are usually momentary.
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const result = await groqChat(SYSTEM_PROMPT, contextFrom(req), {
          maxTokens: MAX_TOKENS,
          temperature: 0.4,
          json: true,
          signal: opts.signal,
        });
        recordGroqRate(result.rate);
        const parsed = safeParse(result.content);
        if (!parsed) return { status: "queued", key };
        consumeDaily();
        getDb()
          ?.prepare(
            "INSERT INTO ai_insights (result_key, payload, created_at) VALUES (?, ?, ?)",
          )
          .run(key, JSON.stringify(parsed), Date.now());
        return { status: "ok", key, insight: parsed };
      } catch {
        return { status: "queued", key };
      }
    }
    if (err instanceof GroqUnavailableError) {
      return { status: "unavailable", key };
    }
    return { status: "error", key };
  }
}

function safeParse(raw: string): AiInsight | null {
  try {
    const parsed = JSON.parse(raw) as AiInsight;
    if (
      typeof parsed.headline === "string" &&
      parsed.headline.length > 0 &&
      typeof parsed.detail === "string" &&
      parsed.detail.length > 0
    ) {
      return { headline: parsed.headline.slice(0, 120), detail: parsed.detail.slice(0, 600) };
    }
  } catch {
    /* fall through */
  }
  return null;
}