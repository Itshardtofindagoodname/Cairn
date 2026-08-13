import { SearchApp } from "@/components/SearchApp";

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-zinc-950 text-zinc-100">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(245,158,11,0.12),transparent)]"
      />
      <SearchApp />
      <footer className="relative z-10 border-t border-zinc-900 bg-zinc-950/80 py-6 text-center text-xs text-zinc-600">
        <p>
          DataForge · Search results stream from the original providers and are
          cached locally for ~2h · No files are re-hosted · No API keys needed
        </p>
      </footer>
    </main>
  );
}
