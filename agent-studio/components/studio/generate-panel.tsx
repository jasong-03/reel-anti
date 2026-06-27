"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTimelineContext } from "@twick/timeline";
import { useLivePlayerContext } from "@twick/live-player";
import { applyOps } from "@/lib/twick/apply-op";
import type { Op } from "@/lib/twick/ops";
import type { AppliedInfo } from "./agent-panel";
import { Wand, Film, Image as ImageIcon } from "./icons";

type Kind = "image" | "video";
type JobStatus = "pending" | "done" | "error";

interface MediaModel { id: string; kind: Kind; label: string }

/** Shape returned by the /api/media routes (subset we read). */
interface ServerJob {
  id: string;
  kind: Kind;
  status: JobStatus;
  resultUrls?: string[];
  error?: string;
}

/** Local card state (newest-first history). */
interface UiJob {
  id: string;
  kind: Kind;
  prompt: string;
  status: JobStatus;
  url?: string;
  error?: string;
}

const ASPECTS = ["16:9", "9:16", "1:1"] as const;

export default function GeneratePanel({ onApplied }: { onApplied?: (i: AppliedInfo) => void }) {
  const { editor, videoResolution } = useTimelineContext();
  const { currentTime } = useLivePlayerContext();

  const [prompt, setPrompt] = useState("");
  const [kind, setKind] = useState<Kind>("image");
  const [aspect, setAspect] = useState<(typeof ASPECTS)[number]>("16:9");
  const [models, setModels] = useState<MediaModel[]>([]);
  const [model, setModel] = useState<string>("");
  const [configError, setConfigError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<UiJob[]>([]);

  const timers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      timers.current.forEach(clearTimeout);
      timers.current.clear();
    };
  }, []);

  // Load the model catalog once; surfaces "provider not configured" up front.
  useEffect(() => {
    let ignore = false;
    fetch("/api/media/models")
      .then((r) => r.json())
      .then((d: { models?: MediaModel[]; error?: string }) => {
        if (ignore) return;
        if (d.error) setConfigError(d.error);
        else setModels(d.models ?? []);
      })
      .catch(() => !ignore && setConfigError("media generation is unavailable"));
    return () => {
      ignore = true;
    };
  }, []);

  const modelsForKind = models.filter((m) => m.kind === kind);
  const generating = jobs.some((j) => j.status === "pending");

  const place = useCallback(
    async (src: string, k: Kind) => {
      const at = Math.round(currentTime * 10) / 10;
      const op: Op =
        k === "image"
          ? { op: "addMedia", mediaType: "image", src, start: at, end: at + 4 }
          : { op: "addMedia", mediaType: "video", src, start: at };
      const results = await applyOps(editor, [op], videoResolution);
      onApplied?.({ affectedIds: results.flatMap((r) => r.affected ?? []), seekTo: at });
    },
    [editor, videoResolution, currentTime, onApplied]
  );

  const setJob = useCallback((id: string, patch: Partial<UiJob>) => {
    setJobs((prev) => prev.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const poll = useCallback(
    (id: string, k: Kind) => {
      const tick = async () => {
        try {
          const res = await fetch(`/api/media/job/${id}`);
          const data = (await res.json()) as { job?: ServerJob; error?: string };
          if (!mounted.current) return;
          const job = data.job;
          if (!job) {
            setJob(id, { status: "error", error: data.error ?? "job not found" });
            return;
          }
          if (job.status === "done" && job.resultUrls?.[0]) {
            setJob(id, { status: "done", url: job.resultUrls[0] });
            await place(job.resultUrls[0], k);
            return;
          }
          if (job.status === "error") {
            setJob(id, { status: "error", error: job.error ?? "generation failed" });
            return;
          }
          const t = setTimeout(tick, 2500); // still pending — poll again
          timers.current.add(t);
        } catch {
          if (mounted.current) setJob(id, { status: "error", error: "network error while polling" });
        }
      };
      void tick();
    },
    [place, setJob]
  );

  const generate = useCallback(async () => {
    const p = prompt.trim();
    if (!p || generating) return;
    try {
      const res = await fetch("/api/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, prompt: p, ...(model ? { model } : {}), aspectRatio: aspect }),
      });
      const data = (await res.json()) as { job?: ServerJob; error?: string };
      if (!res.ok || !data.job) throw new Error(data.error ?? `generate returned ${res.status}`);

      const job = data.job;
      const fresh: UiJob = { id: job.id, kind, prompt: p, status: "pending" };
      setJobs((prev) => [fresh, ...prev].slice(0, 8));
      setPrompt("");

      // Images often come back done on the first response; otherwise poll.
      if (job.status === "done" && job.resultUrls?.[0]) {
        setJob(job.id, { status: "done", url: job.resultUrls[0] });
        await place(job.resultUrls[0], kind);
      } else if (job.status === "error") {
        setJob(job.id, { status: "error", error: job.error });
      } else {
        poll(job.id, kind);
      }
    } catch (e) {
      setConfigError(e instanceof Error ? e.message : "generation failed");
    }
  }, [prompt, generating, kind, model, aspect, place, poll, setJob]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Wand width={18} color="var(--accent-hover)" />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Generate</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>
          Create AI media from a prompt — added at the playhead.
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 14 }}>
        {/* Kind toggle */}
        <div role="tablist" aria-label="Media kind" style={{ display: "flex", gap: 4, padding: 4, background: "var(--surface-1)", borderRadius: "var(--r-input)" }}>
          {(["image", "video"] as Kind[]).map((k) => (
            <button
              key={k}
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              style={{
                flex: 1, height: 34, borderRadius: 8, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                fontSize: 13, fontWeight: 600,
                background: kind === k ? "var(--accent)" : "transparent",
                color: kind === k ? "#04121d" : "var(--text-2)",
                transition: "background 0.15s ease, color 0.15s ease",
              }}
            >
              {k === "image" ? <ImageIcon width={15} /> : <Film width={15} />}
              {k === "image" ? "Image" : "Video"}
            </button>
          ))}
        </div>

        {/* Prompt */}
        <textarea
          className="field"
          placeholder={kind === "image" ? "A neon city skyline at dusk, cinematic…" : "A drone shot flying over a misty canyon…"}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void generate(); }}
          rows={3}
          aria-label="Generation prompt"
          style={{ resize: "vertical", minHeight: 72, fontSize: 13, lineHeight: 1.45 }}
        />

        {/* Model + aspect */}
        <div style={{ display: "flex", gap: 8 }}>
          {modelsForKind.length > 0 && (
            <select className="field" aria-label="Model" value={model} onChange={(e) => setModel(e.target.value)} style={{ flex: 1, fontSize: 12.5, height: 36 }}>
              <option value="">{modelsForKind[0].label} (default)</option>
              {modelsForKind.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          )}
          <select className="field" aria-label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value as (typeof ASPECTS)[number])} style={{ width: 92, fontSize: 12.5, height: 36 }}>
            {ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <button
          className="btn btn-primary"
          onClick={() => void generate()}
          disabled={generating || !prompt.trim()}
          style={{ height: 40, gap: 8, opacity: generating || !prompt.trim() ? 0.55 : 1 }}
        >
          <Wand width={16} />
          {generating ? "Generating…" : `Generate ${kind === "image" ? "image" : "video"}`}
        </button>

        <div style={{ fontSize: 11, color: "var(--text-3)", lineHeight: 1.5 }}>
          {kind === "video" ? "Video generation is slow (up to a few minutes) and " : "Generation "}
          costs credits and isn&apos;t undoable. {kind === "video" && "Tip: generate a still first, then animate it."}
        </div>

        {configError && (
          <div role="alert" style={{ fontSize: 12, color: "var(--danger)", background: "rgba(255,90,90,0.08)", border: "1px solid rgba(255,90,90,0.25)", borderRadius: 10, padding: "8px 10px" }}>
            {configError}
          </div>
        )}

        {jobs.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Recent</div>
            {jobs.map((j) => <JobCard key={j.id} job={j} onReAdd={() => j.url && void place(j.url, j.kind)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({ job, onReAdd }: { job: UiJob; onReAdd: () => void }) {
  const badge =
    job.status === "pending"
      ? { label: "Generating…", color: "var(--accent-hover)", bg: "var(--accent-soft)" }
      : job.status === "error"
        ? { label: "Failed", color: "var(--danger)", bg: "rgba(255,90,90,0.1)" }
        : { label: "Done", color: "var(--success)", bg: "rgba(60,200,140,0.12)" };
  return (
    <div style={{ display: "flex", gap: 10, padding: 8, borderRadius: 12, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
      <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 8, overflow: "hidden", background: "var(--surface-2)", display: "grid", placeItems: "center" }}>
        {job.kind === "image" && job.url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={job.url} alt={job.prompt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ color: "var(--text-3)" }}>{job.kind === "video" ? <Film width={18} /> : <ImageIcon width={18} />}</span>
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ fontSize: 12, color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.prompt}</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 10.5, fontWeight: 600, color: badge.color, background: badge.bg, padding: "1px 7px", borderRadius: 999 }}>{badge.label}</span>
          {job.status === "done" && job.url && (
            <button className="btn btn-ghost" onClick={onReAdd} style={{ height: 22, padding: "0 8px", fontSize: 11.5 }}>Re-add</button>
          )}
          {job.status === "error" && job.error && (
            <span style={{ fontSize: 11, color: "var(--text-3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.error}</span>
          )}
        </div>
      </div>
    </div>
  );
}
