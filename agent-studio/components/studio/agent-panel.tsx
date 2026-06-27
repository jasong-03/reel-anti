"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTimelineContext } from "@twick/timeline";
import { useLivePlayerContext } from "@twick/live-player";
import type { ProjectJSON, TrackElement } from "@twick/timeline";
import { applyOps, type OpResult } from "@/lib/twick/apply-op";
import type { Op } from "@/lib/twick/ops";
import { useMediaLibrary } from "./media-library";
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
  /** Preview of an image this turn generated (data URL), shown inline in chat. */
  imageUrl?: string;
  /** Friendly name for the generated image (used when adding it to the timeline). */
  imageName?: string;
}

const SUGGESTIONS = ["Smooth zoom", "Blur background", "Add transition", "Add captions"];

// The agent edits the timeline; it cannot invent media. A request to CREATE a new
// image/logo/illustration is routed to the real generator instead, so the model
// can't fall back to a made-up icon URL. Edit verbs keep the request on the agent.
const VISUAL_NOUN = /\b(image|picture|photo|logo|icon|mascot|illustration|art(?:work)?|graphic|background|thumbnail|drawing|painting|portrait|poster|banner|sticker|avatar|wallpaper|scene|render)\b/i;
const GEN_VERB = /\b(generate|create|make|draw|render|design|produce|paint|imagine|give me)\b/i;
const EDIT_VERB = /\b(trim|split|delete|remove|cut|move|shorten|extend|zoom|caption|subtitle|transition|mute|fade|replace|reorder|rearrange|speed)\b/i;
const isImageGenRequest = (m: string): boolean => {
  if (EDIT_VERB.test(m)) return false;
  // "generate/create … <visual>", or a bare visual description like "a blue robot logo".
  return (GEN_VERB.test(m) && VISUAL_NOUN.test(m)) || (/^(a|an|the)\s/i.test(m.trim()) && VISUAL_NOUN.test(m));
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const { editor, videoResolution, setSelectedItem } = useTimelineContext();
  const { currentTime } = useLivePlayerContext();
  const { addAsset } = useMediaLibrary();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const idRef = useRef(0);
  const recogRef = useRef<unknown>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const scrollDown = useCallback(() => {
    requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }));
  }, []);
  const push = useCallback((t: Omit<Turn, "id">): number => {
    const id = idRef.current++;
    setTurns((p) => [...p, { ...t, id }]);
    scrollDown();
    return id;
  }, [scrollDown]);
  const updateTurn = useCallback((id: number, patch: Partial<Turn>) => {
    setTurns((p) => p.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    scrollDown();
  }, [scrollDown]);

  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, []);

  // Generate a real AI image from the prompt and place it on the timeline, with a
  // live status message in the chat — this is what the user means by "make me a …".
  const generateImageInChat = useCallback(async (prompt: string) => {
    const id = push({ role: "ai", text: `Generating image: “${prompt}” …` });
    try {
      const res = await fetch("/api/media/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "image", prompt }),
      });
      const data = (await res.json()) as { job?: { id: string; status: string; resultUrls?: string[]; error?: string }; error?: string };
      if (!res.ok || !data.job) throw new Error(data.error ?? `generation returned ${res.status}`);
      let job = data.job;
      for (let i = 0; i < 30 && job.status === "pending"; i++) {
        await sleep(2500);
        const r = await fetch(`/api/media/job/${job.id}`);
        const d = (await r.json()) as { job?: typeof job };
        if (d.job) job = d.job;
      }
      const src = job.resultUrls?.[0];
      if (job.status !== "done" || !src) throw new Error(job.error ?? "generation did not finish");
      const name = prompt.slice(0, 60);
      // Saved to the library; placement is on the user's click (so they control it).
      addAsset({ name, src, type: "image", origin: "generated" });
      updateTurn(id, {
        text: `Here's your image (saved to Assets → Your media). Add it to the timeline, then select it to resize & move it like a logo.`,
        imageUrl: src,
        imageName: name,
      });
    } catch (err) {
      updateTurn(id, { role: "error", text: `Image generation failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  }, [push, updateTurn, addAsset]);

  // Place a generated image on the timeline at the playhead and select it, so the
  // Properties panel (Scale / Position) is immediately ready to make it a logo.
  const addImageToTimeline = useCallback(async (turnId: number, src: string, name?: string) => {
    const at = Math.round(currentTime * 10) / 10;
    // Default the overlay to span the whole video (so it's a clear, full-width clip);
    // the user then trims its edges or splits it to control when the logo shows.
    let projEnd = 0;
    for (const t of editor.getProject().tracks) for (const e of t.elements ?? []) projEnd = Math.max(projEnd, e.e ?? 0);
    const end = Math.max(at + 4, projEnd);
    const results = await applyOps(editor, [{ op: "addMedia", mediaType: "image", src, start: at, end, ...(name ? { name } : {}) }], videoResolution);
    const newId = results.flatMap((r) => r.affected ?? []).find((id) => id.startsWith("e-"));
    if (newId) {
      for (const tr of editor.getTimelineData()?.tracks ?? []) {
        const live = tr.getElementById(newId);
        // getElementById types the result Readonly; the runtime value is the live
        // mutable element the editor selects, so the cast is safe.
        if (live) { setSelectedItem(live as TrackElement); break; }
      }
    }
    onApplied?.({ affectedIds: results.flatMap((r) => r.affected ?? []), seekTo: at });
    setTurns((p) => p.map((t) => (t.id === turnId ? { ...t, applied: true } : t)));
  }, [editor, videoResolution, currentTime, onApplied, setSelectedItem]);

  const send = useCallback(async (override?: string) => {
    const message = (override ?? input).trim();
    if (!message || busy) return;
    setInput("");
    requestAnimationFrame(autoGrow);
    setBusy(true);
    push({ role: "user", text: message });
    try {
      // Route "create me an image/logo/…" to the generator (the agent can't make media).
      if (isImageGenRequest(message)) {
        await generateImageInChat(message);
        return;
      }
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
  }, [input, busy, editor, videoResolution, push, autoGrow, generateImageInChat]);

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

  // Attach: import local files to the timeline at the playhead.
  const attach = useCallback(() => {
    const fi = document.createElement("input");
    fi.type = "file";
    fi.accept = "video/*,image/*,audio/*";
    fi.multiple = true;
    fi.onchange = async () => {
      const files = Array.from(fi.files ?? []);
      const ops: Op[] = files.map((f) => {
        const url = URL.createObjectURL(f);
        const kind = f.type.startsWith("video") ? "video" : f.type.startsWith("audio") ? "audio" : "image";
        addAsset({ name: f.name, src: url, type: kind, origin: "upload" });
        return kind === "image"
          ? { op: "addMedia", mediaType: "image", src: url, start: currentTime, end: currentTime + 4, name: f.name }
          : { op: "addMedia", mediaType: kind, src: url, start: currentTime, name: f.name };
      });
      if (!ops.length) return;
      const results = await applyOps(editor, ops, videoResolution);
      onApplied?.({ affectedIds: results.flatMap((r) => r.affected ?? []), seekTo: currentTime });
      push({ role: "ai", text: `Imported ${files.length} file(s) to the timeline.` });
    };
    fi.click();
  }, [editor, videoResolution, currentTime, onApplied, push, addAsset]);

  // Voice: Web Speech API → fill the prompt.
  const toggleVoice = useCallback(() => {
    type SpeechRec = {
      lang: string; interimResults: boolean; continuous: boolean;
      start: () => void; stop: () => void;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onend: (() => void) | null; onerror: (() => void) | null;
    };
    const w = window as unknown as { SpeechRecognition?: new () => SpeechRec; webkitSpeechRecognition?: new () => SpeechRec };
    const SR = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!SR) { push({ role: "error", text: "Voice input is not supported in this browser." }); return; }
    if (listening) { (recogRef.current as SpeechRec | null)?.stop(); setListening(false); return; }
    const rec = new SR();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      const text = Array.from(e.results).map((r) => r[0].transcript).join("");
      setInput(text);
      requestAnimationFrame(autoGrow);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recogRef.current = rec;
    rec.start();
    setListening(true);
  }, [listening, push, autoGrow]);

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
        {turns.map((t) => (
          <TurnView
            key={t.id}
            turn={t}
            onAdd={() => addToTimeline(t.id)}
            onRevert={() => revert(t.id)}
            onAddImage={() => t.imageUrl && void addImageToTimeline(t.id, t.imageUrl, t.imageName)}
          />
        ))}
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
          <button className="icon-btn" aria-label="Attach media" onClick={attach} style={{ width: 32, height: 32 }}><Paperclip width={17} /></button>
          <button className="icon-btn" aria-label="Voice input" onClick={toggleVoice} style={{ width: 32, height: 32, color: listening ? "var(--danger)" : undefined, background: listening ? "rgba(244,98,106,0.12)" : undefined }}><Mic width={17} /></button>
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

function TurnView({ turn, onAdd, onRevert, onAddImage }: { turn: Turn; onAdd: () => void; onRevert: () => void; onAddImage: () => void }) {
  const reveal = useReveal(turn.text, turn.role === "ai");

  if (turn.role === "user") return <div className="msg-user fade-in">{turn.text}</div>;
  if (turn.role === "error") return <div className="msg-error fade-in">⚠ {turn.text}</div>;

  const ops = turn.plan?.ops ?? [];
  return (
    <div className="msg-ai fade-in">
      <div style={{ marginBottom: ops.length || turn.imageUrl ? 10 : 0 }}>{reveal}</div>

      {turn.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={turn.imageUrl}
          alt="Generated image"
          style={{ width: "100%", maxHeight: 220, objectFit: "cover", borderRadius: 10, border: "1px solid var(--border)", marginBottom: 10, display: "block" }}
        />
      )}

      {turn.imageUrl && !turn.applied && (
        <button className="btn" onClick={onAddImage} style={{ height: 34, width: "100%", justifyContent: "center", borderColor: "rgba(14,165,255,0.4)", color: "var(--accent-hover)" }}>
          <Check width={16} /> Add to timeline
        </button>
      )}
      {turn.imageUrl && turn.applied && (
        <div style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--success)", fontSize: 12.5, fontWeight: 500 }}>
          <Check width={15} /> Added — select it on the timeline, then use Properties → Scale &amp; Position.
        </div>
      )}

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

      {ops.length > 0 && (
        <details style={{ marginBottom: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 11.5, color: "var(--text-3)", userSelect: "none", listStyle: "none" }}>
            ⌄ Debug: {ops.length} op{ops.length > 1 ? "s" : ""} emitted
          </summary>
          <pre style={{ margin: "8px 0 0", padding: 10, borderRadius: 8, background: "var(--bg-0)", border: "1px solid var(--border)", fontSize: 11, lineHeight: 1.5, color: "var(--text-2)", overflowX: "auto", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {JSON.stringify(ops, null, 2)}
          </pre>
        </details>
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
