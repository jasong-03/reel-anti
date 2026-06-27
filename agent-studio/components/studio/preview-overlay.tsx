"use client";

import { useRef, useState } from "react";
import { useTimelineContext } from "@twick/timeline";
import { useLivePlayerContext } from "@twick/live-player";
import type { TrackElement } from "@twick/timeline";
import type { VideoProps } from "./use-player-data";

/**
 * Direct-manipulation layer over the (playback-only) LivePlayer: click an element
 * in the preview to select it, drag the body to move, and drag a corner to resize
 * — the way every video editor lets you place an overlay/logo. The preview renders
 * via the visualizer, so we map preview pixels ↔ Twick frame coordinates
 * (frame.x/y = offset from center in video px; frame.size = [w,h] in video px) and
 * commit on release (one undo entry, no per-pixel history).
 *
 * Both move and resize are detected in this overlay's pointer handler (which
 * reliably receives events); resize triggers when the press lands in a corner zone
 * of the current selection box. Timing stays on the timeline: an element is only
 * selectable/visible during its [start, end], so an overlay can show for just part
 * of the video.
 */

interface Frame { x?: number; y?: number; size?: [number, number]; rotation?: number }
type Mode = "move" | "resize";
interface DragState {
  mode: Mode; el: TrackElement; startX: number; startY: number;
  fx: number; fy: number; w: number; h: number; scale: number; cornerDist: number;
}

const CORNER_ZONE = 16; // px radius around a box corner that starts a resize

const frameOf = (el: TrackElement): Frame | null => {
  const f = (el as unknown as { getFrame?: () => Frame }).getFrame?.();
  return f && Array.isArray(f.size) ? f : null;
};

export default function PreviewOverlay({ videoProps }: { videoProps: VideoProps }) {
  const { editor, selectedItem, setSelectedItem, changeLog } = useTimelineContext();
  const { currentTime } = useLivePlayerContext();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<DragState | null>(null);
  const [live, setLive] = useState<{ ox: number; oy: number; k: number } | null>(null);

  void changeLog;
  const rect = ref.current?.getBoundingClientRect();
  const ow = rect?.width ?? 0;
  const oh = rect?.height ?? 0;
  const scale = ow > 0 ? ow / videoProps.width : 1;

  const isActive = (el: TrackElement) => el.getStart() <= currentTime && el.getEnd() >= currentTime;

  // Re-fetch the CURRENT live element by id (the captured instance can go stale
  // after re-renders) — same pattern Twick's Properties panel uses for setFrame.
  const liveById = (id: string): TrackElement | null => {
    for (const t of editor.getTimelineData()?.tracks ?? []) {
      const e = t.getElementById(id);
      if (e) return e as TrackElement;
    }
    return null;
  };

  const activeFramed = (): { el: TrackElement; f: Frame }[] => {
    const out: { el: TrackElement; f: Frame }[] = [];
    for (const t of editor.getTimelineData()?.tracks ?? []) {
      for (const el of t.getElements()) {
        const e = el as TrackElement;
        if (isActive(e)) { const f = frameOf(e); if (f) out.push({ el: e, f }); }
      }
    }
    return out;
  };

  const sel = selectedItem as TrackElement | null;
  const selFrame = sel && isActive(sel) ? frameOf(sel) : null;

  // box for the selected element in overlay-local px (with live drag feedback)
  const boxFor = (f: Frame, k = 1, ox = 0, oy = 0) => {
    const w = f.size![0] * scale * k;
    const h = f.size![1] * scale * k;
    const cx = ow / 2 + (f.x ?? 0) * scale + ox;
    const cy = oh / 2 + (f.y ?? 0) * scale + oy;
    return { cx, cy, w, h, left: cx - w / 2, top: cy - h / 2 };
  };

  const dragging = drag.current?.el.getId() === sel?.getId?.();
  const selBox = selFrame
    ? boxFor(
        selFrame,
        dragging && drag.current?.mode === "resize" && live ? live.k : 1,
        dragging && drag.current?.mode === "move" && live ? live.ox : 0,
        dragging && drag.current?.mode === "move" && live ? live.oy : 0,
      )
    : null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!rect || scale <= 0) return;
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // 1) resize if the press is in a corner zone of the current selection box
    if (sel && selFrame && selBox) {
      const corners = [
        [selBox.left, selBox.top], [selBox.left + selBox.w, selBox.top],
        [selBox.left, selBox.top + selBox.h], [selBox.left + selBox.w, selBox.top + selBox.h],
      ];
      if (corners.some(([cxp, cyp]) => Math.hypot(mx - cxp, my - cyp) <= CORNER_ZONE)) {
        drag.current = {
          mode: "resize", el: sel, startX: e.clientX, startY: e.clientY,
          fx: selFrame.x ?? 0, fy: selFrame.y ?? 0, w: selFrame.size![0], h: selFrame.size![1],
          scale, cornerDist: Math.hypot(selBox.w / 2, selBox.h / 2),
        };
        setLive({ ox: 0, oy: 0, k: 1 });
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    // 2) otherwise hit-test the topmost framed element for move/select
    const vx = (mx - ow / 2) / scale;
    const vy = (my - oh / 2) / scale;
    let hit: { el: TrackElement; f: Frame } | null = null;
    for (const item of activeFramed()) {
      if (Math.abs(vx - (item.f.x ?? 0)) <= item.f.size![0] / 2 && Math.abs(vy - (item.f.y ?? 0)) <= item.f.size![1] / 2) hit = item;
    }
    if (!hit) { setSelectedItem(null); return; }
    setSelectedItem(hit.el);
    drag.current = { mode: "move", el: hit.el, startX: e.clientX, startY: e.clientY, fx: hit.f.x ?? 0, fy: hit.f.y ?? 0, w: hit.f.size![0], h: hit.f.size![1], scale, cornerDist: 0 };
    setLive({ ox: 0, oy: 0, k: 1 });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !rect) return;
    if (d.mode === "move") {
      setLive({ ox: e.clientX - d.startX, oy: e.clientY - d.startY, k: 1 });
    } else {
      const cx = ow / 2 + d.fx * scale;
      const cy = oh / 2 + d.fy * scale;
      const k = Math.max(0.05, Math.hypot(e.clientX - rect.left - cx, e.clientY - rect.top - cy) / Math.max(1, d.cornerDist));
      setLive({ ox: 0, oy: 0, k });
    }
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d && live) {
      if (d.mode === "move") {
        // Skip a no-op commit on a plain click (no drag) so the selection isn't
        // cleared — otherwise the follow-up corner-resize has nothing selected.
        if (Math.abs(live.ox) > 2 || Math.abs(live.oy) > 2) {
          editor.updateElements([{ elementId: d.el.getId(), updates: { position: { x: d.fx + live.ox / d.scale, y: d.fy + live.oy / d.scale } } }]);
        }
      } else {
        const liveEl = liveById(d.el.getId());
        if (liveEl) {
          const fe = liveEl as unknown as { getFrame?: () => object; setFrame?: (f: object) => void };
          const fr = fe.getFrame?.() ?? {};
          fe.setFrame?.({ ...fr, size: [Math.max(8, Math.round(d.w * live.k)), Math.max(8, Math.round(d.h * live.k))] });
          editor.updateElement(liveEl);
        }
      }
    }
    drag.current = null;
    setLive(null);
  };

  const cursor = drag.current?.mode === "move" ? "grabbing" : "default";

  return (
    <div ref={ref} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      style={{ position: "absolute", inset: 0, touchAction: "none", cursor, zIndex: 5 }}>
      {selBox && (
        <>
          <div style={{
            position: "absolute", left: selBox.left, top: selBox.top, width: selBox.w, height: selBox.h,
            border: "1.5px solid var(--accent)", borderRadius: 2,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.45), 0 0 12px -2px var(--accent)", pointerEvents: "none",
          }} />
          {([["nwse", selBox.left, selBox.top], ["nesw", selBox.left + selBox.w, selBox.top], ["nesw", selBox.left, selBox.top + selBox.h], ["nwse", selBox.left + selBox.w, selBox.top + selBox.h]] as const).map(([cur, cxp, cyp], i) => (
            <span key={i} style={{ position: "absolute", left: cxp - 6, top: cyp - 6, width: 12, height: 12, background: "#fff", border: "1.5px solid var(--accent)", borderRadius: 3, cursor: `${cur}-resize`, pointerEvents: "none" }} />
          ))}
        </>
      )}
    </div>
  );
}
