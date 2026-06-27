import { TimelineEditor } from "@twick/timeline";
import type { Op } from "../ops";
import { planWordCuts, inferWordEnds, type CutAggressiveness } from "../transcript";
import { findElement, fail, ok, type OpResult } from "./base";

/**
 * Read a caption element's per-word start times (ms from project start) from the
 * project JSON — the same source serialize reads — so we don't depend on a
 * specific element-instance accessor.
 */
const wordStartsMs = (editor: TimelineEditor, id: string): number[] | null => {
  for (const track of editor.getProject().tracks ?? []) {
    const el = track.elements.find((e) => e.id === id);
    if (!el) continue;
    const props = (el.props ?? {}) as Record<string, unknown>;
    const metadata = (el.metadata ?? {}) as Record<string, unknown>;
    const raw = props.wordsMs ?? metadata.wordsMs;
    if (Array.isArray(raw) && raw.every((n) => typeof n === "number")) return raw as number[];
    return null;
  }
  return null;
};

/**
 * Descript-style filler removal: turn word selections into minimal cut ranges
 * (one undo entry). Ripple-deletes are applied RIGHT-TO-LEFT so cutting a later
 * range never shifts the times of an earlier, not-yet-applied one.
 */
export const applyRemoveWords = async (
  editor: TimelineEditor,
  op: Extract<Op, { op: "removeWords" }>
): Promise<OpResult> => {
  const found = findElement(editor, op.elementId);
  if (!found) return fail(op.op, `element ${op.elementId} not found — re-read the timeline; ids may have shifted`);

  const starts = wordStartsMs(editor, op.elementId);
  if (!starts || starts.length === 0) {
    return fail(op.op, `element ${op.elementId} has no transcript word timings — removeWords needs a caption clip with words`);
  }

  const clipEndMs = found.element.getEnd() * 1000;
  const words = inferWordEnds(starts, clipEndMs);
  const ranges = planWordCuts(words, op.words, (op.cutAggressiveness ?? "balanced") as CutAggressiveness);
  if (ranges.length === 0) {
    return fail(op.op, `no words resolved from the selection — indices must be 0..${starts.length - 1}`);
  }

  const removedSeconds = ranges.reduce((sum, r) => sum + (r.end - r.start), 0);
  for (const range of [...ranges].sort((a, b) => b.start - a.start)) {
    await editor.rippleDelete(range.start, range.end);
  }
  return ok(
    op.op,
    `Removed ${ranges.length} span(s) (${removedSeconds.toFixed(2)}s) from ${op.elementId}; later content shifted left. Word indices have changed — re-read before another word edit.`,
    [op.elementId]
  );
};
