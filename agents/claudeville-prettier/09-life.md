# 09 — Life & Inhabitants

Captures (real GPU, `npm run preview`): `shots/09-life-day.png` (t=10, Customs quay close-up),
`shots/09-life-dusk.png` (t=19.2), `shots/09-life-3am.png` (t=3), `shots/09-hills-dawn.png`
(t=7, Pharos causeway meadow). Baseline `shots/heart-day.png`.

## 1. Current state

- **Townsfolk** (`src/harbour/life/folk.ts`): one InstancedMesh, 150 walkers + 34 standing groups +
  bench sitters, gait/idle/sit posed in the vertex shader. Walkers follow `public/harbour/walkways.json`
  (35 paths, 132 quay-edge spots, 7 squares, 6 benches). Some night walkers carry a bloomed lantern.
  Hard rule in the header: **they never carry anything** (crates would read as mint/burn, research/04 §7).
- **Rhythm is a single scalar**: `townDensity(hour)` in `walkways.ts` (0.06 at 4:30 → 1.0 noon–17h →
  0.1 at midnight) × quality share × (1 − 0.35·winter). Every actor has a random `rank`; the *same* kinds
  of people are out at 3 am as at noon, just fewer. No roles, no places-by-hour.
- **Gulls** (`gulls.ts`): 14 instanced birds wheel over Pharos / mouth / heart / Customs and perch on
  chimneys, pier-head lamps and Wreck Cove hulks. The only animal in the world.
- **Ambient particles**: chimney smoke (`smoke.ts`, hour × hearth × DEWS wind), seasonal leaves/petals
  (`drift.ts`, 1,800 VS-only quads), land flags + bunting (`flags.ts`). All declared decorative, one draw each.
- **Workers** (`civic/workers.ts`, wired in `civic-system.ts`): 12 mint hands ∝ mint volume
  (`mint.ts: busy = n·(0.15+0.85·level)`) + 30 shipwrights at the Slipway. These ARE data-bound — the
  "dock workers in sync with mint/burn" idea already exists, in the Mint and the Yard.
- **Audio** already has birdsong (thinned when playing), summer cicadas (`cicadaLevel`), crickets — but
  nothing visible corresponds to them.
- **Strong**: one-draw budget discipline (≤ 6 draws for the whole layer), kit-material chaining so figures
  are lit like the island, `?life=0`, reduced motion stills everything, lanterns at night are lovely.
- **Weak (from the frames)**: at heart zoom (d=650) folk are sub-pixel specks; close up the Customs
  market stalls stand **empty with no vendor**; the 3 am frame is an empty set (only the mint arcade
  works) — no keeper, no watchman, nobody; the dawn meadow by the Pharos causeway is a large green
  void with zero life; the water carries only coin-ships and gulls — the sea itself is lifeless.
- **Truth constraint discovered**: every hull is a coin. Fishing boats, ferries or lighters would lie
  (a hull = a stablecoin). Anything on the water must be unmistakably *animal*, not vessel.

## 2. Ideas

### L1 Daily rhythms: roles by the hour
**What**: Replace the single `rank < density` gate with a small role table on the existing actor pool:
each actor gets a `role` (townsperson, vendor, fisherfolk-on-quay, promenader, watchman) and a per-role
hour curve + home spot set. Dawn (5–7): a handful at the quay-edge spots with rod poses (stand pose + one
arm raised, a thin line — a 2-tri ribbon in the same instanced mesh as a P_ROD part). 8–13: vendors
stand behind the two market stalls on the Customs quay (two new `spots` kind `stall` in walkways.json,
exported by `tools/export_walkways.py`). 17:30–20: promenaders walk the breakwater mole path only (path
weight bias), in twos. 23–4: a single watchman with a lantern on the quay loop. Same total cast.
**Why magical**: a ten-minute watch at a given hour feels like *that* hour; returning at dawn reveals a
different town. **Data**: decorative (time of day). **Where**: `folk.ts` (role attr in `aAnim`, rod part),
`walkways.ts` (`roleDensity(role, hour)`), `walkways.json` + exporter (stall spots, mole path tag).
**Cost**: M; +0 draws, +~60 tris/figure for rod, CPU unchanged (still rank gating). **Risk**: low; keep
total count; reduced motion = rods held still.

### L2 The keeper's night
**What**: From 0–4 h the town is empty except one figure: the Pharos keeper, a distinct silhouette
(long cloak, lantern), walking the causeway from the keeper's cottage to the tower foot and back, pausing
at the top of the stair. A single instance in the folk mesh with a fixed path (causeway is in
walkways or add one). His lantern uses the lights service like other lantern carriers.
**Why magical**: the single moving light at 3 am is the most poetic beat available; it says "someone
keeps the light" — and the beam really is PSI. **Data**: decorative; the keeper does not modulate with
PSI (say so in `facts.ts` `keepers-cottage`: "the keeper's home", decorative already). **Where**:
`folk.ts` (special actor), `walkways.json` causeway path, `lights` lantern sprite. **Cost**: S; 0 draws.
**Risk**: must not read as an agent/roleplay character — no name, no panel entry, no interaction.

### L3 Goats and a shepherd on the meadows
**What**: 2–3 small flocks (5–8 goats each) grazing on the open grass (the empty meadow in
`09-hills-dawn.png`, hamlet hillsides). New Blender kit `goat` (~120 tris, 4 leg parts) via a script in
`scripts/harbour/blender/` exporting part ids; one InstancedMesh with a VAT-free vertex pose (graze dip,
slow amble with leg swing, ear flick). CPU: each goat does a random walk inside a polygon sampled
from the ground height field (`ground.open`). Bells ring only if sound on. Fold in later:
2 donkeys with a cart on the hamlet road (L9).
**Why magical**: pastoral Mediterranean calm; fills the biggest dead space with almost no motion.
**Data**: decorative. **Where**: new `life/herds.ts`, `life-system.ts` (1 draw, budget 6→7), Blender kit.
**Cost**: M; 1 draw, ~3k tris, CPU < 0.02 ms. **Risk**: low; reduced motion = grazing still.

### L4 Dolphins at the harbour mouth
**What**: a pod of 3 dolphins that surfaces every ~90–150 s between the Pharos and the breakwater head,
two or three arching rolls (not leaps) in sequence, then gone. Pure vertex animation: one instanced
mesh, the arc is a parametric path in the VS (phase uniform), body bend from a sine down the spine; a
foam-ring decal reuse from the ocean wake system at entry/exit. Very occasionally (1 in 5) one clears the
water. **Why magical**: the "did you see that?" moment — rewards the patient watcher, which is exactly
the ten-minute-watch product. **Data**: decorative; must NOT fire on data events (would read as
signal). Rule it out in rough weather (DEWS > storm band) — calm seas only, which is honest nature.
**Where**: new `life/dolphins.ts`, ocean wake ring hook. **Cost**: S–M; 1 draw, ~1.2k tris, 0 CPU.
**Risk**: spectacle drift — keep rare, small, grey, no splash particles beyond the ring. Reduced motion:
hidden.

### L5 Fish shoals in the shallows
**What**: dark flickering shoals (40–80 tiny quads each) in the shallow turquoise near the Customs
quay and Wreck Cove, drawn under the water surface (depth-tested before the ocean, tinted by the
ocean's absorption). They drift as a boid-ish noise field in the VS and scatter when a hull's wake
passes (read hull positions from the sim service as a uniform array of 8 nearest). **Why magical**: the
water becomes alive and clear; a ship scattering fish is a lovely cause-and-effect. **Data**: decorative.
**Where**: new `life/shoals-fish.ts` (name clash: the Shoals are off-peg coins — call it `fish.ts` and
never place fish in The Shoals area). **Cost**: M; 1 draw, ~500 quads, small ALU. **Risk**: must not
blend with The Shoals (D11 off-peg); keep fish away from that region.

### L6 Gulls that follow casting-off ships and land on masts
**What**: when a hull enters `casting-off` / `sailing` near the mouth, 2–3 gulls peel off a circle and
trail its stern for 20–40 s, then return. Add mast-truck perches on moored hulls (fleet exposes a
masthead point per berthed boat) so gulls stand on rigging. **Why magical**: the harbour's existing
motion (ships leaving) gets companions; ties the two systems. **Data**: decorative; choose hulls
uniformly at random (never by size or flow) so it does not imply importance; documented in gulls header.
**Where**: `gulls.ts` (follow mode, target from fleet service), `fleet-system.ts` expose masthead
perches. **Cost**: S; 0 draws. **Risk**: gulls on titans' big house flags would cover the emblem —
exclude flag-carrying mastheads.

### L7 Cats on walls, swallows at dusk, fireflies in summer
**What**: three tiny "noticer" details. (a) 4–6 cats (box-kit, ~60 tris) sitting on the quay coping
and Customs steps by day, a tail flick, curled asleep at night; reuse `ground.seatHeight` for wall tops.
(b) Swallows: 20 fast dark birds swooping low over the squares 18–20:30 h in spring/summer (reuse gull
mesh with a darker tint + forked tail part, higher flap rate). (c) Fireflies: 60 point sprites in the
gardens/cypress groves 21–24 h, June–August only, bloomed slightly, honouring the cicada audio window.
**Why magical**: small rewards at specific hours and seasons — the calendar becomes felt.
**Data**: decorative (season/hour). **Where**: cats into the folk mesh as an extra figure geometry
would cost a second geometry — put them in `herds.ts` (L3) draw; swallows in `gulls.ts` (one draw); fireflies
in `drift.ts` as a third flake type (`uShare.z`). **Cost**: S each, 0 extra draws if merged as stated.
**Risk**: fireflies must not look like lamps/coins; keep them faint and few.

### L8 Lamplighters at dusk (needs per-lamp ignition)
**What**: at dusk two lamplighters with poles walk the quay lamp line; each lamp ignites as they pass
(lamp emission currently is one global `uLamp` from `engine/time-of-day.ts`). Needs a per-lamp
ignite attribute (`aLampRank`) compared to a sweeping `uLampSweep` instead of a global step.
**Why magical**: the town lighting up lamp by lamp, carried by a person, is the iconic dusk beat.
**Data**: decorative. **Where**: `folk.ts` (2 role actors, pole part), `world/materials.ts` lamp emissive,
lights service lamp sprites. **Cost**: M (touches lighting). **Risk**: reduced motion → global step as now.

### L9 Donkey cart on the hamlet road
**What**: one donkey + two-wheel cart plying the inland road between two hamlets, slow, empty-ish
(hay, not crates/amphorae — cargo reads as mint/burn). Pauses at each hamlet. **Data**: decorative —
must not travel between *chain* hamlets in a way that suggests bridging/flows; pick a road that is not
between hamlets, e.g. Customs ↔ the hill shrine. **Where**: `herds.ts`. **Cost**: S–M. **Risk**: the
truth risk above is real; fall back to "donkey grazing tethered" if no neutral road.

### L10 Cormorants on the rocks
**What**: 6–10 dark birds standing on the breakwater armour rocks and Pharos foot, a few with wings
spread to dry (static pose, slow shimmer), one occasionally diving. Reuse gull geometry dark-tinted with a
"spread" pose bit. **Why magical**: silhouette detail at the most-looked-at landmark. **Data**: decorative.
**Where**: `gulls.ts` (perch-only species flag), perches from layout rocks. **Cost**: S, 0 draws.
**Risk**: none notable.

### L11 Crowd at the quay when a titan comes alongside
**What**: when one of the four titans transitions to `alongside`, 6–10 extra standers fade in on the
nearest quay-edge spots facing the hull, then disperse over 2 minutes. **Data**: borderline — titan
arrival is a sim choreography event (decorative motion of a data-bound hull). A crowd would read as
"this coin matters more". Big hulls already say that (supply class), so the crowd adds no new claim, but
must not scale with anything. **Where**: `folk.ts` (spare standers pool), fleet service events.
**Cost**: S. **Risk**: truth/emphasis; I rank it low — calm prefers the quay unchanged.

### L12 Anniversary offerings at the round temple (data-bound)
**What**: on a coin's launch-anniversary day (`launchDate` in `shared/types/core.ts`), small offerings
(garland + a lit oil lamp in the coin's brand colour) appear at the round temple by the causeway; 1–3
figures stand before it at dusk. **Data**: data-bound: field `launchDate`; DOM equivalent: hover on the
temple → "Today: USDC launched 8 years ago" and a line in that coin's panel/ledger; nothing on days
without anniversaries. **Where**: `civic` or `life` + `ui/facts.ts` (temple fact), panel line.
**Cost**: M (needs a fact entry, test for date math, UTC). **Risk**: lore/roleplay drift — keep it a
calendar marker, no text in-world, no "celebration" effects.

## 3. Top picks (impact ÷ cost)

1. **L1 Daily rhythms: roles by the hour** — biggest change to how a long watch feels, zero draws,
   reuses the existing actor pool; fills the empty market stalls.
2. **L2 The keeper's night** — one actor, the most poetic frame of the day (3 am currently empty).
3. **L4 Dolphins at the harbour mouth** — the rare "did you see that?" reward, GPU-only, 1 draw.
4. **L3 Goats on the meadows** — fills the largest dead space (dawn meadow) with near-still life.
5. **L6 Gulls follow casting-off ships / perch on masts** — ties the only animal to the fleet's motion, ~free.

(Close 6th: L7 cats/swallows/fireflies as merged micro-details.)

## 4. Cross-vertical hooks

- **Lighting/night**: L8 per-lamp ignition sweep (`uLamp` → per-lamp rank); L2/L1 lantern sprites
  through the lights service; fireflies (L7c) share bloom thresholds.
- **Ocean/water**: L4 dolphin foam rings and L5 underwater fish need the ocean's absorption tint and a
  wake/ring decal API; keep fish out of The Shoals region (off-peg signal).
- **Weather (DEWS)**: dolphins only in calm bands; goats huddle and townsfolk thin in storm (honest:
  weather is the stress signal — reduce, never add, life in storms).
- **Audio (opt-in)**: goat bells, swallows' twitter at dusk, keeper's footsteps on stone — existing
  cicadas/crickets get visible partners (L7).
- **Fleet**: masthead perch points + casting-off events for L6/L11.
- **Assets (D4)**: goat, donkey, cat, dolphin kits as Blender scripts under `scripts/harbour/blender/`;
  `tools/export_walkways.py` needs `stall` spots, a mole-promenade tag and a causeway path.
- **Perf/budget**: life layer budget moves from 6 to ≤ 8 draws (herds, dolphins; fish optional);
  update the header comment in `life-system.ts` and `scripts/bundle-budgets.mjs` if kits add bytes.
