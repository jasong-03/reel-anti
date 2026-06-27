/**
 * Transcript-driven editing core (W5) — a pure, deterministic word-cut planner.
 * Descript-style: the user/agent picks filler words to remove and we turn that
 * into a minimal set of timeline cut ranges, applied as one undo entry.
 *
 * Reimplemented from the DESCRIBED behavior of palmier's WordCutPlanner (this is
 * our own algorithm, not a copy): group consecutive selected words into runs,
 * then merge runs separated by only a short kept gap so tiny kept words between
 * two fillers are swept too. `cutAggressiveness` tunes that merge threshold.
 */

export type CutAggressiveness = "tight" | "balanced" | "loose";

/** Kept-gap in ms: runs closer than this are merged into one cut. */
export const KEPT_GAP_MS: Record<CutAggressiveness, number> = {
  tight: 60,
  balanced: 150,
  loose: 320,
};

/** A word's timing on the timeline, in ms from project start. */
export interface WordTiming {
  startMs: number;
  endMs: number;
}

/** Selection: a single 0-based word index, or an inclusive [from, to] index span. */
export type WordSelection = number | [number, number];

/** A cut range on the timeline, in SECONDS (what removeSpan/rippleDelete expects). */
export interface CutRange {
  start: number;
  end: number;
}

const round = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Expand selections (indices + inclusive spans) into a sorted, de-duplicated set
 * of 0-based word indices, dropping anything out of range.
 */
export const resolveSelections = (selections: WordSelection[], wordCount: number): number[] => {
  const set = new Set<number>();
  for (const sel of selections) {
    if (typeof sel === "number") {
      if (sel >= 0 && sel < wordCount) set.add(sel);
    } else {
      const [from, to] = sel[0] <= sel[1] ? sel : [sel[1], sel[0]];
      for (let i = Math.max(0, from); i <= Math.min(wordCount - 1, to); i++) set.add(i);
    }
  }
  return [...set].sort((a, b) => a - b);
};

/**
 * Plan the cut ranges for a set of word selections. Returns merged, sorted ranges
 * in seconds, ready to feed to rippleDelete. Empty when nothing resolves.
 */
export const planWordCuts = (
  words: WordTiming[],
  selections: WordSelection[],
  aggressiveness: CutAggressiveness = "balanced"
): CutRange[] => {
  const indices = resolveSelections(selections, words.length);
  if (indices.length === 0) return [];

  // 1. Group consecutive selected indices into runs (ms spans).
  const runs: { startMs: number; endMs: number }[] = [];
  for (const i of indices) {
    const w = words[i];
    const last = runs[runs.length - 1];
    if (last && i > 0 && indices.includes(i - 1)) {
      last.endMs = Math.max(last.endMs, w.endMs);
    } else {
      runs.push({ startMs: w.startMs, endMs: w.endMs });
    }
  }

  // 2. Merge runs separated by only a short kept gap (sweeps tiny kept words
  //    between fillers; the looser the setting, the wider the bridge).
  const keptGap = KEPT_GAP_MS[aggressiveness];
  const merged: { startMs: number; endMs: number }[] = [];
  for (const run of runs) {
    const last = merged[merged.length - 1];
    if (last && run.startMs - last.endMs <= keptGap) {
      last.endMs = Math.max(last.endMs, run.endMs);
    } else {
      merged.push({ ...run });
    }
  }

  return merged.map((r) => ({ start: round(r.startMs / 1000), end: round(r.endMs / 1000) }));
};

/**
 * Derive per-word end times from a list of start times (ms). Transcription gives
 * word starts; when explicit ends are absent, a word ends where the next begins,
 * and the final word ends at the clip end. Keeps the planner honest without a
 * full transcription round-trip.
 */
export const inferWordEnds = (startsMs: number[], clipEndMs: number): WordTiming[] =>
  startsMs.map((startMs, i) => ({
    startMs,
    endMs: i + 1 < startsMs.length ? startsMs[i + 1] : clipEndMs,
  }));
