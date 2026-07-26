import { SOURCE_COLORS } from "@/lib/feeds";
import type { SourceId } from "@/lib/types";

export default function SourceIcon({
  source,
  className = "h-2 w-2",
}: {
  source: SourceId;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 rounded-full ${className}`}
      style={{ backgroundColor: SOURCE_COLORS[source] }}
    />
  );
}
