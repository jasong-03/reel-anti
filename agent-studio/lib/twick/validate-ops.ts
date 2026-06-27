import type { Op } from "./ops";
import type { AgentTimelineView } from "./serialize";

/**
 * Semantic validation of ops against the LIVE timeline (Phase 3).
 *
 * Zod guarantees each op is well-formed in isolation; this layer catches the
 * mistakes that only the current state can reveal — references to ids that don't
 * exist, inverted time ranges, zooming a non-visual clip — so the agent can
 * self-correct before anything touches the editor and risks a corrupt timeline.
 */
export interface OpValidation {
  ok: boolean;
  errors: string[];
  /** Count of destructive ops (remove / removeSpan) for guardrail decisions. */
  destructiveCount: number;
}

const hasElementId = (
  op: Op
): op is Extract<Op, { elementId: string }> => "elementId" in op;

export const validateOps = (
  view: AgentTimelineView,
  ops: Op[]
): OpValidation => {
  const errors: string[] = [];
  const byId = new Map(view.elements.map((e) => [e.id, e]));
  let destructiveCount = 0;

  ops.forEach((op, i) => {
    const at = `ops[${i}] (${op.op})`;

    if (hasElementId(op)) {
      const target = byId.get(op.elementId);
      if (!target) {
        errors.push(
          `${at}: element "${op.elementId}" does not exist in the timeline — use an exact id from the current element list (do not invent ids)`
        );
        return;
      }
      if (op.op === "split" && (op.time <= target.start || op.time >= target.end)) {
        errors.push(
          `${at}: split time ${op.time}s must be strictly inside the clip (${target.start}s–${target.end}s)`
        );
      }
      if (op.op === "trim" && (op.start < target.start || op.end > target.end)) {
        errors.push(
          `${at}: trim bounds must lie within the clip's current range (${target.start}s–${target.end}s); trim only narrows`
        );
      }
      if (op.op === "addZoom" && target.type !== "video" && target.type !== "image") {
        errors.push(`${at}: zoom applies only to video/image clips, not ${target.type}`);
      }
      if (op.op === "setKeyframes") {
        if (target.type !== "video" && target.type !== "image") {
          errors.push(`${at}: keyframes apply only to video/image clips, not ${target.type}`);
        }
        const duration = target.end - target.start;
        for (const row of op.keyframes) {
          const t = row[0];
          if (typeof t !== "number" || t < 0 || t > duration + 1e-6) {
            errors.push(`${at}: keyframe time ${t} must be element-relative seconds within 0..${duration}`);
            break;
          }
        }
      }
      if (op.op === "removeWords") {
        const wordCount = target.words?.length ?? 0;
        if (wordCount === 0) {
          errors.push(`${at}: element "${op.elementId}" has no transcript words to remove`);
        } else {
          const maxIndex = Math.max(
            ...op.words.flatMap((w) => (typeof w === "number" ? [w] : [w[0], w[1]]))
          );
          if (maxIndex >= wordCount) {
            errors.push(`${at}: word index ${maxIndex} is out of range (clip has ${wordCount} words, valid 0..${wordCount - 1})`);
          }
        }
      }
    }

    if (
      "start" in op &&
      "end" in op &&
      typeof op.start === "number" &&
      typeof op.end === "number" &&
      op.end <= op.start
    ) {
      errors.push(`${at}: end (${op.end}) must be greater than start (${op.start})`);
    }

    if (op.op === "remove" || op.op === "removeSpan" || op.op === "removeWords") destructiveCount++;
  });

  return { ok: errors.length === 0, errors, destructiveCount };
};
