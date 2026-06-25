# Antigravity for Video — Phase Plan

A staged roadmap from "does the core loop even work" to "team uses this daily." Each phase has a single thesis it must prove, concrete deliverables, and a gate you must pass before spending money/time on the next. Stop early at any phase if the gate fails — that's the point of phasing.

Foundation: fork **Twick** (`@twick/studio` + `@twick/timeline` + `@twick/mcp-agent`), Next.js + React + TS, WebCodecs export, Claude tool-calling for the agent. Internal tool → Twick's Sustainable Use License covers you for free.

---

## Phase 0 — Spike & Decision (3-4 days)

**Thesis:** Twick is forkable and its timeline seam is good enough to drive from an agent.

**Do:**
- Clone Twick, `pnpm install && pnpm dev`, get `@twick/studio` running locally.
- Load 2-3 real work videos. Confirm timeline / preview / WebCodecs export work on your machine + browser.
- Read `@twick/mcp-agent` source fully. Read `useTimelineContext()` (`editor`, `present`, `canUndo`).
- Write throwaway code: serialize timeline → JSON, fire 2 hardcoded ops (addText, removeElement) via `editor.*` methods, watch preview update.

**Deliverable:** A running fork + a half-page note: "timeline state shape, the 5 editor methods I'll need, what mcp-agent already solves."

**Gate (must pass to continue):** You can read timeline state as JSON AND mutate it programmatically with preview reflecting the change. If Twick fights you here, reconsider OpenVideo or raw Diffusion core *now*, not later.

---

## Phase 1 — Core Agent Loop / Prototype (1-1.5 weeks)

**Thesis:** Claude can read the timeline and emit validated operations that apply reliably.

**Do:**
- Define the operation schema (~7 ops) as Zod types: addText, addMedia, trim, move, split, remove, removeSpan.
- Build `serializeForAgent(editor)` — compact state with stable ids.
- Build `applyOp(editor, op)` — deterministic map: one op → one Twick editor call.
- Build `/api/agent` Route Handler: `{ timelineJSON, message }` → Claude tool-calling → `{ ops, reasoning }`. Zod-validate; on failure feed error back for one self-correction retry.
- Wire Twick's left chat panel → route → applyOp loop.

**Deliverable:** Working chat→edit loop in the real UI.

**Gate:** Canonical prompt *"delete the 3rd clip and add a title 'Intro' for the first 3 seconds"* succeeds 10/10 runs. Multi-clip references resolve correctly. Undo works (free via Twick).

**This is the make-or-break phase.** If the loop is reliable, everything after is linear work. Budget your best focus here.

---

## Phase 2 — Breadth: Cover the Video Types (1-1.5 weeks)

**Thesis:** One agent handles cuts + captions + motion graphics — your "tổng hợp nhiều loại" requirement.

**Do:**
- **Asset flow:** Twick BrowserMediaManager (IndexedDB) + Pexels/Unsplash providers. `addMedia` references by URL.
- **Transcript editing:** `@twick/cloud-transcript` → word-level JSON. Implement `removeSpan` (words → time → split+remove). Prompt: *"cut every 'um' and the repeated part."*
- **Motion graphics:** map an `addScene`/effect op onto Twick's Rectangle/Circle/Icon/Caption + `@twick/effects` (WebGL) + `useGenerateImage`. Cover the "recreate this + zoom A→B" pattern from the Motionfly screenshot.

**Deliverable:** Agent demonstrably does 3 categories: rough-cut editing, transcript-based trimming, motion-graphic overlays.

**Gate:** A single chat session can take raw footage → trimmed cut → captioned → one motion-graphic element, no manual timeline touching.

---

## Phase 3 — Robustness & Trust (1 week)

**Thesis:** The agent is safe to hand to a non-author teammate without it corrupting projects.

**Do:**
- Op validation against live state: id exists? start<end? url reachable? Reject + explain.
- Self-correction loop: return validation errors to Claude, let it fix.
- Multi-step transactions: *"make an intro"* → N ops → applied as one undo-able unit.
- Guardrails: cap op count per turn, confirm destructive bulk deletes, never touch elements outside the request.
- Show the agent's plan (reasoning + ops) before/after applying so the user can undo with confidence.

**Deliverable:** An agent that explains what it did, can be undone cleanly, and fails gracefully.

**Gate:** Run 20 varied real prompts; zero corrupted timelines, every action undo-able, every failure produces a useful message not a crash.

---

## Phase 4 — Internal Pilot (1-2 weeks)

**Thesis:** Real teammates get value and come back.

**Do:**
- Project persistence (Twick `saveProject`/`loadProject` → your storage / S3-R2).
- Basic accounts or shared workspace (whatever your team needs — keep minimal).
- Latency pass: Haiku for mechanical ops, Opus only for planning; stream reasoning.
- Onboard 2-3 colleagues (incl. Quan if relevant). Collect prompts that fail.
- Lightweight usage logging: what people ask, what ops get emitted, where it breaks.

**Deliverable:** Deployed internal instance, 2-3 active users, a log of real prompts.

**Gate:** At least one teammate uses it unprompted for real work in a week, and prefers it to their manual workflow for that task. If nobody comes back, the concept needs rethinking before scaling.

---

## Phase 5 — Scale & Polish (ongoing, only if Phase 4 passes)

**Thesis:** It holds up under real load and broader tasks.

**Do:**
- Server-side render path (`@twick/render-server`) for long/multi-track exports beyond WebCodecs limits.
- Expand op vocabulary based on real failed prompts (data-driven, not speculative).
- Cost controls: prompt caching, model cascade, cache common edits.
- Better motion-graphics library (lift Keyloom scene primitives — Remotion components as overlays/assets).
- Collaboration / versioning if the team needs it.

**Gate:** No hard gate — this is iterative product work driven by pilot feedback.

---

## Sequencing logic (why this order)

- **Risk-first:** the riskiest unknown (agent reliability) is proven in Phase 1, before any breadth or polish investment.
- **Breadth before robustness:** you want to know the agent *can* span video types (Phase 2) before hardening (Phase 3) — no point bulletproofing a narrow tool.
- **Trust before users:** Phase 3 guardrails come before Phase 4 pilot so teammates don't lose work and abandon it.
- **Value before scale:** Phase 5 infra spend only after Phase 4 proves people actually want it.

## Rough timeline
- Phases 0-1: ~2 weeks (your stated prototype window) → core validated.
- Phases 2-3: ~2-3 weeks → usable, trustworthy.
- Phase 4: ~1-2 weeks → piloted.
- Total to "team uses it": ~5-7 weeks part-time. Phase 5 is open-ended.

## Kill criteria (when to stop)
- Phase 0 gate fails → Twick wrong tool; evaluate alternatives or shelve.
- Phase 1 gate fails after real effort → agent-controlled timeline isn't reliable enough yet; revisit when models improve.
- Phase 4 gate fails → people don't want it; stop building, learn why.