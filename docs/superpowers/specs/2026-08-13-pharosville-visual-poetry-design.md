# PharosVille Visual Poetry Pass — Design

Date: 2026-08-13
Branch: `feat/visual-poetry-pass`
Status: approved by operator (2026-08-13), autonomous execution authorised

## Problem

The Three.js migration renders correctly and fast — 120 fps, tier `full`, 661
draw calls on an M5 Pro — and reads as **messy**. It was meant to be poetic,
fantastic, beautiful and relaxing. Measured against a real-GPU capture at the
default framing, five things cause the mess:

1. **The fleet is a carpet.** ~185 hulls at near-uniform spacing and near-uniform
   screen scale cover 100% of the frame, edge to edge. The density field in
   `garden-fleet-placement.ts:118-134` knows only two rules — "not within 9 tiles
   of the lighthouse" and "ramp down over the last 6 tiles of the map edge". Blue
   noise plus those two rules is, by construction, a uniform fill. There is no
   negative space, so there is no composition and no focal hierarchy: the
   lighthouse competes with ~60 hulls of equal visual weight.
2. **The sails are stickers.** Hero hulls carry a flat, front-facing,
   rotation-zeroed logo panel scaled `1.6 × 1.75`
   (`garden-ships.ts:1211-1215`), painted as a matte disc at `alpha 0.94` over
   cloth that is only lifted 17% from the raw brand colour
   (`garden-sail-texture.ts:33`). Sixty saturated high-contrast rectangles at
   uniform size read as UI decals pasted onto a world.
3. **There is no air.** Fog is `near 178 / far 300` (`garden-sky.ts:73-74`) while
   the island sits at depth 155–195 — so everything visible is at effectively
   zero fog. A hull at the far edge is exactly as sharp, bright and saturated as
   one at the lighthouse's foot.
4. **The sun never moves.** `directionalLight.position` is hard-coded at
   `(-35, 48, -30)` (`world-renderer.ts:974`); the day cycle changes light
   *colour* and *intensity* only. Dawn and dusk therefore read as a tinted noon,
   with the same shadow direction and the same flat, high key.
5. **The sky is built and never seen.** The dome exists solely to feed the PMREM
   probe and is documented as never visible under the locked camera
   (`garden-sky.ts:410-416`); cumulus billboards are built and disabled
   (`GARDEN_CUMULUS_BILLBOARDS_ENABLED = false`); `garden-horizon.ts` is a
   permanent no-op returning an invisible empty group.

## Governing aesthetic

**Japanese Garden × Virtual World × Pharos Watch.**

This is the tie-breaker for every judgement call below, and it is unusually
well matched to the diagnosis, because a Japanese garden is organised by exactly
the properties the scene currently lacks:

- ***Ma* (間) — negative space is a positive element.** Empty water is not
  wasted water. This is the licence to stop filling the frame.
- **Asymmetry (*fukinsei*).** Off-centre anchoring, odd-numbered groupings,
  nothing mirrored. Already a stated invariant ("asymmetric, sea-first, and
  intentionally open") and currently contradicted by the placement field.
- **Borrowed scenery (*shakkei*).** Distant elements composed into the view as
  background rather than as subjects — which is precisely what atmospheric haze
  and a visible horizon deliver.
- **Restraint (*shibumi*).** A narrow, muted palette with few saturated accents.
  Brand colour becomes a tint in cloth, not a billboard.
- **Suggestion over statement (*yūgen*).** Mist, partial occlusion, things half
  seen. Distance should withhold detail, not merely shrink it.

The analytical contract is unchanged: every cue keeps detail-panel and
accessibility-ledger parity. Identity that recedes in the far field must remain
recoverable on hover, on selection, and in the ledger — which
`VISUAL_INVARIANTS.md` already designates as the redundant channel.

## Constraints

- **Orthographic lock.** The camera is a 2:1 isometric `OrthographicCamera` at a
  fixed 30° elevation / 45° azimuth (`world-renderer.ts:2332-2351`). Hit-testing,
  DOM label placement, sea-sign siting, the water shader's analytic lighthouse
  mirror column, and hero reflections all derive from that lock. A perspective
  camera is out of scope.
- **Draw-call ceiling 700; currently 661.** ~39 calls of headroom. New visual
  work must be batched or instanced, or must free calls elsewhere. Per
  `TESTING.md`, the answer to a 50-call feature is to batch it, not to raise the
  ceiling.
- Also bounded: 500k triangles, 500 geometries, 72 textures, p90 ≤ 20 ms, tier
  `full`.
- Reduced motion must stay a complete deterministic static composition with zero
  continuous RAF.
- One route-owned clock drives all motion. No per-entity timers.
- Visual gate baselines in `outputs/visual-gates/` are invalidated by design;
  the operator authorised re-baselining.

## Stages

Each stage is a separate commit, verified on the real GPU with `npm run preview`
plus `npm run validate:changed`. Later stages are independently droppable.

### Stage 1 — Atmosphere and light

The cheapest, largest win, and it makes every later stage read better.

- **Pull the fog in** so depth actually separates the near fleet from the far
  fleet. Recalibrate the ladder documented at `garden-sky.ts:31-92` against the
  default framing rather than abandoning it.
- **Desaturate with distance** in the fleet batch shader. Fog alone only shifts
  hue toward the fog colour; saturation loss is what actually quiets sixty logo
  sails. Gentle, per the operator's answer — far hulls stay identifiable to a
  deliberate look, they simply stop shouting.
- **Put the sun on an arc.** Drive azimuth and elevation from the hour so golden
  hour rakes low across the water and shadows lengthen and swing. Requires
  moving the shadow frustum with it.
- **Give the upper frame something.** Enable cumulus billboards; ring the mist
  banks around the map instead of only the far −X/−Z quadrant
  (`garden-sky-billboards.ts:64-70`).
- **A sun/moon glitter road** — a broad anisotropic specular path toward the
  light at low elevation, replacing the narrow `pow(dot, 120)` point highlight.

### Stage 2 — Quiet the fleet

- **Weave the mark into the cloth.** Remove the flat front-facing logo panel;
  let the mark follow the sail's existing curved patch geometry, tinted by the
  cloth rather than stamped as an opaque disc.
- **Make cloth read as cloth.** Raise the canvas lift and add per-ship weathering
  variance so brand colour survives as a tint, not as paint.
- **Gate mark opacity by distance/zoom** in the batch shader — crisp near, plain
  cloth far, full identity on hover, selection and in the ledger.
- **Widen the scale hierarchy** so flagships genuinely dominate and micro hulls
  are small marks (currently a 3.7× spread that reads as uniform on screen).
- **Compose the placement field.** Replace uniform blue noise with anchorages,
  approach lanes and deliberate open water — odd-numbered clusters, asymmetric,
  with *ma* between them. This is the single biggest contributor to "messy".

### Stage 3 — Framing (gated)

Ships only if it holds up under review; everything above stands without it.

- Lower the isometric elevation from 30° toward ~18° by changing the tile ratio
  — `TILE_HEIGHT / TILE_WIDTH = sin(elevation)`, so 16/32 is exactly 30° and ~10/32
  is ~18°. The projection stays orthographic and all dependent math continues to
  derive from the same two constants; camera height generalises from
  `d·√2·tan(θ)`.
- Restore `garden-horizon.ts` as a real distant haze band, now that a horizon is
  actually in frame.
- Keep the present 30° survey framing as the overview mode.
- Re-verify: hit-testing, DOM label occlusion, sea-sign yaw, hero reflection
  length, the analytic mirror column's view-direction assumption, shadow frustum
  coverage, and self-occlusion of the fleet at a shallower angle.

### Stage 4 — Repose

- Very slow idle camera breathing so the landing view is alive without demanding
  attention. Must respect reduced motion and the single route-owned clock.
- Volumetric beam sweep from the lighthouse.

### Beyond

Execution continues past Stage 4, evaluating further refinements against the
governing aesthetic until marginal improvement is exhausted. Candidates to
assess, not commitments: seasonal palettes, water surface stillness near shore,
reflection quality, lantern bloom restraint, sound of composition at the zoom
extremes, first-frame arrival.

## Verification

- `npm run preview` at each of dawn / day / dusk / night, looking at the frame,
  not only the counters — a rejected material is skipped silently at draw time.
- `npm run preview -- --assert` for the perf tripwire; `--assert --reduced` for
  the settled static resource gate; `--assert --hash "#cam=0,0,0.28"` for
  whole-map framing.
- `npm run validate:changed` per stage; `npm run validate:release` before
  claiming release confidence.
- Re-baseline `outputs/visual-gates/` once composition settles, not per stage.

## Non-goals

- Perspective camera.
- Raising any measured performance ceiling to accommodate cosmetics.
- Changing what the world means: ship routes and docking cadence still show
  rendered-chain/risk presence only, and missing peg evidence stays a caveat.
- Touching the host repo, or manual release tagging.
