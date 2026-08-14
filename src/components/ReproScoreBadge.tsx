"use client";

import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Gauge, Loader2 } from "lucide-react";
import type { MergedResult } from "@/lib/types";
import {
  combineScore,
  provisionalParts,
  scoreLicense,
  scoreLiveness,
  scoreMaintenance,
  scoreMetadata,
  scoreTone,
  type ReproParts,
} from "@/lib/reproducibility/score";
import type { LivenessStatus } from "@/lib/reproducibility/liveness";

interface ReproScoreBadgeProps {
  result: MergedResult;
}

const PART_LABELS: Record<keyof ReproParts, { label: string; weight: string }> = {
  metadata: { label: "Metadata", weight: "20%" },
  license: { label: "License", weight: "20%" },
  liveness: { label: "Liveness", weight: "35%" },
  maintenance: { label: "Maintenance", weight: "25%" },
};

function scoreBar(score: number): string {
  const pct = Math.round(score * 100);
  return `${pct}%`;
}

export function ReproScoreBadge({ result }: ReproScoreBadgeProps) {
  const primary = result.origins[0];
  const ref = useRef<HTMLDivElement | null>(null);

  const [parts, setParts] = useState<ReproParts>(() =>
    provisionalParts(
      scoreMetadata({
        description: result.description,
        size: result.size,
        publishedAt: result.publishedAt,
        updatedAt: result.updatedAt,
      }),
      scoreLicense(primary.license, primary.licenseRaw),
    ),
  );

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let disposed = false;

    const applyLiveness = (status: LivenessStatus) => {
      if (disposed) return;
      setParts((prev) => ({ ...prev, liveness: scoreLiveness(status) }));
    };
    const applyMaintenance = (lastPush: string | null) => {
      if (disposed) return;
      setParts((prev) => ({ ...prev, maintenance: scoreMaintenance(lastPush) }));
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          io.disconnect();

          void fetch(`/api/liveness?url=${encodeURIComponent(primary.url)}`)
            .then((r) => (r.ok ? r.json() : { status: "unknown" }))
            .then((d: { status?: LivenessStatus }) =>
              applyLiveness(d.status ?? "unknown"),
            )
            .catch(() => applyLiveness("unknown"));

          void fetch(`/api/maintenance?url=${encodeURIComponent(primary.url)}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((d: { status?: string; lastPush?: string | null } | null) => {
              applyMaintenance(
                d?.status === "github" ? (d.lastPush ?? null) : (result.updatedAt ?? null),
              );
            })
            .catch(() => applyMaintenance(result.updatedAt ?? null));

          return;
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);
    return () => {
      disposed = true;
      io.disconnect();
    };
  }, [primary.url, result.updatedAt]);

  const score = combineScore(parts.metadata, parts.license, parts.liveness, parts.maintenance);
  const tone = scoreTone(score.total);

  const toneClass =
    tone === "green"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
      : tone === "amber"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
        : "border-rose-500/30 bg-rose-500/10 text-rose-300";
  const dotClass =
    tone === "green" ? "bg-emerald-400" : tone === "amber" ? "bg-amber-400" : "bg-rose-400";

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <div
          ref={ref}
          role="button"
          aria-label={`Reproducibility score ${score.total} out of 100`}
          className={`inline-flex cursor-help items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold transition hover:opacity-90 ${toneClass} ${score.estimating ? "animate-pulse" : ""}`}
        >
          {score.estimating && <Loader2 className="h-3 w-3 animate-spin" aria-hidden />}
          <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
          {score.total}/100
        </div>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={6}
          className="z-50 w-72 rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl shadow-black/40"
        >
          <div className="mb-3 flex items-center gap-2">
            <Gauge className={`h-4 w-4 ${tone === "green" ? "text-emerald-400" : tone === "amber" ? "text-amber-400" : "text-rose-400"}`} aria-hidden />
            <span className="text-sm font-semibold text-zinc-100">
              Reproducibility Score
            </span>
          </div>
          <div className="space-y-2.5">
            {(Object.keys(parts) as (keyof ReproParts)[]).map((key) => {
              const part = parts[key];
              const label = PART_LABELS[key];
              return (
                <div key={key}>
                  <div className="mb-0.5 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-zinc-300">{label.label}</span>
                    <span className="text-zinc-500">
                      {label.weight} · {Math.round(part.score * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${key === "liveness" || key === "maintenance" ? "bg-violet-400" : "bg-amber-400"}`}
                      style={{ width: scoreBar(part.score) }}
                    />
                  </div>
                  {part.detail && (
                    <p className="mt-0.5 text-[10px] text-zinc-500">{part.detail}</p>
                  )}
                </div>
              );
            })}
          </div>
          <p className="mt-3 border-t border-zinc-800 pt-2 text-[10px] leading-relaxed text-zinc-500">
            Metadata 20% · License 20% · Liveness 35% · Maintenance 25%.
            Liveness &amp; maintenance are probed lazily when the card is visible.
          </p>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}