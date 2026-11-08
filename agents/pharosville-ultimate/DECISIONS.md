# Operator decision sheet — PharosVille Ultimate (SETTLED 2026-11-08)

**Status: settled.**
- The operator answered the governing questions on 2026-11-08 and adopted **every remaining recommendation
  below**.
- Where a row says "decide on A/B", the art-director agent decides on real-GPU frames and logs the verdict
  (`EXECUTION.md` §7).
- The rulings in the table below override any row that conflicts; superseded rows are marked **SUPERSEDED**.

| Ruling | Answer |
|---|---|
| Autonomy | Fully autonomous. An Opus art director signs off visuals and sound; the operator reviews afterwards. |
| Shipping | Agents merge and release via the protected PR path and `release.yml`. |
| Releases and PRs | Consolidated: v1.5.0–v1.8.0, one PR per version. |
| Mac / D14 gate | None this pass (recorded SKIP). |
| Other devices | None (SKIP). |
| Weak-GPU evidence | RTX-only plus CPU throttling; absolute iGPU/Apple figures are estimates. |
| Incidents | Fix forward, no rollback; brief downtime acceptable but avoided. |
| Reporting | Only at the end; judgment calls logged. |
| Fleet | ≤ 30 Sol + ≤ 10 Opus agents per version. |
| Phones | Better welcome only (S1 yes; S2–S4 no). |
| Coin marks | Print law adopted (V1). |
| Night UI | Bridge palette (U1). |
| Pharos v2 | Build, gated on the art director's frames (V11). |
| Day value | Full-strength target, ≤ 25 % band share (V6). |
| Extras | All four: rescue resolution (P1), twilight/night-sky richness, harbour mirror High (V14), supersampling (V21). |
| Sound | All targets adopted (A1, A2, T13). |
| Endpoints | All three: depeg-events (S6), reserves + DEX liquidity (S7, now **yes**). |
| Analytics | Remove GA; **no RUM** (O2 yes; O3/O4 **superseded**). |
| Index name | "Pharos Stability Index" (T12). |

Source ids point into `reports/` and `round2/`. "Rec." is the adopted answer unless a ruling above supersedes it.

## 1. Strategy and scope

| # | Question | Sources | Rec. |
|---|---|---|---|
| S1 | Phones. Should the gate stay, with the static welcome made into a complete field guide and a "send to a larger screen" handoff? | S08-I1/I2, O8-I5, D20 | **Yes.** Keep both sorted 720×600 checks; never gate on orientation. |
| S2 | Phones. Should blocked visitors get a dated, server-rendered market digest or daily postcard? This amends "no world data below the gate". | S08-I9/I10 | **Defer.** Revisit with S4. |
| S3 | Phones. Should a prerecorded video preview be offered? | S08-I12 | **No.** Production and battery cost; static key art suffices. |
| S4 | Phones. Should a 4–8-week phone-runtime experiment be funded, with a mobile frame target and a disclosed fleet reduction? | S08-I11 | **Revisit after Wave 4** measures Lite plus rescue resolution. |
| S5 | Should the handoff include a QR code at launch? | S08 | **Copy link and Save first;** add QR if usage shows demand. |
| S6 | Should a bounded, on-demand `/api/depeg-events` be added for a selected coin's peg history? | S01-I13 | **Yes, in Wave 6.** Validated id/limit; never below the gate. |
| S7 | Should `/api/dex-liquidity` and `/api/stablecoin-reserves/:id` be allowlisted for on-demand panels? | S01-I14/I15 | **SUPERSEDED → yes, in v1.8.0** (operator ruling). |
| S8 | Should an upstream history contract be funded for a seven-day harbour replay or year-ago comparisons? | S25-I4/I11 | **Defer.** Improve the existing PSI history first (S25-I3). |
| S9 | Should a live death source power the tow-to-Wreck-Cove ceremony? It is dev-only today. | O7-F4 | **Defer** until an endpoint exists. Say in the Wreck Cove panel that deaths come from the bundled record. |
| S10 | Should a WebGPU investigation or a render worker be pursued? | S22, B E14 | **No.** The renderer decision stays locked; neither cuts GPU work here. |
| S11 | `n8ao` is unused. Should it be removed, or kept for a High-only AO trial? | S22 | **Remove the dependency.** Bake AO into the GLBs instead (O6-I5). |

## 2. Truth and semantics

| # | Question | Sources | Rec. |
|---|---|---|---|
| T1 | Sea-state denominator: keep off-peg share over **all** tracked live supply, or renormalize to covered supply? | A, D-A1 | **Keep it,** with coverage copy (A06). Renormalizing would change thresholds. |
| T2 | Should per-source freshness tolerances be tightened now? Shared ratios are 8× fresh and 12× degraded; fleet stale at 2 h, PSI at 12 d. | A D-A2, S15 | **Not now.** Run a producer-cadence review first; A02/A03 fix the invented freshness. |
| T3 | What maximum age may an edge snapshot have for immediate first-fleet delivery? | S15 | **Defer** with the edge-revalidation idea (C exclusions). |
| T4 | Stale-fog colour: amber-leaning (keyed to the stale dot) or neutral grey? Either way it is fixed across hours. | O4-I7, O1-I7 | **Decide on A/B frames.** Lean towards a low-chroma amber-grey, so "stale" has one visual language. |
| T5 | Life thins in storms and dolphins appear only in calm, so decorative life responds to DEWS. Declare this, or decouple it? | O7 | **Declare in the Weather legend:** "In rough weather the town and its animals take shelter." |
| T6 | Paint fewer clouds on calm days, so Calm, Watch and Alert are countable? This re-tunes an existing cue. | O4-I9 | **Adopt,** with a CHANGELOG line. |
| T7 | May a lit PSI fire glow through DEWS gloom by day? Visibility only, mapping unchanged. | O1-I13 | **Adopt.** The beam is the primary signal. |
| T8 | Should the launch slide wait for the confirming poll, so slide, bunting, bell and Day book land together? | O7 (D-4) | **Adopt.** The hover tag says "awaiting confirmation". |
| T9 | Should the first-visit invitation stay automatic? (D11 exception) | S04-I4, S26 | **Keep one quiet line** that stays until dismissed and can be replayed. The reading guide (D06) never starts by itself. |
| T10 | Should staged-moment announcements to assistive tech be opt-in? | S05 | **Announce politely** only while the Day book is open, or after opting in. |
| T11 | Should a dated DOM reader survive unmount after zoom or resize? | S05, D25 | **Defer.** D25 bundles 28–30 need approval. |
| T12 | Canonical name of the index: "Pharos Stability Index" (app, poster, postcard) or "Peg Stability Index" (`src/fallback-links.ts:2`, `index.html:85`)? | orchestrator | **Settled: "Pharos Stability Index" everywhere;** fix the two welcome links. |
| T13 | Should the audible surf follow the off-peg sea state, as the picture does? | O9-I7 | **Adopt.** This is a truth fix. |
| T14 | Hide the UTC catch-up on tab return with a ≤250 ms fleet fade? | S16-I8 | **Adopt.** D10 is preserved. |

## 3. Visual direction

| # | Question | Sources | Rec. |
|---|---|---|---|
| V1 | Coins as print: soft printing below ~16–30 px, full print on hover, select and search. This amends v1.4.1. | O1-I2, O5-I2/I1 | **Adopt.** |
| V2 | When a resting hull's sail or bundle shows her print, should her burgee fly plain colours? | O5-I4 | **Adopt.** |
| V3 | Should flags rejoin the aerial tint and pigment cap at 0.6× the cap? Hovered and selected stay exempt. | O5-I5 | **Adopt.** |
| V4 | Should the ~115 generated monogram discs become sail lettering? | O5-I6 | **Adopt.** |
| V5 | Emblem memory: 96 px slots plus 256 px hero tiles at ≥$1B, or a 64 px atlas on constrained devices? | O5-I9, S12, B E09 | **Trial 96/256 with a close-zoom review.** Saves ~55–80 MB; KTX2 later. |
| V6 | Hero value lock: darker sky band and haze by day (calibrated at about twice O1's proposal, plus a +6 % Pharos limewash, per the O10 spike); Ethereum flag 1.65× → ~1.2× and flag tops ≤24 m; crest flags at night ≤0.7× the tower. | O1-I1, O6-I1, O2-I5, O10-I1 | **Adopt;** calibrate on frames to a band share of ≤25 %. |
| V7 | Retire the 3D mainland mesh? | O1-I3, O4-I2 | **Retire.** |
| V8 | May the squarer-screen overview crop the east and west lobes to frame the island's height? | O1-I12, D12 | **Adopt** for portrait and tablet. |
| V9 | Add new hour keys (3.0 quiet watch, 7.5 silver morning, 14.5 warm afternoon) and a per-hour sea tint? | O1-I5, O3-I2 | **Derive the basin's hour tint from the existing ambient and sun hue (E11)** rather than adding manual keys; add the three keys only if A/B frames still need them. |
| V10 | May decorative buoys dim, shrink beyond 300 m and hide below 2.5 px? | O1-I4 | **Adopt.** |
| V11 | Pharos v2: re-proportion within the envelope and drop the pilaster grid. | O6-I4 | **Adopt,** gated on before/after frames. |
| V12 | Mediterranean ground calendar: gold June–October, green after the first rains. This reverses v1.1.0's lush summer. | O6-I3 | **Decide on A/B** of July and January frames. Lean adopt. |
| V13 | Add 20–30 date palms as an Egyptian accent? | O6-I12 | **Not now.** Keep the species list. |
| V14 | Harbour mirror on High/Medium only, at a painterly 25–35 % strength in the calm harbour? | O3-I1 | **High-only experiment, default off** until A/B frames and the hardware budget are accepted (E35). Daytime bandwidth is charged honestly; strength is set by A/B. |
| V15 | Once the mirror lays wall reflections, should the basin's quay lift move to natural shores and mid-basin? | O3 | **Decide on A/B.** |
| V16 | Aground hulls: break the closed white rings into surf and lace? | O3-I5 | **Decide on A/B.** Aground must stay legible. |
| V17 | Quieter wakes: only 2–3 near crests white? | O3-I3 | **Adopt.** It also separates wakes from the route line. |
| V18 | Sunsets: pull the sun disc to the frame edge for its last ~20 min, or rely on the twilight wedge? | O4, O4-I3 | **Twilight wedge.** No fake sun positions. |
| V19 | Mirrored sun path for northern visitors? | O4-F13 | **Keep the art-directed light;** document it. |
| V20 | Real moon hours: accept moonless nights? | O4-I12 | **Adopt.** Decorative calendar truth. |
| V21 | Supersample above DPR on 1× screens with a discrete GPU? Up to ~250 MB at 3200×2000. | O2-I3 | **High-only experiment in Wave 7,** with headroom checks. |
| V22 | Still shadows: baked foot blobs for townsfolk at landing and overview; the sun's shadow edge steps ≤1 px about every 27 s. | O2-I1 | **Accept,** in exchange for ~18 % GPU. |
| V23 | Replace the NaN scrub pass with in-shader guards? | O2-I9 | **Accept** after tests. |
| V24 | Anti-aliasing plan: no TAA or MSAA now; supersampling rungs plus rigging hairlines instead? | O2, O7 | **Adopt.** |
| V25 | Arrival poster: refreshed golden key art with a CSS dusk dip (S), or hour-matched posters via Pages middleware (M)? | O7-I1 | **Ship a night key art variant.** The O10 spike showed the CSS night dip reads as a dirty veil. Pick the variant before first paint with a Pages Function using `cf.timezone` (one Function call per HTML request), unless a no-flash bootstrap method is proven. Keep E28's feathered, registered crossfade. |
| V26 | "Decorative score": ≤1 rare decorative cue per 20 min, plus doves on the hour; none under reduced motion. | O7 | **Adopt.** |
| V27 | Watch (W): may it visit landmarks and get a visible touch button? It never starts from idleness. | O7, D14 | **Adopt.** |

## 4. Interface and interaction

| # | Question | Sources | Rec. |
|---|---|---|---|
| U1 | Night bridge palette: an S-52-style dark chrome after dusk. | O8-I1 | **Adopt.** |
| U2 | Typography: one serif family, or add a data sans for tables? | O8 | **One serif family.** |
| U3 | Toolbar wording: title case with key caps, "chart" → "Names", and a ⋯ overflow holding Postcard, Watch and Legend? | O8-I6, D05 | **Adopt;** it folds into the controls sheet. |
| U4 | `lucide-react`: adopt 8 utility icons at 1.25 stroke, or remove the dependency? | O8 | **Adopt** for the controls sheet; otherwise remove. |
| U5 | Harbour CSS cap: +2 KiB raw / +0.6 KiB gzip for night tokens and controls? | O8, S23 | **Allow,** with offsetting dead-rule deletions recorded. |
| U6 | OG card: add a discreet wordmark lockup (no readings)? | O8 | **Adopt.** |
| U7 | OG entity cards per coin and chain, built at deploy time? This narrows `GITHUB_MEDIA.md:49`. | S20-I8/I9 | **Later** (Wave 6+). Generic card meanwhile; no dynamic rendering. |
| U8 | Trackpad: two-finger scroll pans and pinch zooms (Maps-like), or keep scroll-to-zoom? | S06-I2 | **Two-finger pan, pinch zoom;** a mouse wheel still zooms. |
| U9 | Single click: keep the cinematic focus, or reserve close focus for double-click? | S06-I15 | **Keep for now** (D exclusions); revisit with usage. |
| U10 | Watch under reduced motion: unavailable, or a manual sequence of static subjects? | S06, D14 | **Manual stepped sequence.** |
| U11 | Tablet sheet: compact and expanded states? | S07 | **Defer** until measured on devices. |
| U12 | Quality and motion preferences in the corner controls? | S11-I8 | **Not now** (B E07). Revisit after Wave 4. |
| U13 | Frame cap: 60 fps on 60/120 Hz and 72 on 144 Hz? | S11-I2, B E07 | **Yes,** after the thermal and pacing evidence (B01). |
| U14 | Native Share: requires changing both `web-share=()` policies. | S20-I7, D | **Copy and Save first;** Share later. |
| U15 | Subject URLs: sharing conveniences canonicalized to the homepage, or indexed pages? | S20-I10 | **Canonicalize to the homepage.** |
| U16 | Install as an app (PWA) with an offline poster, and live embeds for pharos.watch? | S20-I11–I13 | **Not now.** Use linked posters for pharos.watch. |

## 5. Sound

| # | Question | Sources | Rec. |
|---|---|---|---|
| A1 | Loudness: raise the calm mix to about −26 LUFS and cap every DEWS state at +6 LU over calm? | O9-I2 | **Adopt.** True peak ≤ −1 dBTP. |
| A2 | Music ~6 LU under the sea, instead of ~13 LU (masked)? | O9-I5 | **Adopt.** |
| A3 | Warm the lazy sound JS on speaker hover or focus? No AudioContext, no sound. | O9-I9e | **Adopt.** D13 is unchanged. |
| A4 | iPadOS audio session: `ambient` (obeys the silent switch, mixes with the visitor's music) or `playback`? | O9 | **Ambient,** and say so in the sound menu. |
| A5 | Life sounds (dolphin blows, goat bells, the hay cart): welcome texture or lore? | O9-I12 | **Adopt,** rare and only where the life is visible. |
| A6 | Evening gun: delete the dead cue? | O9 | **Delete.** |
| A7 | Quiet profile: soften transients only, or also mute bells, conches and the stale foghorn? | S21 | **Soften transients only;** the stale foghorn is a truth cue. |
| A8 | Quiet-hours schedule? | S21 | **No.** Volume plus the quiet profile suffice. |
| A9 | An opt-in "harbour at rest" sound postcard on the phone welcome? | O9-I14e | **Not now.** |

## 6. Performance, devices and release gates

| # | Question | Sources | Rec. |
|---|---|---|---|
| P1 | Sub-native rescue resolution: DPR 0.8/0.67/0.5 rungs and a 4 MP ceiling, with DOM and picking native. | B25, S10-I7, S11-I4 | **Adopt** after Lite is measured, with ship-identity and signal-legibility review. |
| P2 | Which hardware gates? | S10, S11, S14, S18, B | **SUPERSEDED:** no hardware gate this pass; RTX only, Apple/Windows/device rows SKIP. |
| P3 | Browser floor | S14 | **Latest two Safari/iPadOS majors, Firefox ESR, and Chromium from the last two years.** Document it in the README. |
| P4 | Should versioned releases block on a matching hardware receipt? | S18, C17 | **SUPERSEDED:** no hardware receipt is required; releases ship on RTX evidence. |
| P5 | 3G waiting budget and how late decoration may arrive | S12, B01 | **Provisional ≤30 s to the first fleet (cold 3G);** decoration after the first fleet frame. |
| P6 | Offline welcome / service worker? | S12 | **No.** Keep immutable HTTP caching. |
| P7 | Who reviews contact sheets and motion, and which secondary devices are checked regularly? | S18, C16 | **SUPERSEDED:** the art-director agent reviews; the operator reviews after the final report. |

## 7. Operations and privacy

| # | Question | Sources | Rec. |
|---|---|---|---|
| O1 | Independent uptime monitor: provider, alert owner, and a non-email recovery channel (ROADMAP item) | S19-I1, C27 | **Activate now.** The runbook exists in `OPERATIONS.md`. |
| O2 | Dormant Google Analytics: remove, or keep behind an explicit preference? Is anything injected via the Cloudflare dashboard? | S19, C20 | **Remove;** verify the dashboard config. |
| O3 | A same-origin `/api/rum` ingestion Worker (bypassing the read-only proxy)? | S19, C21 | **SUPERSEDED:** no RUM. |
| O4 | RUM policy: 5 % in-memory sampling, ≤3 records under 1 KiB each per visit, coarse cohorts, 30-day aggregate retention, cohorts ≥100, GPC/DNT honoured, with a notice | S19, C | **SUPERSEDED:** no RUM. |
| O5 | Is `CLIENT_ERROR_KV` bound in production? May the canary verify synthetic report persistence? | S19, C19 | **Verify the binding;** grant narrow canary access. |
