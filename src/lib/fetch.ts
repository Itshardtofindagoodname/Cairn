const DEFAULT_TIMEOUT_MS = 12_000;

interface FetchJsonOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

async function fetchRaw(
  url: string,
  options: FetchJsonOptions,
): Promise<Response> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}, signal } = options;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onExternalAbort, { once: true });
  }

  try {
    return await fetch(url, {
      headers: {
        "User-Agent": "Cairn/1.0 (+https://github.com/cairn)",
        Accept: "application/json, text/plain;q=0.8, */*;q=0.2",
        ...headers,
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onExternalAbort);
  }
}

/** Fetch a URL, decode JSON, abort after a timeout and on an external abort. */
export async function fetchJson<T = unknown>(
  url: string,
  options: FetchJsonOptions = {},
): Promise<T> {
  const res = await fetchRaw(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Fetch a URL and return its raw text body (XML, markdown, …). */
export async function fetchText(
  url: string,
  options: FetchJsonOptions = {},
): Promise<string> {
  const res = await fetchRaw(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
