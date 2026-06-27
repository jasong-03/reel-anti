"use client";

import type { TimelineEditor, ProjectJSON } from "@twick/timeline";

/**
 * Project persistence (Phase 4). Saves through the shared `/api/projects` store
 * with a localStorage fallback so a refresh never loses work even offline.
 */
const LOCAL_KEY = "agent-studio:project:default";
const WORKSPACE_ID = "default";

export const saveProject = async (editor: TimelineEditor): Promise<void> => {
  const project = editor.getProject();
  try {
    window.localStorage.setItem(LOCAL_KEY, JSON.stringify(project));
  } catch {
    // storage may be unavailable (private mode); the server save still applies
  }
  const response = await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: WORKSPACE_ID, project }),
  });
  if (!response.ok) {
    throw new Error(`save failed (${response.status})`);
  }
};

export const loadProject = async (editor: TimelineEditor): Promise<boolean> => {
  try {
    const response = await fetch(`/api/projects?id=${WORKSPACE_ID}`);
    if (response.ok) {
      const data = (await response.json()) as { project: ProjectJSON };
      editor.loadProject(data.project);
      return true;
    }
  } catch {
    // fall through to local backup
  }
  try {
    const raw = window.localStorage.getItem(LOCAL_KEY);
    if (raw) {
      editor.loadProject(JSON.parse(raw) as ProjectJSON);
      return true;
    }
  } catch {
    // no local backup either
  }
  return false;
};
