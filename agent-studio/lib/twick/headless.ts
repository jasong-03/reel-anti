import { TimelineEditor } from "@twick/timeline";
import type { ProjectJSON } from "@twick/timeline";

/**
 * A real @twick/timeline editor running headless (no browser). The TimelineEditor
 * is isomorphic — it only needs a small host context to record history — so the
 * same apply code path runs server-side (the MCP executor) and in tests.
 *
 * Media decoding (video/image frames) is the one browser-only piece; text /
 * caption / shape / clip ops — where timeline-corruption risk actually lives —
 * run fully here.
 */

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
 * A timeline is "corrupted" if any of these hold. This is the gate's pass/fail
 * signal for "zero corrupted timelines" and the MCP executor's post-edit guard.
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
