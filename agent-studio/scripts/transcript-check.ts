/**
 * Offline verification of W5 (transcript-driven editing) — no LLM, no key:
 *   - planWordCuts / resolveSelections (pure)
 *   - serialize surfaces indexed word ranges
 *   - removeWords end-to-end through the headless editor + executeTool
 *   - validate-ops index-range guards
 *
 * Run: npx tsx scripts/transcript-check.ts
 */
import type { ProjectJSON } from "@twick/timeline";
import { planWordCuts, resolveSelections, inferWordEnds } from "../lib/twick/transcript";
import { serializeForAgent } from "../lib/twick/serialize";
import { validateOps } from "../lib/twick/validate-ops";
import { executeOps } from "../lib/twick/apply";
import { executeTool } from "../lib/agent/execute-tool";
import { makeNodeEditor, healthCheck } from "./_harness";
import type { Op } from "../lib/twick/ops";

const RES = { width: 720, height: 1280 };

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

// "so um this is the demo" — 6 words, each starting at the listed ms, clip 0–5s.
const STARTS = [0, 1000, 2000, 3000, 4000, 4500];
const SEED_CAPTION: ProjectJSON = {
  version: 1,
  tracks: [
    {
      id: "t-cap",
      name: "Captions",
      type: "caption",
      elements: [
        {
          id: "e-cap1",
          trackId: "t-cap",
          name: "cap",
          type: "caption",
          s: 0,
          e: 5,
          t: "so um this is the demo",
          props: { text: "so um this is the demo", wordsMs: STARTS },
        },
      ],
    },
  ],
} as ProjectJSON;

async function main() {
  // ── resolveSelections ──────────────────────────────────────────────────────
  check("resolve: index + span union, sorted/deduped", JSON.stringify(resolveSelections([3, [0, 1], 1], 6)) === "[0,1,3]");
  check("resolve: out-of-range dropped", JSON.stringify(resolveSelections([5, 9, -1], 6)) === "[5]");
  check("resolve: reversed span normalized", JSON.stringify(resolveSelections([[3, 1]], 6)) === "[1,2,3]");

  // ── planWordCuts ───────────────────────────────────────────────────────────
  const words = inferWordEnds(STARTS, 5000); // ends: 1000,2000,3000,4000,4500,5000
  check("plan: single word → one range", JSON.stringify(planWordCuts(words, [1])) === JSON.stringify([{ start: 1, end: 2 }]));
  check(
    "plan: consecutive span → one merged range",
    JSON.stringify(planWordCuts(words, [[1, 3]])) === JSON.stringify([{ start: 1, end: 4 }])
  );
  check(
    "plan: non-adjacent indices (gap > keptGap) → two ranges",
    JSON.stringify(planWordCuts(words, [1, 3], "balanced")) === JSON.stringify([{ start: 1, end: 2 }, { start: 3, end: 4 }])
  );

  // Aggressiveness: 100ms words, indices 0 and 2 (gap 100ms) — balanced/loose merge, tight doesn't.
  const tight = inferWordEnds([0, 100, 200, 300], 400);
  check("plan: tight keeps the gap (60ms < 100ms gap → two ranges)", planWordCuts(tight, [0, 2], "tight").length === 2);
  check("plan: balanced bridges (150ms ≥ 100ms gap → one range)", planWordCuts(tight, [0, 2], "balanced").length === 1);
  check("plan: empty selection → no ranges", planWordCuts(words, []).length === 0);

  // ── serialize: indexed word ranges ─────────────────────────────────────────
  const view = serializeForAgent(SEED_CAPTION, RES);
  const w = view.elements[0].words;
  check("serialize: 6 words with start+end", w?.length === 6 && w[0].endMs === 1000 && w[5].endMs === 5000);

  // ── validate-ops guards ────────────────────────────────────────────────────
  check("validate: removeWords in-range ok", validateOps(view, [{ op: "removeWords", elementId: "e-cap1", words: [1] }]).ok);
  check(
    "validate: removeWords out-of-range rejected",
    !validateOps(view, [{ op: "removeWords", elementId: "e-cap1", words: [9] }] as Op[]).ok
  );
  check("validate: removeWords counts as destructive", validateOps(view, [{ op: "removeWords", elementId: "e-cap1", words: [1] }]).destructiveCount === 1);

  // ── removeWords end-to-end (executeOps) ────────────────────────────────────
  {
    const editor = makeNodeEditor(SEED_CAPTION);
    const before = editor.getProject();
    const beforeEnd = Math.max(...before.tracks.flatMap((t) => t.elements.map((e) => e.e)));
    const batch = await executeOps(editor, [{ op: "removeWords", elementId: "e-cap1", words: [1] }], RES);
    const after = editor.getProject();
    const afterEnd = Math.max(...after.tracks.flatMap((t) => t.elements.map((e) => e.e)));
    check("removeWords: applied ok", batch.ok);
    check("removeWords: rippled ~1s out of the timeline", Math.abs(beforeEnd - afterEnd - 1) < 0.001);
    check("removeWords: timeline stays healthy", healthCheck(after).ok);
  }

  // ── removeWords via executeTool (MCP front-end), errors-as-data ─────────────
  {
    const okCall = await executeTool("removeWords", { elementId: "e-cap1", words: [1, 4] }, { project: SEED_CAPTION, resolution: RES });
    check("executeTool removeWords: ok", !okCall.isError && !!okCall.project);
    const noWords = await executeTool("removeWords", { elementId: "e-cap1", words: [99] }, { project: SEED_CAPTION, resolution: RES });
    check("executeTool removeWords: out-of-range is errors-as-data", noWords.isError && /out of range/.test(noWords.content));
  }

  console.log(`\nTranscript check: ${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
