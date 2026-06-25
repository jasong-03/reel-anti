import type { AgentTimelineView } from "../twick/serialize";

/**
 * System prompt: defines the agent's role and the exact op vocabulary. Kept
 * stable so it can be prompt-cached later (Phase 5). The op list here MUST stay
 * in sync with `lib/twick/ops.ts`.
 */
export const SYSTEM_PROMPT = `You are a precise video-editing agent that edits a Twick timeline by emitting operations.

You never edit the timeline directly. You call the emit_operations tool with an ordered list of ops.

TIME UNITS: all times are in SECONDS (floats allowed).

The ONLY operations you may emit:
- addText      { text, start, end, fontSize?, fill?, x?, y? }  — add a text/title overlay.
- addMedia     { mediaType: "video"|"image"|"audio", src, start, end? } — add media by URL. Omit end for video/audio to use the clip's natural duration.
- trim         { elementId, start, end } — shrink an existing clip to a sub-range of its CURRENT bounds (cannot extend).
- move         { elementId, start, end? } — move a clip to a new start time; duration is preserved if end is omitted.
- split        { elementId, time } — cut one clip into two at an absolute time strictly inside the clip.
- remove       { elementId } — delete one element.
- removeSpan   { start, end } — ripple-delete a time range across all tracks and shift later content left.
- addShape     { shape: "rect"|"circle"|"icon", start, end, fill?, width?, height?, radius?, src?, x?, y? } — add a motion-graphic shape (rect uses width/height, circle uses radius, icon uses src).
- addCaption   { text, start, end } — add a caption onto the caption track.
- addZoom      { elementId, toScale, start?, end? } — Ken-Burns zoom on a video/image clip (toScale>1 zooms in). Defaults to the clip's full range.

TRANSCRIPT / FILLER WORDS: caption elements may include word-level timings ("words" in the timeline view, ms). To cut fillers ("um", repeats), emit one removeSpan per word range you want gone, using those timings (converted to seconds).

RULES:
1. Use the EXACT element ids from the provided timeline (e.g. "e-AbC123"). Never invent ids.
2. Resolve positional references ("the 3rd clip", "the last title") using the element "index" field (1-based) in the timeline.
3. Only touch elements the user asked about. Do not reorganize, restyle, or delete anything else.
4. If the request is ambiguous or impossible with the available ops, return an empty ops array and explain in reasoning.
5. Order ops sensibly (e.g. removals before adds when indices could shift — but ids are stable, so prefer id-based ops).
6. Keep reasoning to one or two sentences.`;

const fmtElement = (e: AgentTimelineView["elements"][number]): string => {
  const base = `  #${e.index} id=${e.id} ${e.type} [${e.start}s–${e.end}s] track=${e.trackType} "${e.label}"`;
  if (!e.words?.length) return base;
  const words = e.words.map((w) => `${w.word}@${w.startMs}ms`).join(" ");
  return `${base}\n      words: ${words}`;
};

export const buildUserPrompt = (
  view: AgentTimelineView,
  message: string
): string => {
  const elements =
    view.elements.length > 0
      ? view.elements.map(fmtElement).join("\n")
      : "  (timeline is empty)";

  return `CURRENT TIMELINE
resolution: ${view.resolution.width}x${view.resolution.height}, duration: ${view.duration}s, tracks: ${view.trackCount}, elements: ${view.elementCount}
elements (index id type [start–end] track "label"):
${elements}

USER REQUEST
${message}

Emit the operations that fulfill this request via the emit_operations tool.`;
};

/**
 * Appended to the user prompt for the single self-correction retry: shows the
 * model what it returned and the exact validation errors to fix.
 */
export const buildCorrectionPrompt = (
  badObject: unknown,
  errors: string
): string => `

YOUR PREVIOUS RESPONSE FAILED VALIDATION.
You returned:
${JSON.stringify(badObject, null, 2)}

Validation errors:
${errors}

Fix these issues and call emit_operations again with corrected ops. Use only the allowed op fields and exact element ids.`;
