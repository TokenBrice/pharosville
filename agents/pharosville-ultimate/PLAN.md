# PharosVille Ultimate — final implementation plan

Date: 2026-11-08 · Baseline: `main` @ `29e0b2a3` = v1.4.1 "Flying Colours".

**Status: FINAL.** The operator settled every decision on 2026-11-08 (§3). The plan is ready for autonomous
execution under `EXECUTION.md`.

**Inputs**
- **Round 1 (34 lanes):** 25 Sol code audits and 9 Opus visual/audio lanes. The Opus lanes used real-GPU
  captures, value analysis and offline BS.1770 audio renders.
- **Round 2 (6 lanes):** 5 Sol workstream specs that re-verified every claim against current code, and
  1 Opus visual-direction lane with live before/after spikes.
- **Totals (round 1):** 444 ideas and 351 findings (2 critical, 65 high).

Every item keeps its source id (`O5-I2`, `A01`, `B03`, `D18`, `E04` …). Its rationale, `file:line` anchors,
exact copy, tests and cost live in `reports/` (round 1) and `round2/` (workstream specs). Folder map: §10.

---

## 0. The short version

**What we found** (detail in §1):

1. **The craft is real; the next level is not more effects.**
   - Night is already postcard-grade.
   - The AgX + per-hour LUT light pipeline, the water and the procedural sound are mature.
   - The chart-paper UI is more distinctive than Apple Maps, Windy or Flightradar24.
2. **It sometimes says things the data does not.** Each case was re-verified in code:
   - The projection strips the PSI qualification flags, so v1.4.0's "horn shutter" never fires in production.
   - The storm-station text explains a different signal from the mast.
   - Missing readings are narrated as "Calm".
   - Withheld flows display as $0.
   - Outage fallbacks are treated as current.
   - **Critical:** a rising storm front paints the sea like stale fog.
   - The audible surf follows the wrong signal.
   - Dock time drifts about 4.8 points from supply share.
3. **It is not yet smooth everywhere.**
   - The low tier is about 4× over budget on a weak iGPU.
   - Tier changes compile shaders mid-flight.
   - The governor has a blind spot.
   - A static shadow map is redrawn every frame.
   - The grade LUT stalls the main thread for 19.6 ms.
   - Hitches reach 28–93 ms.
4. **Ordinary failures strand visitors.**
   - A failed kit download keeps the poster up forever.
   - A context loss breaks the bakes.
   - A hung worker freezes the readings.
   - A shader link failure can still "reveal" the world.
5. **The picture's hierarchy slips.**
   - The sky out-values the Pharos by day; flags and chrome out-value it by night.
   - The water reads as map pins.
   - The mainland mesh breaks through on zoom-out and in portrait.
   - The arrival double-exposes a stale golden-hour poster over the live hour.
6. **Professional-grade gaps.**
   - No working share links.
   - Wrong postcard provenance.
   - Advanced actions unreachable by touch.
   - WCAG gaps.
   - No type system.

**What ships: four consolidated releases** (one PR each, to keep CI time down):

| Version | Name | Contents (former waves) | What visitors notice |
|---|---|---|---|
| v1.5.0 | **True Bearing** | data truth, critical fixes, engine correctness, recovery, measurement (waves 0–1) | Readings say exactly what is known; storms stop looking like stale fog; fewer hitches; failures explain themselves and recover |
| v1.6.0 | **Clear Air** | the look (hierarchy and clutter) with the experience and design system (waves 2–3) | The Pharos is the hero again; coin marks print on the cloth; complete for keyboard, touch and screen readers; night-adapted chrome |
| v1.7.0 | **Lamplighter** | Lite tier, still shadows and hitch removal, with arrival, hero assets and sound (waves 4–5) | Smoother on weak machines; a seamless arrival where the Pharos kindles and the town answers; Pharos v2; sound becomes a voice |
| v1.8.0 | **Golden Hour** | sharing, return visits, phone welcome, new readings, and the earned extras (waves 6–7) | Share links and postcards work; "since you were here"; depeg, reserves and liquidity panels; twilight, night sky, harbour mirror |

Execution is fully autonomous (`EXECUTION.md`):
- **Art direction:** an Opus art-director agent signs off visuals against the O10 look-target metrics.
- **Shipping:** agents merge and release.
- **Incidents:** regressions are fixed forward with no rollback.
- **Reporting:** the operator gets one report at the end.

---

## 1. Where PharosVille stands

### Strengths to protect (every release must leave these intact)

- **The night frame:** the fire and beam lead; the storm at night is the best frame in the set (O1).
- **The light pipeline:** AgX + per-hour LUTs, a fitted PCF sun, warm/cool golden and night palettes (O2); a
  sky card at about 0.04 ms (O4).
- **The water close up:** coast foam, run-up, mirror clouds, lamp and fire reflections (O3).
- **The fleet up close:** a crafted miniature; the Shoals and Wreck Cove are among the best passages (O5).
- **The platform:** deterministic UTC sim with a planning worker and atomic, revision-coherent arrival;
  same-origin proxy with an exact allowlist and a server-only key (S09/S16/S19).
- **The overlay:** cached measurements, accessible native tables with full fleet coverage (S05/S23).
- **The sound:** procedural (32 kinds, no audio files), camera-placed, opt-in, one-click on (O9).

### Key numbers (measured unless marked)

| Area | Number | Source |
|---|---|---|
| GPU, RTX 5070 Ti, 1600×1000 | total p50 2.37 ms day / 2.84 night; shadow pass 0.35 ms; 115 draws, 1.65 M tris, 74 programs | `shots/gpu-passes-summary.txt` |
| GPU, AMD Raphael iGPU (low tier, DPR 1) | 68–76 ms/frame (historical, v1.4.0) | claudeville-prettier INTEGRATION-NOTES |
| Main thread, fast desktop | 3.1 ms/frame average; independent maxima 92.7 total, 48.9 render, 27.8 fleet, 12.3 civic | `shots/perf-cpu-day.json` |
| Grade LUT refill | 19.6 ms main thread; every ~4 s at dawn/dusk, 4 Hz during weather easing | O2-F2 |
| First complete fleet (dev, warm) | 3.1 s navigation-relative | B01 |
| Emblem atlas | ~120 MB GPU + canvas; 52 MB re-upload per change | O5-F5 |
| Island transport | 2.45 MB compressed | B24 |
| Night hierarchy | chrome ~90 % of the brightest pixels, fire ~1 % (O10 spike); Ethereum flag 2.5× the tower | O8-F1, O6-F1, O10 |
| Day hierarchy | 85 % of the sky/sea band out-values the lit tower; 55–64 bright specks/10k px in the Roads | O1-F2/F3, O10 |
| Loudness | calm −28.6 LUFS; DEWS Danger −12.4 LUFS (+16 LU), peaks −0.6 dBFS; music 13 LU under the sea | O9-F1/F3 |
| UI type | 26 font sizes, ~50 colour literals, labels down to 9.5 px | O8-F2 |

### The gaps by pillar

| Pillar | Biggest gaps | Fixed in |
|---|---|---|
| **informative** | Truth defects; storm mast taught wrongly; unknown ≠ healthy; invented history dates; incomplete legend; no depeg, reserves or liquidity detail; no "since you were here" | v1.5.0, v1.6.0, v1.8.0 |
| **prettier** | Pharos not the top value; map-pin water; mainland wall; basin ignores the hour; triangle-mosaic grass; the Pharos reads as an office tower | v1.6.0, v1.7.0 |
| **enchanting** | Arrival double exposure; shadow pop; moments off-frame; lamp wave invisible; night sky invisible; storm audio a wall; music masked | v1.7.0, v1.8.0 |
| **all-devices** | Lite not light enough; tier transitions compile; governor blind spot; DPR ignored; portrait framing; gesture cancellation; soft keyboard over search | v1.5.0, v1.6.0, v1.7.0 |
| **professional** | Failure recovery; share links; postcard provenance; WCAG 2.2 AA; type system; visible state; false-green QA; dormant GA | v1.5.0, v1.6.0, v1.8.0 |

---

## 2. Principles

**Visual north star** (O10, proven live): *a lit miniature with one hero, one air and one hour.*

- **One hero.** The Pharos holds the top value at every hour: ≤ 25 % of the sky/sea band at or above its lit
  face by day; at night the fire owns the brightest pixels.
- **One air.** One far land and one haze.
- **Print, not pins.** A mark's contrast follows its size on screen.
- **The hour colours the water.**
- **Water reads as water.**
- **Truth owns its grammar.** Pale and milky means stale, and only stale.
- **Rituals, not effects.** Nothing pops.

Measurable checks: `reports/O10-visual-direction.md` §1. Runtime spike replay: `mockups/O10-spike-harness.js`.

**The rules**

1. **Truth before beauty.** One shared state vocabulary everywhere: current / stale / unavailable / partial /
   not rated, with the exact sentences in `round2/A-trust-repair.md`.
2. **Subtract before adding.** The biggest visible wins remove clutter, and they also save GPU time.
3. **Headroom before richness.** Additive effects ship only inside measured budgets (§7).
4. **Never silently re-map a signal.**
   - Promise amendments are recorded in the release notes: coins as print amends v1.4.1; the audible surf
     now follows the sea state.
   - Fog stays stale-only.
   - Decoration follows data only where the legend says so.
5. **One owner per hot file.**
   - The renderer integrator (R) owns `ocean-material.ts`, `world/materials.ts`, `engine/post.ts` and `sky/*`.
   - The fleet engineer (F) owns `fleet-material.ts`.
   - The enabler track extracts the shader modules first.
6. **Real evidence.**
   - Looks and frame times are judged only through `scripts/harbour/shot.mjs` on this machine's real GPU.
   - Playwright never judges art or speed.
7. **Calm budget.**
   - At most one staged moment per 3 minutes.
   - At most one rare decorative cue per 20 minutes.
   - Nothing automatic under reduced motion; no idle tours.

---

## 3. Settled decisions (operator rulings, 2026-11-08)

These override anything older in this folder.

| Topic | Ruling |
|---|---|
| Autonomy | **Fully autonomous.** An Opus art-director agent signs off visuals against the O10 metrics and sound against the loudness gates; the operator reviews afterwards. |
| Shipping | **Agents merge and release** through the protected PR path (0 approvals required today), then `release.yml` publishes. |
| Releases and PRs | **Consolidate:** 4 versions, one PR each (`release/vX.Y.Z` carrying both the work and the changelog), to save CI time. |
| Mac / D14 performance gate | **None for this pass.** No Apple device is available; the D14 row is recorded as SKIP. This supersedes D14 for this pass. |
| Other devices | **None:** every secondary matrix row is SKIP. |
| Weak-GPU evidence | **RTX-only + CPU throttling.** Absolute iGPU and Apple figures are estimates; acceptance uses relative reductions measured on the RTX (§7). |
| Incidents | **Fix forward; no rollback.** Brief downtime is acceptable but should be avoided: validate thoroughly before merging. |
| Reporting | **Report only at the end.** Judgment calls are logged, not asked. |
| Fleet | Per version: up to 30 Sol (gpt-6.1-sol) and 10 Opus agents. |
| Phones | **Better welcome only.** Keep the 720×600 gate; a beautiful field guide plus a "send to a larger screen" handoff. |
| Coin marks | **Adopt the print law (E04)**, shipped with the hero value lock. |
| Night UI | **Night bridge palette** (S-52-style dark chrome after dusk). |
| Pharos v2 | **Build it, gated** on the art director's before/after frames (heart, overview, golden hour, night). |
| Day value | **Full-strength target:** ≤ 25 % of the band at or above the lit tower; slightly deeper noon sea accepted. |
| Optional extras | **All four:** rescue resolution, twilight and night-sky richness, harbour mirror (High), supersampling on 1× screens. Each is budget-gated (§7). |
| Sound | **Adopt all:** calm ≈ −26 LUFS, storms ≤ +6 LU over calm with a limiter, music ≈ 6 LU under the sea, surf follows the sea state, composed first ten seconds, the Pharos voice. |
| New endpoints | **All three:** `/api/depeg-events`, `/api/stablecoin-reserves/:id`, `/api/dex-liquidity`. On demand in the coin panel only, with validated parameters, never below the gate. |
| Analytics | **Remove the dormant GA; no RUM.** Only bounded error diagnostics remain. |
| Index name | **"Pharos Stability Index"** everywhere; fix `src/fallback-links.ts:2` and `index.html:85`. |
| Everything else | **All recommendations in `DECISIONS.md` are adopted.** "Decide on A/B" items are decided by the art director on real-GPU frames and logged. |

**Operator to-dos** (non-blocking; agents cannot do these):
- Set up the two UptimeRobot monitors exactly as `docs/pharosville/OPERATIONS.md` § External monitoring
  describes.
- Confirm that the Cloudflare dashboard injects no analytics.

---

## 4. Workstreams

| Track | Scope | Spec |
|---|---|---|
| **A — Trust repair** | projection contract, freshness/outage truth, honest flows, coverage-aware empty states, neutral stale cues, local provenance, storm mast, histories, NR, shipyard, Day book/Watch claims, arrival integrity, postcard receipt, visual key | `round2/A-trust-repair.md` (20 items → 16 bundles) |
| **B — Smooth everywhere** | measurement, tier correctness, governor, lifecycle/DPR, Lite (world, water, shadows, post, particles), CPU hitch removal, loading/bytes, rescue resolution | `round2/B-performance-program.md` (25 → 31) |
| **C — Resilience, QA & ops** | failure contract with copy, recovery state machine, QA gates, diagnostics; RUM dropped by ruling | `round2/C-resilience-qa.md` (21 → 31) |
| **D — Experience** | overlay geometry, search, shortcuts, focus, controls sheet, optional guide, charts as tables, gestures, zoom/picking/framing, stillness, Watch, panel IA, ledger, deep links, postcard, welcome, Day book, return digest, daily report, typography | `round2/D-experience.md` (26 → 31) |
| **E — The look** | E01–E29, E35 (visual) | `round2/E-visual-program.md`; spikes in `reports/O10-visual-direction.md` |
| **F — Sound** | E30–E34, S21 robustness, C10 interruption recovery | `round2/E-visual-program.md`, `reports/O9-audio.md`, `reports/S21-*` |
| **G — Fleet choreography** | tow teleport, momentum through reroutes, D10 effective dock time, true footprints, unsafe-route rejection, reduced-motion voyages, tab-return fade, transit copy, one display wind | `reports/S16-*` |
| **H — Enablers** | explicit shader-patch failures, one feature signature (= B02), typed service map, extracted shader modules, compile matrix | `reports/S17-*` |
| **I — New readings** | depeg history, reserves with provenance, DEX liquidity: allowlist + projection + panel sections + tests | `reports/S01-*` (I13–I15) |

---

## 5. Release plan

Each version is built on one integration branch, `release/vX.Y.Z`. Lanes work in worktrees on
`ultimate/vX.Y.Z/<lane>` branches. The integrator merges them in the order below and runs the full local
gates (`EXECUTION.md` §4), then pushes **one PR** that also carries the changelog. Fix-forward patches
(vX.Y.1) are allowed and are also consolidated.

### v1.5.0 — "True Bearing" (truth, critical fixes, engine correctness, recovery)

**Truth (A)**
- A01 projection evidence + cache epoch;
- A02 freshness evidence (also C07 source evidence);
- A08 honest flows;
- A04 publication guard (also C06);
- A03 cache lifetime;
- A06 coverage-aware empty states;
- A05 neutral stale cues (also C07 neutral targets);
- A07 local provenance;
- A09 / A12 / A11 mast, Registry and attribution copy;
- A18 banked Mint silent.

**Picture truth**
- **E01 rising-front water truth** (critical). One PR spec agreed by O3 and O4: `hbCloudShadow` returns its
  coverage term, and the ocean uses it directly, so CALM is unchanged. Clamp, slate tint under storm decks,
  unit test.
- E04 atlas column-0 index fix.
- E07 shimmer gate.
- B07 defined GLSL math (= C04).

**Sound truth:** E30 audible truth — surf follows the sea state; Ledger "By ear" section.

**Choreography (G)**
- S16-I1 tow survives refreshes;
- S16-F12 transit copy;
- S16-I11 one display wind;
- S16-I4 momentum through reroutes;
- S16-I3 D10 effective dock time;
- S16-I6 reject unsafe routes.

**Engine (B, H)**
- B01 measurement and complete byte ledger, with the shared capture-analysis helper;
- B02 feature identity (= S17-I8);
- B03 complete tier preparation;
- B04 governor;
- B05 lifecycle/DPR;
- B06 unused sea mask;
- B13 one preparation allowance incl. bakes;
- **E06 = B20 bounded LUT slicing;**
- S17-I1 explicit shader-patch failures;
- S17-I3 typed service map;
- S17-I10 extracted shader modules;
- C bundle 24 compile matrix (= S17-I7).

**Recovery (C):** C bundles 1–3, 5–8, 10, 13–15:
- kit failure terminal (= B21a);
- bad rows;
- shader-failure latch;
- cancellation (= B21b);
- float targets/readback;
- frame exceptions;
- context-loss remount;
- worker watchdog;
- retry/wake;
- health/log UI;
- overlay containment.

**QA and ops (C)**
- C bundle 19 scenario replay seam;
- C bundle 20 hardware startup assertions;
- C bundle 23 contact sheets;
- C bundles 17–18 diagnostics minimisation and delivery queue;
- **C bundle 29 remove the dormant GA** (code, CSP and docs);
- fix the "Peg Stability Index" links.

**Acceptance**
- **Truth:**
  - projector-fed tests pass end to end;
  - the same state sentences appear in hover, panel, ledger and postcard;
  - E's F capture set shows rising and clearing fronts below stale fog, and stale fog distinct day and night;
  - all five mast bands render with a mismatched alert count.
- **Engine:**
  - B04 governor traces pass;
  - low↔medium compiles no new world program after publication;
  - every row of C's failure table shows its copy and recovers;
  - no application long task above 50 ms after the first fleet in a 10-minute live-clock session (RTX, and
    CPU ×4);
  - D10 effective dock share within ±1 point.
- **Picture:** no other visual change (art director compares the contact sheet with the baseline).

### v1.6.0 — "Clear Air" (the look + experience + design system)

**The look (E, R/F lanes)**
- E02 retire the mainland mesh, then D12 portrait composition.
- **E03 hero value lock**, three parts:
  - sky band and haze at full strength, plus a +6 % limewash on the Pharos;
  - flags at the town's scale, crest flags dimmed about twice O6's amount;
  - the night bridge UI palette.
- **E04 coins as print** (same release as E03), with buoys receding.
- E08 overview focus.
- E09 lamp economy.
- E10 readable stale night (neutral sea-smoke hue, ~×1.4 night lift).
- E11 hour-coherent water (derived hue + twilight chroma cut).
- E12 feathered wakes.
- E13 glint coverage.
- E14 one swell phase.
- E27 calm rigging and ropes.

**Experience (D, U lane)**
- D bundles 1–17:
  - overlay geometry, search cancel, detail-failure boundary;
  - optional shortcuts, focus and targets, postcard lifecycle, gesture cancellation;
  - **the controls/help sheet**;
  - PSI inspection, ledger read/locate/return, measured framing;
  - wheel/keyboard/fling, ground-anchored zoom, visible picking;
  - stillness, Watch, tag bounds.
- D21 panel order and copy (D15 IA and copy guide).
- D22 ledger filters and provenance.
- D23 optional five-stop guide.
- D24 Day book interaction.
- D25 calendar + typography.
- D31 portrait composition (with E02).
- **Design system:**
  - O8-I2 Pilot's Chart tokens (8-step type scale, 4 px spacing, every colour a token);
  - O8-I7 visible state;
  - O8-I9 dated sparkline;
  - D26 controls budget;
  - toolbar wording with an overflow (U3).

**Truth (A):** A10 timestamped histories, A13 admission dossier, A14/A15 session observation language,
A16/A17 arrival integrity, A20 the finished visual key.

**QA (C):** C bundle 21 axe + keyboard on the real overlay states.

**Acceptance**
- **Art director** (E sets P, H/N, C; full-frame preference):
  - day tower ≥ background + 0.05 L (≤ 25 % of the band at or above it);
  - night crest ≤ 0.7× the tower body;
  - the fire's share of the night's brightest pixels clearly above the chrome's;
  - Roads specks at least halved, with every coin findable by hover and search;
  - no mainland wall at 834×1112 or 1150 m.
- **Accessibility:** WCAG 2.2 AA journeys checked in jsdom, Playwright DOM, axe and keyboard scripts
  (assistive-tech hardware checks are SKIP).
- **CSS:** cap raised by at most +2 KiB raw, with offsetting deletions.
- **GPU:** flat or lower per pass at matched views on the RTX.

### v1.7.0 — "Lamplighter" (Lite, still shadows, hitches, arrival, assets, sound)

**Performance (B, R/F/G lanes)**
- Lite shading:
  - B08 world/AO, B09 water, B10 shadows;
  - B11 half-source bloom, 1024² wake and pool targets;
  - B12 zero-alpha smoke.
- **E05 still shadows**, using a caster registry and contact-quad crossfade, which also ends the first-zoom
  pop.
- Main-thread and arrival work:
  - B14 fleet staging, B15 worker paths (= S16-I10), B16 wreck capacity;
  - B17 atlas staging, B18 civic geometry, B19 hull rejection + collision math;
  - B22 request contention, B23 async ground readback;
  - emblem memory: 96 px slots + 256 px hero tiles.
- **B25 rescue resolution** (0.8/0.67/0.5 rungs, 4 MP ceiling).

**Arrival and moments**
- E28 seamless arrival (feathered, registered) with **night key art**: a night poster variant chosen before
  first paint by a Pages Function using `cf.timezone`, unless a no-flash bootstrap method is proven.
- E29 arrival beat (the PSI sweep phase is never reset).
- E26 the lamp round.
- O7-I4 moments you notice.
- Watch visits landmarks and gets a touch button.

**Hero assets (Opus artist A + R)**
- E15 baked AO;
- **E18 Pharos v2 (gated)**;
- E19 pine silhouettes;
- E20 warm built land + B24 island −20–30 % in one island rebuild;
- E16 continuous terrain dryness;
- E17 Mediterranean ground year.

**Sound (S):** E31 calm loudness, E32 on-ramp, E33 the Pharos voice, E34 audible music, S21 fixes, C10
interruption recovery.

**Choreography (G):** S16-I2 true footprints, S16-I9 truthful reduced-motion voyages, S16-I8 tab-return fade.

**QA (C):** C bundle 22 soak assertions; C bundle 25 steady gate and receipts (RTX rows; device rows SKIP).

**Acceptance**
- **Main thread (RTX + CPU ×4):** p95 ≤ 8 ms; zero long tasks after the first fleet.
- **Lite (RTX):** low-tier GPU time ≥ 30 % lower than the v1.6.0 baseline at a fill-rate stress view
  (2560×1600 @2, low tier, uncapped).
- **Shadows:** `E-shadow-641/639` and zoom sweeps show no whole-frame pop.
- **Arrival:** filmstrips (day, night, portrait; `--human`) show no hard edges, double exposure or pops.
- **Sound:** the offline mix gate passes — calm ≈ −26 LUFS, storms ≤ calm + 6 LU, true peak ≤ −1 dBTP, music
  6 ± 2 LU under.
- **Pharos v2:** art-director approval, or the current tower stays.

### v1.8.0 — "Golden Hour" (sharing, return visits, welcome, new readings, earned extras)

**Sharing and returning (D, A)**
- D18/D19 durable subject links, Copy link, Back/Forward;
- A19 postcard receipt + touch postcard (S20-I7);
- reciprocal pharos.watch links (S20-I14);
- D26/D23 local return digest;
- D27/D24 daily/weekly harbour report;
- S25-I3 walk the dated PSI record.

**Welcome:** D20 static welcome + O8-I5 harbour-voice welcome pages + S08-I1/I2 handoff (gate unchanged).

**New readings (I)**
- `/api/depeg-events` (bounded peg-event timeline);
- `/api/stablecoin-reserves/:id` (backing composition with provenance and estimate labels);
- `/api/dex-liquidity` (observed TVL, score, evidence class).
- Each one: allowlist, projection, validated parameters, on-demand fetch in the coin panel, DOM-only (no new
  world cue), and projector-fed tests.

**Earned extras (E, budget-gated)**
- E21 backlit crowns;
- E22 twilight structure;
- E23 legible night sky;
- E24 storm structure + safe strikes;
- E25 precipitation depth;
- the decorative score (≤ 1 rare cue per 20 minutes);
- **E35 harbour mirror** (High only; O3's temporal design with a CSS-pixel-sized target);
- **O2-I3 supersampling** on 1× screens with discrete GPUs (High only).

**Ops (C):** C bundle 26 proxy outcomes; C bundle 28 KV readback (if `CLIENT_ERROR_KV` is bound); runbook
updates.

**Acceptance**
- **Links:** a copied link reopens the same subject; Back/Forward walks selections.
- **Postcards:** pixels and caption describe one revision.
- **New readings:** pass the projection, validation, stale and unavailable tests.
- **Blocked viewports:** make no world requests.
- **Extras:** each within its budget (§7), approved by the art director on H/N/F sets. PSI band order and
  stale fog remain distinct.

### Out of scope for this pass

- Phone runtime;
- server-rendered phone digest;
- RUM;
- seven-day replay and year-ago comparisons (need upstream history);
- reader DTO after unmount (D25);
- PWA, offline and embeds;
- dynamic OG;
- ledger paging, typo search and comparison;
- WebGPU, render worker, SSAO, TAA and MSAA;
- spatial batching (unless residual geometry cost is measured).

---

## 6. If only fifteen things ship

1. Projection and truth core — A01, A02, A05, A06, A08, A09 (v1.5.0).
2. Rising-front water truth — E01 (v1.5.0); readable stale night — E10 (v1.6.0).
3. Coins as print — E04 index fix (v1.5.0), print law (v1.6.0).
4. Hero value lock — E03 (v1.6.0).
5. Retire the mainland + portrait framing — E02, D12 (v1.6.0).
6. Tier correctness and bounded grading — B02–B05, B13, E06 (v1.5.0).
7. Failure recovery — C01–C03, C05, C09 (v1.5.0).
8. Sound truth — E30 (v1.5.0).
9. Accessibility and input core — D01–D04, D08, D09 (v1.6.0).
10. Controls sheet + optional reading guide — D05, D06 (v1.6.0).
11. Water by the hour, feathered wakes, calm glints — E11–E13 (v1.6.0).
12. Lite + still shadows — B08–B12, E05 (v1.7.0).
13. Seamless arrival + arrival beat — E28, E29 (v1.7.0).
14. Share links + postcard receipt — D18, D19, A19 (v1.8.0).
15. Calm loudness + the Pharos voice — E31, E33 (v1.7.0).

---

## 7. Performance budget and evidence (RTX-only, by ruling)

| Direction | Item | Estimated effect |
|---|---|---|
| saves | E05 still shadows | up to −17.6 % GPU at the RTX landing view (upper bound); nothing claimed in close or transition views |
| saves | B08–B12 Lite | −30–50 % of a weak-GPU frame (hypothesis); measured as relative reduction on the RTX |
| saves | E07 shimmer gate | one far-day full-screen pass |
| saves | E02 mainland | −1–2 draws, −3,966 tris |
| saves | E06 = B20 | 19.6 ms monolithic LUT bake → 2 ms slices |
| saves | B14–B17 | −5–20 ms install bursts; −2–15 ms path bursts |
| adds | E04 print law | +~20 FS ALU on print fragments; fewer buoy pixels |
| adds | E11 / E13 / E08 | +8 / +5 / +3 FS ALU on water pixels |
| adds | E05 contact quads | ≤ 1 instanced draw |
| adds, M+ | E21 / E22 / E23 | ~15 / ~12 / ~8 FS ALU on affected pixels |
| adds, High | E35 mirror; O2-I3 supersampling | mirror ≈ 0.25–0.4 ms iGPU-class (estimate) plus daytime bandwidth; supersampling up to 4× pixels |
| adds | E18 Pharos v2 | +~14k tris, one draw |

**Evidence rules** (no Mac gate, no iGPU profile; by ruling)
- **Steady frames:** measure on this machine with `npm run preview` (`shot.mjs`) at matched views, with and
  without `?prof=gpu`, with `--uncapped`, plus a fill-rate stress view (2560×1600 @2) and `--cpu-throttle 4`.
- **Low tier:** must never regress.
- **v1.6.0:** GPU-neutral or better per pass.
- **v1.8.0 extras:** M+ additions together add ≤ 10 % of the low-tier frame at the stress view; High-only
  additions ≤ 20 %, measured on the RTX. These relative ceilings stand in for the original 0.5 ms / 1 ms iGPU
  allowances.
- **Estimates:** absolute iGPU and Apple Silicon numbers are reported only as estimates. Raphael-class
  projections stay as in B: roughly 34–53 ms after Lite, near-interactive only with rescue resolution.

---

## 8. Gates and process

- **Per lane PR (into the integration branch):**
  - focused tests named in the spec;
  - `npm run validate:changed`;
  - a truth-reviewer agent checks every data-facing change against D11 (source field, threshold, the same
    words in hover, panel and ledger, unit test, neutral pose when stale or unavailable).
- **Per visual change:** before/after frames via `npm run preview` (shared headless real-GPU Chrome only);
  the art director judges against the O10 metrics and full-frame preference, and logs a verdict.
- **Per version, before the single PR:**
  - `npm run typecheck`, `npm test`, `npm run lint`;
  - `npm run build`, `npm run check:bundle-size`, `check:runtime-media`, `check:harbour-contracts`;
  - `npm run validate:docs`;
  - `npm run validate:release`;
  - the contact sheet (C16) and filmstrips;
  - the RTX performance evidence (§7);
  - `npm run check:release-contract`.
- **After merge:**
  - the deploy and `release.yml` run;
  - `npm run check:github-releases` and `smoke:live`;
  - any regression is **fixed forward** in a consolidated patch release (no rollback).
- **Release notes:** each version's CHANGELOG lists visitor-facing changes and every promise amendment
  (coins as print, surf source, night palette, GA removal).

---

## 9. Deliberately not doing

| Idea | Why not |
|---|---|
| Mac/D14 and device-matrix gates | Operator ruling: no devices for this pass (recorded SKIP) |
| RUM | Operator ruling: remove GA, no visitor telemetry |
| Rollback on incident | Operator ruling: fix forward |
| WebGPU, render worker | Renderer decision locked; neither cuts GPU work here |
| SSAO, PCSS, MRT, TAA, MSAA | iGPU cost or emblem ghosting; supersampling and hairlines are the AA plan |
| Worker-owned playback, spatial batching, packed attributes | Measure residual cost first |
| Half-resolution beam, KTX2 atlases | Low value now; try the 96/256 px atlas first |
| Phone runtime, server digest, video preview | Operator ruling: better welcome only |
| Replay, year comparisons, reader DTO, PWA, offline, embeds, dynamic OG | Need upstream contracts or product decisions |
| New world encodings for new data | Depth goes in the DOM (panels, ledger, report) |

---

## 10. Where everything lives

- `EXECUTION.md` — the autonomous execution runbook (roles, branches, gates, logs, final report).
- `DECISIONS.md` — the settled decision sheet (89 questions + operator rulings).
- `BRIEF.md`, `missions/`, `JOBS.md`, `report.schema.json` — how the research ran.
- `reports/` — 35 lane reports, plus the indexes `_ideas.md`, `_findings.md`, `_picks.md`, `_decisions.md`.
- `round2/` — workstream specs A–E with verified anchors, exact copy, tests and bundles.
- `shots/` — real-GPU evidence; git-ignored. Key sheets: `O10-contact.jpg`, `O8-mockup-board-v2.png`,
  `contact-sheet-1.jpg`.
- `mockups/` — O8 UI mockups and tokens, the O10 spike harness, O5 print mocks.
- `tools/` — `collect.mjs` and `dom-shot.mjs`.
