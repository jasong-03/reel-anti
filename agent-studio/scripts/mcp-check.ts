/**
 * Offline verification of the W1/W2 additions — no LLM, no browser, no key:
 *   - executeTool (read + op tools, errors-as-data)
 *   - executeOps atomic rollback (one bad op rejects the whole batch)
 *   - the MCP JSON-RPC dispatch (initialize / tools/list / tools/call)
 *
 * Run: npx tsx scripts/mcp-check.ts
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectJSON } from "@twick/timeline";
import { executeOps } from "../lib/twick/apply";
import { executeTool } from "../lib/agent/execute-tool";
import { dispatch } from "../lib/agent/mcp-server";
import { ALL_TOOLS } from "../lib/agent/tool-registry";
import { makeNodeEditor, SEED_TITLES } from "./_harness";
import type { Op } from "../lib/twick/ops";

const RES = { width: 720, height: 1280 };

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const ids = (p: ProjectJSON): string[] => p.tracks.flatMap((t) => t.elements.map((e) => e.id));

async function main() {
  // ── executeOps: atomic rollback ────────────────────────────────────────────
  {
    const editor = makeNodeEditor(SEED_TITLES);
    // First op valid, second references a missing id → whole batch must roll back.
    const batch: Op[] = [
      { op: "addText", text: "Should Not Persist", start: 0, end: 1 },
      { op: "remove", elementId: "e-does-not-exist" },
    ];
    const res = await executeOps(editor, batch, RES);
    check("executeOps: invalid batch rejected", !res.ok);
    check("executeOps: rollback left timeline untouched (still 3 ids)", ids(editor.getProject()).length === 3);
    check(
      "executeOps: the valid op did NOT persist",
      !editor.getProject().tracks.some((t) => t.elements.some((e) => (e.props?.text ?? e.t) === "Should Not Persist"))
    );
  }
  {
    const editor = makeNodeEditor(SEED_TITLES);
    const res = await executeOps(editor, [{ op: "remove", elementId: "e-clip3" }], RES);
    check("executeOps: valid batch applies + reports changed", res.ok && res.changed.includes("e-clip3"));
    check("executeOps: e-clip3 actually removed", !ids(editor.getProject()).includes("e-clip3"));
  }

  // ── executeTool: read tools ────────────────────────────────────────────────
  {
    const view = await executeTool("get_timeline", {}, { project: SEED_TITLES, resolution: RES });
    check("get_timeline: ok + parseable view", !view.isError && JSON.parse(view.content).elements.length === 3);

    const health = await executeTool("check_timeline_health", {}, { project: SEED_TITLES });
    check("check_timeline_health: clean seed is healthy", !health.isError);
  }

  // ── executeTool: op tools (stateless project in/out) ───────────────────────
  {
    const added = await executeTool(
      "addText",
      { text: "Intro", start: 0, end: 3 },
      { project: { version: 1, tracks: [] } as ProjectJSON, resolution: RES }
    );
    check("addText tool: ok + returns mutated project", !added.isError && !!added.project);
    check(
      "addText tool: new project carries the text",
      !!added.project?.tracks.some((t) => t.elements.some((e) => (e.props?.text ?? e.t) === "Intro"))
    );

    const bad = await executeTool("addText", { text: "x", start: 3, end: 1 }, { project: SEED_TITLES, resolution: RES });
    check("addText tool: inverted range is errors-as-data (isError, no throw)", bad.isError);

    const unknownField = await executeTool(
      "addText",
      { text: "x", start: 0, end: 1, color: "red" },
      { project: SEED_TITLES, resolution: RES }
    );
    check("addText tool: unknown field rejected with actionable error", unknownField.isError && /color/.test(unknownField.content));

    const unknownTool = await executeTool("frobnicate", {}, { project: SEED_TITLES });
    check("unknown tool: errors-as-data", unknownTool.isError && /unknown tool/.test(unknownTool.content));

    // H1: addMedia op works headless via JSON append (Twick's decode is browser-only).
    const media = await executeTool(
      "addMedia",
      { mediaType: "image", src: "https://example.com/a.jpg", start: 0, end: 4 },
      { project: { version: 1, tracks: [] } as ProjectJSON, resolution: RES }
    );
    check("addMedia tool: places media headless (no ELEMENT_NOT_ADDED)", !media.isError && !!media.project);
    check("addMedia tool: image element present", !!media.project?.tracks.some((t) => t.elements.some((e) => e.type === "image")));
  }

  // ── MCP JSON-RPC dispatch ──────────────────────────────────────────────────
  {
    const PID = "__mcp_check__";
    // Start from a clean store so the persistence assertion is deterministic.
    await fs.rm(path.join(process.cwd(), ".data", "projects", `${PID}.json`), { force: true });
    const init = await dispatch({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, { projectId: PID });
    check("mcp initialize: returns serverInfo + protocolVersion",
      !Array.isArray(init) && !!init && (init.result as { serverInfo?: { name?: string } }).serverInfo?.name === "reel-anti");

    const list = await dispatch({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { projectId: PID });
    const tools = !Array.isArray(list) && list ? (list.result as { tools: unknown[] }).tools : [];
    check("mcp tools/list: lists every registry tool", tools.length === ALL_TOOLS.length);

    const notif = await dispatch({ jsonrpc: "2.0", method: "notifications/initialized" }, { projectId: PID });
    check("mcp notification: no response", notif === null);

    const unknown = await dispatch({ jsonrpc: "2.0", id: 3, method: "bogus/method" }, { projectId: PID });
    check("mcp unknown method: JSON-RPC -32601",
      !Array.isArray(unknown) && !!unknown && (unknown.error as { code?: number }).code === -32601);

    // tools/call against the file store: add then read back, proving persistence.
    await dispatch(
      { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "addText", arguments: { text: "MCP Wins", start: 0, end: 2 } } },
      { projectId: PID }
    );
    const read = await dispatch(
      { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_timeline", arguments: {} } },
      { projectId: PID }
    );
    const text = !Array.isArray(read) && read ? (read.result as { content: { text: string }[] }).content[0].text : "";
    check("mcp tools/call: op persisted across calls (read-back sees it)", /MCP Wins/.test(text));

    // C1: a JSON-RPC BATCH of two edits to the same project must chain (per-project
    // lock), not clobber — both must persist, not just the last.
    const BID = "__mcp_batch__";
    await fs.rm(path.join(process.cwd(), ".data", "projects", `${BID}.json`), { force: true });
    await dispatch(
      [
        { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "addText", arguments: { text: "Batch A", start: 0, end: 2 } } },
        { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "addText", arguments: { text: "Batch B", start: 3, end: 5 } } },
      ],
      { projectId: BID }
    );
    const readBatch = await dispatch(
      { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "get_timeline", arguments: {} } },
      { projectId: BID }
    );
    const batchText = !Array.isArray(readBatch) && readBatch ? (readBatch.result as { content: { text: string }[] }).content[0].text : "";
    check("mcp batch: both edits chained + persisted (C1)", /Batch A/.test(batchText) && /Batch B/.test(batchText));

    await fs.rm(path.join(process.cwd(), ".data", "projects", `${PID}.json`), { force: true });
    await fs.rm(path.join(process.cwd(), ".data", "projects", `${BID}.json`), { force: true });
  }

  console.log(`\nMCP check: ${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
