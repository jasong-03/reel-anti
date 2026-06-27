import { TimelineEditor } from "@twick/timeline";
import type { Op } from "../ops";
import { fail, ok, type OpResult } from "./base";

/** Timeline-wide ops: ripple delete a span across all tracks. */
export const applyRemoveSpan = async (
  editor: TimelineEditor,
  op: Extract<Op, { op: "removeSpan" }>
): Promise<OpResult> => {
  if (op.end <= op.start) return fail(op.op, "end must be greater than start");
  await editor.rippleDelete(op.start, op.end);
  return ok(op.op, `Ripple-deleted ${op.start}s–${op.end}s; later content shifted left by ${op.end - op.start}s`);
};
