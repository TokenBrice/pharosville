# Unique Ship Category Implementation Plan (v2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision note (v2):** Incorporated review findings from three opus reviewers (code-correctness, art-direction, systems-impact). Key changes from v1: corrected manifest baseline (38→43, not 34→39); added `validate-assets.mjs` cap bump (Step 5.0); committed `"diamond"` literal for `bold-liquity` logo shape; switched test in 3.3 to public API; bumped sprite dimensions 128×96 → 136×100 and pushed themes onto sails (largest readable region); added shared bronze masthead lantern + cream bowsprit pennant as tier unifier; differentiated gold ships by silhouette (low squat barge vs tall ornate galleon); rewrote Step 4 prompts to forbid baked-in text/numerals/glyphs (style-anchor compliance); rewrote rationale copy in lore-voice; user-facing `sizeLabel` is **"Heritage hull"** (`sizeTier === "unique"` internally); shifted BOLD palette to oxblood and xAUT to Tether-teal-with-gold-trim; spelled out exact-set sail-tint test filter; explicit visual baseline blast list; coupled Step 1.1 + 6.5 same-commit constraint.

**Goal:** Add a new `unique` ship size tier — visually titan-adjacent (dedicated PixelLab sprite, larger-than-major scale, preserved through LOD, visible while moored) but smaller than titans and curated by *cultural significance* rather than stablecoin marketcap. Five inaugural members:

| Stablecoin id (fixture) | Sprite asset id | Theme | Rationale (detail panel copy) |
|---|---|---|---|
| `crvusd-curve` | `ship.crvusd-unique` | Llama (Curve mascot) | "Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves." |
| `bold-liquity` | `ship.bold-unique` | Spartan (hoplite crest, oxblood sails) | "Spartan crest hull — Liquity's stance on credibly neutral decentralization." |
| `fxusd-f-x-protocol` | `ship.fxusd-unique` | f(x) abstract crossed-bar motif | "Mathematical livery — f(x) Protocol's analytic identity." |
| `xaut-tether` | `ship.xaut-unique` | Treasury barge, Tether teal with gold trim | "Bullion barge — Tether's gold treasury reserve." |
| `paxg-paxos` | `ship.paxg-unique` | Tall ornate galleon, warm-gold sails | "Gilded merchantman — Paxos institutional gold custody." |

**Architecture:** A new `ShipSizeTier` value `"unique"` slots between `titan` (priority 7) and `flagship` (priority 5). Membership is decided by a single hard-coded registry `UNIQUE_SHIP_DEFINITIONS` (mirror of the existing `TITAN_SHIP_ASSET_IDS` precedent). Unique ships inherit titan-tier *visibility* behaviors (kept visible while moored, kept in LOD overlay/wake budgets) but *not* titan-tier render chrome (no foam/spray/full-pose model/sail flutter, no animation frames). They use the regular `drawAsset` static-PNG path with the standard `drawShipLiveryTrim` overlay, and they get their own per-sprite rows in `SHIP_SAIL_MARKS` / `SHIP_PEG_MARKS` / `SHIP_TRIM_MARKS` / `SHIP_SAIL_TINT_MASKS`. A new optional `ShipVisual.uniqueRationale` carries the curated copy line into the detail panel and accessibility ledger. The user-facing `sizeLabel` for unique ships is **"Heritage hull"** (lore-coherent maritime descriptor); the internal `sizeTier` discriminator stays `"unique"` for code clarity.

**Tier unifier (heterogeneous palette anchor):** All five sprites share an oxidized-bronze masthead lantern (matches the titan-squad lantern) and a cream-colored pennant strip at the bowsprit. This binds the visually disparate themes (green/oxblood/purple/teal/warm-gold) into one tier that reads as a coherent set rather than five disconnected art passes.

**Tech Stack:** TypeScript, Vite, React, Canvas 2D, Vitest, Playwright visual snapshots, PixelLab MCP for sprite generation.

**Out of scope (do NOT do here):**
- Any change to titan classification, scales, or chrome
- Changing peg/risk-band methodology, scoring thresholds, or DEWS semantics
- Touching API/Pages Function or shared/contract code
- Promoting any non-listed stablecoin to the unique tier
- Animated frames or sprite sheets for unique ships (single-frame deferred PNGs only)
- Mobile/responsive changes; desktop gate is preserved

---

## Visual Design Rationale

The unique tier exists because the titan tier conflates two ideas: "biggest by marketcap" and "deserves its own hand-painted sprite." The five ships above belong in the second bucket but not the first — their cultural identity (Curve's llama mascot, Liquity's decentralization absolutism, f(x)'s mathematical aesthetic, gold-backed treasuries) is distinct enough that a generic class hull (DAO schooner, treasury galleon, etc.) erases it.

**Visual hierarchy from camera distance:**
1. **Titans** (1.35–2.0 scale, animated, full pose, foam/spray) — read as monumental flagships of the financial system.
2. **Heritage hulls / unique** (1.45–1.55 scale, static, simple bob) — read as distinct cultural landmarks: smaller silhouettes than titans, but unmistakably one-of-a-kind, sailing among the regular fleet.
3. **Standard hulls** (galleon / brigantine / schooner / caravel / junk) — class-typed by governance/backing, market-cap scaled.

**Identity layering:**
- The PixelLab-generated PNG carries the *theme* primarily on the **mainsail** (the largest readable region at default zoom, and the polygon the runtime sail-tint mask operates on). Figureheads and hull silhouettes are *secondary* cues.
- Each unique sprite carries the shared tier-unifier (oxidized-bronze masthead lantern + cream bowsprit pennant) so the heterogeneous palettes still read as one tier.
- The `stablecoin-ship-branding.ts` entry carries the *runtime livery* (sail color, stripe pattern, logo shape) — applied via the existing sail-tint masks and the `drawShipLiveryTrim` overlay.
- The detail panel and accessibility ledger surface the curated rationale string so the *why this is unique* is text, not just pixels (per VISUAL_INVARIANTS: canvas is not the only source of analytical meaning).

**Symbolism notes (for reviewers):**
- The two gold ships (xAUT, PAXG) get *distinct sprites differentiated by silhouette*, not deck-cargo. xAUT is a low, broad treasury barge (no high castle, single squared sail); PAXG is a tall ornate galleon with a high stern castle. Silhouette differentiation reads at any zoom; deck cargo crates would not.
- "Unique" is the internal `sizeTier` discriminator; the user-facing label is "Heritage hull". This keeps maritime taxonomy coherent in the detail panel while preserving a clear code-level concept.
- crvUSD's marketcap may rise into titan range later; promotion would require deciding between unique and titan treatment, not a tier conflict (titan wins if both lists ever overlap; the resolver enforces this).
- BOLD/xAUT/PAXG painted-sail colors fall outside `isSailTintPixel`'s recognised range. They will land in `UNTUNED_UNIQUE_IDS` *as an intentional design outcome*: these ships render their painted identity directly without runtime livery tinting. The unique tier is curated, so painted-in identity *is* the design, not a regrettable fallback.

---

## File Structure

**New files:**
- `src/systems/unique-ships.ts` — pure registry (definitions, sprite-id Set, helpers)
- `src/systems/unique-ships.test.ts` — registry assertions
- `public/pharosville/assets/ships/crvusd-unique.png`
- `public/pharosville/assets/ships/bold-unique.png`
- `public/pharosville/assets/ships/fxusd-unique.png`
- `public/pharosville/assets/ships/xaut-unique.png`
- `public/pharosville/assets/ships/paxg-unique.png`

**Modified files:**
- `src/systems/world-types.ts` — extend `ShipSizeTier` union with `"unique"`; add `uniqueRationale?: string` to `ShipVisual`. **Same-commit constraint with `src/renderer/layers/ships.ts` priority-map update — see Step 1.1 / Step 6.5.**
- `src/systems/ship-visuals.ts` — import `UNIQUE_SHIP_DEFINITIONS`; resolve unique sizeTier/sizeLabel/scale/spriteAssetId/uniqueRationale before generic size-tier fallback (titan still wins if there's any overlap). `sizeLabel` for unique ships is `"Heritage hull"`.
- `src/systems/ship-visuals.test.ts` — new tests for unique resolution and titan/unique disjointness.
- `src/systems/stablecoin-ship-branding.ts` — add livery entries for `bold-liquity` (oxblood), `fxusd-f-x-protocol`, `xaut-tether` (Tether teal with gold trim), `paxg-paxos` (warm-gold). The existing `crvusd-curve` entry is preserved (verify against new sprite).
- `src/renderer/layers/ships.ts` — import `UNIQUE_SPRITE_IDS` from `unique-ships.ts`; add `isUniqueSprite` helper; extend `SHIP_SAIL_MARKS` / `SHIP_PEG_MARKS` / `SHIP_TRIM_MARKS` with five new rows; bump `SHIP_SIZE_TIER_PRIORITY` so `unique: 6`; extend the LOD `preserve` predicate to include `unique`. Crucially, **do not** route unique ships through `drawAnimatedAsset`, `drawTitanHullFoam`, `drawTitanMooringDetails`, `drawTitanBowSpray`, full pose, or sail flutter; `drawShipLiveryTrim` continues to fire (since the suppression branch is the `if (titanSprite) return;` site, not unique-aware).
- `src/renderer/layers/ships.test.ts` — extend per-sprite offset table assertions to assert each unique sprite id has a row in every per-sprite table; extend the LOD throttling test to confirm unique ships are preserved.
- `src/renderer/ship-sail-tint.ts` — add 5 new entries to `SHIP_SAIL_TINT_MASKS` with polygon coords matching the painted sail regions of each new sprite.
- `src/renderer/ship-sail-tint.test.ts` — register unique sprite assets in `SHIP_ASSET_FILES`; add a new `UNTUNED_UNIQUE_IDS` Set for sprites whose painted sail color falls outside `isSailTintPixel`'s recognised range (expected: at minimum BOLD, xAUT, PAXG); update the exact-set assertion to filter by **both** `UNTUNED_TITAN_IDS` AND `UNTUNED_UNIQUE_IDS` (see Step 7.2 for the exact filter pattern).
- `src/systems/motion-planning.ts` — extend `isShipMapVisible` so `sizeTier === "titan" || sizeTier === "unique"` keep map visibility while moored.
- `src/systems/pharosville-world/stages/dock-assignment.ts` — extend `dockMooringDepthBonus` and `dockMooringBarrierClearance` switches: `unique` matches `flagship` values (depth bonus 2, clearance 3.3).
- `src/systems/pharosville-world/stages/dock-assignment.test.ts` — add coverage for unique tier mooring placement.
- `src/systems/detail-model.ts` — when `node.visual.uniqueRationale` is present, append a fact line `{ label: "Cultural significance", value: rationale }` directly after the existing `Size tier` line.
- `src/systems/detail-model.test.ts` — assert unique ships expose the new fact line; standard ships do not.
- `src/systems/pharosville-world.test.ts` — has a hard-coded `"Titan"` assertion (line ~87) that may need updating if any unique-ship fixture asset is referenced. Audit during Step 8.
- `src/components/accessibility-ledger.tsx` — include `uniqueRationale` in the ship summary text when present (one short clause appended after the size-tier description).
- `src/renderer/hit-testing.test.ts` — add "keeps unique ships selectable while they are docked" mirroring the existing titan test.
- `src/systems/motion.test.ts` — extend "hides only non-titan ships while they are moored" → "hides only non-titan, non-unique ships while they are moored".
- `scripts/pharosville/validate-assets.mjs` — bump `maxManifestAssets` cap from `40` to `45` (current manifest is 38; adding 5 lands at 43, so 45 leaves headroom). Document the bump inline.
- `public/pharosville/assets/manifest.json` — five new ship entries under `assets[]`; do **not** add unique sprites to `requiredForFirstRender` (loadPriority `deferred`); bump `style.cacheVersion` to `2026-05-01-unique-ships-v1` (style anchor unchanged at `2026-04-29-lighthouse-hill-v5`).
- `src/systems/asset-manifest.ts` — confirm the schema accepts the proposed entries (no `criticalReason`, no `animation`); update only if a hard-coded count exists.
- `docs/pharosville/CURRENT.md` — add a paragraph in the visual model section enumerating the unique tier and the five members; refresh manifest count line (currently *stale* at 34/23/11 — actual current state is 38/25/13; post-change becomes **43/25/18**).
- `docs/pharosville/ASSET_PIPELINE.md` — add a short section under sprite specs describing unique-ship dimensions (136×100), single-frame, deferred load, no animation block.
- `docs/pharosville-page.md` — add the unique tier (rendered as "Heritage hull") to the visual catalog. **Also update the stale clause at line ~55** ("non-titan ships are hidden while moored" → "non-titan, non-unique ships are hidden while moored").
- `tests/visual/pharosville.spec.ts` baseline updates — see Step 11 for the explicit blast list (8–11 baselines).

**Untouched (key callout):**
- `src/renderer/layers/ship-pose.ts` — the early `if (sizeTier !== "titan")` short-circuit naturally routes unique ships to the simple bob. Do NOT add `unique` to the full-pose path.
- `src/renderer/layers/maker-squad-chrome.ts` and `src/systems/maker-squad.ts` — squad concept is orthogonal; verified zero overlap with the unique candidate set.
- The `drawTitanHullFoam`, `drawTitanMooringDetails`, `drawTitanBowSpray` call sites — they gate on `titanSprite` (sprite-id), not `sizeTier`, so unique ships naturally bypass them.

---

## Implementation Steps

### 1. Type & registry plumbing

> **Same-commit constraint (CRITICAL):** Step 1.1 and Step 6.5 must land in the same commit. Adding `"unique"` to the `ShipSizeTier` union without simultaneously adding the `unique: 6` key to `SHIP_SIZE_TIER_PRIORITY` (which is `Record<ShipSizeTier, number>`) breaks `tsc`. If splitting work across PRs, create one PR for "type union + priority map + registry" and a second PR for everything else.

- [ ] **1.1** Extend `ShipSizeTier` in `src/systems/world-types.ts`:
  ```ts
  export type ShipSizeTier =
    | "titan"
    | "unique"
    | "flagship"
    | "major"
    | "regional"
    | "local"
    | "skiff"
    | "micro"
    | "unknown";
  ```
- [ ] **1.2** Add `uniqueRationale?: string` to the `ShipVisual` interface (alongside `spriteAssetId`).
- [ ] **1.3** Create `src/systems/unique-ships.ts`:
  ```ts
  import type { StablecoinData } from "@shared/types";

  export interface UniqueShipDefinition {
    spriteAssetId: string;
    rationale: string;       // surfaced in detail panel + a11y ledger; keep ≤ 90 chars
    scale: number;            // 1.45–1.55 range
  }

  export const UNIQUE_SHIP_DEFINITIONS = {
    "crvusd-curve":       { spriteAssetId: "ship.crvusd-unique", rationale: "Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves.", scale: 1.50 },
    "bold-liquity":       { spriteAssetId: "ship.bold-unique",   rationale: "Spartan crest hull — Liquity's stance on credibly neutral decentralization.",    scale: 1.45 },
    "fxusd-f-x-protocol": { spriteAssetId: "ship.fxusd-unique",  rationale: "Mathematical livery — f(x) Protocol's analytic identity.",                       scale: 1.45 },
    "xaut-tether":        { spriteAssetId: "ship.xaut-unique",   rationale: "Bullion barge — Tether's gold treasury reserve.",                                scale: 1.50 },
    "paxg-paxos":         { spriteAssetId: "ship.paxg-unique",   rationale: "Gilded merchantman — Paxos institutional gold custody.",                         scale: 1.55 },
  } as const satisfies Record<string, UniqueShipDefinition>;

  export const UNIQUE_SPRITE_IDS: ReadonlySet<string> = new Set(
    Object.values(UNIQUE_SHIP_DEFINITIONS).map((d) => d.spriteAssetId),
  );

  export function uniqueDefinitionFor(asset: Pick<StablecoinData, "id">): UniqueShipDefinition | null {
    return UNIQUE_SHIP_DEFINITIONS[asset.id as keyof typeof UNIQUE_SHIP_DEFINITIONS] ?? null;
  }
  ```
- [ ] **1.4** Create `src/systems/unique-ships.test.ts`:
  - Asserts every entry's sprite id matches `^ship\.[a-z0-9-]+-unique$`.
  - Asserts every rationale is non-empty and ≤ 90 chars.
  - Asserts every scale is in `[1.45, 1.55]`.
  - Asserts no overlap between `Object.keys(UNIQUE_SHIP_DEFINITIONS)` and the seven titan stablecoin ids (read `TITAN_SHIP_ASSET_IDS` from `ship-visuals.ts`).
  - Asserts `UNIQUE_SPRITE_IDS.size === 5` (no duplicate sprite ids).

✅ **Verify:** `npm test -- src/systems/unique-ships.test.ts` passes; `npm run typecheck` clean.

### 2. Wire unique resolution into `resolveShipVisual`

- [ ] **2.1** In `src/systems/ship-visuals.ts`, import `uniqueDefinitionFor`. Inside `resolveShipVisual`, resolve the unique definition *after* the titan lookup so titan always wins if a future overlap is introduced. The user-facing label is `"Heritage hull"`:
  ```ts
  const titanSpriteAssetId = TITAN_SHIP_ASSET_IDS[asset.id];
  const uniqueDef = !titanSpriteAssetId ? uniqueDefinitionFor(asset) : null;
  // ...
  return {
    // ...
    spriteAssetId: titanSpriteAssetId ?? uniqueDef?.spriteAssetId,
    sizeTier:  titanSpriteAssetId ? "titan"
             : uniqueDef           ? "unique"
             : size.tier,
    sizeLabel: titanSpriteAssetId ? "Titan"
             : uniqueDef           ? "Heritage hull"
             : size.label,
    scale: TITAN_SHIP_SCALES[asset.id]
        ?? uniqueDef?.scale
        ?? size.scale,
    ...(uniqueDef ? { uniqueRationale: uniqueDef.rationale } : {}),
  };
  ```
- [ ] **2.2** Extend `src/systems/ship-visuals.test.ts`:
  - "resolves a unique sprite + 'Heritage hull' label for every cultural-significance stablecoin"
  - "unique tier overrides marketcap-derived size for crvusd-curve at any cap"
  - "titan tier wins if a stablecoin id ever appears in both registries" (synthetic — does not modify the real registries)
  - "uniqueRationale is undefined for non-unique ships"

✅ **Verify:** `npm test -- src/systems/ship-visuals.test.ts` passes.

### 3. Branding entries for the four new ids

- [ ] **3.1** In `src/systems/stablecoin-ship-branding.ts`, add to `STABLECOIN_SAIL_COLORS` (use `"diamond"` literal — `ShipLogoShape` does not include `"shield"`; if a shield silhouette later reads better, propose extending the union as a separate change):
  ```ts
  "bold-liquity":         livery("Liquity BOLD livery",   "#7a2424", "#e8c8b4", "#b04545", "#3a0e0e", "#fff5e8", "diamond", "center", "cross"),
  "fxusd-f-x-protocol":   livery("f(x) USD livery",       "#5b3aa3", "#e3dcf2", "#9079d6", "#241050", "#f7f3ff", "slash",   "field",  "diagonal"),
  "xaut-tether":          livery("Tether Gold livery",    "#009393", "#d6cfa6", "#d8b04a", "#005f61", "#fffbe5", "hex",     "center", "grain"),
  "paxg-paxos":           livery("PAX Gold livery",       "#b48a3a", "#f3e3a6", "#d9b65c", "#5a3d12", "#fffdec", "hex",     "field",  "grain"),
  ```
  > **Palette notes:** `bold-liquity` uses oxblood `#7a2424` (darker than scarlet) so the hull doesn't visually merge with Danger Strait storm-water palette. `xaut-tether` uses Tether's actual teal `#009393` as primary with gold *trim only* — differentiates from PAXG warm-gold and from the lighthouse bronze-beacon glow.
- [ ] **3.2** Verify `crvusd-curve` existing entry still works with the new sprite. The existing Curve livery is green-and-cream (`#41956b` / `#d9ecdf`), and the new sprite is authored to harmonise with it (see Step 4.1 prompt). Re-tune accent/sailColor only if visual review surfaces a clash.
- [ ] **3.3** Add a test in `src/systems/stablecoin-ship-branding.test.ts` (create if absent): "every UNIQUE_SHIP_DEFINITIONS id has an explicit `stablecoin-logo` source via `resolveStablecoinShipBranding`" — uses the public `resolveStablecoinShipBranding(id, meta)` API and asserts `result.source === "stablecoin-logo"` (do NOT reach into the private `STABLECOIN_SAIL_COLORS` map).

✅ **Verify:** `npm test -- src/systems/stablecoin-ship-branding.test.ts` passes.

### 4. PixelLab sprite generation

> Generate via `mcp:create_map_object`. Read `docs/pharosville/PIXELLAB_MCP.md` first. Use style anchor `2026-04-29-lighthouse-hill-v5`. Each PNG must keep a clean sail/pennant area for runtime sail-tint masks and logo overlay. Save under `public/pharosville/assets/ships/`.

**Common parameters (apply to every prompt):**
- Dimensions: **136×100** (between standard 104×80 and titan 144×104..160×112).
- Anchor: `[68, 92]`.
- Footprint: `[46, 22]`.
- Hitbox: `[30, 4, 92, 90]`.
- `loadPriority: "deferred"`.
- `paletteKeys`: `["limestone", "deep navy", "bronze beacon", "teal sea"]` plus the per-ship accent color name.

**Common prompt clauses (append to every per-ship prompt):**
- "Style anchor: 2026-04-29-lighthouse-hill-v5, 16-bit maritime isometric pixel art, restrained analytics palette."
- "**No embedded text, no readable letters, no numerals, no logos.** Themes are conveyed by silhouette, sail painting, and figurehead — never by literal text."
- "Tier-unifier: every hull carries a single oxidized-bronze masthead lantern at the mainmast tip and a cream pennant strip at the bowsprit (matches titan-squad lantern + amber mooring colour family)."
- "Reserve a clean rectangular mainsail polygon for runtime sail-tint masking; theme painting on the mainsail must use a single dominant fill color so the runtime mask polygon can isolate it."
- "Dark contact shadow at hull base; transparent margin ≥ 4 px on all sides; ~136×100."

Sub-tasks (each produces one PNG + one manifest entry):

- [ ] **4.1** `ship.crvusd-unique` — Curve llama theme. Prompt cues: "isometric pixel-art galleon, llama figurehead at the bow, llama silhouette painted on the mainsail, deep green sails (matches existing `crvusd-curve` livery: primary `#41956b`, sail `#d9ecdf`) with cream accents and brass trim, weathered wooden hull."
- [ ] **4.2** `ship.bold-unique` — Liquity spartan theme. Prompt cues: "isometric pixel-art galleon, plumed hoplite-helm figurehead, abstract bronze-rimmed circular shield silhouettes painted along the gunwale, oxblood mainsail (`#7a2424` painted fill) with bronze trim, polished bronze prow caps."
- [ ] **4.3** `ship.fxusd-unique` — f(x) math theme. Prompt cues: "isometric pixel-art schooner, **abstract crossed-bar motif** painted as a single bold shape on the mainsail (suggests the structure of `f(x)` without any legible letters or symbols), deep purple-and-black livery (sail `#e3dcf2`, primary `#5b3aa3`), polished pewter trim. Strictly no glyphs, no characters, no equations, no numerals — purely an abstract geometric shape."
- [ ] **4.4** `ship.xaut-unique` — Tether Gold theme. **Silhouette: low, broad treasury barge — short squat hull, no high castle, single squared mainsail.** Prompt cues: "isometric pixel-art treasury barge with a low-profile hull, single broad squared mainsail in dark Tether teal (`#009393`) with gold trim along the boltrope, gilded prow cap, no high quarterdeck or aftercastle."
- [ ] **4.5** `ship.paxg-unique` — Paxos Gold theme. **Silhouette: tall ornate galleon — high stern castle, warm-gold mainsail.** Prompt cues: "isometric pixel-art tall ornate galleon, high stern castle, warm-gold mainsail (`#f3e3a6` painted fill), ornate gilt trim along the bow rail and stern gallery, ivory hull with gilded accents."
- [ ] **4.6** Post-process each PNG: confirm transparent margin (≥ 4 px on all sides), the painted sail polygon area is a single dominant fill color (so the sail-tint mask can isolate it), the bronze masthead lantern + cream bowsprit pennant unifier are present, and the silhouette is recognizable.
- [ ] **4.7** Save provenance: capture the PixelLab `jobId` for each sprite for the manifest entries (Step 5).

✅ **Verify:** All five PNGs exist under `public/pharosville/assets/ships/`. Visual review (open each in a viewer at 100% and at 25% zoom):
- Theme reads at both zoom levels (sail painting > figurehead > deck detail in priority order).
- xAUT and PAXG are differentiable by silhouette alone (squat barge vs tall galleon).
- No baked-in text/letters/numerals.
- Tier-unifier (bronze lantern + cream bowsprit pennant) visible on every hull.

### 5. Asset validator cap + manifest entries

- [ ] **5.0** **(BLOCKING — must land before Step 5.1)** In `scripts/pharosville/validate-assets.mjs:25`, bump `maxManifestAssets` from `40` to `45`. Add an inline code comment: `// 2026-05-01: bumped from 40 to 45 to accommodate unique-ship category (+5 deferred sprites). Current actual count: 43.` This must precede the manifest update or `npm run check:pharosville-assets` will hard-fail with `Manifest has 43 assets; v0.1 core cap is 40.`.

- [ ] **5.1** In `public/pharosville/assets/manifest.json`, add five entries (one per ship) following the structure below. Place them after the last titan entry (`ship.stusds-titan`) for readability:
  ```json
  {
    "id": "ship.crvusd-unique",
    "path": "ships/crvusd-unique.png",
    "category": "ship",
    "layer": "ships",
    "width": 136,
    "height": 100,
    "displayScale": 1,
    "anchor": [68, 92],
    "footprint": [46, 22],
    "hitbox": [30, 4, 92, 90],
    "loadPriority": "deferred",
    "promptKey": "ship.crvusd-unique",
    "semanticRole": "crvUSD heritage hull (unique tier)",
    "paletteKeys": ["limestone", "deep navy", "bronze beacon", "teal sea", "curve green"],
    "tool": "mcp:create_map_object+imagemagick",
    "promptProvenance": {
      "jobId": "<fill from 4.7>",
      "styleAnchorVersion": "2026-04-29-lighthouse-hill-v5"
    }
  }
  ```
  Repeat for `bold-unique`, `fxusd-unique`, `xaut-unique`, `paxg-unique`. **No `animation` block.** **No `criticalReason` field** (validator at `validate-assets.mjs:351` allows `criticalReason` only for critical/first-render entries). **Do NOT add to `requiredForFirstRender`.**
- [ ] **5.2** Bump `style.cacheVersion` to `"2026-05-01-unique-ships-v1"`. Leave `style.styleAnchorVersion` unchanged (`2026-04-29-lighthouse-hill-v5`).
- [ ] **5.3** Run `npm run check:pharosville-assets`. Expected post-state:
  - **Total runtime assets: 38 → 43** (under the new 45-cap from Step 5.0).
  - **Critical: 25 (unchanged).**
  - **Deferred: 13 → 18.**
  If any per-asset KB/pixel budget is exceeded, downsize the offending PNG (re-export from PixelLab with tighter framing).
- [ ] **5.4** Run `npm run check:pharosville-colors`. Expect zero new violations. If `bold-liquity` oxblood or either gold ship triggers a color-budget warning, retune.

✅ **Verify:** `npm run check:pharosville-assets` and `npm run check:pharosville-colors` both pass.

### 6. Renderer table extensions

- [ ] **6.1** In `src/renderer/layers/ships.ts`, add to `SHIP_SAIL_MARKS` the five sprite ids with sail-mark offsets matching the painted sail polygon of each new sprite (eyeballed from the PNG; pinned by visual review). Approximate starting values for 136×100 sprites: `{ height: 18-20, width: 21-23, x: 5-7, y: -42 to -46 }`.
- [ ] **6.2** Add to `SHIP_PEG_MARKS`: peg-mark offsets for each of the five ids. Approximate for 136×100: `{ size: 6.4-6.8, x: -25 to -28, y: -56 to -60 }`.
- [ ] **6.3** Add to `SHIP_TRIM_MARKS`: rail/keel/stern/deck offsets for each of the five sprite ids.
- [ ] **6.4** Import `UNIQUE_SPRITE_IDS` from `src/systems/unique-ships.ts` (already exported in Step 1.3 — do NOT redeclare). Add a thin `isUniqueSprite(ship)` helper mirroring `isTitanSprite(ship)`.
- [ ] **6.5** **(SAME COMMIT AS STEP 1.1.)** Update `SHIP_SIZE_TIER_PRIORITY` so it remains exhaustive over the union: add `unique: 6` (between `titan: 7` and `flagship: 5`).
- [ ] **6.6** Extend the LOD `preserve` predicate (find by reading the surrounding `const titan = ship.visual.sizeTier === "titan" || isTitanSprite(ship); const preserve = selected || hovered || titan;` pattern):
  ```ts
  const preserveTier = ship.visual.sizeTier === "titan"
                    || ship.visual.sizeTier === "unique"
                    || isTitanSprite(ship)
                    || isUniqueSprite(ship);
  const preserve = selected || hovered || preserveTier;
  ```
- [ ] **6.7** **Crucial negative invariant.** Find the `if (titanSprite) { drawAnimatedAsset(...) } else { drawAsset(...) }` branch (search by identifier `titanSprite`, *not* by line number). Confirm unique ships render through the `else` branch (`drawAsset`). Do NOT extend the `if (titanSprite)` guard to unique sprites.
- [ ] **6.8** **Crucial negative invariant.** Find the sail-flutter, `drawTitanHullFoam`, `drawTitanMooringDetails`, `drawTitanBowSpray` call sites and the `if (titanSprite) return;` suppression of `drawShipLiveryTrim` (search by identifier; line numbers will have shifted). All gate on `titanSprite`, not `sizeTier` — verify each one *after* Step 6.6 lands and confirm unique ships are unaffected.
- [ ] **6.9** Extend `src/renderer/layers/ships.test.ts`:
  - Extend the existing per-sprite offset table assertion (or add a sibling "Unique ship offset tables" suite) to assert each of the five unique sprite ids appears in `SHIP_SAIL_MARKS`, `SHIP_PEG_MARKS`, `SHIP_TRIM_MARKS`.
  - Extend "keeps selected and titan ships in wake/overlay sets while budget-throttling dense fleets" to also keep unique ships preserved.
  - Add a regression test: "unique ships render through the static `drawAsset` path, not `drawAnimatedAsset`" (assert by mocking the asset draw functions and counting calls).

✅ **Verify:** `npm test -- src/renderer/layers/ships.test.ts` passes.

### 7. Sail-tint masks

- [ ] **7.1** In `src/renderer/ship-sail-tint.ts`, add five new entries to `SHIP_SAIL_TINT_MASKS` with polygon coords matching the painted sail region of each new sprite. Coordinates are relative to the PNG; pin by visual inspection of the PixelLab output.
- [ ] **7.2** In `src/renderer/ship-sail-tint.test.ts`:
  - Add the five sprite asset paths to `SHIP_ASSET_FILES`.
  - Declare a new `UNTUNED_UNIQUE_IDS = new Set<string>([...])` near the existing `UNTUNED_TITAN_IDS`. Per design, expect at minimum `"ship.bold-unique"`, `"ship.xaut-unique"`, `"ship.paxg-unique"` to land in this set (oxblood, teal, warm-gold all fall outside `isSailTintPixel`'s recognised range). `"ship.crvusd-unique"` (deep green) and `"ship.fxusd-unique"` (purple-on-pale) are likely-tunable; only add them to the untuned set if the test fails.
  - Update the **exact-set assertion at lines 45-46** to filter by both untuned sets:
    ```ts
    const expectedTuned = Object.keys(SHIP_ASSET_FILES)
      .filter((k) => !UNTUNED_TITAN_IDS.has(k) && !UNTUNED_UNIQUE_IDS.has(k))
      .sort();
    expect(tunedKeys).toEqual(expectedTuned);
    ```
  - Add a code comment near `UNTUNED_UNIQUE_IDS` listing the painted sail color of each entry, the rationale (`isSailTintPixel` warm-orange/sub-luminance/saturation gate), and the trigger for retuning (e.g., "if `isSailTintPixel` is later extended to recognise oxblood reds, remove `ship.bold-unique` and verify").

✅ **Verify:** `npm test -- src/renderer/ship-sail-tint.test.ts` passes.

### 8. Motion / hit-testing / dock-assignment / world

- [ ] **8.1** In `src/systems/motion-planning.ts`, extend `isShipMapVisible`:
  ```ts
  return (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique")
      || sample?.state !== "moored"
      || sample.currentDockId == null;
  ```
- [ ] **8.2** Extend `src/renderer/hit-testing.test.ts` with "keeps unique ships selectable while they are docked" mirroring the existing titan test structure.
- [ ] **8.3** Extend `src/systems/motion.test.ts` "hides only non-titan ships while they are moored" → rename to "hides only non-titan, non-unique ships while they are moored".
- [ ] **8.4** Audit `src/systems/pharosville-world.test.ts` (line ~87 has a hard-coded `"Titan"` assertion). If it references a fixture that includes any of the five unique stablecoin ids, the assertion will read `"Heritage hull"` instead and need updating. Fix in the same commit as the `sizeLabel` resolver change (Step 2).
- [ ] **8.5** In `src/systems/pharosville-world/stages/dock-assignment.ts`, extend the two switch statements to include `case "unique":` returning the same values as `case "flagship":` (depth bonus 2, clearance 3.3). Co-locate the new case directly after `case "titan":` for readability.
- [ ] **8.6** Add coverage in `src/systems/pharosville-world/stages/dock-assignment.test.ts`: "unique tier ships moor at flagship-tier depth/clearance".

✅ **Verify:** `npm test -- src/systems` passes.

### 9. Detail panel + accessibility ledger

- [ ] **9.1** In `src/systems/detail-model.ts`, where the existing `Size tier` fact is composed, append a conditional fact:
  ```ts
  ...(node.visual.uniqueRationale
      ? [{ label: "Cultural significance", value: node.visual.uniqueRationale }]
      : []),
  ```
  The detail panel will display:
  > Size tier: Heritage hull
  > Cultural significance: Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves.
- [ ] **9.2** In `src/systems/detail-model.test.ts`, add: "unique ships expose a Cultural significance fact" and "non-unique ships do not".
- [ ] **9.3** In `src/components/accessibility-ledger.tsx`, when emitting the per-ship summary line, append a clause like ` — heritage hull: <rationale>` when `visual.uniqueRationale` is present. Match the existing punctuation/spacing style of that file.
- [ ] **9.4** If `accessibility-ledger` has tests, add a check for the appended clause.

✅ **Verify:** `npm test -- src/components src/systems/detail-model.test.ts` passes.

### 10. Docs

- [ ] **10.1** In `docs/pharosville/CURRENT.md`, in the "Current Visual Model" section after the existing titan paragraph (the squad section), add a new paragraph:
  > Heritage hulls (unique tier) sit between titans and standard hulls and are curated by cultural significance rather than market cap. Members get dedicated 136×100 PixelLab sprites (single-frame, deferred load) and stay visible/selectable while moored, but skip titan-only chrome (foam, spray, full pose, sail flutter). The current registry in `src/systems/unique-ships.ts` covers crvUSD (Curve / llama), BOLD (Liquity / spartan), fxUSD (f(x) Protocol / mathematical livery), xAUT (Tether gold barge), and PAXG (Paxos gilded merchantman). All five sprites share an oxidized-bronze masthead lantern and cream bowsprit pennant as a tier-unifying device. Each carries a per-ship rationale string surfaced as a "Cultural significance" line in the detail panel and accessibility ledger.
- [ ] **10.2** Refresh the manifest count line in `CURRENT.md` (currently *stale* at "34 runtime assets, 23 critical / 11 deferred"). The actual current state is 38/25/13; post-change becomes **43 runtime, 25 critical / 18 deferred**. Re-run `npm run check:pharosville-assets` to confirm before committing.
- [ ] **10.3** In `docs/pharosville/ASSET_PIPELINE.md`, add a short subsection under the Sprite Bible noting unique-tier (heritage hull) sprites are static (single-frame) deferred PNGs at 136×100 with no animation block, and noting the validator cap was bumped to 45.
- [ ] **10.4** In `docs/pharosville-page.md`:
  - Add a one-line entry to the ship-class summary listing "Heritage hull" (unique tier) below the existing class-hull / titan entries.
  - **Update the stale clause at line ~55**: "non-titan ships are hidden while moored" → "non-titan, non-unique ships are hidden while moored". Use grep to locate the exact wording (which has likely shifted line numbers since 2026-04-29).

✅ **Verify:** `npm run validate:docs` passes.

### 11. Visual snapshot baselines

The dense fixture at `src/__fixtures__/pharosville-world.ts` seeds from `ACTIVE_STABLECOINS` (which contains all 5 unique candidates), so every dense baseline that includes a relevant viewport will diff.

**Expected blast list (8–11 baselines under `tests/visual/pharosville.spec.ts-snapshots/`):**
- `pharosville-dense-cemetery`
- `pharosville-dense-civic-core`
- `pharosville-dense-evm-bay`
- `pharosville-dense-ledger-north`
- `pharosville-dense-lighthouse`
- `pharosville-dense-risk-water`
- `pharosville-dense-ship-flotillas`
- `pharosville-dense-desktop-shell`
- Possibly `pharosville-dense-dawn / -dusk / -night` (only if a unique ship sits in their crops — verify by inspection).

- [ ] **11.1** Run `npm run test:visual`. Expect the baselines above to diff. Inspect each diff visually — the drift should match exactly the appearance of one or more new unique-tier sprites at the expected position/scale.
- [ ] **11.2** Update only baselines whose drift matches the design intent. If any *non-listed* baseline drifts (e.g., a sparse fixture, or a layout shift caused by unique ships appearing/disappearing in unexpected positions), pause and investigate before accepting.
- [ ] **11.3** Commit baseline updates as a separate commit so reviewers can diff snapshots independently.

✅ **Verify:** `npm run test:visual` passes; baselines committed; no unexpected drift outside the listed set.

### 12. Final validation

- [ ] **12.1** `npm run onboard:agent`
- [ ] **12.2** `npm run smoke:api-local` && `npm run smoke:dev-proxy`
- [ ] **12.3** `npm run validate:docs`
- [ ] **12.4** `npm run typecheck`
- [ ] **12.5** `npm test`
- [ ] **12.6** `npm run check:pharosville-assets` && `npm run check:pharosville-colors`
- [ ] **12.7** `npm run build`
- [ ] **12.8** `npm run test:visual`
- [ ] **12.9** Manual visual review in the dev server: zoom out to confirm titans still dominate the silhouette hierarchy; zoom in on each heritage hull to confirm theme reads cleanly at typical zoom; confirm the bronze masthead lantern + cream bowsprit pennant are visible and tier-unifying; click each to confirm the detail panel shows the rationale line as "Cultural significance"; toggle reduced motion and confirm unique ships stay visible while moored.

✅ **Verify:** All checks pass; no regressions in titan/squad behavior; visual hierarchy reads cleanly at all zoom levels; xAUT and PAXG are recognisable as distinct ships at default zoom (silhouette differentiation, not deck cargo).

---

## Risks & Mitigations

- **Sprite quality drift.** PixelLab outputs may not match the painted-theme expectation on first generation, especially with the strict no-text/no-glyph constraint on `fxusd-unique`. **Mitigation:** generate, review, regenerate per ship before progressing past Step 4. Don't batch. Reject any output with embedded letters/numerals/symbols.
- **Sail-tint mask brittleness for non-standard sail colors.** Oxblood (BOLD), Tether teal (xAUT), and warm-gold (PAXG) will likely fail `isSailTintPixel`. **Mitigation:** the `UNTUNED_UNIQUE_IDS` allow-list is *intentional design* for the unique tier — these ships render their painted identity directly, which is the curated artistic intent. The test suite stays green via the dual-set filter in Step 7.2.
- **Manifest cap & validator coupling.** The `validate-assets.mjs` cap bump (Step 5.0) must precede the manifest update (Step 5.1), or the validator will hard-fail. **Mitigation:** Step 5.0 explicitly calls this out; ordering is verified during code review.
- **Visual baseline churn.** 8–11 baselines × multiple diff-review passes is meaningful work. **Mitigation:** Step 11 enumerates the expected blast list so reviewers can quickly spot unexpected drift outside the listed set.
- **Same-commit constraint for type union + priority map.** Splitting Step 1.1 across PRs without Step 6.5 breaks `tsc`. **Mitigation:** the constraint is documented at the top of Step 1 and reiterated in Step 6.5.
- **Future overlap with titan promotion.** If crvUSD or another unique ship later gets a titan sprite, the resolver gives titan precedence but `UNIQUE_SHIP_DEFINITIONS` would still carry a stale entry. **Mitigation:** the `unique-ships.test.ts` "no titan/unique overlap" test catches this in CI. Removal is a one-line change at promotion time.
- **`crvusd-curve` already has a branding entry.** Re-tuning to fit the new sprite may shift its appearance in non-unique scenarios. **Mitigation:** don't change the existing entry unless visual review demands it; the new sprite is authored in Step 4.1 to harmonise with the existing Curve livery (green-and-cream), not the other way around.
- **`pharosville-world.test.ts:87` hard-coded "Titan".** Now-unique ships will read `"Heritage hull"`. **Mitigation:** Step 8.4 audits this in the same commit as the `sizeLabel` resolver change.
- **BOLD/xAUT/PAXG palette friction with environment.** Oxblood near Danger Strait, gold near lighthouse beacon — risk of visual merging. **Mitigation:** palette choices in Step 3.1 already shifted away from clash zones (oxblood `#7a2424` not scarlet; xAUT primary is Tether teal not gold). Manual visual review in Step 12.9 catches any remaining issues.

---

## References

- `agents/usds-titan-squad-plan.md` — closest precedent (titan-tier curated registry + per-ship rendering plumbing + tier-unifier device pattern)
- `docs/pharosville/CURRENT.md` — current visual-model source of truth
- `docs/pharosville/ASSET_PIPELINE.md` — manifest contract + sprite specs
- `docs/pharosville/PIXELLAB_MCP.md` — sprite generation pipeline (style anchor compliance)
- `docs/pharosville/CHANGE_CHECKLIST.md` — pre-merge validation
- `scripts/pharosville/validate-assets.mjs` — `maxManifestAssets` cap (Step 5.0 bump target)
- `src/systems/ship-visuals.ts` — titan registry precedent (`TITAN_SHIP_ASSET_IDS`, `TITAN_SHIP_SCALES`)
- `src/systems/maker-squad.ts` — hard-coded curated id-list precedent + tier-unifier device pattern
- `src/renderer/layers/ships.ts` — `TITAN_SPRITE_IDS` / `isTitanSprite` precedent + `SHIP_SIZE_TIER_PRIORITY` exhaustiveness site
- `src/renderer/ship-sail-tint.ts` — `UNTUNED_TITAN_IDS` precedent for the new `UNTUNED_UNIQUE_IDS`

---

## Review Provenance

This plan is **v2**. v1 was reviewed by three opus agents in parallel; the consolidated findings (11 BLOCKING + 3 CRITICAL art-direction + 4 SUGGESTION judgment-call items) were all applied. See the conversation transcript for v1 → v2 diff rationale.
