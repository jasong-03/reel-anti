/**
 * Integration test for the APPLY half of the loop — no LLM, no browser, no key.
 *
 * Drives the REAL @twick/timeline TimelineEditor in Node with a minimal context,
 * runs the canonical plan's ops through applyOps, and asserts the timeline ends
 * up correct AND that undo cleanly reverts the whole change. This proves the
 * half of Phase 1 the eval-loop (which only checks emitted ops) cannot.
 *
 * Run: npx tsx scripts/apply-integration.ts
 */
import type { ProjectJSON } from "@twick/timeline";
import { applyOps } from "../lib/twick/apply-op";
import type { Op } from "../lib/twick/ops";
import { makeNodeEditor, SEED_TITLES } from "./_harness";

const RES = { width: 720, height: 1280 };

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const ids = (p: ProjectJSON): string[] =>
  p.tracks.flatMap((t) => t.elements.map((e) => e.id));
const hasText = (p: ProjectJSON, text: string): boolean =>
  p.tracks.some((t) =>
    t.elements.some((e) => (e.props?.text ?? e.t) === text)
  );

async function main() {
  const editor = makeNodeEditor(SEED_TITLES);

  check("seed loaded: 3 clips", ids(editor.getProject()).length === 3);

  // Snapshot before the turn — this is what the UI captures so a whole turn can
  // be reverted as one unit (Phase 3 "↶ Undo this change").
  const preTurn = editor.getProject();

  // Canonical plan: delete the 3rd clip + add an "Intro" title for 0–3s.
  const plan: Op[] = [
    { op: "remove", elementId: "e-clip3" },
    { op: "addText", text: "Intro", start: 0, end: 3 },
  ];
  const results = await applyOps(editor, plan, RES);
  check("both ops applied ok", results.every((r) => r.ok));

  const after = editor.getProject();
  check("e-clip3 removed", !ids(after).includes("e-clip3"));
  check("clip1 & clip2 untouched", ids(after).includes("e-clip1") && ids(after).includes("e-clip2"));
  check("Intro title present", hasText(after, "Intro"));

  // Revert the whole turn in one step via the snapshot (the product's undo path).
  editor.loadProjectSnapshot(preTurn);
  const reverted = editor.getProject();
  check("turn revert restores 3 clips incl. e-clip3", ids(reverted).length === 3 && ids(reverted).includes("e-clip3"));
  check("turn revert removed the Intro title", !hasText(reverted, "Intro"));

  // Native per-op undo also works (finer granularity): draining undo returns to seed.
  for (let i = 0; i < 6; i++) editor.undo();
  check("native undo drains back to seed", ids(editor.getProject()).includes("e-clip3"));

  console.log(`\nApply integration: ${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
