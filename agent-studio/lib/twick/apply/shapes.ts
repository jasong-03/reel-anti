import {
  TimelineEditor,
  TrackElement,
  RectElement,
  CircleElement,
  IconElement,
} from "@twick/timeline";
import type { Op } from "../ops";
import { addToSuitableTrack, fail, ok, type OpResult } from "./base";

export const applyAddShape = async (
  editor: TimelineEditor,
  op: Extract<Op, { op: "addShape" }>
): Promise<OpResult> => {
  if (op.end <= op.start) return fail(op.op, "end must be greater than start");
  const fill = op.fill ?? "#4361ee";
  let el: TrackElement;
  if (op.shape === "rect") {
    el = new RectElement(fill, { width: op.width ?? 320, height: op.height ?? 180 });
  } else if (op.shape === "circle") {
    el = new CircleElement(fill, op.radius ?? 120);
  } else {
    if (!op.src) return fail(op.op, "icon shape requires a src URL");
    el = new IconElement(op.src, { width: op.width ?? 96, height: op.height ?? 96 }, fill);
  }
  el.setStart(op.start).setEnd(op.end);
  if (op.x !== undefined || op.y !== undefined) {
    el.setPosition({ x: op.x ?? 0, y: op.y ?? 0 });
  }
  const trackId = await addToSuitableTrack(editor, el, "shape", op.start, op.end);
  return ok(op.op, `Added ${op.shape} (${op.start}s–${op.end}s)`, [el.getId(), trackId]);
};
