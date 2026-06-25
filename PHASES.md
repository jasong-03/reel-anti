# Phase Status — Antigravity for Video

Implementation status against [`plan.md`](./plan.md). Code lives in [`agent-studio/`](./agent-studio).

Legend: ✅ built & verified (typecheck + production build) · 🔑 needs a valid `GEMINI_API_KEY`
to verify at runtime · 👥 acceptance is human-gated (real teammates / real load).

---

## Phase 0 — Spike & Decision ✅
- Cloned Twick, read the timeline seam in full, mapped state shape + the editor methods.
- Decision: host app importing published `@twick/*` (not a monorepo fork) — see [`PHASE0-NOTES.md`](./PHASE0-NOTES.md).
- **Gate (read JSON + mutate with preview):** PASSED — `getProject()` reads, the editor methods mutate, undo is free.

## Phase 1 — Core Agent Loop ✅ (LLM-emit gate 🔑)
- 7-op Zod schema, `serializeForAgent`, deterministic `applyOp`, `/api/agent` route, Gemini behind a
  swappable tool-calling adapter, one self-correction retry, chat panel wired to the live `editor`.
- **Apply half — VERIFIED without a key:** `pnpm test:apply` drives the real `@twick/timeline`
  editor in Node through the canonical plan and asserts the end state + clean undo (turn-revert and
  native). 8/8 pass. (This surfaced and fixed a real bug: loaded-from-JSON elements missing `trackId`
  now get it stamped in `findElement`.)
- **Emit half — gate (canonical prompt 10/10):** harness built (`pnpm test:loop`). Last run hit
  `API_KEY_INVALID — API key expired`; **rerun with a fresh key to record 10/10.**

## Phase 2 — Breadth ✅ (runtime gate 🔑)
- Rough-cut editing: `trim` / `move` / `split` / `remove` / `removeSpan`.
- Transcript trimming: caption word-timings surfaced in the agent view (`words: word@ms`); fillers
  are cut via per-word `removeSpan`. (Live transcription via `@twick/cloud-transcript` is a separate key.)
- Motion graphics: `addShape` (rect/circle/icon), `addCaption`, `addZoom` (Ken-Burns frame effect).
- **Gate (one session: footage → trim → caption → motion element):** reachable through chat; needs the
  key to drive end-to-end, and motion-FX visual fidelity wants a manual look in the preview.

## Phase 3 — Robustness & Trust ✅ (runtime gate 🔑)
- Two-layer validation: Zod (shape) + `validate-ops` (live state — id exists, bounds, split-inside,
  trim-narrows-only, zoom-target). Errors feed the single self-correction retry.
- Transactions: each turn snapshots the project; **"↶ Undo this change"** reverts a whole turn as one step.
- Guardrails: op cap (Zod max 20); bulk/`removeSpan` deletions require **explicit Apply confirmation**
  showing the plan first; the agent is instructed not to touch elements outside the request.
- **Gate (20 varied prompts, zero corruption, all undo-able):** mechanisms in place; the 20-prompt run needs the key.

## Phase 4 — Internal Pilot ✅ substrate (acceptance 👥)
- Persistence: `/api/projects` file-backed store + localStorage fallback, Save/Load in the UI
  (S3/R2 swap is a one-function change).
- Usage logging: `.data/agent-usage.jsonl` — message, ops, model/tier, attempts, failures.
- Latency/cost: `model-router` cascade (flash for mechanical edits, pro for planning) — the
  Haiku/Opus split from the plan, Gemini today.
- **Gate (a teammate returns unprompted):** inherently human — needs deployment + real users.

## Phase 5 — Scale & Polish 👥 (open-ended, by design)
The plan sets **no hard gate** here; it's continuous, pilot-driven work. Hooks already in place:
- **Cost controls:** stable `SYSTEM_PROMPT` is prompt-cache friendly; the model cascade is live.
- **Data-driven op expansion:** the usage log captures failing prompts to prioritize new ops.
- **Server render path:** long/multi-track exports beyond WebCodecs → `@twick/render-server`
  (deployment work, deferred until pilot demand). Browser export already ships in TwickStudio.

---

## Verified today (no key needed)
```bash
cd agent-studio
pnpm typecheck     # clean
pnpm build         # clean — /api/agent + /api/projects compile
pnpm test:offline  # 12/12 — serialize, semantic validation, model cascade
pnpm test:apply    # 8/8  — real Twick editor: apply canonical plan + undo
```

## To finish the LLM-driven gates (one command)
```bash
cp .env.local.example .env.local   # add a valid GEMINI_API_KEY
pnpm test:gates    # runs ALL of Phase 1/2/3's gates against the real editor:
                   #   Gate 1: canonical prompt 10/10
                   #   Gate 2: multi-step session (cut → caption → motion overlay)
                   #   Gate 3: 20 varied prompts, zero timeline corruption
pnpm dev           # exercise media ops + motion-FX fidelity in the UI
```
`test:gates` reuses the same headless editor + corruption checker that `test:apply` and
`test:offline` already verify without a key — so when a key is present, only the live model behavior
is newly exercised; the apply/validation/corruption machinery is pre-proven.

The only unverified items are the ones that require a live model (🔑), deployed infra, or real
teammates (👥). Everything that can be proven deterministically, is.
