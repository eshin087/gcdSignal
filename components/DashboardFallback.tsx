"use client";

import { usePathname } from "next/navigation";
import { viewFromPathname } from "@/lib/routes";
import DeckPlaceholder from "./DeckPlaceholder";
import Header from "./Header";

const noop = () => {};

/** The shell's first paint: a static header for the route plus the loading
 *  placeholder, shown until stored prefs are ready on the client. */
export default function DashboardFallback() {
  return (
    <>
      <Header
        view={viewFromPathname(usePathname())}
        category="trending"
        onChoose={noop}
        queryInput=""
        onQueryInputChange={noop}
        onOpenSettings={noop}
        settingsOpen={false}
        onOpenQueue={noop}
        queueOpen={false}
        queueCount={0}
      />
      <DeckPlaceholder />
    </>
  );
}
