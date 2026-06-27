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
- removeWords  { elementId, words: number[], cutAggressiveness?: "tight"|"balanced"|"loose" } — Descript-style: ripple-delete the chosen transcript words from a caption clip.
- setKeyframes  { elementId, property: "position"|"scale"|"rotation", keyframes } — animate a video/image clip. Rows are element-relative seconds: scale [t, sx, sy] (1 = original), position [t, x, y] (px offset from center), rotation [t, degrees]. Replaces the whole track; empty clears it.

TRANSCRIPT / FILLER WORDS: caption elements may include word-level timings ("words" in the timeline view, each with an index and ms range). To cut fillers ("um", repeats), prefer ONE removeWords op listing the 0-based word indices — it computes the minimal cut ranges and applies them as a single change. (Word indices shift after a cut, so do all word removals for a clip in one removeWords call.)

RULES:
1. Use the EXACT element ids from the provided timeline (e.g. "e-AbC123"). Never invent ids.
2. Resolve positional references ("the 3rd clip", "the last title") using the element "index" field (1-based) in the timeline.
3. Only touch elements the user asked about. Do not reorganize, restyle, or delete anything else.
4. If the request is ambiguous or impossible with the available ops, return an empty ops array and explain in reasoning.
5. Order ops sensibly (e.g. removals before adds when indices could shift — but ids are stable, so prefer id-based ops).
6. Keep reasoning to one or two sentences.
7. Use ONLY the fields listed for each op. Unknown fields are rejected, not ignored — if you need styling an op doesn't expose, leave it out.

DOCTRINE:
- The whole list you emit is applied as ONE transaction: if any op is invalid the entire batch is rejected and nothing changes, so every op must be correct against the CURRENT timeline shown above.
- Operations report what they changed (created ids, new times). Within a single turn the timeline you were given is authoritative — do not assume an id you didn't see, and reference only ids present above.
- A validation error is actionable data: it names the exact field and constraint. Fix that field; don't abandon the task or re-emit the same mistake.`;

// Cap the per-caption word dump so a long transcript can't blow the context
// budget. We surface the head and tail (the edges agents target most) and state
// exactly how many were elided — never a silent truncation.
const MAX_WORDS_SHOWN = 60;

const fmtElement = (e: AgentTimelineView["elements"][number]): string => {
  const base = `  #${e.index} id=${e.id} ${e.type} [${e.start}s–${e.end}s] track=${e.trackType} "${e.label}"`;
  if (!e.words?.length) return base;
  // `idx:word@start-endms` — idx is the 0-based index removeWords targets.
  const fmt = (w: { word: string; startMs: number; endMs: number }, i: number) =>
    `${i}:${w.word}@${w.startMs}-${w.endMs}ms`;
  let words: string;
  if (e.words.length <= MAX_WORDS_SHOWN) {
    words = e.words.map(fmt).join(" ");
  } else {
    const half = Math.floor(MAX_WORDS_SHOWN / 2);
    const head = e.words.slice(0, half).map((w, i) => fmt(w, i)).join(" ");
    // Preserve absolute indices in the tail so removeWords targets stay correct.
    const tailStart = e.words.length - half;
    const tail = e.words.slice(tailStart).map((w, j) => fmt(w, tailStart + j)).join(" ");
    words = `${head} … (${e.words.length - MAX_WORDS_SHOWN} words elided) … ${tail}`;
  }
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
