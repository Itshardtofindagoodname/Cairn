/**
 * Minimal Groq chat-completions client.
 *
 * Endpoint: https://api.groq.com/openai/v1/chat/completions (OpenAI-compatible).
 *
 * Model note (free tier, verified 2026): `llama-3.1-8b-instant` has the most
 * permissive free-tier quota — 30 RPM / 6,000 TPM / **14,400 requests/day** —
 * which is exactly right for Cairn's many-small-call usage (intent expansion
 * ~150 tokens, AI Insight ~200 tokens per result). Override via GROQ_MODEL if
 * you prefer a higher-quality model (e.g. `llama-3.3-70b-versatile`, 1,000 RPD).
 *
 * Every response's `x-ratelimit-*` headers are captured and pushed into the
 * persistent rate tracker (src/lib/rate-tracker.ts) so the app can queue work
 * before hitting a 429, and retry once on an actual 429.
 */

export interface GroqRateInfo {
  remainingRequests: number | null;
  limitRequests: number | null;
  remainingTokens: number | null;
  limitTokens: number | null;
}

export class GroqUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GroqUnavailableError";
  }
}

export class GroqRateLimitedError extends Error {
  constructor(
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GroqRateLimitedError";
  }
}

export interface GroqResult {
  content: string;
  rate: GroqRateInfo;
}

interface GroqOptions {
  maxTokens?: number;
  temperature?: number;
  json?: boolean;
  signal?: AbortSignal;
}

export const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.1-8b-instant";

function parseRateHeaders(headers: Headers): GroqRateInfo {
  const num = (name: string): number | null => {
    const raw = headers.get(name);
    if (raw === null) return null;
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  };
  return {
    remainingRequests: num("x-ratelimit-remaining-requests"),
    limitRequests: num("x-ratelimit-limit-requests"),
    remainingTokens: num("x-ratelimit-remaining-tokens"),
    limitTokens: num("x-ratelimit-limit-tokens"),
  };
}

/** Call Groq once. Never throws on rate-limit/errors that callers can degrade from. */
export async function groqChat(
  system: string,
  user: string,
  options: GroqOptions = {},
): Promise<GroqResult> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new GroqUnavailableError("GROQ_API_KEY is not configured");
  }

  const { maxTokens = 200, temperature = 0.2, json = false, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: maxTokens,
        temperature,
        ...(json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: controller.signal,
      cache: "no-store",
    });

    const rate = parseRateHeaders(res.headers);

    if (res.status === 429) {
      const retryAfterRaw = res.headers.get("retry-after");
      const retryAfter = retryAfterRaw ? Number(retryAfterRaw) : undefined;
      throw new GroqRateLimitedError(
        "Groq rate limit reached",
        Number.isFinite(retryAfter) ? retryAfter : undefined,
      );
    }
    if (!res.ok) {
      throw new GroqUnavailableError(`Groq HTTP ${res.status}`);
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const content = body.choices?.[0]?.message?.content ?? "";
    if (!content) throw new GroqUnavailableError("Groq returned empty content");

    return { content, rate };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}