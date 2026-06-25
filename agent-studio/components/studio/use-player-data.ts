"use client";

import { useEffect, useState } from "react";
import { useTimelineContext, TIMELINE_ACTION } from "@twick/timeline";

export interface VideoProps {
  width: number;
  height: number;
}

/** Shape LivePlayer expects (see @twick/video-editor usePlayerManager). */
export interface PlayerProjectData {
  input: {
    properties: VideoProps;
    tracks: unknown[];
    version: number;
    backgroundColor: string;
  };
}

const buildData = (
  tracks: unknown[],
  version: number,
  backgroundColor: string,
  videoProps: VideoProps
): PlayerProjectData => ({
  input: { properties: videoProps, tracks, version, backgroundColor },
});

/**
 * Bridges the timeline editor to LivePlayer. Mirrors usePlayerManager's
 * UPDATE_PLAYER_DATA handler: every editor mutation emits that action with the
 * serialized tracks, which we turn into the player's projectData.
 */
export const usePlayerData = (videoProps: VideoProps): PlayerProjectData => {
  const { editor, timelineAction } = useTimelineContext();
  const [projectData, setProjectData] = useState<PlayerProjectData>(() => {
    const p = editor.getProject();
    return buildData(p.tracks, p.version, p.backgroundColor ?? "#05070d", videoProps);
  });

  useEffect(() => {
    if (timelineAction.type === TIMELINE_ACTION.UPDATE_PLAYER_DATA) {
      const payload = timelineAction.payload as
        | { tracks?: unknown[]; version?: number; backgroundColor?: string }
        | null;
      setProjectData(
        buildData(
          payload?.tracks ?? [],
          payload?.version ?? 0,
          payload?.backgroundColor ?? "#05070d",
          videoProps
        )
      );
    }
  }, [timelineAction, videoProps]);

  return projectData;
};
