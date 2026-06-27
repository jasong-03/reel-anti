import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ProjectJSON } from "@twick/timeline";

/**
 * File-backed project store shared by the MCP server. Same `.data/projects/`
 * location the in-app `/api/projects` route uses, so an external agent and the
 * browser edit the same persisted project. The seam is intentionally tiny — swap
 * for S3/R2/a DB later without touching the MCP route.
 *
 * Writes are atomic (tmp + rename) and serialized per project id via an in-process
 * mutex, so a JSON-RPC batch or concurrent tool calls chain their edits instead of
 * each loading the same pre-batch project and clobbering the others (the "one
 * batch, no partial state" guarantee must survive the read-modify-write seam, not
 * just live inside executeOps). This holds within one Node process; a multi-
 * instance deployment needs a store with compare-and-swap.
 */

const DATA_DIR = path.join(process.cwd(), ".data", "projects");
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export const isValidProjectId = (id: string): boolean => ID_RE.test(id);

const fileFor = (id: string) => path.join(DATA_DIR, `${id}.json`);

const EMPTY_PROJECT: ProjectJSON = { version: 1, tracks: [] } as ProjectJSON;

/** Load a project, or a fresh empty one if it doesn't exist yet. */
export const loadProject = async (id: string): Promise<ProjectJSON> => {
  try {
    const raw = await fs.readFile(fileFor(id), "utf8");
    return JSON.parse(raw) as ProjectJSON;
  } catch {
    return structuredClone(EMPTY_PROJECT);
  }
};

/** Persist a project atomically: write a temp file, then rename over the target. */
export const saveProject = async (id: string, project: ProjectJSON): Promise<void> => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = path.join(DATA_DIR, `.${id}.${randomUUID()}.tmp`);
  await fs.writeFile(tmp, JSON.stringify(project), "utf8");
  await fs.rename(tmp, fileFor(id));
};

// ── Per-id write serialization ───────────────────────────────────────────────
// A promise chain per project id: each critical section awaits the previous one,
// so load-modify-save sequences never interleave on the same project.
const tails = new Map<string, Promise<unknown>>();

export const withProjectLock = async <T>(id: string, fn: () => Promise<T>): Promise<T> => {
  const prev = tails.get(id) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const next = prev.then(() => gate);
  tails.set(id, next);
  await prev.catch(() => {}); // a prior failure must not deadlock the queue
  try {
    return await fn();
  } finally {
    release();
    // Drop the map entry once this was the last waiter, to avoid unbounded growth.
    if (tails.get(id) === next) tails.delete(id);
  }
};
