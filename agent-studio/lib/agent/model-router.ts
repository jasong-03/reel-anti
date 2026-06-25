/**
 * Model cascade (Phase 4 latency/cost pass).
 *
 * Mechanical edits ("trim clip 2", "delete the title") go to a fast cheap model;
 * planning-style requests ("make an intro", multi-step asks) go to a stronger
 * model. The plan frames this as Haiku-for-mechanical / Opus-for-planning; with
 * Gemini today it's flash vs pro. Swapping in Claude reuses this same router.
 */
export type ModelTier = "mechanical" | "planning";

export interface ModelChoice {
  model: string;
  tier: ModelTier;
}

const PLANNING_SIGNALS =
  /\b(make|create|build|design|intro|outro|montage|sequence|recreate|then|also|multiple|several|each|every)\b/i;

export const pickModel = (message: string): ModelChoice => {
  const sentences = message.match(/[.!?]/g)?.length ?? 0;
  const looksLikePlanning =
    message.length > 120 || sentences >= 2 || PLANNING_SIGNALS.test(message);

  if (looksLikePlanning) {
    return { model: process.env.GEMINI_MODEL_PLANNING ?? "gemini-2.5-pro", tier: "planning" };
  }
  return { model: process.env.GEMINI_MODEL ?? "gemini-2.5-flash", tier: "mechanical" };
};
