/** Live agent smoke across the op vocabulary: real LLM → atomic executeOps → health. */
import { config } from "dotenv";
config({ path: ".env.local" });
import type { ProjectJSON } from "@twick/timeline";
import { runAgent } from "../lib/agent/run-agent";
import { executeOps } from "../lib/twick/apply";
import { makeNodeEditor, healthCheck, SEED_TITLES } from "./_harness";

const RES = { width: 1280, height: 720 };

const CAPTION_SEED = {
  version: 1,
  tracks: [{ id: "t-cap", name: "Captions", type: "caption", elements: [
    { id: "e-cap1", trackId: "t-cap", name: "cap", type: "caption", s: 0, e: 5, t: "so um this is um the demo",
      props: { text: "so um this is um the demo", wordsMs: [0, 800, 1600, 2400, 3200, 4000, 4600] } },
  ] }],
} as ProjectJSON;

const IMAGE_SEED = {
  version: 1,
  tracks: [{ id: "t-v", name: "Video", type: "video", elements: [
    { id: "e-img1", trackId: "t-v", name: "img", type: "image", s: 0, e: 5,
      props: { src: "https://example.com/x.jpg" }, frame: { size: [1280, 720], x: 0, y: 0, rotation: 0 } },
  ] }],
} as unknown as ProjectJSON;

interface Case { name: string; seed: ProjectJSON; msg: string; expectOp: string }
const CASES: Case[] = [
  { name: "delete + title (canonical)", seed: SEED_TITLES, msg: "delete the 3rd clip and add a title 'Intro' for the first 3 seconds", expectOp: "addText" },
  { name: "split", seed: SEED_TITLES, msg: "split the second clip at 3 seconds", expectOp: "split" },
  { name: "removeWords (fillers)", seed: CAPTION_SEED, msg: "remove the filler word 'um' everywhere in the caption", expectOp: "removeWords" },
  { name: "setKeyframes (ken-burns)", seed: IMAGE_SEED, msg: "slowly zoom the image from 1x to 1.5x scale over its whole duration using keyframes", expectOp: "setKeyframes" },
];

let fails = 0;
(async () => {
  for (const c of CASES) {
    const editor = makeNodeEditor(c.seed);
    try {
      const res = await runAgent({ timelineJSON: editor.getProject(), message: c.msg, resolution: RES });
      const batch = await executeOps(editor, res.ops, RES);
      const health = healthCheck(editor.getProject());
      const used = res.ops.some((o) => o.op === c.expectOp);
      const ok = batch.ok && health.ok && used;
      if (!ok) fails++;
      console.log(`  ${ok ? "PASS" : "FAIL"}  [${res.attempts}att ${res.ops.map((o) => o.op).join(",")}] ${c.name}`);
      if (!ok) console.log(`        expected ${c.expectOp}; batchOk=${batch.ok} healthy=${health.ok} ${batch.error ?? ""}`);
    } catch (e) {
      fails++;
      console.log(`  FAIL  (threw) ${c.name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  console.log(`\nLive smoke: ${fails === 0 ? "ALL PASS" : fails + " FAILED"}`);
  process.exit(fails === 0 ? 0 : 1);
})();
