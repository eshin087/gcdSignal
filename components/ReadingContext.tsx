"use client";

import { createContext, useContext, useState } from "react";
import dynamic from "next/dynamic";
import type { FeedItem } from "@/lib/types";

const StoryDrawer = dynamic(() => import("./StoryDrawer"));
const ReadingContext = createContext<(items: FeedItem[]) => void>(() => {});
export const useReading = () => useContext(ReadingContext);

export default function ReadingProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<FeedItem[] | null>(null);
  return <ReadingContext.Provider value={setItems}>
    {children}
    {items && <StoryDrawer items={items} onClose={() => setItems(null)} />}
  </ReadingContext.Provider>;
}
