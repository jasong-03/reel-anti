import {
  TimelineEditor,
  TrackElement,
  VideoElement,
  ImageElement,
  AudioElement,
} from "@twick/timeline";
import type { Op } from "../ops";
import { addToSuitableTrack, fail, ok, type OpResult, type Resolution } from "./base";

export const applyAddMedia = async (
  editor: TimelineEditor,
  op: Extract<Op, { op: "addMedia" }>,
  resolution: Resolution
): Promise<OpResult> => {
  const parentSize = { width: resolution.width, height: resolution.height };
  let el: TrackElement;
  if (op.mediaType === "video") el = new VideoElement(op.src, parentSize);
  else if (op.mediaType === "image") el = new ImageElement(op.src, parentSize);
  else el = new AudioElement(op.src);

  el.setStart(op.start);
  // Leave end unset (NaN) when omitted so Twick fills the natural media duration.
  if (op.end !== undefined) {
    if (op.end <= op.start) return fail(op.op, "end must be greater than start");
    el.setEnd(op.end);
  }

  const trackId = await addToSuitableTrack(editor, el, op.mediaType, op.start, op.end ?? null);
  return ok(op.op, `Added ${op.mediaType} from ${op.src}`, [el.getId(), trackId]);
};
