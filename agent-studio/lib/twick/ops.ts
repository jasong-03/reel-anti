import { z } from "zod";

/**
 * The agent operation vocabulary — the validated contract between Claude/Gemini
 * and the Twick timeline. Each op maps to exactly one TimelineEditor call in
 * `apply/`. Keep this list small and deterministic.
 *
 * Times are in SECONDS to match the timeline model (ElementJSON.s / .e).
 *
 * Every op is `.strict()`: unknown keys are rejected rather than silently
 * dropped, so a model that hallucinates a field (e.g. `color` instead of `fill`)
 * gets an actionable, JSON-path-prefixed error it can self-correct on, instead of
 * an edit that quietly does the wrong thing. (Palmier "errors as data" doctrine.)
 */

const seconds = z.number().min(0, "time must be >= 0");
const elementId = z.string().min(1, "elementId required");

export const addTextOp = z.object({
  op: z.literal("addText"),
  text: z.string().min(1, "text required"),
  start: seconds,
  end: seconds,
  /** Optional styling — safe defaults applied when omitted. */
  fontSize: z.number().positive().optional(),
  fill: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
}).strict();

export const addMediaOp = z.object({
  op: z.literal("addMedia"),
  mediaType: z.enum(["video", "image", "audio"]),
  src: z.string().url("src must be a URL"),
  start: seconds,
  /** Optional for video/audio: defaults to natural media duration when omitted. */
  end: seconds.optional(),
}).strict();

export const trimOp = z.object({
  op: z.literal("trim"),
  elementId,
  /** New bounds. trim only NARROWS within the element's current [s, e]. */
  start: seconds,
  end: seconds,
}).strict();

export const moveOp = z.object({
  op: z.literal("move"),
  elementId,
  /** New start time; duration is preserved unless `end` is given. */
  start: seconds,
  end: seconds.optional(),
}).strict();

export const splitOp = z.object({
  op: z.literal("split"),
  elementId,
  /** Absolute time at which to cut the element in two. */
  time: seconds,
}).strict();

export const removeOp = z.object({
  op: z.literal("remove"),
  elementId,
}).strict();

export const removeSpanOp = z.object({
  op: z.literal("removeSpan"),
  /** Ripple-delete: cut [start, end] across all tracks and shift later content left. */
  start: seconds,
  end: seconds,
}).strict();

// ── Phase 2: breadth (motion graphics + captions) ───────────────────────────

export const addShapeOp = z.object({
  op: z.literal("addShape"),
  shape: z.enum(["rect", "circle", "icon"]),
  start: seconds,
  end: seconds,
  fill: z.string().optional(),
  /** rect: width+height. circle: radius. icon: src (+ optional width/height). */
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  radius: z.number().positive().optional(),
  src: z.string().url().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
}).strict();

export const addCaptionOp = z.object({
  op: z.literal("addCaption"),
  text: z.string().min(1, "caption text required"),
  start: seconds,
  end: seconds,
}).strict();

export const addZoomOp = z.object({
  op: z.literal("addZoom"),
  /** Video or image element to apply a Ken-Burns style zoom to. */
  elementId,
  /** Target scale: >1 zooms in, <1 zooms out. */
  toScale: z.number().positive(),
  /** Optional sub-range; defaults to the clip's full extent. */
  start: seconds.optional(),
  end: seconds.optional(),
}).strict();

export const removeWordsOp = z.object({
  op: z.literal("removeWords"),
  /** The caption clip whose transcript words are being cut. */
  elementId,
  /**
   * Words to remove, by their 0-based index in the clip's "words" list. Each
   * entry is a single index or an inclusive [from, to] index span.
   */
  words: z
    .array(
      z.union([
        z.number().int().nonnegative(),
        z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]),
      ])
    )
    .min(1, "select at least one word to remove"),
  /** How greedily to bridge short kept gaps between fillers. Default "balanced". */
  cutAggressiveness: z.enum(["tight", "balanced", "loose"]).optional(),
}).strict();

const interp = z.enum(["linear", "hold", "smooth"]);
/** One keyframe row: [t, value, interp?] (rotation) or [t, x, y, interp?] (position/scale). */
const keyframeRow = z.array(z.union([z.number(), interp])).min(2);

export const setKeyframesOp = z.object({
  op: z.literal("setKeyframes"),
  /** Video/image clip to animate. */
  elementId,
  property: z.enum(["position", "scale", "rotation"]),
  /**
   * Keyframe rows, replacing the whole track for this property. Times are
   * ELEMENT-RELATIVE seconds (0 = clip start). An empty array clears the track.
   * scale (x,y multipliers, 1 = original), position (x,y offset from center, px),
   * rotation (degrees). Optional trailing interp per row: "linear"|"hold"|"smooth".
   */
  keyframes: z.array(keyframeRow),
}).strict();

export const opSchema = z.discriminatedUnion("op", [
  addTextOp,
  addMediaOp,
  trimOp,
  moveOp,
  splitOp,
  removeOp,
  removeSpanOp,
  addShapeOp,
  addCaptionOp,
  addZoomOp,
  removeWordsOp,
  setKeyframesOp,
]);

export type Op = z.infer<typeof opSchema>;

/** The shape the agent route returns to the client. */
export const agentResponseSchema = z.object({
  reasoning: z.string(),
  ops: z.array(opSchema).max(20, "too many ops in one turn"),
});

export type AgentResponse = z.infer<typeof agentResponseSchema>;

/**
 * Render Zod issues as flat, JSON-path-prefixed lines an LLM can act on, e.g.
 * `ops[0].fill: Unrecognized key`. Shared by the route's self-correction loop and
 * the MCP executor so both speak the same actionable-error dialect.
 */
export const formatIssues = (
  issues: { path: (string | number)[]; message: string }[]
): string =>
  issues
    .map((i) => `- ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");

/**
 * Validate a single op object (errors-as-data). Returns the typed op or a
 * human-readable error string — never throws — so callers can feed the message
 * straight back to the model.
 */
export const parseOp = (
  raw: unknown
): { ok: true; op: Op } | { ok: false; error: string } => {
  const parsed = opSchema.safeParse(raw);
  if (parsed.success) return { ok: true, op: parsed.data };
  return { ok: false, error: formatIssues(parsed.error.issues) };
};

/** Stable list of op names — used in the system prompt and for docs. */
export const OP_NAMES = [
  "addText",
  "addMedia",
  "trim",
  "move",
  "split",
  "remove",
  "removeSpan",
  "addShape",
  "addCaption",
  "addZoom",
  "removeWords",
  "setKeyframes",
] as const;
