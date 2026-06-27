"use client";

import { useCallback, useState, type ReactNode } from "react";
import { useTimelineContext } from "@twick/timeline";
import { useLivePlayerContext } from "@twick/live-player";
import type { TrackElement, ProjectJSON, ElementJSON } from "@twick/timeline";
import { applyOps } from "@/lib/twick/apply-op";
import type { Op } from "@/lib/twick/ops";
import type { NavId } from "./left-nav";
import type { AppliedInfo } from "./agent-panel";
import { useMediaLibrary, type AssetType, type AssetOrigin, type MediaAsset } from "./media-library";
import { TypeIcon, Shapes, Music, Layers, Effects, Template, Transitions, Upload, Film, Image as ImageIcon, Plus, Trash } from "./icons";

/** Best-effort human filename from a URL (skips query, decodes). */
const fileNameFromUrl = (u: string): string => {
  try {
    const last = new URL(u).pathname.split("/").filter(Boolean).pop();
    if (last) return decodeURIComponent(last);
  } catch {
    const last = u.split("/").filter(Boolean).pop();
    if (last) return last;
  }
  return "media";
};

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
  generate: { title: "Generate", subtitle: "Create AI media from a prompt", Icon: Layers },
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
  const { assets, addAsset, removeAsset } = useMediaLibrary();
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

  // Register media in the library AND drop it on the timeline at the playhead, with
  // a friendly clip name. Blob object URLs are same-origin, so preview + WebCodecs
  // export read them without any CORS issue.
  const addMedia = useCallback((items: { src: string; type: AssetType; name: string; origin: AssetOrigin }[]) => {
    const ops: Op[] = items.map((it, i) => {
      addAsset({ name: it.name, src: it.src, type: it.type, origin: it.origin });
      const start = at + (it.type === "audio" ? 0 : i * 0.01);
      return it.type === "image"
        ? { op: "addMedia", mediaType: "image", src: it.src, start, end: start + 4, name: it.name }
        : { op: "addMedia", mediaType: it.type, src: it.src, start, name: it.name };
    });
    if (ops.length) void run(ops);
  }, [at, run, addAsset]);

  const addFiles = useCallback((files: File[]) => {
    addMedia(files.map((f) => ({
      src: URL.createObjectURL(f),
      type: (f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image") as AssetType,
      name: f.name,
      origin: "upload" as AssetOrigin,
    })));
  }, [addMedia]);

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
            <UrlAdd kind="audio" url={url} setUrl={setUrl} busy={busy} onAdd={(u) => addMedia([{ src: u, type: "audio", name: fileNameFromUrl(u), origin: "url" }])} />
            <MediaBin assets={assets.filter((a) => a.type === "audio")} onAdd={(a) => addMedia([{ src: a.src, type: a.type, name: a.name, origin: a.origin }])} onRemove={removeAsset} />
            <Section title="Samples">
              {SAMPLE_AUDIO.map((s) => <Tile key={s.url} label={s.label} accent="var(--track-audio)" onClick={() => addMedia([{ src: s.url, type: "audio", name: s.label, origin: "sample" }])} />)}
            </Section>
          </>
        );
      case "assets":
        return (
          <>
            <Dropzone label="Drop video / image here or click to upload" accept="video/*,image/*" busy={busy} onPick={() => pickFiles("video/*,image/*")} onFiles={addFiles} />
            <UrlAdd kind="media" url={url} setUrl={setUrl} busy={busy} onAdd={(u) => { const t = (mediaKind(u) === "audio" ? "video" : mediaKind(u)) as AssetType; addMedia([{ src: u, type: t, name: fileNameFromUrl(u), origin: "url" }]); }} />
            <MediaBin assets={assets.filter((a) => a.type !== "audio")} onAdd={(a) => addMedia([{ src: a.src, type: a.type, name: a.name, origin: a.origin }])} onRemove={removeAsset} />
            <Section title="Sample video">
              {SAMPLE_VIDEOS.map((s) => <Tile key={s.url} label={s.label} accent="var(--track-video)" onClick={() => addMedia([{ src: s.url, type: "video", name: s.label, origin: "sample" }])} />)}
            </Section>
            <Section title="Sample images">
              {SAMPLE_IMAGES.map((s) => <Tile key={s.url} label={s.label} accent="var(--track-video)" onClick={() => addMedia([{ src: s.url, type: "image", name: s.label, origin: "sample" }])} />)}
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
            {TEMPLATES.map((t) => (
              <Tile key={t.id} label={t.label} accent={t.accent} onClick={() => editor.loadProject(t.build())} />
            ))}
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

/** The media library ("asset bin") — everything imported or generated, re-addable. */
function MediaBin({ assets, onAdd, onRemove }: { assets: MediaAsset[]; onAdd: (a: MediaAsset) => void; onRemove: (id: string) => void }) {
  if (assets.length === 0) return null;
  return (
    <Section title={`Your media (${assets.length})`}>
      {assets.map((a) => (
        <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: 8, borderRadius: 10, background: "var(--surface-1)", border: "1px solid var(--border)" }}>
          <div style={{ width: 40, height: 40, flexShrink: 0, borderRadius: 7, overflow: "hidden", background: "var(--surface-2)", display: "grid", placeItems: "center", color: "var(--text-3)" }}>
            {a.type === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={a.src} alt={a.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : a.type === "audio" ? <Music width={17} /> : <Film width={17} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: "var(--text-1)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
            <div style={{ fontSize: 10.5, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{a.type} · {a.origin}</div>
          </div>
          <button className="icon-btn" aria-label={`Add ${a.name} to timeline`} title="Add to timeline" onClick={() => onAdd(a)}><Plus width={16} /></button>
          <button className="icon-btn" aria-label={`Remove ${a.name} from library`} title="Remove from library" onClick={() => onRemove(a.id)}><Trash width={15} /></button>
        </div>
      ))}
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

/** Template gallery — each builds a full ProjectJSON loaded via editor.loadProject. */
const text = (id: string, t: string, s: number, e: number, props: Record<string, unknown>): ElementJSON => ({ id, trackId: "t-txt", name: t, type: "text", s, e, props: { text: t, fill: "#FFFFFF", ...props } });
const shape = (id: string, s: number, e: number, props: Record<string, unknown>): ElementJSON => ({ id, trackId: "t-fx", name: "shape", type: "rect", s, e, props });

const TEMPLATES: { id: string; label: string; accent: string; build: () => ProjectJSON }[] = [
  {
    id: "minimal", label: "Minimal Title", accent: "var(--track-text)",
    build: () => ({ version: 1, backgroundColor: "#070d1a", tracks: [{ id: "t-txt", name: "Titles", type: "element", elements: [text("e-1", "Minimal", 0, 4, { fontSize: 110 })] }] }),
  },
  {
    id: "titlesub", label: "Title + Subtitle", accent: "var(--track-text)",
    build: () => ({ version: 1, backgroundColor: "#070d1a", tracks: [{ id: "t-txt", name: "Titles", type: "element", elements: [text("e-1", "Your Title", 0, 5, { fontSize: 96, y: -60 }), text("e-2", "A short subtitle goes here", 0, 5, { fontSize: 40, y: 70, fill: "#9fb0c3" })] }] }),
  },
  {
    id: "lower", label: "Lower Third", accent: "var(--accent)",
    build: () => ({ version: 1, backgroundColor: "#070d1a", tracks: [
      { id: "t-fx", name: "Bar", type: "element", elements: [shape("e-bar", 0, 5, { fill: "rgba(14,165,255,0.9)", width: 560, height: 90, radius: 8, x: -300, y: 240 })] },
      { id: "t-txt", name: "Titles", type: "element", elements: [text("e-1", "Jane Doe", 0, 5, { fontSize: 44, x: -300, y: 225 }), text("e-2", "Director of Photography", 0, 5, { fontSize: 26, x: -300, y: 270, fill: "#dbe6f3" })] },
    ] }),
  },
  {
    id: "intro", label: "Bold Intro", accent: "#6d5cff",
    build: () => ({ version: 1, backgroundColor: "#05070d", tracks: [
      { id: "t-fx", name: "Accent", type: "element", elements: [shape("e-bar", 0, 4, { fill: "#0ea5ff", width: 360, height: 8, radius: 4, y: 90 })] },
      { id: "t-txt", name: "Titles", type: "element", elements: [text("e-1", "BOLD INTRO", 0, 4, { fontSize: 128, fontWeight: 700 })] },
    ] }),
  },
  {
    id: "quote", label: "Quote", accent: "var(--track-effect)",
    build: () => ({ version: 1, backgroundColor: "#0a0f1c", tracks: [{ id: "t-txt", name: "Titles", type: "element", elements: [text("e-1", "“Design is intelligence made visible.”", 0, 6, { fontSize: 56, y: -30 }), text("e-2", "— Alina Wheeler", 0, 6, { fontSize: 30, y: 90, fill: "#9fb0c3" })] }] }),
  },
];
