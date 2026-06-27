import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatch } from "@/lib/agent/mcp-server";
import { isValidProjectId } from "@/lib/agent/mcp-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP Streamable-HTTP endpoint. Lets external agents (Claude Code / Cursor /
 * Codex) drive the reel-anti timeline through the SAME tool executor the in-app
 * agent uses — palmier's "one executor, two front-ends" idea, web-native.
 *
 * Security: gated behind a shared secret. Palmier binds its MCP server to
 * 127.0.0.1; we require `Authorization: Bearer $MCP_TOKEN`. With no token
 * configured the endpoint is DISABLED (503) — safe by default, never an open
 * door to edit timelines.
 *
 * Configure a client (e.g. Claude Code) with:
 *   url: http://localhost:3000/api/mcp?project=default
 *   header: Authorization: Bearer <MCP_TOKEN>
 */

const unauthorized = (msg: string, status: number) =>
  NextResponse.json({ error: msg }, { status });

/** Constant-time string compare that tolerates length differences. */
const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
};

const authorize = (request: Request): { ok: true } | { ok: false; response: NextResponse } => {
  const token = process.env.MCP_TOKEN;
  if (!token) {
    return { ok: false, response: unauthorized("MCP server disabled — set MCP_TOKEN to enable it", 503) };
  }
  const header = request.headers.get("authorization") ?? "";
  // Case-insensitive scheme (RFC 7235); constant-time secret comparison.
  const provided = /^bearer\s+/i.test(header) ? header.replace(/^bearer\s+/i, "") : "";
  if (!provided || !safeEqual(provided, token)) {
    return { ok: false, response: unauthorized("missing or invalid bearer token", 401) };
  }
  return { ok: true };
};

const projectIdFrom = (request: Request): string => {
  const raw = new URL(request.url).searchParams.get("project") ?? "default";
  return isValidProjectId(raw) ? raw : "default";
};

export async function POST(request: Request): Promise<NextResponse> {
  const auth = authorize(request);
  if (!auth.ok) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } },
      { status: 400 }
    );
  }

  const response = await dispatch(payload, { projectId: projectIdFrom(request) });
  // Notifications / ack-less messages produce no body (202 Accepted per spec).
  if (response === null) return new NextResponse(null, { status: 202 });
  return NextResponse.json(response);
}

// We don't offer a server-initiated SSE stream; clients must POST. Per the
// Streamable-HTTP spec, 405 is the correct response to a GET in that case.
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method not allowed — POST JSON-RPC to this endpoint" }, { status: 405 });
}
