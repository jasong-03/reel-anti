import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgent } from "@/lib/agent/run-agent";
import { logUsage } from "@/lib/agent/usage-log";

export const runtime = "nodejs";
// The agent must never be statically cached; every request reflects live timeline state.
export const dynamic = "force-dynamic";

const elementJsonSchema = z
  .object({ id: z.string(), type: z.string(), s: z.number(), e: z.number() })
  .passthrough();

const trackJsonSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    type: z.string().optional(),
    elements: z.array(elementJsonSchema),
  })
  .passthrough();

const requestSchema = z.object({
  timelineJSON: z
    .object({
      tracks: z.array(trackJsonSchema),
      version: z.number(),
    })
    .passthrough(),
  message: z.string().min(1, "message is required"),
  resolution: z
    .object({ width: z.number().positive(), height: z.number().positive() })
    .default({ width: 720, height: 1280 }),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid request", issues: parsed.error.issues },
      { status: 400 }
    );
  }

  try {
    const result = await runAgent({
      timelineJSON: parsed.data.timelineJSON as never,
      message: parsed.data.message,
      resolution: parsed.data.resolution,
    });
    void logUsage({
      message: parsed.data.message,
      provider: result.provider,
      model: result.model,
      tier: result.tier,
      attempts: result.attempts,
      opCount: result.ops.length,
      ops: result.ops.map((o) => o.op),
      destructiveCount: result.destructiveCount,
      ok: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent failed";
    void logUsage({
      message: parsed.data.message,
      provider: "unknown",
      model: "unknown",
      tier: "unknown",
      attempts: 0,
      opCount: 0,
      ops: [],
      destructiveCount: 0,
      ok: false,
      error: message,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
