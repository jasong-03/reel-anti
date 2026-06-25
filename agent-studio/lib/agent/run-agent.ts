import type { ProjectJSON } from "@twick/timeline";
import { agentResponseSchema, type AgentResponse, type Op } from "../twick/ops";
import { serializeForAgent, type AgentTimelineView } from "../twick/serialize";
import { validateOps } from "../twick/validate-ops";
import { getProvider } from "./llm";
import { pickModel } from "./model-router";
import { SYSTEM_PROMPT, buildUserPrompt, buildCorrectionPrompt } from "./prompts";

export interface RunAgentInput {
  timelineJSON: ProjectJSON;
  message: string;
  resolution: { width: number; height: number };
}

export interface RunAgentOutput extends AgentResponse {
  provider: string;
  /** Number of model round-trips used (1, or 2 if a self-correction was needed). */
  attempts: number;
  /** Destructive ops (remove/removeSpan) in the result — drives the UI guardrail. */
  destructiveCount: number;
  /** Which model tier handled the turn (cost cascade telemetry). */
  model: string;
  tier: string;
}

const formatZodErrors = (
  issues: { path: (string | number)[]; message: string }[]
): string =>
  issues
    .map((i) => `- ${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`)
    .join("\n");

/**
 * Validate one model response through BOTH layers: Zod (shape) then semantic
 * (against live state). Returns the ops on success, or a human-readable error
 * string to feed back for self-correction.
 */
const validateResponse = (
  object: unknown,
  view: AgentTimelineView
): { ok: true; data: AgentResponse; destructiveCount: number } | { ok: false; error: string } => {
  const parsed = agentResponseSchema.safeParse(object);
  if (!parsed.success) {
    return { ok: false, error: formatZodErrors(parsed.error.issues) };
  }
  const semantic = validateOps(view, parsed.data.ops as Op[]);
  if (!semantic.ok) {
    return { ok: false, error: semantic.errors.map((e) => `- ${e}`).join("\n") };
  }
  return { ok: true, data: parsed.data, destructiveCount: semantic.destructiveCount };
};

/**
 * Core agent loop: serialize → prompt → tool-call → validate (shape + state).
 * On failure, feed the errors back for exactly ONE self-correction retry.
 * Throws only if the second attempt still fails.
 */
export const runAgent = async (input: RunAgentInput): Promise<RunAgentOutput> => {
  const provider = getProvider();
  const { model, tier } = pickModel(input.message);
  const view = serializeForAgent(input.timelineJSON, input.resolution);
  const baseUser = buildUserPrompt(view, input.message);

  const first = await provider.generateAgentResponse({ system: SYSTEM_PROMPT, user: baseUser, model });
  const firstCheck = validateResponse(first.object, view);
  if (firstCheck.ok) {
    return {
      ...firstCheck.data,
      provider: provider.name,
      attempts: 1,
      destructiveCount: firstCheck.destructiveCount,
      model,
      tier,
    };
  }

  const correction = buildCorrectionPrompt(first.object, firstCheck.error);
  const second = await provider.generateAgentResponse({
    system: SYSTEM_PROMPT,
    user: baseUser + correction,
    model,
  });
  const secondCheck = validateResponse(second.object, view);
  if (secondCheck.ok) {
    return {
      ...secondCheck.data,
      provider: provider.name,
      attempts: 2,
      destructiveCount: secondCheck.destructiveCount,
      model,
      tier,
    };
  }

  throw new Error(`Agent produced invalid ops after one self-correction:\n${secondCheck.error}`);
};
