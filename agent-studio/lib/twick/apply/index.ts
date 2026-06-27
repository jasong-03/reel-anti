import { TimelineEditor } from "@twick/timeline";
import type { Op } from "../ops";
import { serializeForAgent } from "../serialize";
import { validateOps } from "../validate-ops";
import { type OpResult, type Resolution, fail } from "./base";
import { applyAddText } from "./text";
import { applyAddMedia } from "./media";
import { applyTrim, applyMove, applySplit, applyRemove } from "./clips";
import { applyRemoveSpan } from "./timeline";
import { applyAddShape } from "./shapes";
import { applyAddCaption } from "./captions";
import { applyAddZoom } from "./motion";
import { applyRemoveWords } from "./transcript";

export type { OpResult, Resolution } from "./base";

/**
 * Apply ONE validated op to the live editor. Deterministic: one op → one editor
 * mutation. Never throws on expected failures — returns an OpResult the caller
 * can surface and feed back to the model for self-correction.
 */
export const applyOp = async (
  editor: TimelineEditor,
  op: Op,
  resolution: Resolution
): Promise<OpResult> => {
  try {
    switch (op.op) {
      case "addText":
        return await applyAddText(editor, op);
      case "addMedia":
        return await applyAddMedia(editor, op, resolution);
      case "trim":
        return applyTrim(editor, op);
      case "move":
        return applyMove(editor, op);
      case "split":
        return await applySplit(editor, op);
      case "remove":
        return applyRemove(editor, op);
      case "removeSpan":
        return await applyRemoveSpan(editor, op);
      case "addShape":
        return await applyAddShape(editor, op);
      case "addCaption":
        return await applyAddCaption(editor, op);
      case "addZoom":
        return applyAddZoom(editor, op, resolution);
      case "removeWords":
        return await applyRemoveWords(editor, op);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(op.op, message);
  }
};

/**
 * Apply a batch of ops in order, collecting per-op results. NON-atomic: a failure
 * mid-batch leaves earlier ops applied. Kept for the direct-manipulation UI paths
 * (drag-drop import, side-panel inserts) that want best-effort behavior. For the
 * agent / MCP path use `executeOps`, which is transactional.
 */
export const applyOps = async (
  editor: TimelineEditor,
  ops: Op[],
  resolution: Resolution
): Promise<OpResult[]> => {
  const results: OpResult[] = [];
  for (const op of ops) results.push(await applyOp(editor, op, resolution));
  return results;
};

export interface BatchResult {
  ok: boolean;
  results: OpResult[];
  /** Ids created/touched across the whole batch (for seek + undo accounting). */
  changed: string[];
  /** Set only on failure: the whole batch was rolled back, this says why. */
  error?: string;
}

/**
 * Transactional batch apply — palmier's "one batch = one undo, no partial state"
 * doctrine. Validates every op up-front against the live timeline, snapshots,
 * applies in order, and rolls the editor back to the snapshot if ANY op fails so
 * the timeline is never left half-edited.
 *
 * Up-front validation against pre-batch state is safe for our vocabulary because
 * id-referencing ops (trim/move/split/remove/addZoom) always target elements that
 * already exist; the model never references an id created earlier in the same
 * batch (those ids are server-assigned and unknown to it).
 */
export const executeOps = async (
  editor: TimelineEditor,
  ops: Op[],
  resolution: Resolution
): Promise<BatchResult> => {
  if (ops.length === 0) return { ok: true, results: [], changed: [] };

  const view = serializeForAgent(editor.getProject(), resolution);
  const validation = validateOps(view, ops);
  if (!validation.ok) {
    return { ok: false, results: [], changed: [], error: validation.errors.map((e) => `- ${e}`).join("\n") };
  }

  const snapshot = editor.getProject();
  const results: OpResult[] = [];
  for (const op of ops) {
    const result = await applyOp(editor, op, resolution);
    results.push(result);
    if (!result.ok) {
      editor.loadProjectSnapshot(snapshot);
      return {
        ok: false,
        results,
        changed: [],
        error: `op ${results.length} (${op.op}) failed and the whole batch was rolled back: ${result.message}`,
      };
    }
  }
  return { ok: true, results, changed: results.flatMap((r) => r.affected ?? []) };
};
