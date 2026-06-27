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
}

const trackTypeFor = (mediaType: MediaSpec["mediaType"]): string =>
  mediaType === "audio" ? "audio" : "video";

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

  let track = next.tracks.find((t) => (t.type ?? "element") === trackType && !overlaps(t, spec.start, end));
  if (!track) {
    track = {
      id: `t-${randomUUID()}`,
      name: `${trackType.charAt(0).toUpperCase()}${trackType.slice(1)} Track`,
      type: trackType,
      elements: [],
    } as TrackJSON;
    next.tracks.push(track);
  }

  const id = `e-${randomUUID()}`;
  const element = {
    id,
    trackId: track.id,
    name: spec.mediaType,
    type: spec.mediaType,
    s: spec.start,
    e: end,
    props: { src: spec.src },
  } as ElementJSON;
  track.elements = [...(track.elements ?? []), element];

  return { project: next, elementId: id, trackId: track.id };
};
