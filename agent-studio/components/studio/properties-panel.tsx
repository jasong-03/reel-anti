"use client";

import { useState, type ReactNode } from "react";
import { useTimelineContext } from "@twick/timeline";
import type { TrackElement } from "@twick/timeline";
import { ChevronDown } from "./icons";

const TABS = ["Video", "Audio", "Effect", "Animation"] as const;

const isElement = (item: unknown): item is TrackElement =>
  !!item && typeof (item as { getOpacity?: unknown }).getOpacity === "function";

function Accordion({ title, defaultOpen = false, accent, children }: { title: string; defaultOpen?: boolean; accent?: boolean; children?: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--border)" }}>
      <button className="acc-head" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <span style={{ display: "flex", alignItems: "center", gap: 7, color: accent ? "var(--accent-hover)" : "var(--text-1)" }}>{title}</span>
        <ChevronDown className="chev" width={16} />
      </button>
      {open && <div style={{ paddingBottom: 16, display: "flex", flexDirection: "column", gap: 14 }}>{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "64px 1fr", alignItems: "center", gap: 12 }}>
      <span style={{ fontSize: 12.5, color: "var(--text-2)" }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>{children}</div>
    </div>
  );
}

function NumBox({ value, suffix }: { value: number | string; suffix?: string }) {
  return (
    <span style={{ minWidth: 58, textAlign: "right", padding: "5px 9px", borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--border)", fontSize: 12.5, fontVariantNumeric: "tabular-nums" }}>
      {value}{suffix}
    </span>
  );
}

export default function PropertiesPanel() {
  const { selectedItem, editor, videoResolution } = useTimelineContext();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Video");
  const el = isElement(selectedItem) ? selectedItem : null;

  const props = (el?.getProps?.() ?? {}) as Record<string, unknown>;
  const opacity = el ? Math.round((el.getOpacity?.() ?? 1) * 100) : 100;
  const rotation = el ? Math.round(el.getRotation?.() ?? 0) : 0;
  const pos = el ? el.getPosition?.() ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const speed = Number((props.playbackRate as number) ?? 1);
  const volume = Number((props.volume as number) ?? 1);
  const fill = (props.fill as string) ?? "#ffffff";
  const fontSize = Number((props.fontSize as number) ?? 48);
  const elType = el?.getType?.() ?? "";
  const isText = elType === "text" || elType === "caption";
  const isMedia = elType === "video" || elType === "audio";
  const hexFill = /^#[0-9a-fA-F]{6}$/.test(fill) ? fill : "#ffffff";

  const update = (updates: Record<string, unknown>) => {
    if (!el) return;
    editor.updateElements([{ elementId: el.getId(), updates }]);
  };
  const setProp = (patch: Record<string, unknown>) => update({ props: { ...props, ...patch } });

  return (
    <aside style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", borderLeft: "1px solid var(--border)", background: "rgba(5,8,16,0.4)" }}>
      <div style={{ padding: "16px 16px 10px" }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>Properties</div>
        <div role="tablist" style={{ display: "flex", gap: 2, background: "var(--surface-1)", borderRadius: 11, padding: 3 }}>
          {TABS.map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "0 16px" }}>
        {!el && (
          <div style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.6, padding: "8px 2px 16px" }}>
            Select a clip on the timeline to edit its properties.
          </div>
        )}

        <Accordion title="Transform" defaultOpen>
          <Row label="Scale">
            <input type="range" min={10} max={300} value={100} readOnly style={{ flex: 1 }} disabled={!el} />
            <NumBox value={100} suffix="%" />
          </Row>
          <Row label="Position">
            <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1 }}>
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>X</span>
              <input className="field" type="number" value={Math.round(pos.x)} disabled={!el} onChange={(e) => update({ position: { x: Number(e.target.value), y: pos.y } })} style={{ padding: "5px 8px", fontSize: 12.5 }} />
              <span style={{ fontSize: 11, color: "var(--text-3)" }}>Y</span>
              <input className="field" type="number" value={Math.round(pos.y)} disabled={!el} onChange={(e) => update({ position: { x: pos.x, y: Number(e.target.value) } })} style={{ padding: "5px 8px", fontSize: 12.5 }} />
            </span>
          </Row>
          <Row label="Rotate">
            <input type="range" min={-180} max={180} value={rotation} disabled={!el} onChange={(e) => update({ rotation: Number(e.target.value) })} style={{ flex: 1 }} />
            <NumBox value={rotation} suffix="°" />
          </Row>
          <Row label="Opacity">
            <input type="range" min={0} max={100} value={opacity} disabled={!el} onChange={(e) => update({ opacity: Number(e.target.value) / 100 })} style={{ flex: 1 }} />
            <NumBox value={opacity} suffix="%" />
          </Row>
        </Accordion>

        <Accordion title="Crop" defaultOpen>
          <Row label="Type">
            <button className="btn" style={{ flex: 1, justifyContent: "space-between", height: 34 }} disabled={!el}>
              None <ChevronDown width={14} />
            </button>
          </Row>
        </Accordion>

        <Accordion title="Speed" defaultOpen>
          <Row label="Speed">
            <input type="range" min={0.25} max={3} step={0.05} value={speed} disabled={!el} onChange={(e) => update({ props: { ...(el?.getProps?.() ?? {}), playbackRate: Number(e.target.value) } })} style={{ flex: 1 }} />
            <NumBox value={speed.toFixed(1)} suffix="x" />
          </Row>
        </Accordion>

        <Accordion title="Color" defaultOpen={isText}>
          <Row label="Fill">
            <input type="color" value={hexFill} disabled={!el} onChange={(e) => setProp({ fill: e.target.value })} style={{ width: 38, height: 28, padding: 0, border: "1px solid var(--border)", borderRadius: 8, background: "transparent", cursor: el ? "pointer" : "default" }} />
            <input className="field" value={fill} disabled={!el} onChange={(e) => setProp({ fill: e.target.value })} style={{ padding: "5px 8px", fontSize: 12, flex: 1 }} />
          </Row>
          {isText && (
            <Row label="Font">
              <input type="range" min={12} max={200} value={fontSize} onChange={(e) => setProp({ fontSize: Number(e.target.value) })} style={{ flex: 1 }} />
              <NumBox value={fontSize} suffix="px" />
            </Row>
          )}
        </Accordion>

        <Accordion title="Audio" defaultOpen={isMedia}>
          <Row label="Volume">
            <input type="range" min={0} max={2} step={0.05} value={volume} disabled={!isMedia} onChange={(e) => setProp({ volume: Number(e.target.value) })} style={{ flex: 1 }} />
            <NumBox value={Math.round(volume * 100)} suffix="%" />
          </Row>
          {!isMedia && <div style={{ fontSize: 12, color: "var(--text-3)" }}>Select a video or audio clip.</div>}
        </Accordion>

        <Accordion title="Shadow">
          <div style={{ fontSize: 12, color: "var(--text-3)" }}>Drop shadow controls coming soon.</div>
        </Accordion>

        <Accordion title="AI Tools" accent>
          <div style={{ fontSize: 12.5, color: "var(--text-2)", lineHeight: 1.5 }}>
            Use the Agent panel to edit this clip in natural language — e.g. “make the selected clip 1.2× and fade it in”.
          </div>
        </Accordion>
      </div>

      <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-3)" }}>
        {videoResolution.width}×{videoResolution.height}
      </div>
    </aside>
  );
}
