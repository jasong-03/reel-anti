/**
 * Phase 1 gate harness.
 *
 * Runs the canonical prompt against the seed timeline N times and checks the
 * agent emits the correct ops: remove the 3rd clip (e-clip3) AND add a title
 * "Intro" for [0s, 3s]. Measures reliability (target: 10/10).
 *
 * Usage:  GEMINI_API_KEY=... pnpm test:loop   (or: npx tsx scripts/eval-loop.ts)
 */
import type { ProjectJSON } from "@twick/timeline";
import { runAgent } from "../lib/agent/run-agent";
import type { Op } from "../lib/twick/ops";

const RESOLUTION = { width: 720, height: 1280 };

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

const PROMPT = "delete the 3rd clip and add a title 'Intro' for the first 3 seconds";
const RUNS = Number(process.env.RUNS ?? 10);

const checkRun = (ops: Op[]): { ok: boolean; reason: string } => {
  const removed = ops.find((o) => o.op === "remove" && o.elementId === "e-clip3");
  if (!removed) return { ok: false, reason: "did not remove e-clip3" };

  const added = ops.find(
    (o): o is Extract<Op, { op: "addText" }> =>
      o.op === "addText" && /intro/i.test(o.text)
  );
  if (!added) return { ok: false, reason: "did not add an 'Intro' title" };
  if (added.start !== 0) return { ok: false, reason: `title start=${added.start}, expected 0` };
  if (added.end !== 3) return { ok: false, reason: `title end=${added.end}, expected 3` };

  // Must not touch the other two clips.
  const touchedOther = ops.some(
    (o) =>
      ("elementId" in o && (o.elementId === "e-clip1" || o.elementId === "e-clip2"))
  );
  if (touchedOther) return { ok: false, reason: "touched a clip outside the request" };

  return { ok: true, reason: "ok" };
};

async function main() {
  console.log(`Phase 1 gate — "${PROMPT}"\nRunning ${RUNS} times…\n`);
  let passed = 0;
  for (let i = 1; i <= RUNS; i++) {
    try {
      const result = await runAgent({ timelineJSON: SEED, message: PROMPT, resolution: RESOLUTION });
      const verdict = checkRun(result.ops);
      if (verdict.ok) passed++;
      console.log(
        `  Run ${String(i).padStart(2)}: ${verdict.ok ? "PASS" : "FAIL"} ` +
          `(${result.attempts} attempt(s), ${result.ops.length} ops)` +
          (verdict.ok ? "" : ` — ${verdict.reason}`)
      );
    } catch (error) {
      console.log(`  Run ${String(i).padStart(2)}: FAIL — ${error instanceof Error ? error.message : error}`);
    }
  }
  console.log(`\nResult: ${passed}/${RUNS} passed.`);
  process.exit(passed === RUNS ? 0 : 1);
}

void main();
