# Lane GOLDEN (Round B) — exec notes

## Changelog bullets (user-facing)

- The sea receives the sun's shadow: at dawn and in the golden hour the Pharos lays a long blue finger across the
  harbour, moles and hulls sit in their own shade, and the glitter breaks where something stands in the sun.
- Late shadows soften with distance as the sun drops, and keep their edge instead of turning to stair-steps.
- In the golden hour the sunlit harbour warms into the evening light while the water in shade stays cool blue.
- Sails glow like paper lanterns in their own colours against a low sun, their seams and printed roundels standing
  dark in the glow.
- Gilt and bronze are metals now: the titans' swan necks and temple roof, the Pharos's Helios and finials, rams and
  fire bowls catch the sun with a soft sheen and the odd still glint.
- The golden hour follows the real sun: it always comes about 80 minutes before your sunset, lasts longer, and dusk
  splits into warm lit walls and cool blue shade rather than one magenta wash. No painted moon beside the setting sun.
- Every ship carries a small bronze lantern on her stern staff; it is lit exactly when her stern lamp is (she has a
  peg reading), and dark otherwise. Her riding light now hangs from it.
- The titans have warm stern-gallery windows at dusk and fly a long streamer in their colours from the masthead.

## Legend lines

- **Stern lantern** — lit = the hull has a peg reading (the same rule as the stern / riding lamp: under way or at
  anchor with a reading; moored, a few lit hulls). Dark lantern = no peg reading. Not a new signal.
- Decorative (time of day / ship identity, never data): sun shadows on the water, golden-hour sea warmth, sails
  glowing against a low sun, gilt and bronze glints, titan stern windows and masthead streamers.

## Interfaces / hazards for integration

- `world/sun-shadow.ts`: `sunShadowUniforms` (`uKeyShadow` sampler2DShadow, `uKeyShadowMat`, `uKeyShadowP`) +
  `SUN_SHADOW_GLSL` → `float hbSunShadow(vec3 worldPos)`; filled by `SunRig.update` (world/sun.ts). Any ShaderMaterial
  can spread the uniforms and include the chunk. `NO_SHADOW` is an uploaded compare-mode placeholder (a never-uploaded
  texture on a shadow sampler is a GL error).
- `sun.ts` fit is now rectangular in light space (separate `halfY`; `lastFit` has 8 slots) — 02-L6 texel guard.
- `ocean-material.ts` hunks: imports, `sunSh` after `sunUp`, `hbSeaGolden(body, sunSh, sunUp)` after the relief
  block, `* sunSh` on the golden crest glow, `glint *= sunSh`, foam sun term, `?debugSea=8` (= sun shadow).
- `world/metal.ts` (METAL_GLSL) is included last in the kit `#include <common>` list; `materials.ts` replaces
  `metalnessmap_fragment` and `lights_physical_fragment`, adds `hbMetalCap` after the wet cap and `hbMetalLight` in the
  opaque block. Fleet sets `HB_FLEET` (needs `vFleetMisc`, `vPaintA`, `vFleetRig`).
- Fleet program cache key `hb_fleet_v9` → `hb_fleet_v9g2`; new varying `vFleetLamp` (texel 2.z). Texel 2.z is now
  WRITTEN by fleet-system (the lantern flag) — no longer reserved.
- Kinds: `KIND_LAMP` (4) now also on hulls (any `hb_emissive`), new `KIND_WINDOW` (5) = `hb_fleet_window` (non-wreck).
- House flags: `FLAG_STREAMER = 5` (chose 5 to stay clear of new SIGNALS styles 3/4).
- `time-of-day.ts`: `seasonalKeyHour` rewritten (solar windows; tests in season/calendar.test.ts), a new key at 19.2,
  dusk key retuned, golden `blueSat` 0.86. `sky-system.ts`: `moonShown` (moon disc and moon glint) — one hunk.
- Kit re-export: all 18 ancient hulls + 4 titans (+20 tris each; titans +32). `hulls/export.py --only` now merges into
  the manifest; hull budgets carry `AncientRig.LANTERN_TRIS`. LOD files unchanged.

## Cost (estimates; not measured on a quiet machine)

- Ocean: +1 mat4×vec4 and 1 (Med/Low) or 4 (High) hardware-compare taps per sea pixel, ~25 ALU (L1 + L11).
- Sails: ~15 ALU on sail fragments. Metals: classification ~10 ALU on every kit/fleet fragment, metal branch ~40 ALU
  only on gilt/bronze pixels. Lantern/window glow: branch-local.
- Geometry: +20 tris per kit hull variant, +32 per titan (≈ +12 k tris across a full fleet draw), 0 new draws;
  +4 flag instances (streamers). Bytes: kit GLBs +~1–2 KB each.
