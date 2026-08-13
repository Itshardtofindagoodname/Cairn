"use client";

import { useEffect, useState } from "react";
import { AlertCircle, FileJson2, Table } from "lucide-react";
import type { PreviewInfo } from "@/lib/types";
import { Spinner } from "./Spinner";

interface PreviewData {
  ok: boolean;
  error?: string;
  columns?: string[];
  rows?: string[][];
  truncated?: boolean;
  json?: unknown;
}

export function PreviewPanel({ preview }: { preview: PreviewInfo }) {
  const [state, setState] = useState<{
    loading: boolean;
    error: string | null;
    data: PreviewData | null;
  }>({ loading: true, error: null, data: null });

  useEffect(() => {
    if (preview.type === "none" || !preview.url) return;

    let cancelled = false;
    const url = `/api/preview?url=${encodeURIComponent(preview.url)}&type=${preview.type}`;
    fetch(url)
      .then((r) => r.json())
      .then((d: PreviewData) => {
        if (cancelled) return;
        setState({
          loading: false,
          error: d.ok ? null : d.error ?? "Preview failed",
          data: d.ok ? d : null,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setState({ loading: false, error: "Preview request failed", data: null });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [preview.url, preview.type]);

  if (preview.type === "none" || !preview.url) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-4 text-sm text-zinc-500">
        <AlertCircle className="h-4 w-4 text-zinc-600" aria-hidden />
        No preview available for this item.
      </div>
    );
  }

  if (state.loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-zinc-400">
        <Spinner className="h-4 w-4" />
        Fetching first ~50KB…
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-4 text-sm text-zinc-500">
        <AlertCircle className="h-4 w-4 text-amber-400" aria-hidden />
        {state.error}
      </div>
    );
  }

  const d = state.data!;

  if (preview.type === "csv") {
    const columns = d.columns ?? [];
    const rows = d.rows ?? [];
    return (
      <div className="overflow-hidden rounded-xl border border-zinc-800">
        {preview.note && (
          <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[11px] text-zinc-500">
            <Table className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
            {preview.note}
          </div>
        )}
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-zinc-900">
              <tr>
                {columns.map((c, i) => (
                  <th key={i} className="px-3 py-2 font-medium text-zinc-300">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-t border-zinc-800/70">
                  {columns.map((_, j) => (
                    <td key={j} className="max-w-[220px] truncate px-3 py-1.5 text-zinc-400">
                      {row[j] ?? ""}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && (
          <div className="px-3 py-4 text-sm text-zinc-500">No sample rows parsed.</div>
        )}
        {d.truncated && (
          <div className="border-t border-zinc-800 bg-zinc-900/60 px-3 py-1.5 text-[11px] text-zinc-500">
            Preview shows the first ~50KB only — download for the full file.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      {preview.note && (
        <div className="flex items-center gap-2 border-b border-zinc-800 bg-zinc-900/60 px-3 py-2 font-mono text-[11px] text-zinc-500">
          <FileJson2 className="h-3.5 w-3.5 text-zinc-600" aria-hidden />
          {preview.note}
        </div>
      )}
      <pre className="max-h-72 overflow-auto bg-zinc-950 p-4 text-[12px] leading-relaxed text-zinc-300">
        {JSON.stringify(d.json ?? {}, null, 2).slice(0, 4000)}
      </pre>
    </div>
  );
}
