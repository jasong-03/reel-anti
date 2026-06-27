import { LATEST_PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { ALL_TOOLS, getToolDef } from "./tool-registry";
import { loadProject, saveProject } from "./mcp-store";
import { logUsage } from "./usage-log";

// `execute-tool` transitively imports @twick/timeline VALUES, which register React
// contexts at module load. Next evaluates a route's static imports during
// "collect page data" (build) where the server React shim has no createContext, so
// a static import would break the build. Loading it lazily at request time (the
// route runtime is "nodejs", real React present) keeps the build clean — exactly
// how the in-app /api/agent route stays Twick-value-free via `import type`.
const loadExecutor = () => import("./execute-tool").then((m) => m.executeTool);

/**
 * MCP server logic, transport-agnostic. The HTTP route (`app/api/mcp/route.ts`)
 * does auth + reads the body, then hands each JSON-RPC message here. Keeping the
 * protocol dispatch pure makes it unit-testable without standing up Next.
 *
 * This implements the MCP Streamable-HTTP method set we need (initialize,
 * tools/list, tools/call, ping) as plain JSON-RPC 2.0 — MCP is JSON-RPC over
 * HTTP, so this is the spec, not a mock. The @modelcontextprotocol/sdk supplies
 * the protocol-version constants we negotiate against; its full Node transport
 * can drop in later if we want server-initiated SSE.
 */

export const SERVER_INFO = { name: "reel-anti", version: "0.1.0" } as const;

type Id = string | number | null;

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: Id;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: Id;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

// JSON-RPC + MCP error codes.
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

const result = (id: Id, value: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result: value });
const error = (id: Id, code: number, message: string): JsonRpcResponse => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

const negotiateVersion = (requested: unknown): string =>
  typeof requested === "string" && SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
    ? requested
    : LATEST_PROTOCOL_VERSION;

const toolList = () =>
  ALL_TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema }));

/**
 * Handle one JSON-RPC message. Returns the response, or `null` for notifications
 * (messages with no `id`), which per spec receive no reply.
 */
export const handleMessage = async (
  message: JsonRpcRequest,
  opts: { projectId: string }
): Promise<JsonRpcResponse | null> => {
  if (message.jsonrpc !== "2.0" || typeof message.method !== "string") {
    return error(message.id ?? null, INVALID_REQUEST, "not a valid JSON-RPC 2.0 request");
  }

  const isNotification = message.id === undefined;
  const id = message.id ?? null;

  switch (message.method) {
    case "initialize":
      return result(id, {
        protocolVersion: negotiateVersion(message.params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
      });

    case "ping":
      return result(id, {});

    case "tools/list":
      return result(id, { tools: toolList() });

    case "tools/call": {
      const params = message.params ?? {};
      const name = params.name;
      if (typeof name !== "string") {
        return error(id, INVALID_PARAMS, "tools/call requires a string `name`");
      }
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const executeTool = await loadExecutor();
        const project = await loadProject(opts.projectId);
        const call = await executeTool(name, args, { project });
        if (call.project) await saveProject(opts.projectId, call.project);
        // Diagnostics trail: external tool calls land in the same usage log as the
        // in-app agent, tagged source:"mcp", so failing prompts are visible across
        // both front-ends. Fire-and-forget — must never break the call.
        void logUsage({
          message: `mcp:${name}`,
          provider: "mcp",
          model: "-",
          tier: "-",
          attempts: 1,
          opCount: getToolDef(name)?.kind === "op" ? 1 : 0,
          ops: getToolDef(name)?.kind === "op" ? [name] : [],
          destructiveCount: name === "remove" || name === "removeSpan" ? 1 : 0,
          ok: !call.isError,
          error: call.isError ? call.content : undefined,
          source: "mcp",
        });
        // MCP convention: tool-level failures are reported via isError + content,
        // NOT a JSON-RPC error (those are reserved for protocol failures).
        return result(id, { content: [{ type: "text", text: call.content }], isError: call.isError });
      } catch (e) {
        return error(id, INTERNAL_ERROR, e instanceof Error ? e.message : "tool execution failed");
      }
    }

    default:
      if (message.method.startsWith("notifications/")) return null; // ack-less
      if (isNotification) return null;
      return error(id, METHOD_NOT_FOUND, `unknown method: ${message.method}`);
  }
};

/** Dispatch a parsed JSON-RPC payload (single object or a batch array). */
export const dispatch = async (
  payload: unknown,
  opts: { projectId: string }
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> => {
  if (Array.isArray(payload)) {
    if (payload.length === 0) {
      return error(null, INVALID_REQUEST, "empty batch");
    }
    const responses = await Promise.all(
      payload.map((m) => handleMessage(m as JsonRpcRequest, opts))
    );
    const real = responses.filter((r): r is JsonRpcResponse => r !== null);
    return real.length ? real : null;
  }
  if (payload === null || typeof payload !== "object") {
    return error(null, PARSE_ERROR, "invalid JSON-RPC payload");
  }
  return handleMessage(payload as JsonRpcRequest, opts);
};
