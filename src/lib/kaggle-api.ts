/**
 * Server-side Kaggle REST client, shared by the search adapter and the
 * validate route so both are guaranteed to construct the request identically
 * (same endpoint, same Basic-auth header, same headers).
 *
 * Auth: HTTP Basic `username:key` — exactly what the official kaggle client
 * sends (base64 of "username:key"). The key itself is never logged; only the
 * username is used to identify which credential path produced the call.
 */

const BASE = "https://www.kaggle.com/api/v1";
const FETCH_TIMEOUT_MS = 12_000;

export const DATASETS_LIST_URL = (q: string) =>
  `${BASE}/datasets/list?search=${encodeURIComponent(q)}&page=1&sortBy=hottest`;

export const KERNELS_LIST_URL = (q: string) =>
  `${BASE}/kernels/list?search=${encodeURIComponent(q)}&page=1&sortBy=hotness`;

export interface KaggleFetchResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
}

function log(level: "log" | "warn" | "error", msg: string) {
  const fn =
    level === "log" ? console.log : level === "warn" ? console.warn : console.error;
  fn(`[cairn:kaggle] ${msg}`);
}

// Startup sanity check: confirm the shared-key env vars are present (never log
// their values). Runs once per server process when this module first loads.
const _envUsername = process.env.KAGGLE_USERNAME;
const _envKey = process.env.KAGGLE_KEY;
log(
  "log",
  `env check: KAGGLE_USERNAME=${_envUsername ? `set (len ${_envUsername.length})` : "MISSING"}, ` +
    `KAGGLE_KEY=${_envKey ? `set (len ${_envKey.length})` : "MISSING"}`,
);

export async function kaggleFetch<T>(
  url: string,
  creds: { username: string; key: string },
  opts?: { signal?: AbortSignal; tag?: string },
): Promise<KaggleFetchResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (opts?.signal) {
    if (opts.signal.aborted) controller.abort();
    else opts.signal.addEventListener("abort", onAbort, { once: true });
  }
  try {
    const basic = Buffer.from(`${creds.username}:${creds.key}`).toString("base64");
    const tag = opts?.tag ?? "fetch";
    log("log", `${tag} -> GET ${url} (user=${creds.username})`);
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: "application/json",
        "User-Agent": "Cairn/1.0 (+https://github.com/cairn)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 300);
      } catch {
        /* body unreadable */
      }
      log(
        "warn",
        `${tag} <- HTTP ${res.status} for user=${creds.username} at ${url}${
          body ? ` body=${JSON.stringify(body)}` : ""
        }`,
      );
      return { ok: false, status: res.status, data: null };
    }
    const data = (await res.json()) as T;
    log("log", `${tag} <- HTTP ${res.status} OK for user=${creds.username} (${url})`);
    return { ok: true, status: res.status, data };
  } catch (err) {
    log(
      "error",
      `${opts?.tag ?? "fetch"} threw for user=${creds.username} at ${url}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    throw err;
  } finally {
    clearTimeout(timer);
    opts?.signal?.removeEventListener("abort", onAbort);
  }
}

export interface KaggleValidationResult {
  valid: boolean;
  status: number;
  retryable: boolean;
}

/**
 * One real, lightweight, authenticated call used to validate a personal key:
 * the datasets list endpoint. A 401/403 is a deterministic "invalid pair".
 */
export async function validateKaggleCredentials(
  username: string,
  key: string,
): Promise<KaggleValidationResult> {
  const res = await kaggleFetch<unknown>(DATASETS_LIST_URL("cairn"), { username, key }, { tag: "validate" });
  if (res.ok) return { valid: true, status: res.status, retryable: false };
  if (res.status === 401 || res.status === 403) {
    return { valid: false, status: res.status, retryable: false };
  }
  return { valid: false, status: res.status, retryable: true };
}