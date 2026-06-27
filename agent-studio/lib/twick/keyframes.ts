/**
 * Keyframe model + sampler (W3). Pure and deterministic — no Twick dependency —
 * so it can be unit-tested in isolation and reused by both the apply layer (which
 * expands keyframes into Twick frame effects) and any future per-frame hook.
 *
 * Times are ELEMENT-RELATIVE seconds (0 = clip start). Each track is sorted,
 * last-duplicate-wins, and the interpolation INTO a segment is decided by the
 * LEFT keyframe's interp tag.
 */

export type Interp = "linear" | "hold" | "smooth";

/** Scalar property keyframe: [t, value, interp?]. (opacity, rotation, …) */
export type ScalarKey = [t: number, v: number, interp?: Interp];
/** 2-vector property keyframe: [t, x, y, interp?]. (position, scale, …) */
export type Vec2Key = [t: number, x: number, y: number, interp?: Interp];

/** smoothstep — C¹-continuous ease in/out: t²(3−2t), clamped to [0,1]. */
export const smoothstep = (t: number): number => {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return u * u * (3 - 2 * u);
};

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;

/** Fraction of the way from tl→tr at time t, eased per the left keyframe's interp. */
const ease = (t: number, tl: number, tr: number, interp: Interp): number => {
  if (interp === "hold") return 0;
  const span = tr - tl;
  const u = span <= 0 ? 0 : (t - tl) / span;
  const clamped = u < 0 ? 0 : u > 1 ? 1 : u;
  return interp === "smooth" ? smoothstep(clamped) : clamped;
};

/** Normalize a track: sort by time, drop NaN times, last-duplicate-wins. */
const normalize = <K extends ScalarKey | Vec2Key>(keys: K[]): K[] => {
  const byTime = new Map<number, K>();
  for (const k of keys) {
    if (typeof k[0] === "number" && Number.isFinite(k[0])) byTime.set(k[0], k);
  }
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
};

/**
 * Find the bracketing pair [left, right] for time t. Before the first key clamps
 * to the first; after the last clamps to the last (hold-out semantics).
 */
const bracket = <K extends ScalarKey | Vec2Key>(keys: K[], t: number): { l: K; r: K } => {
  if (t <= keys[0][0]) return { l: keys[0], r: keys[0] };
  if (t >= keys[keys.length - 1][0]) {
    const last = keys[keys.length - 1];
    return { l: last, r: last };
  }
  let lo = 0;
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i][0] && t <= keys[i + 1][0]) {
      lo = i;
      break;
    }
  }
  return { l: keys[lo], r: keys[lo + 1] };
};

/** Sample a scalar track at element-relative time t. Returns null if empty. */
export const sampleScalar = (track: ScalarKey[], t: number): number | null => {
  const keys = normalize(track);
  if (keys.length === 0) return null;
  const { l, r } = bracket(keys, t);
  if (l === r) return l[1];
  const u = ease(t, l[0], r[0], l[2] ?? "linear");
  return lerp(l[1], r[1], u);
};

/** Sample a 2-vector track at element-relative time t. Returns null if empty. */
export const sampleVec2 = (track: Vec2Key[], t: number): { x: number; y: number } | null => {
  const keys = normalize(track);
  if (keys.length === 0) return null;
  const { l, r } = bracket(keys, t);
  if (l === r) return { x: l[1], y: l[2] };
  const u = ease(t, l[0], r[0], l[3] ?? "linear");
  return { x: lerp(l[1], r[1], u), y: lerp(l[2], r[2], u) };
};

/** A sorted, normalized copy of a track (for storage). */
export const normalizeTrack = <K extends ScalarKey | Vec2Key>(track: K[]): K[] => normalize(track);

/** The keyframe bag stored on an element's props. */
export interface KeyframeBag {
  position?: Vec2Key[];
  scale?: Vec2Key[];
  opacity?: ScalarKey[];
  rotation?: ScalarKey[];
}

/**
 * Properties that can be keyframed. position/scale/rotation map onto Twick frame
 * effects (frameSize / framePosition / rotation) which the visualizer interpolates
 * per frame. opacity is element-level only (no per-frame frame-effect hook), so it
 * is NOT animatable through this path — see W3 notes.
 */
export const KEYFRAME_PROPERTIES = {
  position: "vec2",
  scale: "vec2",
  rotation: "scalar",
} as const;

export type KeyframeProperty = keyof typeof KEYFRAME_PROPERTIES;

/** One expanded frame-effect segment (element-relative times, seconds). */
export interface FrameEffectSpec {
  s: number;
  e: number;
  frameSize: [number, number];
  framePosition: { x: number; y: number };
  rotation: number;
  transitionDuration: number;
}

export interface ExpandBase {
  /** The clip's natural frame size [w, h] at scale 1. */
  baseSize: [number, number];
  /** Centered-frame base position (frame x/y), usually {0,0}. */
  basePosition: { x: number; y: number };
  /** Base rotation in degrees. */
  baseRotation: number;
  /** Clip duration in seconds (keyframes are clamped to [0, duration]). */
  duration: number;
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Expand a keyframe bag into a dense, contiguous list of frame-effect segments.
 *
 * We sample the (interp-aware) keyframe functions at a fixed timestep and emit one
 * short linear segment per step. The Twick visualizer chains contiguous segments
 * and linearly tweens each, so dense sampling faithfully reproduces hold/linear/
 * smooth easing from OUR sampler while reusing Twick's proven frame-effect path.
 *
 * Returns [] when the bag has no animatable keyframes (caller clears frame effects).
 */
export const expandKeyframes = (
  bag: KeyframeBag,
  base: ExpandBase,
  stepSeconds = 1 / 12,
  maxSegments = 360
): FrameEffectSpec[] => {
  const hasMotion =
    (bag.position?.length ?? 0) > 0 || (bag.scale?.length ?? 0) > 0 || (bag.rotation?.length ?? 0) > 0;
  if (!hasMotion || base.duration <= 0) return [];

  const dt = Math.max(stepSeconds, base.duration / maxSegments);
  const sampleAt = (t: number): { frameSize: [number, number]; framePosition: { x: number; y: number }; rotation: number } => {
    const scale = bag.scale ? sampleVec2(bag.scale, t) : null;
    const pos = bag.position ? sampleVec2(bag.position, t) : null;
    const rot = bag.rotation ? sampleScalar(bag.rotation, t) : null;
    const sx = scale?.x ?? 1;
    const sy = scale?.y ?? 1;
    return {
      frameSize: [round3(base.baseSize[0] * sx), round3(base.baseSize[1] * sy)],
      framePosition: { x: round3(pos?.x ?? base.basePosition.x), y: round3(pos?.y ?? base.basePosition.y) },
      rotation: round3(rot ?? base.baseRotation),
    };
  };

  const segments: FrameEffectSpec[] = [];
  let t = 0;
  while (t < base.duration - 1e-6) {
    const next = Math.min(round3(t + dt), base.duration);
    const target = sampleAt(next);
    segments.push({ s: round3(t), e: next, ...target, transitionDuration: round3(next - t) });
    t = next;
  }
  return segments;
};
