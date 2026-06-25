# Phase 0 — Spike & Decision Notes

**Verdict: Twick is forkable and the timeline seam is good enough to drive from an agent. Gate PASSED.** Proceeding to Phase 1.

## How we integrate (decision)

We do **not** fork the monorepo to add our product. Twick's own `AI_Builder.md` recommends
"Level 1 — Full Studio": a host app that imports the published `@twick/*` packages and adds the
AI layer in a backend route. That is exactly our shape, so the product lives in `agent-studio/`
(Next.js 14 + React 18 + TS), importing `@twick/studio` `@twick/timeline` `@twick/live-player`
at `0.15.31`. The cloned `twick/` repo stays as **API reference only**.

This keeps us on Twick's supported public surface (undo/redo, WebCodecs export, the timeline model)
instead of maintaining a fork, and the Sustainable Use License covers an internal tool for free.

## Timeline state shape (what the agent reads)

`editor.getProject()` returns `ProjectJSON`:

```
ProjectJSON {
  version: number
  backgroundColor?: string
  metadata?: ProjectMetadata
  tracks: TrackJSON[]
}
TrackJSON   { id: "t-…", name, type: "video"|"audio"|"caption"|"element"|"scene", elements: ElementJSON[] }
ElementJSON { id: "e-…", type: "text"|"video"|"image"|"audio"|"caption"|…, s: number, e: number,
              t?: string /*caption text*/, props: { text?, src?, … }, position?, rotation?, opacity? }
```

IDs are stable (`t-…` / `e-…`, `generateShortUuid`). Times are **seconds**. Text lives in
`props.text` (TextElement) or top-level `t` (CaptionElement). Media URL lives in `props.src`.
We serialize this to a compact, index-annotated form in `lib/twick/serialize.ts` so the model can
say "the 3rd clip" and we resolve it to an id.

## The editor methods we need (one op → one call)

| Op          | TimelineEditor call                                                        |
|-------------|----------------------------------------------------------------------------|
| addText     | `new TextElement(text, props)` → `addElementToTrack(track, el)` (async)     |
| addMedia    | `new Video/Image/AudioElement(src, parentSize)` → `addElementToTrack` (async; auto-loads media meta) |
| trim        | `trimElement(el, newStart, newEnd)` (narrows within current bounds)         |
| move        | `updateElements([{ elementId, updates: { s, e } }])` (single undo step)     |
| split       | `splitElement(el, time)` (async)                                           |
| remove      | `removeElement(el)` / `removeElements([ids])`                               |
| removeSpan  | `rippleDelete(fromTime, toTime)` (cuts a time range, shifts later left)     |

Supporting reads: `getProject()`, `getTrackById`, `getTracksByType`, `getMetadata`,
`videoResolution` (from `useTimelineContext`) for `parentSize`.

## What `@twick/mcp-agent` already solves

Only **caption generation**: an MCP stdio server (`generate-captions`) that transcribes a video URL
and emits a captioned `ProjectJSON`. It does **not** do general timeline ops. The chat→edit op loop
is ours to build. We reuse its transcription path later in Phase 2 (`removeSpan` on filler words).

## Reliability notes that shaped applyOp

- `addElementToTrack` throws `ValidationError` on per-track **collision**. So adds must target a
  non-colliding track of the right type, or create a fresh track. `lib/twick/apply-op.ts` does this.
- Validators are lenient: text→needs `text`, media→needs `src`, all→`0 ≤ s < e`. No frame required.
- `trimElement` only **narrows**; it returns `false` if you try to extend. Surfaced as an op error.
- Undo/redo is free via Twick (`editor.undo()`, `canUndo`). Each editor call = one undo step;
  batch helpers (`updateElements`, `removeElements`, `rippleDelete`) are single undo steps.

## Context wiring

`LivePlayerProvider → TimelineProvider → { TwickStudio, AgentChatPanel }`. The chat panel calls
`useTimelineContext()` to get the **same** `editor` instance Studio renders, so applied ops show in
the preview immediately. AI calls go to `/api/agent` (server) — never from React/timeline code,
per Twick's architecture rules.
