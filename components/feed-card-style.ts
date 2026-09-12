/** Shared reading rhythm for native feed items and attributed X discoveries. */
export function feedCardRowClassName(compact: boolean): string {
  return `card-enter card-glow group border-b border-black/[0.05] px-3 transition-[background-color,box-shadow] last:border-b-0 hover:bg-black/[0.03] focus:outline-none focus:ring-1 focus:ring-inset focus:ring-cyan-500/60 dark:border-white/[0.05] dark:hover:bg-white/[0.035] ${compact ? "py-1.5" : "py-2.5"}`;
}

export const FEED_CARD_TITLE_CLASS = "block text-[length:var(--fs-title)] font-medium leading-snug tracking-[-0.01em] text-zinc-900 transition-colors visited:text-zinc-400 group-hover:text-cyan-700 dark:text-zinc-100 dark:visited:text-zinc-500 dark:group-hover:text-cyan-300";

export function feedCardExcerptClassName(preview = true): string {
  return `mt-1 ${preview ? "line-clamp-2" : ""} text-[length:var(--fs-excerpt)] leading-relaxed text-zinc-600 dark:text-zinc-400`;
}

export function feedCardMetadataClassName(compact: boolean): string {
  return `flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[length:var(--fs-meta)] ${compact ? "mt-1" : "mt-2"}`;
}

export function formatFeedCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}
