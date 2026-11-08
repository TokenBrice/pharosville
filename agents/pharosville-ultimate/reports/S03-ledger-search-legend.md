# S03

## Executive summary

The strongest opportunity is semantic accuracy: the storm station renders the supply-weighted DEWS band, but its legend, hover and panel describe a count of alerted coins. The ledger already has sound native-table foundations, yet lacks source freshness, analytical filters and retained working state. Existing row selection flies the camera while leaving the ledger over the destination. Search ranks tickers well but lacks typo correction, aliases, recent selections and an explicit touch dismissal. Chart labels already use cached measurements and collision culling; improve their awareness of open UI. All proposals preserve D11 through on-demand controls and existing data.

## Current state

- Search covers live coins, chains, launches, wrecks and openable landmarks. Ranking is exact ticker, exact name, prefixes, word starts, then weaker fragments/subsequences; supply breaks ties. Seven results show identity plus supply or entity type. No alias field or edit-distance matching exists. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/search.ts:25; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:29.
- The ledger has Legend, Coins, Pre-launch, Chains and Wrecks tabs. Native tables provide captions, scoped headers, aria-sort, nulls-last sorting, text filters and live result counts. Headers are sticky; coarse-pointer controls receive larger targets. Columns are fixed and every matching row mounts. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:133; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:318.
- C mode prioritizes Pharos, piers, ten largest non-wrecked boats, then landmarks. Labels have halos, viewport bounds, six-pixel collision padding and boat occlusion checks. Measurements are cached. The earlier THE/ROADS spacing issue has a larger gap and regression test; visual resolution remains unverified. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/ChartLabels.tsx:19; /home/ahirice/Documents/git/pharosville/src/harbour/ui/measurements.ts:10; /home/ahirice/Documents/git/pharosville/src/harbour/identity/labels.test.ts:110.
- Pharos cues comprise PSI-band sweep rhythm and white/amber/red lamp, score-dependent reach/brightness, an unlit unavailable reading, and a narrowing qualification shutter. The legend explains rhythm, darkness and qualification, but omits the colour vocabulary and precise score relationship. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/readings/bind.ts:182; /home/ahirice/Documents/git/pharosville/src/harbour/readings/readings-system.ts:244; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:66.
- Fleet cues comprise supply-class size, peg-family silhouette, branded sails/burgees/house flags, supply-share circuits and dwell, Shoals placement, distressed heel/flogging canvas/checkered flags, peg-reading stern lanterns, maiden/launch bunting and five ranked masthead storm signals. Decorative navigation lights, streamers, wind response and outings coexist. Legend coverage is partial. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/model/classify.ts:20; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:945; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:1078.
- Environmental cues comprise four off-peg sea steps; DEWS clouds, wind, gusts, precipitation, lightning, spray and darkening; rising/clearing fronts; recovery rainbow/moonbow; and stale/unavailable fleet fog with held voyages. Station shapes encode weighted DEWS, including a Danger pennant and red night lanterns. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/readings/bind.ts:123; /home/ahirice/Documents/git/pharosville/src/harbour/weather/director.ts:2; /home/ahirice/Documents/git/pharosville/src/harbour/readings/storm-cones.ts:6.
- Chain/civic cues comprise supply-shaped piers/berths, office crests/flags/awnings, chain-coloured pier furniture, sea-zone lettering, 30-day office works/furling, 24-hour gaining/losing-chain flags, the station weather board and Registry grade-count shields. The legend misses movers and grade boards and incorrectly promises permanent chain water lettering. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/identity/identity-system.ts:14; /home/ahirice/Documents/git/pharosville/src/harbour/civic/civic-system.ts:382; /home/ahirice/Documents/git/pharosville/src/harbour/identity/labels.ts:56.
- The tide gauge encodes weekly global supply change, compressed to ±2%, with grey held readings and a drained unknown state. Mint/Burn smoke, glow, presses, workers, wheel, fire, embers and chute activity combine daily and latest-hour flows, dominance and banked stale states. Shipyard hull stages encode launch phase. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/readings/tide-gauge.ts:6; /home/ahirice/Documents/git/pharosville/src/harbour/civic/flows.ts:2; /home/ahirice/Documents/git/pharosville/src/harbour/civic/yard.ts:39.
- Wreck cues comprise cause-family form, peak-cap size/rank, epitaph posts, the top-20 memorial, dusk lanterns and a recent-death wreath. Transitions include tow, launch, recovery sail-setting, flagship flag breakout and three reef-beacon flares; the Day book records confirmed changes. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/fleet/wreck-cove.ts:8; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/wreck-cove.ts:68; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/wreck-cove.ts:468; /home/ahirice/Documents/git/pharosville/src/harbour/life/moments-stage.ts:6.
- Decorative cues include clock/calendar lighting, moon/stars/meteors, seasons/foliage, distance haze, shadows/reflections, wakes, townsfolk/animals and wind-driven dressing. Lamps light in a dusk wave, whose direction reverses when Pharos is unlit. Interaction cues include hull/building illumination, selected routes and tags. The existing keyboard list is buried below the legend. Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:107; /home/ahirice/Documents/git/pharosville/src/harbour/lights/lamp-wave.ts:4; /home/ahirice/Documents/git/pharosville/src/harbour/ui/KeyList.tsx:19; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:322.

## Findings

### S03-F1 [high] Storm-station text describes the wrong analytical encoding

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/readings/bind.ts:194; /home/ahirice/Documents/git/pharosville/src/harbour/readings/storm-cones.ts:6; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:99; /home/ahirice/Documents/git/pharosville/src/harbour/ui/facts.ts:181; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:371
- Detail: The renderer hoists zero to four shapes for the weighted DEWS band, with a Danger pennant. Legend, hover and panel instead describe one cone per Alert+ coin, up to five. An existing binder test explicitly demonstrates one alerted coin with no station cone because the weighted band remains Calm.
- Fix: Describe weighted-band shapes consistently across all three surfaces. Keep the individual Alert+ count as a separately labelled statistic; retain the five-coin masthead ranking. Add DOM parity coverage using the existing Calm-with-one-alert fixture.

### S03-F2 [medium] The legend calls analytical distress motion decorative

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:71; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/fleet-system.ts:966; /home/ahirice/Documents/git/pharosville/src/harbour/sim/sim.ts:960
- Detail: The Boats explanation says wind, heel and sails are decorative. Shoals arrival explicitly drives distressed heel and loose, flogging canvas, while storm motion responds to DEWS weather. This blanket statement teaches visitors to disregard part of the real signal.
- Fix: Distinguish ordinary sailing animation from Shoals distress and weather response. Name the off-peg placement, distressed canvas and checkered flag together, using the boat panel’s wording.

### S03-F3 [medium] The legend omits several rendered analytical cues

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:63; /home/ahirice/Documents/git/pharosville/src/harbour/readings/tide-gauge.ts:6; /home/ahirice/Documents/git/pharosville/src/harbour/civic/civic-system.ts:29; /home/ahirice/Documents/git/pharosville/src/harbour/fleet/wreck-cove.ts:68; /home/ahirice/Documents/git/pharosville/src/harbour/life/moments-stage.ts:12
- Detail: There is no tide-gauge entry. Missing explanations also include station shape combinations/night lanterns, coin signal shapes, checkered distress flags, movers hoists, Registry grade shields, wreck cause forms/size/memorial/wreath, and reef-beacon flares. Hull families/classes and sea-state middle thresholds are named only generically. Some details exist in separate panels, but the central key does not connect visitors to them.
- Fix: Complete the existing on-demand legend with concise cue explanations and links to the relevant panels. Reuse existing mappings and constants rather than inventing new interpretations.

### S03-F4 [medium] Ledger readings lack source freshness and unavailable explanations

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:180; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:215; /home/ahirice/Documents/git/pharosville/src/harbour/ui/bits.tsx:7; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:849
- Detail: Supply, deviation and grade remain readable without identifying their independently stale sources or observation ages. Missing values collapse to an unexplained dash. The corner’s aggregate status cannot identify which column is held; opening the ledger also covers the corner mark. Detailed source truth already exists in the Keeper’s Log.
- Fix: Add compact per-source status/as-of text inside the ledger, associated with relevant columns. Distinguish unavailable readings from unrated grades, and link to the existing Keeper’s Log.

### S03-F5 [low] Legend descriptions drift from current thresholds and identity rendering

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:81; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:95; /home/ahirice/Documents/git/pharosville/src/harbour/identity/labels.ts:56; /home/ahirice/Documents/git/pharosville/src/harbour/readings/bind.ts:45; /home/ahirice/Documents/git/pharosville/src/harbour/readings/bind.ts:123
- Detail: Chain water names are promised although permanent lettering explicitly skips harbours; C supplies those names. Office works/furling are described as requiring ±8%, although they persist to ±6%. Heavy sea begins at 10%, while the legend says over 10%. The daylight/night paragraph also omits the lamp-wave direction exception for an unlit Pharos.
- Fix: Correct these explanations using the current constants and distinguish permanent sea-zone lettering from optional chart names. State entry and release thresholds for office dressing.

### S03-F6 [medium] Loaded search has no explicit pointer-accessible close action

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:66; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:90; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:107; /home/ahirice/Documents/git/pharosville/src/harbour/ui/DetailFallback.tsx:45
- Detail: The loaded component invokes onClose only for Escape and renders no Close button. Touch visitors with an empty or unsuccessful query receive no dismissal instruction. Selecting something in the underlying world can dismiss search, but also changes selection/camera. The loading fallback already offers an explicit Close action.
- Fix: Keep a visible, adequately sized Close button in the loaded search and route it through the existing closeSearch focus-restoration path.

### S03-F7 [low] Wreck ledger rows cannot open their world record

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:229; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:434; /home/ahirice/Documents/git/pharosville/src/harbour/ui/picking.ts:401
- Detail: Coins, Chains and Pre-launch expose selection buttons; Wrecks renders a static bold name. Visitors cannot locate a wreck or open its sourced obituary from this table, although both the Wreck Cove panel and picking service already support that path.
- Fix: Make wreck names buttons using the existing wreck-selection helper, preserving live-payload wreck handling and the existing camera fallback to Wreck Cove.

### S03-F8 [medium] Ledger selection leaves the ledger over the camera destination

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:183; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:322; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:349; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:319
- Detail: Selecting a row closes search but leaves ledgerOpen unchanged. Camera framing clears the right-hand detail panel or bottom sheet, without accounting for the 700-pixel left ledger. Consequently, “show in the harbour” can place the selected hull in the area still occupied by the ledger.
- Fix: An explicit Locate action should dismiss the ledger before flying. Preserve the ledger’s query, sort, tab and originating row so returning restores the research context.

### S03-F9 [medium] Chart collision culling ignores other overlay surfaces

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/ChartLabels.tsx:43; /home/ahirice/Documents/git/pharosville/src/harbour/ui/ChartLabels.tsx:59; /home/ahirice/Documents/git/pharosville/src/harbour/ui/cull.ts:7
- Detail: Culling considers chart-label rectangles and viewport edges only. It suppresses a hovered/selected object’s own duplicate name, but has no exclusion rectangles for its hover tag, the corner mark, search, ledger or panel. Other labels can overlap a tag or occupy covered areas. Leader lines are also outside collision calculations.
- Fix: Supply cached overlay exclusion rectangles to the existing culler. Prioritize text clearance; handle leader crossings only where they demonstrably impair reading.

### S03-F10 [low] Search active-result index can become invalid

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:63; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:83; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:87
- Detail: ArrowDown with no matches stores -1. Active resets on query edits, but not when a feed update changes the result list. Results appearing or shrinking under an unchanged query can therefore leave aria-activedescendant pointing to a nonexistent option and Enter doing nothing.
- Fix: Ignore result-navigation keys when empty and clamp active whenever results change. Add component tests for empty navigation and live result replacement.

### S03-F11 [low] Switching ledger tabs discards the visitor’s working state

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:24; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:50; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:136
- Detail: Each table owns query and sort locally and unmounts when its tab changes. Closing the ledger also unmounts LedgerBody. A visitor checking a chain or legend explanation loses their filtered/sorted coin list and returns to defaults.
- Fix: Retain small per-tab query/sort state above the tab bodies, surviving ledger close. Reuse that state for optional share links.

### S03-F12 [low] Mint/Burn prose omits the latest-hour activity input

- Evidence: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:85; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:664; /home/ahirice/Documents/git/pharosville/src/harbour/civic/flows.ts:51
- Detail: Legend and panel describe work as proportional to dollars over the last 24 hours. Actual activity is logarithmic and blends 60% daily hourly mean with 40% latest closed hour, then applies net-flow dominance. Equal daily totals can therefore produce different visible work.
- Fix: Explain that activity reflects the day with extra weight on the latest completed hour, on a compressed scale. Keep exact daily/hourly values available in the existing panel.

## Ideas

### S03-I1 Repair storm-station semantic parity

*informative · data-bound · effort S · impact 5 · confidence 5*

- What: Replace coin-count station explanations with the weighted-band shape sequence in legend, hover and panel. Display the Alert+ coin count separately. Add a DOM parity test beside the existing binder fixture.
- Visitor benefit: Visitors can interpret the mast correctly even when a small distressed coin does not change aggregate weather.
- Data/DOM: Source: model.readings.weather.band from supply-weighted DEWS. Calm: none; Watch: cone; Alert: two cones; Warning: two cones plus drum; Danger: two cones plus two drums and pennant. Unknown: unavailable. Keep individual alerts explicitly separate.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:99; /home/ahirice/Documents/git/pharosville/src/harbour/ui/facts.ts:181; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:371
- Perf: No GPU cost; negligible text and test bytes.
- Risks: Do not remap the renderer or confuse station band shapes with per-coin masthead shapes.
- Depends on: —

### S03-I2 Complete and correct the existing visual key

*informative · data-bound · effort M · impact 5 · confidence 5*

- What: Extend existing legend entries with compact disclosures for omitted cues, exact thresholds and unavailable poses. Add buttons opening the corresponding landmark panels. Correct distress, chain lettering, office hysteresis and flow activity wording.
- Visitor benefit: One on-demand reference explains every analytical mark and directs visitors to its exact reading.
- Data/DOM: Reuse hullClassFor, rigFor, seaStepForShare, office thresholds, tide scale, STORM_SIGNAL_SHAPE, FAMILIES, WREATH_DAYS and REEF_FLARE_LINE. Include source, threshold and neutral-state text; test representative DOM wording against those mappings.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:63; /home/ahirice/Documents/git/pharosville/src/harbour/model/classify.ts:20; /home/ahirice/Documents/git/pharosville/src/harbour/readings/bind.ts:23; /home/ahirice/Documents/git/pharosville/src/harbour/ui/facts.ts:52
- Perf: Estimated 2–5 KB compressed text/UI; no draws or triangles.
- Risks: Avoid an overwhelming wall of prose. Keep details collapsed and preserve the chart-paper voice.
- Depends on: S03-I1

### S03-I3 Add analytical filters inside the Coins ledger

*informative · data-bound · effort S · impact 5 · confidence 5*

- What: Add Off peg, Early warning and Missing peg reading filters, plus peg and chain selectors. Combine them with the existing name filter and show a clear reset action and result count.
- Visitor benefit: Researchers can isolate relevant coins without searching every symbol or interpreting scenery first.
- Data/DOM: Off peg uses activeDepeg === true from pegSummary; Early warning uses dews in ALERT/WARNING/DANGER; Missing peg reading uses nullPeg. Chain matches any chainShares entry, not only Home. Label held/unavailable source states and test combinations.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:153; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:180; /home/ahirice/Documents/git/pharosville/src/harbour/model/types.ts:93
- Perf: One O(n) filter pass per edit; no world rendering cost.
- Risks: Never derive off-peg status from a new arbitrary bps threshold or silently exclude unknown readings.
- Depends on: S03-I4

### S03-I4 Put provenance beside ledger readings

*professional · data-bound · effort S · impact 5 · confidence 5*

- What: Add a compact source-status disclosure for Supply, Deviation, Early warning and Grade, including age/as-of information and a Keeper’s Log link. Give unavailable and unrated values distinct accessible text.
- Visitor benefit: Visitors can tell whether a number is current, held or absent without leaving their table.
- Data/DOM: Use model.truth.stablecoins, pegSummary, stress and safetyGrades state/ageSec. DOM repeats current, stale or unavailable per source. Preserve held values with labels; unknown stays unknown. Test independently stale sources.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:180; /home/ahirice/Documents/git/pharosville/src/harbour/ui/bits.tsx:162; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:849
- Perf: Small DOM addition; reuse model updates rather than adding polling.
- Risks: Do not present one aggregate freshness timestamp as covering every column.
- Depends on: —

### S03-I5 Improve search recovery with aliases and bounded typo matching

*professional · ux · effort M · impact 4 · confidence 5*

- What: Preserve current exact/prefix tiers. Add explicit chain/place aliases and a one-edit or adjacent-transposition fallback only when stronger results are absent. Reuse chain metadata/resolution where applicable.
- Visitor benefit: Common names and minor typing mistakes reach the intended coin or place without weakening ticker precision.
- Data/DOM: Aliases identify existing entities only. Label typo suggestions as suggestions; never reinterpret a financial value. Add ranking fixtures for ambiguous tickers, renamed chains, landmarks and misspellings.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/search.ts:25; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:29; /home/ahirice/Documents/git/pharosville/shared/lib/chains.ts:167
- Perf: Estimated 1–3 KB compressed; bounded matching over roughly hundreds of short strings. Benchmark a 1,000-item fixture.
- Risks: False positives can select the wrong asset. Exact ticker/name matches must always outrank corrections; avoid importing a large registry eagerly.
- Depends on: —

### S03-I6 Make search dismissal and keyboard state reliable

*professional · ux · effort S · impact 4 · confidence 5*

- What: Add the missing Close button, clamp active-result indices, announce no-results/result-count changes, and associate the combobox with its keyboard hint. Preserve existing focus restoration.
- Visitor benefit: Touch, keyboard and screen-reader users can recover from an unsuccessful search and reliably select a result.
- Data/DOM: n/a; interaction-state corrections. Test empty ArrowDown, live result replacement, Enter, Escape, explicit Close and restored focus.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:74; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:47; /home/ahirice/Documents/git/pharosville/src/harbour/ui/DetailFallback.tsx:45
- Perf: Negligible DOM/JS; no graphics work.
- Risks: Avoid duplicating live announcements on every render or introducing a focus trap into the non-modal workflow.
- Depends on: —

### S03-I7 Add useful search previews and recent selections

*informative · data-bound · effort M · impact 4 · confidence 4*

- What: Show a restrained preview for the active result: entity type, supply, peg deviation and primary chain where available. An empty query offers the last five selected entities from session memory, with Clear.
- Visitor benefit: Visitors distinguish duplicate tickers and return to previously inspected records quickly.
- Data/DOM: Use existing id/name/symbol, supply, pegDeviationBps, activeDepeg and chainShares; annotate source truth. Do not infer safety from missing deviation. Preview is text only; moving through results does not move the camera.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:13; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Search.tsx:102; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:322
- Perf: One small preview DOM block and five stored IDs; no new API requests or GPU cost.
- Risks: Keep the dialog compact on admitted tablets. Recent IDs must tolerate coins leaving the register.
- Depends on: S03-I4, S03-I6

### S03-I8 Separate reading a record from locating it

*professional · ux · effort M · impact 5 · confidence 5*

- What: Offer clear Read record and Locate actions. Reading uses select with fly:false; Locate dismisses the ledger before the existing camera flight/highlight. Add wreck-row selection and a Return to ledger action restoring the originating row.
- Visitor benefit: Researchers inspect exact values without unwanted travel, then deliberately connect the row to its boat or wreck.
- Data/DOM: n/a; reuse existing entity IDs, selection highlight, route and camera behavior. No new market encoding or bulk fleet dimming.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:183; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:229; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:322; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:434
- Perf: Reuse existing selection rendering; small DOM/state cost.
- Risks: Preserve reduced-motion camera cuts, focus return and distinct boat/wreck ID handling.
- Depends on: S03-I11

### S03-I9 Make C labels aware of open UI

*professional · ux · effort M · impact 4 · confidence 5*

- What: Extend the existing culler with cached exclusion rectangles for the corner controls, tag and open tools. Retain current priority and occlusion rules; add small visibility hysteresis only if boundary flicker is demonstrated.
- Visitor benefit: Names stay readable around the information surfaces the visitor is using.
- Data/DOM: n/a; placement changes only. Preserve aria-hidden chart labels and accessible search/ledger equivalents.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/ChartLabels.tsx:39; /home/ahirice/Documents/git/pharosville/src/harbour/ui/cull.ts:7; /home/ahirice/Documents/git/pharosville/src/harbour/ui/measurements.ts:5
- Perf: O(labels × a few obstacles); no GPU cost. Reuse ResizeObserver caching and separated read/write phases.
- Risks: Excessive exclusions could remove too many names. Validate edge placements and admitted tablet layouts on real captures in implementation.
- Depends on: —

### S03-I10 Bound large-table density with simple paging and column choices

*professional · data-bound · effort M · impact 4 · confidence 4*

- What: Keep native tables and sticky headers. Add 100-row pages with an explicit Show all option; expose optional Early warning, Peg coverage and Hull class columns. Preserve identity and key numeric columns.
- Visitor benefit: A 600-plus-coin register becomes easier to scan and traverse without hundreds of intervening row buttons.
- Data/DOM: Columns reuse dews/dewsScore, nullPeg and hullClass. Show unavailable source states through S03-I4. Paging changes presentation only; filtering/sorting always applies to the complete dataset.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:133; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:169; /home/ahirice/Documents/git/pharosville/src/harbour/ui/harbour-ui.css:337
- Perf: At 600 rows, default mounted body falls from about 4,200 cells to 700 with seven columns. No measured latency claim; no virtualization dependency.
- Risks: Maintain native table semantics, page announcements and focus after sort/filter changes. Show all preserves a complete reading path.
- Depends on: S03-I4, S03-I11

### S03-I11 Retain and share ledger state

*professional · ux · effort M · impact 4 · confidence 5*

- What: Keep per-tab query, filters, sort and column choices in UI state across tab changes and close/reopen. Add an explicit Copy view link that serializes a small validated URL state.
- Visitor benefit: Visitors keep their research context and can send colleagues the same live table view.
- Data/DOM: Serialize presentation state and stable IDs only. Label links as live views, not historical snapshots. Allowlist tabs, columns, sort keys and filter values; cap query length and tolerate removed IDs.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:24; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:136; /home/ahirice/Documents/git/pharosville/src/harbour/ui/store.ts:21; /home/ahirice/Documents/git/pharosville/src/harbour/ui/mount.tsx:9
- Perf: Small state/URL parser, estimated 1–3 KB compressed; no extra endpoints.
- Risks: Do not serialize secrets, readings or private session history. Restore state only after the existing viewport admission and model availability.
- Depends on: —

### S03-I12 Compare two coins inside the ledger

*informative · data-bound · effort M · impact 4 · confidence 4*

- What: Allow two rows to be selected for an on-demand comparison table covering supply, peg, deviation, early warning, grade and chain distribution. Include individual Locate actions and source statuses.
- Visitor benefit: Researchers can inspect differences without repeatedly opening and remembering separate panels.
- Data/DOM: Reuse Boat fields and existing chainShares, formatting and source truth. Preserve raw categorical meanings; introduce no composite score, winner label or new thresholds. Test null/stale values and duplicate symbols.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:180; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Panel.tsx:114; /home/ahirice/Documents/git/pharosville/src/harbour/ui/bits.tsx:37
- Perf: Two small DOM records; no new data fetching, charts or world draws.
- Risks: Keep comparison explicitly requested and contained within the ledger. Do not imply that unlike grades or missing inputs establish investment quality.
- Depends on: S03-I4, S03-I8

### S03-I13 Make the existing keyboard guide easy to reach

*professional · ux · effort S · impact 3 · confidence 5*

- What: Add a Keyboard jump near the ledger heading and a ? shortcut opening the existing KeyList location. Add aria-keyshortcuts to existing controls and document search arrows/Enter alongside world keys.
- Visitor benefit: Visitors discover the shipped navigation features without scrolling through the entire legend.
- Data/DOM: n/a; reuse KeyList rather than creating another instruction inventory. Test focus landing, Escape restoration and shortcut suppression while typing.
- Where: /home/ahirice/Documents/git/pharosville/src/harbour/ui/KeyList.tsx:5; /home/ahirice/Documents/git/pharosville/src/harbour/ui/Ledger.tsx:124; /home/ahirice/Documents/git/pharosville/src/harbour/ui/App.tsx:70; /home/ahirice/Documents/git/pharosville/src/harbour/ui/CornerMark.tsx:63
- Perf: Negligible bytes and DOM; no persistent toolbar expansion.
- Risks: Keep shortcuts inactive in editable fields and avoid adding another overlapping dialog.
- Depends on: —

## Top picks

1. S03-I1 — Highest-priority truth correction: fixes three misleading surfaces without changing world rendering.
2. S03-I4 — Small change that makes every ledger number more trustworthy and supports later analytical features.
3. S03-I3 — High research value from existing fields and a simple filter pass; fully contained within D11.
4. S03-I6 — Cheap, concrete improvements to touch dismissal, keyboard selection and accessible feedback.
5. S03-I2 — Completes the product’s teaching surface and repairs multiple semantic gaps with zero GPU cost.

## Operator decisions


## Cross-lane hooks

- Readings/weather owners should confirm station vocabulary and source-state policy before S03-I1/I2; preserve the existing weighted-band renderer and separate individual-coin alerts.
- Fleet/civic owners should review glossary coverage for distress flags, stern-lantern asymmetry, masthead shapes, office hysteresis, flow blending, wreck forms/wreaths and staged moments.
- Interaction/layout owners should coordinate S03-I8/I9 around ledger dismissal, focus restoration, cached overlay rectangles and tablet bottom-sheet framing.
- Performance owners should measure 600–1,000-row filtering, sorting and mounting before escalating beyond native-table paging; current code establishes DOM size, not observed slowness.
- Skipped: browsers, screenshots, full test suites and hardware measurements. Six read-only Node assertions passed; repository files were unchanged.
- Risk: visual legibility, touch behavior and assistive-technology outcomes remain unverified at runtime; implementation needs focused DOM checks and permitted real-GPU review.
