# reel-anti

An **AI-first video editor** — edit a real video timeline by chatting in natural language.
Built on [Twick](https://github.com/ncounterspecialist/twick) (timeline, WebCodecs preview/export,
undo/redo) with a Claude/Gemini-style agent that reads the timeline and emits validated edit
operations. Inspired by the "Antigravity for Video" concept (see [`plan.md`](./plan.md)).

> Chat → validated ops → applied to the real editor → preview + undo update live.

## What's here

| Path | What |
|------|------|
| [`agent-studio/`](./agent-studio) | The Next.js 14 app (the product) — agent loop + redesigned AI Video Studio UI |
| [`plan.md`](./plan.md) | The original phased roadmap |
| [`PHASE0-NOTES.md`](./PHASE0-NOTES.md) | Spike findings + Twick timeline/API map |
| [`PHASES.md`](./PHASES.md) | Status against every phase gate |

The `twick/` reference clone is intentionally **not** committed (the app uses the published
`@twick/*` npm packages). Clone it separately if you need the source for reference.

## Run

```bash
cd agent-studio
pnpm install
cp .env.local.example .env.local     # set OPENROUTER_API_KEY (or GEMINI / Vertex)
pnpm dev                             # http://localhost:3000
```

## Features

- **Agent panel** — natural-language edits → action chips → "Add to timeline", per-turn undo, streaming reasoning
- **Nav panels** — import local video/image/audio (drag-drop), shapes, text, captions, effects, templates
- **Timeline** — multi-track, drag to move, edge-trim, split/cut/delete, snap, zoom, playhead
- **Properties** — transform / color / speed / volume wired to the selected clip
- **Export** — real WebCodecs MP4 render + download
- Provider-agnostic LLM seam (OpenRouter / Gemini / Vertex / drop-in Claude)

## Verify

```bash
cd agent-studio
pnpm typecheck && pnpm build
pnpm test:offline   # deterministic logic (no key)
pnpm test:apply     # real Twick editor integration (no key)
pnpm test:gates     # live agent gates (needs an LLM key)
```
