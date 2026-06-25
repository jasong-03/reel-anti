"use client";

import { useState } from "react";
import { useTimelineContext } from "@twick/timeline";
import { useBrowserRenderer } from "@twick/browser-render";
import { saveProject } from "@/lib/twick/persistence";
import { Sparkles, Undo, Redo, Cloud, Help, Bell, Export, ChevronDown, Check } from "./icons";

type SaveState = "saved" | "saving" | "unsaved";

export default function TopHeader() {
  const { editor, canUndo, canRedo, videoResolution } = useTimelineContext();
  const [save, setSave] = useState<SaveState>("saved");
  const [name, setName] = useState("Road Trip Adventure");
  const [editingName, setEditingName] = useState(false);

  const { render, isRendering, progress } = useBrowserRenderer({
    width: videoResolution.width,
    height: videoResolution.height,
    fps: 30,
    quality: "medium",
    includeAudio: true,
    autoDownload: true,
    downloadFilename: `${name.replace(/\s+/g, "-").toLowerCase()}.mp4`,
  });

  const onSave = async () => {
    setSave("saving");
    try {
      await saveProject(editor);
      setSave("saved");
    } catch {
      setSave("unsaved");
    }
  };

  const onExport = async () => {
    if (isRendering) return;
    const p = editor.getProject();
    await render({
      input: {
        properties: { width: videoResolution.width, height: videoResolution.height, fps: 30 },
        tracks: p.tracks,
        backgroundColor: p.backgroundColor ?? "#05070d",
      },
    } as never);
  };

  return (
    <header
      style={{
        height: 56,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 16px",
        borderBottom: "1px solid var(--border)",
        background: "rgba(5,8,16,0.6)",
        backdropFilter: "blur(10px)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 220 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, display: "grid", placeItems: "center", background: "linear-gradient(135deg, var(--accent), #6d5cff)", color: "#03121f" }}>
          <Sparkles width={18} />
        </span>
        <strong style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>AI Video Studio</strong>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, justifyContent: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", padding: "0 4px" }}>
          <span style={{ fontSize: 10.5, color: "var(--text-3)", lineHeight: 1.2 }}>Project</span>
          {editingName ? (
            <input
              autoFocus
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => { if (e.key === "Enter") setEditingName(false); }}
              style={{ padding: "2px 6px", fontSize: 13.5, fontWeight: 600, height: 24, width: 200 }}
            />
          ) : (
            <button className="btn btn-ghost" onClick={() => setEditingName(true)} style={{ height: 22, padding: 0, gap: 6, fontSize: 13.5, fontWeight: 600 }}>
              {name} <ChevronDown width={14} />
            </button>
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          <button className="icon-btn" aria-label="Undo" disabled={!canUndo} onClick={() => editor.undo()} style={{ opacity: canUndo ? 1 : 0.4 }}><Undo width={18} /></button>
          <button className="icon-btn" aria-label="Redo" disabled={!canRedo} onClick={() => editor.redo()} style={{ opacity: canRedo ? 1 : 0.4 }}><Redo width={18} /></button>
        </div>

        <button className="btn btn-ghost" onClick={onSave} style={{ height: 32, gap: 7, color: save === "saved" ? "var(--success)" : "var(--text-2)", fontSize: 13 }}>
          {save === "saved" ? <Check width={15} /> : <Cloud width={16} />}
          {save === "saving" ? "Saving…" : save === "saved" ? "Saved" : "Save"}
        </button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 220, justifyContent: "flex-end" }}>
        <button className="btn btn-primary" onClick={onExport} disabled={isRendering} style={{ height: 38, padding: "0 18px", minWidth: 116 }}>
          <Export width={17} /> {isRendering ? `${Math.round(progress * 100)}%` : "Export"}
        </button>
        <button className="icon-btn" aria-label="Help"><Help width={18} /></button>
        <button className="icon-btn" aria-label="Notifications"><Bell width={18} /></button>
        <span style={{ width: 32, height: 32, borderRadius: "50%", display: "grid", placeItems: "center", background: "linear-gradient(135deg, #6d5cff, var(--accent))", color: "#fff", fontWeight: 700, fontSize: 13 }}>N</span>
      </div>
    </header>
  );
}
