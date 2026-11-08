# O5 — Fleet & ship craft (`fleet-craft`)

Baseline `29e0b2a3` (v1.4.1). Real-GPU captures (RTX 5070 Ti, 1600×1000) in `shots/O5-*`, mockups in
`mockups/O5-*`. Measurements come from `--eval` probes on the live fleet.

## 0. Evidence used

| Range | Frames |
|---|---|
| Far (default heart view, overview) | `base-day.png`, `base-overview.png`, `O5-crop-day-roads.png`, `O5-crop-hover.png`, `O5-lowtier-default.png` |
| Mid (~340 m) | `O5-mid-roads.png`, `O5-signals-mid.png` (`?stormflags=5`) |
| Close (130–200 m) | `O5-close-roads.png`, `O5-close-traffic.png` + burst (`O5-burst-sheet.png`), `O5-crop-close-sails.png`, `O5-crop-close-docked.png`, `O5-close-shoals.png`, `O5-close-cove.png`, `O5-titan-usdt.png` |
| USDe diagnosis | `O5-crop-usde-flag-close.png`, `O5-crop-usde-sail-edge.png`, `O5-atlas-usde-stretch.png` |
| Mockups (pixel approximations) | `mockups/O5-mock-far-print-roads-pair.png`, `mockups/O5-mock-printed-close-roads-pair.png` |

**Fleet census at the default view** (eval): 657 boats. 261 skiffs and 135 boats (< $10M, **60 %**), 164 small,
76 medium, 17 large, plus 4 titans. Median on-screen LOA: skiff 14 px, boat 21, small 28, medium 57, large 72,
titans 79–112. 194 house flags are drawn. Phases: 208 moored at swing moorings, 38 in rafts, 176 docked, 20 aground,
the rest under way.

## 1. Current state at three ranges

- **Architecture is right.** All 657 hulls render in one BatchedMesh draw (`fleet-system.ts:350-369`), at about
  0.30 ms of 2.37 ms GPU on the RTX. Flags are one instanced draw.
- **Close range is a crafted miniature:** planked decks, swan necks, steering oars, breathing canvas, rowing galleys,
  sea-driven heel and pitch. The burst shows believable heel, a tack and Kelvin wakes (`O5-burst-sheet.png`).
- **The Shoals and Wreck Cove are among the best passages in PharosVille** (`O5-close-shoals.png`,
  `O5-close-cove.png`). Grounded hulls list in surf rings and fly the chequered distress flag *above* their colours.
  The cove's memorial arc, nameboards and lantern posts are calm and legible.
- **Titans:** USDT is the finest model in the harbour (`O5-titan-usdt.png`). Mast signals read at mid range
  (`O5-signals-mid.png`).
- **The device law today (v1.4.1):** every set sail prints the coin's logo on a paper-white roundel at every range
  (`fleet-material.ts:397-422`), including the LOD sail (`hull-kit.ts:228-236`). Swing moorings and rafts keep sails
  set (`sim/plan-paths.ts:57-59`, decision D-1). Every resting hull also flies an emblem burgee of at least 4.5 px
  (`fleet-system.ts:1084-1103`).
- **Weak: by day the Roads and the open sea read as logo pins** (`O5-crop-day-roads.png`, `O5-mid-roads.png`,
  `O5-close-roads.png`). A skiff is a 14×2 px sliver under a ~9 px paper disc. In the Roads region of `base-day.png`,
  9,152 px stand more than 8 L\* above their 21 px neighbourhood (p95 +33 L\*). Bright-pixel saturation (p99) is 0.70
  there, against 0.44 on the Pharos.
- **Hover and selection are verified:** full mesh, far = 0, full chroma, no aerial tint, a flag of at least 9 px
  (`fleet-system.ts:1061,1066,1089-1090`, `fleet-far.ts:21-24`). At the Roads the lift is subtle
  (`O5-crop-hover.png`). Search lifts only the chosen coin, after a camera flight (`ui/store.ts:322-329`).
- **Low tier is fine.** Docked LOD rows collapse their sails through the LOD furl morph
  (`O5-pair-mole-high-vs-low.png`).

## 2. Anatomy of the "map pin"

Four causes stack. All of them are in code:

1. **Paper ground.** The atlas sets every logo on a white disc with a warm rim (`scripts/harbour/build-emblems.mjs:24-33`).
   The shader composites it at 0.92 albedo (`fleet-material.ts:419-420`). Dyed cloth is chroma-capped
   (`livery.ts:167,176-186`) to roughly 0.15 linear luminance. The disc therefore outshines its own sail about 6:1
   (≈ +50 L\*).
2. **The far law runs backwards.** `hbFarCloth` darkens the cloth 20 % but runs *before* the print
   (`fleet-material.ts:396`, `fleet-far.ts:17-19`). The ratio grows to about 7.5:1 with distance, so far ships get
   *more* pin-like.
3. **The device overflows the sail by design.** The logo fills 97 % of the sail's inscribed circle
   (`sail-plan.ts:18`). The white ground is 1.13× that circle and the brand ring 1.24×, clamped at the outline
   (`sail-plan.ts:8-9`, `fleet-material.ts:321-326,400-406`). A square sail becomes a placard (`O5-crop-close-sails.png`:
   "X", "$").
4. **Marks skip the harbour's pigment and air.** Logo ink, monogram discs (saturation ≤ 0.62, `emblems.ts:188-196`)
   and burgee fields (`house-flags.ts:89`) bypass the earth-pigment cap (0.5). Flags also skip the aerial tint
   (`world/aerial.ts:10-11`). Above the disc rides a full-chroma, unhazed burgee: confetti.

The burgee's own roundel already melts below about 12 px (`house-flags.ts:97`). At the default view the white discs
belong to the **sails** of swing-moored skiffs and boats.

## 3. Findings (ranked)

**O5-F1 · HIGH · Coins on atlas column 0 render as salt-and-pepper noise. That includes the USDe titan.**
The emblem slot reaches the fragment shader as an *interpolated* varying. The fleet uses
`vFleetBrand.a` (`fleet-material.ts:87,173,397`); flags use `vSlot` (`house-flags.ts:20-31`). Then
`cell = vec2(mod(slot, 32), floor(slot / 32))` (`fleet-material.ts:362,413`, `house-flags.ts:102`). Interpolation
returns 320 ± ε. At an exact multiple of 32, `mod` flips between 0 and 31.99997 and `floor` between rows 10 and 9.
Each pixel then samples either the right tile or the clamped right edge of the row above.

I ruled out a bad asset. The atlas canvas and a GPU readback of the texture match `emblems.png` exactly
(gradient 16.6, 423 vs 433 edge flips), and the tile is clean (`O5-atlas-usde-stretch.png`). Affected are 20 logo
slots (0, 32 … 608: USDe, sUSDS, cUSD, EURS, BUSD, USDM …) plus monogram slots 640, 672, 704 and 736. The damage
shows on USDe's house flag, her brailed bundle and her set sail (`O5-crop-usde-flag-close.png`,
`O5-crop-usde-sail-edge.png`). The epitaph boards' `mod(board, …)` (`fleet-material.ts:332-334`) share the pattern.
**Fix:** `floor(x + 0.5)` the slot before the mod and floor in all four places, or use `flat` varyings. Add a shader
test for slots 0, 32 and 320. S.

**O5-F2 · MEDIUM · The far law amplifies the pin** (§2.2). Dim the whole print, or adopt O5-I2.
**O5-F3 · MEDIUM · The device overflows its sail** (§2.3). See O5-I3.

**O5-F4 · MEDIUM · Marks bypass the earth-pigment cap and the air** (§2.4). Logos, monogram discs and flags are the
most saturated objects on the far water. See O5-I1, O5-I5 and O5-I6.

**O5-F5 · MEDIUM · The emblem atlas uses about 120 MB of GPU and canvas memory.** Measured at runtime: a
4096×3200 RGBA8 canvas (25 rows; 640 logo slots plus 115 monograms). That is 52 MB, plus mips, for about 70 MB of
texture, plus the 52 MB 2D canvas kept alive (`emblems.ts:53-60`). Any monogram change re-uploads the whole texture
and regenerates its mips (`emblems.ts:94-101,147-148,173-175`). Boot does it at least twice (install, then logos).
This is a risk on tablets (admitted by the gate) and on iGPUs. Unmeasured there. See O5-I9.

**O5-F6 · LOW · Double branding at rest:** the logo on the brailed bundle *and* the burgee
(`O5-crop-close-docked.png`), or on the sail and the burgee. See O5-I4.

**O5-F7 · LOW · The hover/search reveal is thin at range.** The selection ring is `max(4 m, 0.66 LOA)`
(`fleet-system.ts:1393`), about 9 px at the Roads. Search does not preview in the world. See O5-I8 and O5-I10.

**O5-F8 · LOW · Furled LOD sails shade as set.** `lodSail ? 0.0 : furl` (`fleet-material.ts:177-179`) assumes a LOD
sail "has no furl shape". In fact the LOD export carries a furl morph (`blender/hulls/export.py:111`, `hb_ancient.py`
`tri2` set/furled pairs), and the vertex shader applies it (`fleet-material.ts:148-149`). So a docked LOD hull's
collapsed strip carries unweathered cloth and a squashed full roundel. It is harmless at LOD sizes, but the stated
rationale is wrong. Gate the override on `furl < 0.5`.

## 4. The proposal: "Flying Colours, printed"

Keep the v1.4.1 promise that every boat carries her coin and every coin is findable. Make the *mark* belong to the
harbour:

- **Near:** the device is painted into the canvas. The ground is unbleached canvas, not paper white. The ink is held
  to the harbour's pigment chroma, seams and tabling run across it, and it sits inside its sail.
- **Size law:** print contrast follows the device's own size on screen. The ≥ $1B ships (titans, large) carry 28–56 px
  devices at the default view and stay crisp. Medium ones stay mostly crisp. A 9 px skiff device becomes a soft patch
  of her colours in the dyed cloth. Below about 10 px only colour survives the mip chain anyway, so nothing
  recognisable is lost. The visual order follows supply, through hull size, and adds no new mapping.
- **Call forward:** hover, selection and search restore the full print, full chroma and paper ground: the coin
  "steps forward".

**Rejected:** density thinning, which breaks v1.4.1 and makes the visible set depend on the neighbours. Also
re-melting into the dye (the 06-F1 melt), which erased the logo's silhouette.

## 5. Ideas

| ID | Title | Pillar | Effort | Impact |
|---|---|---|---|---|
| O5-I1 | Printed, not stuck: the device in the sailcloth | prettier | S | 4 |
| O5-I2 | The print follows its size (screen-size law) | prettier | S | 5 |
| O5-I3 | The device sits inside its sail (fill by class) | prettier | S | 3 |
| O5-I4 | One device per resting hull | prettier | S | 3 |
| O5-I5 | Flags in the same air and pigment | prettier | S | 3 |
| O5-I6 | Monograms become sail lettering | prettier | S | 3 |
| O5-I7 | Size-class flag law for the minnows | prettier | S | 2 |
| O5-I8 | Search previews and a roll call in the world | informative | M | 3 |
| O5-I9 | Emblem atlas diet and hero tiles | all-devices | M | 3 |
| O5-I10 | A selection ring you can find | professional | S | 2 |

**I1 — Printed, not stuck.** In the sail branch (`fleet-material.ts:392-422`):

- Un-premultiply the atlas sample and detect paper ground (`min(rgb)/a > 0.85`, low chroma).
- Replace that ground with unbleached canvas from the family cloth (≤ 0.72 albedo, warm).
- Cap the logo ink's chroma with the dye's rule (DYE_MAX_SAT 0.5, full when highlighted).
- Move the seam, tabling and mottle multiply after the print.
- Apply the same treatment to the bundle print (`:359-368`, ties after the print) and to the flag roundel
  (`house-flags.ts:98-106`, ground = flag cloth).

This also stops the grey moonlit discs at night (`view-overview-night.png`). Cost: about +14 FS ALU on print
fragments, 0 draws, 0 bytes, under 0.05 ms on an iGPU. Risk: white-ink logos need a minimum ink/ground Δ. Mock:
`mockups/O5-mock-printed-close-roads-pair.png`.

**I2 — The print follows its size.** `discPx = 0.98 / (era · dpr)` (`era` already exists, `:320`), and
`k = max(smoothstep(12, 30, discPx), highlight)`. As k → 0, the ground converges to the cloth +15 % and the ink's value
contrast halves, keeping the hue. Apply the far dim to the whole print, fixing F2. Expected k at the default view:
titans and large hulls about 1, medium 0.5–0.8, small 0.2–0.4, boats under 0.1, skiffs 0.

Proposed legend line: "Sails carry each coin's device; small and distant ones are printed softly — hover, search or
zoom to bring one forward." Cost: about +6 ALU, plus a DPR uniform. This is **DECISION-NEEDED**: it softens
"crisp at every range" for devices under 30 px. Mock: `mockups/O5-mock-far-print-roads-pair.png`.

**I3 — Inside its sail.** `FILL_MAIN` (`sail-plan.ts:18`) by class: titans 0.92, large 0.88, medium 0.84, smaller
0.80, passed from `hull-kit.ts loadKit`. Dyed cloth then frames the device. Bake-time only.

**I4 — One device per resting hull.** In the flag loop (`fleet-system.ts:1102`), pass slot −1 (a plain swallowtail in
the coin's colours) when her set sail or brailed bundle already shows the print. Titans, struck rigs and highlighted
hulls keep the emblem flag. CPU only. **DECISION-NEEDED.**

**I5 — Flags in the same air and pigment.** Run the burgee and house-flag field through the pigment cap. Add the
shared aerial tint (`world/aerial.ts` GLSL) at 0.6× its cap. Exempt the highlighted hull (pack hi into `aBrand.w`).
This reopens the "flags exempt" line (`aerial.ts:10`) with a new argument: 194 burgees are the only unhazed,
unpigmented objects on the far water. Cost: +1 varying, about 6 FS ALU. **DECISION-NEEDED.**

**I6 — Monograms become sail lettering.** About 115 coins without a logo get a "poker chip": a saturated disc with a
white ring and rim (`emblems.ts:188-203`). They crowd the Roads (`O5-close-roads.png`: PA, LCNY, BAO, CLEV, USP,
BTC, JPYD, XIDR). Draw only the letters, as an alpha mask. The shader inks them from the dye: cream on dark cloth,
deep dye on light cloth (`slot ≥ uLogoSlots`). The text and identity are unchanged. Cost: +3 ALU, 0 bytes.

**I7 — Size-class flag law.** For skiffs and boats, lower the flag floor from 4.5 to 3 px and cap them at 0.25×LOA
when far (`fleet-system.ts:1086-1091`). Larger and highlighted hulls are unchanged. CPU only; no new mapping.

**I8 — Search previews and a roll call.** The active search row lifts its coin in the world through
`picking.setHover`, without moving the camera. A list with ≤ 12 boat hits lifts all of them through a new
`FleetSystem.setHighlights(ids)` (hi 0.35). This makes the quieter far print fully honest.

**I9 — Atlas diet and hero tiles.**

- Upload the logo atlas once from the decoded ImageBitmap.
- Move monograms into a small separate canvas texture, so a change re-uploads 2–4 MB instead of 52 MB.
- Drop the 52 MB canvas.
- Optionally use 96 px slots, plus a 256 px "hero" sheet for the ~21 coins ≥ $1B so titan sails stay crisp at
  maximum zoom.

Saves about 55–80 MB of GPU/canvas memory and removes boot re-upload hitches. Costs one more sampler and golden
re-baselines.

**I10 — A findable ring:** scale ≥ 22 px on screen (`fleet-system.ts:1393`).

## 6. Top picks (impact ÷ cost)

1. **O5-I2** — the single change that turns pins into a fleet. Shader-only, and it keeps every coin findable.
2. **O5-I1** — the near-range half of the same move. Sails look painted, and night stops showing grey discs.
3. **O5-I3** — a bake constant that removes placards. Zero runtime cost.
4. **O5-I6** — removes about 115 poker chips, with period-correct sail lettering.
5. **O5-I5** — settles the burgee confetti into the harbour's air.

Ship **O5-F1** first: a one-line fix for a broken titan.

## 7. Decisions for the operator

1. Adopt the screen-size print law (I2)? Devices under ~30 px print softly. Titans and large hulls stay crisp at
   default views. Hover and search restore the full print. This amends v1.4.1's "crisp at every range" without
   removing any mark.
2. One device per resting hull (I4): plain burgees where the sail or bundle already prints the coin?
3. Reopen the flags' aerial exemption (I5) at 0.6× the cap?
4. Monograms as sail lettering (I6), dropping the brand-colour disc for coins without a logo?
5. Atlas diet with 96 px slots plus 256 px hero tiles (I9). Accept golden re-baselines?

## 8. Cross-lane hooks

- **O1 art direction:** set the print value ceiling (canvas ground ≤ the town limewash, below the Pharos marble).
- **O2 light/post:** check the ground and ink under AgX, the LUT and bloom. Expose the aerial GLSL to
  `house-flags.ts` (I5). Add a DPR uniform for I2.
- **UI lane:** the I8 preview (`ui/store.ts`, `ui/Search.tsx`), the I2 legend line in `KeyList.tsx`, and the I10 ring.
- **Perf/QA:** measure I9 on the iGPU profile. Add a golden shot of USDe (F1). Captures should wait for
  `renderedBoats > 0` (one O5 capture landed on "awaiting data").
