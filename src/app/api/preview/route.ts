import type { NextRequest } from "next/server";
import Papa from "papaparse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BYTES = 64 * 1024; // ~50KB sampled range, with a little headroom
const MAX_ROWS = 40;
const MAX_COLUMNS = 25;

const ALLOWED_HOST_SUFFIXES = [
  "huggingface.co",
  "zenodo.org",
  "openml.org",
  "catalog.data.gov",
];

/**
 * Preview endpoints fetch only the first ~50KB of a remote file (HTTP Range)
 * and return a small sample table / JSON summary. Files are never stored.
 *
 * The URL allowlist limits the preview proxy to the sources this app
 * integrates with (plus *.gov hosts, where data.gov resources commonly live).
 */
function hostAllowed(rawUrl: string): boolean {
  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (
    ALLOWED_HOST_SUFFIXES.some(
      (suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`),
    )
  ) {
    return true;
  }
  return hostname.endsWith(".gov");
}

interface JsonRow {
  ok: boolean;
  error?: string;
  columns?: string[];
  rows?: string[][];
  truncated?: boolean;
  json?: unknown;
  source?: string;
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url") ?? "";
  const type = request.nextUrl.searchParams.get("type") ?? "";
  const jsonRow: JsonRow = { ok: false };

  if (!rawUrl || (type !== "csv" && type !== "json")) {
    jsonRow.error = "Bad request: url and type (csv|json) are required";
    return Response.json(jsonRow, { status: 400 });
  }
  if (!hostAllowed(rawUrl)) {
    jsonRow.error = "Host not allowed";
    return Response.json(jsonRow, { status: 403 });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let res: Response;
    try {
      res = await fetch(rawUrl, {
        headers: {
          Range: "bytes=0-" + (MAX_BYTES - 1),
          "User-Agent": "DataForge/1.0",
          Accept: "*/*",
        },
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok && res.status !== 206) {
      jsonRow.error = `Upstream returned HTTP ${res.status}`;
      return Response.json(jsonRow, { status: 502 });
    }

    const buffer = await res.arrayBuffer();
    const text = new TextDecoder("utf-8", { fatal: false })
      .decode(buffer)
      .slice(0, MAX_BYTES);
    jsonRow.source = res.url;

    if (type === "csv") {
      const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
      const rawRows = Array.isArray(parsed.data) ? parsed.data : [];
      const columns = (rawRows[0] ?? []).slice(0, MAX_COLUMNS);
      const body = rawRows.slice(1, 1 + MAX_ROWS);
      const rows = body
        .filter((r) => Array.isArray(r) && r.some((c) => c !== undefined && c !== ""))
        .map((r) => r.slice(0, MAX_COLUMNS));
      jsonRow.ok = true;
      jsonRow.columns = columns;
      jsonRow.rows = rows;
      jsonRow.truncated = res.status === 200 || body.length === MAX_ROWS;
    } else {
      try {
        jsonRow.json = JSON.parse(text);
        jsonRow.ok = true;
      } catch {
        jsonRow.error = "Response is not valid JSON";
        return Response.json(jsonRow, { status: 502 });
      }
    }

    return Response.json(jsonRow);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const timedOut = err instanceof Error && err.name === "AbortError";
    jsonRow.error = timedOut ? "Preview timed out" : message;
    return Response.json(jsonRow, { status: 504 });
  }
}
