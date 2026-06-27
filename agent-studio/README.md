# Antigravity for Video — `agent-studio`

Phase 0–1 of [`../plan.md`](../plan.md): an agent-driven video editor. Twick provides the editor
(timeline, preview, WebCodecs export, undo/redo); we add the **chat → validated ops → editor** loop.

See [`../PHASE0-NOTES.md`](../PHASE0-NOTES.md) for the spike findings and the timeline/API map.

## Architecture

```
Browser                                   Server (/api/agent)
─────────────────────────────             ───────────────────────────────
TwickStudio  ─┐                            runAgent:
              ├─ TimelineProvider           serializeForAgent(timeline)
AgentChatPanel┘   (shared `editor`)         → LLM tool-call (Gemini, swappable)
   │  editor.getProject()                   → Zod-validate ops
   │  POST timelineJSON + message  ───────► → 1 self-correction retry on failure
   │  ◄─────────── { reasoning, ops } ──────┘
   └─ applyOps(editor, ops)  → preview + undo update live
```

- **`lib/twick/ops.ts`** — the 12-op Zod contract (`addText`, `addMedia`, `trim`, `move`, `split`, `remove`, `removeSpan`, `addShape`, `addCaption`, `addZoom`, `removeWords`, `setKeyframes`). Every op is `.strict()` — unknown fields are rejected with an actionable, JSON-path error the model self-corrects on.
- **`lib/twick/keyframes.ts`** — pure keyframe sampler (`position`/`scale`/`rotation`, interp `linear`/`hold`/`smooth`) + an expander that turns a track into dense contiguous Twick `ElementFrameEffect` segments the visualizer interpolates per frame (the proven Ken-Burns path, generalized to N keyframes; video/image only — opacity has no per-frame frame-effect hook).
- **`lib/twick/transcript.ts`** — Descript-style word-cut planner: turns selected caption-word indices into the minimal set of ripple-delete ranges (one undo), with a `tight|balanced|loose` gap-merge knob. Powers the `removeWords` op. (Pure + deterministic; the *source* of word timings — live transcription via `@twick/cloud-transcript` — is a separate, key-gated follow-up.)
- **`lib/twick/serialize.ts`** — compact, index-annotated timeline view the model reads.
- **`lib/twick/apply/`** — deterministic one-op-to-one-`TimelineEditor`-call map, split by domain (`text`/`media`/`clips`/`timeline`/`shapes`/`captions`/`motion`). `executeOps` applies a batch as **one transaction** (validate up-front, roll back the whole batch on any failure — never a half-edited timeline). `apply-op.ts` re-exports it for back-compat.
- **`lib/twick/headless.ts`** — the `TimelineEditor` running headless, shared by tests and the server-side MCP executor.
- **`lib/agent/llm.ts`** — provider-agnostic tool-calling seam; Gemini today, Claude drop-in.
- **`lib/agent/run-agent.ts`** — serialize → prompt → tool-call → validate → retry-once.
- **`lib/agent/{tool-registry,execute-tool,mcp-server,mcp-store}.ts`** — one tool executor behind two front-ends (in-app agent **and** the MCP server).
- **`app/api/agent/route.ts`** / **`app/api/mcp/route.ts`** — the in-app and MCP Route Handlers.
- **`components/`** — the studio shell and the chat panel.

LLM calls happen only on the server. `applyOp` runs in the browser against the live `editor`, so the
preview and Twick's free undo reflect every change. (Per Twick's architecture rules.)

## Run

```bash
pnpm install
cp .env.local.example .env.local   # set GEMINI_API_KEY
pnpm dev                           # http://localhost:3000
```

The app seeds three title clips so "the 3rd clip" is meaningful. Try the canonical prompt:

> delete the 3rd clip and add a title 'Intro' for the first 3 seconds

## Phase 1 gate

```bash
GEMINI_API_KEY=... pnpm test:loop   # runs the canonical prompt 10× and checks the emitted ops
```

Gate passes when it reports `10/10`, multi-clip references resolve correctly, and undo (free via
Twick) cleanly reverts.

## MCP server — drive the timeline from Claude Code / Cursor / Codex

The same tool executor the in-app agent uses is exposed over MCP (Streamable HTTP, JSON-RPC),
so an external coding agent can read and edit the timeline. It's **disabled unless `MCP_TOKEN` is
set** (safe by default), and gated by `Authorization: Bearer $MCP_TOKEN`.

```bash
MCP_TOKEN=$(openssl rand -hex 24) pnpm dev      # enable the endpoint
```

Point a client at `http://localhost:3000/api/mcp?project=default` with that bearer token. Tools:
`get_timeline`, `check_timeline_health`, one per op (`addText`, `addShape`, `trim`, …), and the
generative tools (`generate_image`, `generate_video`, `check_media_job`). Edits persist to the shared
`.data/projects/<id>.json` store, so the browser and the external agent edit the same project. Tool
failures come back as `isError` + an actionable message (errors-as-data), not exceptions. Offline-verify
the protocol and executor with `pnpm test:mcp`.

## Generative media (W4)

A provider seam (`lib/agent/media-gen.ts`, sibling to `llm.ts`) generates stills and video and drops
them on the timeline:

- **Gemini** (Imagen for images, Veo for video) — set `GEMINI_API_KEY`.
- **Stub** — `MEDIA_GEN_PROVIDER=stub` returns a real placeholder image so the whole submit → poll →
  place flow is exercised offline (`pnpm test:media`), no credits spent.

The **Generate** panel in the left nav drives this from the app: pick Image/Video, enter a prompt,
and the result is placed at the playhead with a Recent history (thumbnail + Re-add). Routes
`POST /api/media/generate`, `GET /api/media/job/[id]`, `GET /api/media/models` back it (the browser
places media via the real `addMedia` op). The MCP/headless executor appends the equivalent
`ElementJSON` directly, since Twick's media decode is browser-only. Images return inline; video is
async (poll `check_media_job`). Deferred: `import_media` byte caching for short-lived Veo URLs, and
live transcription.

## Tests

```bash
pnpm test:offline   # deterministic: serialize / validate / health        (no key)
pnpm test:apply     # real headless TimelineEditor apply + undo            (no key)
pnpm test:mcp       # executeOps atomic rollback + MCP JSON-RPC dispatch   (no key)
pnpm test:transcript # word-cut planner + removeWords end-to-end           (no key)
pnpm test:media     # media provider/job-store + generate→place flow (stub) (no key)
pnpm test:keyframes # keyframe sampler + expand + setKeyframes end-to-end       (no key)
pnpm test:smoke     # 3 real agent turns → atomic apply → health          (needs key)
pnpm test:gates     # full live battery (Phases 1–3)                       (needs key)
```

## Swapping the LLM to Claude

Add a `ClaudeProvider` implementing `LlmProvider` in `lib/agent/llm.ts` (Anthropic tool-use with the
same `emit_operations` tool), set `ANTHROPIC_API_KEY` and `LLM_PROVIDER=claude`. Nothing else changes —
ops validation, the route, and the client are provider-independent.
