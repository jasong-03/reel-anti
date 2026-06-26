# Audit & Plan — wire the remaining static UI

Audit of `agent-studio/components/studio/*`: which controls are **real logic** vs **static / hardcoded**,
and a prioritized plan to implement the gaps. No code changed yet — this is the plan.

## Legend
✅ works · ⚠️ partial / has a bug · ❌ static (renders but does nothing)

---

## Inventory by component

### `top-header.tsx`
- ✅ Undo / Redo / Save / Export (real)
- ⚠️ Project name: rename works (click-to-edit) but the `▼` implies a menu (rename/duplicate/delete) — none
- ⚠️ Save status: initial state hardcoded `"saved"` even before any save (false signal)
- ❌ Help button · ❌ Bell (notifications)

### `center-workspace.tsx`
- ✅ Play/Pause/Seek/Skip, scrubber, volume slider, time display (real)
- ⚠️ Zoom button: cycles Fit/100/150/200 but `Fit` and `100%` are both scale=1 (no real fit-to-container math)
- ❌ "Sequence 01" dropdown · ❌ "Fit ▼" dropdown · ❌ Fullscreen · ❌ Screen-preview · ❌ Snapshot (should capture a PNG) · ❌ Volume icon (mute toggle)

### `properties-panel.tsx`
- ✅ Position X/Y, Rotate, Opacity, Speed, Color fill, Font size, Volume (real, wired to selected element)
- ⚠️ **Stale values bug**: panel does not depend on `changeLog`, so after the agent (or any external edit) changes the selected clip, displayed values don't refresh
- ❌ **Scale slider** — `readOnly`, hardcoded `100%` (looks editable, does nothing) — most misleading
- ❌ **Tabs** Video/Audio/Effect/Animation — switch state but content is identical regardless of tab
- ❌ **Crop** "Type: None" — static dropdown
- ❌ **Animation** — no controls at all (Twick `ElementAnimation` not wired)
- ❌ **Shadow** — "coming soon" placeholder
- ⚠️ **AI Tools** — text only (no actual action button)

### `agent-panel.tsx`
- ✅ Chat → ops → action chips → Add to timeline → per-turn undo (real)
- ⚠️ "Streaming" is a fake typewriter reveal of the final text, not real token streaming from the model
- ❌ **Attach (paperclip)** · ❌ **Voice input (mic)**

### `side-panel.tsx`
- ✅ Text / Elements / Audio / Assets (incl. local upload + drag-drop) / Effects (zoom, grade) — all add real elements
- ⚠️ **Transitions** — `editor.addTransition` stores metadata; visualizer references transitions so it *should* render — **needs visual verification**
- ⚠️ **Templates** — only 3 hardcoded title presets via `loadProject` (no real gallery / thumbnails)

### `timeline-panel.tsx`
- ✅ Drag-move, edge-trim, select+seek, split/delete, snap toggle, zoom, Add Track, playhead, undo/redo (real)
- ⚠️ Cut and Split call the same `splitSelected` (Cut should ripple-cut or differ)
- ⚠️ Add Track always creates an `element` track (no type chooser)
- ❌ Select(cursor) tool · ❌ More · ❌ Search (clip search) · ⚠️ Snap `▼` (toggles, but no granularity menu)

### `left-nav.tsx`
- ✅ Agent + 7 content tabs switch the left panel (real)
- ❌ **Settings** · ❌ **Feedback**

---

## Implementation plan (prioritized)

### P0 — Misleading: looks functional but isn't (fix first)
1. **Properties stale-values bug** — derive values with a `changeLog` dependency (re-read selected element on every edit). *Small.*
2. **Scale slider** — wire to real size: text→`fontSize`, rect→`props.width/height`, circle→`radius`, video/image→`frame.size` (store base size in metadata for a clean % scale). *Medium.*
3. **Properties tabs** — render tab-specific sections: Video=Transform/Crop/Speed, Audio=Volume/Fade, Effect=effect params, Animation=enter/exit. *Medium.*
4. **Save status truth** — start `"unsaved"`/neutral; flip to dirty when `changeLog` advances past last save; `"saved"` only after a successful save. *Small.*
5. **Snapshot** — grab the player `<canvas>` → `toDataURL("image/png")` → download. *Small–Medium.*

### P1 — Expected core features missing
6. **Agent: Attach** — file → object URL → `addMedia` at playhead (reuse side-panel import); optionally pass an image as multimodal context. *Small.*
7. **Agent: Voice** — Web Speech API `SpeechRecognition` → transcribe into the prompt box. *Small.*
8. **Animation tab** — preset enter/exit (`fade`, `slide`, `pop`) via `element.setAnimation(new ElementAnimation(name)…)` + `updateElement`. *Medium.*
9. **Crop** — map to Twick `frame` / `objectFit`; offer aspect presets. *Medium — verify Twick crop support first.*
10. **Fullscreen** — `requestFullscreen()` on the preview container. *Small.*
11. **Settings panel** — resolution / fps / background color (`editor.setBackgroundColor`, `setVideoResolution`). *Small–Medium.*
12. **Transitions render verification** — confirm crossfade/zoom actually show in preview+export; if metadata-only, implement in the overlay or document the limit. *Research.*
13. **Templates gallery** — expand presets (intro/outro/lower-third/captions) with thumbnails; load full `ProjectJSON`. *Medium.*

### P2 — Cosmetic / quick wins
14. Help → docs link/popover · Bell → notifications popover (empty state)
15. Timeline: Search → filter/scroll to clip · Select tool → explicit select mode · Snap `▼` → granularity menu (0.1/0.5/1s) · Add Track → type chooser · distinct Cut (ripple) vs Split
16. Center: real "Fit" math (scale to container) · Sequence dropdown (rename/manage) · Volume mute toggle
17. Feedback → mailto/issue link · Project-name dropdown menu (rename/duplicate/new)
18. Agent: real token streaming (SSE from `/api/agent`) instead of typewriter

---

## Notes
- **Security** (sweep done): no hardcoded secrets; `.env.local` gitignored; `/api/agent` Zod-validates input; `/api/projects` validates `id` with a strict regex (no path traversal). Gap for production: `/api/projects` has **no auth** (anyone can read/write the `default` project) — fine for local/internal, must gate before any deploy.
- Twick `frame-effects`/`transition` are referenced by the visualizer, so zoom/crossfade likely render — but this was not visually verified; item 12 covers it.

## Suggested execution order
P0 (1→5) in one pass (mostly properties-panel + 2 small files) → P1 agent (6,7) + animation (8) + fullscreen/settings (10,11) → verify transitions (12) → P2 polish as time allows.
