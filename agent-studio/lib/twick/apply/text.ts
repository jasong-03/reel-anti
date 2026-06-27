import { TimelineEditor, TextElement } from "@twick/timeline";
import type { Op } from "../ops";
import { addToSuitableTrack, fail, ok, type OpResult } from "./base";

export const applyAddText = async (
  editor: TimelineEditor,
  op: Extract<Op, { op: "addText" }>
): Promise<OpResult> => {
  if (op.end <= op.start) return fail(op.op, "end must be greater than start");
  const el = new TextElement(op.text, {
    fontSize: op.fontSize ?? 48,
    fill: op.fill ?? "#FFFFFF",
    ...(op.x !== undefined ? { x: op.x } : {}),
    ...(op.y !== undefined ? { y: op.y } : {}),
  });
  el.setStart(op.start).setEnd(op.end);
  const trackId = await addToSuitableTrack(editor, el, "text", op.start, op.end);
  return ok(op.op, `Added text "${op.text}" (${op.start}s–${op.end}s)`, [el.getId(), trackId]);
};
