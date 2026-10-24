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
