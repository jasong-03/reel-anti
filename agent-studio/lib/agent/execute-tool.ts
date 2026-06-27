import type { ProjectJSON } from "@twick/timeline";
import { parseOp } from "../twick/ops";
import { serializeForAgent } from "../twick/serialize";
import { executeOps } from "../twick/apply";
import { makeNodeEditor, healthCheck } from "../twick/headless";
import { getToolDef } from "./tool-registry";

/**
 * The shared tool executor — the single place a tool call becomes a timeline
 * mutation, used by the MCP server (and available to the in-app route). Stateless
 * by design: it takes the current project, applies the call, and returns the new
 * project so the caller owns persistence.
 *
 * Errors are DATA, never exceptions: every failure returns `{ isError: true }`
 * with an actionable, agent-readable message so the model self-corrects on the
 * next turn instead of crashing the loop.
 */

export interface ToolContext {
  project: ProjectJSON;
  resolution?: { width: number; height: number };
}

export interface ToolCallResult {
  /** Human/agent-readable text block (MCP `content`). */
  content: string;
  isError: boolean;
  /** Present (and possibly mutated) for op tools; absent for read tools. */
  project?: ProjectJSON;
  /** Machine-readable payload for read tools (e.g. the serialized view). */
  data?: unknown;
}

const DEFAULT_RESOLUTION = { width: 1080, height: 1920 };

const resolutionFor = (ctx: ToolContext): { width: number; height: number } => {
  const props = (ctx.project as { properties?: { width?: number; height?: number } }).properties;
  if (props && typeof props.width === "number" && typeof props.height === "number") {
    return { width: props.width, height: props.height };
  }
  return ctx.resolution ?? DEFAULT_RESOLUTION;
};

const err = (content: string): ToolCallResult => ({ content, isError: true });

export const executeTool = async (
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolCallResult> => {
  const def = getToolDef(name);
  if (!def) {
    const known = [...["get_timeline", "check_timeline_health"]].join(", ");
    return err(`unknown tool "${name}". Read tools: ${known}. Op tools are named after each operation.`);
  }

  const resolution = resolutionFor(ctx);

  if (def.kind === "read") {
    if (name === "get_timeline") {
      const view = serializeForAgent(ctx.project, resolution);
      return { content: JSON.stringify(view), isError: false, data: view };
    }
    if (name === "check_timeline_health") {
      const health = healthCheck(ctx.project);
      return {
        content: health.ok ? "ok: timeline is healthy" : `corrupted:\n- ${health.issues.join("\n- ")}`,
        isError: !health.ok,
        data: health,
      };
    }
    return err(`read tool "${name}" has no handler`);
  }

  // Op tool: reconstruct the discriminated op and run it through the same Zod +
  // apply path the in-app agent uses, so the two front-ends can never diverge.
  const parsed = parseOp({ op: name, ...args });
  if (!parsed.ok) {
    return err(`invalid arguments for "${name}":\n${parsed.error}`);
  }

  const editor = makeNodeEditor(ctx.project);
  const batch = await executeOps(editor, [parsed.op], resolution);
  if (!batch.ok) {
    return err(batch.error ?? `"${name}" failed`);
  }

  const project = editor.getProject();
  const health = healthCheck(project);
  if (!health.ok) {
    // Defense in depth: a mutation that passed apply but corrupted the timeline is
    // a bug, not the agent's fault — surface it as an error and don't persist.
    return err(`"${name}" produced a corrupted timeline (not applied):\n- ${health.issues.join("\n- ")}`);
  }

  const result = batch.results[0];
  const changed = batch.changed.length ? ` Changed ids: ${batch.changed.join(", ")}.` : "";
  return {
    content: `${result.message}.${changed} Trust these ids — do not re-read the timeline before your next edit.`,
    isError: false,
    project,
  };
};
