# Polish lane WATER — exec notes (REVIEW #1, #2, #11, #12, #6)

## Changelog bullets (user-facing)

- Shadows on the sea are soft and cool: the Pharos lays a gentle blue band across the harbour in low sun, and sails
  and masts no longer stamp dark slabs on the water (their shadow only takes the glitter).
- The daylight heliograph on the water is pure glitter: the mirror's sun coin makes the sea sparkle more where it
  passes, never a pale haze.
- The inner basin is luminous turquoise again by day, lightest along the quays, with the dredged channel still deeper.
- Clouds pass across the sea's mirror as whole soft shapes instead of a broken camouflage pattern under a weather front.
- Dawn is warm again: a rose-peach first light under a clear blue sky before sunrise, then a peach sun with cool shade.

## Legend lines

None new. The heliograph and sun shadows stay decorative (the Ledger "Decorative" line already lists the heliograph).

## Notes for integration

- `world/sun-shadow.ts`: new `uSeaShadowT` uniform (log2 mask texels/metre, set in `SeaShadowMask.resolve`) and
  `hbSeaSunShadow(wp)` (two blurred mip taps); `hbSunShadow` unchanged. Ocean spreads `sunShadowUniforms`, so no
  ocean-system change. HB_LITE (Low tier) returns 1: no sea sun shadow on Low (≈ 1 ms iGPU per perf.md). The mask
  resolve still runs on Low (once per shadow refresh, cheap); `sun.ts` could skip it if wanted.
- `ocean-material.ts` (hot): 3 hunks — `hbSeaSunShadow` call, `hbBasinLift` call after `hbSeaTone`, heliograph block
  replaced by `hbHelioGlint(...)` (new `ocean/sea-helio.ts`) + import/include lines.
- `sea-tone.ts`: `hbBasinLift`; `hbMirrorClouds` reflects off the mean surface (uses `uCameraPos`).
- `engine/time-of-day.ts`: new key at 5.5 (first light), 6.4 dawn key retuned. Lamp/window curves before sunrise
  follow the new key (lamps stay lit until ~first light, like dusk).
- Cost: sea +1 R8 mip tap per pixel on Med/High (2 cheap taps vs 1), −1 on Low (shadow skipped); helio and basin lift
  a few ALU; mirror clouds +1 normalize. No draws, tris or bytes.
