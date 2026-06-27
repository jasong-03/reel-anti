import { randomUUID } from "node:crypto";
import type { ProjectJSON, TrackJSON, ElementJSON } from "@twick/timeline";

/**
 * Append a media element directly to the project JSON, server-side.
 *
 * Why not the `addMedia` op? Twick's TimelineEditor decodes media when adding an
 * element, which needs browser APIs and fails headless (ELEMENT_NOT_ADDED). The
 * browser UI uses the real `addMedia` op; the headless MCP executor (which has no
 * decoder) builds the equivalent ElementJSON here. The browser renders it on load.
 */

export interface MediaSpec {
  mediaType: "image" | "video" | "audio";
  src: string;
  start: number;
  end?: number;
  /** Friendly clip name shown on the timeline; defaults to the media type. */
  name?: string;
}

// audio → audio track; video → video track; image → ELEMENT track (the visualizer
// renders every element on a video track AS a video, which fails for images).
const trackTypeFor = (mediaType: MediaSpec["mediaType"]): string =>
  mediaType === "audio" ? "audio" : mediaType === "video" ? "video" : "element";

const overlaps = (track: TrackJSON, start: number, end: number): boolean =>
  (track.elements ?? []).some((e) => e.s < end && e.e > start);

export const appendMediaElement = (
  project: ProjectJSON,
  spec: MediaSpec
): { project: ProjectJSON; elementId: string; trackId: string } => {
  const next = structuredClone(project);
  next.tracks = next.tracks ?? [];
  const trackType = trackTypeFor(spec.mediaType);
  // Images have no natural duration; default a 4s clip. Audio/video without an
  // end fall back to a 5s placeholder until the browser resolves real duration.
  const end = spec.end ?? spec.start + (spec.mediaType === "image" ? 4 : 5);

  // For an image overlay, only reuse an ELEMENT track that sits AFTER the last
  // video track (so it renders on top); otherwise append a fresh "Overlay" track.
  let track: TrackJSON | undefined;
  if (spec.mediaType === "image") {
    let lastVideo = -1;
    next.tracks.forEach((t, i) => { if ((t.type ?? "element") === "video") lastVideo = i; });
    for (let i = next.tracks.length - 1; i > lastVideo; i--) {
      const t = next.tracks[i];
      if ((t.type ?? "element") === "element" && !overlaps(t, spec.start, end)) { track = t; break; }
    }
  } else {
    track = next.tracks.find((t) => (t.type ?? "element") === trackType && !overlaps(t, spec.start, end));
  }
  if (!track) {
    track = {
      id: `t-${randomUUID()}`,
      name: spec.mediaType === "image" ? "Overlay" : `${trackType.charAt(0).toUpperCase()}${trackType.slice(1)} Track`,
      type: trackType,
      elements: [],
    } as TrackJSON;
    next.tracks.push(track);
  }

  const id = `e-${randomUUID()}`;
  const element = {
    id,
    trackId: track.id,
    name: spec.name ?? spec.mediaType,
    type: spec.mediaType,
    s: spec.start,
    e: end,
    props: { src: spec.src },
  } as ElementJSON;
  track.elements = [...(track.elements ?? []), element];

  return { project: next, elementId: id, trackId: track.id };
};
