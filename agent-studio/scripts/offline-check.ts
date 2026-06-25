/**
 * Offline verification of the deterministic agent logic (no LLM / no key):
 * serializeForAgent, validate-ops, and the model cascade. Run: npx tsx scripts/offline-check.ts
 */
import type { ProjectJSON } from "@twick/timeline";
import { serializeForAgent } from "../lib/twick/serialize";
import { validateOps } from "../lib/twick/validate-ops";
import { pickModel } from "../lib/agent/model-router";
import { healthCheck } from "./_harness";
import type { Op } from "../lib/twick/ops";

const RES = { width: 720, height: 1280 };
const SEED: ProjectJSON = {
  version: 1,
  tracks: [
    {
      id: "t-titles",
      name: "Titles",
      type: "element",
      elements: [
        { id: "e-clip1", type: "text", s: 0, e: 2, props: { text: "Clip One" } },
        { id: "e-clip2", type: "text", s: 2, e: 4, props: { text: "Clip Two" } },
        { id: "e-clip3", type: "text", s: 4, e: 6, props: { text: "Clip Three" } },
      ],
    },
  ],
} as ProjectJSON;

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// serializeForAgent
const view = serializeForAgent(SEED, RES);
check("serialize: 3 elements", view.elements.length === 3);
check("serialize: 3rd clip is index 3 = e-clip3", view.elements[2].index === 3 && view.elements[2].id === "e-clip3");
check("serialize: duration 6s", view.duration === 6);

// validate-ops: good plan
const good: Op[] = [
  { op: "remove", elementId: "e-clip3" },
  { op: "addText", text: "Intro", start: 0, end: 3 },
];
const goodV = validateOps(view, good);
check("validate: canonical plan ok", goodV.ok && goodV.destructiveCount === 1);

// validate-ops: bad references / bounds
check("validate: missing id rejected", !validateOps(view, [{ op: "remove", elementId: "e-nope" }]).ok);
check("validate: trim outside bounds rejected", !validateOps(view, [{ op: "trim", elementId: "e-clip1", start: 0, end: 5 }]).ok);
check("validate: split at edge rejected", !validateOps(view, [{ op: "split", elementId: "e-clip1", time: 0 }]).ok);
check("validate: split inside ok", validateOps(view, [{ op: "split", elementId: "e-clip1", time: 1 }]).ok);
check("validate: zoom on text rejected", !validateOps(view, [{ op: "addZoom", elementId: "e-clip1", toScale: 1.5 }]).ok);
check("validate: inverted addText rejected", !validateOps(view, [{ op: "addText", text: "x", start: 3, end: 1 }]).ok);

// model cascade
check("cascade: mechanical edit → flash", pickModel("trim clip 2").tier === "mechanical");
check("cascade: planning ask → pro", pickModel("make an intro with a title and a zoom").tier === "planning");

// corruption detector (the Phase 3 gate signal)
check("health: clean timeline passes", healthCheck(SEED).ok);
check(
  "health: duplicate id flagged",
  !healthCheck({
    version: 1,
    tracks: [{ id: "t1", name: "t", type: "element", elements: [
      { id: "dup", type: "text", s: 0, e: 1 }, { id: "dup", type: "text", s: 1, e: 2 },
    ] }],
  } as ProjectJSON).ok
);
check(
  "health: inverted time flagged",
  !healthCheck({
    version: 1,
    tracks: [{ id: "t1", name: "t", type: "element", elements: [{ id: "x", type: "text", s: 5, e: 2 }] }],
  } as ProjectJSON).ok
);
check(
  "health: same-track overlap flagged",
  !healthCheck({
    version: 1,
    tracks: [{ id: "t1", name: "t", type: "element", elements: [
      { id: "a", type: "text", s: 0, e: 3 }, { id: "b", type: "text", s: 1, e: 4 },
    ] }],
  } as ProjectJSON).ok
);

console.log(`\nOffline check: ${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
