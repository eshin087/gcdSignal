/**
 * Shared inner-card look for deck columns (feeds + panels). Sizing, snap and
 * drag-and-drop live on the ColumnDeck wrapper; columns fill it.
 */
export const COLUMN_SHELL =
  "flex h-full min-h-0 w-full flex-col overflow-hidden bg-white md:rounded-xl md:border md:border-black/[0.07] md:shadow-[0_1px_2px_rgba(0,0,0,0.04)] md:transition-colors md:hover:border-black/[0.12] dark:bg-[#111114]/80 dark:md:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] dark:md:hover:border-white/[0.13]";

export const COLUMN_HEADER =
  "flex h-11 shrink-0 items-center gap-2 border-b border-black/[0.06] px-3 dark:border-white/[0.06]";
