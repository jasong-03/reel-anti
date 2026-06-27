import { TimelineEditor, ElementFrameEffect } from "@twick/timeline";
import type { Op } from "../ops";
import { findElement, isFramed, fail, ok, type OpResult, type Resolution } from "./base";

export const applyAddZoom = (
  editor: TimelineEditor,
  op: Extract<Op, { op: "addZoom" }>,
  resolution: Resolution
): OpResult => {
  const found = findElement(editor, op.elementId);
  if (!found) return fail(op.op, `element ${op.elementId} not found — re-read the timeline; ids may have shifted`);
  if (!isFramed(found.element)) return fail(op.op, "zoom applies only to video or image clips");
  const start = op.start ?? found.element.getStart();
  const end = op.end ?? found.element.getEnd();
  if (end <= start) return fail(op.op, "zoom end must be after start");

  const baseSize = found.element.getFrame()?.size ?? [resolution.width, resolution.height];
  const [bw, bh] = baseSize;
  const targetW = bw * op.toScale;
  const targetH = bh * op.toScale;
  // Keep the zoom centered in the scene.
  const effect = new ElementFrameEffect(start, end).setProps({
    frameSize: [targetW, targetH],
    framePosition: { x: (resolution.width - targetW) / 2, y: (resolution.height - targetH) / 2 },
    transitionDuration: end - start,
  });
  found.element.addFrameEffect(effect);
  editor.updateElement(found.element);
  return ok(op.op, `Added zoom→${op.toScale}× on ${op.elementId} (${start}s–${end}s)`, [op.elementId]);
};
