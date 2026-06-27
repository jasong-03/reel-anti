"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTimelineContext, TRACK_TYPES } from "@twick/timeline";
import type { TrackElement, TrackJSON, ElementJSON } from "@twick/timeline";
import { PLAYER_STATE, useLivePlayerContext } from "@twick/live-player";
import { Cursor, Undo, Redo, Scissors, SplitIcon, Trash, More, Magnet, Search, Plus, Minus, ChevronDown, Sparkles } from "./icons";

const RULER_H = 30;
const TRACK_H = 46;
const LABEL_W = 140;

const clipColor = (type: string): string => {
  if (type === "video" || type === "image") return "var(--track-video)";
  if (type === "audio") return "var(--track-audio)";
  if (type === "text" || type === "caption") return "var(--track-text)";
  return "var(--track-effect)";
};

const trackLabel = (track: TrackJSON, c: { n: number }): string => {
  const type = track.type ?? "element";
  if (type === "video") return `Video Track ${++c.n}`;
  if (type === "audio") return "Audio Track";
  if (type === "caption") return "Caption";
  const els = track.elements ?? [];
  if (els.some((e) => ["effect", "rect", "circle", "icon", "arrow", "line"].includes(e.type))) return "Effects Track";
  if (els.some((e) => e.type === "text" || e.type === "caption")) return "Text Track";
  return "Element Track";
};

const clipLabel = (el: ElementJSON): string => {
  const props = (el.props ?? {}) as Record<string, unknown>;
  const text = (el.t as string) ?? (props.text as string);
  if (typeof text === "string" && text.trim()) return text.trim();
  // Friendly media name (filename / sample / prompt) set when the clip was added.
  const name = (el.name ?? "").trim();
  if (name && name !== el.type) return name;
  // Fall back to the source filename — but NEVER a blob: URL (its path is a UUID).
  const src = props.src as string | undefined;
  if (src && !src.startsWith("blob:") && !src.startsWith("data:")) {
    const file = src.split("/").filter(Boolean).pop();
    if (file) return file;
  }
  return el.type;
};

const fmtTick = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Absolute [s,e] span a clip's frame effects (Ken-Burns zoom / keyframes) cover, if any. */
const frameEffectRange = (el: ElementJSON): { s: number; e: number } | null => {
  const fx = (el as { frameEffects?: { s?: number; e?: number }[] }).frameEffects;
  if (!Array.isArray(fx) || fx.length === 0) return null;
  let s = Infinity;
  let e = -Infinity;
  for (const f of fx) {
    if (typeof f.s === "number") s = Math.min(s, f.s);
    if (typeof f.e === "number") e = Math.max(e, f.e);
  }
  return Number.isFinite(s) && Number.isFinite(e) && e > s ? { s, e } : null;
};

type DragMode = "move" | "left" | "right";
interface DragState { id: string; mode: DragMode; startX: number; origS: number; origE: number; }

export default function TimelinePanel({ glowIds }: { glowIds: Set<string> }) {
  const { present, editor, selectedItem, setSelectedItem, canUndo, canRedo, changeLog } = useTimelineContext();
  const { currentTime, setCurrentTime, setSeekTime, setPlayerState } = useLivePlayerContext();
  const [pps, setPps] = useState(26);
  const [snap, setSnap] = useState(true);
  const [snapStep, setSnapStep] = useState(0.5);
  const [menu, setMenu] = useState<null | "add" | "snap" | "search">(null);
  const [search, setSearch] = useState("");
  const [drag, setDrag] = useState<DragState | null>(null);
  const [draft, setDraft] = useState<{ id: string; s: number; e: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const ppsRef = useRef(pps);
  ppsRef.current = pps;
  const didDrag = useRef(false);

  const project = present ?? editor.getProject();
  const tracks = (project?.tracks ?? []) as TrackJSON[];

  const duration = useMemo(() => {
    let d = 30;
    for (const t of tracks) for (const e of t.elements ?? []) d = Math.max(d, e.e ?? 0);
    return Math.ceil(d / 5) * 5;
  }, [tracks]);
  const contentW = duration * pps + 60;
  const ticks = useMemo(() => Array.from({ length: Math.floor(duration / 5) + 1 }, (_, i) => i * 5), [duration]);
  const selectedId = (selectedItem as { getId?: () => string } | null)?.getId?.();

  const snapVal = (t: number) => (snap ? Math.round(t / snapStep) * snapStep : Math.round(t * 100) / 100);

  const searchLc = search.trim().toLowerCase();
  const matches = (el: ElementJSON) => !searchLc || clipLabel(el).toLowerCase().includes(searchLc);

  const addTrackOfType = (label: string, type: string) => { editor.addTrack(label, type); setMenu(null); };
  const cutSelected = () => {
    const el = liveElement(selectedId ?? "");
    if (el) void editor.rippleDelete(el.getStart(), el.getEnd());
  };

  // drag lifecycle
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: PointerEvent) => {
      const dsec = (e.clientX - drag.startX) / ppsRef.current;
      didDrag.current = true;
      let s = drag.origS;
      let e2 = drag.origE;
      if (drag.mode === "move") { s = Math.max(0, drag.origS + dsec); e2 = s + (drag.origE - drag.origS); }
      else if (drag.mode === "left") { s = Math.min(Math.max(0, drag.origS + dsec), drag.origE - 0.2); }
      else { e2 = Math.max(drag.origS + 0.2, drag.origE + dsec); }
      setDraft({ id: drag.id, s: snapVal(s), e: snapVal(e2) });
    };
    const onUp = () => {
      if (draft && (draft.s !== drag.origS || draft.e !== drag.origE)) {
        editor.updateElements([{ elementId: drag.id, updates: { s: draft.s, e: draft.e } }]);
      }
      setDrag(null);
      setDraft(null);
      setTimeout(() => (didDrag.current = false), 0);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [drag, draft, editor, snap]);

  const seekFromEvent = (e: React.MouseEvent) => {
    if (didDrag.current) return;
    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) return;
    const t = Math.max(0, (e.clientX - rect.left) / pps);
    setPlayerState(PLAYER_STATE.PAUSED);
    setCurrentTime(t);
    setSeekTime(t);
  };

  const liveElement = (id: string): TrackElement | null => {
    for (const tr of editor.getTimelineData()?.tracks ?? []) {
      const el = tr.getElementById(id);
      if (el) return el as TrackElement;
    }
    return null;
  };

  const startDrag = (e: React.PointerEvent, el: ElementJSON, mode: DragMode) => {
    e.stopPropagation();
    setSelectedItem(liveElement(el.id));
    setDrag({ id: el.id, mode, startX: e.clientX, origS: el.s ?? 0, origE: el.e ?? 0 });
  };

  const deleteSelected = () => {
    const el = liveElement(selectedId ?? "");
    if (el) { editor.removeElement(el); setSelectedItem(null); }
  };
  const splitSelected = () => {
    const el = liveElement(selectedId ?? "");
    if (el) void editor.splitElement(el, currentTime);
  };

  const c = { n: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0, background: "rgba(5,8,16,0.55)", borderTop: "1px solid var(--border)" }}>
      {/* toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ position: "relative" }}>
          <button className="btn" style={{ height: 32, fontSize: 12.5 }} onClick={() => setMenu(menu === "add" ? null : "add")}>
            <Plus width={15} /> Add Track <ChevronDown width={13} />
          </button>
          {menu === "add" && (
            <Popover onClose={() => setMenu(null)}>
              <MenuItem label="Video track" onClick={() => addTrackOfType("Video Track", TRACK_TYPES.VIDEO)} />
              <MenuItem label="Audio track" onClick={() => addTrackOfType("Audio Track", TRACK_TYPES.AUDIO)} />
              <MenuItem label="Text / element" onClick={() => addTrackOfType("Element Track", TRACK_TYPES.ELEMENT)} />
              <MenuItem label="Caption track" onClick={() => addTrackOfType("Caption", TRACK_TYPES.CAPTION)} />
            </Popover>
          )}
        </div>
        <div style={{ width: 1, height: 22, background: "var(--border)" }} />
        <button className="icon-btn" aria-label="Deselect" onClick={() => setSelectedItem(null)}><Cursor width={17} /></button>
        <button className="icon-btn" aria-label="Undo" disabled={!canUndo} onClick={() => editor.undo()} style={{ opacity: canUndo ? 1 : 0.4 }}><Undo width={17} /></button>
        <button className="icon-btn" aria-label="Redo" disabled={!canRedo} onClick={() => editor.redo()} style={{ opacity: canRedo ? 1 : 0.4 }}><Redo width={17} /></button>
        <button className="icon-btn" aria-label="Ripple cut selected" title="Ripple-delete the selected clip" onClick={cutSelected}><Scissors width={17} /></button>
        <button className="icon-btn" aria-label="Split at playhead" title="Split the selected clip at the playhead" onClick={splitSelected}><SplitIcon width={17} /></button>
        <button className="icon-btn" aria-label="Delete" onClick={deleteSelected}><Trash width={17} /></button>
        <button className="icon-btn" aria-label="More"><More width={17} /></button>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          {menu === "search" ? (
            <input autoFocus className="field" placeholder="Find clip…" value={search} onChange={(e) => setSearch(e.target.value)} onBlur={() => !search && setMenu(null)} style={{ height: 30, width: 150, padding: "5px 10px", fontSize: 12.5 }} />
          ) : (
            <button className="icon-btn" aria-label="Search clips" onClick={() => setMenu("search")}><Search width={16} /></button>
          )}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <button className="btn" style={{ height: 30, fontSize: 12.5, gap: 6, color: snap ? "var(--accent-hover)" : "var(--text-2)" }} onClick={() => setSnap((s) => !s)} aria-pressed={snap}>
              <Magnet width={15} /> Snap {snap ? `${snapStep}s` : "off"}
            </button>
            <button className="icon-btn" aria-label="Snap step" onClick={() => setMenu(menu === "snap" ? null : "snap")} style={{ width: 24 }}><ChevronDown width={13} /></button>
            {menu === "snap" && (
              <Popover onClose={() => setMenu(null)} align="right">
                {[0.1, 0.5, 1].map((s) => <MenuItem key={s} label={`${s}s grid`} active={snapStep === s} onClick={() => { setSnapStep(s); setSnap(true); setMenu(null); }} />)}
              </Popover>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, width: 150 }}>
            <Minus width={15} color="var(--text-3)" />
            <input type="range" min={8} max={64} value={pps} onChange={(e) => setPps(Number(e.target.value))} style={{ flex: 1 }} aria-label="Zoom" />
            <Plus width={15} color="var(--text-3)" />
          </div>
        </div>
      </div>

      {/* tracks — scroll vertically when there are more tracks than fit */}
      <div style={{ display: "flex", flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden" }}>
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: "1px solid var(--border)", background: "rgba(5,8,16,0.5)" }}>
          <div style={{ height: RULER_H, borderBottom: "1px solid var(--border)" }} />
          {tracks.map((t) => (
            <div key={t.id} style={{ height: TRACK_H, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: "1px solid var(--border)", fontSize: 12, color: "var(--text-2)", fontWeight: 500 }}>
              <span className="dot" style={{ background: clipColor((t.elements?.[0]?.type) ?? t.type ?? "element") }} />
              {trackLabel(t, c)}
            </div>
          ))}
          {tracks.length === 0 && <div style={{ height: TRACK_H, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 12, color: "var(--text-3)" }}>No tracks</div>}
        </div>

        <div style={{ flex: 1, overflowX: "auto", overflowY: "hidden" }}>
          <div ref={contentRef} style={{ position: "relative", width: contentW, minWidth: "100%" }}>
            <div onClick={seekFromEvent} style={{ position: "relative", height: RULER_H, borderBottom: "1px solid var(--border)", cursor: "text" }}>
              {ticks.map((s) => (
                <div key={s} style={{ position: "absolute", left: s * pps, top: 0, height: "100%", display: "flex", alignItems: "center", paddingLeft: 5 }}>
                  <span style={{ width: 1, height: 8, background: "var(--border-strong)", position: "absolute", left: 0, bottom: 0 }} />
                  <span style={{ fontSize: 10.5, color: "var(--text-3)", fontVariantNumeric: "tabular-nums" }}>{fmtTick(s)}</span>
                </div>
              ))}
            </div>

            {tracks.map((t) => (
              <div key={t.id} onClick={seekFromEvent} style={{ position: "relative", height: TRACK_H, borderBottom: "1px solid var(--border)" }}>
                {(t.elements ?? []).map((el) => {
                  const d = draft && draft.id === el.id ? draft : null;
                  const s = d ? d.s : el.s ?? 0;
                  const e2 = d ? d.e : el.e ?? 0;
                  const left = s * pps;
                  const width = Math.max(26, (e2 - s) * pps);
                  const color = clipColor(el.type);
                  const isAudio = el.type === "audio";
                  return (
                    <div
                      key={el.id}
                      className={`clip${glowIds.has(el.id) ? " clip-glow" : ""}`}
                      data-selected={selectedId === el.id}
                      onPointerDown={(ev) => startDrag(ev, el, "move")}
                      onClick={(ev) => { ev.stopPropagation(); if (!didDrag.current) setSelectedItem(liveElement(el.id)); }}
                      style={{
                        left, width, cursor: "grab",
                        opacity: matches(el) ? 1 : 0.28,
                        background: isAudio
                          ? "linear-gradient(180deg, rgba(31,157,107,0.4), rgba(31,157,107,0.2))"
                          : `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 70%, #000))`,
                        borderColor: "rgba(255,255,255,0.12)",
                      }}
                      title={clipLabel(el)}
                    >
                      <span onPointerDown={(ev) => startDrag(ev, el, "left")} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 7, cursor: "ew-resize" }} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", pointerEvents: "none" }}>{clipLabel(el)}</span>
                      <span style={{ opacity: 0.7, fontSize: 10.5, marginLeft: "auto", fontVariantNumeric: "tabular-nums", flexShrink: 0, pointerEvents: "none" }}>
                        {Math.round(s * 10) / 10}s – {Math.round(e2 * 10) / 10}s
                      </span>
                      <span onPointerDown={(ev) => startDrag(ev, el, "right")} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 7, cursor: "ew-resize" }} />
                      {(() => {
                        const fx = frameEffectRange(el);
                        if (!fx) return null;
                        const fxLeft = Math.max(2, (fx.s - s) * pps);
                        const fxWidth = Math.max(8, (fx.e - fx.s) * pps);
                        const label = `Motion effect (zoom / keyframes): ${Math.round(fx.s * 10) / 10}s–${Math.round(fx.e * 10) / 10}s`;
                        return (
                          <>
                            {/* glowing bar marking exactly where the effect plays on the clip */}
                            <span title={label} style={{ position: "absolute", left: fxLeft, bottom: 2, width: fxWidth, height: 4, borderRadius: 3, background: "var(--accent)", boxShadow: "0 0 8px 1px color-mix(in srgb, var(--accent) 75%, transparent)", pointerEvents: "none" }} />
                            {/* sparkle badge so the clip reads as "has an effect" at a glance */}
                            <span title={label} style={{ position: "absolute", left: fxLeft - 1, top: 3, color: "var(--accent)", pointerEvents: "none", display: "grid", placeItems: "center" }}><Sparkles width={11} /></span>
                          </>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            ))}

            <div className="playhead" style={{ left: currentTime * pps, height: RULER_H + tracks.length * TRACK_H }} />
          </div>
        </div>
      </div>
      <span style={{ display: "none" }}>{changeLog}</span>
    </div>
  );
}

function Popover({ children, onClose, align = "left" }: { children: React.ReactNode; onClose: () => void; align?: "left" | "right" }) {
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
      <div style={{ position: "absolute", bottom: "calc(100% + 6px)", ...(align === "right" ? { right: 0 } : { left: 0 }), minWidth: 160, padding: 5, borderRadius: 10, background: "var(--panel-raised)", border: "1px solid var(--border)", boxShadow: "0 16px 40px -16px rgba(0,0,0,0.7)", zIndex: 41 }}>
        {children}
      </div>
    </>
  );
}

function MenuItem({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 7, border: "none", background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent-hover)" : "var(--text-1)", font: "inherit", fontSize: 12.5, cursor: "pointer" }}
      onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = "var(--surface-2)"; }}
      onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}>
      {label}
    </button>
  );
}
