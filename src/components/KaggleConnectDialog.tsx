"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { KeyRound, Link2, Loader2, Unlink } from "lucide-react";
import {
  clearKaggleCredentials,
  saveKaggleCredentials,
} from "@/lib/kaggle-store";

type State =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "valid" }
  | { kind: "invalid"; message: string };

interface KaggleConnectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connectedUsername: string | null;
  onCredentialsChanged: () => void;
}

export function KaggleConnectDialog({
  open,
  onOpenChange,
  connectedUsername,
  onCredentialsChanged,
}: KaggleConnectDialogProps) {
  const [username, setUsername] = useState("");
  const [key, setKey] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  const handleConnect = async () => {
    if (!username.trim() || !key.trim()) {
      setState({ kind: "invalid", message: "Both username and API key are required." });
      return;
    }
    setState({ kind: "busy" });
    try {
      const res = await fetch("/api/kaggle/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), key: key.trim() }),
      });
      const data = (await res.json()) as { valid: boolean; error?: string };
      if (data.valid) {
        const saved = await saveKaggleCredentials(username.trim(), key.trim());
        if (!saved) {
          // The encrypt → IndexedDB → decrypt round-trip failed (e.g. the
          // browser dropped the AES key). Clear the bad store so nothing
          // corrupt is sent to Kaggle later, and tell the user to retry.
          await clearKaggleCredentials().catch(() => {});
          setState({
            kind: "invalid",
            message:
              "Credentials couldn&apos;t be stored securely on this device (encryption key not persisted). Please try again.",
          });
          return;
        }
        setUsername("");
        setKey("");
        setState({ kind: "valid" });
        onCredentialsChanged();
      } else {
        setState({ kind: "invalid", message: data.error ?? "Invalid credentials." });
      }
    } catch {
      setState({
        kind: "invalid",
        message: "Couldn&apos;t reach the validator — check your network and try again.",
      });
    }
  };

  const handleDisconnect = async () => {
    await clearKaggleCredentials();
    setState({ kind: "idle" });
    onCredentialsChanged();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl shadow-black/50">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-sky-500/30 bg-sky-500/10">
              <KeyRound className="h-5 w-5 text-sky-400" aria-hidden />
            </div>
            <div>
              <Dialog.Title className="text-lg font-semibold text-zinc-100">
                Kaggle connection
              </Dialog.Title>
              <Dialog.Description className="text-sm text-zinc-400">
                {connectedUsername
                  ? `Connected as ${connectedUsername}`
                  : "Use your own Kaggle account for results."}
              </Dialog.Description>
            </div>
          </div>

          {connectedUsername ? (
            <div className="space-y-3">
              <p className="rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-2 text-xs leading-relaxed text-zinc-300">
                Your key is encrypted on this device only (AES-GCM, key in your
                browser&apos;s IndexedDB) and sent to Kaggle for a single search —
                never stored server-side.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
                >
                  <Unlink className="h-4 w-4" aria-hidden /> Disconnect
                </button>
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-lg bg-amber-500 px-3.5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-amber-400"
                  >
                    Done
                  </button>
                </Dialog.Close>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs leading-relaxed text-zinc-400">
                Create one at <span className="text-zinc-200">kaggle.com/settings → API</span>{" "}
                (legacy API). It&apos;s encrypted on this device and only ever sent
                to Kaggle for your search — never stored on our server.
              </p>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Kaggle username"
                spellCheck={false}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-500/60 focus:ring-4 focus:ring-sky-500/10"
              />
              <input
                type="password"
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="API key"
                spellCheck={false}
                autoComplete="off"
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800/60 px-3 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-500 focus:border-sky-500/60 focus:ring-4 focus:ring-sky-500/10"
              />

              {state.kind === "valid" && (
                <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
                  Connected. Kaggle results will now use your own account.
                </p>
              )}
              {state.kind === "invalid" && (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
                  {state.message}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="rounded-lg bg-zinc-800 px-3.5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-zinc-700"
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={state.kind === "busy"}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-500 px-3.5 py-2 text-sm font-semibold text-zinc-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {state.kind === "busy" ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Link2 className="h-4 w-4" aria-hidden />
                  )}
                  {state.kind === "busy" ? "Verifying…" : "Connect"}
                </button>
              </div>
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}