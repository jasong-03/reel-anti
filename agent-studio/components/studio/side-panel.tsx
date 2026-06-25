"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTimelineContext } from "@twick/timeline";
import { useLivePlayerContext } from "@twick/live-player";
import type { TrackElement } from "@twick/timeline";
import { applyOps } from "@/lib/twick/apply-op";
import type { Op } from "@/lib/twick/ops";
import type { NavId } from "./left-nav";
import type { AppliedInfo } from "./agent-panel";
import { TypeIcon, Shapes, Music, Layers, Effects, Template, Transitions, Upload, Film } from "./icons";

const SAMPLE_VIDEOS = [
  { label: "Big Buck Bunny", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4" },
  { label: "Elephants Dream", url: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4" },
];
const SAMPLE_IMAGES = [
  { label: "Mountains", url: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1280&q=80" },
  { label: "Forest road", url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=1280&q=80" },
];
const SAMPLE_AUDIO = [
  { label: "Ambient 1", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3" },
  { label: "Ambient 2", url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3" },
];

const TITLES: Record<NavId, { title: string; subtitle: string; Icon: typeof TypeIcon }> = {
  agent: { title: "Agent", subtitle: "", Icon: TypeIcon },
  assets: { title: "Assets", subtitle: "Add media by URL or pick a sample", Icon: Layers },
  templates: { title: "Templates", subtitle: "Start from a preset", Icon: Template },
  text: { title: "Text", subtitle: "Add a text overlay at the playhead", Icon: TypeIcon },
  elements: { title: "Elements", subtitle: "Add shapes at the playhead", Icon: Shapes },
  audio: { title: "Audio", subtitle: "Add a music or sound track", Icon: Music },
  effects: { title: "Effects", subtitle: "Apply to the selected clip", Icon: Effects },
  transitions: { title: "Transitions", subtitle: "Blend between clips", Icon: Transitions },
};

const mediaKind = (url: string): "video" | "image" | "audio" => {
  const u = url.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)(\?|$)/.test(u)) return "video";
  if (/\.(mp3|wav|m4a|ogg)(\?|$)/.test(u)) return "audio";
  return "image";
};

function Section({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {title && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{title}</div>}
      {children}
    </div>
  );
}

function Tile({ label, onClick, accent }: { label: string; onClick: () => void; accent?: string }) {
  return (
    <button className="btn" onClick={onClick} style={{ height: 40, width: "100%", justifyContent: "flex-start", gap: 10 }}>
      <span className="dot" style={{ background: accent ?? "var(--accent)" }} />
      {label}
    </button>
  );
}

export default function SidePanel({ nav, onApplied }: { nav: NavId; onApplied?: (i: AppliedInfo) => void }) {
  const { editor, videoResolution, selectedItem } = useTimelineContext();
  const { currentTime } = useLivePlayerContext();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = TITLES[nav];

  const run = useCallback(async (ops: Op[]) => {
    setBusy(true);
    try {
      const results = await applyOps(editor, ops, videoResolution);
      const affectedIds = results.flatMap((r) => r.affected ?? []);
      const seekTo = ops.find((o) => "start" in o && typeof o.start === "number") as { start?: number } | undefined;
      onApplied?.({ affectedIds, seekTo: seekTo?.start });
    } finally {
      setBusy(false);
    }
  }, [editor, videoResolution, onApplied]);

  const at = Math.round(currentTime * 10) / 10;
  const selId = (selectedItem as { getId?: () => string } | null)?.getId?.();
  const selType = (selectedItem as { getType?: () => string } | null)?.getType?.();

  // Import local files: blob object URLs are same-origin, so preview + WebCodecs
  // export read them without any CORS issue.
  const addFiles = useCallback((files: File[]) => {
    const ops: Op[] = [];
    files.forEach((f, i) => {
      const url = URL.createObjectURL(f);
      const kind = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
      const start = at + (kind === "audio" ? 0 : i * 0.01);
      ops.push(kind === "image"
        ? { op: "addMedia", mediaType: "image", src: url, start, end: start + 4 }
        : { op: "addMedia", mediaType: kind, src: url, start });
    });
    if (ops.length) void run(ops);
  }, [at, run]);

  const pickFiles = useCallback((accept: string) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = true;
    input.onchange = () => addFiles(Array.from(input.files ?? []));
    input.click();
  }, [addFiles]);

  const content = () => {
    switch (nav) {
      case "text":
        return (
          <Section>
            <Tile label="Title" accent="var(--track-text)" onClick={() => run([{ op: "addText", text: "Your Title", start: at, end: at + 3, fontSize: 88, fill: "#FFFFFF" }])} />
            <Tile label="Subtitle" accent="var(--track-text)" onClick={() => run([{ op: "addText", text: "Subtitle text", start: at, end: at + 3, fontSize: 52, fill: "#E8EEF6" }])} />
            <Tile label="Body" accent="var(--track-text)" onClick={() => run([{ op: "addText", text: "Body copy goes here", start: at, end: at + 3, fontSize: 34, fill: "#cfd8e6" }])} />
            <Tile label="Caption" accent="var(--track-effect)" onClick={() => run([{ op: "addCaption", text: "Caption line", start: at, end: at + 3 }])} />
          </Section>
        );
      case "elements":
        return (
          <Section>
            <Tile label="Rectangle" accent="var(--track-effect)" onClick={() => run([{ op: "addShape", shape: "rect", start: at, end: at + 3, fill: "#0ea5ff", width: 360, height: 200 }])} />
            <Tile label="Circle" accent="var(--track-effect)" onClick={() => run([{ op: "addShape", shape: "circle", start: at, end: at + 3, fill: "#6d5cff", radius: 120 }])} />
            <Tile label="Accent bar" accent="var(--accent)" onClick={() => run([{ op: "addShape", shape: "rect", start: at, end: at + 3, fill: "#0ea5ff", width: 480, height: 8 }])} />
          </Section>
        );
      case "audio":
        return (
          <>
            <Dropzone label="Drop audio here or click to upload" accept="audio/*" busy={busy} onPick={() => pickFiles("audio/*")} onFiles={addFiles} />
            <UrlAdd kind="audio" url={url} setUrl={setUrl} busy={busy} onAdd={(u) => run([{ op: "addMedia", mediaType: "audio", src: u, start: at }])} />
            <Section title="Samples">
              {SAMPLE_AUDIO.map((s) => <Tile key={s.url} label={s.label} accent="var(--track-audio)" onClick={() => run([{ op: "addMedia", mediaType: "audio", src: s.url, start: at }])} />)}
            </Section>
          </>
        );
      case "assets":
        return (
          <>
            <Dropzone label="Drop video / image here or click to upload" accept="video/*,image/*" busy={busy} onPick={() => pickFiles("video/*,image/*")} onFiles={addFiles} />
            <UrlAdd kind="media" url={url} setUrl={setUrl} busy={busy} onAdd={(u) => run([{ op: "addMedia", mediaType: mediaKind(u) === "audio" ? "video" : mediaKind(u), src: u, start: at }])} />
            <Section title="Sample video">
              {SAMPLE_VIDEOS.map((s) => <Tile key={s.url} label={s.label} accent="var(--track-video)" onClick={() => run([{ op: "addMedia", mediaType: "video", src: s.url, start: at }])} />)}
            </Section>
            <Section title="Sample images">
              {SAMPLE_IMAGES.map((s) => <Tile key={s.url} label={s.label} accent="var(--track-video)" onClick={() => run([{ op: "addMedia", mediaType: "image", src: s.url, start: at, end: at + 4 }])} />)}
            </Section>
          </>
        );
      case "effects":
        return (
          <Section>
            <div style={{ fontSize: 12, color: "var(--text-3)", marginBottom: 2 }}>
              {selType === "video" || selType === "image" ? `Selected: ${selType}` : "Select a video/image clip for zoom"}
            </div>
            <Tile label="Cinematic Zoom In" accent="var(--track-effect)" onClick={() => selId && run([{ op: "addZoom", elementId: selId, toScale: 1.3 }])} />
            <Tile label="Punch Zoom" accent="var(--track-effect)" onClick={() => selId && run([{ op: "addZoom", elementId: selId, toScale: 1.6 }])} />
            <Tile label="Warm Color Grade" accent="#ff9a3c" onClick={() => run([{ op: "addShape", shape: "rect", start: at, end: at + 5, fill: "rgba(255,150,60,0.18)", width: videoResolution.width, height: videoResolution.height }])} />
            <Tile label="Vignette overlay" accent="#222" onClick={() => run([{ op: "addShape", shape: "rect", start: at, end: at + 5, fill: "rgba(0,0,0,0.28)", width: videoResolution.width, height: videoResolution.height }])} />
          </Section>
        );
      case "transitions":
        return (
          <Section>
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>Crossfade blends the last two clips of the first track.</div>
            <Tile label="Crossfade (0.5s)" onClick={() => addCrossfade(editor, 0.5)} />
            <Tile label="Crossfade (1s)" onClick={() => addCrossfade(editor, 1)} />
          </Section>
        );
      case "templates":
        return (
          <Section>
            <Tile label="Minimal Title" onClick={() => loadTemplate(editor, "minimal")} />
            <Tile label="Lower Third" onClick={() => loadTemplate(editor, "lower")} />
            <Tile label="Bold Intro" onClick={() => loadTemplate(editor, "intro")} />
          </Section>
        );
      default:
        return null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <meta.Icon width={18} color="var(--accent-hover)" />
          <span style={{ fontSize: 15, fontWeight: 700 }}>{meta.title}</span>
        </div>
        {meta.subtitle && <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{meta.subtitle}</div>}
      </div>
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 18 }}>
        {content()}
        <div style={{ fontSize: 11, color: "var(--text-3)", marginTop: "auto", paddingTop: 8 }}>
          New items are added at the playhead ({at}s).
        </div>
      </div>
    </div>
  );
}

function Dropzone({ label, accept, busy, onPick, onFiles }: { label: string; accept: string; busy: boolean; onPick: () => void; onFiles: (f: File[]) => void }) {
  const [over, setOver] = useState(false);
  const matches = (f: File) => accept.split(",").some((a) => f.type.startsWith(a.replace("/*", "")));
  return (
    <button
      onClick={onPick}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(Array.from(e.dataTransfer.files).filter(matches)); }}
      style={{
        display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
        padding: "22px 16px", width: "100%", cursor: busy ? "wait" : "pointer",
        borderRadius: 14, border: `1.5px dashed ${over ? "var(--accent)" : "var(--border-strong)"}`,
        background: over ? "var(--accent-soft)" : "var(--surface-1)", color: "var(--text-2)",
        transition: "border-color 0.16s ease, background 0.16s ease",
      }}
    >
      <span style={{ width: 40, height: 40, borderRadius: 12, display: "grid", placeItems: "center", background: "var(--accent-soft)", color: "var(--accent-hover)" }}>
        {busy ? <Film width={20} /> : <Upload width={20} />}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-1)" }}>{busy ? "Importing…" : "Upload from computer"}</span>
      <span style={{ fontSize: 11.5, color: "var(--text-3)", textAlign: "center" }}>{label}</span>
    </button>
  );
}

function UrlAdd({ kind, url, setUrl, busy, onAdd }: { kind: string; url: string; setUrl: (s: string) => void; busy: boolean; onAdd: (u: string) => void }) {
  return (
    <Section title={`Add ${kind} by URL`}>
      <input className="field" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} style={{ fontSize: 12.5 }} />
      <button className="btn btn-primary" disabled={busy || !url.trim()} onClick={() => { onAdd(url.trim()); setUrl(""); }} style={{ height: 36, opacity: busy || !url.trim() ? 0.5 : 1 }}>
        {busy ? "Adding…" : "Add to timeline"}
      </button>
    </Section>
  );
}

function addCrossfade(editor: ReturnType<typeof useTimelineContext>["editor"], duration: number) {
  const tracks = editor.getTimelineData()?.tracks ?? [];
  const track = tracks.find((t) => t.getElements().length >= 2);
  if (!track) return;
  const els = [...track.getElements()].sort((a, b) => a.getStart() - b.getStart());
  const from = els[els.length - 2];
  const to = els[els.length - 1];
  editor.addTransition(from.getId(), to.getId(), "crossfade", duration);
}

function loadTemplate(editor: ReturnType<typeof useTimelineContext>["editor"], kind: "minimal" | "lower" | "intro") {
  const presets = {
    minimal: { text: "Minimal", fontSize: 96, y: 0 },
    lower: { text: "Lower Third", fontSize: 48, y: 220 },
    intro: { text: "BOLD INTRO", fontSize: 120, y: 0 },
  } as const;
  const p = presets[kind];
  editor.loadProject({
    version: 1,
    backgroundColor: "#070d1a",
    tracks: [
      {
        id: "t-tpl",
        name: "Titles",
        type: "element",
        elements: [
          { id: `e-${kind}`, trackId: "t-tpl", name: p.text, type: "text", s: 0, e: 4, props: { text: p.text, fill: "#FFFFFF", fontSize: p.fontSize, y: p.y } },
        ],
      },
    ],
  });
}
