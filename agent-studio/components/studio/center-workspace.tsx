"use client";

import { useRef, useState } from "react";
import { LivePlayer, PLAYER_STATE, useLivePlayerContext } from "@twick/live-player";
import { useTimelineContext } from "@twick/timeline";
import { usePlayerData, type VideoProps } from "./use-player-data";
import PreviewOverlay from "./preview-overlay";
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
  const { totalDuration, videoResolution } = useTimelineContext();
  // Use the live resolution from context so the Settings panel can change it.
  const vp = videoResolution ?? videoProps;
  const { playerState, currentTime, seekTime, playerVolume, setPlayerState, setCurrentTime, setSeekTime, setPlayerVolume } =
    useLivePlayerContext();
  const projectData = usePlayerData(vp);
  const durationRef = useRef(0);
  const previewRef = useRef<HTMLDivElement>(null);
  const lastVol = useRef(0.25);
  const ZOOMS = ["Fit", "100%", "150%", "200%"];
  const [zoom, setZoom] = useState("Fit");
  const zoomScale = zoom === "Fit" ? 1 : Number(zoom.replace("%", "")) / 100;

  const fullscreen = () => previewRef.current?.requestFullscreen?.().catch(() => {});
  const toggleMute = () => {
    if (playerVolume > 0) { lastVol.current = playerVolume; setPlayerVolume(0); }
    else setPlayerVolume(lastVol.current || 0.25);
  };
  const snapshot = () => {
    const canvas = previewRef.current?.querySelector("canvas");
    if (!canvas) return;
    try {
      const a = document.createElement("a");
      a.href = canvas.toDataURL("image/png");
      a.download = `snapshot-${fmt(currentTime).replace(":", "-")}.png`;
      a.click();
    } catch {
      // canvas tainted by a cross-origin video frame — can't export that frame
      alert("Cannot snapshot a cross-origin video frame. Use an uploaded/local clip.");
    }
  };

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
          <button className="btn" style={{ height: 30, fontSize: 12.5 }} onClick={() => setZoom("Fit")}>
            Fit <ChevronDown width={14} />
          </button>
          <button className="btn" style={{ height: 30, fontSize: 12.5, minWidth: 74 }} onClick={() => setZoom(ZOOMS[(ZOOMS.indexOf(zoom) + 1) % ZOOMS.length])}>
            {zoom} <ChevronDown width={14} />
          </button>
          <button className="icon-btn" aria-label="Fullscreen" onClick={fullscreen}>
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
          ref={previewRef}
          style={{
            position: "relative",
            width: "100%",
            maxWidth: "min(100%, calc((100vh - 360px) * 16 / 9))",
            aspectRatio: `${vp.width} / ${vp.height}`,
            borderRadius: 14,
            overflow: "hidden",
            border: "1px solid var(--border-strong)",
            background: "#04060c",
            boxShadow: "0 24px 60px -28px rgba(0,0,0,0.8)",
          }}
        >
          <div style={{ position: "relative", width: "100%", height: "100%", transform: `scale(${zoomScale})`, transformOrigin: "center", transition: "transform 0.2s ease" }}>
            <LivePlayer
              playing={playing}
              projectData={projectData}
              videoSize={vp}
              seekTime={seekTime}
              volume={playerVolume}
              onTimeUpdate={handleTimeUpdate}
              onDurationChange={(d: number) => (durationRef.current = d)}
              containerStyle={{ background: "#04060c" }}
            />
            {/* click-to-select + drag-to-move overlay (disabled while playing) */}
            {!playing && <PreviewOverlay videoProps={vp} />}
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
            <button className="icon-btn" aria-label="Fullscreen preview" onClick={fullscreen}><Screen width={17} /></button>
            <button className="icon-btn" aria-label="Snapshot frame" onClick={snapshot}><Camera width={17} /></button>
            <button className="icon-btn" aria-label={playerVolume > 0 ? "Mute" : "Unmute"} onClick={toggleMute} style={{ color: playerVolume === 0 ? "var(--danger)" : undefined }}><Volume width={17} /></button>
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
