/**
 * Shared test harness: a real @twick/timeline editor running headless in Node,
 * plus a timeline "health" (no-corruption) check. Used by both the offline
 * fixture tests (no key) and the live gate suite (needs a key), so the apply and
 * corruption logic is verified deterministically even though the LLM call isn't.
 *
 * NOTE: media ops (addMedia/addZoom on real URLs) need browser media APIs and
 * cannot run here — the Node gates exercise text/caption/shape/cut ops, which is
 * where timeline-corruption risk actually lives. Media is exercised in the UI.
 */
import { TimelineEditor } from "@twick/timeline";
import type { ProjectJSON } from "@twick/timeline";

type EditorContext = ConstructorParameters<typeof TimelineEditor>[0];

export const makeNodeEditor = (seed?: ProjectJSON): TimelineEditor => {
  let history: ProjectJSON[] = [];
  let cursor = -1;
  const ctx: EditorContext = {
    contextId: `node-${Math.round(performance.now())}-${history.length}`,
    setTotalDuration: () => {},
    setPresent: (data: ProjectJSON) => {
      history = history.slice(0, cursor + 1);
      history.push(structuredClone(data));
      cursor = history.length - 1;
    },
    handleUndo: () => (cursor > 0 ? structuredClone(history[(cursor -= 1)]) : null),
    handleRedo: () =>
      cursor < history.length - 1 ? structuredClone(history[(cursor += 1)]) : null,
    handleResetHistory: () => {
      history = [];
      cursor = -1;
    },
    updateChangeLog: () => {},
    setTimelineAction: () => {},
  };
  const editor = new TimelineEditor(ctx);
  if (seed) editor.loadProject(seed);
  return editor;
};

export interface HealthResult {
  ok: boolean;
  issues: string[];
}

/**
 * A timeline is "corrupted" if any of these hold. This is the Phase 3 gate's
 * pass/fail signal for "zero corrupted timelines".
 */
export const healthCheck = (project: ProjectJSON): HealthResult => {
  const issues: string[] = [];
  const seenIds = new Set<string>();
  const trackIds = new Set(project.tracks.map((t) => t.id));

  for (const track of project.tracks) {
    if (!track.id) issues.push("track missing id");
    for (const el of track.elements) {
      if (!el.id) issues.push("element missing id");
      if (seenIds.has(el.id)) issues.push(`duplicate element id ${el.id}`);
      seenIds.add(el.id);
      if (typeof el.s !== "number" || typeof el.e !== "number" || el.e <= el.s) {
        issues.push(`element ${el.id} has invalid time range [${el.s}, ${el.e}]`);
      }
      const tid = (el as { trackId?: string }).trackId;
      if (tid && !trackIds.has(tid)) issues.push(`element ${el.id} references missing track ${tid}`);
    }
    // Within a single track, Twick forbids overlap — overlap signals corruption.
    const sorted = [...track.elements].sort((a, b) => a.s - b.s);
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].s < sorted[i - 1].e) {
        issues.push(`overlap on track ${track.id}: ${sorted[i - 1].id} & ${sorted[i].id}`);
      }
    }
  }

  // Must survive a JSON round-trip (no cycles / non-serializable values).
  try {
    JSON.parse(JSON.stringify(project));
  } catch {
    issues.push("project is not JSON-serializable");
  }

  return { ok: issues.length === 0, issues };
};

export const SEED_TITLES: ProjectJSON = {
  version: 1,
  tracks: [
    {
      id: "t-titles",
      name: "Titles",
      type: "element",
      elements: [
        { id: "e-clip1", trackId: "t-titles", name: "Clip One", type: "text", s: 0, e: 2, props: { text: "Clip One" } },
        { id: "e-clip2", trackId: "t-titles", name: "Clip Two", type: "text", s: 2, e: 4, props: { text: "Clip Two" } },
        { id: "e-clip3", trackId: "t-titles", name: "Clip Three", type: "text", s: 4, e: 6, props: { text: "Clip Three" } },
      ],
    },
  ],
} as ProjectJSON;
