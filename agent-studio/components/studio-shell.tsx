"use client";

import { useCallback, useRef, useState } from "react";
import { LivePlayerProvider, PLAYER_STATE, useLivePlayerContext } from "@twick/live-player";
import { TimelineProvider } from "@twick/timeline";
import TopHeader from "./studio/top-header";
import LeftNav, { type NavId, type PanelId } from "./studio/left-nav";
import AgentPanel, { type AppliedInfo } from "./studio/agent-panel";
import SidePanel from "./studio/side-panel";
import GeneratePanel from "./studio/generate-panel";
import { MediaLibraryProvider } from "./studio/media-library";
import { SettingsPanel, FeedbackPanel } from "./studio/meta-panels";
import CenterWorkspace from "./studio/center-workspace";
import PropertiesPanel from "./studio/properties-panel";
import TimelinePanel from "./studio/timeline-panel";

const RESOLUTION = { width: 1280, height: 720 };

/** 16:9 seed so the editor looks populated (text + caption + effect overlay). */
const INITIAL_PROJECT = {
  version: 1,
  backgroundColor: "#070d1a",
  tracks: [
    {
      id: "t-titles",
      name: "Titles",
      type: "element",
      elements: [
        { id: "e-title1", trackId: "t-titles", name: "Road Trip", type: "text", s: 0, e: 3, props: { text: "Road Trip", fill: "#FFFFFF", fontSize: 96 } },
        { id: "e-title2", trackId: "t-titles", name: "Summer Adventure", type: "text", s: 3, e: 6, props: { text: "Summer Adventure", fill: "#FFFFFF", fontSize: 72 } },
      ],
    },
    {
      id: "t-fx",
      name: "Effects",
      type: "element",
      elements: [
        { id: "e-grade", trackId: "t-fx", name: "Warm Grade", type: "rect", s: 8, e: 16, props: { text: "", fill: "rgba(255,150,60,0.18)", width: 1280, height: 720, radius: 0 } },
      ],
    },
    {
      id: "t-cap",
      name: "Captions",
      type: "caption",
      elements: [
        { id: "e-cap1", trackId: "t-cap", name: "caption", type: "caption", s: 0, e: 5, t: "Welcome to the journey", props: {} },
      ],
    },
  ],
};

function StudioLayout() {
  const { setCurrentTime, setSeekTime, setPlayerState } = useLivePlayerContext();
  const [nav, setNav] = useState<PanelId>("agent");
  const [glowIds, setGlowIds] = useState<Set<string>>(new Set());
  const glowTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seekNudge = useRef(0);

  const onApplied = useCallback(({ affectedIds, seekTo }: AppliedInfo) => {
    setGlowIds(new Set(affectedIds));
    if (seekTo !== undefined) {
      setPlayerState(PLAYER_STATE.PAUSED);
      setCurrentTime(seekTo);
      // Alternating sub-ms nudge so the visualizer re-seeks even when seekTo equals
      // the current playhead — freshly-added media then renders immediately.
      seekNudge.current = seekNudge.current ? 0 : 1e-4;
      setSeekTime(seekTo + seekNudge.current);
    }
    if (glowTimer.current) clearTimeout(glowTimer.current);
    glowTimer.current = setTimeout(() => setGlowIds(new Set()), 1600);
  }, [setCurrentTime, setSeekTime, setPlayerState]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <TopHeader />
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <LeftNav active={nav} onSelect={setNav} />
        <div style={{ width: "27%", minWidth: 320, maxWidth: 420, flexShrink: 0, borderRight: "1px solid var(--border)", background: "rgba(7,11,22,0.55)", minHeight: 0 }}>
          {nav === "agent" ? (
            <AgentPanel onApplied={onApplied} />
          ) : nav === "generate" ? (
            <GeneratePanel onApplied={onApplied} />
          ) : nav === "settings" ? (
            <SettingsPanel />
          ) : nav === "feedback" ? (
            <FeedbackPanel />
          ) : (
            <SidePanel nav={nav as NavId} onApplied={onApplied} />
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, minHeight: 0 }}>
          <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
            <CenterWorkspace videoProps={RESOLUTION} />
            <div style={{ width: "24%", minWidth: 280, maxWidth: 360, flexShrink: 0 }}>
              <PropertiesPanel />
            </div>
          </div>
          <div style={{ height: 280, flexShrink: 0 }}>
            <TimelinePanel glowIds={glowIds} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StudioShell() {
  return (
    <LivePlayerProvider>
      <TimelineProvider contextId="ai-video-studio" initialData={INITIAL_PROJECT} resolution={RESOLUTION} analytics={{ enabled: false }}>
        <MediaLibraryProvider>
          <StudioLayout />
        </MediaLibraryProvider>
      </TimelineProvider>
    </LivePlayerProvider>
  );
}
