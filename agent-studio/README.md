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

- **`lib/twick/ops.ts`** — the 7-op Zod contract (`addText`, `addMedia`, `trim`, `move`, `split`, `remove`, `removeSpan`).
- **`lib/twick/serialize.ts`** — compact, index-annotated timeline view the model reads.
- **`lib/twick/apply-op.ts`** — deterministic one-op-to-one-`TimelineEditor`-call map (client-side).
- **`lib/agent/llm.ts`** — provider-agnostic tool-calling seam; Gemini today, Claude drop-in.
- **`lib/agent/run-agent.ts`** — serialize → prompt → tool-call → validate → retry-once.
- **`app/api/agent/route.ts`** — the Route Handler.
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

## Swapping the LLM to Claude

Add a `ClaudeProvider` implementing `LlmProvider` in `lib/agent/llm.ts` (Anthropic tool-use with the
same `emit_operations` tool), set `ANTHROPIC_API_KEY` and `LLM_PROVIDER=claude`. Nothing else changes —
ops validation, the route, and the client are provider-independent.
