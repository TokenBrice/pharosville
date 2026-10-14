# P2 brief: build the Harbour runtime (shared by every P2 agent)

## Read first

- `../PLAN.md` (D1–D14).
- `../p1/VERDICT.md`: style C "Northern Light" + A grafts, the WebGL2 renderer, composition v2.
- `../p1/BRIEF.md`: world conventions (units, camera, scale ladder, rig families, budgets).
- `../research/04-data-to-world.md`: the data grammar. PLAN amendments win: circuits D10, minimal UI D11.

## Working rules

- **Worktree:** `/home/ahirice/Documents/git/pharosville/.worktrees/harbour`, branch `reboot/harbour`.
  - Work only there. Never touch the main checkout.
  - **Do not commit**; the orchestrator commits.
- **Dev server is ALREADY running:** `http://localhost:5190/harbour.html`, with Vite HMR from this worktree.
  - Do not start another server on 5190.
  - Never kill it.
- **Real-GPU capture:** `node scripts/harbour/shot.mjs --url "http://localhost:5190/harbour.html?t=18.5" --out outputs/harbour/<you>/x.png [--seconds 3] [--eval "js"]`.
  - LOOK at every capture with the Read tool.
  - `?t=<hour>` pins the time of day.
  - `window.__harbour` is the Engine (`__harbour.ctx.rig.applyPreset(...)`, `__harbour.ctx.timeOfDay.setHour(h)`).
  - `window.__harbourStats` gives draws, triangles and hour.
  - Never judge looks or perf in Playwright's bundled browser or the Playwright MCP.
- **Other agents work in parallel** in the same tree. Stay inside your owned paths (below).
  - If you need a change in someone else's file, make the smallest possible additive edit and mention it in your return.
  - `src/harbour/systems.ts` is shared: only append or insert your own factory line.
- **The harness blocks subagents from writing `.md` files.** Put your report in your final return value
  (≤ 500 words). Code comments are fine.
- **Typecheck:** `npx tsc --noEmit -p .`. Fix errors in your own files; ignore errors in others' in-progress files.
- **Tests:** `npx vitest run src/harbour` (pure logic only).
- **Quality bar:** enchanting and crisp, at ClaudeVille level or above.
  - Reference stills: `../p1/style-c/render-*-{golden,night,noon}.jpg` and `../p1/style-a/render-overview-*.jpg`.
  - Compare your capture to them at every round. Iterate until the runtime frame matches or beats the still.

## Engine contract (exists, `src/harbour/engine/`)

- **`Engine`** owns:
  - `WebGLRenderer` (shadows on, sRGB output, no renderer tone mapping);
  - the pmndrs `EffectComposer` (RenderPass → Bloom + AgX ToneMapping → SMAA);
  - the `CameraRig` (perspective 25° FOV, pitch 35°, yaw 45°, pan/zoom);
  - `TimeOfDay` (hour → shared uniforms);
  - `AssetStore` (GLB with meshopt, textures);
  - `services: Map<string, unknown>`.
- **`WorldSystem`** interface: `init(ctx)`, `update(frame, ctx)`, `resize?`, `dispose(ctx)`.
  - Register through `src/harbour/systems.ts`. Order is: layout → sky → ocean → island → lighthouse → fleet → lights → labels.
- **`WorldUniforms`** (shared uniform objects) holds:
  - `uTime`, `uNight`, `uSunDir`, `uSunColor`, `uAmbient`;
  - `uZenith`, `uHorizon`, `uHaze`, `uFogDensity`;
  - `uCameraPos`, `uResolution`, `uWindowGlow`.

  Pass these same objects into custom materials. Do not copy them.
- **The engine owner may extend `engine/*`.** Others treat it as read-only and request additions.

## Service keys (`ctx.services`)

| Key | Provider | Shape |
|---|---|---|
| `layout` | layout system | parsed `HarbourLayout` (types in `src/harbour/layout/types.ts`) |
| `wake` | ocean | `{ stamp(x, z, vx, vz, halfWidth, strength): void; texture; bounds }`, a world-space decaying wake/foam RT the sea samples |
| `lights` | lights (engine owner) | `{ add(kind, position, color?, radius?): id; setOn(id, on); remove(id) }` → light pools on surfaces + pillars on water + bloomed sprites. Real point lights only near the camera (≤ 16) |
| `model` | data | `HarbourModel` |
| `sim` | data | `HarbourSim` (boat poses at time t) |

## Asset and data contracts

### Kit GLBs

Location: `public/harbour/kit/<name>.glb`, plus `public/harbour/kit/manifest.json`.

**Materials by name:**

| Material | Purpose |
|---|---|
| `hb_opaque` | `COLOR_0` rgb = albedo; `COLOR_0` alpha = pattern id/16 (style C pattern table in `../p1/style-c/palette.json`) |
| `hb_window` | `COLOR_0.r` = lit factor, `.g` = warmth; emissive × `uWindowGlow` |
| `hb_emissive` | lamps |
| `hb_sail` | UV square emblem region |
| `hb_cover` | brand-colour sail covers |
| `hb_glass` | lantern glazing |

**Hull node contract:**
- Nodes: `hull`, `deck`, `mast*`, `boom` (pivot at gooseneck), `sail_main` (morph `furl` 0 = set … 1 = furled, or separate `sail_main_furled`), `sail_jib`, `sail_cover`, `flag`, `rigging`.
- Empties: `bow_cleat`, `stern_cleat`, `masthead_light`, `wake_origin`, `_heel` pivot.
- Extras: `family`, `class`, `loa_m`, `beam_m`.

**Families × classes:**
- usd: catboat (skiff), sloop (boat/small), cutter (medium), schooner (large), ship (flagship);
- eur: botter;
- gold: brig;
- fiat: lugger;
- other: gaff workboat.

All are sized to the brief's LOA table.

### Island

- `public/harbour/island.glb`: terrain, cliffs, quays, piers, town, props. All static, merged per material for few draws, with baked AO in vertex colour.
- `public/harbour/lighthouse.glb`: separate, because the lens rotates.

### Sea SDF

`public/harbour/sea-sdf.png` is RGBA8, 2048², covering `layout.sea.bounds = [minX, minZ, maxX, maxZ]`.

| Channel | Meaning |
|---|---|
| R | `clamp(0.5 + coastSignedDistanceMetres / 128, 0, 1)` (> 0.5 = sea) |
| G | `clamp(depthMetres / 40, 0, 1)` (stylised bathymetry) |
| B | `clamp(distanceToStructureMetres / 16, 0, 1)` (piles, quay walls, moored-structure contact) |
| A | 1 |

### Layout

`src/harbour/data/layout.json`. v1 = `../p1/greybox/layout.json`; v2 comes from the island agent with the same base keys, plus:

- `version: 2`;
- `moorings: [{ id, chain, class, position:[x,y,z], swingRadius }]`;
- `lights: [{ kind: 'window'|'lamp'|'pierhead'|'harbourlight', position, color }]`;
- `sea: { sdf: '/harbour/sea-sdf.png', bounds }`;
- `labels: [{ id, text, anchor:[x,y,z], kind }]`;
- per-pier `chain`, berths and approach paths, and the lane graph (one-way loops, approach gates).

Coordinates are metres, glTF Y-up: x east, y up, z south (toward the default camera).

### Logos

- Source: `public/logos/*` (326).
- The fleet agent builds `public/harbour/emblems.png`: a 4096² atlas of 128² slots, plus `emblems.json` (coin id → slot).
- The build script lives in `scripts/harbour/`.
