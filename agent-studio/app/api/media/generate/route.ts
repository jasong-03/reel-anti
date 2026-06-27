import { NextResponse } from "next/server";
import { z } from "zod";
import { getMediaProvider } from "@/lib/agent/media-gen";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Kick off a generative-media job (W4). Returns a job descriptor immediately;
 * the client polls GET /api/media/job/[id]. Images usually come back `done` on
 * the first response (Imagen is synchronous); video starts `pending` (Veo).
 */
const schema = z.object({
  kind: z.enum(["image", "video"]),
  prompt: z.string().min(1, "prompt is required"),
  model: z.string().optional(),
  aspectRatio: z.string().optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  try {
    const job = await getMediaProvider().submit(parsed.data);
    return NextResponse.json({ job });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "generation failed" }, { status: 502 });
  }
}
