# 06 — Fleet craft (ship models, rigs, sails, on-ship animation)

Captures (real GPU, `npm run preview`): `shots/06-berth-close.png` (t=11, cam −70,0,−3,110: moorings),
`shots/06-roads-mid.png` (t=17.5, cam −127,0,−272,300: the Roads), `shots/06-mole-dusk.png` (t=20.5, cam −20,0,105,95:
berthed rows on the mole). Plus the shared `heart-day.png` / `day.png`.

## 1. Current state

- **One BatchedMesh draw for every hull** (`hull-kit.ts` bakes all GLBs + LODs into one geometry; `fleet-material.ts`
  poses it in the vertex shader from `uFleetData`, 2 RGBA32F texels/instance, plus 5 static livery texels). Every idea
  below should stay inside that draw or add at most one instanced draw.
- **Strong already:** furl morph, boom/yard swing with port-tack mirroring, rate-limited tacks (`variants.ts approach`),
  heel from the sim × storm, swell bob/pitch/roll sampled from the sea (`fleet-system.ts` ~700–742), ensign flutter,
  cloth seams/tabling/dye mottle, backlit sail glow, far spar recede + hash-picked "struck" rigs (`STRUCK`), LOD swap by
  on-screen px with hysteresis per quality tier, wakes/contact rings, data-true stern lamps (`sternLampLit`).
- **Kit detail exists but is static:** painted ophthalmoi, steering oars, ram, aphlaston, swan necks, horse heads
  (`hb_ancient.py eyes/steering_oars/oar_banks`). Galley **oars** exist but only as a furl-morph pose: "out mid-stroke"
  frozen under way, raked at rest. They never row.
- **Sails are rigid cambered plates.** Apart from a ±0.025 rad boom sway, the cloth never breathes, luffs or flogs; at
  close range (`06-berth-close`) a set sail reads as a signboard with a logo, not cloth.
- **Confetti at distance (the main weakness).** In `heart-day.png` the Roads and outer anchorage read as floating
  coloured squares: the LOD hull is a dark, low-contrast sliver on a dark sea while the dyed sail with its *white
  emblem disc* is the brightest, biggest thing per ship. Spars already recede (`hbFleetPaint` mode 5) but cloth and
  the disc do not. The deck-margin trick (`edge` widens with far) helps docked rows, not ships under sail.
- **Empty ships.** Decks are bare planks; no one aboard, no cargo, no lantern hardware. At berth (`06-mole-dusk`) the
  rows are handsome but lifeless; the only night life is the riding-light Points draw.
- **Hull surfaces are clean paint.** No wet band at the waterline, no salt/tar weathering, so hulls look like they sit
  *on* the water rather than *in* it.
- **Titans** (`titans.ts`, `tt_titans.py`) are the best models (temple, stone-thrower, garden, brazier tower) but share
  every animation with a 5 m skiff: no extra "hero" motion, and their gilt reads as flat yellow paint.

## 2. Ideas

### F1 Far-ship silhouette pass ("no more confetti")
**What:** pass the existing `far` (0..1) to the fragment for *cloth* too (already in `vPaintC.z` for opaque). With far:
(a) the emblem's white disc and ring fade to the dyed cloth (logo melts into a darker brand field, like house flags
already do), (b) sail cloth value drops ~15–25 % and saturation ~20 %, (c) the LOD hull's topside paint lifts toward a
pale sheer line + bright 1-px wet "foam lip" along the waterline (code ≥10.5 LOD topsides: lighten t>0.8 band, add a
pale band at t<0.08), (d) optional vertical exaggeration of LOD hull freeboard ×1.0→1.35 with far (vertex, opaque
LOD only — a diorama cheat like spar recede). Net: ships read hull-first, sail-second.
**Why magical:** the anchorage becomes a fleet of little ships riding at anchor instead of scattered stickers; the eye
rests. **Data:** decorative; brand colour still carried (sail dye + burgee), hull family silhouette now readable — a
gain for "hull family = peg currency". **Where:** `fleet-material.ts` (VERT_PARS pass far into a varying; FRAG
`hbFleetColor` kind 1 branch + `mode > 3.5` LOD branch). **Cost:** S; 0 draws, 0 tris, ~10 ALU on far fragments.
**Risk:** low; must keep the brand field legible at overview (tune against `day.png`); verify picking unaffected.

### F2 Breathing sails: billow, luff and flog in the vertex shader
**What:** displace sail (`aMeta.x==1`) vertices along the set-shape camber axis (−z, mirrored on port tack) by a
belly term `sin(πu)·sin(πv)` × wind (`uWind`) × (1−furl), modulated by a slow gust noise per instance. When the boat is
head-to-wind or mid-tack (|swing| small while under way, or d(swing)/dt high), add a travelling luff ripple from the
luff (u=0) toward the leech, amplitude falling with u, higher frequency = "flogging" for the 1–3 s of a tack. Square
sails (node 1) billow forward, foot corners fixed (multiply by v-from-yard). Depth pass gets the same term so shadows
breathe. **Why magical:** the most "alive" single change at heart zoom: you see the wind *in* the cloth, and a tack
becomes a little event of shaking canvas then filling with a soft pop. **Data:** decorative (wind is decorative
except storm, which already heels). **Where:** `fleet-material.ts` `hbFleetPose` + `hbFleetPoseP`; needs a tack-rate
value → add a 3rd `uFleetData` texel (`fleet-system.ts writeData`, texel stride 2→3), or pack into texel 0.y's
fractional part. Emblem must ride the displacement (it does: it's a UV print). **Cost:** S–M; 0 draws, ~20 VS ALU on
sail verts only (sails are a small share of 1.26 M tris), normals recomputed analytically from the belly derivative.
**Risk:** reduced motion: drive by `uFleetTime` (already frozen) — keep a static belly, stop ripples. Keep amplitudes
small (calm); flog lasts only during tacks.

### F3 Galleys row: oar banks sweep in rhythm
**What:** under way (furl≈0) the `oars` node rotates per oar about its thole pin: a stroke cycle (catch → drive →
feather → recovery) with the blade dipping on the drive and lifting on the recovery; all banks in phase per hull, a
slow ~0.5 Hz stroke, phase offset per hull hash. Bake a per-oar pivot (inboard thole point, nearest the hull side) into
`aPivot` for `oars` vertices in `hull-kit.ts` (connected-component scan, same as sail-plan does). At rest the existing
furl morph rakes them up. Faint ring stamps at each blade catch (wake service) are an optional extra.
**Why magical:** gold's biremes/triremes become the harbour's heartbeat — the only rhythmic, human motion on the water;
it makes "gold = galley" unforgettable. **Data:** decorative motion on a data-bound silhouette (family). Stroke rate
could later scale with speed (sim velocity), still decorative. **Where:** `hull-kit.ts` (pivot bake), `fleet-material.ts`
pose (node id 5 = oars), `scripts/harbour/blender/hulls/hb_ancient.py oar()` only if the loom needs a cleaner pivot.
**Cost:** S–M; 0 draws; only galley verts. LOD: freeze at far (the LOD oar strip just holds). **Risk:** reduced motion
→ freeze mid-stroke (current look). Keep stroke slow; no "racing".

### F4 Wet waterline, salt and weathering
**What:** in `hbFleetPaint` topsides (mode 2/4): a darker, slightly glossier wet band for t<0.1 (lower `hbRough`), a
thin green-brown weed/tar line at the boot-top, faint vertical salt streaks below the sheer (hash by `x/half-loa`),
and a sun-bleached sheer stripe. Docked hulls get a slowly drying band (wetness height follows bob, so the band rises
and falls with the swell — computed in world y against the sea height already sampled per hull). **Why magical:** ships
sit *in* the water; close up they look used and loved, not toy-new. **Data:** decorative. **Where:** `fleet-material.ts`
FRAG (`hbFleetPaint`, `float hbRough` hook). **Cost:** S; ~12 FS ALU on hull fragments. **Risk:** keep weathering
subtle so livery colours stay readable; titans keep their own paint (gilt exempt).

### F5 Crew at the berth and at the helm (one instanced draw)
**What:** a tiny Blender-authored crew kit (`scripts/harbour/blender/hulls/crew.py`: 3–4 poses, ~40 tris each, peg-doll
style in tunic colours): a helmsman at the steering oar on every full-LOD hull under way; at berth 1–3 figures on deck
or quay that *furl the sail as the hull comes alongside* (pose blend tied to the furl value) and then sit/idle. One
`InstancedMesh`, only hulls with `g === geomFull` and px above a threshold (≈150 instances on high tier ≈ 6k tris).
Anchored by bake-time deck anchor points (`deck` node bounds) and the `_heel` matrix. **Why magical:** the harbour
becomes inhabited without becoming a game; furling becomes something people *do*. **Data:** decorative (must not be
read as volume/activity; no counts). **Where:** new `src/harbour/fleet/crew.ts`, `fleet-system.ts` (per-hull deck
anchors in `HullVariant`), Blender kit + manifest entry. **Cost:** M; +1 draw (+1 shadow draw on high), ~6k tris,
+≈15 KB GLB. **Risk:** "decorative lore/roleplay" anti-reference — keep figures faceless, unnamed, few; reduced motion
→ static poses.

### F6 Stern lantern hardware that tells the same truth as the lamp
**What:** add a small bronze lantern on a stern bracket to each kit hull (`hb_ancient.py`, ~30 tris, glass as kind 4
like the wreck lanterns) and light its glass from a per-instance "lit" flag = exactly `sternLampLit` (already
computed). The Points glow in `riding-lights.ts` moves to that lantern's anchor. Unlit hulls show a dark lantern —
so "lamp lit ⇔ a peg reading exists" now has a physical object. **Why magical:** at dusk the rows on the mole get warm
little lanterns with a glass body, not floating dots. **Data:** data-bound but *no new signal* — reuses the existing
lamp mapping; DOM equivalent already exists (peg reading in the panel/ledger). **Where:** `hb_ancient.py`, `tt_titans.py`,
`hull-kit.ts` (lantern anchor), `fleet-material.ts` (kind 4 path already exists, needs instance lit bit → texel 0.x
is furl for hulls, so pack lit into the 3rd texel from F2), `riding-lights.ts`. **Cost:** M (kit re-export);
~2–3k tris total, 0 draws. **Risk:** must not light lanterns for nullPeg coins; keep the minority rule at moorings.

### F7 Titan flourishes: gilt that glints, stern gallery lights, long streamers
**What:** (a) gilt parts (swan neck, aphlaston, temple, figurehead) use the metal pattern (id 12) with a narrow sun
specular so they flash when the sun crosses them — a sparkle once every few seconds as the hull rolls; (b) at dusk the
temple / deckhouse windows on USDT/USDC glow warm (× `uLamp`, emissive vertex region); (c) a long tapering masthead
streamer (vexillum) on each titan, flying with `uWind` in the house-flags draw. **Why magical:** the four majors feel
like ceremonial ships — royal, not bigger confetti. **Data:** decorative (titan identity is already declared
decorative in `titans.ts`). **Where:** `tt_titans.py` (pattern/emissive tags), `fleet-material.ts` opaque branch,
`house-flags.ts` (new style FLAG_STREAMER). **Cost:** S–M; 0–4 instances, negligible. **Risk:** bloom: keep the glint
below the PostChain bloom threshold except at golden hour; no strobing.

### F8 Bow wave & stern-quarter spray hooks
**What:** expose per-hull `wake_origin` (already in the manifest) + bow cleat world positions and speed as a small
service (`fleet-wake-hooks`) so the ocean vertical can draw a bow-wave crest and, in storm (DEWS-driven `storm`, which
already makes hulls labour), occasional white spray bursts when pitch crosses a threshold. **Why magical:** ships cut
the water; in a stress storm they visibly plunge. **Data:** spray strength follows the existing storm value (DEWS
band) — no new mapping. **Where:** `fleet-system.ts` (publish hooks; values already computed at ~700–742), ocean
`wake.ts`. **Cost:** S on the fleet side. **Risk:** calm — spray only at ALERT+.

### F9 Sail settles at rest: brailing and sag
**What:** the furl morph is linear; replace with an eased, two-stage curve (brails gather the leech first, then the
foot rises in festoons) and add a tiny wind-sway on the brailed bundle / boom cover (kind 2) so a furled rig is not
dead. **Why magical:** arriving at berth becomes a little ceremony of canvas coming in. **Where:** `fleet-material.ts`
(furl remap per sail role using `aSailUV.x` for staggered gather), `fleet-system.ts` furl easing. **Cost:** S.
**Risk:** low.

### F10 Riding the wind: weather-vane at anchor, weather-cock pennants
**What:** anchored/moored hulls with swingRadius already turn; make the swing lag the wind with a slow pendulum
(sheer) so the anchorage "breathes" together when wind shifts, all hulls swinging in a ragged sequence. **Why
magical:** a whole roadstead swinging to a new wind is one of the most beautiful things in a real harbour. **Where:**
`fleet-system.ts` moored heading (or sim if heading is owned there). **Cost:** S, CPU only. **Risk:** must not
fight mooring-lines geometry; check with `mooring-lines.ts`.

### F11 Cargo on deck (optional, data-bound)
**What:** amphora stacks / bales on the decks of corbitae and grain ships, count 0–3 by **24 h net mint** of that coin
(`/api/mint-burn-flows`), emptied when net burning. **Data:** data-bound → DOM equivalent required: panel line "24 h
net issuance: +$X (cargo aboard)". **Where:** crew/cargo instanced draw (shares F5), `src/harbour/model/`.
**Cost:** M. **Risk:** truth — another ambient signal to learn; only do it if the orchestrator wants a new data cue.
Ranked low on purpose.

### F12 Sun-through-sail and seam shadows at golden hour
**What:** the backlit glow exists; add the seam lines and emblem as *darker* silhouettes when backlit (transmission
masks), and a soft warm rim on the leech. **Where:** `fleet-material.ts` opaque_fragment hook (sail branch).
**Cost:** S, ~6 ALU on sails. **Risk:** none.

## 3. Top picks

1. **F1 Far-ship silhouette pass** — fixes the biggest visual problem (confetti) with a shader-only change in one file.
2. **F2 Breathing sails** — the largest "alive" gain at heart zoom for ~20 VS ALU and no draws.
3. **F3 Galleys row** — a unique, calm rhythm that makes the gold family unforgettable; geometry already exists.
4. **F4 Wet waterline & weathering** — cheap fragment detail that seats every hull into the sea.
5. **F6 Stern lantern hardware** — makes an existing data truth (lamp ⇔ peg reading) physical and lovely at dusk.

(F5 crew and F7 titan flourishes are the next tier: high charm, more asset work.)

## 4. Cross-vertical hooks

- **Ocean / water:** F8 bow wave + storm spray (needs `wake.ts`); F1's waterline foam lip pairs with an ocean-side hull
  reflection/contact shadow for far ships; F3 blade-catch rings via the wake service.
- **Weather / sky:** F2 and F10 consume `uWind` and wind direction; gusts should be shared with trees/flags so the
  whole world moves together. Storm (DEWS) already drives heel; keep spray consistent with it.
- **Lighting / night:** F6 lanterns, F7 titan windows × `uLamp`; bloom threshold coordination with post.
- **Audio:** F3 oar stroke (soft thump + drip), F2 sail flog on tacks, F5 rope/haul — all opt-in sound.
- **Data / UI:** F6 reuses peg-reading DOM; F11 would need a panel line and ledger column.
- **Perf / quality tiers:** F1, F2, F3 gated by existing tier `far`/LOD; F5 limited to full-LOD hulls on high/medium.
  Adding a 3rd `uFleetData` texel (F2/F6) is one shared change — do it once.
