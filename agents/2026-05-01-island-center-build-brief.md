# PharosVille Island Center — Build Brainstorm Research Brief

Date: 2026-05-01
Status: Research input for the upcoming brainstorm. No code, no PixelLab prompts, no implementation steps.
Scope: What to build *inside* the bare central plaza — `CIVIC_CORE_CENTER = { x: 31, y: 31 }` with `CIVIC_CORE_RADIUS = 8.5` (`src/systems/world-layout.ts:12-13`) — after the cleanup pass.

## 1. Decomposing The Inspiration

The reference reads dense and compelling because of a small set of stacked, repeating moves:

- **Layered roofline silhouettes.** Many small terracotta hip/pent roofs at slightly different heights and angles. The eye reads a *crowd* of buildings, not a single shape.
- **Warm/cool material contrast.** Bright terracotta, ochre stucco, and warm window glow against cool teal sea, slate cliff shadow, and dark timber piers. Two temperature bands, no muddy middle.
- **Cliff-edge framing.** Buildings hug a tall pale-stone cliff that drops straight to surf. The cliff acts as a base plate that visually unifies the cluster.
- **Cascading stone stairs.** Diagonal stair runs cut through the cluster from waterline to upper terrace. They give scale and route the eye.
- **Vegetation pockets.** Short cypress columns and dark shrubs jammed between buildings break the roof rhythm and fill seams.
- **Lit window pinpoints.** Tiny warm pixels (~1-2 px) inside dark window slots — these are what make pixel-art villages feel alive.
- **A vertical anchor.** A single lighthouse on the far right pulls the composition; it is *in* the village, not an isolated monument.
- **Density per tile.** Roughly 4-6 distinct silhouette shapes per "tile patch" — not one large building per patch.

## 2. What Fits PharosVille And What Doesn't

**Fits:**
- Limestone cliff base + terracotta roof accents — already in the manifest style anchor (`landmark.lighthouse`, terracotta seawall top course, established palette).
- Cluster-of-small-silhouettes density approach — compatible with the iso projection and existing prop scale.
- Cypress vegetation pockets — `cypress` is already a prop kind in `scenery.ts`.
- Warm window-pinpoint lighting — extends the existing harbor-lamp ambient cone work.
- Stair-path runs — already authored as `stone-steps` props; the pattern transfers.

**Doesn't fit (and what to adapt):**
- **Fishing-village semantics.** PharosVille is a "polished maritime observatory citadel" not a working port (`docs/pharosville/CURRENT.md:14-16`, `VISUAL_INVARIANTS.md:13`). No drying nets, gutting tables, fish baskets. **Adapt:** translate "village houses" into low observatory residences/archives — same silhouette logic, no fishery props.
- **Lighthouse at the cluster edge.** The PharosVille lighthouse is the *singular* PSI landmark and is already placed at (18, 28) with an enforced clearance box `x:14..24, y:23..32`. The center cluster cannot crowd it. **Adapt:** keep cluster east of x≈22 and tower-free. No second lighthouse.
- **Beached fishing boats.** Sea/ship/dock semantics are sacred — only stablecoin ships ride the water (`VISUAL_INVARIANTS.md:46-55`). **Adapt:** no beached hulls inside the center build.
- **Saturated red/yellow rooftops at full intensity.** Tiles must not introduce analytical color bands or compete with DEWS water-zone semantics (`VISUAL_INVARIANTS.md:73-81`). **Adapt:** terracotta is allowed but must stay restrained, on roof faces only, never as a tile-fill base.
- **Free-form visual flourish.** Anything visible-but-unlabeled risks the canvas-not-only-source rule (`VISUAL_INVARIANTS.md:17-20`). **Adapt:** any new analytical signal needs detail-panel + ledger parity; anything ambient must be unambiguously ambient.

## 3. Available Build Area

The bare plaza in `current-center.png` corresponds to the *interior* of the compact main-island ellipse, minus everything already occupied. Working from `world-layout.ts`:

**Hard exclusions:**
- Lighthouse clearance box: `x:14..24, y:23..32` (`world-layout.ts:247-249`).
- Cemetery islet: `CEMETERY_CENTER = (8, 50)`, ~5.4×3.8 ellipse — already a separate islet, irrelevant to center.
- North harbor shelf around (30.5, 24.8) and northeast shelf around (37.8, 24.8) — dock bodies + their `civic-*` cluttered fringe (see `scenery.ts:42-89`).
- Southern quay shelf around (31.4, 37.8) — dock bodies + plaque signs.
- East / Ethereum cove around (38.8, 31.3) — `dock.ethereum-civic-cove` is a 400×320 sprite occupying most of that quadrant.
- West harbor cove around (23.6, 32.0) — west-lamp/seawall/mooring/barrels/steps cluster.
- Existing district overlay pads: (31.0, 23.3), (21.2, 32.6), (32.2, 39.6), (42.5, 31.7) — already painted by `drawDistrictPad` in `harbor-district.ts:13-16`.
- Seawall ring + four-tile periphery generic-water halo.

**Available rectangle (rough):** roughly `x:25..38, y:27..36`, minus the lighthouse clearance overlap on the left edge. That gives a usable polygon of approximately **~80–100 land tiles**, centered on `CIVIC_CORE_CENTER = (31, 31)`. The four civic props in `scenery.ts:80-83` (`civic-bollards` (31.2, 31.5), `civic-crates` (29.2, 30.0), `civic-rope` (33.9, 32.6), `civic-lamp-east` (36.0, 32.8)) sit dead-center in this polygon and read as orphans on bare limestone — they're the cleanup target. The brick-paved central diamond visible in `current-center.png` is `drawDistrictPad` at (31.0, 23.3) bleeding south, plus the limestone tile pack underneath.

## 4. Three Candidate Build Directions

**(a) Ambient observatory citadel — limestone+terracotta residential cluster.**
A dense 6-9 building cluster of low limestone houses with terracotta hip roofs, threaded with stone stairs and cypress columns, two or three pinpoint lit windows. Pure flavor; no analytical signal, no per-entity meaning. Visual flavor: matches inspiration most directly. Contract risk: **low** — no detail-panel parity needed because nothing is encoded. Keeps the canvas-not-only-source rule trivially. New-asset count: 2-4 (one or two cluster overlays + maybe a stair sprite + a cypress prop variant). Analytical surface: **none**.

**(b) Civic anchor — one or two named buildings carrying a system-wide aggregate signal.**
Examples: an "Observatory Archive" building tied to total tracked-stablecoin supply, or a "Mint Hall" tied to system-wide mint/burn delta. One or two buildings, not a cluster. Visual flavor: monumental, more silhouette than density — closer to the existing lighthouse-as-landmark idiom than the inspiration. Contract risk: **high** — every visual encoding (door open/closed, banner color, window count) needs detail-panel + accessibility-ledger parity (`VISUAL_INVARIANTS.md:17-20`), risks colliding with the existing rule that mint/burn flows live on dedicated analytical surfaces *outside* PharosVille (`VISUAL_INVARIANTS.md:32`). New-asset count: 2-3 building sprites + state variants. Analytical surface: **aggregate** (one or two scalars).

**(c) Cartographic monument — sundials, orreries, star-charts as observatory props.**
Stone sundial + brass orrery + open star-chart pavilion — props, not buildings. Visual flavor: distinctive, leans hard into "observatory citadel," wouldn't be confused for fishing village. Contract risk: **low-to-medium** — props that don't encode data are safe; if any reads analytical (e.g., orrery dial pointing at a number) it needs ledger parity. New-asset count: 3-5 prop sprites. Analytical surface: **none** by default; could be made aggregate if desired.

## 5. Palette Extension Proposal

Locked anchors (do not change): limestone hi `#f0e2c4`, base `#d8c8a8`, mortar `#8e8470`, deep shadow `#5c5240`; scrub mid `#9c8a6c`, scrub dark `#7c6b48`; sand base `#dcb978`, sand hi `#f0d8a0`, damp band `#b89060`; terracotta cap `#b04030` (sparingly, used today on seawall top course only); teal water-bounce `#7eb8b0`. The manifest style.palette is `#061721`, `#0d5f70`, `#15858c`, `#f0ead2`, `#b95437`, `#ffcc62`.

Proposed accent extensions for the center build (additive, restrained — only on roof faces, window glints, banner threads, never as tile-fill):

- **Terracotta family (roofs):** `#b04030` (existing cap), `#9a3a2c` (deeper shade for roof undersides/contact), `#c8553f` (highlight on sunlit ridge); used on roof planes only.
- **Warm ochre stucco (wall accent on residential clusters):** `#c89868` for second-tier wall cluster, `#a07849` for shaded wall faces — distinct from limestone but same temperature family.
- **Copper/oxidized brass (small hardware accents — door fittings, dials, sundial gnomon):** `#7a5a3a` shadow, `#b08850` mid, `#e6c47a` glint. The `#b95437` and `#ffcc62` already in the manifest palette overlap this family.
- **Lit window pinpoint (1-2 px only):** `#f7d68a` (already used in `civic-lamp-east` and `signal-post`) — reuse, don't introduce new.
- **Cool stone shadow (between buildings):** `#3c3528` — extends `#5c5240` shadow into deeper crevices when cluster overlap demands it.

All proposed extensions are within the warm half of the established lighthouse/seawall family. None introduces a saturated primary that would compete with DEWS zone tints. `npm run check:pharosville-colors` is a debug-token blocklist not a positive allowlist (per the coherence plan, Phase 4), so these will not be blocked.

## 6. Asset Budget Reality Check

**Current state:** manifest holds **43 runtime assets** with cap **45** (`docs/pharosville/CURRENT.md:167`). Net headroom: **2 IDs**, of which the user wants to keep some slack. First-render budget: 25 critical, 18 deferred. Per-image overlay ceiling is 96 KiB / 150,000 decoded pixels (`ASSET_PIPELINE.md:142`).

**Per-candidate plausible sprite cost:**

- **(a) Ambient citadel cluster.** Best-case **1-2 IDs**: a single large `overlay.center-cluster` (say 384×224, similar slot to `overlay.lighthouse-headland`) drawn at the plaza center, optionally + 1 deferred `prop.cypress-cluster` variant. Fits 2-ID headroom. Slack source: deferred-tier overlay/prop. Critical-tier addition only if first-frame need is justified — not required for an ambient cluster (it can come in deferred and pop in after lighthouse).
- **(b) Civic anchor.** **2-3 IDs**: one or two building landmarks (`landmark.observatory-archive`, possibly `landmark.mint-hall`) plus optional state-variant frames. At least one would land critical (analytical first-frame readability), pressing first-render budget hard. The 25/45 critical count gives 0 net slack relative to the 575 KiB / 875,000-pixel first-render cap once a 384×224 building is added — would likely need a deferred-tier retirement, e.g. retire `terrain.road` (currently dead — `world-layout.ts:188-189` keeps the kind in the canonical mapping but the landlord plan called it "dead but not load-bearing"). **Risk noted, not recommended without a budget audit.**
- **(c) Cartographic monument props.** **3-5 IDs**, all deferred prop tier (24 KiB / 30,000-pixel ceiling). Exceeds the 2-ID cap by 1-3. Slack source: would require either bumping `maxManifestAssets` beyond 45 or retiring deferred sprites (candidates: `terrain.road`, possibly `ship.algo-junk` or `ship.crypto-caravel` if usage data shows they rarely render). Each retirement requires a renderer audit.

Recommendation flag for the brainstorm: **(a) is the only candidate that fits the current 2-ID headroom without retirement work.** (b) and (c) require a budget conversation up front.

## 7. Open Questions For The Brainstorm

1. **Pure flavor or analytical anchor?** Does the center stay ambient (no detail-panel obligation), or does it carry a system-wide signal? This is the single highest-leverage decision — it gates contract risk and asset count.
2. **One large overlay or multiple props?** A single 384×224 cluster sprite (PixelLab-friendly, 1-ID) vs. an authored prop set (more authoring work, higher ID cost, more flexibility). The inspiration's density is achievable either way, but the rendering pattern is different.
3. **How tall is "tall"?** The lighthouse silhouette must remain the dominant vertical anchor on the island. What's the max roof/spire height (in tile-vertical-pixels) the cluster can reach without dueling the lighthouse?
4. **Is the existing brick-paved central diamond (`drawDistrictPad` at (31.0, 23.3)) staying?** It currently bleeds south into the bare area. Decision: keep, recolor, or replace with the new cluster's base plate?
5. **Stair connection to harbors?** Should visible stone stairs run from the central cluster down to the south quay / west cove / Ethereum cove, or does the cluster sit on its own plateau with no stair routing?
6. **Lit-window cadence under reduced motion?** The single canvas RAF clock must stay authoritative (`MOTION_POLICY.md`). Are window pinpoints static-only (safe), or do they breathe like the harbor-lamp cone? Reduced-motion behavior needs an answer either way.
7. **Retire `terrain.road` to free a deferred slot, or accept that it stays dead?** This is the cheapest manifest cleanup and unblocks (b)/(c) — but the coherence plan explicitly chose not to retire it on "don't refactor what's not broken" grounds. Worth revisiting before the budget conversation.
8. **What about cleanup of the four `civic-*` orphan props in `scenery.ts:80-83`?** The build-half assumes they will be removed or relocated by the cleanup pass. Confirm the cleanup pass owns that, so the build pass can plant on truly bare ground.
