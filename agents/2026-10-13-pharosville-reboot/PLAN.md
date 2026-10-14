# PharosVille reboot: "The Harbour" plan

Date: 2026-10-13. Status: **draft for operator review**. Execution happens later in ultracode mode.
Evidence: `research/01`–`05`, look-test renders in `art/`.

## 1. Verdict

**Build a new world on the existing data platform.** The new world is a bounded isometric harbour island:

- a real working lighthouse on its headland;
- every stablecoin is a boat that sails between open piers and visibly docks;
- a living stylized sea and an art-directed sky;
- rendered in real time with three.js `WebGPURenderer` + TSL;
- props authored as Blender scripts by Opus.

Keep the proxy, the data contracts, the DOM ledger and the release machinery. Replace the renderer, the
scene, the art and the docs that pin them.

**What stopped the previous attempts was never the stack. It was the loop:**

- six art directions in six months;
- agents grading agents' art;
- provenance, tests and receipts built before a frame was beautiful (Inlet: ~26% of 88 commits were visual);
- metaphors piling up (Alexandria, garden, observatory, harbour).

ClaudeVille shows the cure (`research/01`): one metaphor iterated for 54 versions, a locked base image before
any effects, location = state, a palette in code, decluttering driven by the operator's screenshots.

**This plan is mostly a process with gates in front of the art.** The tech is the easy part.

## 2. Locked decisions (operator, 2026-10-13)

| # | Decision |
|---|---|
| D1 | **Framing.** Bounded isometric island diorama, 3/4 from above, pan + zoom (ClaudeVille shape). No more eye-level postcard. |
| D2 | **Devices.** Desktop first. Phones are a later tier; the existing size gate stays until then. |
| D3 | **Theme.** Maritime harbour town. No Japanese garden, no Alexandria wonder catalogue, no observatory. |
| D4 | **Medium.** Stylized real-time 3D, with Opus-authored Blender assets. GPT/Sol does no art authoring. |
| D5 | **Boats.** Every stablecoin is a boat. Boats **move**: sail, approach, dock, cast off. Nothing static like Inlet. |
| D6 | **Docks.** Open piers / pontoons the ships visibly dock to. No sheds or boathouses. |
| D7 | **Intent baseline.** Current production (lighthouse + beam, coloured coin sails, harbour, night lights) is closer to intent than Inlet. Inlet is abandoned. |
| D8 | **Lighthouse.** Grey-stone "Pharos" tower: square base, octagonal middle, round lantern room with gallery and rotating lens, keeper's cottage beside. A working lighthouse with a quiet nod to Alexandria, no wonder kitsch. |
| D9 | **Hull style by peg currency.** One stylistic family (same era, materials and scale ladder); the rig and silhouette vary by peg currency (§4.2). |
| D10 | **One boat per coin, sailing a circuit between its chains.** Time docked at each pier = the coin's supply share there (`research/04 §4`). There are no sister ships. The harbour shows chain supply in its time average and through the piers' own form (§4.2). |
| D11 | **Minimal UI.** This is a visual experience. **The world carries the meaning, not UI or text.** No persistent numeral bar, no always-on data chips. Text appears only on demand (hover, click, ledger). |
| D12 | **HUD voice.** Nautical chart: serif, chart-paper panels, brass and thin rules, used sparingly. |
| D13 | **Sound.** Opt-in ambient, off by default: sea, gulls, rigging, and a foghorn when data goes stale. |
| D14 | **Perf test device.** An Apple Silicon Mac (Safari 26 + Chrome) is the integrated-GPU gate, alongside the RTX. |

## 3. The experience in 30 seconds

You land on a dusk-lit harbour island floating in a deep teal sea that fades to a horizon haze.

**The lighthouse**
- It stands on the outer headland: a grey-stone tower with a square base, an octagonal middle and a round
  lantern room with its gallery.
- Its beam sweeps across the bay and over the open sea.
- Its rhythm and reach are the stability index.

**The harbour**
- Along the inner bay, a stone quay runs into finger piers, one pier group per major chain.
- The Ethereum Grand Pier is visibly the longest.
- Hundreds of hulls with logo sails ride there: big ships for USDT/USDC, sloops for the mid-caps, a skiff
  basin for the long tail.
- At any moment a few boats are under sail: leaving a berth, crossing the bay leaving wakes, easing into
  a berth with the sail coming down.

**Outside the harbour**
- Outside the mouth lies the reef called the Shoals: a few boats anchor there, heeling. Those are the coins
  off peg.
- On the back side, Wreck Cove holds grey beached hulks.
- The Customs House tide board shows 24 painted hourly bars of mint and burn.
- A storm-signal mast flies cones when stress signals fire.

**The chrome (almost none, D11)**
- A small wordmark sits in a corner with a single live/stale dot.
- Everything else is the world.
- Hovering a boat or landmark shows a small nautical-chart tag with its name and one fact.
- Clicking opens a slim side panel.
- `/` searches the 625 coins.
- A "Chart" key opens the ledger and legend.
- Nothing textual is needed to understand the scene at a glance.

**Time of day**
- Night: windows, riding lights and pier lamps come on, and the beam becomes the hero.
- Day: crisp toy-diorama light with soft shadows.

**What it must never do**
- Nothing moves without a declared meaning or a declared "decorative" label.
- Nothing pretends to be live when stale.

## 4. World design

The data grammar is `research/04-data-to-world.md` and is adopted with the amendments below.

**Most important amendment (D11).** `research/04`'s top bar of four numerals and its always-on landmark
chips with exact numbers are **dropped**.

- Every story must read *visually*:
  - beam rhythm and reach;
  - the sea state;
  - the weather;
  - which piers are crowded;
  - boats on the Shoals;
  - the height of the Customs House tide-board bars;
  - the count of storm cones;
  - the hulks in Wreck Cove.
- Numbers live only in hover tags, the side panel and the ledger.
- Painted bars and cones in the world are fine, because they are *things*, not UI.

### 4.1 Composition: a horseshoe bay

```
                    open sea  (Outer Passage → Far Ports, map edge)
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        ~~   THE SHOALS (reef + buoys)        ~~~~~~~~~~~~~~~~~~
        ~~~~~~~~~ ^ harbour mouth ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   PHAROS ▲ headland ===breakwater===   ~~~   ===mole=== Storm mast
   Keeper's cottage / Chart Room        BAY   Customs House + tide board
     ┌─ Tron piers ─┐               ~~~~~~~~      ┌─ Base / Arb / … piers ─┐
     └──────────────┘    ┌──── ETHEREUM GRAND PIER (T-head) ────┐         │
   Slipway        TOWN QUAY · Harbourmaster · Registry · Tide Gauge · skiff basin
   ───── hill town (decorative density: houses, streets, lamps, trees) ─────
        back shore: WRECK COVE (beached hulks)          Keeper's Log
```

**Why a horseshoe.** It concentrates the motion, the meaning and the beauty in one readable basin:

- boats cross open water between piers, so motion is visible;
- the lighthouse sits at the mouth, so the beam sweeps both the bay and the sea;
- the reef sits just outside the mouth, so "off peg" means "left the safe harbour";
- the town on the hill gives ClaudeVille-like density without carrying data.

**Fill and framing.** Land plus piers fill about 60–70% of the default frame (ClaudeVille lesson #3). Open sea
frames the edges and carries the sky reflection.

**Camera.**
- A narrow-FOV perspective (about 25°), pitched about 35°, rather than true ortho. The overview keeps a horizon
  band of sky, which pure isometric ortho loses (`research/01` warns against copying that).
- The P1 grey-box confirms ortho vs perspective at true scale.
- Zoom levels:
  - *overview*: the whole bay plus the sky band;
  - *harbour*: one pier group, logos legible;
  - *close*: a single boat.
- Pan is clamped to the island bounds. A slow, optional "ambient" drift mode is allowed.
- Lower zooms see less sky. There the sky shows through lighting, reflections and cloud shadows.

**Time of day.** The visitor's local clock stays (production already does this; `?t=` overrides it).
- A dev time slider plus `?t=` make every gate frame reproducible.
- In daylight the lantern still shows: a flash on rhythm and a moving glint on the water. A daytime visitor
  can still read the PSI rhythm.

### 4.2 Boats and berths (D5, D6)

**Every payload coin is a boat (625).**

- Eligibility comes from the payload. The registry adds livery only.
- **Hull size class follows the supply decade:**
  - flagship ≥ $10B;
  - large;
  - medium;
  - small;
  - boat;
  - skiff < $1M.
- **Hull style follows the peg currency (D9).** It all stays one family: one era (late-19th-century working
  sail), one material palette, one scale ladder. The variation is silhouette and rig:
  - USD (the vast majority): Western rigs, from catboat and sloop through cutter and schooner up to a full-rigged ship.
  - EUR: Northern European rigs, such as the leeboard botter / tjalk with brown-red sails.
  - Gold and commodities: heavy, deep-laden merchant hulls (brig / galleon-like) with dark-stained wood.
  - Other fiat (CHF, JPY, BRL, GBP, …): 1–2 further regional variants, such as a lugger or a felucca-like
    lateen, chosen in P1.
  - "Other / unknown": a plain workboat.
  - The **ensign flag** encodes the currency too, so the encoding is redundant.
  - The style bible caps this at **≤ 5 rig families × 6 size classes**, authored from one parametric hull
    builder.
- **Motion semantics (D10): circuits.**
  - Each multi-chain boat sails a deterministic circuit through the piers of its chains: up to 4 piers, plus
    the Far Ports for the rest.
  - It docks at each pier for a time proportional to its supply share on that chain, so **time docked =
    share**.
  - Across the fleet, each pier's crowd tracks that chain's supply over time.
  - Single-chain coins (314) stay at their home berth and swing at their mooring.
  - The phase is `hash(id) + UTC`, so every viewer sees the same harbour.
  - The legend states it once, in the Chart panel: "boats visit each chain in proportion to their supply
    there. Sailing is not a bridge transfer."
- **Calm tuning (not data).**
  - The circuit period scales per hull class: flagships about 20–30 min, the small tail about 60 min.
  - That puts roughly **25–40 boats under way** and **4–8 dockings per minute** across the harbour.
  - Big ships move rarely and majestically; the motion comes from the mid-fleet.
  - Known cost of D10: in a single screenshot a flagship is at one pier only. For example, USDT sits at Tron
    about 58% of the time and at Ethereum the rest.
  - The *structure* of the harbour keeps the supply map true at every moment: pier length, berth count and the
    Grand Pier's dominance are sized from chain supply.
- **Real voyages, from snapshot diffs only, override the circuit:**
  - depeg → Shoals; recovery → resume the circuit;
  - new coin → Slipway launch;
  - death → tow to Wreck Cove.
  - These are the only voyages that are events. Each plays once, and never on first load.
- **Docking spec** (the P2 brief must implement exactly this):
  - **Berths.** Each pier has finite berth slots, sized from its **expected occupancy**: the sum over coins of
    the time-share at that pier, per hull class, plus about 20% headroom.
  - **Allocation.** A deterministic schedule (from `hash + UTC`) assigns every arrival a free berth of its class.
  - **Overflow.** It goes to the T-head, the quay wall, then a moored-outside raft. Nothing ever overlaps.
  - **Lane graph.** Boats sail on a lane graph authored in Blender and exported as empties: one-way loops
    round the bay, an approach gate per pier, and no crossings inside pier zones.
  - **Spacing.** Departures are staggered so two boats never contest one approach gate.
- **Docking is the signature animation.** Per `research/05 §E`, a boat:
  1. passes the approach gate;
  2. turns in on the camera side;
  3. eases into the berth while its sail comes down;
  4. gets mooring lines drawn and its sail cover shown in the brand colour;
  5. later casts off on the reverse path.
- **Piers are the supply map.**
  - Each chain's pier length and berth count come from its supply share and expected occupancy, so
    Ethereum's Grand Pier is visibly about half the waterfront.
  - Empty berths show as slots (bollards).
  - A small painted supply bar on each quay wall adds a quiet in-world gauge.
  - The single-chain long tail of the 102 minor chains moors as a **Far Ports raft** outside the breakwater.
  - One berth size per finger row. Flagships and large hulls moor at T-heads and quay walls.

**Legibility.**

- At overview zoom, flagship and large hulls are ≥ 60 px.
- Logos are legible at harbour zoom.
- **Logos.** A 4096² atlas with 256² slots holds 256 logos, enough for every registry-known coin. Everything
  else gets a generated monogram sail in its brand colour.
- **Labels (minimal, D11).**
  - Rendered on **one canvas overlay**, with collision culling ported from ClaudeVille's label design.
  - **Nothing is always on.**
  - Hover shows a nautical-chart tag with a name plus one fact.
  - Selecting pins it.
  - An optional "Chart" mode (a key toggle) shows landmark names and the top-10 boat names, for people who want
    to read.
  - The DOM ledger is the accessible parity path.

### 4.3 The lighthouse (hero asset)

**An actual lighthouse**, with every part working:

- a grey-stone tower (D8): a square base, an octagonal middle and a round upper shaft;
- a gallery with railing;
- a glazed lantern room holding a rotating Fresnel lens;
- the keeper's cottage, oil store and signal mast beside it.

It is lit and animated in real time:

- the lens rotates;
- the beam is a raymarched volumetric cone on WebGPU and a cone mesh on WebGL2;
- the lamp glow blooms;
- the beam sweeps across the water, leaving a moving specular streak.

**Data channels** (`research/04`): beam **rhythm** = PSI band; **reach/brightness** = score; lamp colour in 3
steps. A null band gives an unlit lantern; the reason ("no reading") appears only on hover.

The lantern colour and the beam are the only saturated light on the headland. The tower is the tallest silhouette in the scene.

### 4.4 Sea and sky (the place to beat ClaudeVille)

ClaudeVille's own audit names its sea as its weakest surface (`research/01 §5`). This is where PharosVille wins.

**Sea**
- Depth-absorption colour from a baked bathymetry/shore distance field.
- Gerstner swell, plus detail normals.
- Contact foam bands around shore, piles and hulls.
- A shared world-space wake/foam render target that every moving boat stamps into, giving real Kelvin wakes.
- Sky reflection, plus WebGPU screen-space reflections of the town lights.
- Moving beam glints.
- Sea state (amplitude, whitecaps) = share of supply off peg, in 4 declared steps.

**Sky**
- A real sun/moon path driven by the visitor's local clock (declared decorative).
- Art-directed keyframe palettes, with a 3D LUT per hour.
- A star field and the moon.
- Soft cloud banks, plus cloud shadows on the island.
- Cloud cover and wind = the stress-signal (DEWS) band.
- Fog only when data is stale.

## 5. Art direction

The look-test (`art/lookdev-*.png`, 6/10) proves several things:

- the ingredients work: a real lighthouse, an open pier, berths readable at 3/4, a warm night beam;
- palette-material coherence is nearly free;
- EEVEE matches Cycles, so the look does not depend on expensive global illumination.

It also proves the failure mode: **generic low-poly stock look**, empty lawns, pancake clouds, a flat horizon band.

**Target.** A *crafted miniature*:

- Tiny Glade / Townscaper warmth;
- Bad North restraint;
- ClaudeVille density.

The next frames have to show:

- **Signature.** Soft ink outlines or rim, a painterly grade, slight colour noise and texture breakup (trim
  sheets / palette atlas with hand-painted variation). No flat-shaded facets on hero assets.
- **Density.** Streets, fences, nets, crates, lamps, flower boxes, stairs and rocks. The town reads as
  inhabited, and the declutter rule applies only to the *water and data surfaces*.
- **Scale ladder.** The lighthouse is the tallest silhouette. Ships are the next. Buildings are human scale.
- **Palette in code.** A single palette/material contract (like ClaudeVille's `artPalette.js` and `DESIGN.md`).
  - Saturated hue is reserved for status and brand sails.
  - The environment stays in a restrained warm-stone / teal / slate range.
- **Night must stay readable.** Riding lights, window frames, pier lamps and the moonlit sea. Both previous
  night sets failed this.

**Pipeline** (`research/05`): Opus writes reproducible Blender Python builders per asset family:

1. export GLB (meshopt + KTX2 via gltf-transform);
2. bake AO into vertex colour / lightmaps;
3. keep lighting dynamic.

Hull families (≤ 5 rigs × 6 sizes, D9) come from one parametric hull builder, with a node contract (`mast`,
`boom`, `sail_main` with furled→set morph, cleats, light empties) and a 4096² logo atlas.

**No procedural hero props in TypeScript.**

## 6. Technical architecture

**Keep (lift with minimal change):**

- `functions/` proxy and the server-side key;
- `shared/` contracts (trimmed);
- data hooks / zod guard / TanStack;
- fixtures;
- the accessibility ledger and detail panels (restyled);
- CI/security scripts;
- `release.yml` flow.

**Fix first (small, shippable to current prod independently):**

- `activeAssets()` drops 441 of 625 coins (`src/systems/pharosville-world/stages/ship-placement.ts:107`);
- `psiSweepDuration()` maps an unknown PSI band to BEDROCK (`shared/lib/psi-colors.ts:65-67`).

**New module: `src/harbour/`.** It is mounted behind a dev route / flag until cutover. The old world stays
live in production meanwhile.

| Layer | Content |
|---|---|
| `model/` | Pure, deterministic and renderer-free: payload → harbours, berths, boats, circuits, voyages, landmark readings, truth states (stale/unknown). **This is where tests live.** |
| `scene/` | Loads GLBs, lays out the island from a Blender-exported layout (berth/approach empties come from Blender, not hand-typed numbers). |
| `fleet/` | Instanced hulls per class; per-instance heel, tack, sailState, emblemIndex; CPU advances path position only. |
| `ocean/`, `sky/`, `beam/` | TSL materials; wake render target; time-of-day controller. |
| `post/` | Quality ladder: **High** (WebGPU: GTAO, SSR, volumetric beam, bloom, TRAA, tilt-shift, LUT) → **Medium** (no SSR, ½-res AO) → **WebGL2** (cone beam, bloom, SMAA). Fewer effects, never different art. **Night readability is authored on the WebGL2 baseline**: emissive windows and riding lights, bloom, light pillars on the water, a cone beam. WebGPU adds only polish (clustered lights, SSR, volumetrics). |
| `boot/` | **First paint.** A Blender-rendered poster of the harbour at the current hour band is the first image on screen. It doubles as the OG image (no live numbers baked in) and the small-screen page. Shaders are warmed with `compileAsync` behind the poster, then crossfade. Budget: poster < 1 s, live frame < 4 s on desktop broadband. |
| `labels/`, `ui/` | Canvas hover tags + optional Chart mode; corner wordmark + live dot; slim side panel; ledger/legend; search. No persistent HUD (D11). |
| `audio/` | Opt-in ambient (D13), loaded lazily only when enabled. |

**Renderer.** three.js `WebGPURenderer` pinned at 0.186.x, with all shaders in TSL so the same code drives
WebGL2.

**First engineering task: a perf spike at real budgets, before art integration.**
- What it measures:
  - TSL ocean + wake RT;
  - ~700 instanced hulls at the budgeted triangle counts, with sail morphs;
  - the outline/grade pass;
  - ~150 night point lights;
  - the volumetric beam;
  - all on WebGPU **and** forced WebGL2, via `npm run preview`.
- Thresholds:
  - **RTX:** p95 frame time ≤ 8 ms at 1600×1000 on the High tier.
  - **Named integrated-GPU device:** p95 ≤ 16.7 ms on the Medium or WebGL2 tier, measured on the Apple Silicon Mac (D14) in Safari 26 and Chrome.
- Fail → stay on `WebGLRenderer` + GLSL with the same art. Decide the baseline **before G1 closes**.

**Budgets** (initial, revisable by measurement rather than tests):

- first view ≤ 6 MB transferred;
- ≤ 400k triangles on screen;
- ≤ 120 draw calls;
- ≤ 256 MB GPU memory;
- the scheduler pauses when hidden.

## 7. Process: how this run avoids the last six months

**Rules for every ultracode phase:**

1. **The operator's frame verdict is the only taste gate.**
   - Each gate shows **2–3 independently authored candidates**, side by side, from the real GPU (`npm run preview`).
   - The operator records prefer/reject plus notes in `agents/…/verdicts.md`.
   - Each gate is **one screen**: candidates side by side, plus a three-line verdict template
     (pick · keep · kill).
   - At most 2 fix loops per gate, then cut scope.
   - Agents never convert silence into acceptance; with no verdict, art work pauses.
2. **Opus authors and critiques art** (Blender, shaders, composition). Sonnet does mechanical work (data model,
   wiring, ledger port, budgets, refactors). Haiku does inventories. GPT/Sol authors no art.
3. **Beauty before plumbing.** No provenance receipts, capture-binding, hashing or invariant docs until G2
   passes.
4. **Tests pin semantics, never art.** Data truth, counts reconcile, determinism, security, disposal and
   budget ceilings. No draw-count, mesh-name, pixel-MAE or numeric art-recipe assertions.
5. **Docs cap.** One `HARBOUR.md` product contract (≤ 300 lines) after G2, plus the existing ops/security/release docs.
6. **Small stills are committed** under `agents/2026-10-13-pharosville-reboot/` so approved frames are never lost.
7. **One metaphor.** Any proposal to add a new landmark type, ritual or event system needs the operator's yes.
8. **Report caps** on every subagent; one plan file; resume cached workflow runs rather than re-running.

## 8. Phases and gates

| Phase | Work | Team (ultracode) | Gate |
|---|---|---|---|
| **P0 Prep** (½ day) | Clean up the repo (§11). Create worktree `reboot/harbour`. Fix the two data bugs on `main`, a small PR. Scaffold `src/harbour/` behind a flag. Write the palette/material contract stub. | 1 Sonnet | Tests green; prod unaffected |
| **P1 Style lock** | Three **independent** Opus art leads each build the *same* block in Blender: headland + lighthouse, one pier group with 6 docked and 2 sailing boats, a slice of town, sea and sky. Each has its own signature (e.g. **A** ink-outline toy diorama, **B** painterly textured miniature, **C** crisp Bad North-like). Golden + night at overview and harbour zoom. A 4th Opus agent builds a **true-scale grey-box of the whole horseshoe**: every pier sized from real hull counts, ~700 placeholder hulls by class from today's payload, and the lane graph. It renders from the real camera at all 3 zooms, ortho vs perspective. **This is where composition and boat legibility get proven, before any expensive phase.** | 4 Opus | **G1:** the operator picks a style **and** approves the grey-box. If the pick is "A's lighting + B's materials", the agent whose candidate supplied most traits builds the merge (max 1 loop). Output: style bible ≤ 2 pages |
| **P1b Perf spike** (parallel with P1) | Real-budget measurement (§6) on RTX + a named integrated GPU. | 1 Opus | Thresholds in §6; baseline renderer decided |
| **G1b** (short) | The winning block, exported as GLB, shown in a minimal TSL viewer through `npm run preview`, with outline/grade/sea re-implemented in the runtime. This proves the Blender look survives the port before P2 builds on it. | P1 winner + 1 Opus shader | Operator: "runtime matches the still" yes/no |
| **P2 Moving vertical slice** | In the runtime: the chosen headland + lighthouse beam, the Ethereum Grand Pier + one small chain pier, the real sea/sky shaders with the time slider, ~80 hulls from **live data**, docked by the berth allocator, sailing circuits and docking per §4.2, with ≥ 2 rig families. The Shoals with real depegs. Poster first paint. Minimal UI: hover tags, side panel, Chart mode. | 2 Opus (scene/shaders, fleet/docking), 1 Sonnet (model + UI), 1 Opus art (kit build-out) | **G2:** operator verdict on the **moving runtime** (5-minute watch, dusk + night + noon) + perf at budget. Max 2 fix loops, then cut scope rather than loop. Only now write `HARBOUR.md` |
| **P3 Full harbour** | Whole horseshoe: 8 chain piers + Far Ports raft, all hulls, Customs House + tide board, Storm mast, Wreck Cove, Slipway, Harbourmaster, Registry, Tide Gauge, Keeper's Log, hill town density. Ledger + search ported. Truth states (stale fog, unknown lamps, awaiting data). | 2–3 Opus art (kit families in parallel), 2 Sonnet (landmark wiring, ledger), 1 Opus integrator | **G3:** operator frames at 3 zooms × 4 hours (max 2 loops). The 5-second reading test with 2–3 people is **advisory**, never blocking |
| **P4 Life & polish** | Weather from DEWS, one-off voyages, declutter pass driven by operator screenshots, sound (opt-in), reduced motion, a11y, WebGL2 tier sign-off, ambient camera mode. | 2 Opus, 1 Sonnet | **G4:** 10-minute passive watch: the operator wants to keep watching; nothing reads as fake activity |
| **P5 Cutover** | Replace the world at the same URL. Keep selection URLs, SEO, OG image (no stale numbers). Delete the old renderer + its tests/docs. Release via `release.yml`. | 1 Sonnet, 1 Opus reviewer | Green `validate:release`, `smoke:live` |
| **Later** | Phone tier (reduced post, fewer instances, landscape), seasons, sound design. | n/a | n/a |

**Workflow size.** Each phase fits under ~10 agents. P1 is the most valuable money spent: do not shortcut it to
one candidate.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Art plateaus at 6/10 "generic low-poly" | P1 forces 3 distinct signatures; the operator picks; the style bible is enforced by a palette/material contract; a density pass is explicit in P3. Use CC0 kit pieces (operator's `assets/pharosville/kit/`) only if they conform to the bible. |
| `WebGPURenderer` immaturity / perf | P1b spike with a kill criterion; pin the version; WebGL2 tier from day one. |
| 625 boats → clutter / specks | True-scale grey-box at G1 (before any expensive phase); hull classes; circuit periods tuned to 25–40 under way; Far Ports raft; canvas label culling; operator-driven declutter. |
| Blender still ≠ runtime look | G1b port check before P2. |
| Motion implies fake transactions | `research/04 §7` forbidden list; legend states "sailing between piers is not a bridge transfer". |
| Operator availability is the bottleneck | Gates are batched (≤ 4 gates total, each a single sitting with side-by-side candidates); art pauses rather than self-approves. |
| TRAA smearing small hulls | Correct instance velocities, or SMAA. |
| Blender assets blow budgets (Tidal: 572k triangles) | Per-family triangle/texture budgets in each builder script; perf measured at every gate. |

## 10. Resolved questions (operator, 2026-10-13)

The answers are recorded as D8–D14 in §2.

- Lighthouse: stone Pharos tower.
- Boats: hull style by peg currency.
- Multi-chain: one boat, circuit.
- Test device: Apple Silicon Mac.
- Sound: opt-in ambient.
- HUD: nautical chart, but minimal; the world carries the meaning.

Still open, to settle at G1: the exact rig family per non-USD currency, and ortho vs perspective (from the
grey-box).

## 11. Repository cleanup

- Done by the operator: the Inlet worktree and branch are deleted.
- The Tidal worktree and branch still exist locally. Keep them as an asset reference, or remove them with
  `git worktree remove .worktrees/tidal && git branch -D feat/tidal-observatory`.
- Kept from the earlier Sol study: `prior-data/06-data-inventory.md` and `prior-data/data/` (copied here).
  The rest of `agents/pharosville-revamp/` is approved for deletion; run `rm -rf agents/pharosville-revamp`.
- To do: `rm -rf scripts/pharosville/blender/__pycache__`.
- Never touched: the operator's uncommitted edits in `shared/`, `src/lib/world-payload-guard*`, `CHANGELOG.md`,
  `src/__fixtures__/`, `assets/pharosville/kit/`, `scripts/pharosville/fetch-kit.mjs`.
