import { timeAgo } from "@/lib/fetch-helpers";
import type { FeedItem } from "@/lib/types";

function formatCount(n: number): string {
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

const safeHref = (href: string | undefined) =>
  href && href.startsWith("http") ? href : undefined;

export default function FeedCard({ item }: { item: FeedItem }) {
  const titleHref = safeHref(item.externalUrl) ?? safeHref(item.url);
  const discussHref = safeHref(item.url);
  const meta: React.ReactNode[] = [];

  if (typeof item.score === "number") meta.push(`▲ ${formatCount(item.score)}`);
  if (typeof item.comments === "number" && item.comments !== item.score) {
    meta.push(`${formatCount(item.comments)} cmt`);
  }
  const ago = timeAgo(item.timestamp);
  if (ago) meta.push(ago);
  if (item.sourceMeta) meta.push(item.sourceMeta);

  return (
    <article className="border-b border-black/[0.06] px-3 py-2.5 transition-colors last:border-b-0 hover:bg-black/[0.025] dark:border-white/[0.06] dark:hover:bg-white/[0.03]">
      {titleHref ? (
        <a
          href={titleHref}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[13px] font-medium leading-snug text-zinc-900 hover:text-indigo-600 dark:text-zinc-100 dark:hover:text-indigo-400"
        >
          {item.title}
        </a>
      ) : (
        <span className="block text-[13px] font-medium leading-snug">{item.title}</span>
      )}
      {item.excerpt && (
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{item.excerpt}</p>
      )}
      {meta.length > 0 && (
        <div className="mt-1.5 text-[11px] text-zinc-500/90 dark:text-zinc-500">
          {discussHref ? (
            <a
              href={discussHref}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              {meta.join(" · ")}
            </a>
          ) : (
            <span>{meta.join(" · ")}</span>
          )}
        </div>
      )}
    </article>
  );
}
