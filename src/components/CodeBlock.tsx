"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={copy}
        className="absolute right-2 top-2 inline-flex items-center gap-1.5 rounded-md border border-zinc-700 bg-zinc-800/80 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-zinc-700"
      >
        {copied ? (
          <>
            <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden /> Copied
          </>
        ) : (
          <>
            <Copy className="h-3.5 w-3.5" aria-hidden /> Copy
          </>
        )}
      </button>
      <pre className="max-h-80 overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 pr-20 text-[12.5px] leading-relaxed text-zinc-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}
