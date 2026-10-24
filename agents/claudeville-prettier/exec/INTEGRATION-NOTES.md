# Integration notes (orchestrator)

- DATA (prettier/data) done. Maiden voyage: no durable "new coin" source exists (launchDate on 1/217 bundled
  coins; prelaunch.json drops launched coins; 13 % of live coins lack circulatingPrevWeek, incl. PAXG). Keep
  DATA's strict rule (no week- AND month-ago supply, global guard ≤2 % missing) — honest, dormant today.
  In-visit launches still get bunting via the launch ceremony (EV_LAUNCH) in Round B.
- T6 furled side: add symmetric hysteresis (enter ≤ −8 %, leave > −6 %) — Round B SIGNALS lane or at integration.
- DATA merge hazards: new required Boat fields (fix other lanes' fixtures), deriveTargets/WorldTargets fields,
  DEV_OVERRIDE_KEYS, reduced-motion check moved to top of ReadingsSystem.update.
- Render from readings service: readings.stormFlags, readings.maidens, readings.offices; events service
  `ctx.services.get("events")` → book/current/arrivedAtMs/subscribe()/onMoment(m) (m.endMs ≤ 20 s).
- CAMERA (prettier/camera) done. No WASD (W = watch); arrows pan. Hazards: harbour CSS at 27.9/28 KiB —
  budget call needed at merge; kit rim lights hulls inside a hovered building's sphere (check); drift-in skipped
  under navigator.webdriver (captures deterministic; use ?wake=1 to force). Hover lights on/off (no fade).
- AUDIO (prettier/audio) done. Bank 18→7.6 MB. Hazards: CSS 27.4/28 KiB (with CAMERA's → over budget: raise
  harbour CSS budget modestly or trim); sound toggle became a menu = 2 clicks to turn sound on (consider: click
  toggles ambience, caret opens menu); reads lighthouse.sweepAngle() not PHAROS beam angle; Panel.tsx Wreck line.
- FRAME (prettier/frame) done, 15 commits. Paper tooth built but OFF (invisible at 1.5 %, filter-like above;
  ?tooth=1) — D-6 resolved by evidence: dither only. LOD freeboard cheat dropped. Hazards: fleet program cache key
  hb_fleet_v7f; hbWeather/hbAerial calls in fleet fragment; aerial+runup includes in world/materials; wake live
  alpha = lee slick; aerial tint follows DEWS storm grey on haze (OK: weather is DEWS).
- SKY (prettier/sky) done. Hazards: cloudShadowUniforms new keys (FRAME binds cloud shadow for O2 — check spread
  vs named); gust.ts TODO to wire; ocean hooks wish-list in exec/sky.md (cat's-paws, squall rain on water) →
  Round B. Front direction fixed at start (camera rotation mid-front; pitch/yaw are fixed by D1 so OK).
  Meteor streak never captured on screen; dew/rime/lightning direction unverified visually → art review.
- PHAROS (prettier/pharos) done; P6 dropped. Beam light is a swath under the shaft's ground track (shaft ~85 m up).
  Hazards: materials.ts beam record + ...lampWaveUniforms in shared(), hb_emissive cache key hb_emissive_w1;
  ocean-material uBeamSun; fleet inherits beam light via kit base (fleet-material untouched).
  Follow-ups: lamp wave barely visible on stills (art review at dusk window; maybe widen the wave span),
  precip lamp-lit rain not on the wave, plume flare weak in calm.
- AUDIO-B merged. Evening gun: audio exposes sound.cue("evening-gun") (report 1.2 s later); wire it from SIGNALS' sunset puff at integration. Depeg/recovery silent by decision.
- ISLAND merged (tris +1.7 %, gz +60 KB, 0 draws). Follow-ups: wire world/sway.ts hbSwayGust() to weather/gust.ts
  GLSL; terrace walls read as busy grey dashes at heart; sanctuary hard against the shipyard wall → art review.
- LIFE lane launched from post-island head (port 5194).
- SIGNALS merged. Harbour chunk 358.9 KiB gz > 352 budget → re-baseline (measured +~12 %) after LIFE merges. Evening gun dropped (no battery): audio cue "evening-gun" unused. events.onMoment replays current to late subscribers (fixed).
- All lanes merged (feat/prettier). Budgets re-baselined (harbour 1,175/408 KiB, total 2,480/804 KiB).
- PERF (quiet machine, dev server, 1600x1000, --uncapped, 8-12 s):
  RTX 5070 Ti gpuMs: base 2.86 (t=11) / 3.35 (t=21.5) → new 4.32 / 3.34.
  AMD Raphael iGPU (--igpu, low tier, dpr 1) gpuMs: base 55–60 → new 68–76 (≈ +20 %); GPU-bound ~15 fps both.
  Plan estimate was +0.3–0.5 ms on Apple Silicon; reality is larger → perf pass.
