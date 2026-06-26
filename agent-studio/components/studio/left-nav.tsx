"use client";

import type { ComponentType, SVGProps } from "react";
import {
  Sparkles,
  Layers,
  Template,
  TypeIcon,
  Shapes,
  Music,
  Effects,
  Transitions,
  Settings,
  Feedback,
} from "./icons";

export type NavId =
  | "agent"
  | "assets"
  | "templates"
  | "text"
  | "elements"
  | "audio"
  | "effects"
  | "transitions";

/** Full set of left-panel ids, including the bottom meta items. */
export type PanelId = NavId | "settings" | "feedback";

type Item = { id: NavId; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> };

const MAIN: Item[] = [
  { id: "agent", label: "Agent", Icon: Sparkles },
  { id: "assets", label: "Assets", Icon: Layers },
  { id: "templates", label: "Templates", Icon: Template },
  { id: "text", label: "Text", Icon: TypeIcon },
  { id: "elements", label: "Elements", Icon: Shapes },
  { id: "audio", label: "Audio", Icon: Music },
  { id: "effects", label: "Effects", Icon: Effects },
  { id: "transitions", label: "Transitions", Icon: Transitions },
];

export default function LeftNav({
  active,
  onSelect,
}: {
  active: PanelId;
  onSelect: (id: PanelId) => void;
}) {
  return (
    <nav
      style={{
        width: 72,
        flexShrink: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "10px 8px",
        borderRight: "1px solid var(--border)",
        background: "rgba(5,8,16,0.4)",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
        {MAIN.map(({ id, label, Icon }) => (
          <button
            key={id}
            className="nav-item"
            aria-current={active === id}
            onClick={() => onSelect(id)}
          >
            <Icon width={20} />
            {label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 2, width: "100%" }}>
        <button className="nav-item" aria-current={active === "settings"} onClick={() => onSelect("settings")}><Settings width={20} />Settings</button>
        <button className="nav-item" aria-current={active === "feedback"} onClick={() => onSelect("feedback")}><Feedback width={20} />Feedback</button>
      </div>
    </nav>
  );
}
