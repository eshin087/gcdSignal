import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";
import { resolveParams } from "@/lib/categories";
import { buildDigestHtml } from "@/lib/digest";
import { SOURCES } from "@/lib/sources";
import type { FeedItem, SourceId } from "@/lib/types";

export const maxDuration = 60;

// Per-source quotas keep the digest varied; backfill tops up to 10 when a
// source fails or runs dry.
const QUOTAS: Array<{ source: SourceId; take: number }> = [
  { source: "rss", take: 4 },
  { source: "reddit", take: 3 },
  { source: "bluesky", take: 1 },
  { source: "mastodon", take: 1 },
  { source: "fourchan", take: 1 },
];

const DIGEST_SIZE = 10;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (!apiKey || !audienceId) {
    return NextResponse.json({ error: "Resend is not configured" }, { status: 500 });
  }

  // Call adapters directly — no HTTP round-trip through our own API.
  const empty = new URLSearchParams();
  const results = await Promise.allSettled(
    QUOTAS.map((q) => SOURCES[q.source](resolveParams(q.source, "trending", empty)))
  );

  const picked: FeedItem[] = [];
  const backfill: FeedItem[] = [];
  QUOTAS.forEach((q, i) => {
    const r = results[i];
    if (r.status !== "fulfilled") return;
    // RSS is freshest-first already; social sources rank by score.
    const ranked =
      q.source === "rss" ? r.value : [...r.value].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    picked.push(...ranked.slice(0, q.take));
    backfill.push(...ranked.slice(q.take));
  });
  for (const item of backfill) {
    if (picked.length >= DIGEST_SIZE) break;
    picked.push(item);
  }

  if (!picked.length) {
    return NextResponse.json({ error: "No items fetched from any source" }, { status: 502 });
  }

  const dateLabel = new Date().toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const resend = new Resend(apiKey);
  const created = await resend.broadcasts.create({
    audienceId,
    from: process.env.DIGEST_FROM ?? "gcd signal <onboarding@resend.dev>",
    subject: `gcd signal daily — ${dateLabel}`,
    html: buildDigestHtml(picked.slice(0, DIGEST_SIZE), dateLabel),
  });
  if (created.error || !created.data) {
    return NextResponse.json(
      { error: created.error?.message ?? "Broadcast create failed" },
      { status: 502 }
    );
  }

  const sent = await resend.broadcasts.send(created.data.id);
  if (sent.error) {
    return NextResponse.json({ error: sent.error.message }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    broadcastId: created.data.id,
    itemCount: Math.min(picked.length, DIGEST_SIZE),
  });
}
