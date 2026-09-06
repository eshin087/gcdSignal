"use client";

import { useSyncExternalStore } from "react";

export type HealthStatus = "loading" | "ok" | "stale" | "error";

export interface FeedHealth {
  status: HealthStatus;
  count: number;
  /** When this status was last reported (ms epoch). */
  at: number;
}

// Columns report into a module-level store; the status bar reads it via
// useSyncExternalStore — no prop threading through the deck.
const health = new Map<string, FeedHealth>();
let snapshot: ReadonlyMap<string, FeedHealth> = new Map();
const EMPTY: ReadonlyMap<string, FeedHealth> = new Map();
let listeners: Array<() => void> = [];

function emit() {
  snapshot = new Map(health);
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function reportHealth(id: string, next: Omit<FeedHealth, "at">) {
  const prev = health.get(id);
  if (prev && prev.status === next.status && prev.count === next.count) return;
  health.set(id, { ...next, at: Date.now() });
  emit();
}

export function clearHealth(id: string) {
  if (health.delete(id)) emit();
}

export function useDeckHealth(): ReadonlyMap<string, FeedHealth> {
  return useSyncExternalStore(
    subscribe,
    () => snapshot,
    () => EMPTY
  );
}
