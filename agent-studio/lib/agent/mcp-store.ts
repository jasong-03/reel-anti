import { promises as fs } from "node:fs";
import path from "node:path";
import type { ProjectJSON } from "@twick/timeline";

/**
 * File-backed project store shared by the MCP server. Same `.data/projects/`
 * location the in-app `/api/projects` route uses, so an external agent and the
 * browser edit the same persisted project. The seam is intentionally tiny — swap
 * for S3/R2/a DB later without touching the MCP route.
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

export const saveProject = async (id: string, project: ProjectJSON): Promise<void> => {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(fileFor(id), JSON.stringify(project), "utf8");
};
