"use client";

import { useState } from "react";
import { useTimelineContext } from "@twick/timeline";
import { Settings, Feedback } from "./icons";

const RESOLUTIONS = [
  { label: "Landscape 16:9", width: 1280, height: 720 },
  { label: "Portrait 9:16", width: 720, height: 1280 },
  { label: "Square 1:1", width: 1080, height: 1080 },
];

function PanelHeader({ Icon, title, subtitle }: { Icon: typeof Settings; title: string; subtitle: string }) {
  return (
    <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <Icon width={18} color="var(--accent-hover)" />
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
      </div>
      <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>{subtitle}</div>
    </div>
  );
}

export function SettingsPanel() {
  const { editor, videoResolution, setVideoResolution, changeLog } = useTimelineContext();
  void changeLog;
  const bg = editor.getBackgroundColor?.() ?? "#070d1a";
  const hexBg = /^#[0-9a-fA-F]{6}$/.test(bg) ? bg : "#070d1a";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PanelHeader Icon={Settings} title="Settings" subtitle="Project canvas & playback" />
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 20 }}>
        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Aspect ratio</div>
          {RESOLUTIONS.map((r) => {
            const active = videoResolution.width === r.width && videoResolution.height === r.height;
            return (
              <button key={r.label} className="btn" onClick={() => setVideoResolution({ width: r.width, height: r.height })}
                style={{ height: 40, justifyContent: "space-between", borderColor: active ? "var(--accent)" : "var(--border)", color: active ? "var(--accent-hover)" : "var(--text-1)" }}>
                {r.label} <span style={{ fontSize: 11, color: "var(--text-3)" }}>{r.width}×{r.height}</span>
              </button>
            );
          })}
        </section>

        <section style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Background</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="color" value={hexBg} onChange={(e) => editor.setBackgroundColor(e.target.value)} style={{ width: 44, height: 32, padding: 0, border: "1px solid var(--border)", borderRadius: 8, background: "transparent", cursor: "pointer" }} />
            <input className="field" value={bg} onChange={(e) => editor.setBackgroundColor(e.target.value)} style={{ padding: "7px 10px", fontSize: 12.5 }} />
          </div>
        </section>

        <section style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>
          Export renders at 30 fps via WebCodecs. Changing aspect ratio updates the preview and timeline immediately.
        </section>
      </div>
    </div>
  );
}

export function FeedbackPanel() {
  const [text, setText] = useState("");
  const issueUrl = `https://github.com/jasong-03/reel-anti/issues/new?title=${encodeURIComponent("Feedback")}&body=${encodeURIComponent(text)}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <PanelHeader Icon={Feedback} title="Feedback" subtitle="Tell us what to improve" />
      <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <textarea className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="What worked? What's missing or broken?" rows={6} style={{ resize: "vertical", minHeight: 120 }} />
        <a className="btn btn-primary" href={issueUrl} target="_blank" rel="noreferrer" style={{ height: 38, textDecoration: "none", pointerEvents: text.trim() ? "auto" : "none", opacity: text.trim() ? 1 : 0.5 }}>
          Open GitHub issue
        </a>
        <a className="btn" href={`mailto:phanhoangvinhhien@gmail.com?subject=reel-anti%20feedback&body=${encodeURIComponent(text)}`} style={{ height: 36, textDecoration: "none" }}>
          Send by email
        </a>
      </div>
    </div>
  );
}
