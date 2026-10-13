# P1 brief: Style lock + true-scale grey-box + renderer spike

Read `../PLAN.md` first. Its decisions D1–D14 are binding.

## Working rules

- **Worktree:** `/home/ahirice/Documents/git/pharosville/.worktrees/harbour` (branch `reboot/harbour`).
  - Work ONLY there.
  - Never touch the main checkout at `/home/ahirice/Documents/git/pharosville`.
- **Live data snapshot** (full, 2026-10-13): `outputs/harbour/data/*.json`
  - `stablecoins.json` has 625 assets under `peggedAssets`; the snapshot also has chains, stability-index,
    peg-summary, stress-signals, safety-grades and mint-burn-flows.
  - It is gitignored: do not commit it, and do not paste its contents into docs.
- **Real-GPU browser capture:** `node scripts/harbour/shot.mjs --url <url> --out <png> [--webgpu] [--seconds N] [--json r.json]`.
  - It uses the operator's Chrome headed, refuses software frames, and reports frame times plus
    `window.__harbourStats`.
  - The operator's default Chrome on Linux exposes **NO WebGPU adapter**. WebGPU works only with `--webgpu`
    (which adds flags), so WebGL2 is a first-class path, not a fallback.
  - NEVER judge visuals or perf through Playwright's bundled browser or the Playwright MCP.
- **Blender:** 5.2 at `/usr/bin/blender`, headless Python, RTX 5070 Ti. EEVEE renders are representative of
  real time.
- **Look at your own renders** with the Read tool, every iteration. Iterate at least 3 critique→fix rounds
  before you finish.
  - Be a demanding art director: compare against Tiny Glade, Townscaper, Bad North, ClaudeVille
    (`/home/ahirice/Documents/git/claude-ville/shots`, read-only).
  - No self-inflation in scores.

## Shared world conventions (all agents)

### Units and axes

- 1 unit = 1 metre (stylized).
- Up axis: +Z in Blender; it exports to +Y glTF.
- Sea level: Z = 0.

### Camera

- Perspective, vertical FOV 25°, pitch 35° down from horizontal, yaw 45° (isometric-like diagonal).
- Overview zoom frames the whole bay with a horizon/sky band at the top.
- Harbour zoom frames one pier group.

### Scale ladder (stylized: boats exaggerated relative to buildings)

| Element | Size |
|---|---|
| Lighthouse | 30–34 m to the lantern top (tallest thing in the world) |
| Houses | 7–11 m |
| Pier deck | +1.2 m above sea; piles visible |
| Finger piers | 1.8 m wide |
| Main pier / quay | 4–6 m wide |

Hull size classes (supply decade) and LOA:

| Class | Supply | LOA | Count today |
|---|---|---|---|
| flagship | ≥ $10B | 26 m | 2 |
| large | $1–10B | 18 m | 20 |
| medium | $100M–1B | 13 m | 79 |
| small | $10–100M | 10 m | 168 |
| boat | $1–10M | 7.5 m | 142 |
| skiff | < $1M | 5 m | 214 |

### Rig families by peg currency (D9)

All rigs are one late-19th-century working-sail family, sharing the same materials and palette.

| Family | Peg | Count | Look |
|---|---|---|---|
| `usd` | USD | 490 | Western: catboat → sloop → cutter → schooner → full-rigged ship by class; white/cream canvas |
| `eur` | EUR | 34 | Dutch botter/tjalk, leeboards, tan-bark red-brown sails |
| `gold` | GOLD | 12 | Deep-laden merchant brig, dark stained hull, gilded trim |
| `fiat` | GBP, JPY, CHF, BRL, AUD, … (~70) | ~70 | Lugger with lug sails, ochre canvas |
| `other` | VAR / unknown | — | Plain gaff workboat |

### Sails and logos

- The main sail carries the coin logo in a square emblem region of its UV, in the 4096² atlas (256² slots).
- The runtime gets per-instance `emblemIndex` and `brandColor`.
- Sail covers (when docked/furled) use the brand colour.

### Docked vs sailing

- **Docked:** sails furled or lowered, covers on, mooring lines attached.
- **Sailing:** sails set, with a little heel.

### Lighthouse (D8)

- A grey-stone "Pharos":
  - square masonry base with a door and keeper's stair;
  - octagonal middle shaft with small windows;
  - round upper shaft;
  - corbelled gallery with an iron railing;
  - glazed lantern room with a brass/black dome and a visible Fresnel lens;
  - keeper's cottage, oil store and signal mast beside it.
- It must read as a real working lighthouse at the overview zoom.

### Harbour structures (D6)

- Open finger piers and pontoons on piles, a stone quay with bollards, a T-head for big hulls.
- No sheds or boathouses over water.
- Berths open toward the camera side.

### Night

- Readable through:
  - warm windows with frames;
  - pier lamps with light pools on the planks;
  - riding lights on masts;
  - lantern glow and beam;
  - moonlit sea.
- Night must never collapse to black.

## Runtime portability (art agents)

Whatever you author must be reproducible in a WebGL2 real-time renderer:

- Allowed:
  - GLB meshes with vertex colours and/or a small palette/trim texture;
  - baked AO in vertex colours;
  - emissive for windows and lamps;
  - simple stylised PBR (roughness, no metallic except brass);
  - an outline pass (inverted hull or post-process edge);
  - grading / LUT;
  - fog;
  - bloom.
- Not allowed: Blender-only magic with no real-time equivalent (Cycles caustics, path-traced GI as the look).
- If you use something like EEVEE's shader-to-RGB toon ramp, write down its WebGL equivalent.
- **Budgets:** whole style block ≤ 120k triangles; lighthouse ≤ 15k; one house ≤ 2.5k; a hull with rig ≤ 900
  (flagship ≤ 2.5k).
- Every asset family must come from a reproducible Python builder (no hand-sculpting), exported as GLB with
  named nodes.
