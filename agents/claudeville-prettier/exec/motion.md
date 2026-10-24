# Lane MOTION — exec notes

## F-wind: the shared gust field (`src/harbour/weather/gust.ts`)

One decorative field of travelling cat's-paws, shared by everything that feels the wind.

- `gust(x, z, t, dirX, dirZ): number` — pure CPU function, 0 in the lulls … 1 in a paw. Patches ~100–200 m
  across (≈15–25 % of the sea above 0.5), drifting DOWNWIND at `GUST_SPEED` = 6 m/s. `(dirX, dirZ)` = unit
  downwind on the ground plane. ~20 flops: fine per hull per frame.
- `GUST_GLSL` — the same formula as `float hbGust(vec2 xz, float t, vec2 dir)`; include it in a shader string.
- `ensureGustService(ctx): GustService` (service key `"gust"`):
  - `uniform: IUniform<Vector4>` = `(dir x, dir z, amp, time)` — bind it as `uGust` and call
    `hbGust(xz, uGust.w, uGust.xy)`.
  - `tick(ctx, frame)` — advance; idempotent within a frame, so every consumer calls it first in `update()`.
  - `at(x, z)` — the field now, with the service's direction and time (unscaled 0..1).
  - `dirX`, `dirZ`, `amp` (= sim DEWS wind strength 0..1), `time`.
- Direction = the weather's render wind `uWindVec` (normalised; it carries the decorative veer, 07-M5), else the
  sim's layout wind. Time = a MotionClock: under reduced motion the field eases to a stop and holds still.
- Truth: the field's SHAPE is decorative. Scale any EFFECT by DEWS wind strength (`amp`) and nothing else.
- Consumers now: ocean (`ocean-material.ts`: the paws roughen the water where the field is high), fleet (heel,
  surge, sail fill). Intended next: SKY (cloud drift speed-up of near banks), ISLAND (tree/vine sway), AUDIO
  (gust layer envelope at the listener: `svc.at(camX, camZ) * svc.amp`).

## F-fleet3: the third `uFleetData` texel (`fleet-material.ts` `FLEET_DATA_TEXELS = 3`)

Per batch instance, texels `inst*3 + k`:

| texel | x | y | z | w |
|---|---|---|---|---|
| 0 | furl 0..1 | signed boom swing | highlight | pennant / far / struck (unchanged) |
| 1 | brand r | g | b | emblem slot / hulk / wreck codes (unchanged) |
| **2 (new)** | **sail fill** 0..1 (belly depth) | **shake** 0..1 (luff shiver / tack flog / adrift; 0 under reduced motion) | **lantern lit 0\|1 — RESERVED for 06-F6** (written 0, unread) | **oars out** 0..1 (galleys; 0 = raked) |

Writer: `FleetSystem.writeMotion(inst, fill, shake, lit, row)`. Vertex GLSL in `fleet/fleet-motion-glsl.ts`
(`hbSailBreath`, `hbOarStroke`, `hbOarFurl`), used by BOTH the colour pass and the shadow depth pass.
Bake contract (hull-kit): sails carry their cloth size (m) as `aPaint.x = -size` (0 on LOD sails = no
breathing); galley oars are node 5 (`NODE_OARS`) with `aPivot` = each oar's thole pin; nodes 1–4 unchanged
and the tack mirror / boom swing now skip node 5. `HullVariant.oars` marks galleys.

## Sim API additions (`sim/sim.ts`)

- `sim.onEvent(cb) → unsubscribe`; `SimEvent = { id, kind: "launch" | "tow" | "to-shoals" | "rejoin" | "docking", x, z }`.
  Voyage kinds fire when a real snapshot diff starts them (never on first load; `rejoin` only for a recovery
  from the Shoals / Wreck state, not for re-plan resyncs); `docking` on every arrival at a berth or mooring.
  Synchronous from `setModel` / `poseAt`. No hysteresis in the sim (D-4: staging waits for the 2nd poll).
- `sim.tugs` (`MAX_TUGS` = 4): x, z, heading, `of` (towed hull index, -1 = rowing home). Decorative.
- `pose.drift` (lane offset + give-way shove, x/z), `pose.pitch` (launch rebound), `pose.position[y] = 1`
  while on the launching ways. `sim.wind.veer` (decorative veer now, rad); `windVeer(t)`.
- Dev: `?simevent=tow|shoals|launch[:coinId]` stages a snapshot diff ~6 s after data lands.

## Items and decisions

- 07-M1 polar: vrel reshaped and rescaled so the leg's effort Q is unchanged (tested to 2e-5): leg times,
  plan rep legs and D10 dock share are untouched.
- 07-M2: galleys row with canvas 70 % brailed inside the harbour sea zones (render side). **Offshore tacking
  skipped**: the live plan already runs ~31.7 % under way (198 of 624 hulls) with circuits at ~79/min against
  `UNDER_WAY_SOFT_CAP` 84; longer upwind legs would push it over.
- 07-M5 veer: ±~13°, periods 1350 s / 540 s (divide the 6 h cycle), per-hull lag = the hashed `r.lag`.
  Render wind hunk in `weather-system.ts` only; `life-system.ts` still reads the unveered wind (smoke/gulls):
  one-line follow-up for its owner.
- 07-M6 tug: fisher-skiff kit in plain livery, sagging towline from the lines batcher, hover
  "Harbour tug · tows the dead to Wreck Cove · carries no data" (`HARBOUR_TUG` landmark id).

## Changelog bullets (for the orchestrator)

- One wind: cat's-paws now run across the water and lean the ships they pass, in sequence.
- Ships work the wind: slower close to it, quickest across it, heeling most on a beam reach; sails luff head to wind.
- Sails breathe: canvas bellies with the wind and gusts, and shivers through a tack.
- Galleys row: biremes and triremes pull at the oars, canvas brailed until they clear the harbour mouth.
- Hulls steer round each other instead of sliding sideways.
- The anchorage wheels slowly as one as the wind veers.
- A dead coin's last voyage: canvas struck, towed to Wreck Cove by a harbour tug that then rows home.
- A depeg sets a ship adrift to the Shoals, sail flogging; on recovery she sheets home and comes upright.
- New coins are launched stern-first down the ways with a splash.

## Legend lines

- "Harbour tug — tows the dead to Wreck Cove; decorative, carries no data."
- "Wind, gusts, heel and sails — decorative; wind strength follows the storm signal (DEWS)."

## Cost (estimate; not measured on a quiet machine)

- GPU: +1 RGBA32F texel fetch per fleet vertex (colour + depth pass); ~25 VS ALU on sail vertices (sails are
  25-vertex grids), ~30 on galley oar vertices; 0 elsewhere. Ocean: +~20 FS ALU (one hbGust). 0 new draws,
  0 new tris; +4 hidden tug instances in the existing BatchedMesh; +1 towline segment while a tow is live.
- CPU: one gust sample + a few dozen flops per hull per frame; polar adds ~50 O(n) passes per path build
  (bisection), cached with the path.
