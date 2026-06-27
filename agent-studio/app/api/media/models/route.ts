import { NextResponse } from "next/server";
import { getMediaProvider, type MediaKind } from "@/lib/agent/media-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** List the available generation models, optionally filtered by ?kind=image|video. */
export async function GET(request: Request): Promise<NextResponse> {
  const kindParam = new URL(request.url).searchParams.get("kind");
  const kind = kindParam === "image" || kindParam === "video" ? (kindParam as MediaKind) : undefined;
  try {
    return NextResponse.json({ models: getMediaProvider().listModels(kind) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "unavailable" }, { status: 502 });
  }
}
