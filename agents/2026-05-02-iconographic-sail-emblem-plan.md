# Iconographic Sail Emblem Plan (USDT + USDC titans, Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the crvUSD-llama design pattern (iconographic silhouette painted directly into the mainsail) to USDT (kraken) and USDC (compass rose) titan ships. Establish the iconographic sail emblem rule as repo-wide design language for unique- and titan-tier ships.

**Phase 1 (this plan):** USDT + USDC. Phase 2 (deferred, separate plan): remaining titans (DAI, USDS, sUSDS, sDAI, stUSDS) and unique heritage hulls without aligned iconographic emblems (BOLD, fxUSD, xAUT, PAXG).

---

## Design Rule (new repo invariant)

**Iconographic sail emblem rule (unique + titan tiers).** Every unique- and titan-tier ship carries a single iconographic silhouette painted directly into its mainsail at heraldic scale (~1/4 sail). Marks are silhouette-only — no text, no numerals, no literal logos. Brand identity reads through sail-cloth tint × emblem silhouette together. Standard hulls keep the runtime SVG-logo overlay.

**Examples:** Curve → llama, Tether → kraken, Circle → compass rose. Marks express brand identity through symbolic metaphor, not corporate logos.

**Why this works at sail-pixel scale:**

1. Silhouette-only (no bounding box, no matte) → reads as cloth weave, not sticker
2. Heraldic scale (~1/4 sail) → bold but breathing room
3. Sail-aware shading → fold-darkening makes the emblem feel woven into the cloth
4. Sail tint × emblem silhouette → tint carries brand color, silhouette carries brand metaphor

**Tradeoff (deliberate, this plan):** Animation is dropped for USDT and USDC. Multi-frame regeneration risks pixel drift between frames making the painted emblem flicker; static + heraldic emblem matches the proven crvUSD pattern. Titan scale (USDT 2.0, USDC 1.8) continues to carry monumentality. Re-introduction of frame animation is deferred to a future plan once a frame-consistent generation pipeline is in place.

---

## Per-Ship Specifications

### USDT — Kraken
- Asset id: `ship.usdt-titan`, dimensions **192×128** (unchanged from current)
- Sail tint: Tether teal `#009393` (matches existing livery primary)
- Emblem: bold kraken silhouette, single dominant cephalopod with curling tentacles, white / off-cream cloth color
- Symbolic metaphor: "tether" → things-bound-together → kraken's entangling tendrils
- Position: centered on the largest central mainsail
- Animation: **dropped** (no `usdt-titan-frames.png` after this plan)

### USDC — Compass Rose
- Asset id: `ship.usdc-titan`, dimensions **160×112** (unchanged from current)
- Sail tint: Circle blue `#2775ca` (matches existing livery primary)
- Emblem: bold 8-point compass rose silhouette, white / off-cream cloth color
- Symbolic metaphor: "Circle" → cardinal compass / settlement-routing
- Position: centered on the largest central mainsail
- Animation: **dropped** (no `usdc-titan-frames.png` after this plan)

---

## Implementation Steps

### 1. Doc updates (encode the new design rule)

- [ ] **1.1** `docs/pharosville/CURRENT.md` — add an "Iconographic sail emblem" paragraph in the visual model section after the heritage-hulls paragraph (around line 100); update line 195 ("keep logo-safe sail/pennant zones") to reflect the tiered rule (standard hulls keep logo-safe zones; unique + titan paint emblems in).
- [ ] **1.2** `docs/pharosville/ASSET_PIPELINE.md` — update Sprite Bible Ships entry (lines 86-93) to carve out unique + titan tiers from the "logo-safe area" rule and document the iconographic-emblem expectation.
- [ ] **1.3** `docs/pharosville/PIXELLAB_MCP.md` — update line 58 ("For ships, reserve a clean sail or pennant area for runtime logo marks") and line 130 ("ship sails/pennants too busy for runtime logo marks") to reflect the carve-out.
- [ ] **1.4** `docs/pharosville-page.md` — adjust line 59 to note unique+titan ships paint emblems directly while standard hulls still use the logo overlay.

### 2. PixelLab sprite generation

> Style anchor `2026-04-29-lighthouse-hill-v5`. Use `mcp__pixellab__create_map_object`. Save promoted PNGs to `public/pharosville/assets/ships/`, replacing existing.

- [ ] **2.1** Generate `ship.usdt-titan` (192×128) — kraken silhouette on teal mainsail. Prompt cues encode: tall ornate three-masted titan galleon, weathered timber hull with bronze trim, all sails tinted deep Tether teal `#009393`, single bold white kraken silhouette painted on the largest central mainsail at heraldic scale (curling tentacles, no text), oxidized-bronze masthead lantern, cream pennant at bowsprit, dark contact shadow, transparent margin ≥ 4 px.
- [ ] **2.2** Generate `ship.usdc-titan` (160×112) — compass rose silhouette on Circle-blue mainsail. Prompt cues encode: tall ornate three-masted titan galleon, weathered timber hull with brass trim, all sails tinted deep Circle blue `#2775ca`, single bold white 8-point compass rose silhouette painted on the largest central mainsail at heraldic scale (cardinal/intercardinal points, no text), oxidized-bronze masthead lantern, cream pennant at bowsprit, dark contact shadow, transparent margin ≥ 4 px.
- [ ] **2.3** Inspect each candidate at 100% and 25% zoom: emblem reads at both, no embedded text/letters/numerals, sail tint dominant, hull silhouette consistent with titan-family conventions.
- [ ] **2.4** Promote chosen PNGs to `public/pharosville/assets/ships/` (replacing existing `usdt-titan.png` and `usdc-titan.png`).
- [ ] **2.5** Delete orphaned `usdt-titan-frames.png` and `usdc-titan-frames.png`.

### 3. Manifest updates

- [ ] **3.1** In `public/pharosville/assets/manifest.json`:
  - Remove `animation` block from `ship.usdt-titan` and `ship.usdc-titan` entries.
  - Refresh `promptProvenance.jobId` for both with new PixelLab job IDs.
  - Bump `style.cacheVersion` to `"2026-05-02-iconographic-sails-v1"`.
- [ ] **3.2** Run `npm run check:pharosville-assets`. Expected post-state: total runtime asset count drops by 2 (orphaned frames PNGs removed); critical count unchanged.

### 4. Renderer wiring

- [ ] **4.1** In `src/renderer/layers/ships.ts:857`, extend the special-case skip:
  ```ts
  } else if (ship.id !== "crvusd-curve" && ship.id !== "usdt-tether" && ship.id !== "usdc-circle") {
    drawSailLogo({ ... });
  }
  ```
  Reason: USDT and USDC join crvUSD in the painted-emblem-only rendering path; the runtime SVG-logo overlay must not stack on top of the painted-in kraken/compass rose.

### 5. Sail tint masks

- [ ] **5.1** Update `SHIP_SAIL_TINT_MASKS` entries for `ship.usdt-titan` (lines 80-90) and `ship.usdc-titan` (lines 57-67) in `src/renderer/ship-sail-tint.ts`. Re-derive polygon coords from the new sprite geometry — the multi-sail layout may have shifted.
- [ ] **5.2** Confirm `ship-sail-tint.test.ts` still passes; both ids should remain in the tuned set (Tether teal and Circle blue are within `isSailTintPixel`'s recognised range).

### 6. Visual baselines

- [ ] **6.1** Run `npm run test:visual`; expect baselines that include USDT or USDC to diff. Inspect each diff visually — drift should match exactly the kraken/compass rose appearance at expected position/scale.
- [ ] **6.2** Update only baselines whose drift matches the design intent; commit baseline updates as a separate commit.

### 7. Final validation

- [ ] **7.1** `npm run typecheck`
- [ ] **7.2** `npm test`
- [ ] **7.3** `npm run check:pharosville-assets && npm run check:pharosville-colors`
- [ ] **7.4** `npm run build`
- [ ] **7.5** Manual visual review in dev server: zoom in on USDT and USDC, confirm kraken/compass rose paint in cleanly, no logo-overlay sticker stacked on top, sail tint dominant, titan scale preserved.

---

## Risks & Mitigations

- **Sprite quality drift.** Initial PixelLab outputs may not match the painted-emblem expectation, especially the strict "no text" constraint with a stylized cephalopod or compass rose. **Mitigation:** generate, review, regenerate per ship before progressing past Step 2. Don't batch.
- **Sail tint mask polygon drift.** New sprite geometry will not match the existing 192×128 / 160×112 polygon coordinates, even though dimensions are the same. **Mitigation:** Step 5.1 re-derives the polygons; do not skip the visual review.
- **Animation regression in user expectation.** Titans currently animate; this plan ships them as static. **Mitigation:** documented as deliberate Phase 1 tradeoff; Phase 2 plan re-introduces animation with a frame-consistent generation pipeline.
- **Visual baseline churn.** Most baselines containing USDT or USDC will diff. **Mitigation:** Step 6.1 inspects each diff visually before accepting.

---

## References

- `agents/completed/2026-05-01-unique-ship-category-plan.md` — design precedent (crvUSD llama as iconographic emblem)
- `agents/completed/usds-titan-squad-plan.md` — titan-tier sprite generation precedent
- `docs/pharosville/PIXELLAB_MCP.md` — sprite generation pipeline
- `docs/pharosville/CURRENT.md` — visual model source of truth
- `src/renderer/layers/ships.ts:857` — special-case skip site for painted-emblem ships
- `src/renderer/ship-sail-tint.ts` — sail tint mask polygons
