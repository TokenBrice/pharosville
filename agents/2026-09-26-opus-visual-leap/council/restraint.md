## Verdict
Partly. W0–W3 would very likely give a far more beautiful still: the subtractions, the new shot, the light, the air and the water. W0 alone removes most of today's noise. The whole would not be quieter, though. The plan budgets attention in one place only, the director's foreground slot. Its own systems add a discrete event every one to three minutes: 9–17 postcard moves an hour (W0.15 removes their throttle), fleet-wide tide swings, gust fronts, inlet crossings, koi rings, and a lantern flare every 15–31 s that speeds up with market stress. G4 then requires at least 3 gifts per 30 minutes, which is a floor, not a ceiling. Biggest risk: idle viewers get toured away from the Hour-Print into a busier harbour whose truth checks have no gate.

## Findings

### Blocker

**1. Only the director slot has an attention budget. The plan's own systems produce an event every 1–3 minutes, and G4 rewards busyness.**
- **Problem.** K21 (plan:142) caps only the director's foreground slot: the day score at ≤ 6/24 h and arrivals at ≤ 4/h. At the rates the lanes specify, an idle daytime hour in or near the rest frame also gets:
  - postcard moves, 9–17/h (see #2);
  - a fleet-wide anchor swing, 12/h as fleet-motion-1 builds it ("Every five minutes the tide turns", fleet-motion.md:90). K21's "~8–12 min" is not what the lane implements, and fleet-motion-4 ties the voyage windows to the same 600 s tide.
  - the 600 s gust front, now visible on every nobori and every heeling hull (W4.H2, W4.F10);
  - inlet crossings, ≤ 10/h (W1.6: ≥ 6 min apart);
  - koi rings, ≤ 20/h at the hero's pond (life.md:276);
  - leaf fall, once per 20–40 min in season (garden.md:280), although K24 calls it "rare";
  - at night, a lantern flare every 15–31 s (#7).
- **The score is over-full.** It has up to nine attention-claiming items against a cap of six: W5.1's seven, K20's dawn reverse, and W5.9's anniversary lantern, which launches "each evening" at dusk 0.35 (harbour.md:160-161). There is no rule for which yields. Heron-departs, the keeper's round, the anniversary lantern and the evening fish rise all fall in the same ~75 minutes of dusk.
- **The swing was meant to be budgeted.** fleet-motion's cross-lane section asks for the swing to be a director beat "so heron, lantern and arrival beats avoid the same minute". K21 made it "ambient" and unbudgeted instead.
- **G4 contradicts the rest of the plan.** G4 (plan:369-370) demands at least 3 gifts per 30 minutes, about 6 an hour. That contradicts K21, W5.1's 8–14 minute silences, and life-1's own acceptance: "a 30-minute noon watch log shows zero decorative beats besides at most one heron event" (life.md:114).
- **Edit to K21.** Replace the ruling with an **Attention budget** table. Give one row per generator (rate/h, whether it is in the rest frame, owner) and these ceilings:
  - ≤ 6 discrete events per idle hour in the rest frame; continuous ambient motion is excluded.
  - At least one unbroken 12-minute quiet every hour.
  - ≤ 2 gifts between golden 0.5 and night 0.5.
  - Only ceremony subjects cross the inlet, at least 15 minutes apart.
  - The anchor swing happens at most twice a day, as a score gift, or is re-keyed to wind shifts (#5).
  - Leaf fall and the anniversary lantern count inside the score.
  - Koi rings at most once per 15 minutes.
- **Edit to G4.** Replace the first clause with: "60-minute idle watch at `#t=11` and `#t=17.5`, camera held (O18): ≤ 6 discrete events/h, one quiet run ≥ 12 min, no two foreground events < 8 min apart; the noon hour logs at most one decorative beat. Rituals are proven by forcing each through the director seam."
- **Other edits.** Add an "events/h" column to §6. §8 amendment 8 gains "the attention budget is a gate".

**2. The idle viewer leaves the Hour-Print after two minutes, and W0.15 makes that happen more often.**
- **Problem.** §1's premise is "one fixed composition printed at each hour" (plan:63-64). The rituals are staged for that frame: K20's keeper is "visible only on the island path", and K22's heron is "inside the new rest frame".
- **Attract takes the camera away.** Attract starts after 120 s idle (`garden-attract.ts:7`) and loops its postcard book forever.
- **W0.15 speeds it up.** Today each move must win the director's environment slot, which admits one beat per 6–10 minutes (`garden-director.ts:77-78`; the request is at `use-canvas-resize-and-camera.ts:705-714`). W0.15 removes that throttle. Moves then follow the book's own 208–388 s legs (`garden-attract.ts:34-35`), about 9–17 per hour [INFERENCE]. The reborn plan counted 10–16/h for the same book (W4.18).
- **The ritual hours point away from the rituals.** W5.8 picks cards by time of day, and at the ritual hours they face away from the island: Engawa Lanterns (golden→blue, yaw ≈ 157°, "looking south, back at the shore") and Storm Passage (blue, yaw ≈ −75°) (camera.md:187-188). So the keeper's round would play off-camera [INFERENCE from those yaws].
- **Stay makes it worse.** ambient-journey-3 cuts the attract idle time to 45 s inside Stay (ambient-journey.md:171).
- **No operator row.** §4 has no row for this, although attract was an operator approval (ledger, 2026-08-13).
- **Edit.** Add K44 and O18: "The idle state is the rest ShotSpec. W5.8's postcard book becomes an explicit 'Wander' action. If attract is kept: at most 1 postcard/hour, held ≤ 6 min, returning to rest ≥ 2 min before any score window. Stay (W6.9) holds the rest shot and runs no attract."
  - W0.15 gains: "attract keeps ≤ 1 move per environment window until O18 is decided."
  - W5.5's in-frame test uses the current camera, not the rest frustum.

### Major

**3. Nothing gates truth at rest, and the look gates change with the day's PSI and date.**
- **Who leads.** K32 and W4.F3 turn the far fleet into "ink silhouettes … tone from sky-2's airlight, no mark". The hero band is "the nearest 16" by eye distance (fleet-craft.md:131). The bible's third reading is "hero ships show who leads", so distance, not leadership, now decides whose identity survives. In fleet-craft-3's own words, the far fleet "at night disappears except for embers" (fleet-craft.md:121). Only the hero band carries lanterns.
- **Which chain.** Flags have been the only in-world chain marker since the 2026-09-07 ledger decision.
  - K28 cuts cloth area by about 75 % (harbour.md:121), with "weaker glance identification" (:217).
  - It also drops art-director-4's "minimum 18 px mark at rest" (art-director.md:166).
  - G3b checks flag chroma, not legibility.
- **Risk at rest.** G3a checks band separation only in the whole-map view (plan:291). water-3's own rest-frame acceptance, `--reduced #t=12.25` (water.md:162), was dropped.
  - At K1's 2.5–3.5° pitch, water within about 5° of the horizon reflects most of the sky (Schlick F ≳ 0.6). That band is the mid and far field, where most named bodies will sit [INFERENCE: arithmetic, not measured].
  - Calm and danger water there mostly mirror the same sky.
  - Aerial perspective (T ≈ 0.55 at the far rim) roughly halves the blur contrast that remains.
- **Every ship at rest.** camera-1 says "~25 % of hulls leave the rest frame's near field" (camera.md:116). Catalogue contradiction #15 ("never by hiding eligible ships", D:747-751) has no ruling. K2's pine has no check that it covers no hull.
- **PSI inside the composition.**
  - W1.8 anchors the shot on "the tallest far ridge", but data-poetry-1's thresholds hide that ridge below STEADY, reaching 0 at TREMOR.
  - W2.6's ledger row says "three ranges" while W2.5 paints five, with kasumi at α 0.55 across their feet.
  - sky-4 darkens the upper third by 10 L* or more under stress.
  - So the §1 value-plan gates pass or fail with the capture day's PSI.
  - The night rule "no water band > L* 10" (plan:98) fails on any moon-up date once W3.5's moon road exists.
- **Edit: add a Truth clause to each gate.**
  - **G1:** tracked-supply share and hull count in the rest frame, against baseline; no hulls under the pine or the chrome corner.
  - **G2:** captures use `--fixture calm` with a pinned date, and are re-checked under BEDROCK and CRISIS. W1.8 anchors on a ridge whose visibility does not depend on PSI. W2.6 names which three ridges carry PSI, and kasumi stays below their crests. The night water rule exempts the moon road.
  - **G3a:** a greyscale blind-sort of the water bodies in frame at the rest seat, `--reduced #t=12.25`.
  - **G3b:** hero band = titan/heritage tiers plus the nearest boats, and leaders keep mon and hue at every beat. Every chain mark is at least 18 px at 1600×1000. Far hulls stay detectable at `#t=22`.

**4. W0 skips the one live false claim and the live AA failures. Some operator decisions land after the code that implements them.**
- **The false caption.** The arrival caption claims "supply increased" whenever issuance is flat or missing (`pharosville-world.tsx:577`). It names the home dock rather than the berth (`:570,574`). It is announced to the live region (`:585`), and it outranks a stale-feed warning (`detail-model.ts:105-110`). fleet-motion rates the truth fix as small. The plan never mentions it; a grep for "supplyTrend" or "increased" finds nothing.
- **The accessibility failures.** Night card links sit at 1.23:1, night controls are below AA, and the caption's live region speaks every minute (chrome D2, D7 and D6, all small). All wait until W6, after G2.
- **The sequencing.** W0.6, W0.12 and W0.16 carry out O4, O10 and O17 before the G1 operator checkpoint.
- **Edits.**
  - Add W0.22: "Arrival caption truth — supply clause only when minting or redeeming; name `motion.currentDockId`; berth must be inside the current frustum."
  - Add W0.23: "Night text roles to AA."
  - Add W0.24: "Live region announces phrase changes only."
  - Add a §4 preface: "O4, O10 and O17 are decided before W0 starts."
  - Split O17 into O17a (quay-gull cue) and O17b (signal-mast meaning).
  - W0.16 gains: "rewrite the registry's `visual`, `questionAnswered` and `domEquivalent`, and the Signal mast row."

**5. Tide, rain and low mist each end up with two or three meanings, and K6 cites a sign-off that does not exist.**
- **Tide.**
  - W4.F9's swing is scenery ("the harbour tide is scenery", fleet-motion.md:120), and its DOM copy says "voyages leave on the ebb and return on the flood" (:209).
  - W5.10 makes the tide 7-day supply, with DOM copy "…(flood; √ scale…)" (data-poetry.md:177).
  - A visitor watches the fleet swing "at the turn of the tide" while the tidal flat stays put.
  - The heron "prefers the exposed flat" (:174), which ties a decorative bird to data.
  - The flat, the re-seated reeds, the heron and the fireflies share one site that nobody has resolved (catalogue C:503).
- **Rain and mist.**
  - W5.12 adds rain and snow veils driven by PSI.
  - The live `cue.area.danger-squall` already draws rain plus "the shared low mist veil" in DANGER water, and "stages the sky darker as fleet threat climbs" (`visual-cue-registry.ts:519-521`, from DEWS data).
  - §8 amendment 5 ("by day mist means a stale source", plan:463) would be false on the day it lands.
  - Snow appears only under PSI stress, yet sky-8 calls it "kigo, not data" (sky.md:358,380).
- **K6's sign-off.** "Data-poetry lane signs off on the dawn band" (plan:128) has no source.
  - data-poetry.md never mentions dawn or kasumi.
  - Catalogue D:816 lists the sign-off as pending.
  - art-director-3 says "the data-truth lane must sign off" (art-director.md:151).
  - Hero frame H4 (plan:87) depends on that band.
- **Edit: new K45, "One meaning per phenomenon".**
  - (a) One tide. If W5.10 ships, re-key W4.F9's swing to wind shifts and drop "tide/ebb/flood" from all motion copy; otherwise cut W5.10. Move the flat off the heron's station.
  - (b) One source for rain. Either retire the squall's rain, mist and sky darkening (K7's water surface already carries danger), or drop W5.12's veils. Snow never marks stress.
  - (c) Rewrite K6 as "pending data-truth sign-off", with a G2 test: under `--fixture stress` with a stale peg summary at `#t=5.75`, the stale fog bank stays separable in `--blur-audit`. Key the dawn band to solar elevation, not 07:30. H4 must pass on the ridge-foot kasumi alone.

**6. §4 lists 17 decisions, but the waves adopt at least eight more reversals, and several rows hide the real cost.**
- **Reversals adopted without a §4 row.** The catalogue asks the operator to rule on every one of its 65 recorded reversals (D:613-677, D:815).
  - The pirate-contrast floor and the cloth-chroma restraint (W4.F2) reverse the ledger's "never bake fleet restraint into cloth colour".
  - Far-fleet identity (W4.F3).
  - Longer rests, 240–480 s → 600–1500 s (W4.F11). This rewrites the registry's `cue.ship.motion` text (line 281) and `motionCadenceDetailLabel`.
  - Anchor restlessness as sheer (W4.F9).
  - Rituals pre-empting arrival annotations (W5.1).
  - Microseasons (W5.6), which the last review told the plan to defer (reborn 02-plan-review §4).
  - The Milky Way (W2.8).
  - The idle camera (#2) and the keeper figure (#12).
- **Rows that hide the cost.**
  - **O2:** "if declined: tower stays centred" omits the reason the closer rest was chosen (fleet readability, ledger 2026-09-06) and the ~25 % of hulls that leave the near field.
  - **O5:** omits that flags are the only in-world chain identity.
  - **O8:** the stone garden has no site. data-poetry-2's two options are the island court, which K30 already fills beside the hero, and the engawa shade, which would put pale stones in the corner cell gated at ≤ 18 L*. O8 also retires a named water while G3a still sorts seven.
  - **O9:** omits the 2026-09-08 condition ("only if the sky reading has not saturated attention"), which W2.6, W5.11 and W5.12 now strengthen. It also omits the implied re-scoping of the 36-cue registry.
  - **O13:** claims "caption parity" for the music's dropped third, but `phaseCaption` returns "the golden hour" or "the blue hour" with no tone word (`detail-model.ts:84-85`). W6.2 replaces quiet/watchful anyway.
  - **O11:** a 35°N sky clock inverts the seasons for southern-hemisphere visitors.
- **Edit.** Add O18–O24, or an "Adopted reversals" table. Rewrite the O2, O5, O8, O9, O11 and O13 cells with these costs. O8 names a site outside the lower-left value cell and outside the hero's silhouette.

**7. Several things the plan calls relaxing are stimuli, and one is paced by market stress.**
- **Lantern flare.** The flare in K9/W2.11 is rated only "relaxing 3" by its own lane (pharos.md:240). Its 2.5 HDR peak sits above the 2.4 bloom knee (§6). It fires once per beam revolution. The sweep speed encodes PSI stress: 0.2–0.42 rad/s, commented "fast enough to feel urgent" (`world-renderer.ts:4404-4422`). That gives about 115 flashes an hour when calm and 240 at full stress: an urgency metronome on the crown.
- **Intra-cloud glow.** W5.12's glow repeats the pattern, up to once per 90 s in a crisis (sky.md:376).
- **Moon-road glitter.** W3.5's glitter can shimmer from frame to frame. G3a gates spatial high-frequency energy but not frame-to-frame change, and ambient-journey measured the water as the frame's temporal noise band: 12–13 grey levels per 1.5 s, against 0.8 in the sky.
- **Edits.**
  - K9: "the lantern glass swells (≥ 1.5 s rise and fall, peak ≤ 2.0 HDR), at most about once a minute, independent of sweep speed" — or cut the flare.
  - Delete the glow from W5.12.
  - G3a: "foreground water, mean frame-to-frame |Δ| at 1.5 s ≤ 6 grey levels; no single-frame sparkle in the moon road at 250 ms sampling".

**8. W5–W7 have no displacement column and no scope tier, so O9's cap cannot be enforced.**
- **Problem.** The bible says "every addition names what it displaces". Every lane report carried a Displaces field; the plan's tables dropped it. About 30 W5–W7 systems are committed as core. W5.14 and W7.5 add new data encodings against data-poetry's own "registry freeze".
- **Edits.**
  - Add a "Displaces" column to W2–W7. A row without one moves to §7 Deferred.
  - Mark W5.6 (the caption part), W5.8–W5.14, W6.9–W6.10 and W7.3–W7.6 as Ext. Each ships alone after G4 passes with it switched on.
  - Add K46: "No new cue unless one retires. O9 ships with a registry diff."

**9. Decorative text can outrank warnings and crowd the accessibility channel.**
- **Problem.** Caption precedence today is arrival, then transition, then stale warning, then phase (`detail-model.ts:105-111`). The plan adds ritual names to the caption (life-1), kō names (W5.6), the moon phase (W2.7), and ritual lines in `AccessibilityLedger`.
- **Edit to K18/K19.** "Stale warnings outrank ceremonies. Decorative text appears only in the ambient-phase slot, never triggers the status region, and goes in a collapsed 'Almanac' ledger section below the analytic rows."

**10. The sound consent model is mostly right, but a remembered "on" resumes on any keystroke.**
- **What is right.** Default off, nothing fetched while off, suspended on hidden tabs, music off by default.
- **What is wrong.**
  - On a return visit, sound-2 resumes audio on the first `pointerdown` or `keydown` anywhere on the world shell (sound.md:130). A screen-reader user's first key would start audio under their speech.
  - K36 lists sea state and the dropped third as the only data→sound mappings. It misses the beacon pass, whose "period is 15–31 s, set by the PSI sweep rate" (sound.md:90).
  - The dropped third "may go unnoticed" (:240), and it scores market mood as happy or sad, which sound-4 forbids for supply (:272).
  - W7.4 binds to the arrival sail-dip timing (`garden-arrival-beats.ts:9-11`), which W5.5 rewrites.
- **Edits.**
  - W7.1: audio starts only from the Sound control (sound-2's own alternative, :185).
  - K36: name the beacon-pass tempo as PSI-derived; drop the dropped-third mapping.
  - §9: W7.3–W7.6 run after G4.

### Minor

11. **The dawn skiff looks like data.** It is an unrigged, unselectable hull crossing the ma (the empty approach water) every day (W5.1; plan:77). It is visually the same as the flight-to-quality tenders ("small open tenders … no rig … unselectable … harbour craft, not stablecoins", `visual-cue-registry.ts:470`), and its data-truth sign-off is still pending (D:816).
    - *Edit:* delete it from W5.1 and §1.
12. **Cultural references are mostly principled; the costume risk is local.** Shin-hanga as a method, kasumi and shakkei, niwaki pruning, karesansui, and a pentatonic scale with explicit exclusions are all principles. The risks are:
    - kō names in the truth caption;
    - K20's walking keeper, where ambient-journey-5's figureless rite "avoids fantasy-village lore" (ambient-journey.md:222) and that dissent is unrecorded;
    - the costume audit in W4.P5, which covers only torii and red;
    - the review of sound timbres, which is not scheduled (D:817).
    - *Edit:* widen W4.P5 to a function-named audit at G3b and G4, with no almanac names in the caption. Make K20 figureless by default, with the keeper figure as O19.
13. **W6.10 contradicts K17.** Starting a return visit from `followTile(subject)` is the lateral slide K17 forbids.
    - *Edit:* keep the caption and drop the camera move.
14. **W1.2 moves coves that shape the sea bodies** (`garden-rim.ts:137-138` `body:"open"/"calm"`; `sea-bodies.ts:172-175`).
    - *Edit:* G1 adds "sea-body areas and risk-placement capacity within ±5 %".

## Missing
- **W3.4 inlet calm mask:** art-director-6's guard (art-director.md:195). The inlet calm mask must never cover a named watch-to-danger body.
- **W4.F10 heel:** fleet-motion-2's guard, "keep the heel cap small so market calm is not read off the boats". Wind is already coupled to PSI.
- **W0.2 motion sheets:** fleet-motion's "camera-still capture mode" as a `--still-camera` flag. Idle breathing (K16) starts at 45 s and confounds every longer motion-sheet gate.
- **W5.11 cloud cover:** sky-4's DOM words (Clear / Fair / Veiled / Broken / Low cloud / Overcast). Without them, cloud cover is a PSI encoding with no text equivalent.
- **W6.12 deepening calm:** `idleDepth` should also lower event rates, so the garden gets quieter the longer you stay.
- **W6.11 Long Record:** data-poetry-4 is DOM-only, 0 GPU, and the purest exact-truth item. Run it any time after G0.
- **K17 arrival veil:** add camera-6's fallback, "drop the veil if Sky cannot separate them".
- **Budget rows:** life-1's "back off 90 s after any ritual" and fleet-motion-1's "slack-water hush" should each become a row in the #1 budget.

## Cut or demote
- **Cut W5.14.** It shares the pitch channel with W4.F10's swell (×1.5 in danger water, where off-peg leaders sit) and with W4.F9's sheer. It is about a 2 px bow drop at rest [INFERENCE], and "sinking" is an alarm metaphor for a 50 bps move.
- **Cut the W5.1 dawn skiff.**
- **K9 flare:** demote to a sub-knee swell, or cut.
- **W5.12:** cut the intra-cloud glow and snow-as-stress. Keep rain veils only if the squall's rain retires.
- **W7.5:** cut the dropped-third data mapping.
- **W5.6:** move the kō names to the ledger Season row; keep kō as event gates.
- **W5.8 as the idle default:** demote to "Wander".
- **W4.F9:** limit the swing to at most twice a day, or re-key it to wind.
- **W5.9 and W5.10:** Ext after G4, each needing a site outside the rest frame's value cells.
- **Rates:** cut garden-7's leaf fall and life-6's koi rings to fit the budget.
- **Keeper figure:** operator option, not the default.
- **W6.10:** cut the camera glide.

## Five edits
1. **§3 K21, G4 and §6.** Add the attention-budget table with its ceilings. Rewrite G4 as a 60-minute quiet audit with a ceiling. Add an events/h column to §6.
2. **§3 K44, O18, and W0.15 / W5.8 / W6.9.** The idle state is the rest shot. Postcards become an explicit action; Stay holds the Hour-Print. W0.15 cannot raise the move rate until O18 is decided.
3. **Truth clauses in G1–G3b.**
   - Pinned PSI fixture and date for captures.
   - Leaders keep mon and hue at every beat.
   - Chain marks at least 18 px.
   - A rest-frame water blind-sort.
   - Supply share and hull count in frame.
   - W1.8 anchored on a ridge that PSI does not hide.
4. **W0.22–W0.24 and a §4 preface.**
   - Fix the arrival caption's false claim.
   - Night text to AA.
   - Live region announces phrase changes only.
   - O4, O10 and O17 decided before W0, with O17 split.
   - Rows O18–O24 for the reversals adopted without a decision.
5. **§3 K45 and K6.**
   - One meaning each for tide, rain and low mist.
   - K6's claimed sign-off becomes "pending", with a stale-fog-at-dawn test.
   - Cut the skiff, the dropped third and the intra-cloud glow.
   - The flare becomes a sub-knee swell.