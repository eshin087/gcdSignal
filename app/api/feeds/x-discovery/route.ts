import { NextResponse } from "next/server";
import { loadXDiscovery } from "@/lib/x-discovery";
import { sharedServerLoad } from "@/lib/server-cache";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // One bounded candidate pool for every reader. Filters run locally, and a
  // cache-busting query cannot trigger a new upstream search.
  if (new URL(request.url).search) {
    return NextResponse.json({ error: "Discovery does not accept query parameters." }, { status: 400 });
  }
  try {
    const body = await sharedServerLoad("x-discovery:v1", loadXDiscovery);
    return NextResponse.json(body, { headers: { "Cache-Control": body.stale || body.error
      ? "public, max-age=30, s-maxage=60"
      : "public, max-age=60, s-maxage=300, stale-while-revalidate=300" } });
  } catch {
    return NextResponse.json({ error: "Discovery is temporarily unavailable. Please try again." },
      { status: 503, headers: { "Cache-Control": "public, max-age=30, s-maxage=60" } });
  }
}
