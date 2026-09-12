"use client";

/** Scroll one horizontal feed rail without moving the document or outer UI. */
export function scrollColumnInRail(
  rail: HTMLElement | null,
  column: Element | null,
  align: "start" | "center" | "nearest",
  behavior: ScrollBehavior = "smooth",
) {
  if (!rail || !column) return;
  const railBounds = rail.getBoundingClientRect();
  const columnBounds = column.getBoundingClientRect();
  let left = rail.scrollLeft;
  if (align === "start") left += columnBounds.left - railBounds.left;
  else if (align === "center") left += (columnBounds.left + columnBounds.width / 2) - (railBounds.left + railBounds.width / 2);
  else if (columnBounds.left < railBounds.left) left += columnBounds.left - railBounds.left;
  else if (columnBounds.right > railBounds.right) left += columnBounds.right - railBounds.right;
  rail.scrollTo({ left: Math.max(0, left), behavior });
}

/** Reveal a story inside its own vertical feed without scrolling outer shells. */
export function scrollItemInColumn(item: Element | null, behavior: ScrollBehavior = "smooth") {
  const scroller = item?.closest<HTMLElement>(".feed-scroll");
  if (!item || !scroller) return;
  const scrollerBounds = scroller.getBoundingClientRect();
  const itemBounds = item.getBoundingClientRect();
  let top = scroller.scrollTop;
  if (itemBounds.top < scrollerBounds.top) top += itemBounds.top - scrollerBounds.top;
  else if (itemBounds.bottom > scrollerBounds.bottom) top += itemBounds.bottom - scrollerBounds.bottom;
  scroller.scrollTo({ top: Math.max(0, top), behavior });
}
