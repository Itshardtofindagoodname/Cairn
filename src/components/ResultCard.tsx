"use client";

import { useState } from "react";
import { Code2, Database, Download, ExternalLink, Eye, TrendingUp } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { MergedResult, Origin } from "@/lib/types";
import {
  LICENSE_META,
  SOURCE_META,
  TYPE_META,
} from "./sourceMeta";
import { PreviewPanel } from "./PreviewPanel";
import { CodeBlock } from "./CodeBlock";
import { ScorePopover } from "./ScorePopover";

function SourceBadge({ source }: { source: Origin["source"] }) {
  const meta = SOURCE_META[source];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${meta.bg} ${meta.border} ${meta.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function AlsoOn({ origins }: { origins: Origin[] }) {
  if (origins.length <= 1) return null;
  const others = origins
    .slice(1)
    .map((o) => o.source)
    .filter((source, i, arr) => arr.indexOf(source) === i);
  return (
    <span className="flex items-center gap-1.5 text-[11px] text-zinc-500">
      Also on:
      {others.map((source) => (
        <span key={source} className="font-medium text-zinc-400">
          {SOURCE_META[source].short}
        </span>
      ))}
    </span>
  );
}

function CodeSnippetPanel({ origins }: { origins: Origin[] }) {
  const [idx, setIdx] = useState(0);
  const active = origins[Math.min(idx, origins.length - 1)];
  return (
    <div className="space-y-2">
      {origins.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {origins.map((o, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setIdx(i)}
              className={`rounded-md px-2 py-1 text-[11px] font-medium transition ${
                i === idx
                  ? "bg-zinc-700 text-zinc-100"
                  : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700/70"
              }`}
            >
              {SOURCE_META[o.source].short}
            </button>
          ))}
        </div>
      )}
      <CodeBlock code={active.snippet} />
    </div>
  );
}

export function ResultCard({ result }: { result: MergedResult }) {
  const [panel, setPanel] = useState<null | "preview" | "code">(null);
  const primary = result.origins[0];
  const typeMeta = TYPE_META[result.type];
  const licenseMeta = LICENSE_META[primary.license];
  const isDownloadable = primary.preview.type === "csv" && !!primary.preview.url;
  const actionHref = isDownloadable ? primary.preview.url! : primary.url;
  const popularity = typeof primary.popularity === "number" ? primary.popularity : null;

  return (
    <article className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4 transition hover:border-zinc-700">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={primary.source} />
          <AlsoOn origins={result.origins} />
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-medium ${typeMeta.bg} ${typeMeta.border} ${typeMeta.text}`}
        >
          <typeMeta.icon className="h-3 w-3" aria-hidden />
          {typeMeta.label}
        </span>
      </div>

      <h3 className="mt-2.5 flex items-start gap-1.5 break-words font-semibold text-zinc-100">
        <a
          href={primary.url}
          target="_blank"
          rel="noopener noreferrer"
          className="transition hover:text-amber-300"
        >
          {result.title}
        </a>
        <ExternalLink
          className="mt-1 h-3.5 w-3.5 shrink-0 text-zinc-600"
          aria-hidden
        />
      </h3>

      {result.description && (
        <p className="mt-1.5 line-clamp-3 text-sm leading-relaxed text-zinc-400">
          {result.description}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        <Tooltip.Provider delayDuration={300}>
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <span
                className={`inline-flex cursor-help items-center gap-1.5 rounded-md px-2 py-0.5 font-medium ${licenseMeta.bg} ${licenseMeta.text}`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    licenseMeta.commercial === true
                      ? "bg-emerald-400"
                      : licenseMeta.commercial === false
                        ? "bg-amber-400"
                        : "bg-zinc-500"
                  }`}
                />
                {primary.license}
              </span>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                sideOffset={6}
                className="z-50 max-w-xs rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 shadow-lg shadow-black/30"
              >
                {primary.licenseRaw ?? primary.license}
                <Tooltip.Arrow className="fill-zinc-700" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        {result.size && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/80 px-2 py-0.5">
            <Database className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
            {result.size}
          </span>
        )}
        {popularity !== null && (
          <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-800/80 px-2 py-0.5">
            <TrendingUp className="h-3.5 w-3.5 text-zinc-500" aria-hidden />
            {typeof result.popularityLabel === "string" ? result.popularityLabel : formatNumber(popularity)}
          </span>
        )}
        {result.rank && <ScorePopover rank={result.rank} />}
        {typeof primary.sourceId === "string" && (
          <span className="hidden max-w-[160px] truncate rounded-md bg-zinc-800/80 px-2 py-0.5 font-mono text-[11px] sm:inline">
            {primary.sourceId}
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-zinc-800/70 pt-3">
        <a
          href={actionHref}
          target="_blank"
          rel="noopener noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition ${
            isDownloadable
              ? "bg-amber-500 text-zinc-950 hover:bg-amber-400"
              : "bg-zinc-800 text-zinc-200 hover:bg-zinc-700"
          }`}
        >
          {isDownloadable ? (
            <Download className="h-4 w-4" aria-hidden />
          ) : (
            <ExternalLink className="h-4 w-4" aria-hidden />
          )}
          {isDownloadable ? "Download" : "View"}
        </a>
        {primary.preview.type !== "none" && (
          <button
            type="button"
            onClick={() => setPanel(panel === "preview" ? null : "preview")}
            aria-expanded={panel === "preview"}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
              panel === "preview"
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80"
            }`}
          >
            <Eye className="h-4 w-4" aria-hidden /> Preview
          </button>
        )}
        <button
          type="button"
          onClick={() => setPanel(panel === "code" ? null : "code")}
          aria-expanded={panel === "code"}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-medium transition ${
            panel === "code"
              ? "bg-zinc-700 text-zinc-100"
              : "bg-zinc-800/70 text-zinc-300 hover:bg-zinc-700/80"
          }`}
        >
          <Code2 className="h-4 w-4" aria-hidden /> Code
        </button>
      </div>

      {panel === "preview" && (
        <div className="mt-3">
          <PreviewPanel
            key={`${primary.preview.url ?? ""}-${primary.preview.type}`}
            preview={primary.preview}
          />
        </div>
      )}
      {panel === "code" && (
        <div className="mt-3">
          <CodeSnippetPanel origins={result.origins} />
        </div>
      )}
    </article>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
