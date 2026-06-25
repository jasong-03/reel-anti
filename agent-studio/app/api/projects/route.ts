import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Minimal shared-workspace project store (Phase 4). File-backed under `.data/`
 * so a small team can save/load a project without standing up a database. The
 * read/write seam is intentionally tiny — swap the fs calls for S3/R2 later
 * without touching the client. Single "default" workspace for now.
 */
const DATA_DIR = path.join(process.cwd(), ".data", "projects");

const idSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]{1,64}$/)
  .default("default");

const fileFor = (id: string) => path.join(DATA_DIR, `${id}.json`);

const saveSchema = z.object({
  id: idSchema.optional(),
  project: z.object({ tracks: z.array(z.unknown()), version: z.number() }).passthrough(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const parsedId = idSchema.safeParse(url.searchParams.get("id") ?? "default");
  if (!parsedId.success) {
    return NextResponse.json({ error: "invalid project id" }, { status: 400 });
  }
  try {
    const raw = await fs.readFile(fileFor(parsedId.data), "utf8");
    return NextResponse.json({ id: parsedId.data, project: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid request", issues: parsed.error.issues }, { status: 400 });
  }
  const id = parsed.data.id ?? "default";
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(fileFor(id), JSON.stringify(parsed.data.project), "utf8");
    return NextResponse.json({ id, saved: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "save failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
