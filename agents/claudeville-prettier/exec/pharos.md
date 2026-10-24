# Lane PHAROS — changelog bullets and legend lines (for the orchestrator)

## Changelog bullets (user-facing)

- The lighthouse beam is now a real light: as it sweeps, ships, sails, walls and hillsides under it take a soft
  warm patch that follows the beam's rhythm and colour, and reaches only as far as the score allows.
- By day the Pharos's bronze mirror throws the sun: a soft coin of light crosses the water once per revolution,
  dimmed when the storm weather clouds the sky.
- At night the fire lights its own tower from above, and the bronze tritons flare as the beam swings past them.
- When there is no stability reading the fire is banked, not erased: embers, a thin wisp of smoke, the mirror at
  rest and a tiny keeper's lamp keep vigil.
- At dusk the harbour lamps light in a slow wave outward from the Pharos, and at dawn they go out in reverse.
- When the stability index is computed without its early-warning inputs, a horn shutter narrows the beam and the
  Pharos panel says "Computed without early-warning data".

## Legend lines (Ledger)

- Beam narrowed (horn shutter): the stability index was computed without early-warning data
  (`inputDegradation.dewsUnavailable` or `.depegEventsUnavailable`).
- Decorative: the beam's light on the town, the daylight heliograph, firelight on the tower, the lamplighting wave.
- Banked fire with a keeper's lamp: no stability reading (same as "unlit").

## Interfaces for other lanes

- `beam` service: `setIntroScale?(k: 0..1)`, `introScale?`, `reach?(): number` (eased reach × lit × kindling),
  `setQualified?(q)`.
- `lights` service: `rankOf?(id): number` — the light's place in the lamplighting wave (0 first … 1 last; -1 unknown).
- `lights/lamp-wave.ts`: `lampRank`, `lampGlow`, `lampJitter`, `LAMP_WAVE_GLSL`, `lampWaveUniforms`.
- `beam/beam-light-glsl.ts`: `BEAM_LIGHT_GLSL` (`hbBeamLight(p, n)`, `hbPharosFire(p, n)`) + `beamLightUniforms(bu)`.

## Dev URL params

- `?psiQualified=1|0` (with or without `?psi=`): force the qualified (horn shutter) state.
