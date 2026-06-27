import {
  TimelineEditor,
  Track,
  TrackElement,
  VideoElement,
  ImageElement,
  TRACK_TYPES,
} from "@twick/timeline";
import type { Op } from "../ops";

/**
 * Shared primitives for the per-domain apply modules. Deliberately NOT marked
 * `"use client"`: the TimelineEditor runs headless in Node too (see
 * `lib/twick/headless.ts`), so the MCP executor and the test harness can reuse
 * this exact code path. Browser-only concerns (media decoding) surface as
 * runtime failures the caller already handles as OpResult errors.
 */

export type Resolution = { width: number; height: number };

export interface OpResult {
  op: Op["op"];
  ok: boolean;
  /** Agent-readable: on success, what changed; on failure, how to fix it. */
  message: string;
  /** Element/track ids touched, for plan-preview, seek, and undo accounting. */
  affected?: string[];
}

/** Elements that carry a frame and accept frame effects (video, image). */
export type FramedElement = VideoElement | ImageElement;
export const isFramed = (el: TrackElement): el is FramedElement =>
  el.getType() === "video" || el.getType() === "image";

export const findElement = (
  editor: TimelineEditor,
  id: string
): { element: TrackElement; track: Track } | null => {
  const tracks = editor.getTimelineData()?.tracks ?? [];
  for (const track of tracks) {
    const element = track.getElementById(id);
    if (element) {
      // getElementById returns Readonly<TrackElement>; the underlying instance
      // is the live element the editor mutates, so the cast is safe here.
      const live = element as TrackElement;
      // Loaded-from-JSON elements may lack trackId; editor.removeElement/updateElement
      // resolve the track via getTrackId(), so stamp it from the track we found it on.
      if (!live.getTrackId()) live.setTrackId(track.getId());
      return { element: live, track };
    }
  }
  return null;
};

const collidesOnTrack = (track: Track, start: number, end: number): boolean =>
  track.getElements().some((e) => e.getStart() < end && e.getEnd() > start);

export const trackTypeFor = (elementType: string): string => {
  if (elementType === "video") return TRACK_TYPES.VIDEO;
  if (elementType === "audio") return TRACK_TYPES.AUDIO;
  // image (+ text/shapes) MUST go on an ELEMENT track: the visualizer's video-track
  // renderer treats every element as a video, so an image on a video track is loaded
  // as a video and fails (MEDIA_ERR_SRC_NOT_SUPPORTED). ELEMENT tracks render per type.
  return TRACK_TYPES.ELEMENT;
};

/**
 * Place an image/overlay element on an ELEMENT track that sits ABOVE all video
 * tracks, so it renders ON TOP (last track = front). Reuses a non-colliding
 * overlay track when one exists; otherwise appends a fresh "Overlay" track.
 */
export const addToOverlayTrack = async (
  editor: TimelineEditor,
  element: TrackElement,
  start: number,
  end: number | null
): Promise<string> => {
  const tracks = editor.getTimelineData()?.tracks ?? [];
  let lastVideo = -1;
  tracks.forEach((t, i) => { if (t.getType() === TRACK_TYPES.VIDEO) lastVideo = i; });

  for (let i = tracks.length - 1; i > lastVideo; i--) {
    const track = tracks[i];
    if (track.getType() !== TRACK_TYPES.ELEMENT) continue;
    if (end !== null && collidesOnTrack(track, start, end)) continue;
    try {
      if (await editor.addElementToTrack(track, element)) return track.getId();
    } catch {
      // try the next candidate
    }
  }

  const fresh = editor.addTrack("Overlay", TRACK_TYPES.ELEMENT);
  if (!(await editor.addElementToTrack(fresh, element))) {
    throw new Error("overlay element could not be added to a new track");
  }
  return fresh.getId();
};

/**
 * Add an element to a non-colliding track of the right type, creating a fresh
 * track if every existing one collides. Returns the track id it landed on.
 */
export const addToSuitableTrack = async (
  editor: TimelineEditor,
  element: TrackElement,
  elementType: string,
  start: number,
  end: number | null
): Promise<string> => {
  const trackType = trackTypeFor(elementType);
  const candidates = editor.getTracksByType(trackType);

  for (const track of candidates) {
    // When end is unknown (natural media duration), let addElementToTrack's
    // collision check be the source of truth instead of guessing.
    if (end !== null && collidesOnTrack(track, start, end)) continue;
    try {
      const ok = await editor.addElementToTrack(track, element);
      if (ok) return track.getId();
    } catch {
      // collision or validation failure on this track — try the next one
    }
  }

  const label = `${trackType.charAt(0).toUpperCase()}${trackType.slice(1)} Track`;
  const fresh = editor.addTrack(label, trackType);
  const ok = await editor.addElementToTrack(fresh, element);
  if (!ok) throw new Error("element could not be added to a new track");
  return fresh.getId();
};

/** Convenience constructors for the common OpResult shapes. */
export const ok = (op: Op["op"], message: string, affected?: string[]): OpResult => ({
  op,
  ok: true,
  message,
  ...(affected ? { affected } : {}),
});
export const fail = (op: Op["op"], message: string): OpResult => ({ op, ok: false, message });
