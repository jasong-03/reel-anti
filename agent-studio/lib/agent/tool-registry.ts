import { OP_NAMES } from "../twick/ops";

/**
 * Single source of truth for the tools an external agent (Claude Code / Cursor /
 * Codex via the MCP server) can call. Palmier's structural idea: ONE registry →
 * two front-ends. The same definitions describe the MCP `tools/list` surface and
 * are executed by the shared `executeTool` (see `execute-tool.ts`).
 *
 * Op tools are named exactly after the op; the executor reconstructs the op as
 * `{ op: name, ...arguments }` and runs it through the same Zod + apply layer the
 * in-app agent uses, so the two front-ends can never drift.
 */

export type ToolKind = "read" | "op" | "media";

export interface JsonSchema {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties: false;
}

export interface ToolDef {
  name: string;
  kind: ToolKind;
  description: string;
  inputSchema: JsonSchema;
}

const num = { type: "number" } as const;
const str = { type: "string" } as const;
const obj = (
  properties: Record<string, unknown>,
  required: string[] = []
): JsonSchema => ({ type: "object", properties, required, additionalProperties: false });

/** Per-op argument schemas (the `op` discriminator is implied by the tool name). */
const OP_SCHEMAS: Record<(typeof OP_NAMES)[number], { description: string; schema: JsonSchema }> = {
  addText: {
    description: "Add a text/title overlay over a time range (seconds).",
    schema: obj(
      { text: str, start: num, end: num, fontSize: num, fill: str, x: num, y: num },
      ["text", "start", "end"]
    ),
  },
  addMedia: {
    description: "Add media by URL. Omit end for video/audio to use its natural duration.",
    schema: obj(
      { mediaType: { type: "string", enum: ["video", "image", "audio"] }, src: str, start: num, end: num },
      ["mediaType", "src", "start"]
    ),
  },
  trim: {
    description: "Shrink an existing clip to a sub-range of its CURRENT bounds (cannot extend).",
    schema: obj({ elementId: str, start: num, end: num }, ["elementId", "start", "end"]),
  },
  move: {
    description: "Move a clip to a new start time; duration is preserved if end is omitted.",
    schema: obj({ elementId: str, start: num, end: num }, ["elementId", "start"]),
  },
  split: {
    description: "Cut one clip into two at an absolute time strictly inside the clip.",
    schema: obj({ elementId: str, time: num }, ["elementId", "time"]),
  },
  remove: {
    description: "Delete one element by id.",
    schema: obj({ elementId: str }, ["elementId"]),
  },
  removeSpan: {
    description: "Ripple-delete a time range across all tracks and shift later content left.",
    schema: obj({ start: num, end: num }, ["start", "end"]),
  },
  addShape: {
    description: "Add a motion-graphic shape (rect uses width/height, circle uses radius, icon uses src).",
    schema: obj(
      {
        shape: { type: "string", enum: ["rect", "circle", "icon"] },
        start: num,
        end: num,
        fill: str,
        width: num,
        height: num,
        radius: num,
        src: str,
        x: num,
        y: num,
      },
      ["shape", "start", "end"]
    ),
  },
  addCaption: {
    description: "Add a caption onto the dedicated caption track.",
    schema: obj({ text: str, start: num, end: num }, ["text", "start", "end"]),
  },
  addZoom: {
    description: "Ken-Burns zoom on a video/image clip (toScale>1 zooms in). Defaults to the clip's full range.",
    schema: obj({ elementId: str, toScale: num, start: num, end: num }, ["elementId", "toScale"]),
  },
  removeWords: {
    description:
      "Descript-style filler removal from a caption clip: ripple-delete the chosen transcript words. Use the 0-based indices from the clip's `words` list. cutAggressiveness bridges short gaps between fillers (tight|balanced|loose). Indices shift after the cut — re-read before another word edit.",
    schema: obj(
      {
        elementId: str,
        words: {
          type: "array",
          minItems: 1,
          items: { oneOf: [{ type: "number" }, { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 }] },
        },
        cutAggressiveness: { type: "string", enum: ["tight", "balanced", "loose"] },
      },
      ["elementId", "words"]
    ),
  },
};

export const READ_TOOLS: ToolDef[] = [
  {
    name: "get_timeline",
    kind: "read",
    description:
      "Read the current timeline as a compact JSON view: resolution, duration, tracks, and an indexed element list (id, type, [start–end]s, label, caption words). Call this first, and again only after edits you did NOT make yourself.",
    inputSchema: obj({}),
  },
  {
    name: "check_timeline_health",
    kind: "read",
    description:
      "Validate the current timeline for corruption (duplicate ids, inverted/overlapping ranges, dangling track refs). Returns ok plus any issues.",
    inputSchema: obj({}),
  },
];

export const OP_TOOLS: ToolDef[] = OP_NAMES.map((name) => ({
  name,
  kind: "op" as const,
  description: OP_SCHEMAS[name].description,
  inputSchema: OP_SCHEMAS[name].schema,
}));

/** Generative-media tools (W4). On completion they emit the existing addMedia op. */
export const MEDIA_TOOLS: ToolDef[] = [
  {
    name: "generate_image",
    kind: "media",
    description:
      "Generate a still image from a text prompt and place it on the timeline (via addMedia). Synchronous — returns once the image is on the timeline. Costs money; not undoable as a generation. Defaults to a 4s clip at the given start.",
    inputSchema: obj(
      { prompt: str, model: str, aspectRatio: str, start: num, end: num },
      ["prompt"]
    ),
  },
  {
    name: "generate_video",
    kind: "media",
    description:
      "Start generating a video from a text prompt. Async and slow — returns a jobId; poll with check_media_job until done, which then places it on the timeline. Costs money. Tip: generate a still first and confirm before animating it.",
    inputSchema: obj({ prompt: str, model: str, aspectRatio: str }, ["prompt"]),
  },
  {
    name: "check_media_job",
    kind: "media",
    description:
      "Poll a generation job by id. When done, places the result on the timeline (via addMedia) at the given start; otherwise reports it's still pending.",
    inputSchema: obj({ jobId: str, start: num, end: num }, ["jobId"]),
  },
];

export const ALL_TOOLS: ToolDef[] = [...READ_TOOLS, ...OP_TOOLS, ...MEDIA_TOOLS];

const BY_NAME = new Map(ALL_TOOLS.map((t) => [t.name, t]));
export const getToolDef = (name: string): ToolDef | undefined => BY_NAME.get(name);
