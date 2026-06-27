/** Focused live smoke: real LLM loop → atomic executeOps → health, on a few prompts. */
import { config } from "dotenv";
config({ path: ".env.local" });
import { runAgent } from "../lib/agent/run-agent";
import { executeOps } from "../lib/twick/apply";
import { makeNodeEditor, healthCheck, SEED_TITLES } from "./_harness";

const RES = { width: 720, height: 1280 };
const PROMPTS = [
  "delete the 3rd clip and add a title 'Intro' for the first 3 seconds",
  "split the second clip at 3 seconds",
  "add a blue circle overlay from 1 to 2 seconds",
];
let fails = 0;
(async () => {
  for (const p of PROMPTS) {
    const editor = makeNodeEditor(SEED_TITLES);
    try {
      const res = await runAgent({ timelineJSON: editor.getProject(), message: p, resolution: RES });
      const batch = await executeOps(editor, res.ops, RES);
      const health = healthCheck(editor.getProject());
      const ok = batch.ok && health.ok;
      if (!ok) fails++;
      console.log(`  ${ok ? "PASS" : "FAIL"}  [${res.attempts} attempt(s), ${res.ops.length} ops] ${p}`);
      if (!ok) console.log("        ", batch.error ?? health.issues.join("; "));
    } catch (e) {
      fails++;
      console.log(`  FAIL  (threw) ${p}\n        ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\nLive smoke: ${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
  process.exit(fails === 0 ? 0 : 1);
})();
