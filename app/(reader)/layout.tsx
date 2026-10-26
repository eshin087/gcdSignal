import Dashboard from "@/components/Dashboard";

/**
 * The reader shell (header, drawers, search text, refresh clock) lives in this
 * layout so it stays mounted while /, /deck and /library swap the view below
 * it. No Suspense boundary here on purpose: the shell reads ?cat= only after
 * stored prefs are ready on the client, and a boundary around the shell would
 * hide the header (and drop focus) whenever a lazily loaded dialog suspends.
 */
export default function ReaderLayout({ children }: { children: React.ReactNode }) {
  return <Dashboard>{children}</Dashboard>;
}
