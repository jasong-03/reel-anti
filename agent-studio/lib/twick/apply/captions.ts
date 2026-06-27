import { TimelineEditor, CaptionElement, TRACK_TYPES } from "@twick/timeline";
import type { Op } from "../ops";
import { fail, ok, type OpResult } from "./base";

export const applyAddCaption = async (
  editor: TimelineEditor,
  op: Extract<Op, { op: "addCaption" }>
): Promise<OpResult> => {
  if (op.end <= op.start) return fail(op.op, "end must be greater than start");
  const el = new CaptionElement(op.text, op.start, op.end);
  // Captions belong on a dedicated caption track when one exists.
  const existing = editor.getCaptionsTrack();
  const track = existing ?? editor.addTrack("Captions", TRACK_TYPES.CAPTION);
  try {
    const added = await editor.addElementToTrack(track, el);
    if (!added) throw new Error("caption rejected");
  } catch {
    const fresh = editor.addTrack("Captions", TRACK_TYPES.CAPTION);
    const added = await editor.addElementToTrack(fresh, el);
    if (!added) return fail(op.op, "could not add caption");
    return ok(op.op, `Added caption "${op.text}"`, [el.getId(), fresh.getId()]);
  }
  return ok(op.op, `Added caption "${op.text}"`, [el.getId(), track.getId()]);
};
