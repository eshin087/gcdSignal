"use client";

import { useState } from "react";
import Modal from "./Modal";

type State = "idle" | "loading" | "done" | "error";

export default function NewsletterDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [state, setState] = useState<State>("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "loading") return;
    setState("loading");
    setError(null);
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, website }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Subscription failed");
      setState("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Subscription failed");
      setState("error");
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Daily signal, by email">
      {state === "done" ? (
        <div className="space-y-3">
          <p className="text-sm">
            You&apos;re in — the top AI stories land in your inbox each morning.
          </p>
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-cyan-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 dark:bg-cyan-400 dark:text-cyan-950 dark:hover:bg-cyan-300"
          >
            Done
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <p className="text-xs leading-relaxed text-zinc-500">
            One email a day with the top items across every feed. No spam, unsubscribe
            anytime.
          </p>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-lg border border-black/10 bg-black/[0.02] px-2.5 py-1.5 text-sm outline-none placeholder:text-zinc-400 focus:border-cyan-500/60 focus:ring-2 focus:ring-cyan-500/20 dark:border-white/15 dark:bg-white/[0.03] dark:placeholder:text-zinc-600"
          />
          {/* Honeypot — humans never see or fill this. */}
          <input
            type="text"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            name="website"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            className="absolute -left-[9999px] h-px w-px opacity-0"
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={state === "loading"}
            className="w-full rounded-lg bg-cyan-500 py-2 text-sm font-semibold text-white transition-colors hover:bg-cyan-400 disabled:opacity-50 dark:bg-cyan-400 dark:text-cyan-950 dark:hover:bg-cyan-300"
          >
            {state === "loading" ? "Subscribing…" : "Subscribe"}
          </button>
        </form>
      )}
    </Modal>
  );
}
