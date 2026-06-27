import { NextResponse } from "next/server";
import { getMediaProvider, getJob } from "@/lib/agent/media-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Poll a generation job. The client calls this every 2–4s until status is done. */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
): Promise<NextResponse> {
  if (!getJob(params.id)) {
    return NextResponse.json({ error: "unknown job id" }, { status: 404 });
  }
  try {
    const job = await getMediaProvider().poll(params.id);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "poll failed" }, { status: 502 });
  }
}
