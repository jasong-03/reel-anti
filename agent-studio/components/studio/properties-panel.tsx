"use client";

import { useRef, useState, type ReactNode } from "react";
import { useTimelineContext, ElementAnimation } from "@twick/timeline";
import type { TrackElement } from "@twick/timeline";
import { ChevronDown } from "./icons";

const TABS = ["Video", "Audio", "Effect", "Animation"] as const;
type Tab = (typeof TABS)[number];

const FILTERS = ["none", "grayscale", "sepia", "invert", "warm", "cold"];
const ANIMS = ["none", "fade", "rise", "pop", "blur"];
const FITS = ["cover", "contain", "fill", "none"];

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

function Empty({ text }: { text: string }) {
  return <div style={{ fontSize: 12, color: "var(--text-3)", lineHeight: 1.6 }}>{text}</div>;
}

interface ScaleBase { kind: "font" | "rect" | "circle" | "frame"; w: number; h: number; }

export default function PropertiesPanel() {
  const { selectedItem, editor, videoResolution, changeLog } = useTimelineContext();
  const [tab, setTab] = useState<Tab>("Video");
  const scaleBase = useRef<Map<string, ScaleBase>>(new Map());
  const el = isElement(selectedItem) ? selectedItem : null;

  // `changeLog` is referenced so the panel re-reads element values after any edit.
  void changeLog;

  const props = (el?.getProps?.() ?? {}) as Record<string, unknown>;
  const elType = el?.getType?.() ?? "";
  const isText = elType === "text" || elType === "caption";
  const isMedia = elType === "video" || elType === "audio";
  const hasVisualFilter = elType === "video" || elType === "image";

  const opacity = el ? Math.round((el.getOpacity?.() ?? 1) * 100) : 100;
  const rotation = el ? Math.round(el.getRotation?.() ?? 0) : 0;
  const pos = el ? el.getPosition?.() ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const speed = Number((props.playbackRate as number) ?? 1);
  const volume = Number((props.volume as number) ?? 1);
  const fill = (props.fill as string) ?? "#ffffff";
  const fontSize = Number((props.fontSize as number) ?? 48);
  const hexFill = /^#[0-9a-fA-F]{6}$/.test(fill) ? fill : "#ffffff";
  const filter = (props.mediaFilter as string) ?? "none";
  const animName = (el?.getAnimation?.()?.getName?.() as string) ?? "none";

  const getLive = (id: string): TrackElement | null => {
    for (const t of editor.getTimelineData()?.tracks ?? []) {
      const e = t.getElementById(id);
      if (e) return e as TrackElement;
    }
    return null;
  };
  const update = (updates: Record<string, unknown>) => { if (el) editor.updateElements([{ elementId: el.getId(), updates }]); };
  const setProp = (patch: Record<string, unknown>) => update({ props: { ...props, ...patch } });

  // ---- Scale (per element type) ----
  const frame = (el as unknown as { getFrame?: () => { size?: [number, number] } } | null)?.getFrame?.();
  const primary = (): ScaleBase | null => {
    if (isText) return { kind: "font", w: fontSize, h: fontSize };
    if (elType === "rect") return { kind: "rect", w: Number(props.width ?? 0), h: Number(props.height ?? 0) };
    if (elType === "circle") return { kind: "circle", w: Number(props.radius ?? 0), h: Number(props.radius ?? 0) };
    if (frame?.size) return { kind: "frame", w: frame.size[0], h: frame.size[1] };
    return null;
  };
  const cur = primary();
  const canScale = !!el && !!cur && cur.w > 0;
  if (el && cur && cur.w > 0 && !scaleBase.current.has(el.getId())) scaleBase.current.set(el.getId(), cur);
  const base = el ? scaleBase.current.get(el.getId()) : undefined;
  const scalePct = base && cur ? Math.round((cur.w / base.w) * 100) : 100;

  const setScale = (pct: number) => {
    if (!el || !base) return;
    const f = pct / 100;
    const w = Math.max(1, Math.round(base.w * f));
    const h = Math.max(1, Math.round(base.h * f));
    if (base.kind === "font") setProp({ fontSize: w });
    else if (base.kind === "rect") setProp({ width: w, height: h });
    else if (base.kind === "circle") setProp({ radius: w, width: w * 2, height: w * 2 });
    else {
      const live = getLive(el.getId()) as unknown as { getFrame?: () => object; setFrame?: (f: object) => void } | null;
      const fr = live?.getFrame?.() ?? {};
      live?.setFrame?.({ ...fr, size: [w, h] });
      editor.updateElement(el);
    }
  };

  const setAnim = (name: string) => {
    if (!el) return;
    const live = getLive(el.getId());
    if (!live) return;
    if (name === "none") live.setAnimation(undefined);
    else live.setAnimation(new ElementAnimation(name).setAnimate("enter").setDuration(0.6));
    editor.updateElement(live);
  };

  const objectFit = (el as unknown as { getObjectFit?: () => string } | null)?.getObjectFit?.() ?? "cover";
  const setFit = (val: string) => {
    if (!el) return;
    const live = getLive(el.getId());
    (live as unknown as { setObjectFit?: (v: string) => void } | null)?.setObjectFit?.(val);
    if (live) editor.updateElement(live);
  };

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
        {!el && <div style={{ color: "var(--text-3)", fontSize: 12.5, lineHeight: 1.6, padding: "8px 2px 16px" }}>Select a clip on the timeline to edit its properties.</div>}

        {tab === "Video" && (
          <>
            <Accordion title="Transform" defaultOpen>
              <Row label="Scale">
                <input type="range" min={10} max={300} value={scalePct} disabled={!canScale} onChange={(e) => setScale(Number(e.target.value))} style={{ flex: 1 }} />
                <NumBox value={scalePct} suffix="%" />
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

            <Accordion title="Speed" defaultOpen={isMedia}>
              <Row label="Speed">
                <input type="range" min={0.25} max={3} step={0.05} value={speed} disabled={!isMedia} onChange={(e) => setProp({ playbackRate: Number(e.target.value) })} style={{ flex: 1 }} />
                <NumBox value={speed.toFixed(1)} suffix="x" />
              </Row>
              {!isMedia && <Empty text="Speed applies to video / audio clips." />}
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

            {hasVisualFilter && (
              <Accordion title="Crop / Fit" defaultOpen>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {FITS.map((f) => (
                    <button key={f} className={`chip${objectFit === f ? " chip-static" : ""}`} onClick={() => setFit(f)} style={{ height: 28 }}>{f}</button>
                  ))}
                </div>
              </Accordion>
            )}
          </>
        )}

        {tab === "Audio" && (
          <Accordion title="Audio" defaultOpen>
            <Row label="Volume">
              <input type="range" min={0} max={2} step={0.05} value={volume} disabled={!isMedia} onChange={(e) => setProp({ volume: Number(e.target.value) })} style={{ flex: 1 }} />
              <NumBox value={Math.round(volume * 100)} suffix="%" />
            </Row>
            <Row label="Mute">
              <button className="btn" disabled={!isMedia} onClick={() => setProp({ volume: volume > 0 ? 0 : 1 })} style={{ height: 32 }}>{volume > 0 ? "Mute" : "Unmute"}</button>
            </Row>
            {!isMedia && <Empty text="Select a video or audio clip." />}
          </Accordion>
        )}

        {tab === "Effect" && (
          <>
            <Accordion title="Filter" defaultOpen>
              {hasVisualFilter ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                  {FILTERS.map((f) => (
                    <button key={f} className={`chip${filter === f ? " chip-static" : ""}`} onClick={() => setProp({ mediaFilter: f })} style={{ height: 28 }}>{f}</button>
                  ))}
                </div>
              ) : <Empty text="Filters apply to video / image clips." />}
            </Accordion>
            <Accordion title="Shadow" defaultOpen={isText}>
              {isText ? (
                <>
                  <Row label="Color">
                    <input type="color" value={/^#[0-9a-fA-F]{6}$/.test((props.shadowColor as string) ?? "") ? (props.shadowColor as string) : "#000000"} onChange={(e) => setProp({ shadowColor: e.target.value })} style={{ width: 38, height: 28, padding: 0, border: "1px solid var(--border)", borderRadius: 8, background: "transparent" }} />
                  </Row>
                  <Row label="Blur">
                    <input type="range" min={0} max={40} value={Number((props.shadowBlur as number) ?? 0)} onChange={(e) => setProp({ shadowBlur: Number(e.target.value) })} style={{ flex: 1 }} />
                    <NumBox value={Number((props.shadowBlur as number) ?? 0)} />
                  </Row>
                </>
              ) : <Empty text="Text shadow applies to text clips." />}
            </Accordion>
          </>
        )}

        {tab === "Animation" && (
          <Accordion title="Entrance" defaultOpen>
            {el ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                {ANIMS.map((a) => (
                  <button key={a} className={`chip${animName === a ? " chip-static" : ""}`} onClick={() => setAnim(a)} style={{ height: 28 }}>{a}</button>
                ))}
              </div>
            ) : <Empty text="Select a clip to add an entrance animation." />}
          </Accordion>
        )}
      </div>

      <div style={{ padding: "8px 16px", borderTop: "1px solid var(--border)", fontSize: 11, color: "var(--text-3)", display: "flex", justifyContent: "space-between" }}>
        <span>{el ? elType : "no selection"}</span>
        <span>{videoResolution.width}×{videoResolution.height}</span>
      </div>
    </aside>
  );
}
