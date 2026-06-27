/**
 * Offline verification of W4 (generative media) — no paid API:
 * forces the deterministic stub provider and drives the submit → poll → place
 * data flow through executeTool, plus the provider/job-store mechanics.
 *
 * Run: npx tsx scripts/media-check.ts
 */
process.env.MEDIA_GEN_PROVIDER = "stub";

import type { ProjectJSON } from "@twick/timeline";
import { getMediaProvider, getJob, __resetMediaProvider } from "../lib/agent/media-gen";
import { executeTool } from "../lib/agent/execute-tool";

__resetMediaProvider();

let failures = 0;
const check = (name: string, cond: boolean) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}`);
  if (!cond) failures++;
};

const EMPTY: ProjectJSON = { version: 1, tracks: [] } as ProjectJSON;
const mediaEls = (p?: ProjectJSON, type?: string) =>
  (p?.tracks ?? []).flatMap((t) => t.elements).filter((e) => !type || e.type === type);

async function main() {
  // ── provider + job store ───────────────────────────────────────────────────
  const provider = getMediaProvider();
  check("provider: stub selected", provider.name === "stub");
  check("provider: lists image + video models", provider.listModels().length === 2);
  check("provider: filters by kind", provider.listModels("image").every((m) => m.kind === "image"));

  const job = await provider.submit({ kind: "image", prompt: "a neon city" });
  check("submit: returns a pending job with id", job.status === "pending" && job.id.startsWith("job_"));
  check("store: job is retrievable by id", getJob(job.id)?.id === job.id);
  const polled = await provider.poll(job.id);
  check("poll: transitions to done with a result URL", polled.status === "done" && !!polled.resultUrls?.[0]?.startsWith("data:image/png"));

  // ── generate_image via executeTool (submit→poll→place) ─────────────────────
  {
    const res = await executeTool("generate_image", { prompt: "a calm beach", start: 1, end: 5 }, { project: EMPTY });
    check("generate_image: ok + returns mutated project", !res.isError && !!res.project);
    const imgs = mediaEls(res.project, "image");
    check("generate_image: one image element placed", imgs.length === 1);
    check("generate_image: src is the generated data URL", String(imgs[0]?.props?.src ?? "").startsWith("data:image/png"));
    check("generate_image: honored start/end", imgs[0]?.s === 1 && imgs[0]?.e === 5);
  }

  // ── generate_video → check_media_job (async place) ─────────────────────────
  {
    const started = await executeTool("generate_video", { prompt: "drone over a canyon" }, { project: EMPTY });
    check("generate_video: returns a jobId, no project mutation", !started.isError && !started.project && /job_/.test(started.content));
    const jobId = started.content.match(/job_[\w-]+/)?.[0] ?? "";
    const placed = await executeTool("check_media_job", { jobId, start: 0 }, { project: EMPTY });
    check("check_media_job: places the finished video", !placed.isError && mediaEls(placed.project, "video").length === 1);
    // H2: stub video must be a real, loadable URL (not a PNG data URL).
    const vsrc = String(mediaEls(placed.project, "video")[0]?.props?.src ?? "");
    check("generate_video: stub yields a loadable video URL (not PNG)", /\.mp4($|\?)/.test(vsrc) && !vsrc.startsWith("data:image"));
    // M3: the job is evicted after placement.
    const reuse = await executeTool("check_media_job", { jobId, start: 0 }, { project: EMPTY });
    check("check_media_job: job evicted after placement", reuse.isError && /unknown jobId/.test(reuse.content));
  }

  // ── errors-as-data ─────────────────────────────────────────────────────────
  {
    const noPrompt = await executeTool("generate_image", { prompt: "" }, { project: EMPTY });
    check("generate_image: empty prompt is errors-as-data", noPrompt.isError && /prompt/.test(noPrompt.content));
    const badJob = await executeTool("check_media_job", { jobId: "job_nope" }, { project: EMPTY });
    check("check_media_job: unknown jobId is errors-as-data", badJob.isError && /unknown jobId/.test(badJob.content));
  }

  console.log(`\nMedia check: ${failures === 0 ? "ALL PASS" : `${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

void main();
