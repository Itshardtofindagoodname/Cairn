"use client";

import * as Switch from "@radix-ui/react-switch";
import { ShieldCheck } from "lucide-react";

interface LicenseFilterProps {
  commercialOnly: boolean;
  onChange: (value: boolean) => void;
  shown: number;
  total: number;
}

export function LicenseFilter({
  commercialOnly,
  onChange,
  shown,
  total,
}: LicenseFilterProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800/80 pb-3">
      <label className="flex cursor-pointer items-center gap-2.5 select-none">
        <Switch.Root
          checked={commercialOnly}
          onCheckedChange={onChange}
          className={`group relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-500/30 ${
            commercialOnly ? "bg-emerald-500" : "bg-zinc-700"
          }`}
        >
          <Switch.Thumb
            className={`block h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
              commercialOnly ? "translate-x-[18px]" : "translate-x-0.5"
            }`}
          />
        </Switch.Root>
        <span className="flex items-center gap-1.5 text-sm text-zinc-300">
          <ShieldCheck className="h-4 w-4 text-emerald-400" aria-hidden />
          Commercially usable only
        </span>
        <span className="hidden text-xs text-zinc-500 sm:inline">
          MIT · Apache-2.0 · CC-BY · Public Domain
        </span>
      </label>
      <span className="text-xs text-zinc-500">
        {shown} of {total} results
      </span>
    </div>
  );
}
