/**
 * Offline verification of W3 (keyframes) — no LLM, no browser, no key:
 *   - sampleScalar / sampleVec2 (hold / linear / smooth / clamp)
 *   - expandKeyframes (dense contiguous frame-effect segments)
 *   - setKeyframes end-to-end through the headless editor (real ElementFrameEffect)
 *   - validate-ops guards (video/image only, time in range)
 *
 * Run: npx tsx scripts/keyframe-check.ts
 */
import type { ProjectJSON } from "@twick/timeline";
import { sampleScalar, sampleVec2, expandKeyframes, smoothstep } from "../lib/twick/keyframes";
import { validateOps } from "../lib/twick/validate-ops";
import { serializeForAgent } from "../lib/twick/serialize";
import { executeOps } from "../lib/twick/apply";
import { executeTool } from "../lib/agent/execute-tool";
import { makeNodeEditor, healthCheck } from "./_harness";
import type { Op } from "../lib/twick/ops";

const RES = { width: 1280, height: 720 };
let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};
const near = (a: number, b: number, eps = 1e-3) => Math.abs(a - b) < eps;

// A loaded image clip (headless can deserialize media JSON; it just can't decode).
const SEED: ProjectJSON = {
  version: 1,
  tracks: [
    {
      id: "t-v",
      name: "Video",
      type: "video",
      elements: [
        { id: "e-img1", trackId: "t-v", name: "img", type: "image", s: 0, e: 5, props: { src: "https://example.com/x.jpg" }, frame: { size: [1280, 720], x: 0, y: 0, rotation: 0 } },
        { id: "e-txt1", trackId: "t-v", name: "t", type: "text", s: 6, e: 8, props: { text: "hi" } },
      ],
    },
  ],
} as unknown as ProjectJSON;

async function main() {
  // ── sampler ────────────────────────────────────────────────────────────────
  check("scalar: linear midpoint", near(sampleScalar([[0, 0], [2, 10]], 1)!, 5));
  check("scalar: clamp before first", sampleScalar([[1, 4], [3, 8]], 0)! === 4);
  check("scalar: hold-out after last", sampleScalar([[0, 0], [2, 10]], 9)! === 10);
  check("scalar: hold interp holds left value", sampleScalar([[0, 0, "hold"], [2, 10]], 1)! === 0);
  check("scalar: smooth eases slower early", near(sampleScalar([[0, 0, "smooth"], [2, 10]], 0.5)!, 10 * smoothstep(0.25)));
  check("scalar: empty → null", sampleScalar([], 1) === null);
  check("vec2: linear midpoint", (() => { const v = sampleVec2([[0, 1, 1], [2, 2, 2]], 1)!; return near(v.x, 1.5) && near(v.y, 1.5); })());

  // ── expandKeyframes ─────────────────────────────────────────────────────────
  {
    const specs = expandKeyframes({ scale: [[0, 1, 1], [2, 2, 2]] }, { baseSize: [100, 100], basePosition: { x: 0, y: 0 }, baseRotation: 0, duration: 2 });
    check("expand: produces segments", specs.length > 5);
    check("expand: covers [0, duration] contiguously", specs[0].s === 0 && near(specs[specs.length - 1].e, 2) && specs.every((s, i) => i === 0 || near(s.s, specs[i - 1].e)));
    check("expand: scale applied at the end (2× → 200)", near(specs[specs.length - 1].frameSize[0], 200));
    check("expand: empty bag → no segments", expandKeyframes({}, { baseSize: [100, 100], basePosition: { x: 0, y: 0 }, baseRotation: 0, duration: 2 }).length === 0);
  }

  // ── validate-ops guards ─────────────────────────────────────────────────────
  const view = serializeForAgent(SEED, RES);
  check("validate: setKeyframes on image ok", validateOps(view, [{ op: "setKeyframes", elementId: "e-img1", property: "scale", keyframes: [[0, 1, 1], [5, 1.5, 1.5]] }]).ok);
  check("validate: setKeyframes on text rejected", !validateOps(view, [{ op: "setKeyframes", elementId: "e-txt1", property: "scale", keyframes: [[0, 1, 1]] }] as Op[]).ok);
  check("validate: keyframe time past duration rejected", !validateOps(view, [{ op: "setKeyframes", elementId: "e-img1", property: "scale", keyframes: [[9, 1, 1]] }] as Op[]).ok);

  // ── end-to-end through the headless editor ──────────────────────────────────
  {
    const editor = makeNodeEditor(SEED);
    const batch = await executeOps(editor, [{ op: "setKeyframes", elementId: "e-img1", property: "scale", keyframes: [[0, 1, 1], [2.5, 1.5, 1.5], [5, 1.2, 1.2]] }], RES);
    const el = editor.getProject().tracks[0].elements.find((e) => e.id === "e-img1") as { frameEffects?: { s: number; e: number; props: { frameSize: [number, number] } }[]; props?: { keyframes?: { scale?: unknown[] } } };
    check("setKeyframes: applied ok", batch.ok);
    check("setKeyframes: frame effects generated", (el.frameEffects?.length ?? 0) > 10);
    check("setKeyframes: contiguous chained segments", !!el.frameEffects && el.frameEffects.every((fe, i) => i === 0 || near(fe.s, el.frameEffects![i - 1].e)));
    check("setKeyframes: peak scale ~1.5× at the middle keyframe", !!el.frameEffects?.some((fe) => near(fe.props.frameSize[0], 1280 * 1.5, 5)));
    check("setKeyframes: keyframe bag stored on props", (el.props?.keyframes?.scale?.length ?? 0) === 3);
    check("setKeyframes: timeline healthy", healthCheck(editor.getProject()).ok);

    // Clearing the track empties the frame effects.
    const cleared = await executeOps(editor, [{ op: "setKeyframes", elementId: "e-img1", property: "scale", keyframes: [] }], RES);
    const el2 = editor.getProject().tracks[0].elements.find((e) => e.id === "e-img1") as { frameEffects?: unknown[] };
    check("setKeyframes: empty rows clears frame effects", cleared.ok && (el2.frameEffects?.length ?? 0) === 0);
  }

  // ── via executeTool (MCP front-end), errors-as-data ─────────────────────────
  {
    const okCall = await executeTool("setKeyframes", { elementId: "e-img1", property: "rotation", keyframes: [[0, 0], [5, 360]] }, { project: SEED, resolution: RES });
    check("executeTool setKeyframes: ok + mutated project", !okCall.isError && !!okCall.project);
    const badType = await executeTool("setKeyframes", { elementId: "e-txt1", property: "scale", keyframes: [[0, 1, 1]] }, { project: SEED, resolution: RES });
    check("executeTool setKeyframes: text clip is errors-as-data", badType.isError && /video\/image/.test(badType.content));
  }

  console.log(`\nKeyframe check: ${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
