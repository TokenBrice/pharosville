# Audit `audit-coverage` — mechanical completeness and fidelity of `PLAN.md`

Auditor: G4PlanCoverage (final audit slice). 2026-10-19. Repo at HEAD `b71dd282` (`main`, tag v1.2.1) — matches
PLAN.md:3. No tracked file was modified. Inputs: `PLAN.md`, `p2/REGISTER.md`, `p2/review-load.md`,
`p2/review-runtime.md`, `p2/sp-{simrace,hitch,island,igpu,frag}.md`, `p1/load.md`, filesystem/`package.json` at HEAD.

Method: scripted extraction of every `NFS-nnn` (including slash-compressed lists) per PLAN section
(W0 104–123, W1 124–142, W2 143–200, gate 201–207, W3 208–223, Parked 224–236), diffed against NFS-001…120 and
against the per-entry tier columns of both reviews (review-load.md A.1–A.4/A.9, review-runtime.md A.5–A.8).
Every number in §1/§3 and the W1/W2/W3 gain text was traced to its cited report. Every path was `test -e`'d at HEAD.

---

## 1. Coverage of NFS-001…120

**Result: 118/120 placed. 2 IDs appear nowhere in PLAN.md (blockers). 4 IDs are intentionally split across two
tiers (source-sanctioned, not defects). No ID is unintentionally double-placed.**

Placement counts: W0 14 (incl. NFS-107 wired at the integrated gate and NFS-115 explicitly dropped, both sanctioned),
W1 20, W2 37, W3 18, Parked 27.

### C1 — BLOCKER — NFS-059 missing entirely
- **Where:** absent from all of PLAN.md (grep `059` → no match; no "matrixAutoUpdate"/"freeze static transforms" content either).
- **What is wrong:** NFS-059 "Freeze static local transforms (actor + scene)" (REGISTER.md A.5, line 97) received
  verdict **T1** in `review-runtime.md:38` ("MODIFY … [estimate] small local-recomposition saving; 0.2–0.4 ms is an
  upper hypothesis … T1") and is an honourable mention in REGISTER §F.1 (line 286). It is an actionable, none-visual
  entry with no tier, no lane, no parking — the fan-out in §7 would silently drop it.
- **Replacement:** extend the W1 Frame CPU row (PLAN.md:138) —
  `| Frame CPU | NFS-058, NFS-059, NFS-061, NFS-064, NFS-065, NFS-066, NFS-067 | Cache stationary-camera sky horizon geometry; freeze audited static local transforms (never moving descendants); cache overlay measurements; … | 0.3–0.7 ms sky; ≤0.2–0.4 ms transform hypothesis; ~98% fewer layout reads in chart mode; smaller items | ` + add `engine/static-merge.ts`, `civic/assemble.ts` to that row's Files cell.

### C2 — BLOCKER — NFS-086 missing entirely
- **Where:** absent from PLAN.md (grep `086` → no match; no "reflection-band"/"sky-band redraw" work item anywhere).
- **What is wrong:** NFS-086 "Throttle sky reflection-band redraws" (REGISTER.md A.6, line 129) has runtime verdict
  "**T2 exact / T3 cadence**" (`review-runtime.md:70`). Neither branch is placed: the exact dirty-reuse branch belongs
  in W2, the 15–30 Hz cadence branch is visual-risk (review-runtime §F.2 corrections, line 103: "Add the cadence
  branches of 057 and 086" to the approval list). Both are dropped by the plan.
- **Replacement:** in Lane D (PLAN.md:179) after "NFS-083/084 exact ocean work only if pass timing shows a gain (ocean
  phase fusion measured no reliable win, SP-FRAG-07)." append "NFS-086 exact dirty reuse of the sky reflection band
  (invalidate on camera/weather/flash; its 15–30 Hz cadence alternative is W3)." and add `NFS-086 (cadence)` to the
  W3 row PLAN.md:218 ID list.

### Intentional splits (verified against dual-tier verdicts — informational, no change required)
| ID | PLAN tiers | Review verdicts | Verdict |
|---|---|---|---|
| NFS-004 | W1 "(ownership part)" (line 135) + Parked "offline ground bake" (line 226) | review-load:77 = **T4** with instruction "Separate cheap ownership/format work from speculative offline bake"; review-runtime Wave1 (line 129) lists "004/017/099 exact memory ownership" in Wave 1 | consistent with runtime review; whole-entry load verdict is T4 — see D10 |
| NFS-088 | W1 "(hoist)" (line 137) + W3 "(half-res)" (line 218) | review-runtime:72 "T1 hoist / T3 half-res" | exact match |
| NFS-097 | W2 control separation (line 171) + W3 "sub-1" (line 217) | review-runtime:81 "T2 control separation / T3 floor" | exact match |
| NFS-098 | W2 split (line 182) + W3 "(codec)" (line 219) | review-runtime:87 "T2 split / T3 codec" | exact match |
| NFS-118 | W0 soak lane (line 118) + Lane G acceptance (line 199) | T0 in both reviews | cross-reference, not a second tier |
| NFS-107 | W0 (line 121) + integrated gate (line 205) | review-load wave 4 (line 190): wire only after valid 108/109 | sanctioned sequencing |

NFS-115 is explicitly dropped at PLAN.md:121 ("Drop NFS-115 (already correct)") matching review-load:160 (T4 DROP,
`shot.mjs:278` already assigns `webgpuAdapter`). NFS-001/004 appear in §2 prose (lines 36–37) as narrative, not placements.

---

## 2. Review-only IDs

| ID | Source | Placement |
|---|---|---|
| RR-01 | review-runtime:116 | W1 GPU init (line 131) ✓ |
| RR-02 | review-runtime:117 | W1 GPU init (line 130) ✓ (subsumes SP-HITCH-02 per review) |
| RR-03 | review-runtime:118 | Lane C (line 168) ✓ |
| RR-04 | review-runtime:119 | W0 (line 111) ✓ |
| RR-05 | review-runtime:120 | Lane C (line 168) ✓ |
| RR-06 | review-runtime:121 | W0 (line 114) ✓ |
| RR-07 | review-runtime:122 | W1 sky/ocean row (line 137) ✓ |
| **RR-08** | review-runtime:123 | **nowhere — see C3** |
| REVIEW-LOAD-01 | review-load:171 | Lane B (line 158) ✓ |
| REVIEW-LOAD-02 | review-load:172 | W0 (line 112) ✓ |
| **REVIEW-LOAD-03** | review-load:173 | not named; content covered by the NFS-014+RR-02 W1 unit — see C4 |
| REVIEW-LOAD-04 | review-load:174 | W0 (line 115) + §5 (line 76) ✓ |
| **REVIEW-LOAD-05** | review-load:175 | not named; §8.5 (line 255) asks the NFS-039 product question but omits the monotonic-revision contract — see C5 |
| REVIEW-LOAD-06 | review-load:176 | Lane F (line 192) ✓ |
| REVIEW-LOAD-07 | review-load:177 | Lane F ("REVIEW-LOAD-06/07", line 192) ✓ |
| **REVIEW-LOAD-08** | review-load:178 | not named; W3 NFS-055 row omits the deadline-origin contract — see C6 |
| REVIEW-LOAD-09 | review-load:179 | W0 (line 116) ✓ |
| **REVIEW-LOAD-10** | review-load:180 | not named; its title sentence is quoted verbatim in Lane B (line 159–160, "prefetch removal alone does not defer it") — see C7 |
| SP-FRAG-01 | sp-frag:126 | Lane D (line 174) ✓ |
| SP-FRAG-02 | sp-frag:127 | Lane D (line 175) ✓ |
| SP-FRAG-03 | sp-frag:128 | W1 (line 137) ✓ |
| **SP-FRAG-04** | sp-frag:129 | not named; content is the §6 ruled-out phrase "replacing PBR/PCF or single-siding the kit (golden failures)" (line 234) — see C8 |
| SP-FRAG-05 | sp-frag:130 | W3 (line 220) ✓ |
| **SP-FRAG-06** | sp-frag:131 | not named; content = Lane B + the §1 quiet A/B (line 16) — see C8 |
| SP-FRAG-07 | sp-frag:132 | content placed twice ("ocean phase fusion measured no reliable win" line 179; ruled-out list line 235) — see C8 |
| SP-HITCH-01…05 | sp-hitch:188–192 | none named by ID; 01 = NFS-014 content (W1), 02/03 merged into RR-02/RR-01 per review-runtime:116–117, 04 = NFS-015 content (Lane C), 05 = Lane C sentence (line 169) — placed by content/subsumption, acceptable |
| SP-IGPU-01…06 | sp-igpu:144–149 | none named by ID; 01 = W0 `?prof` row (line 119), 02 = NFS-080 W1, 03 = NFS-073 W3, 04 = NFS-077 Lane D, 05 = W3 "small or unmeasured", 06 = NFS-097 W3 — placed by content, acceptable |

### C3 — BLOCKER — RR-08 neither placed nor excluded
- **Where:** absent from PLAN.md (grep `RR-` → RR-01…07 only). W0 (lines 109–119) has no main-scene sensitivity-probe lane.
- **What is wrong:** RR-08 "Main-scene material/raster budget under-investigated" (review-runtime:123) is explicitly
  promoted twice by the runtime review: "Promote RR-08 and exact ocean work" (line 176) and the final sequencing
  amendment "RR-08 starts in Wave0 and informs Wave2" (line 180). Its evidence (main scene 76–83%, island 10–14 ms,
  ocean 12–16 ms; sp-igpu per-pass table lines 51–55) is quoted in PLAN §1/§2 but the diagnostic work item is missing,
  so W0 cannot "inform Wave2" as the review requires.
- **Replacement:** add a W0 row after line 119:
  `| — / RR-08 | Source-isolated main-scene material/vertex/fragment sensitivity probes on the iGPU (island/ocean/kit); diagnostic only, never a shipping pass disable | informs Lane D priorities; no booked gain |`

### C4 — minor — REVIEW-LOAD-03 unnamed
Content ("boot compile variant includes light count, not just framebuffer", review-load:173) is exactly the W1
NFS-014+RR-02 unit's "and the intended initial light/quality state" (line 130). **Replacement:** line 130 ID cell →
`NFS-014 + RR-02 + REVIEW-LOAD-03`.

### C5 — minor — REVIEW-LOAD-05 unnamed
The §8.5 operator question (line 255–256) covers NFS-039's stale-honesty but not the monotonic
hydration/network/prepared-revision precedence (review-load:175, deps 001/007/039). **Replacement:** append to line 256:
"(NFS-039; with REVIEW-LOAD-05 monotonic hydration/network/prepared revision precedence and original-age preservation)".

### C6 — minor — REVIEW-LOAD-08 unnamed
W3 NFS-055 row (line 215) states "no gain on measured healthy/failed paths" but omits the deadline-origin/stalled-request
specification (review-load:178). **Replacement:** line 215 "Why it needs approval" cell →
"shows a missing-data state; REVIEW-LOAD-08: deadline origin moves from init to first render — specify it".

### C7 — minor — REVIEW-LOAD-10 unnamed
Lane B already implements the merge verbatim (lines 159–160). **Replacement:** line 159 →
"NFS-028 + NFS-029 together (REVIEW-LOAD-10): move yard logos/monograms/board paint and the hull-stages GLB to real demand".

### C8 — minor — SP-FRAG-04/06/07 unnamed (content placed)
**Replacement:** line 234 "replacing PBR/PCF or single-siding the kit (golden failures)" →
"replacing PBR/PCF or single-siding the kit (golden failures, SP-FRAG-04)"; line 154 "(spike: `sp-island`; lossless
part only)" → "(spike: `sp-island`; lossless part only; timing corroborated by `sp-frag` §4 / SP-FRAG-06)"; line 179
"(ocean phase fusion measured no reliable win)" → "(ocean phase fusion measured no reliable win, SP-FRAG-07)".

---

## 3. Tier consistency (T0→W0, T1→W1, T2→W2, T3→W3, T4→Parked)

98 of 120 IDs agree with both reviews (including all dual-tier splits in §1 above). Disagreements:

| # | ID | PLAN | review-load | review-runtime | Severity |
|---|---|---|---|---|---|
| D1 | NFS-027 | **W1** (line 140) | **T2** (line 110: "Library inventory is not first-frame traffic") | — (out of scope) | minor |
| D2 | NFS-033 | **W1** (line 139) | **T2** (line 116) | — | minor |
| D3 | NFS-061 | **W1** (line 138) | — | **T2** (line 40) | minor |
| D4 | NFS-046 | **W2 Lane B** (line 160) | **T0 MERGE** into 108/110 (line 129) | — | minor |
| D5 | NFS-036 | **W2 Lane F** (line 193) | **T4** (line 119: "Revisit only after core UI split and arrival filmstrip, not necessary for forecast") | — | **major** |
| D6 | NFS-069 | **W3** (line 221) | — | **T4, DROP from speed tranche** (line 48: "Retain research record, not implementation commitment") | **major** |
| D7 | NFS-092 | **W3** (line 218) | — | **T4** (line 76; Park list line 135 includes 092) | **major** |
| D8 | NFS-095 | **W3**, unqualified (line 220) | — | **T4 for Low-floor** (line 79); final amendment line 180: "NFS-095 moves from general Wave3 to the parked Low-floor list unless a separate High-profile warrants it" | **major** |
| D9 | NFS-096 | **W3** (line 220) | — | **T4** (line 80: "fast dGPU has headroom, weak iGPU already 15 Hz. Not a primary target for this iGPU problem") | **major** |
| D10 | NFS-004 | W1-part + Parked | **T4 whole entry** (line 77) | Wave1 lists 004 ownership (line 129) | minor (split sanctioned by both reviews' prose; tier column of load review alone would say Parked) |
| D11 | NFS-071 | **Parked** (line 230) | — | **T0 (correctness/instrumentation); T4 (sampling optimization)** (line 50) | minor (the T0 half is effectively covered by RR-04 in W0 line 111; state it) |

Notes on the majors: D5–D9 schedule work both reviews parked under "reopen only with a measured bottleneck"
(Parked preamble, line 224, is the plan's own rule). Either move them to Parked or add the measured-bottleneck
justification to each row. Proposed placements: NFS-036 → Parked list (line 229, after NFS-035); NFS-069 → Parked
"NFS-069 lower-rate distant boats (T4: high risk, ≤0.3 ms)"; NFS-092 → Parked (append to "NFS-090/091" →
"NFS-090/091/092"); NFS-095 → Parked with "(unless a High-profile shadow workload is measured)"; NFS-096 → Parked
(append to the same list). For D1–D3 (promotions of pixel-exact items into W1) and D4, either demote to match the
reviews or add one clause to the W1/Lane B rows recording the deliberate promotion (e.g. for NFS-027: "promoted from
T2: pixel-identical, ships alone; first-frame share ≈0 after NFS-028").

---

## 4. Number fidelity (§1, §3, W1/W2/W3 gain columns)

### Verified correct against sources (spot list)
5,944 ms n=3 and 5,799 ms n=5 (p1/load.md:26 c-cold median; sp-frag.md:113 head fast4g 5798.5, n=5) · 2,974/9,973 ms
(load.md:23,28) · +1.26 s / 1.1 s fade (load.md:26: 7,204−5,944; NFS-054 CSS 1,100 ms) · 2,740–2,956 ms / 106–176 KB
(load.md:24,27,47–48) · 7.82 MB/151 (load.md:23–29: cold wire 7,820,615–7,828,606 B, 151 requests) · 75 KB
(REGISTER NFS-052: 75,108 B) · RTX ~1.4–1.6 ms (sp-igpu:107 p50s 1.44/1.46/1.56/1.56) · 45–54 ms and 76–83%,
island≈12/ocean≈14/fleet≈4/civic≈4 (sp-igpu:51–55: p50 45.19–54.29; main 76.3–83.1%; island 10.3–13.8, ocean
11.9–15.8, fleet 2.9–5.0, civic 2.6–4.8) · 23 programs/4.4 s (sp-hitch:189–190; review-runtime:14: 4,405.7 ms n=3)
· 97→63, 36→13 links, −203 ms (REGISTER NFS-014) · 2 relinks (RR-01) · ~4.9 M mip texels/~1 ms (7×699 k;
review-load:85 "~1.14 ms GPU estimate") · 105+79 ms (REGISTER NFS-017: 105.2/79.3) · 4.4 MiB/13 KB (NFS-099) ·
~20 MiB (NFS-004) · 4 redundant requests (NFS-026) · sky 0.7–0.8 ms (SP-IGPU-02) · pool 0.27 ms (SP-FRAG-03) ·
0.3–0.7 ms sky cache, ~98% reads (NFS-058/061) · 24–25 KB (NFS-033) · 3.25 MB/80 KB (NFS-027: −3,248,064 B,
−79,631 B eager) · 12.3 wakeups/s (NFS-101/104: 12.33) · 2,487 routes (review-load:79) · 1,726→0 ms and −510 ms
(sp-simrace:117–119: 1726→0 median, −509.9 ms) · 823→602 KB (REVIEW-LOAD-01: 823,078→602,013 B) · 423/644 KB ≈
0.38–0.59 s (review-load:42–43: 422,873 B/384 ms; 643,938 B/585 ms) · 49/17 GLBs (NFS-021) · 0.5 s + 1.4–1.6 s
tasks (NFS-007: 491.7 / 1,400.4 / 1,616.8 ms) · −5.6/−5.9 ms SSIM 1 MAE 0 (sp-frag:84–93: −5.561/−5.872,
SSIM 1.000000000/MAE 0.000000) · ≈5.3 ms knockout ceiling (sp-frag:60, §5 SP-FRAG-02) · ~367 of 623 (NFS-057:
623−256 visible) · 0.3–1.2 s least-trusted (review-load E.1) · 25–80 ms (NFS-005) · 130–560 ms (NFS-003:
129.6–526.7) · −74 KB (NFS-052) · ~60–85 KB gzip (review-load:52 forecast) · +304 KB/~0.28 s (review-load:44:
303,773 B/276 ms) · −0.5 s fade (review-load:56) · 0.6–0.8 ms/15 MiB and MAE 0.98 [/255] (review-runtime:57:
~15.26 MiB, 0.6–0.8 ms; MAE 0.976/255 — PLAN's /255 convention matches §5's "MAE 0.06" floor) · §3 targets
4.7–5.2/~5.0/4.4–4.9/~5.6/2.2–3.0/≤33/≤25/12/16/>50 ms all match review-load:50–58 and review-runtime:151–157 ·
**5.80→4.74 s, −18.3% is correct and correctly attributed**: sp-frag:118 quiet interleaved A/B 5798.5→4736.5 ms
(−1062.0 ms, 18.3%), full combined prototype (incl. W3-gated lossy), labelled "measured full prototype" in the
stretch column — consistent.

### Flagged

**F1 — minor — NFS-006 gain sign inverted (PLAN.md:147).** "(48.9 KB br; 0–250 ms more)" reads as a cost. Source:
review-load:54 "Full seeds **remove** an estimated 0–250 ms warm-critical compute while **adding ~44 ms** wire";
verdict row review-load:79. **Replacement:** "NFS-006 versioned compact layout seeds (48.9 KB br, ~44 ms wire;
removes an estimated 0–250 ms warm-critical compute)".

**F2 — minor — NFS-019 "~214 KB" not marked as estimate (PLAN.md:194).** REGISTER NFS-019 marks −82.93 % decoded as
measured but "~214 KB less live br" as **[est]**; review-load:102 corrects to "163 KB equal-br measured, ~214 KB live
estimate". **Replacement:** "(−83% decoded JSON measured; ~214 KB less live compressed traffic, estimate — 163 KB
equal-br measured)".

**F3 — minor — NFS-097 DPR numbers lack the exploratory caveat (PLAN.md:217).** "DPR 0.75: 49→29 ms iGPU" matches
sp-igpu:149/SP-IGPU-06 (49.53→28.63) but those are censored reduction windows (3–6 completed frames);
review-runtime:178: "do not book … DPR49.53→28.63 ms as release improvements". **Replacement:**
"DPR 0.75: 49→29 ms iGPU (exploratory censored windows, not a release measurement)".

**F4 — minor — phantom citation "ID-02 / ID-03" (PLAN.md:187).** These labels exist nowhere in the corpus —
REGISTER.md:7 states explicitly: "No embedded child-scout ID scheme (ID-xx / FLEET-xx) exists in the corpus … grep …
= 0 matches"; grep over `agents/2026-10-19-need-for-speed/**` finds them only in PLAN.md:187. The techniques described
are plausible NFS-003 sub-steps but the IDs are ungrounded. **Replacement:** "(ID-02 per-label geometry reuse, ID-03
polygon bounding-box skip)" → "(per-label geometry reuse; polygon bounding-box skip)".

**F5 — minor — "six verification spikes" (PLAN.md:5).** Exactly five exist: `p2/sp-{frag,hitch,igpu,island,simrace}.md`
and five `outputs/need-for-speed/sp-*/spike.patch` dirs. **Replacement:** "six verification spikes" →
"five verification spikes". (Also verified: 18 p1 reports ✓, 120 register entries ✓, 178/178 ✓.)

**F6 — minor, §2 (outside strict scope, noted for completeness) — "u:data up to 2.3–6.9 s in tails" (PLAN.md:37).**
sp-simrace:60 says "p1's 3–6900 ms range"; REGISTER NFS-001's canonical samples span 2,321–6,727 ms (2.3–6.7 s).
PLAN splices the register's lower bound with sp-simrace's upper. **Replacement:** "u:data up to ~2.3–6.9 s in tails
(register samples 2.3–6.7 s; sp-simrace quotes p1's 3–6,900 ms range)".

---

## 5. File paths at HEAD (`b71dd282`)

All verified present: `src/harbour/{engine/engine.ts, engine/post.ts, engine/assets.ts, engine/prefetch.ts,
lights/lights-system.ts, sky/clouds.ts, sky/sky-glsl.ts, sky/sky-system.ts, fleet/emblems.ts, fleet/hull-kit.ts,
identity/lettering.ts, identity/identity-system.ts, world/ground.ts, world/island-system.ts, civic/civic-system.ts,
civic/shipyard.ts, readings/fog.ts, ocean/gpu-bake.ts, ocean/wake.ts, ui/picking.ts, ui/ChartLabels.tsx,
ui/HoverTag.tsx, ui/yard.ts, sim/system.ts, audio/controller.ts, audio/ambience.ts}`, dirs `src/harbour/{beam,lights,
civic,life}`, `public/harbour/chart-lettering.{json,png}`, `public/logos/`, `public/harbour/island.glb.gz`,
`scripts/harbour/sync-logos.mjs`, `scripts/bundle-budgets.mjs`,
`outputs/need-for-speed/load/{server,run-load,run-warm}.mjs`, `.github/workflows/release.yml`, all 18 `p1/*.md`,
all 5 `p2/sp-*.md`. npm scripts `preview`, `check:harbour-contracts`, `check:runtime-media`, `check:viewport-gate`,
`validate:changed` all exist in `package.json`. **No missing paths.**

---

## Summary

- **Blockers (3):** NFS-059 missing (C1); NFS-086 missing (C2); RR-08 neither placed nor excluded (C3).
- **Majors (5):** NFS-036 in W2 vs T4 (D5); NFS-069 in W3 vs T4-DROP (D6); NFS-092 in W3 vs T4 (D7); NFS-095 in W3
  vs parked-Low-floor amendment (D8); NFS-096 in W3 vs T4 (D9).
- **Minors:** tier promotions NFS-027/033/061, deferral NFS-046, NFS-071 T0-half note, NFS-004 split note (D1–D4,
  D10–D11); unnamed review IDs REVIEW-LOAD-03/05/08/10, SP-FRAG-04/06/07 (C4–C8); number fidelity F1–F6.
- Coverage otherwise exact: 118/120 IDs in exactly one tier (+4 sanctioned splits), all other review/spike IDs placed
  by name or verbatim content; §1/§3/gain numbers faithful to sources (two sign/estimate-label fixes, one phantom
  citation, one spike-count error); all named paths exist at HEAD.
