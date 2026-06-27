import type { ProjectJSON } from "@twick/timeline";
import { parseOp } from "../twick/ops";
import { serializeForAgent } from "../twick/serialize";
import { executeOps } from "../twick/apply";
import { makeNodeEditor, healthCheck } from "../twick/headless";
import { appendMediaElement } from "../twick/apply/media-json";
import { getToolDef } from "./tool-registry";
import { getMediaProvider, getJob, deleteJob, type GenJob, type MediaKind } from "./media-gen";

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Apply a single fully-formed op object to the project (validate → atomic apply →
 * health). Shared by the op tools and the media tools (which build an addMedia op
 * once generation completes).
 */
const applyRawOp = async (
  rawOp: Record<string, unknown>,
  project: ProjectJSON,
  resolution: { width: number; height: number }
): Promise<ToolCallResult> => {
  const parsed = parseOp(rawOp);
  if (!parsed.ok) return err(`invalid arguments for "${rawOp.op}":\n${parsed.error}`);

  const editor = makeNodeEditor(project);
  const batch = await executeOps(editor, [parsed.op], resolution);
  if (!batch.ok) return err(batch.error ?? `"${rawOp.op}" failed`);

  const next = editor.getProject();
  const health = healthCheck(next);
  if (!health.ok) {
    return err(`"${rawOp.op}" produced a corrupted timeline (not applied):\n- ${health.issues.join("\n- ")}`);
  }
  const result = batch.results[0];
  const changed = batch.changed.length ? ` Changed ids: ${batch.changed.join(", ")}.` : "";
  return {
    content: `${result.message}.${changed} Trust these ids — do not re-read the timeline before your next edit.`,
    isError: false,
    project: next,
  };
};

/**
 * Place a finished generation job's result on the timeline. The headless executor
 * appends the ElementJSON directly (Twick's addMedia decodes media and only works
 * in the browser); the result is the same JSON the browser renders on load.
 */
const placeJobResult = (job: GenJob, args: Record<string, unknown>, ctx: ToolContext): ToolCallResult => {
  const src = job.resultUrls?.[0];
  if (!src) return err(`job ${job.id} is done but produced no result URL`);
  const mediaType = job.kind === "video" ? "video" : "image";
  const start = typeof args.start === "number" ? args.start : 0;
  const end = typeof args.end === "number" ? args.end : undefined;
  const name = job.prompt ? job.prompt.slice(0, 60) : undefined;
  const placed = appendMediaElement(ctx.project, { mediaType, src, start, ...(end !== undefined ? { end } : {}), ...(name ? { name } : {}) });

  const health = healthCheck(placed.project);
  if (!health.ok) return err(`placing the generated ${mediaType} corrupted the timeline:\n- ${health.issues.join("\n- ")}`);
  deleteJob(job.id); // placed — free any retained media bytes
  return {
    content: `Generated ${mediaType} placed on the timeline (id ${placed.elementId}, from ${start}s). Trust this id.`,
    isError: false,
    project: placed.project,
  };
};

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

  if (def.kind === "media") return executeMediaTool(name, args, ctx);

  // addMedia decodes media via the DOM inside Twick (getVideoMeta/getImageDimensions
  // use document.createElement), which throws headless. We append the equivalent
  // ElementJSON directly — the same JSON the browser renders — so the MCP addMedia
  // tool actually works instead of failing with ELEMENT_NOT_ADDED.
  if (name === "addMedia") return placeMediaHeadless(args, ctx);

  // Op tool: reconstruct the discriminated op and run it through the same Zod +
  // apply path the in-app agent uses, so the two front-ends can never diverge.
  return applyRawOp({ op: name, ...args }, ctx.project, resolution);
};

const placeMediaHeadless = (args: Record<string, unknown>, ctx: ToolContext): ToolCallResult => {
  const parsed = parseOp({ op: "addMedia", ...args });
  if (!parsed.ok) return err(`invalid arguments for "addMedia":\n${parsed.error}`);
  if (parsed.op.op !== "addMedia") return err("internal error: expected addMedia op");
  const op = parsed.op;
  const placed = appendMediaElement(ctx.project, {
    mediaType: op.mediaType,
    src: op.src,
    start: op.start,
    ...(op.end !== undefined ? { end: op.end } : {}),
    ...(op.name ? { name: op.name } : {}),
  });
  const health = healthCheck(placed.project);
  if (!health.ok) return err(`adding ${op.mediaType} corrupted the timeline:\n- ${health.issues.join("\n- ")}`);
  return {
    content: `Added ${op.mediaType} (id ${placed.elementId}) from ${op.start}s. Trust this id — do not re-read the timeline before your next edit.`,
    isError: false,
    project: placed.project,
  };
};

/**
 * Generative-media tools. generate_image completes inline (Imagen is sync; the
 * stub resolves in one poll) and drops the still on the timeline. generate_video
 * is async — it returns a jobId the caller polls via check_media_job, which places
 * the result once Veo finishes.
 */
const executeMediaTool = async (
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
): Promise<ToolCallResult> => {
  let provider: ReturnType<typeof getMediaProvider>;
  try {
    provider = getMediaProvider();
  } catch (e) {
    return err(e instanceof Error ? e.message : "media generation is not configured");
  }

  if (name === "check_media_job") {
    const jobId = typeof args.jobId === "string" ? args.jobId : "";
    if (!getJob(jobId)) return err(`unknown jobId "${jobId}"`);
    const job = await provider.poll(jobId);
    if (job.status === "error") return err(`generation failed: ${job.error}`);
    if (job.status === "pending") return { content: `job ${jobId} is still generating — poll again shortly`, isError: false };
    return placeJobResult(job, args, ctx);
  }

  const prompt = typeof args.prompt === "string" ? args.prompt : "";
  if (!prompt) return err(`"${name}" requires a non-empty prompt`);
  const kind: MediaKind = name === "generate_video" ? "video" : "image";
  const req = {
    kind,
    prompt,
    ...(typeof args.model === "string" ? { model: args.model } : {}),
    ...(typeof args.aspectRatio === "string" ? { aspectRatio: args.aspectRatio } : {}),
  };

  let job = await provider.submit(req);
  if (job.status === "error") return err(`generation failed: ${job.error}`);

  if (kind === "video") {
    return {
      content: `Started video generation (job ${job.id}). It's slow — call check_media_job with this jobId until it's done; that will place it on the timeline.`,
      isError: false,
    };
  }

  // Image: poll to completion inline (fast). Bounded so a stuck provider can't hang.
  for (let i = 0; i < 8 && job.status === "pending"; i++) {
    await sleep(400);
    job = await provider.poll(job.id);
  }
  if (job.status === "error") return err(`generation failed: ${job.error}`);
  if (job.status !== "done") return { content: `image job ${job.id} did not finish in time — poll check_media_job`, isError: false };
  return placeJobResult(job, args, ctx);
};
