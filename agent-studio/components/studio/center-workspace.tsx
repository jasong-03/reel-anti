"use client";

import { useRef, useState } from "react";
import { LivePlayer, PLAYER_STATE, useLivePlayerContext } from "@twick/live-player";
import { useTimelineContext } from "@twick/timeline";
import { usePlayerData, type VideoProps } from "./use-player-data";
import {
  ChevronDown,
  Maximize,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  StepBack,
  StepForward,
  Volume,
  Camera,
  Screen,
} from "./icons";

const fmt = (sec: number): string => {
  const s = Math.max(0, sec);
  const mm = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  const cs = Math.floor((s * 100) % 100);
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
};

export default function CenterWorkspace({ videoProps }: { videoProps: VideoProps }) {
  const { totalDuration } = useTimelineContext();
  const { playerState, currentTime, seekTime, playerVolume, setPlayerState, setCurrentTime, setSeekTime, setPlayerVolume } =
    useLivePlayerContext();
  const projectData = usePlayerData(videoProps);
  const durationRef = useRef(0);
  const ZOOMS = ["Fit", "100%", "150%", "200%"];
  const [zoom, setZoom] = useState("Fit");
  const zoomScale = zoom === "Fit" ? 1 : Number(zoom.replace("%", "")) / 100;

  const playing = playerState === PLAYER_STATE.PLAYING;
  const duration = Math.max(totalDuration, durationRef.current);

  const togglePlay = () => setPlayerState(playing ? PLAYER_STATE.PAUSED : PLAYER_STATE.PLAYING);
  const seekTo = (t: number) => {
    const clamped = Math.max(0, Math.min(t, duration || t));
    setPlayerState(PLAYER_STATE.PAUSED);
    setCurrentTime(clamped);
    setSeekTime(clamped);
  };

  const handleTimeUpdate = (time: number) => {
    if (durationRef.current && time >= durationRef.current) {
      setCurrentTime(0);
      setPlayerState(PLAYER_STATE.PAUSED);
    } else {
      setCurrentTime(time);
    }
  };

  return (
    <section style={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: 0, flex: 1 }}>
      {/* sequence header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <button className="btn btn-ghost" style={{ height: 32, fontWeight: 600 }}>
          Sequence 01 <ChevronDown width={15} />
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button className="btn" style={{ height: 30, fontSize: 12.5 }}>
            Fit <ChevronDown width={14} />
          </button>
          <button className="btn" style={{ height: 30, fontSize: 12.5, minWidth: 74 }} onClick={() => setZoom(ZOOMS[(ZOOMS.indexOf(zoom) + 1) % ZOOMS.length])}>
            {zoom} <ChevronDown width={14} />
          </button>
          <button className="icon-btn" aria-label="Fullscreen">
            <Maximize width={17} />
          </button>
        </div>
      </header>

      {/* preview */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "grid",
          placeItems: "center",
          padding: "20px 24px",
        }}
      >
        <div
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "min(100%, calc((100vh - 360px) * 16 / 9))",
            aspectRatio: `${videoProps.width} / ${videoProps.height}`,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            background: "#04060c",
            boxShadow: "0 24px 60px -28px rgba(0,0,0,0.8)",
          }}
        >
          <div style={{ width: "100%", height: "100%", transform: `scale(${zoomScale})`, transformOrigin: "center", transition: "transform 0.2s ease" }}>
            <LivePlayer
              playing={playing}
              projectData={projectData}
              videoSize={videoProps}
              seekTime={seekTime}
              volume={playerVolume}
              onTimeUpdate={handleTimeUpdate}
              onDurationChange={(d: number) => (durationRef.current = d)}
              containerStyle={{ background: "#04060c" }}
            />
          </div>
        </div>
      </div>

      {/* scrubber + controls */}
      <div style={{ padding: "10px 18px 16px", borderTop: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, color: "var(--text-2)" }}>K</span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.01}
            value={Math.min(currentTime, duration || currentTime)}
            onChange={(e) => seekTo(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 12, color: "var(--text-2)" }}>{fmt(duration)}</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontVariantNumeric: "tabular-nums", fontSize: 15, fontWeight: 600, minWidth: 96 }}>{fmt(currentTime)}</span>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button className="icon-btn" aria-label="Jump to start" onClick={() => seekTo(0)}>
              <SkipBack width={18} />
            </button>
            <button className="icon-btn" aria-label="Back 1 second" onClick={() => seekTo(currentTime - 1)}>
              <StepBack width={18} />
            </button>
            <button
              aria-label={playing ? "Pause" : "Play"}
              onClick={togglePlay}
              style={{
                width: 46,
                height: 46,
                borderRadius: "50%",
                border: "1px solid var(--border-strong)",
                background: "var(--surface-3)",
                color: "var(--text-1)",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              {playing ? <Pause width={20} /> : <Play width={20} />}
            </button>
            <button className="icon-btn" aria-label="Forward 1 second" onClick={() => seekTo(currentTime + 1)}>
              <StepForward width={18} />
            </button>
            <button className="icon-btn" aria-label="Jump to end" onClick={() => seekTo(duration)}>
              <SkipForward width={18} />
            </button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 96, justifyContent: "flex-end" }}>
            <button className="icon-btn" aria-label="Screen preview"><Screen width={17} /></button>
            <button className="icon-btn" aria-label="Snapshot"><Camera width={17} /></button>
            <button className="icon-btn" aria-label="Volume"><Volume width={17} /></button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={playerVolume}
              onChange={(e) => setPlayerVolume(Number(e.target.value))}
              style={{ width: 56 }}
              aria-label="Volume level"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
