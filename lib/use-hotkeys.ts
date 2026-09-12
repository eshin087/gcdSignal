"use client";

import { useEffect } from "react";
import { scrollColumnInRail, scrollItemInColumn } from "./scroll-rail";

/**
 * Vim-style deck navigation, driven off the DOM so nothing threads through
 * the column tree: `[data-feed-id]` wrappers are columns, `article[tabindex]`
 * are cards (focusable via tabIndex=-1). `h`/`l` move the active column,
 * `j`/`k` move card focus within it, `o` opens, `s` saves, `r` refreshes the
 * column, `?` help, Ctrl/Cmd+K palette, Esc clears. Ignored while typing.
 */
export interface HotkeyHandlers {
  onPalette: () => void;
  onHelp: () => void;
  onEscape: () => void;
}

export const SHORTCUTS: Array<{ keys: string; does: string }> = [
  { keys: "j / k", does: "next / previous card" },
  { keys: "h / l", does: "previous / next column" },
  { keys: "o", does: "open the focused card" },
  { keys: "s", does: "save / unsave the focused card" },
  { keys: "r", does: "refresh the active column" },
  { keys: "Ctrl K", does: "command palette" },
  { keys: "?", does: "this help" },
  { keys: "Esc", does: "close / clear focus" },
];

let activeColumn = 0;

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement &&
  (t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    t.isContentEditable);

const columns = (): HTMLElement[] => {
  const deck = [...document.querySelectorAll<HTMLElement>("[data-feed-id]")].filter((el) =>
    el.getClientRects().length > 0 && el.querySelector(".feed-scroll")
  );
  if (deck.length) return deck;
  const reader = document.querySelector<HTMLElement>('.feed-scroll:has(article[tabindex])');
  return reader ? [reader] : [];
};

const cardsIn = (col: HTMLElement): HTMLElement[] => [
  ...col.querySelectorAll<HTMLElement>("article[tabindex]"),
].filter((card) => card.getClientRects().length > 0);

function focusedCard(): HTMLElement | null {
  const a = document.activeElement;
  return a instanceof HTMLElement && a.matches("article[tabindex]") ? a : null;
}

function markActive(index: number, scroll: boolean) {
  const cols = columns();
  if (!cols.length) return;
  activeColumn = Math.max(0, Math.min(cols.length - 1, index));
  cols.forEach((c, i) => c.toggleAttribute("data-active-col", i === activeColumn));
  if (scroll) {
    const column = cols[activeColumn];
    scrollColumnInRail(column.closest<HTMLElement>(".deck-scroll"), column, "nearest");
  }
}

function moveColumn(delta: number) {
  const cols = columns();
  if (!cols.length) return;
  const from = Math.min(activeColumn, cols.length - 1);
  markActive(from + delta, true);
  // Carry card focus into the new column so the next j/k feels continuous.
  const cards = cardsIn(cols[activeColumn]);
  if (focusedCard() && cards[0]) {
    cards[0].focus({ preventScroll: true });
    scrollItemInColumn(cards[0]);
  }
}

function moveCard(delta: number) {
  const cols = columns();
  const col = cols[Math.min(activeColumn, cols.length - 1)];
  if (!col) return;
  const cards = cardsIn(col);
  if (!cards.length) return;
  const cur = focusedCard();
  let idx = cur ? cards.indexOf(cur) : -1;
  idx = idx === -1 ? (delta > 0 ? 0 : cards.length - 1) : idx + delta;
  idx = Math.max(0, Math.min(cards.length - 1, idx));
  const card = cards[idx];
  card.focus({ preventScroll: true });
  scrollItemInColumn(card);
  markActive(activeColumn, false);
}

function clickIn(root: HTMLElement | null, selector: string) {
  root?.querySelector<HTMLElement>(selector)?.click();
}

export function useHotkeys(handlers: HotkeyHandlers) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]")) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onPalette();
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;
      if (e.key === "Escape") {
        focusedCard()?.blur();
        handlers.onEscape();
        return;
      }
      switch (e.key) {
        case "j":
          e.preventDefault();
          moveCard(1);
          break;
        case "k":
          e.preventDefault();
          moveCard(-1);
          break;
        case "h":
          moveColumn(-1);
          break;
        case "l":
          moveColumn(1);
          break;
        case "o":
          clickIn(focusedCard(), "a[href]");
          break;
        case "s": {
          // Secondary actions are intentionally quiet until Details is opened.
          // Reveal the saved state when the shortcut changes it.
          const details = focusedCard()?.querySelector<HTMLDetailsElement>("details[data-story-details]");
          if (details) details.open = true;
          clickIn(focusedCard(), 'button[aria-label^="Save"], button[aria-label^="Remove from saved"]');
          break;
        }
        case "r": {
          const cols = columns();
          clickIn(cols[Math.min(activeColumn, cols.length - 1)] ?? null, 'button[data-refresh], button[aria-label^="Refresh"]');
          break;
        }
        case "?":
          handlers.onHelp();
          break;
      }
    };
    // Clicking/tabbing into a column makes it the active one.
    const onFocusIn = (e: FocusEvent) => {
      const col = (e.target as Element | null)?.closest?.("[data-feed-id]");
      if (!col) return;
      const idx = columns().indexOf(col as HTMLElement);
      if (idx !== -1) markActive(idx, false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [handlers]);
}
