# Opus visual leap — shared lane brief

Date: 2026-09-26. Base: `main` @ `5a187df` (v0.17.0 "Reborn"). Orchestrator: Opus 5.5.

## The ask

PharosVille is a live visualization of Pharos stablecoin analytics as a maritime harbour
watched from a Japanese-garden threshold: data visualization meets a digital Japanese
garden. It was built by earlier agent generations. The operator wants a **massive leap**
in how stunning, beautiful, poetic and relaxing the experience is, and believes a model
with better visual taste can find it.

This swarm is **review and ideation only**. Each lane evaluates one slice of the visual
experience against the real frames and the code, then writes a ranked set of the
highest-leverage ideas. The orchestrator consolidates every lane into one implementation
plan. No lane edits source.

## Ground truth to read first

1. `PRODUCT.md` — purpose, personality, anti-references, design principles, a11y.
2. `docs/pharosville/VISUAL_INVARIANTS.md` — the design bible (picture, value plan,
   hierarchy, coarse-truth/DOM rule, atmosphere, motion restraint, colour anchors).
3. The real-GPU baseline frames below. **Look at them.** Your verdict must cite them.
4. Your lane's source files (listed in your task) — read enough to know what exists,
   what the knobs are, and where an idea would land. Cite `file:line`.
5. History, so you do not re-propose what already failed without saying why it will
   work now: `agents/pharosville-reborn/reviews/decision-ledger.md`,
   `agents/pharosville-reborn/01-implementation-plan.md` §6 (rejected/deferred), and
   the prior lane review named in your task. Treat old plans as history, not authority;
   current code and the bible win.

## Evidence: real-GPU baseline frames

Captured 2026-09-26 with `npm run preview` on Chrome / ANGLE Metal / Apple M5 Pro,
scheduler tier `full`, 60 fps vsync-bound, ~280 draws, ~380k tris, 50 textures,
184 ships visible. 1600×1000 unless noted. The top-left debug HUD is a capture
artefact (`?debug=1`), not part of the product. Metrics per frame are in the sibling
`.txt` files.

| File (`outputs/opus-review/`) | Hash | What |
| --- | --- | --- |
| `dawn.png` | `#t=5.6` | dawn beat |
| `morning.png` | `#t=8.5` | morning day |
| `noon.png` | `#t=12.25` | noon, resting frame |
| `golden.png` | `#t=17.6` | golden hour |
| `blue.png` | `#t=18.8` | blue hour |
| `night.png` | `#t=22` | night |
| `deep-night.png` | `#t=2.5` | deep night |
| `wholemap-noon.png` | `#t=12.25&cam=0,0,0.28` | whole-map zoom-out |
| `wholemap-dusk.png` | `#t=17.8&cam=0,0,0.28` | whole-map at golden |
| `selected-ship.png` | `#t=14&sel=ship.usdc-circle` | ship selected + detail panel |
| `selected-lighthouse.png` | `#t=16&sel=lighthouse` | lighthouse selected |
| `reduced-noon.png` | `--reduced #t=12.25` | reduced-motion static tableau |
| `sea-sign-hover.png` | `--hover-sea-sign #t=11` | sea-sign inspection raise |
| `noon-1440p.png` | 2560×1440 `#t=12.25` | large display |
| `compact-1200x640.png` | 1200×640 `#t=10` | wide-laptop gate profile |
| `gate-900x720.png` | 900×720 `#t=12.25` | standard gate profile (added after the lanes ran; shows the harbor-log panel open) |
| `gate-720x900.png` | 720×900 `#t=12.25` | tall-window gate profile (dimensions sorted; added after the lanes ran) |

## Capturing more evidence (optional, encouraged where it sharpens a claim)

The dev server runs at `http://localhost:5173/` (do not start or stop it).

- Still frame, real GPU: `npm run preview -- --hash "#t=17.6&cam=X,Y,ZOOM" --out opus-review/<lane>/<name>.png --seconds 6`
  Other flags: `--width/--height`, `--reduced`, `--hover-sea-sign`, `--blur-audit`,
  `--draw-census`, `--fixture calm|dense|stress`. `cam=x,y,zoom` in the hash; zoom 1 ≈ rest,
  0.28 ≈ whole map, >1.3 is close. `sel=ship.<id>` or `sel=lighthouse` selects.
- Motion contact sheet, real GPU (N frames at an interval, optional viewport clip):
  `node outputs/opus-review/tools/motion-sheet.mjs --hash "#t=12" --frames 9 --interval 600 --clip x,y,w,h --out <lane>/<name>`
  → `outputs/opus-review/<lane>/<name>.png` plus individual frames.
- **Budget: at most 6 captures per lane.** ~19 lanes share one GPU. Every capture prints
  `tier`; discard and retry once if it is not `full`. **Never quote a frame time from your
  own captures** (they run concurrently); cite the serial baseline `.txt` files instead.
- NEVER use Playwright's bundled Chromium or any other path to judge the look.
- Write scratch captures only under `outputs/opus-review/<lane>/`.

## Hard constraints (from AGENTS.md and the product)

- Review only. Do not edit anything except your own report file and your scratch captures.
  Do not run tests, lint, typecheck, formatters, builds or git commands that change state.
- Browser code calls same-origin `/api/*` only; `PHAROS_API_KEY` stays server-side.
- The desktop gate stays (900×720 and 1200×640 sorted size profiles, never orientation).
- Data truth before spectacle: any idea that encodes analytical meaning needs a DOM
  detail/ledger equivalent and a reduced-motion state; colour is never the only carrier.
- Immutable colour anchors: `lantern_warm`, `vermillion`, `sail_teal`, `sail_red`.
- Wall clock owns illumination; no flattering default hour, no accelerated day.
- Anti-references: crypto-dashboard neon/urgency, tech-demo spectacle, fantasy-village
  lore, literal cultural costume, WebGL-only truth.
- The bible's displacement rule: every addition names what it displaces.
- Budget reality: the frame is vsync-bound at 60 fps on the reference GPU with headroom;
  the preview `--assert` ceilings are 700 draw calls / 500k triangles. Ideas must state a
  cost estimate; the rendering-headroom lane will sanity-check costs at consolidation.

## You may challenge history

Earlier generations made choices under less taste. If you believe a prior decision
(decision ledger, bible sentence, rejected item) is now the thing holding the picture
back, say so in **Reversals** with the evidence and the argument. The operator decides.
Do not silently re-propose a rejected idea as if it were new.

## Report format (strict)

Write exactly one file: `agents/2026-09-26-opus-visual-leap/reviews/<lane-id>.md`.

```markdown
# <Lane title> — <lane-id>

## Verdict
≤150 words. The single most important truth about this slice today, and where the leap is.
Cite frames by filename.

## What I looked at
Frames (baseline + any you captured, with paths) and the key files/functions read.

## Spell-breakers (defects)
Ranked. Each: what is wrong, where (frame + region, file:line), why it breaks the calm,
fix sketch, cost S/M/L. Only real, observed defects.

## Ideas (ranked, highest leverage first, max 8; mark the top 3 with ★)
### <lane-id>-<n> <Title>
- **Picture:** 2–4 vivid sentences — what the viewer sees and feels afterwards.
- **Why:** diagnosis/principle, citing frames and `file:line`.
- **Impact:** 1–5 on stunning / poetic / relaxing (state which). **Confidence:** H/M/L.
- **Cost:** S (<1 day) / M (1–3 days) / L (>3 days). **Perf:** est. Δdraws / Δtris / ΔGPU ms / Δtextures.
- **How:** concrete technique — shader/geometry/material/timing/parameters; files and symbols.
- **Displaces:** what it removes, quiets or stills.
- **Truth & a11y:** analytical meaning (if any), DOM/ledger parity, reduced-motion state.
- **Risks:** what could go wrong (visually, perf, tests/contracts).
- **Acceptance:** the real-GPU evidence that proves it (hash, viewport, what to look for).

## Subtractions
Things to remove or quiet outright; cheaper beauty than addition.

## Reversals
Prior decisions worth reopening: decision + source, the evidence, the argument, the risk.

## Cross-lane dependencies
What your ideas need from other slices, or conflicts you foresee.
```

Be concrete, visual and honest. Taste is the point: name what is ugly, what is beautiful,
and what would make a viewer stop and breathe. Numbers, parameters and file anchors turn
taste into a plan.
