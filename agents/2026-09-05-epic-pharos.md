# Epic Pharos — the Wonder, not a lighthouse

- **Date:** 2026-09-05 (after Warm Village, unreleased)
- **Status:** implemented on local `main`; see §4

## 1. Brief

Operator verdict on the centerpiece: "it doesn't feel exciting or epic … it is a
lighthouse, it's not Pharos, the Great Lighthouse of Alexandria." References
supplied: paintings of the Pharos — a broad battered marble keep with rows of
arched windows, corner Tritons, an octagonal middle tier, a columned lantern
glowing gold, Zeus on the summit, all standing on a fortified square platform
with corner bastions rising straight from the sea rock.

## 2. Findings before design

1. **Production was showing the fallback shell, not the model.** The `_headers`
   CSP had no `script-src 'wasm-unsafe-eval'` and no `img-src blob:`. The
   meshopt decoder therefore could not instantiate WebAssembly
   (`CompileError: Wasm code generation disallowed by embedder`, verified
   against https://pharosville.pharos.watch), so the lighthouse GLB and all
   eighteen hero hulls fell back to procedural shells, and SVG logos decoded
   through object URLs were blocked (blank sails). The dev server sends no CSP,
   so local review never saw it. The operator's screenshot is that fallback.
2. **Height is camera-bound.** Iso rise is 13.86 px per world unit at zoom 1;
   the 34-unit tower already spanned ~half the frame at rest, and the 1200×640
   laptop gate rests at zoom ~0.825 with the island centre at ~69% of the frame.
   "Epic" therefore had to come from mass, breadth, the fortified platform and
   surface detail, with only a modest height gain.

## 3. Contract (decided up front, shared by three concurrent agents)

Lighthouse-local y; root at island-local (−7, 2.55, −1.25), unchanged.

| Element | Old | New |
| --- | --- | --- |
| `GARDEN_LIGHTHOUSE_HEIGHT` (Zeus sceptre tip) | 34 | **38** |
| `GARDEN_LIGHTHOUSE_BEACON_Y` (fire + beam origin) | 30.1 (open brazier) | **30.2** (inside the lantern) |
| Stylobate steps, half-widths | 4.6 / 4.2 / 3.85 | **6.2 / 5.7 / 5.2** (y 0–2.5) |
| Square battered tier | 2.5→17.5, half 3.4→2.9 | **2.5→20.5, half 4.6→3.7**, three window rows, frontal stair + bronze portal |
| Gallery half-extent + Tritons | 3.82 | **4.7**, four Tritons |
| Octagonal drum | 17.5→26, r 2.15→2.0 | **20.5→29.0, r 2.75→2.5**, pilasters, one window per face |
| Lantern | cylinder 26→29.5 r 1.35 + open brazier | **colonnade 29.4→32.8 r 1.9**, 8 columns, inner emissive glow drum, entablature, conical cap to 34.4, pedestal, Zeus 35.0→38.0 |
| GLB anchors | beacon/beam 30.1, label 34.9, selection 17 | **30.2 / 38.9 / 19**; pick proxy r 6.6 h 38 |
| Precinct (island-local) | none — bare rock + keeper's cottage | **square curtain wall centred on the tower, outer half 8.6**, walk 4.75, merlons 5.35, four corner bastions (half 2, top 7.0/7.6) projecting from the wall corners, east gatehouse at z −1.25 with the one warm window, quay stair re-routed to the gate |

Constraints held: no new lights, no textures, palette-derived colours, the
island obstacle ellipse did not grow (seaward bastions are chamfered to it,
value ≤ 1.08), semantic cues and DOM parity untouched.

## 4. Outcome

- **CSP fix** (`public/_headers`, validator, docs, guard test): `blob:` and
  `'wasm-unsafe-eval'` are now required sources; the static validator fails
  without them. Deploying this alone would already have replaced the plain
  tower in production with the ashlar model.
- **GLB** regenerated: 232,848 bytes, 37,160 tris, 24,304 verts, 7 draws,
  0 textures, 12.43 × 38 × 12.43; `check:garden-models` and
  `check:runtime-facts` green.
- **Shell** mirrors the contract; a permanent envelope test pins the shell's
  height/width to the constants. Salt courses, summit-bird perch, gull perches,
  shadow caster height, hit rect (widened to 100·zoom) all follow.
- **Camera**: `LANDING_CROWN_SKY_PX` 48 → 36; island-centre band ceiling
  0.70 → 0.73. The 0.8 rest floor stays; on a 640 px-tall window the island's
  near cliff slides under the footer — accepted, the crown/lantern/tower/
  precinct keep priority.
- **Precinct** in `src/three/garden-precinct.ts` (4 merged static draws) with
  the plateau regrade in `garden-island.ts`. Displaced and where it went:
  keeper's cottage → removed, its window is the gatehouse's; pines (−8,5.8),
  (−4.5,4.2), (−0.8,7) → (−11.5,9.1), (−6.5,10.5), (0.8,10.2); reflection
  pond → (8,6) with the streak axis re-derived; quay stair head → (3.4,−1.25)
  with the obelisk gateposts following.
- Measured default frame (Apple M5 Pro, tier full): 218–224 recurring draws
  (was 215), ~357k tris (was ~333k), 60 fps, p95 16.7 ms.
- Renders under `outputs/pharos-epic/` (day, dusk, night, both size gates).

### Release-note draft (unversioned — lift into the release PR)

Title: Epic Pharos. Summary: the Great Lighthouse of Alexandria stands on a
fortified platform in the middle of the harbor — and the deployed site finally
shows the real models.

- Rebuilt the Pharos as the Wonder: a broad battered marble keep with three
  rows of lit arched windows, a frontal stair to bronze doors, a corbelled
  gallery with four Triton finials, a pilastered octagonal drum, and a columned
  lantern whose fire glows gold through open arches under a conical cap and the
  bronze Zeus — 38 units to the sceptre tip, on a stylobate half again as wide.
- Set the tower on a fortified precinct: crenellated curtain walls, four corner
  bastions rising from the sea rock, a paved court and an east gatehouse the
  quay stair now climbs to. The keeper's cottage, three pines and the
  reflection pond moved to make room; the island's footprint for shipping did
  not grow.
- Fixed the deployed site rendering the plain fallback lighthouse, fallback
  hulls and blank sails: the content-security policy blocked the WebAssembly
  model decoder and object-URL logo images. The static header check now
  requires both sources.
- Seated the taller crown with slightly less sky above it; compact laptop
  windows keep the crown, lantern and precinct in frame.
