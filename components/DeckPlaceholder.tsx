/** Server-rendered first paint while localStorage prefs load — mirrors the
 *  real deck's wrapper structure so there's no layout jump. */
export default function DeckPlaceholder() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden px-4 py-8" role="status" aria-label="Loading reader">
      <div className="mx-auto max-w-[780px] space-y-8"><div className="skeleton h-10 w-2/3" /><div className="skeleton h-12 w-full" />
        {[1, 2, 3].map((n) => <div key={n} className="space-y-3"><div className="skeleton h-6 w-4/5" /><div className="skeleton h-4 w-full" /><div className="skeleton h-4 w-3/4" /></div>)}</div>
    </div>
  );
}
