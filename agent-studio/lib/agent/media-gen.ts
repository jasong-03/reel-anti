import { GoogleGenAI } from "@google/genai";
import { randomUUID } from "node:crypto";

/**
 * Provider-agnostic generative-media seam — sibling to `llm.ts`. The agent's
 * generate_image / generate_video tools submit a job here, poll until done, and
 * drop the resulting URL onto the timeline via the existing `addMedia` op (no new
 * timeline code). Swapping Gemini → another backend is a sibling provider; nothing
 * upstream changes.
 *
 * Two providers ship:
 *  - GeminiMediaProvider: Imagen for images (synchronous bytes) + Veo for video
 *    (genuinely async → real submit/poll). Gated on GEMINI_API_KEY.
 *  - StubMediaProvider: a deterministic in-repo provider (real 1×1 PNG, a real
 *    poll transition) so the submit→poll→addMedia data flow is verifiable offline
 *    without spending credits. Selected only via MEDIA_GEN_PROVIDER=stub.
 */

export type MediaKind = "image" | "video";
export type JobStatus = "pending" | "done" | "error";

export interface GenRequest {
  kind: MediaKind;
  prompt: string;
  model?: string;
  /** e.g. "9:16" for reels; provider maps to its own param. */
  aspectRatio?: string;
}

export interface GenJob {
  id: string;
  kind: MediaKind;
  status: JobStatus;
  prompt: string;
  model: string;
  /** Usable media URLs when status==="done" (data: for images, asset URLs for video). */
  resultUrls?: string[];
  /** Actionable message when status==="error". */
  error?: string;
}

export interface MediaModel {
  id: string;
  kind: MediaKind;
  label: string;
}

export interface MediaGenProvider {
  readonly name: string;
  listModels(kind?: MediaKind): MediaModel[];
  submit(req: GenRequest): Promise<GenJob>;
  poll(jobId: string): Promise<GenJob>;
}

// ── Shared in-memory job store ───────────────────────────────────────────────
// Single-process (dev/prod node server) job tracking. The `operation` handle is
// provider-internal (e.g. a Veo long-running operation) and never serialized.
interface JobRecord {
  job: GenJob;
  operation?: unknown;
  /** Stub bookkeeping: polls remaining before the job flips to done. */
  pollsLeft?: number;
}
const STORE = new Map<string, JobRecord>();

export const getJob = (id: string): GenJob | undefined => STORE.get(id)?.job;

const newJob = (req: GenRequest, model: string, status: JobStatus = "pending"): JobRecord => {
  const job: GenJob = { id: `job_${randomUUID()}`, kind: req.kind, status, prompt: req.prompt, model };
  const record: JobRecord = { job };
  STORE.set(job.id, record);
  return record;
};

// A real, valid 1×1 PNG — used by the stub so the pipeline carries actual image
// bytes (not a fake string). Content is irrelevant; the data flow is what's tested.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

// ── Deterministic stub provider (offline/dev) ───────────────────────────────
class StubMediaProvider implements MediaGenProvider {
  readonly name = "stub";

  listModels(kind?: MediaKind): MediaModel[] {
    const all: MediaModel[] = [
      { id: "stub-image", kind: "image", label: "Stub Image" },
      { id: "stub-video", kind: "video", label: "Stub Video" },
    ];
    return kind ? all.filter((m) => m.kind === kind) : all;
  }

  async submit(req: GenRequest): Promise<GenJob> {
    const record = newJob(req, req.model ?? `stub-${req.kind}`);
    record.pollsLeft = 1; // one poll transition, to exercise the polling path
    return record.job;
  }

  async poll(jobId: string): Promise<GenJob> {
    const record = STORE.get(jobId);
    if (!record) return { id: jobId, kind: "image", status: "error", prompt: "", model: "", error: "unknown job id" };
    if (record.job.status === "pending") {
      record.pollsLeft = (record.pollsLeft ?? 0) - 1;
      if (record.pollsLeft <= 0) {
        record.job.status = "done";
        record.job.resultUrls = [`data:image/png;base64,${TINY_PNG}`];
      }
    }
    return record.job;
  }
}

// ── Gemini provider (Imagen + Veo) ──────────────────────────────────────────
const GEMINI_CATALOG: MediaModel[] = [
  { id: "imagen-3.0-generate-002", kind: "image", label: "Imagen 3" },
  { id: "veo-2.0-generate-001", kind: "video", label: "Veo 2" },
];

class GeminiMediaProvider implements MediaGenProvider {
  readonly name = "gemini";
  constructor(private ai: GoogleGenAI) {}

  listModels(kind?: MediaKind): MediaModel[] {
    return kind ? GEMINI_CATALOG.filter((m) => m.kind === kind) : GEMINI_CATALOG;
  }

  private defaultModel(kind: MediaKind): string {
    return GEMINI_CATALOG.find((m) => m.kind === kind)!.id;
  }

  async submit(req: GenRequest): Promise<GenJob> {
    const model = req.model ?? this.defaultModel(req.kind);
    const record = newJob(req, model);

    try {
      if (req.kind === "image") {
        // Imagen returns bytes synchronously — complete the job immediately.
        const res = await this.ai.models.generateImages({
          model,
          prompt: req.prompt,
          config: { numberOfImages: 1, ...(req.aspectRatio ? { aspectRatio: req.aspectRatio } : {}) },
        });
        const bytes = res.generatedImages?.[0]?.image?.imageBytes;
        if (!bytes) throw new Error("Imagen returned no image bytes");
        record.job.status = "done";
        record.job.resultUrls = [`data:image/png;base64,${bytes}`];
      } else {
        // Veo is long-running — kick it off and let poll() drive it to completion.
        record.operation = await this.ai.models.generateVideos({
          model,
          prompt: req.prompt,
          ...(req.aspectRatio ? { config: { aspectRatio: req.aspectRatio } } : {}),
        });
      }
    } catch (e) {
      record.job.status = "error";
      record.job.error = e instanceof Error ? e.message : String(e);
    }
    return record.job;
  }

  async poll(jobId: string): Promise<GenJob> {
    const record = STORE.get(jobId);
    if (!record) {
      return { id: jobId, kind: "image", status: "error", prompt: "", model: "", error: "unknown job id" };
    }
    if (record.job.status !== "pending" || record.job.kind !== "video" || !record.operation) {
      return record.job;
    }
    try {
      const op = await this.ai.operations.getVideosOperation({ operation: record.operation as never });
      record.operation = op;
      if (op.done) {
        const uri = op.response?.generatedVideos?.[0]?.video?.uri;
        if (!uri) throw new Error("Veo finished without a video URI");
        // The URI is short-lived and key-gated — callers import_media to cache it.
        record.job.status = "done";
        record.job.resultUrls = [uri];
      }
    } catch (e) {
      record.job.status = "error";
      record.job.error = e instanceof Error ? e.message : String(e);
    }
    return record.job;
  }
}

let cached: MediaGenProvider | null = null;

/**
 * Resolve the media-gen provider from the environment.
 * - MEDIA_GEN_PROVIDER=stub → deterministic stub (offline/dev/tests).
 * - else GEMINI_API_KEY → Gemini (Imagen/Veo).
 */
export const getMediaProvider = (): MediaGenProvider => {
  if (cached) return cached;
  const preferred = process.env.MEDIA_GEN_PROVIDER?.toLowerCase();
  if (preferred === "stub") return (cached = new StubMediaProvider());

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("No media-gen credential — set GEMINI_API_KEY, or MEDIA_GEN_PROVIDER=stub for offline.");
  }
  return (cached = new GeminiMediaProvider(new GoogleGenAI({ apiKey })));
};

/** Test seam: reset the memoized provider (so env changes take effect). */
export const __resetMediaProvider = (): void => {
  cached = null;
};
