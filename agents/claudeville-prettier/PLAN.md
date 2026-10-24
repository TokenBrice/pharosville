# PharosVille — Prettier & More Magical: consolidated enhancement plan

Date: 2026-10-24 · Baseline: `main` @ v1.2.1 "Canvas Up" · Status: **decisions settled by operator 2026-10-24 (§5); awaiting go to implement**

Inputs are 12 specialist reports in this folder (`01`–`12-*.md`, ~31k words, ~150 ideas) and 38 real-GPU
captures in `shots/`. Each idea below keeps its source ID, for example `06-F1`, so you can open the full
rationale, file anchors and costs in that report. I spot-checked the load-bearing claims in code: `uFogDensity`
is keyframed but never read; the flag size floor is at `fleet-system.ts:772`; cloud-bank drift ignores wind
direction (`sky-system.ts:329`); the rainbow and tide gauge have no DOM text; PSI `inputDegradation` is unread.

---

## 1. What the sweep found

PharosVille is further along than a generic "add bloom" list assumes. Per-hour LUT grading, AgX, tilt-shift,
caustics, sea bed, glitter, Kelvin wakes, night pool reflections, a volumetric depth-aware beam, a rich fire,
the furl morph, heel, swell bob, honest weather and fully procedural camera-aware audio all exist. The night
frame is already the yardstick. The gains are in a few specific, mostly shader-sized gaps:

1. **The confetti fleet.** Three causes stack: (a) a 9 px minimum on every resting burgee
   (`fleet-system.ts:772`) out-sizes 3–6 px hulls; (b) the white emblem disc and dyed sail are the brightest
   thing on a far ship (`06`); (c) ~260 moored hulls in the Roads show full sails broadside since v1.2.1
   (`07`). Hulls also lack water contact at distance (`03`).
2. **No air.** `uFogDensity` is dead, so far solids stay sharp and saturated against a hazy sea, and they look
   pasted on (`01`, `02`).
3. **Water is one value.** The basin is a single saturated cobalt that competes with the white tower. Nothing
   in the world reflects by day, and the sea receives no shadows (`01`, `02`, `03`).
4. **The beam lights nothing.** The Pharos — the world's central signal — sweeps across sails, walls and
   hills without touching them. The tower is a cold slab at night, and "unlit" reads as "not loaded" (`05`).
5. **The wind is not one wind.** Ships sail into the eye of the wind with full canvas at the same speed and
   heel on every heading. Cloud banks drift one way regardless of wind. Trees never move. Sails are rigid
   plates. Galley oars are frozen mid-stroke (`04`, `06`, `07`, `08`).
6. **Data moments pass unmarked.** The sim already reacts to real diffs (launch, depeg, recovery, death), but
   there is no staging, no record and no ceremony. A dead coin sails herself to Wreck Cove (`07`, `10`, `12`).
7. **Empty places and hours.** The west lobe is a uniform 1,680-prop scatter. Gulls are the only animals.
   3 am is an empty set. Every lamp lights at the same instant at dusk (`05`, `08`, `09`, `12`).
8. **Three honesty gaps** to close whatever else ships: the tide gauge has no DOM equivalent, the rainbow has
   no DOM equivalent, and the beam burns at full certainty when PSI was computed without DEWS (`04`, `10`).

## 2. Rules this plan holds to

- Nothing re-maps an existing signal silently. Every new analytical cue names its field, threshold and
  DOM line (§6). Decorative layers are listed as decorative in the legend.
- Fog stays the only low, banked, horizontal veil, and it means stale data. Any storm grey or distance tint
  must be visibly different (§5 D-2).
- Calm: rare events are throttled in code and tests. Reduced motion stills or skips every new motion.
- Perf: almost everything is ALU in existing passes with 0–1 new draws. Each wave is measured on the
  Apple Silicon gate with `npm run preview` before release (§8).
- No ships that are not coins. Anything new on the water must be clearly decorative (an animal, or a
  declared "harbour tug/pilot" with its own hover).

---

## 3. The shortlist — if only twelve things ship

Ranked by visible impact per unit of effort and risk. iGPU = estimated Apple-Silicon frame cost.

| # | Idea | Sources | Effort | iGPU | Meaning |
|---|---|---|---|---|---|
| 1 | **Ships ride at anchor, not confetti**: distance-aware flag law, far-ship silhouette (disc melts, hull sheer and waterline lip), hull meniscus and lee slick | 01-A2, 06-F1, 03-O4 | S–M | ≈0 (saves flag px) | decorative; brand hue kept |
| 2 | **The beam as a real light**: the sweep lights sails, hulls, walls and hills; a heliograph by day; firelight down the tower; the tritons flare | 05-P1, P2, P5 | M | <0.1 ms | extends PSI exactly |
| 3 | **Lamplighting wave**: dusk lights spread out from the Pharos, and dawn douses them in reverse | 05-P3, 12-M8a, 09-L8 | S | ≈0 | decorative |
| 4 | **One wind**: a shared gust field; cloud drift follows the wind; cat's-paws heel the fleet in sequence; points of sail; no crabbing | 04-W08, 07-M1, M4, M8 | S–M | ≈0 (CPU) | DEWS wind strength, unchanged |
| 5 | **Breathing canvas and rowing galleys**: sails billow and luff on tacks, and bireme and trireme oars stroke | 06-F2, F3, 07-M2(oars only) | S–M | ~20 VS ALU on sails | decorative on a data-bound silhouette |
| 6 | **Water with depth**: clouds drift across the mirror, three value bands, a dredged channel and shallows | 03-O2, 01-A4, 03-O6 | S | ~0.05 ms | decorative; Shoals still read lighter |
| 7 | **Golden hour**: the tower lays its shadow across the bay, sails glow like lanterns against a low sun, gilt and bronze catch light, and the warm window widens | 02-L1, L2, L5, 01-A8 | S–M | 0.1–0.25 ms | decorative |
| 8 | **Arrival and glides**: minimum-jerk camera moves; the poster dissolves into a drift-in while the Pharos is kindled to its live value | 12-M1, M2, M13 | S | 0 | ends on true PSI |
| 9 | **Moments with a record**: an event detector and Day book, last voyages (tow to Wreck Cove, adrift to the Shoals), launch down the ways, maiden bunting | 10-EV-00, 07-M6, M7, M12, 10-DA-07 | M | ≈0 | existing events + DOM record |
| 10 | **A storm you can see coming**: a front rolls in from upwind with a shelf-cloud lip, structured cloud instead of a grey wash, sunbreaks after rain | 04-W01, W02, W03 | M | ~25 ALU on the sky band | DEWS + new trend line |
| 11 | **The hinterland**: ecological scatter, olive terraces and a vineyard, trees that sway, a hill sanctuary, hearth lights at night | 08-T2, T1, T3, T4, T9 | M (one island rebuild) | net −tris | decorative |
| 12 | **Life by the hour**: roles by the hour, the keeper's night, dolphins at the mouth, goats, gulls that follow ships | 09-L1, L2, L4, L3, L6 | M | +2 draws | decorative |

Audio rides along, opt-in as always: the Shipyard's voice, the beam's passing, the day clock and the
ten-minute settle (`11-A1, A3, A4, A8`), behind the PCM diet (`11-A13`).

---

## 4. Delivery: eight waves

Each wave is one themed, versioned release through the normal `release.yml` flow. The order is chosen so
that foundations land before the work that builds on them, and so that each shader file has one owner per wave.

### Wave 0 — "True Marks" (honesty + foundations) · S · ~1 PR
- Tide-gauge panel and hover fact (`globalChange7dPct`, plus global 24 h/30 d). Remove it from picking `SKIP`. `10-DA-10a`
- Rainbow/recovery DOM line on the Storm-signal panel ("recovered from Alert, N min ago"). `04-W07` note
- **Qualified lamp:** when `inputDegradation.*Unavailable` is set, a horn shutter narrows the beam, and the
  Pharos panel adds "computed without early-warning data". `10-DA-09`
- Foundations, built once and shared:
  - **F-wind:** one `gust(x,z,t)` field plus wind vector in `weather/`, exported as uniforms and a CPU
    function. Sails, trees, flags, cloth, ocean cat's-paws, cloud drift and audio gusts all read it.
  - **F-fleet3:** a third `uFleetData` texel (tack rate, luff, lantern-lit bit, draught step). `06` says do it once.
  - **F-glide:** `CameraRig.glideTo` (`12-M1`). Every later camera move uses it.
  - **F-events:** `model/events.ts` `detectEvents(prev, next)` as a pure, unit-tested function with no
    staging yet, plus a Day book section in the Harbourmaster panel. `10-EV-00`
- `L4` triangular dither after the LUT (night-sky banding fix), plus the static paper tooth (~1.5 %, never
  animated, zero near UI edges) behind an art review on real frames (D-6). `02-L4`, `01-A11`

### Wave 1 — "Riding at Anchor" (the whole-frame fix) · S–M
- Flag law by distance: cap at 0.3×LOA below ~25 px and drop `flagMinPx` to ~4. A search hit still forces the full flag. `01-A2`
- Far-ship silhouette pass in `fleet-material.ts`: the emblem disc fades into the brand field, cloth
  value −20 %, a pale sheer line and waterline lip, and a ×1.35 LOD freeboard cheat. `06-F1`
- Earth-pigment sail dye: cap chroma, keep hue; the hovered/selected hull gets full chroma. `01-A3`
- Hull meniscus and downwind lee slick in the wake live layer (spare channel, no new RT). Shrink the Roads
  buoy foam blotches to rings. `03-O4`
- Wet waterline and weathering band on hulls. `06-F4`
- Water value bands, channel and shallows, clouds in the mirror. `01-A4`, `03-O6`, `03-O2`
- Retarget tilt-shift onto the Pharos and keep coast foam out of bloom at overview. `01-A6`
- Aerial distance tint on solids (D-2): consume `uFogDensity`, static and capped, beyond harbour radius only,
  no noise or drift, identical in every data state, flag and crest materials exempt; legend lists "distance".
  `01-A1`, `02-L3`
- Sails stay set in the Roads (D-1: v1.2.1 kept). The confetti fix rests on the flag law, the silhouette
  pass, pigment cap and meniscus above.
- **Acceptance:** blind A/B of `day`, `heart-day` and overview frames; the Roads read as "a fleet at
  anchor"; the Pharos holds the top value; zero change to any reading.

### Wave 2 — "One Wind" (motion that is believable) · M
- Cloud banks and cirrus drift with the projected wind; gusts speed up the near banks. `04-W08`
- Cat's-paws: the gust field darkens the water and heels hulls in sequence; moored hulls surge and yaw. `07-M4`
- Points of sail: polar `vrel` at path build (leg durations unchanged, so D10 holds); heel ∝ sin²θ; luff
  flutter under 40°. `07-M1`
- Breathing sails: belly, luff ripple and flog on tacks, mirrored in the shadow depth pass. `06-F2`
- Galleys row: bake oar pivots in `hull-kit.ts`, ~0.5 Hz stroke under way, raked at rest. `06-F3`. Tacking
  offshore (`07-M2`) goes in only if `plan.ts` capacity holds at ~31 % under way.
- Yaw into give-way so hulls steer instead of crabbing. `07-M8`
- Slow decorative wind veer on the rest pose only, so the anchorage wheels as one. `07-M5`
- Trees, vines and laundry sway (needs the island sway attribute, so it may slip to Wave 6). `08-T3`
- Audio: share the gust envelope with the existing wind and gust layers.

### Wave 3 — "Kindling" (light and night) · M
- Beam as a real light: a shared `hbBeamLight()` in the kit, fleet and lamp sprite shaders, with
  `uBeamFall` shared by every consumer. `05-P1`
- Daylight heliograph, dimmed by DEWS cloud. `05-P2`
- Firelight down the tower, triton and Helios flares as the beam passes, tower windows lit top-down. `05-P5`
- Banked fire and vigil when PSI is unlit: ember bed, wisp, resting mirror, tiny keeper's lamp. `05-P4`
- Lamplighting wave by distance from the Pharos, for windows, lamps and riding lights. `05-P3`
- Sea receives the sun shadow, penumbra softens with sun elevation, and the sea warms at golden hour. `02-L1, L6, L11`
- Sail translucency against a low sun; gilt and bronze as metals with sparse static glints. `02-L2, L5`, `06-F7a`
- Golden-hour window keyed to solar hours, and no moon disc beside the sun. `01-A8`
- Stern-lantern hardware lit by the existing `sternLampLit`. `06-F6`
- Longer calm-water lamp reflections, plus riding lights in the pool. `03-O11`
- Beam lights the smoke plume. `05-P7a`
- Audio: the beam's passing, a soft breath per sweep whose level follows reach; muted when fog shows. `11-A3`

### Wave 4 — "Harbour Moments" (events, camera, chrome) · M
- The harbour wakes: drift-in arrival plus the Pharos kindled to its live value. `12-M2`
- Staging on top of the F-events detector, budgeted at ≤1 staged moment per 3 min and ≤6/h, never on first
  load, while stale or under reduced motion, and recorded in the Day book. `10-EV-00`, `12-M8`
  - Death: canvas struck, a declared-decorative harbour tug tows her to Wreck Cove, one bell. `07-M6`
  - Depeg/recovery: adrift with sails flogging; sheeted home on recovery. `07-M7`
  - Launch: slides stern-first down the ways, splash, dressed overall. `07-M12`
  - Maiden-voyage bunting while a coin has no week-ago supply. `10-DA-07` (new cue, §6)
- Route as a chart line for a selected boat, labelled "today's rounds (from supply share)". `12-M3`
- Physical hover: the stern lantern answers on boats; landmarks finally get in-world hover. `12-M5`
- Chart-paper unroll for the panel and ledger (CSS only). `12-M9`
- Postcard (`P`): a framed print with date, hour, PSI caption and freshness line. `12-M10`
- Keyboard: wheel zooms about the cursor, arrow pan, `[`/`]` step through visible hulls, `F` follow. `12-M11, M6`
- Idle breath (±3 % over 90 s after 3 min idle, stopped by any input). `12-M7a`
- Opt-in `W` watch (D-5): glides between data-ranked subjects (biggest mover, worst depeg, latest launch)
  with ~20 s dwells, each stop pinning the hover tag. Never started by idleness; Esc/any pan ends it. `12-M7b`
- Audio: titan arrival conch, Wreck Cove hush and anniversary bell, UI foley. `11-A5, A6, A7`

### Wave 5 — "Weather Coming" (sky and sea) · M
- Storm front from upwind with a shelf-cloud lip, rain over the sea first, a clearing line on recovery;
  plus a Storm panel trend line ("rising toward Alert" / "easing"). `04-W01`
- Storm-deck structure and slate tint (**mandatory with W01**; it separates storm from stale fog). `04-W02`
- Sunbreaks after rain and passing squalls at Watch/Alert. `04-W03, W09`
- Directional lightning (the fill light turns toward the strike). `02-L7`
- Real moon phase, moonbow for night recoveries, Milky Way on clear dark nights, meteor showers on real
  dates (Geminids Dec 13–14 would be the first after the Orionids this week). `04-W04, W07, W05, W06`
- Swell trains that arrive and break, and a wet run-up line on quays. `03-O3`
- Summer-night bioluminescence in wakes and swash only, never in the Shoals. `03-O5`
- Seasonal sky character (shapes only; cover stays season-invariant, tested). `04-W10`
- Dew and rime on autumn and winter dawns (explicitly not mist). `04-W12`
- Audio: thunder ahead of the front, dawn chorus, owls and nightjar, one hour bell. `11-A4`

### Wave 6 — "Hinterland" (one `island.glb` rebuild + life) · M–L
- One Blender pass, batched so `sea-sdf`, walkways and occupancy re-bake together:
  - ecological scatter and terrain-aware ground tone (−20–40k tris) `08-T2`
  - olive terraces, a vineyard and a threshing floor `08-T1`
  - hill sanctuary under 9 m, inside R3/D3 `08-T4`
  - mole rhythm: paving bands, hawsers, an exedra `08-T7`
  - laundry and roof life `08-T8`
  - seasonal fields `08-T11`
  - hinterland hearths `08-T9`
  - the sway attribute for `08-T3`, if it did not ship in Wave 2
- Life: roles by the hour (vendors at the empty stalls, dawn anglers, dusk promenade, a night watchman),
  the keeper's night walk, goats (new kit), dolphins at the mouth (calm seas only, never on data),
  gulls that trail departing ships and perch on masts, cats, dusk swallows, summer fireflies. `09-L1, L2, L3, L4, L6, L7`
- Carts and a shepherd on roads that do not join two chain hamlets. `08-T5`, `09-L9`
- Audio: the Shipyard's voice and the Burn furnace answering the Mint. `11-A1, A2`

### Wave 7 — "Signals" (new data cues approved in D-3) · M
- Storm cones at the masthead of each Alert+ coin. `10-DA-04`
- Chain office under works / awnings furled on 30-day supply. `08-T6`
- (Maiden-voyage bunting `10-DA-07` ships earlier, with Wave 4's launch staging; the storm trend line ships
  with Wave 5's front.) See §6 for fields, thresholds and DOM lines.

### Audio track (parallel, any wave)
`11-A13` PCM diet (18 → ≤8 MB) first, then `A8` ten-minute settle and `A9` front/back plus altitude mix.
`A11` generative modal music last (D-7): a third sound state, off by default even when ambience is on,
never seeded by market data, muted by storm/rain.

---

## 5. Operator decisions (settled 2026-10-24)

| ID | Question | Decision |
|---|---|---|
| **D-1** | Brailed canvas in the Roads? (`07-M3`, would partly reverse v1.2.1) | **Keep full sails.** v1.2.1 stands; `07-M3` is dropped. Wave 1 fixes the confetti without it. |
| **D-2** | Aerial distance tint on solids (`01-A1`/`02-L3`), given fog = stale data | **Yes, static and capped**: beyond harbour radius, no noise or drift, identical in every data state, "distance" in the legend. Wave 1. |
| **D-3** | Which new data cues to adopt? | **Storm cones on Alert coins (DA-04); maiden bunting (DA-07) + chain office works (T6); storm trend line (W01).** Not adopted: Chart Room PSI chart (DA-03), draught from 7-day supply (DA-01). Rejected: DA-02, P8, P9. |
| **D-4** | 2-poll hysteresis for events | **Staging only.** Sim reaction unchanged; the Day book entry and ceremony wait for the second poll. |
| **D-5** | Opt-in `W` watch mode (`12-M7b`) vs the L13 "no idle tours" lesson | **Ship the opt-in `W` key AND the idle breath.** W is never started by idleness. Wave 4. |
| **D-6** | Paper tooth / grain (`02-L4`, `01-A11`) | **Dither + static paper tooth**, the tooth behind an art review on real frames. Wave 0. |
| **D-7** | Generative modal music (`11-A11`) | **Yes, late**, after the ambient track; decorative only. |
| **D-8** | Far-zoom chain names as water lettering (`12-M12`) | **No.** `C` chart mode stays the only label set. |
| **W01** | Storm front (rising/easing cue) | **Front + Storm panel trend line.** Wave 5, with W02 structure. |

---

## 6. New analytical cues (adopted ones marked)

Common policy: neutral pose when the endpoint is stale or unavailable (never a "good" pose). Thresholds are
constants beside `readings/bind.ts` with unit tests. Each cue gets a hover fact and a panel row in the same words.

| Cue | Field · threshold | DOM equivalent | Notes |
|---|---|---|---|
| **DA-04** Storm cones at the masthead of each Alert+ coin (≤5, worst first) | `stress.signals[id].band` ≥ ALERT | Storm panel "Alerts" list + Boat "Early warning" | Copy: "early warning, not a depeg". 1 instanced draw. **Adopt.** |
| DA-03 Chart Room wall chart of 30-day PSI | `stability.history[].score` | Chart Room sparkline (identical slice) | **Not adopted** (D-3). |
| **DA-07** Maiden-voyage bunting | `circulatingPrevWeek` absent/0 and `circulating` > 0, feed current | Boat panel "new to the register this week" | **Adopt** (pairs with Wave 4 launch). |
| **T6** Chain office under works / awnings furled | `ChainRow.change30dPct` ≥ +8 % (hysteresis +6) / ≤ −8 % | Chain panel line + legend | A separate horizon from the 24 h movers hoist; say so. **Adopt.** |
| **W01** Storm trend | DEWS target vs shown level | Storm panel "rising toward Alert" / "easing" | Required by the visual front. **Adopt with Wave 5.** |
| DA-01 Draught from 7-day supply (±1 at 5 %, ±2 at 20 %, ≥$1M) | `circulating` vs `circulatingPrevWeek` | Panel Supply "riding deep/light" | **Not adopted** (D-3). |
| DA-02 Hull wear from safety grade | `grade` | Boat panel | A grade is a methodology opinion; "worn = bad coin" overclaims. **Reject.** |
| P8 Fire draws with the 24 h trend | score − `avg24h` | Pharos panel row | Competes with the beam's level read. **Reject.** |
| P9 Votive lamps on band rise | `stability.history` | Panel line | Asymmetric celebration drifts toward trading mood. **Reject.** |

Also rejected: growing piers (pier length already = supply), stress components as weather (untyped keys),
chain `healthBand` as decay, convoys by issuer (no issuer field; fights `GATE_BUCKET_S`), cargo on deck
from flows (`06-F11`, `07-M10`, `10-DA-05`; double-encodes the Mint/Burn, and the town deliberately carries no cargo).

---

## 7. Shared hot spots (sequence them; avoid merge pain)

- `ocean/ocean-material.ts`: touched by 01-A4, 02-L1/L11, 03-O1–O6/O11, 04-W08, 05-P2/P6. One owner per
  wave: Wave 1 value and mirror; Wave 3 shadow and beam; Wave 5 swell and bioluminescence.
- `fleet/fleet-material.ts` + the F-fleet3 texel: 06-F1/F2/F3/F4/F6, 07-M1, 05-P1, 12-M5.
- `world/materials.ts`: beam light, lamp wave, gilt metal, sway, weathering, dew.
- Lamp emission moves from one global `uLamp` to a per-lamp rank (used by both 05-P3 and 09-L8).
- `island.glb` is rebuilt **once**, in Wave 6.

## 8. Performance budget

- Wave 1–3 additions on the Apple Silicon gate: ≈0.3–0.5 ms total. The largest items are L1 shadow on water
  (0.1–0.25) and P1 beam light (<0.1); the rest is ALU in existing passes. Draws +0 to +2.
- Big-ticket items are opt-in by tier only: `03-O1` day mirror "silhouette pool" (+0.4–0.7 ms, 8 MB, High/Medium only)
  is **deferred to after Wave 3**, once O2 clouds-in-the-mirror shows how much of the "one blue basin" is left.
  `02-L9` SSAO and `02-L8` depth DOF are not planned.
- The life layer goes from 6 to ≤8 draws. `island.glb` is roughly net-zero in tris (T2 removes about what T1/T4/T7 add) and +~300 KB gz;
  check `check:bundle-size` and `check:runtime-media`.
- Each wave: `npx vitest run src/harbour`, `npm run validate:changed`, and `npm run preview` at
  t = 7 / 11 / 17.5 / 19.5 / 22 / 3, plus `dews=DANGER`, `stale=1`, `psi=none`, and winter. LOOK at every frame
  and quote p95 from a quiet run.

## 9. Deferred or rejected (and why)

| Idea | Why not now |
|---|---|
| 03-O1 day mirror (silhouette pool) | Biggest realism gain, but the costliest item. Re-evaluate after O2 + A4. |
| 02-L9 SSAO, 02-L8 depth DOF, 01-A10 ink edges | iGPU cost, or a "game shader" look. |
| 12-M4 focus pull on selection | The L13 lesson (DOF hides neighbours). A/B only. |
| 04-W11 heat shimmer, W13 after-rain steam, W14 green flash | Low value, or (W13) too close to the fog grammar. |
| 09-L5 fish shoals, L11 crowd at titan, L12 anniversary offerings | Name clash with the Shoals; emphasis/truth risk; lore drift. |
| 08-T12 aqueduct | More Roman than Ptolemaic (D3); T4 first. |
| 07-M9 titan pilot gig, M11 ensign dip | Charming but small; candidates for a later polish pass. |
| 06-F5 crew on deck | High charm, but a new kit and +1 draw. Revisit after Wave 6 life. |

## 10. Effort at a glance

| Wave | Theme | Size | Main risk |
|---|---|---|---|
| 0 | True Marks | S | none — do first |
| 1 | Riding at Anchor | S–M | brand legibility at overview (test with search) |
| 2 | One Wind | M | `plan.ts` capacity if tacking ships |
| 3 | Kindling | M | bloom thresholds; beam must stay calm |
| 4 | Harbour Moments | M | rarity budget enforced in tests |
| 5 | Weather Coming | M | storm vs stale-fog separation |
| 6 | Hinterland | M–L | one large Blender rebuild |
| 7 | Signals | M | truth: thresholds, copy, legend |

## Appendix — reports

`01-art-direction` · `02-light-post` · `03-ocean` · `04-sky-weather` · `05-pharos-night` · `06-fleet-craft` ·
`07-ship-movement` · `08-town-landscape` · `09-life` · `10-data-alive` (includes the full field → World/DOM/Unused
map) · `11-audio` · `12-moments-camera`. Captures: `shots/` (66 MB; scratch, do not commit).
