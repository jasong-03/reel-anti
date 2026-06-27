# Integration Plan — port Palmier Pro ideas into reel-anti

Synthesis of a 4-agent deep study of [palmier-io/palmier-pro](https://github.com/palmier-io/palmier-pro)
(native macOS AI video editor, Swift/Metal). Goal: bring its best **ideas/patterns** into our
web app **reel-anti** (`agent-studio/`, Next.js 14 + `@twick/timeline` + `@twick/browser-render`).

## Status
- ✅ **Phase 1 — Foundation (W1 + W2) shipped** on branch `develop` (2026-06-27).
  - W2: 10-op schemas hardened to `.strict()` (unknown-field rejection w/ JSON-path errors); `apply-op.ts` split into per-domain `lib/twick/apply/*`; transactional `executeOps` (validate up-front → snapshot → rollback-whole-batch-on-failure); serialize compaction.
  - W1: headless editor promoted to `lib/twick/headless.ts`; single `tool-registry` + stateless `execute-tool` (errors-as-data, return-what-changed); MCP Streamable-HTTP route `app/api/mcp` (token-gated, persists to shared `.data/projects` store); prompt doctrines.
  - Verified: `test:offline` 16/16, `test:apply` 8/8, `test:mcp` 17/17, `typecheck` clean, `build` clean, live 3-prompt smoke 3/3, **MCP driven over HTTP end-to-end** (addText/addShape persist across calls; errors-as-data on bad field + missing id).
  - Deviation: MCP route hand-rolls spec-compliant JSON-RPC (MCP = JSON-RPC/HTTP) using the SDK's protocol-version constants; the SDK's full Node transport can drop in later for server-initiated SSE. `@twick/timeline` is marked a server webpack external so it runs headless at runtime instead of being bundled (React `createContext` interop).
- 🚧 **Phase 2 — W5 transcript editing: CORE shipped** (2026-06-27, uncommitted).
  - `lib/twick/transcript.ts` pure word-cut planner (resolveSelections + planWordCuts, tight/balanced/loose gap-merge); `removeWords` op (11th op) applied as right-to-left ripple deletes (one undo); serialize surfaces indexed `[idx:word@start-end]` word ranges; wired into validate-ops (index-range guard + destructive), tool-registry/MCP, the in-app LLM schema, and the prompt.
  - Verified: `test:transcript` 18/18, all prior suites green, typecheck + build clean, and a **live agent turn** correctly emitted `removeWords words=[1,4]` to strip both "um" fillers.
  - Deferred (honest scope): live transcription as the *source* of `wordsMs` (`@twick/cloud-transcript`, key/quota-gated) and smart `add_captions` phrase-chunking — the cut engine is done and works on any caption that already carries word timings.
- 🚧 **Phase 2 — W4 generative media: BACKEND shipped** (2026-06-27, uncommitted).
  - `lib/agent/media-gen.ts` provider seam (sibling to llm.ts): `GeminiMediaProvider` (Imagen sync + Veo async-poll, hardcoded catalog) + deterministic `StubMediaProvider` for offline; in-memory job store; `getMediaProvider()` env resolution.
  - Routes `app/api/media/{generate,job/[id],models}`; MCP tools `generate_image` / `generate_video` / `check_media_job` (16 tools total). Images return inline; video is async (submit→poll). Headless executor appends media `ElementJSON` directly (Twick's `addMedia` decodes media → browser-only; verified `ELEMENT_NOT_ADDED` headless), so the MCP path actually places media.
  - Verified: `test:media` 14/14 (stub), all suites green, typecheck + build clean, and **HTTP smoke**: /api/media/* + MCP `generate_image` places a persisted image element read back via get_timeline.
  - Deferred (honest scope): `import_media` byte-caching for short-lived Veo URLs, and a LIVE Imagen/Veo run (needs a valid GEMINI_API_KEY — current one is expired; structurally ready).
- ✅ **W4 Generate UI shipped** (2026-06-27, uncommitted): left-nav "Generate" panel (`components/studio/generate-panel.tsx`) — Image/Video toggle, prompt, model + aspect selects, async poll, Recent history (thumbnail + Re-add), cost note. **Visually verified via headless-Chrome/CDP** against the stub provider: prompt → generate → poll → image placed on a new video track at the playhead.
- ✅ **W3 keyframes: spike + implementation shipped** (2026-06-27, uncommitted).
  - Spike verdict (via deep read of the Twick clone): the visualizer interpolates chained CONTIGUOUS `ElementFrameEffect` segments per frame — so keyframes need NO Twick patching. Frame effects support scale (frameSize) + position (framePosition) + rotation, on video/image only; opacity is element-level (no per-frame hook) so it's excluded.
  - `lib/twick/keyframes.ts`: pure sampler (sampleScalar/sampleVec2, hold/linear/smooth, clamp/hold-out, smoothstep) + `expandKeyframes` (samples at a fixed timestep → dense contiguous frame-effect specs honoring our interp). `setKeyframes` op (12th): stores the bag on props + rebuilds the element's frame effects. Wired into apply/validate/registry/llm/prompt.
  - Verified: `test:keyframes` 23/23 (sampler + expand + end-to-end through a real headless ElementFrameEffect: 61 contiguous segments, correct scale at each, healthy, clear-on-empty); all suites green, typecheck clean.
  - Deferred (honest scope): retime hooks (trim/split/playbackRate re-clamp — keyframes are element-relative so move is unaffected and the sampler hold-clamps; full re-expansion on trim is a follow-up), opacity (no frame-effect hook), and generalizing addZoom onto the keyframe path.
- ✅ **Audit + UI verification + fixes** (2026-06-27, uncommitted): independent adversarial review of the whole P1–P3 body, then fixed every real finding.
  - **C1 (CRITICAL, data loss):** MCP store now serializes load→edit→save per project id (in-process mutex) + atomic write (tmp+rename), so JSON-RPC batches / concurrent calls chain instead of clobbering. Regression-tested (batch persists both edits, verified over HTTP).
  - **H1:** the `addMedia` op now works headless via direct ElementJSON append (Twick's media decode is browser-only) — the MCP tool no longer lies. **H2/M3:** stub video returns a real loadable mp4 (not a PNG); generated jobs are evicted after placement + the store is capped. **H3:** single-server job-store assumption documented.
  - **M1:** `.max()` bounds on `words`/`keyframes` + `reduce` (no `Math.max(...spread)` stack-blow out of errors-as-data). **M2:** setKeyframes flags when it replaces existing frame effects. **L1/L2:** timing-safe + case-insensitive bearer check. **L5:** generate-panel poll timers self-evict. removeWords description clarified (ripples across all tracks, true Descript).
  - Verified: all 6 offline suites green (incl. new H1/C1/H2/M3 regression tests), typecheck + build clean, live agent 4/4 across the vocabulary, and **UI via headless-Chrome** (agent chat applies ops, Generate places media, all 9 panels render, no React errors). The reviewer's "actually fine" list confirmed: executeOps rollback fidelity, rotation cast round-trip, strict schemas, expand bounds, isValidProjectId traversal guard.
- ⏭️ Optional next: live Imagen/Veo smoke after `GEMINI_API_KEY` refresh; retime hooks for keyframes; `import_media` Veo caching.

## ⚠️ License rule (non-negotiable)
palmier-pro is **GPL-3.0**. We **reimplement ideas/algorithms in our own TypeScript** — we do NOT
copy code, prompt text, or files. The pure algorithms (keyframe sampler, WordCutPlanner kept-gap,
FCPXML structure, audio NCC) are reimplemented from the described behavior, not pasted. This keeps
reel-anti free of GPL obligations.

## Where we stand vs palmier
- reel-anti: web, Twick (WebCodecs export free), ~10 single ops, in-app agent + `/api/agent`, properties/timeline/agent UI wired.
- palmier: native, 40 MCP tools, batch ops, keyframes, generative AI in-timeline, transcript editing, FCPXML, color/effect stacks, MCP server for external agents.
- The gap is **capability depth + an MCP server**, not the core concept (which we already have).

---

## Workstreams (each maps palmier → reel-anti files)

### W1 — MCP server + agent-loop hardening  ·  effort M-L · risk low-med · value ★★★★★
Palmier's biggest structural idea: **one tool executor, two front-ends** (in-app agent + a loopback MCP HTTP server) so Claude Code / Cursor / Codex can drive the timeline.
- Factor a shared `executeTool(name, args)` out of `app/api/agent/route.ts` → `lib/agent/execute-tool.ts`.
- Add `app/api/mcp/route.ts` using `@modelcontextprotocol/sdk` `StreamableHTTPServerTransport`; `tools/list` from one registry, `tools/call` → `executeTool`. Gate to localhost/secret (palmier binds `127.0.0.1:19789`).
- Harden the loop (all from palmier doctrine):
  - **Errors as data** — return `{content, isError}`; tool errors are actionable prose ("unknown field X; allowed: …", "ambiguous id, re-read") the model self-corrects on, not thrown exceptions.
  - **Id validation** against the live timeline id-universe; unknown/ambiguous → "re-read" error.
  - **Return-what-changed** — ops return created ids + new times so the model skips re-serializing; encode "don't re-read between your own edits" in the prompt.
  - **Multi-turn tool loop** (read tool → see result → edit tool), not single-shot.
  - **Prompt caching** on system+tools+history (Anthropic via OpenRouter / Gemini implicit); log hit-rate in `usage-log.ts`.
  - **Multimodal verify**: an `inspect_timeline` tool that renders the current frame via `@twick/browser-render` and returns it as an image block so the model can *see* its edits.
- Files: `lib/agent/execute-tool.ts` (new), `app/api/mcp/route.ts` (new), `lib/agent/run-agent.ts`, `lib/agent/prompts.ts`, `lib/twick/serialize.ts`.

### W2 — Batch ops + domain-split applyOp  ·  effort M · risk low · value ★★★★
- Convert ops to **array form** like palmier: `addClips`, `moveClips`, `setClipProperties`, `splitClips`, `rippleDelete`, `removeWords` — each applied as **one undo/history entry**, validated up-front ("one bad entry rejects the whole call, no partial state").
- Strict input validation with **JSON-path-prefixed, agent-readable errors** (reject unknown fields + non-finite numbers). Our Zod layer already gives most of this; add unknown-key rejection + path messages.
- Split `lib/twick/apply-op.ts` (one big switch) into per-domain modules mirroring palmier's `+Clips/+Color/+Texts/+Captions/+Media/+Timeline`, shared helpers in a base.
- Compaction: round floats to 3 places, omit default-valued fields in `serialize.ts` (palmier's token discipline).
- Files: `lib/twick/ops.ts`, `lib/twick/apply-op.ts` → `lib/twick/ops/*.ts`, `lib/twick/serialize.ts`.

### W3 — Keyframes (the biggest capability gap)  ·  effort L · risk HIGH · value ★★★★
Palmier: 6 typed per-clip keyframe tracks (opacity/position/scale/rotation/crop/volume), **clip-relative** frame offsets, per-keyframe `interp ∈ {linear, hold, smooth}`, **active-track-overrides-static**, `smoothstep(t)=t²(3−2t)`. Plus per-effect-param keyframes.
- **Storage (no migration):** Twick `ElementJSON` is an open props bag → add
  `props.keyframes = { opacity:[[t,v,interp]], position:[[t,x,y,interp]], scale:[[t,sx,sy,interp]], rotation:[[t,deg,interp]], crop:[…], volume:[…] }`, `t` = **element-relative seconds** (quantized to player fps to kill float drift).
- **Sampler** (`lib/twick/keyframes.ts`): clamp→bracket→switch on left keyframe interp (hold/linear/lerp∘smoothstep). Active array non-empty ⇒ ignore static `position/opacity/...`.
- **`setKeyframes` op**: `{ elementId, property, keyframes: rows }`, replace-whole-track, sorted, last-dup-wins, empty clears.
- **Retime hooks**: on trim/move/split/playbackRate, clamp keyframes to `[0,duration]` + rescale on speed change.
- **Generalize `addZoom`** → emit a 2-keyframe `scale`(+`position`) track.
- 🔴 **RISK / SPIKE FIRST:** the Twick **player/visualizer** must consume sampled per-frame props. Locate where the player reads `ElementAnimation`/`ElementFrameEffect` today and hook the sampler there. **Do a 1-day spike to confirm this integration point before building the full model.** If the player can't be driven per-frame from props, fall back to expanding keyframes into Twick's existing `ElementFrameEffect` segments.
- Files: `lib/twick/keyframes.ts` (new), `lib/twick/ops/*`, plus a Twick-player integration shim.

### W4 — Generative AI media  ·  effort M · risk med · value ★★★★★
Palmier headline feature. Pattern: **insert placeholder instantly → submit job → poll → swap real media in**. Client orchestration is open; only the provider backend is closed.
- `lib/agent/media-gen.ts` — a `MediaGenProvider` seam (sibling to `llm.ts`): `submit(req)→{jobId}`, `poll(jobId)→{status,resultUrls}`, `listModels(kind)`.
- Concrete provider: **Gemini** (`GEMINI_API_KEY` present) — **Imagen** for `generate_image`, **Veo** for `generate_video` (genuinely async → matches the poll pattern). Use the `ai-multimodal` skill's Gemini paths.
- Routes (1:1 with palmier's Convex fns): `POST /api/media/generate`, `GET /api/media/job/:id` (client polls every 2-4s / SWR), `GET /api/media/models`, plus `POST /api/media/import?url=` (proxy/cache bytes so short-lived gen URLs survive).
- Agent tools `generate_image` / `generate_video` / `import_media`: on success take `resultUrls[0]` → emit existing **`addMedia` op** → VideoElement/ImageElement. **No new timeline code.**
- Borrow palmier's agent-instruction flow: "generate a still first → confirm → animate it as the video's start frame; costs money; not undoable."
- Scope cuts (hackathon): hardcode a 2-3 model catalog; **gate on `GEMINI_API_KEY`** (skip Stripe/Clerk/credits); skip CLIP `search_media`, folders, upscale, audio-gen, reference-consistency.
- Files: `lib/agent/media-gen.ts` (new), `app/api/media/*` (new), `lib/twick/ops/media.ts`, `components/studio/side-panel.tsx` (Generate panel).

### W5 — Transcript-driven editing (Descript-style)  ·  effort M · risk low-med · value ★★★★
We already surface caption `wordsMs` in `serialize.ts` + have `removeSpan`. Palmier goes further.
- Use `@twick/cloud-transcript` → word-level `{text, start, end}` (we currently only have start; add **end**).
- `get_transcript` tool: flat **indexed** word list `[index, text, startMs, endMs]`.
- `remove_words` tool: accept indices + inclusive spans `[5, [12,18], 40]`; `cutAggressiveness ∈ {tight,balanced,loose}` (kept-gap ≈ 60/150/320 ms). Reimplement **WordCutPlanner.cutRanges** (pure fn): group consecutive selections into runs, leave half-kept-gap each side, merge adjacent ranges → list of removeSpan ranges in one undo. After cut, tell agent "indices shifted, re-read".
- `add_captions`: segment→phrase chunking that fits canvas width + `textCase` + per-word `wordsMs`, placed on a dedicated top caption track (round-trips with remove_words).
- Files: `lib/twick/transcript.ts` (new: word-cut planner + mapping), `lib/twick/ops/captions.ts`, `lib/agent/...`, reuse `serialize.ts` words.

### W6 — Properties panel upgrades  ·  effort M · risk low · value ★★★
- **Selection-aware tabs** computed from `el.getType()` (hide Audio for text, etc.) instead of always 4.
- **Multi-select**: shared-value blanking when clips disagree + fan-out edits (Twick `editor.updateElements([...])` already takes an array).
- Add **Flip H/V**, **dB volume scale** (−∞ mute floor) instead of raw 0-2, **Fade in/out** rows.
- **Drag-to-scrub numeric fields** with **live (no undo) vs commit (one undo)** split.
- Files: `components/studio/properties-panel.tsx`.

### W7 — Color / effect param stack  ·  effort M-L · risk med · value ★★★
Replace the fixed 6-string `mediaFilter` with a real stack.
- `props.effects = [{type, params, enabled}]` + a small registry (`brightness/contrast/saturation/blur/vignette/grain`), **singleton-by-type + prune-to-default**, merge semantics.
- Color as **named knobs** (`exposure/contrast/saturation/temperature/tint/highlights/shadows`), not raw CSS.
- Registry-described agent tool (`apply_effect`/`apply_color`) — inject available types/params/ranges into the tool schema (palmier's `effectCatalog()` pattern).
- Preview via CSS `filter`; export via a WebGL/canvas pass in the render path.
- (Defer: hue-target secondaries, `inspect_color` scopes/gap-hint loop.)
- Files: `lib/twick/effects-registry.ts` (new), `lib/twick/ops/color.ts`, properties Effect tab, render hook.

### W8 — FCPXML export (editorial interchange)  ·  effort M · risk low-med · value ★★★
Add a second export `mode:"fcpxml"` next to our WebCodecs MP4, so users round-trip into Resolve/FCP.
- JS FCPXML **1.10** serializer (broadest compat) modeled on palmier's documented structure: `<resources>`(format+assets+per-clip compound) → `<library>/<event>/<project>/<sequence>/<spine>` with one `<gap>` carrying lane-connected clips.
- Reverse-engineered encoding facts to reuse: time = rational `frames/fps s`; position = 1%-of-height units, centered, +Y up; scale = multiplier on conform-fit; rotation negated; flip = negative scale; crop = `<adjust-crop>` %; speed = `<ref-clip>`+`<timeMap>`; text = `<title>`+`<text-style-def>`. Document the lossy boundary (no color/effects/keyframed audio).
- Files: `lib/export/fcpxml.ts` (new), `lib/twick/ops/export.ts`, Export menu.

### W9 — sync_audio (optional, niche)  ·  effort M · risk low · value ★
Multicam/dual-system audio align via loudness-envelope normalized cross-correlation (WebAudio `OfflineAudioContext` → RMS per 10ms → NCC → nudge element start). Defer unless needed.

---

## Recommended sequencing

| Phase | Workstreams | Why | ~Effort |
|------|-------------|-----|---------|
| **1 — Foundation** | W1 (MCP + loop) + W2 (batch/domain-split) | Unlocks external-agent driving (the palmier differentiator) + makes all later ops cleaner/reliable | ~1 wk |
| **2 — Headline features** | W4 (generative AI) + W5 (transcript editing) | The two "wow" capabilities for a reels editor; both reuse `addMedia`/`removeSpan` | ~1-1.5 wk |
| **3 — Depth** | W3 (keyframes, after 1-day spike) + W6 (properties) + W7 (color/effects) | Pro-grade motion + UX; W3 gated on the player-hook spike | ~1.5-2 wk |
| **4 — Interop** | W8 (FCPXML) | Pro credibility / round-trip; self-contained | ~3-4 days |

## Quick wins to do first (highest value / lowest risk)
1. **W2 batch ops + errors-as-data** — small, makes the agent dramatically more reliable & cheaper.
2. **W1 MCP server** — medium, but it's the standout feature ("edit reel-anti from Claude Code/Cursor").
3. **W4 generate_image (Imagen)** — instant gratification gen, reuses addMedia.
4. **W5 remove_words** — Descript-style cutting, builds on existing wordsMs.

## Open risks / spikes needed
- **W3 keyframes**: confirm the Twick player can be driven per-frame from sampled props (1-day spike) before building the model. This is the only HIGH-risk item.
- **W4 Veo**: async job latency + short-lived result URLs → need the `/api/media/import` proxy/cache.
- **W5 transcription**: `@twick/cloud-transcript` may need a key/quota; confirm word-level end timestamps.
- **W7 color export**: applying named-knob color in the WebCodecs render path needs a WebGL filter pass.

## Cross-cutting patterns to adopt everywhere (cheap, high-leverage)
- Errors returned as readable data, not exceptions.
- Ops return what changed (ids + new times).
- "Don't re-read between your own edits" + "verify with a render/transcript" doctrines in the prompt.
- One batch = one undo entry; validate up-front.
- Generate tool descriptions from registries so docs never drift.
- Float-rounding + defaults-omitted compaction in serialization.
- Diagnostics trail (recent tools + last error) in `usage-log.ts`.
