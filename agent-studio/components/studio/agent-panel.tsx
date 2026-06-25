"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTimelineContext } from "@twick/timeline";
import type { ProjectJSON } from "@twick/timeline";
import { applyOps, type OpResult } from "@/lib/twick/apply-op";
import type { Op } from "@/lib/twick/ops";
import {
  Sparkles,
  Send,
  Paperclip,
  Mic,
  Check,
  Undo,
  TypeIcon,
  Effects,
  Shapes,
  Music,
  Scissors,
} from "./icons";

export interface AppliedInfo {
  affectedIds: string[];
  seekTo?: number;
}

interface Plan {
  reasoning: string;
  ops: Op[];
}

interface Turn {
  id: number;
  role: "user" | "ai" | "error";
  text: string;
  plan?: Plan;
  applied?: boolean;
  results?: OpResult[];
  snapshot?: ProjectJSON;
  reverted?: boolean;
}

const SUGGESTIONS = ["Smooth zoom", "Blur background", "Add transition", "Add captions"];

const chipFor = (op: Op): { label: string; sub?: string; Icon: typeof TypeIcon } => {
  const range = (a?: number, b?: number) =>
    a !== undefined && b !== undefined ? `${a}s – ${b}s` : a !== undefined ? `${a}s` : undefined;
  switch (op.op) {
    case "addText": return { label: "Title", sub: `"${op.text}"`, Icon: TypeIcon };
    case "addCaption": return { label: "Caption", sub: range(op.start, op.end), Icon: TypeIcon };
    case "addMedia": return { label: op.mediaType, sub: "media", Icon: Shapes };
    case "addShape": return { label: op.shape, sub: range(op.start, op.end), Icon: Shapes };
    case "addZoom": return { label: "Cinematic Zoom", sub: range(op.start, op.end) ?? `→${op.toScale}×`, Icon: Effects };
    case "trim": return { label: "Trim", sub: range(op.start, op.end), Icon: Scissors };
    case "move": return { label: "Move", sub: range(op.start), Icon: Scissors };
    case "split": return { label: "Split", sub: `${op.time}s`, Icon: Scissors };
    case "remove": return { label: "Delete", sub: op.elementId, Icon: Scissors };
    case "removeSpan": return { label: "Cut", sub: range(op.start, op.end), Icon: Scissors };
    default: return { label: "Edit", Icon: Effects };
  }
};

const opSeek = (ops: Op[]): number | undefined => {
  for (const op of ops) {
    if ("start" in op && typeof op.start === "number") return op.start;
    if (op.op === "split") return op.time;
  }
  return undefined;
};

/** Token-ish reveal of AI reasoning (respects reduced motion via instant fill). */
function useReveal(text: string, on: boolean): string {
  const [shown, setShown] = useState(on ? "" : text);
  useEffect(() => {
    if (!on) { setShown(text); return; }
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setShown(text); return; }
    setShown("");
    let i = 0;
    const id = setInterval(() => {
      i += 2;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(id);
    }, 16);
    return () => clearInterval(id);
  }, [text, on]);
  return shown;
}

export default function AgentPanel({ onApplied }: { onApplied?: (info: AppliedInfo) => void }) {
  const { editor, videoResolution } = useTimelineContext();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, []);
  const push = useCallback((t: Omit<Turn, "id">) => {
    setTurns((p) => [...p, { ...t, id: idRef.current++ }]);
    scrollDown();
  }, [scrollDown]);

  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  const send = useCallback(async (override?: string) => {
    const message = (override ?? input).trim();
    if (!message || busy) return;
    setInput("");
    requestAnimationFrame(autoGrow);
    setBusy(true);
    push({ role: "user", text: message });
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timelineJSON: editor.getProject(), message, resolution: videoResolution }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? `agent returned ${res.status}`);
      }
      const data = (await res.json()) as Plan;
      push({ role: "ai", text: data.reasoning || "Done.", plan: { reasoning: data.reasoning, ops: data.ops } });
    } catch (err) {
      push({ role: "error", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }, [input, busy, editor, videoResolution, push, autoGrow]);

  const addToTimeline = useCallback(async (turnId: number) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn?.plan || turn.applied) return;
    const snapshot = editor.getProject();
    const results = await applyOps(editor, turn.plan.ops, videoResolution);
    const affectedIds = results.flatMap((r) => r.affected ?? []);
    setTurns((p) => p.map((t) => (t.id === turnId ? { ...t, applied: true, results, snapshot } : t)));
    onApplied?.({ affectedIds, seekTo: opSeek(turn.plan.ops) });
    scrollDown();
  }, [turns, editor, videoResolution, onApplied, scrollDown]);

  const revert = useCallback((turnId: number) => {
    const turn = turns.find((t) => t.id === turnId);
    if (!turn?.snapshot || turn.reverted) return;
    editor.loadProjectSnapshot(turn.snapshot);
    setTurns((p) => p.map((t) => (t.id === turnId ? { ...t, reverted: true } : t)));
  }, [turns, editor]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* header */}
      <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Sparkles width={18} color="var(--accent-hover)" />
          <span style={{ fontSize: 15, fontWeight: 700 }}>AI Agent</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--text-3)", marginTop: 3 }}>Create and edit videos using natural language</div>
      </div>

      {/* thread */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: 14, display: "flex", flexDirection: "column", gap: 14 }}>
        {turns.length === 0 && (
          <div style={{ color: "var(--text-3)", fontSize: 13, lineHeight: 1.6, padding: "4px 2px" }}>
            Ask me to edit your video. e.g.{" "}
            <span style={{ color: "var(--text-2)" }}>“Add a cinematic zoom from 5s to 8s”</span>
          </div>
        )}
        {turns.map((t) => <TurnView key={t.id} turn={t} onAdd={() => addToTimeline(t.id)} onRevert={() => revert(t.id)} />)}
        {busy && (
          <div className="msg-ai fade-in" style={{ display: "flex", alignItems: "center", gap: 7 }}>
            <span className="thinking-dot" /> <span style={{ color: "var(--text-2)" }}>Thinking…</span>
          </div>
        )}
      </div>

      {/* composer */}
      <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
        <div style={{ position: "relative", display: "flex", alignItems: "flex-end", gap: 8, background: "var(--bg-0)", border: "1px solid var(--border)", borderRadius: 14, padding: 8 }}>
          <textarea
            ref={taRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); autoGrow(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
            placeholder="Describe an edit…"
            rows={1}
            disabled={busy}
            style={{ flex: 1, resize: "none", background: "transparent", border: "none", outline: "none", color: "var(--text-1)", font: "inherit", fontSize: 13.5, lineHeight: 1.5, maxHeight: 160, padding: "4px 4px" }}
          />
          <button className="icon-btn" aria-label="Attach" style={{ width: 32, height: 32 }}><Paperclip width={17} /></button>
          <button className="icon-btn" aria-label="Voice input" style={{ width: 32, height: 32 }}><Mic width={17} /></button>
          <button
            aria-label="Send"
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            className="btn-primary"
            style={{ width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center", border: "none", cursor: "pointer", opacity: busy || !input.trim() ? 0.5 : 1 }}
          >
            <Send width={16} />
          </button>
        </div>
        <div style={{ display: "flex", gap: 7, marginTop: 10, flexWrap: "wrap" }}>
          {SUGGESTIONS.map((s) => (
            <button key={s} className="chip" onClick={() => void send(s)} disabled={busy}>{s}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TurnView({ turn, onAdd, onRevert }: { turn: Turn; onAdd: () => void; onRevert: () => void }) {
  const reveal = useReveal(turn.text, turn.role === "ai");

  if (turn.role === "user") return <div className="msg-user fade-in">{turn.text}</div>;
  if (turn.role === "error") return <div className="msg-error fade-in">⚠ {turn.text}</div>;

  const ops = turn.plan?.ops ?? [];
  return (
    <div className="msg-ai fade-in">
      <div style={{ marginBottom: ops.length ? 10 : 0 }}>{reveal}</div>

      {ops.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 12 }}>
          {ops.map((op, i) => {
            const { label, sub, Icon } = chipFor(op);
            return (
              <span key={i} className="chip chip-static" style={{ height: 26 }}>
                <Icon width={13} /> {label}{sub ? <span style={{ opacity: 0.7, marginLeft: 4 }}>{sub}</span> : null}
              </span>
            );
          })}
        </div>
      )}

      {ops.length > 0 && !turn.applied && (
        <button className="btn" onClick={onAdd} style={{ height: 34, width: "100%", justifyContent: "center", borderColor: "rgba(14,165,255,0.4)", color: "var(--accent-hover)" }}>
          <Check width={16} /> Add to timeline
        </button>
      )}

      {turn.applied && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--success)", fontSize: 13, fontWeight: 500 }}>
            <Check width={16} /> Added to timeline
          </div>
          {turn.results && turn.results.some((r) => !r.ok) && (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 3, fontSize: 12 }}>
              {turn.results.filter((r) => !r.ok).map((r, i) => (
                <li key={i} style={{ color: "var(--danger)" }}>✗ {r.op} — {r.message}</li>
              ))}
            </ul>
          )}
          <button
            className="btn btn-ghost"
            onClick={onRevert}
            disabled={turn.reverted}
            style={{ height: 30, alignSelf: "flex-start", fontSize: 12.5, color: "var(--text-2)", opacity: turn.reverted ? 0.5 : 1 }}
          >
            <Undo width={14} /> {turn.reverted ? "Reverted" : "Undo this change"}
          </button>
        </div>
      )}
    </div>
  );
}
