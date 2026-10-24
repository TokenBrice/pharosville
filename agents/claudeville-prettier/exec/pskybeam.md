# Polish lane SKYBEAM — changelog bullets, notes

## Changelog bullets (user-facing)

- Quieter night skies: the cloud banks at night are dimmer and take their silver edge only from the side the
  moon is on, so the Pharos stays the brightest thing in the sky. In calm autumn weather the long low banks
  settle into shorter ones (how much cloud there is still follows the storm weather alone).
- The lighthouse beam is smoother: its sea-mist breakup no longer repeats in regular blotches down the far
  half, and it thins where it passes in front of a lit cloud instead of painting over it. Reach, colour and
  rhythm are unchanged.
- The lamplighting wave reads at dusk: each lamp now switches on over a moment, at its turn, so along the
  moles you can see the lit lamps near the Pharos and the dark ones further out as the wave walks outward
  (and back in at dawn). Reduced motion still lights them all together.
- The chart lettering keeps "THE" clearly above ROADS and SHOALS, even on a rough sea.
- From the overview at night the quay lamps are small points instead of strings of pearls.
- A hovered ship's lantern is turned up and down (about a fifth of a second) instead of switching.

## Legend lines

None new (all decorative; no data cue added or re-mapped).

## Dev URL params

- `?skyT0=<seconds>` pins the cloud-bank composition (it otherwise drifts with the wall clock), for A/B captures.

## Interfaces

- `lights` service: `setIntensity?(id, k 0..1)` scales one light's pool, sprite, pillar and point light (a
  version bump per change: pools re-render only while a fade runs).
- `lights/lamp-wave.ts`: `LAMP_WAVE_START` (0.3), `LAMP_WAVE_SPREAD` (0.4), `LAMP_RAMP` (0.04) in uWindowGlow
  units; `hbLampGlow` / `lampGlow` keep their signatures (spread 0 = the global step, unchanged).
