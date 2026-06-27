import type { ProjectJSON, TrackJSON, ElementJSON } from "@twick/timeline";

/**
 * Compact, agent-facing view of the timeline.
 *
 * We deliberately do NOT hand the model raw ProjectJSON — it is verbose and the
 * model would waste tokens / hallucinate fields. Instead we expose stable ids,
 * a global clip index (so "the 3rd clip" resolves deterministically), times
 * rounded to ms, and a short human label per element.
 */

export interface AgentElementView {
  /** 1-based index across ALL tracks, in track order then start time. */
  index: number;
  id: string;
  type: string;
  trackId: string;
  trackType: string;
  start: number;
  end: number;
  /** Short human label: text content, or media filename, or the type. */
  label: string;
  /** Word-level timings for caption clips (ms from project start), if present. */
  words?: { word: string; startMs: number }[];
}

export interface AgentTrackView {
  id: string;
  type: string;
  name: string;
  elementIds: string[];
}

export interface AgentTimelineView {
  resolution: { width: number; height: number };
  duration: number;
  trackCount: number;
  elementCount: number;
  tracks: AgentTrackView[];
  elements: AgentElementView[];
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

const labelFor = (el: ElementJSON): string => {
  const props = (el.props ?? {}) as Record<string, unknown>;
  const text = (el.t as string | undefined) ?? (props.text as string | undefined);
  if (typeof text === "string" && text.trim()) {
    const trimmed = text.trim();
    return trimmed.length > 40 ? `${trimmed.slice(0, 40)}…` : trimmed;
  }
  const src = props.src as string | undefined;
  if (typeof src === "string" && src) {
    try {
      const url = new URL(src);
      const file = url.pathname.split("/").filter(Boolean).pop();
      if (file) return file;
    } catch {
      const file = src.split("/").filter(Boolean).pop();
      if (file) return file;
    }
    return src;
  }
  return el.type;
};

const elementStart = (el: ElementJSON): number =>
  typeof el.s === "number" ? el.s : 0;

/**
 * Extract word-level caption timings if Twick attached them (props.wordsMs or
 * metadata.wordsMs is a number[] of per-word start times in ms). Returned zipped
 * with the words so the agent can target individual fillers for removeSpan.
 */
const wordsFor = (el: ElementJSON): { word: string; startMs: number }[] | undefined => {
  const props = (el.props ?? {}) as Record<string, unknown>;
  const metadata = (el.metadata ?? {}) as Record<string, unknown>;
  const wordsMs = (props.wordsMs ?? metadata.wordsMs) as unknown;
  if (!Array.isArray(wordsMs) || wordsMs.length === 0) return undefined;

  const text = (el.t as string | undefined) ?? (props.text as string | undefined) ?? "";
  const tokens = text.split(/\s+/).filter(Boolean);
  return (wordsMs as number[]).map((startMs, i) => ({
    word: tokens[i] ?? "",
    // Whole-ms: sub-ms precision is noise the model never needs and costs tokens.
    startMs: Math.round(startMs),
  }));
};

/**
 * Build the compact view the agent reads. Accepts a ProjectJSON (e.g. from
 * `editor.getProject()` on the client, or the timelineJSON posted to the route).
 */
export const serializeForAgent = (
  project: ProjectJSON,
  resolution: { width: number; height: number }
): AgentTimelineView => {
  const tracks: AgentTrackView[] = [];
  const elements: AgentElementView[] = [];
  let duration = 0;
  let index = 1;

  for (const track of (project.tracks ?? []) as TrackJSON[]) {
    const trackType = track.type ?? "element";
    const sorted = [...(track.elements ?? [])].sort(
      (a, b) => elementStart(a) - elementStart(b)
    );
    const elementIds: string[] = [];

    for (const el of sorted) {
      const start = round(elementStart(el));
      const end = round(typeof el.e === "number" ? el.e : start);
      duration = Math.max(duration, end);
      elementIds.push(el.id);
      const words = wordsFor(el);
      elements.push({
        index: index++,
        id: el.id,
        type: el.type,
        trackId: track.id,
        trackType,
        start,
        end,
        label: labelFor(el),
        ...(words ? { words } : {}),
      });
    }

    tracks.push({
      id: track.id,
      type: trackType,
      name: track.name,
      elementIds,
    });
  }

  return {
    resolution,
    duration: round(duration),
    trackCount: tracks.length,
    elementCount: elements.length,
    tracks,
    elements,
  };
};
