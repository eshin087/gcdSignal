import {
  si4chan,
  siBluesky,
  siGithub,
  siHuggingface,
  siReddit,
  siRss,
  siYcombinator,
  siYoutube,
} from "simple-icons";
import { SOURCE_COLORS } from "@/lib/feeds";
import type { SourceId } from "@/lib/types";

const ICONS: Partial<Record<SourceId, { path: string }>> = {
  reddit: siReddit,
  bluesky: siBluesky,
  fourchan: si4chan,
  rss: siRss,
  hackernews: siYcombinator,
  youtube: siYoutube,
  github: siGithub,
  papers: siHuggingface,
};

export default function SourceIcon({
  source,
  className = "h-3.5 w-3.5",
}: {
  source: SourceId;
  className?: string;
}) {
  const icon = ICONS[source];
  if (!icon) {
    return (
      <span
        aria-hidden
        className={`inline-block shrink-0 rounded-full ${className}`}
        style={{ backgroundColor: SOURCE_COLORS[source] }}
      />
    );
  }
  return (
    <svg
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      style={{ fill: SOURCE_COLORS[source] }}
      aria-hidden
    >
      <path d={icon.path} />
    </svg>
  );
}
