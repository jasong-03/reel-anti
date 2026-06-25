import type { SVGProps } from "react";

/** Lucide-style stroke icons. Single consistent family, stroke=currentColor. */
const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  ...props,
});

export const Sparkles = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /><path d="M19 14l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></svg>
);
export const Layers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5" /></svg>
);
export const Template = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M9 21V9" /></svg>
);
export const TypeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7V5h16v2M9 19h6M12 5v14" /></svg>
);
export const Shapes = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="8" cy="8" r="4" /><rect x="13" y="11" width="8" height="8" rx="1.5" /></svg>
);
export const Music = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 18V5l11-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="17" cy="16" r="3" /></svg>
);
export const Effects = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 3v4M3 5h4M6 17v4M4 19h4" /><path d="M14 4l2.5 5.5L22 12l-5.5 2.5L14 20l-2.5-5.5L6 12l5.5-2.5z" /></svg>
);
export const Transitions = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="5" width="7" height="14" rx="1.5" /><rect x="14" y="5" width="7" height="14" rx="1.5" /><path d="M10 12h4" /></svg>
);
export const Settings = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.6 1.6 0 00-2.7.7 1.6 1.6 0 01-3.2 0 1.6 1.6 0 00-2.7-.7l-.1.1a2 2 0 11-2.8-2.8l.1-.1A1.6 1.6 0 004.6 15a1.6 1.6 0 01-1.4-1.6 1.6 1.6 0 011.4-1.6 1.6 1.6 0 00.6-2.7l-.1-.1a2 2 0 112.8-2.8l.1.1a1.6 1.6 0 002.7-.6 1.6 1.6 0 013.2 0 1.6 1.6 0 002.7.6l.1-.1a2 2 0 112.8 2.8l-.1.1a1.6 1.6 0 00.6 2.7 1.6 1.6 0 011.4 1.6 1.6 1.6 0 01-1.4 1.6z" /></svg>
);
export const Feedback = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>
);
export const Undo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M9 7L4 12l5 5" /><path d="M4 12h11a5 5 0 015 5v1" /></svg>
);
export const Redo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M15 7l5 5-5 5" /><path d="M20 12H9a5 5 0 00-5 5v1" /></svg>
);
export const Cloud = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M17.5 19a4.5 4.5 0 00.5-9 6 6 0 00-11.6-1.5A4 4 0 006.5 19z" /></svg>
);
export const Help = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 013.9-2c1 .7 1.1 1.7.6 2.5-.5.8-2 1.2-2 2.5" /><path d="M12 17h.01" /></svg>
);
export const Bell = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></svg>
);
export const Export = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 15V3" /><path d="M8 7l4-4 4 4" /><path d="M4 14v4a2 2 0 002 2h12a2 2 0 002-2v-4" /></svg>
);
export const Play = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><path d="M8 5v14l11-7z" /></svg>
);
export const Pause = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)} fill="currentColor" stroke="none"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
);
export const SkipBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M19 5v14l-9-7z" /><path d="M5 5v14" /></svg>
);
export const SkipForward = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 5v14l9-7z" /><path d="M19 5v14" /></svg>
);
export const StepBack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M11 5v14l-7-7z" /><path d="M18 5v14l-7-7z" /></svg>
);
export const StepForward = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M13 5v14l7-7z" /><path d="M6 5v14l7-7z" /></svg>
);
export const Volume = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M11 5L6 9H2v6h4l5 4z" /><path d="M19 5a9 9 0 010 14M15.5 8.5a4 4 0 010 7" /></svg>
);
export const Maximize = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M8 3H5a2 2 0 00-2 2v3M16 3h3a2 2 0 012 2v3M21 16v3a2 2 0 01-2 2h-3M3 16v3a2 2 0 002 2h3" /></svg>
);
export const Camera = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14.5 4l1.5 2h3a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h3l1.5-2z" /><circle cx="12" cy="13" r="3.2" /></svg>
);
export const Screen = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
);
export const ChevronDown = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 9l6 6 6-6" /></svg>
);
export const Send = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4z" /></svg>
);
export const Paperclip = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 11.5l-8.8 8.8a5 5 0 01-7-7l9-9a3.3 3.3 0 014.7 4.7l-9 9a1.7 1.7 0 01-2.4-2.4l8.3-8.3" /></svg>
);
export const Mic = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0014 0M12 18v3" /></svg>
);
export const Check = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 6L9 17l-5-5" /></svg>
);
export const Plus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const Minus = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 12h14" /></svg>
);
export const Scissors = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M20 4L8.1 15.9M14.5 14.5L20 20M8.1 8.1L12 12" /></svg>
);
export const SplitIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3v18M7 8L3 12l4 4M17 8l4 4-4 4" /></svg>
);
export const Trash = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" /></svg>
);
export const More = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" /></svg>
);
export const Search = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
export const Magnet = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 4v7a6 6 0 0012 0V4" /><path d="M6 4H2v7M18 4h4v7M2 11h4M18 11h4" /></svg>
);
export const Cursor = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M5 3l6.5 16 2-7 7-2z" /></svg>
);
export const AddTrack = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="5" width="18" height="5" rx="1.5" /><path d="M7 16h6M10 13v6" /></svg>
);
export const Upload = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><path d="M12 3v13M7 8l5-5 5 5" /></svg>
);
export const Film = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></svg>
);
