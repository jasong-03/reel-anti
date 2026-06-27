import { TimelineEditor, ElementFrameEffect } from "@twick/timeline";
import type { Op } from "../ops";
import {
  expandKeyframes,
  normalizeTrack,
  type KeyframeBag,
  type ScalarKey,
  type Vec2Key,
  type Interp,
} from "../keyframes";
import { findElement, isFramed, fail, ok, type OpResult, type Resolution } from "./base";

const INTERPS = new Set<Interp>(["linear", "hold", "smooth"]);
const isInterp = (v: unknown): v is Interp => typeof v === "string" && INTERPS.has(v as Interp);

type Row = (number | string)[];

/** Coerce raw rows into typed scalar/vec2 keyframes, validating arity per property. */
const parseRows = (
  property: "position" | "scale" | "rotation",
  rows: Row[]
): { ok: true; scalar?: ScalarKey[]; vec2?: Vec2Key[] } | { ok: false; error: string } => {
  if (property === "rotation") {
    const out: ScalarKey[] = [];
    for (const r of rows) {
      const tail = r[r.length - 1];
      const ip = isInterp(tail) ? (tail as Interp) : undefined;
      const nums = (ip ? r.slice(0, -1) : r) as number[];
      if (nums.length !== 2 || nums.some((n) => typeof n !== "number")) {
        return { ok: false, error: "rotation keyframe must be [t, degrees] (optional trailing interp)" };
      }
      out.push(ip ? [nums[0], nums[1], ip] : [nums[0], nums[1]]);
    }
    return { ok: true, scalar: out };
  }
  const out: Vec2Key[] = [];
  for (const r of rows) {
    const tail = r[r.length - 1];
    const ip = isInterp(tail) ? (tail as Interp) : undefined;
    const nums = (ip ? r.slice(0, -1) : r) as number[];
    if (nums.length !== 3 || nums.some((n) => typeof n !== "number")) {
      return { ok: false, error: `${property} keyframe must be [t, x, y] (optional trailing interp)` };
    }
    out.push(ip ? [nums[0], nums[1], nums[2], ip] : [nums[0], nums[1], nums[2]]);
  }
  return { ok: true, vec2: out };
};

/**
 * Replace one keyframe track on a video/image clip and rebuild its frame effects.
 *
 * The keyframe bag is stored on the element props; the visual result is the dense
 * set of contiguous ElementFrameEffect segments the visualizer interpolates (the
 * proven Ken-Burns path, generalized to N keyframes). setKeyframes OWNS the
 * element's frame effects — it replaces them wholesale from the bag.
 */
export const applySetKeyframes = (
  editor: TimelineEditor,
  op: Extract<Op, { op: "setKeyframes" }>,
  resolution: Resolution
): OpResult => {
  const found = findElement(editor, op.elementId);
  if (!found) return fail(op.op, `element ${op.elementId} not found — re-read the timeline; ids may have shifted`);
  if (!isFramed(found.element)) return fail(op.op, "keyframes apply only to video or image clips");

  const parsed = parseRows(op.property, op.keyframes as Row[]);
  if (!parsed.ok) return fail(op.op, parsed.error);

  const el = found.element;
  const props = (el.getProps() ?? {}) as Record<string, unknown>;
  const bag: KeyframeBag = { ...((props.keyframes as KeyframeBag) ?? {}) };

  if (op.property === "rotation") {
    if (parsed.scalar!.length === 0) delete bag.rotation;
    else bag.rotation = normalizeTrack(parsed.scalar!);
  } else if (parsed.vec2!.length === 0) {
    delete bag[op.property];
  } else {
    bag[op.property] = normalizeTrack(parsed.vec2!);
  }

  el.setProps({ ...props, keyframes: bag });

  const frame = el.getFrame() ?? {};
  const baseSize = frame.size ?? [resolution.width, resolution.height];
  const duration = el.getEnd() - el.getStart();
  const specs = expandKeyframes(bag, {
    baseSize: [baseSize[0], baseSize[1]],
    basePosition: { x: frame.x ?? 0, y: frame.y ?? 0 },
    baseRotation: frame.rotation ?? 0,
    duration,
  });

  const clipStart = el.getStart();
  const effects = specs.map((sp) => {
    // rotation is read by the canvas (elements.tsx) and visualizer at render time
    // even though the published FrameEffectProps type omits it; assigning via a
    // variable (not a fresh literal) keeps it structurally compatible.
    const fxProps = {
      frameSize: sp.frameSize,
      framePosition: sp.framePosition,
      rotation: sp.rotation,
      transitionDuration: sp.transitionDuration,
    };
    return new ElementFrameEffect(clipStart + sp.s, clipStart + sp.e).setProps(fxProps);
  });
  // setKeyframes OWNS the element's frame effects — it rebuilds them from the bag,
  // so any prior effects (e.g. a manual addZoom) are replaced. Flag that so the
  // caller isn't surprised by a silently-dropped zoom.
  const hadEffects = (el.getFrameEffects()?.length ?? 0) > 0;
  el.setFrameEffects(effects);
  editor.updateElement(el);

  const count =
    op.property === "rotation" ? bag.rotation?.length ?? 0 : bag[op.property]?.length ?? 0;
  const replaced = hadEffects && (bag.position || bag.scale || bag.rotation) ? " (replaced existing frame effects)" : "";
  return ok(
    op.op,
    `Set ${count} ${op.property} keyframe(s) on ${op.elementId} (${effects.length} frame segments)${replaced}`,
    [op.elementId]
  );
};
