# Wave 1 B1 — The Frame

## Intent

Turn the Garden Observatory from an unbounded water simulation into a finite,
spacious stroll-garden composition: water and authored rim form one plate, the
plate dissolves into a real graded sky, borrowed scenery sits inside that fog
seam, and the viewer looks in past an engawa foreground.

This implements the approved redesign plan's §2.1, §3.1, §3.7, §5 and §7
Wave 1. The authored terrain in `src/systems/garden-rim.ts` is authoritative;
renderer geometry follows it and never creates a second land classification.

## Ordered slices

1. **Finite plate.** Size the only water mesh to the 140-tile map plus a
   documented 1.5-tile margin on every side. Remove the rounded-lozenge and
   open-ocean shader domain. Preserve wakes, harbor calm, region lookup,
   ripple rings and all other water semantics.
2. **Sky behind the plate.** Make a screen-enclosing graded background from the
   shared day phase and sun arc: shironeri seam through mizu to kon by day,
   kachi-iro by night. Move bokashi from water depth to the sky seam. Keep the
   scattering dome as the PMREM source. Fade the far plate edge into that seam.
3. **Rim body.** Sample the rim field into deterministic sub-tile contours;
   build 2–4 merged vertex-colour land/rock meshes, one pine instance batch,
   one stone instance batch and one merged path ribbon. Reserve openings and
   cove mouths. Include overview visibility names and static shadow casting.
4. **Shakkei.** Replace the disabled horizon owner with one merged unlit mesh
   holding 2–3 connected, low-contrast mountain/headland layers in the far fog
   seam. If any phase reads as detached pills in real-GPU frames, remove it.
5. **Engawa foreground.** Add one leaning niwaki, three stepping stones and one
   stone lantern inside the rim batches. Register its reflection as the ember
   lane that displaces `sea-sign.watch`.
6. **Camera and fog.** Recompose default and postcard cameras so rim enters two
   corners, Pharos approaches a thirds point, and a broad dark water interval
   remains. Recalculate the whole-map floor for the complete plate, halve the
   day distance/height/bokashi fog stack, and verify URL state plus DOM label
   projection during camera motion.

## Geometry and light budgets

- All rim and engawa geometry: at most 12 recurring draws.
- Land: 2–4 opaque merged meshes with vertex colours.
- Vegetation and stones: one `InstancedMesh` each.
- Path: one merged opaque mesh; shakkei: one unlit merged mesh.
- Every new mesh owns one lifecycle and disposes its geometry/material once.
- Widen the static shadow radius only enough to reach the authored rim; record
  the resulting world span and shadow texel density without raising texture or
  triangle ceilings.

## Visual decisions

- Soft edge is authoritative: far water/land dissolves into the shironeri seam,
  never a hard tabletop cut.
- The two rim openings remain visibly clear. Cove mouths remain clear for the
  shore-station wave.
- Day uses large separated planes: ink water, parchment stone, pine, fog paper,
  one vermilion. Atmosphere belongs primarily to the sky, so day fog is halved.
- Shakkei stays 2–4% value from fog, phase-tinted, decorative and non-semantic.
- Whole-map must show a complete plate; a 16px blur must retain one large calm
  dark water region.

## Verification ledger

Each numbered slice lands as its own commit and receives a real-GPU frame on
port 5214. Final matrix: default, `#t=19`, `#t=22&n=1`, and
`#cam=0,0,<minimum>`; animated and reduced `--assert` at default and whole-map;
reconciled `--draw-census`; focused tests while iterating; finally
`npm test -- src/three src/systems src/hooks src/renderer` and
`npm run typecheck`. Evidence and per-commit census go to
`outputs/swarm/frame-report.md`.
