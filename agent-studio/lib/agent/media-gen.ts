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
// Single-process job tracking: `submit` and the later `poll`/place must hit the
// SAME Node process (a multi-instance/serverless deployment needs a shared cache
// or DB here — images complete synchronously so only async video is affected).
// The `operation` handle is provider-internal (e.g. a Veo long-running operation)
// and never serialized. Capped + evicted so generated image bytes aren't pinned
// for the process lifetime.
interface JobRecord {
  job: GenJob;
  operation?: unknown;
  /** Stub bookkeeping: polls remaining before the job flips to done. */
  pollsLeft?: number;
}
const STORE = new Map<string, JobRecord>();
const MAX_JOBS = 50;

export const getJob = (id: string): GenJob | undefined => STORE.get(id)?.job;

/** Drop a job once its result is placed, freeing any retained media bytes. */
export const deleteJob = (id: string): void => {
  STORE.delete(id);
};

const newJob = (req: GenRequest, model: string, status: JobStatus = "pending"): JobRecord => {
  // Evict the oldest entries (Map preserves insertion order) before adding.
  while (STORE.size >= MAX_JOBS) {
    const oldest = STORE.keys().next().value;
    if (oldest === undefined) break;
    STORE.delete(oldest);
  }
  const job: GenJob = { id: `job_${randomUUID()}`, kind: req.kind, status, prompt: req.prompt, model };
  const record: JobRecord = { job };
  STORE.set(job.id, record);
  return record;
};

// A real, valid 1×1 PNG — used by the stub so the pipeline carries actual image
// bytes (not a fake string). Content is irrelevant; the data flow is what's tested.
const TINY_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
// A real, loadable sample video so a stub "video" generation produces a clip that
// actually plays in the editor (Veo returns a real asset; the stub mirrors that).
const STUB_VIDEO_URL = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

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
        record.job.resultUrls = [
          record.job.kind === "video" ? STUB_VIDEO_URL : `data:image/png;base64,${TINY_PNG}`,
        ];
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

// ── OpenRouter provider (image only) ────────────────────────────────────────
// Image generation via the OpenAI-compatible chat-completions API with
// modalities:["image"] — the assistant message returns the image as a data URL
// (choices[0].message.images[0].image_url.url). Reuses the SAME key as the LLM
// agent, so generate_image works without a separate Google credential. Video is
// not hosted on OpenRouter — Veo still needs Gemini/Vertex.
const OPENROUTER_CATALOG: MediaModel[] = [
  { id: "google/gemini-2.5-flash-image", kind: "image", label: "Gemini 2.5 Flash Image (Nano Banana)" },
  { id: "google/gemini-3.1-flash-image", kind: "image", label: "Gemini 3.1 Flash Image" },
  { id: "openai/gpt-5-image-mini", kind: "image", label: "GPT-5 Image Mini" },
];

class OpenRouterMediaProvider implements MediaGenProvider {
  readonly name = "openrouter";
  constructor(private apiKey: string, private baseUrl: string, private defaultImageModel: string) {}

  listModels(kind?: MediaKind): MediaModel[] {
    return kind ? OPENROUTER_CATALOG.filter((m) => m.kind === kind) : OPENROUTER_CATALOG;
  }

  async submit(req: GenRequest): Promise<GenJob> {
    const model = req.model ?? this.defaultImageModel;
    const record = newJob(req, model);
    if (req.kind === "video") {
      record.job.status = "error";
      record.job.error =
        "OpenRouter doesn't host video generation — set GEMINI_API_KEY (or MEDIA_GEN_PROVIDER=vertex) for Veo.";
      return record.job;
    }
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://localhost/agent-studio",
          "X-Title": "reel-anti",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: req.prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`OpenRouter returned ${res.status}: ${detail.slice(0, 200)}`);
      }
      const data = (await res.json()) as {
        choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
      };
      const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      if (!url) throw new Error("OpenRouter returned no image (model may not support image output)");
      record.job.status = "done";
      record.job.resultUrls = [url];
    } catch (e) {
      record.job.status = "error";
      record.job.error = e instanceof Error ? e.message : String(e);
    }
    return record.job;
  }

  async poll(jobId: string): Promise<GenJob> {
    return STORE.get(jobId)?.job ?? { id: jobId, kind: "image", status: "error", prompt: "", model: "", error: "unknown job id" };
  }
}

let cached: MediaGenProvider | null = null;

/**
 * Resolve the media-gen provider from the environment (mirrors llm.ts precedence).
 * - MEDIA_GEN_PROVIDER=stub → deterministic stub (offline/dev/tests).
 * - MEDIA_GEN_PROVIDER=gemini OR (default when only GEMINI_API_KEY is set) → Gemini (Imagen/Veo).
 * - else OPENROUTER_API_KEY present → OpenRouter (image generation; video needs Gemini/Vertex).
 */
export const getMediaProvider = (): MediaGenProvider => {
  if (cached) return cached;
  const preferred = process.env.MEDIA_GEN_PROVIDER?.toLowerCase();
  if (preferred === "stub") return (cached = new StubMediaProvider());

  const makeGemini = () => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("MEDIA_GEN_PROVIDER=gemini requires GEMINI_API_KEY.");
    return (cached = new GeminiMediaProvider(new GoogleGenAI({ apiKey })));
  };
  if (preferred === "gemini") return makeGemini();

  // Default to OpenRouter when its key is present (same key as the LLM agent) —
  // unblocks live image generation without a Google credential.
  if (preferred === "openrouter" || (!preferred && process.env.OPENROUTER_API_KEY)) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("MEDIA_GEN_PROVIDER=openrouter requires OPENROUTER_API_KEY.");
    const baseUrl = (process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1").replace(/\/$/, "");
    const model = process.env.OPENROUTER_IMAGE_MODEL ?? "google/gemini-2.5-flash-image";
    return (cached = new OpenRouterMediaProvider(apiKey, baseUrl, model));
  }

  if (process.env.GEMINI_API_KEY) return makeGemini();
  throw new Error("No media-gen credential — set OPENROUTER_API_KEY or GEMINI_API_KEY, or MEDIA_GEN_PROVIDER=stub for offline.");
};

/** Test seam: reset the memoized provider (so env changes take effect). */
export const __resetMediaProvider = (): void => {
  cached = null;
};
