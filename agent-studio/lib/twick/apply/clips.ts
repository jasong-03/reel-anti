import { TimelineEditor } from "@twick/timeline";
import type { Op } from "../ops";
import { findElement, fail, ok, type OpResult } from "./base";

/** Clip-lifecycle ops: trim, move, split, remove. */

export const applyTrim = (
  editor: TimelineEditor,
  op: Extract<Op, { op: "trim" }>
): OpResult => {
  const found = findElement(editor, op.elementId);
  if (!found) return fail(op.op, `element ${op.elementId} not found — re-read the timeline; ids may have shifted`);
  const success = editor.trimElement(found.element, op.start, op.end);
  return success
    ? ok(op.op, `Trimmed ${op.elementId} to ${op.start}s–${op.end}s`, [op.elementId])
    : fail(op.op, "trim rejected — new bounds must lie within the clip's current range");
};

export const applyMove = (
  editor: TimelineEditor,
  op: Extract<Op, { op: "move" }>
): OpResult => {
  const found = findElement(editor, op.elementId);
  if (!found) return fail(op.op, `element ${op.elementId} not found — re-read the timeline; ids may have shifted`);
  const duration = found.element.getEnd() - found.element.getStart();
  const end = op.end ?? op.start + duration;
  if (end <= op.start) return fail(op.op, "resulting end must be after start");
  editor.updateElements([{ elementId: op.elementId, updates: { s: op.start, e: end } }]);
  return ok(op.op, `Moved ${op.elementId} to start at ${op.start}s (now ${op.start}s–${end}s)`, [op.elementId]);
};

export const applySplit = async (
  editor: TimelineEditor,
  op: Extract<Op, { op: "split" }>
): Promise<OpResult> => {
  const found = findElement(editor, op.elementId);
  if (!found) return fail(op.op, `element ${op.elementId} not found — re-read the timeline; ids may have shifted`);
  const result = await editor.splitElement(found.element, op.time);
  if (!result.success) {
    return fail(op.op, `split rejected — time ${op.time}s must fall strictly inside the clip`);
  }
  const created = [result.firstElement?.getId(), result.secondElement?.getId()].filter(Boolean) as string[];
  return ok(op.op, `Split ${op.elementId} at ${op.time}s into ${created.join(" + ")}`, created);
};

export const applyRemove = (
  editor: TimelineEditor,
  op: Extract<Op, { op: "remove" }>
): OpResult => {
  const found = findElement(editor, op.elementId);
  if (!found) return fail(op.op, `element ${op.elementId} not found — re-read the timeline; ids may have shifted`);
  const success = editor.removeElement(found.element);
  return success
    ? ok(op.op, `Removed ${op.elementId}`, [op.elementId])
    : fail(op.op, `could not remove ${op.elementId}`);
};
