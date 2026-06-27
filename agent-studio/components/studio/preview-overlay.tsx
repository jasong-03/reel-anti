"use client";

import { useRef, useState } from "react";
import { useTimelineContext } from "@twick/timeline";
import { useLivePlayerContext } from "@twick/live-player";
import type { TrackElement } from "@twick/timeline";
import type { VideoProps } from "./use-player-data";

/**
 * Direct-manipulation layer over the (playback-only) LivePlayer: click an element
 * in the preview to select it and drag to reposition — the way every video editor
 * lets you place an overlay/logo. The preview renders via the visualizer, so we
 * map between preview pixels and Twick's frame coordinates (frame.x/y = offset
 * from center, in video pixels) and commit the new position on release.
 *
 * Timing stays on the timeline: an element only shows (and is draggable) during
 * its [start, end] range, so an image can appear for just part of the video.
 */

interface Frame { x?: number; y?: number; size?: [number, number]; rotation?: number }

const frameOf = (el: TrackElement): Frame | null => {
  const f = (el as unknown as { getFrame?: () => Frame }).getFrame?.();
  return f && Array.isArray(f.size) ? f : null;
};

export default function PreviewOverlay({ videoProps }: { videoProps: VideoProps }) {
  const { editor, selectedItem, setSelectedItem, changeLog } = useTimelineContext();
  const { currentTime } = useLivePlayerContext();
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; startX: number; startY: number; fx: number; fy: number; scale: number } | null>(null);
  const [offset, setOffset] = useState<{ x: number; y: number } | null>(null);

  // changeLog/currentTime/selectedItem are read so this re-renders when they change.
  void changeLog;
  const rect = ref.current?.getBoundingClientRect();
  const ow = rect?.width ?? 0;
  const oh = rect?.height ?? 0;
  const scale = ow > 0 ? ow / videoProps.width : 1;

  const activeFramed = (): { el: TrackElement; f: Frame }[] => {
    const out: { el: TrackElement; f: Frame }[] = [];
    for (const t of editor.getTimelineData()?.tracks ?? []) {
      for (const el of t.getElements()) {
        if (el.getStart() <= currentTime && el.getEnd() >= currentTime) {
          const f = frameOf(el as TrackElement);
          if (f) out.push({ el: el as TrackElement, f });
        }
      }
    }
    return out; // track order → later entries render on top
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!rect || scale <= 0) return;
    const vx = (e.clientX - rect.left - ow / 2) / scale;
    const vy = (e.clientY - rect.top - oh / 2) / scale;
    let hit: { el: TrackElement; f: Frame } | null = null;
    for (const item of activeFramed()) {
      const fx = item.f.x ?? 0;
      const fy = item.f.y ?? 0;
      const hw = item.f.size![0] / 2;
      const hh = item.f.size![1] / 2;
      if (Math.abs(vx - fx) <= hw && Math.abs(vy - fy) <= hh) hit = item; // keep topmost
    }
    if (!hit) { setSelectedItem(null); return; }
    setSelectedItem(hit.el);
    drag.current = { id: hit.el.getId(), startX: e.clientX, startY: e.clientY, fx: hit.f.x ?? 0, fy: hit.f.y ?? 0, scale };
    setOffset({ x: 0, y: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: e.clientX - drag.current.startX, y: e.clientY - drag.current.startY });
  };

  const onPointerUp = () => {
    const d = drag.current;
    if (d && offset) {
      // Commit once on release → a single, clean undo entry (no per-pixel history).
      const x = d.fx + offset.x / d.scale;
      const y = d.fy + offset.y / d.scale;
      editor.updateElements([{ elementId: d.id, updates: { position: { x, y } } }]);
    }
    drag.current = null;
    setOffset(null);
  };

  // Selection box for the currently-selected, currently-visible element.
  const sel = selectedItem as TrackElement | null;
  const selFrame = sel ? frameOf(sel) : null;
  const dragging = drag.current?.id === sel?.getId?.();
  let box: { left: number; top: number; w: number; h: number } | null = null;
  if (sel && selFrame && sel.getStart() <= currentTime && sel.getEnd() >= currentTime) {
    const fw = selFrame.size![0] * scale;
    const fh = selFrame.size![1] * scale;
    const cx = ow / 2 + (selFrame.x ?? 0) * scale + (dragging && offset ? offset.x : 0);
    const cy = oh / 2 + (selFrame.y ?? 0) * scale + (dragging && offset ? offset.y : 0);
    box = { left: cx - fw / 2, top: cy - fh / 2, w: fw, h: fh };
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{ position: "absolute", inset: 0, touchAction: "none", cursor: dragging ? "grabbing" : "default", zIndex: 5 }}
    >
      {box && (
        <div
          style={{
            position: "absolute",
            left: box.left,
            top: box.top,
            width: box.w,
            height: box.h,
            border: "1.5px solid var(--accent)",
            borderRadius: 2,
            boxShadow: "0 0 0 1px rgba(0,0,0,0.45), 0 0 12px -2px var(--accent)",
            cursor: dragging ? "grabbing" : "grab",
            pointerEvents: "none",
          }}
        >
          {/* corner ticks for a "selected" affordance */}
          {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sy], i) => (
            <span key={i} style={{ position: "absolute", width: 7, height: 7, background: "var(--accent)", borderRadius: 2, left: sx < 0 ? -4 : undefined, right: sx > 0 ? -4 : undefined, top: sy < 0 ? -4 : undefined, bottom: sy > 0 ? -4 : undefined }} />
          ))}
        </div>
      )}
    </div>
  );
}
