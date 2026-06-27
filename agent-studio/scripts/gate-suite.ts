/**
 * Full live gate battery for Phases 1–3. ONE command, needs a valid GEMINI_API_KEY.
 *
 *   cp .env.local.example .env.local   # add a working key
 *   pnpm test:gates
 *
 * Runs the real agent loop (LLM emit → validate → apply to a real headless Twick
 * editor → health check) for every gate the plan defines that can run outside a
 * browser. Media-dependent fidelity (addMedia/addZoom on real URLs) is exercised
 * in the UI per PHASES.md, since it needs browser media APIs.
 */
import { config as loadEnv } from "dotenv";
import { runAgent } from "../lib/agent/run-agent";
import { applyOps } from "../lib/twick/apply-op";
import type { Op } from "../lib/twick/ops";
import { makeNodeEditor, healthCheck, SEED_TITLES } from "./_harness";

// Mirror Next.js precedence: .env is the base, .env.local overrides it.
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });

const RES = { width: 720, height: 1280 };

const plan = async (message: string, project = makeNodeEditor(SEED_TITLES).getProject()) =>
  runAgent({ timelineJSON: project, message, resolution: RES });

let gatesPassed = 0;
let gatesTotal = 0;
const gate = (name: string, ok: boolean, detail: string) => {
  gatesTotal++;
  if (ok) gatesPassed++;
  console.log(`\n${ok ? "✅ GATE PASS" : "❌ GATE FAIL"} — ${name}\n   ${detail}`);
};

// ── Gate 1 (Phase 1): canonical prompt, 10/10 ───────────────────────────────
async function gate1() {
  const CANONICAL = "delete the 3rd clip and add a title 'Intro' for the first 3 seconds";
  let pass = 0;
  for (let i = 0; i < 10; i++) {
    const editor = makeNodeEditor(SEED_TITLES);
    try {
      const res = await runAgent({ timelineJSON: editor.getProject(), message: CANONICAL, resolution: RES });
      const removed = res.ops.some((o) => o.op === "remove" && o.elementId === "e-clip3");
      const titled = res.ops.some(
        (o): o is Extract<Op, { op: "addText" }> => o.op === "addText" && /intro/i.test(o.text) && o.start === 0 && o.end === 3
      );
      const safe = !res.ops.some((o) => "elementId" in o && (o.elementId === "e-clip1" || o.elementId === "e-clip2"));
      await applyOps(editor, res.ops, RES);
      const health = healthCheck(editor.getProject());
      if (removed && titled && safe && health.ok) pass++;
    } catch {
      /* counts as a miss */
    }
  }
  gate("Phase 1 — canonical prompt 10/10", pass === 10, `${pass}/10 runs correct + healthy`);
}

// ── Gate 2 (Phase 2): one multi-step session, end-to-end ────────────────────
async function gate2() {
  const editor = makeNodeEditor(SEED_TITLES);
  const steps = [
    "split the second clip at 3 seconds",
    "add a caption that says 'Chapter One' from 0 to 2 seconds",
    "add a blue circle from 1 to 3 seconds as an overlay",
    "delete the first clip",
  ];
  let corruption = false;
  for (const step of steps) {
    const res = await runAgent({ timelineJSON: editor.getProject(), message: step, resolution: RES });
    await applyOps(editor, res.ops, RES);
    if (!healthCheck(editor.getProject()).ok) corruption = true;
  }
  const final = editor.getProject();
  const hasCaption = final.tracks.some((t) => t.elements.some((e) => e.type === "caption"));
  const hasShape = final.tracks.some((t) => t.elements.some((e) => e.type === "circle"));
  gate(
    "Phase 2 — multi-step session (cut → caption → motion overlay)",
    !corruption && hasCaption && hasShape,
    `caption=${hasCaption} shape=${hasShape} corruption=${corruption}`
  );
}

// ── Gate 3 (Phase 3): 20 varied prompts, zero corruption ────────────────────
const VARIED_PROMPTS = [
  "trim the first clip to start at half a second",
  "move the second clip to start at 7 seconds",
  "split clip 3 in the middle",
  "delete the last clip",
  "add a title that says 'Hello' over the first two seconds",
  "remove everything between 2 and 4 seconds",
  "add a caption 'subscribe' from 5 to 6 seconds",
  "put a red rectangle from 0 to 1 second",
  "shorten the third clip by one second from the end",
  "add a green circle overlay from 2 to 3 seconds",
  "make the first clip end at 1.5 seconds",
  "duplicate the intro vibe with a title 'Part 2' at 6 to 8 seconds",
  "cut the first half second of the timeline",
  "move clip one to ten seconds",
  "add a caption 'the end' for the last second",
  "delete the second and there should be a title 'Gap' where it was",
  "split the first clip at 1 second then delete the second piece",
  "add a small icon from a url https://example.com/star.svg at 1 to 2 seconds",
  "trim every clip to be one second long",
  "add three titles 'A' 'B' 'C' each one second long back to back starting at 8 seconds",
];
async function gate3() {
  let corrupted = 0;
  let errored = 0;
  for (const prompt of VARIED_PROMPTS) {
    const editor = makeNodeEditor(SEED_TITLES);
    try {
      const res = await runAgent({ timelineJSON: editor.getProject(), message: prompt, resolution: RES });
      await applyOps(editor, res.ops, RES);
      if (!healthCheck(editor.getProject()).ok) corrupted++;
    } catch {
      errored++; // a thrown agent error is graceful (no corruption), but we track it
    }
  }
  gate(
    "Phase 3 — 20 varied prompts, zero corruption",
    corrupted === 0,
    `${corrupted} corrupted / ${errored} errored-gracefully out of ${VARIED_PROMPTS.length}`
  );
}

async function main() {
  if (!process.env.OPENROUTER_API_KEY && !process.env.GEMINI_API_KEY) {
    console.error("No LLM key set. Add OPENROUTER_API_KEY (or GEMINI_API_KEY) to agent-studio/.env, then re-run `pnpm test:gates`.");
    process.exit(2);
  }
  console.log("Running live gate battery (Phases 1–3)…");
  try {
    await gate1();
    await gate2();
    await gate3();
  } catch (error) {
    console.error(`\nGate run aborted: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
  console.log(`\n────────\n${gatesPassed}/${gatesTotal} gates passed.`);
  process.exit(gatesPassed === gatesTotal ? 0 : 1);
}

void main();
