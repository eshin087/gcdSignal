"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { COLUMN_HEADER } from "./column-shell";
import { RefreshIcon } from "./icons";

/** Fixed leading slots keep headings aligned, even with large text or long feed names. */
export default function ColumnHeader({ icon, label, health, count, countTitle, title, onRefresh, refreshing = false, extraAction, dragHandleProps }: {
  icon: ReactNode;
  label: string;
  health: string;
  count?: number;
  countTitle?: string;
  title?: string;
  onRefresh: () => void;
  refreshing?: boolean;
  extraAction?: ReactNode;
  dragHandleProps?: HTMLAttributes<HTMLElement>;
}) {
  return <header {...dragHandleProps} className={`${COLUMN_HEADER} ${dragHandleProps ? "select-none md:cursor-grab md:active:cursor-grabbing" : ""}`}>
    <span className={`led led-${health}`} aria-label={`Status: ${health}`} />
    <span data-column-icon className="flex h-4 w-4 shrink-0 items-center justify-center [&>svg]:h-4 [&>svg]:w-4">{icon}</span>
    <h2 title={title ?? label} className="min-w-0 truncate font-mono text-[length:var(--fs-colhead)] font-semibold lowercase leading-none tracking-tight text-zinc-600 dark:text-zinc-300">
      <span className="text-cyan-500/80 dark:text-cyan-400/80">&gt;&nbsp;</span>{label}
    </h2>
    <span className="flex h-11 shrink-0 items-center gap-0.5">
      {count !== undefined && <span className="rounded-full bg-black/[0.04] px-2 py-px font-mono text-[length:var(--fs-ui-sm)] tabular-nums text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400" title={countTitle}><span aria-hidden="true">{count}</span><span className="sr-only">{countTitle ?? `${count} items`}</span></span>}
      {extraAction}
      <button onClick={onRefresh} disabled={refreshing} aria-busy={refreshing} aria-label={`Refresh ${label}`} title={`Refresh ${label}`} draggable={false} className="flex h-11 w-11 shrink-0 items-center justify-center rounded text-zinc-500 transition-colors hover:bg-black/[0.05] hover:text-zinc-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/40 disabled:cursor-wait dark:text-zinc-400 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200">
        <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </span>
  </header>;
}
