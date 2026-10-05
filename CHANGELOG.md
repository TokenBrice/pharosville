# Changelog

PharosVille release notes are collected from commit history and mirrored into the in-app changelog panel. A version is published only when the protected workflow also creates its semantic tag and GitHub Release; see `docs/pharosville/RELEASES.md`.

## Unreleased - Garden Observatory

Work in progress on `feat/garden-observatory`; see `agents/2026-10-05-garden-levers/00-implementation-plan.md`. Renamed and mirrored into the in-app changelog only by the release PR.

- Restricted first-paint time and night capture pins to localhost alongside the date pin, so shared production links cannot misrepresent the arrival veil's local daylight; updated its exact inline-script CSP hash and added a regression contract keeping the literal no-JS, loading and small-screen guide descriptions synchronized.
- Corrected reading-atlas crop authoring against the production projection, canonical water field and conservative scene envelopes, with reproducible lighthouse/sail framing and explicit pending water where a complete signature cannot be identified. Atlas publication now preserves pending reasons and omits their image/source entries, retaining the reading key's text-only fallback rather than certifying misidentified water.
- Corrected hero timber and spar shader ordering so per-vertex metalness is restored only after its PBR local is declared, retaining authored metalness maps; all eight hero models now have composed-fragment regression assertions for declaration-before-write ordering across their solid, canvas and identity-sail variants.
- Fixed the low-sun Pharos white bloom band at its shared print-ink source: signed diffuse colours no longer divide by a near-cancelled luminance, and scale-normalized, physically bounded remapping prevents HDR spikes across every inked PBR consumer. Operand bounds also prevent extreme finite inputs from overflowing before the colour mix. The original noon/night ink path, masonry, apertures and warm lamps are retained; transitional solar and reflection ceilings now bound radiance rather than leaving an unbounded residual. Temporary tower and bloom inspection probes were removed.
- Fixed intermittent bloom-wide black rectangles by rejecting non-finite HDR components and bounding runaway highlights before luminance enters the blur pyramid, retaining source-depth alpha and tight low-sun glow. Smoke colour derivatives now resolve before alpha discard, and koi Fresnel keeps a nonnegative `pow` base. The temporary owner-hiding diagnostic was removed after the operator's 36-frame GPU control recorded no black regions.
- Sail panels and water-light strokes now resolve their antialiasing gradients before spatial exits, sail dissolve runs after texture and normal work, and collapsed cloth footprints/tangents stay finite instead of seeding bloom-wide black flashes. Wake-field clears, feedback and contact passes restore the caller's render target, cube face, mip, viewport and scissor even after a failed draw; failed static contact stays dirty for a real retry instead of certifying a partially painted field.
- Corrected low-sun colour transport at its source: sky scattering accounts for sunlight reaching different heights, sky and air no longer blend the solar horizon twice, clouds use diffuse illumination, and shade/alpenglow retain local colour. Bounded forward scattering, a depth-tested sun and source-depth-aware, tight low-sun bloom preserve the Pharos silhouette instead of flooding it with glare. Low-sun gilt reflections share the finite solar radiance budget instead of clipping into white patches; tower apertures keep warm, tone-mapped lamp fills. Noon/night atmospheric transport and reflection, camera exposure and grade are unchanged.
- Garden sound now explains its shore water, pine wind, modal basin drips and distant harbour work before consent, sharing the visible wind clock, source positions and night hush rather than adding a generic bed. A grounded bowl replaces one south stone companion; quiet drips and needle rustle displace shore/hiss energy within the existing voices and buses. Sound stays lazy and gesture-only, including debug auditions; Still and reduced motion are silent, close active audio and require a fresh Sound gesture afterward, with the existing remembered preference unchanged.
- Selected facts now appear and receive focus immediately instead of waiting for camera arrival; measured collapsed and expanded sheets reserve their real screen space while a bounded, deterministic camera solve weighs clear sight lines, readable identity, neighbouring hulls, restrained sky and shoreline context. Already valid views stay still and moving selections follow their displayed tile.
- Small screens now receive a branded garden guide and useful Pharos analytics links, with size advice secondary and no claim of embedded live tables. Accepted local-hour portrait/landscape illustrations are explicitly not live readings; missing publication or failed images leave useful text instead of old harbour photos. Added a deterministic local-capture generator for all five light beats and the truthful garden social card, with source/crop hashes and per-still byte caps.
- Replaced forced-home wandering with an inspectable six-station Stroll: Previous/Next follow shore and stair corridors, local wheel/drag keep the viewpoint, inspection closes back where you stood, and only Home returns to the seat. Idle never tours; reduced motion cuts directly and station/path captures share the production camera route.
- Real-GPU preview now separates refresh-free resting pacing from shadow, atlas and data-refresh work, keeps both resource peaks under unchanged caps, and names the largest measured pass span without treating overlapping Metal timers as costs; authored station and route-progress captures share the same honest settling lane.
- The four pond koi now follow seeded near-bank journeys with real pauses and in-place turns instead of repeating mirror loops; the lone heron moves to the tea-side shallows without a brighter glow. Two cached tree roots now receive the same travelling gust through baked trunk, branch and tip flexibility, while reduced motion holds complete animal poses and leaves the near trees still.
- Find, the ledger and changelog now share the garden's day/night ink-and-sheet language, with fine rules instead of nested frames and one reduced-motion-safe panel entrance. Find `/`, Explore and Read key are distinct actions on a wrapping edge grid; long health warnings stay readable, keyboard focus returns to its opener, and the ledger remains one complete body.

- Evaluated conditional contact softening and did not build it: existing five-tap cached PCF already grounds the reviewed foreground, while the proposed eight-blocker/sixteen-filter search requires 24 fetches per participating fragment without evidence meeting the no-measurable-regression ceiling. No dormant pass or flag ships; reconsider only after an operator-reviewed grounding failure on calibrated hardware.
- Shallow water now carries the shore's world-registered stone and sand through restrained absorption instead of an approximate ellipse seabed; terrain and edge stones share physical wet-contact thresholds, sheltered reaches stay dark and still, and only sparse exposed shores lap. Renderer-owned surface textures remain borrowed, without a refraction pass, new draws or changes to obstacles and the sole analytical supply tide.
- PharosVille now welcomes you with identity, a truthful reading guide and analytics links before any module loads, then reveals the fully composed garden as soon as data and renderer preferences are ready instead of rising through nine seconds of extra haze. The independent reading key keeps warning precedence intact; cold filmstrips and fixed panel/shell captures record actual navigation-relative readiness without invented progress or first-byte timings.
- Harbour timber, plaster, roof tile and stone now share restrained surface recipes without extra material buckets; fleet timber retains its wet hull and age finish, hero merges preserve compatible shared maps and authored UVs, and lighthouse/precinct stone adopts the same preparation while identity cloth, issuer trim, lamps and planting keep their exemptions.
- Working harbour stations now use fitted timber bays, recessed plaster, boarded verandas and thick, gently sagged hip/gable/irimoya roofs with tile ridge courses and exposed rafters, all inside the existing shared material draws; supply frontage, station heights, berths, banners, noren, cargo lanes and kindling remain unchanged.
- Rebuilt vessel craft around one open timber shell, recessed working deck and thin catching rail: carriers lift both ends, working boats retain fine bows and opposed sails, and compact junks carry raised sterns and asymmetric batten fans. Full and far boats share authored hull anchors without losing twin-hull water slots, river cargo banks, squat scows or issuer marks.
- Moored and anchored sails now hang in a bounded downward curve with much quieter fill and flutter instead of remaining wind-filled banners; identity marks stay unfurled, hero cloth shares the same state, transient sail dips keep their bounds, and reduced motion holds one complete slack pose without animation or extra geometry.
- Rebuilt the chaseki as a grounded timber-and-plaster shelter with an open boarded veranda, threshold step and thick quiet hip roof; its lantern, keeper route and ridge gulls now share architectural anchors. The precinct's flat engawa slab becomes a restrained roof-and-rafter fragment without adding draws, textures, windows or monuments.
- Hulls now sit on a continuous, short-reach waterline bed rather than a long reflection smear; only movers leave local foam and soft slicks, filtered quietly by pixel footprint without changing motion intensity or hiding unselected truth. Moored hulls keep contact without artificial trails, low tiers preserve the same distinction, and reduced frames redraw contact only when it changes.
- Fleet detail now follows projected sail size with quiet pixel hysteresis instead of distance and nearest-boat rules: three current-supply leaders carry foreground emphasis, selection restores any small hull immediately, and bespoke heroes recede through the same family batches. Fine rig and secondary analytical cues stay footprint-appropriate or inspection-only; shared far silhouettes replace zoom thinning, so every hull stays drawn, selectable and keyboard reachable.
- The Pharos headland now falls through two unequal inclined shoulders and one exposed rock face, with interrupted planted pockets instead of concentric moss terraces; continuous beach, bedrock and quay reaches share static shore-contact descriptors while the court, pond shelf, stair, berths and sole supply tide remain unchanged.
- The Garden record, 30d now preserves up to 30 supplied UTC daily PSI closes with array-last-write-wins deduplication, exact timestamps, bands and methodology, explicit gaps and held source evidence; the lighthouse record and complete ledger share one native dated table, separate from the full Long Record.
- Replaced analytical pine growth and browning with one passive shallow gravel furrow beside the approach: fixed-width, oldest-left, 0–100 score axis, unjoined gaps and methodology edges, one mark for one close and neutral gravel for no data. Persistent texture-free buffers refresh independently of the island and follow the seated threshold under reduced motion.
- Added a reopenable live reading key for official PSI evidence, the five ordered water surfaces and exact supply-leader ranks, with a clear compressed-size caveat; at most two safely sited water names now remain at rest, and real-render exemplar crops can be published as a decorative local atlas without changing caption warning precedence or the complete ledger.
- Added development-only production-scene appearance presets, canonical local exports and a named-owner inspector; changes use the existing repaint and rebuild owners, preserve market semantics and leave the accepted production picture unchanged.
- Added a serial, blind X/Y garden-look lane on the existing real-GPU preview path, with independent DEV serving-tree provenance, pre-render appearance checksum checks, fail-closed comparison manifests, private randomized reviewer keys and cold winner recaptures.
- Daylight now shares one analytic sky-and-air transport across the garden, water, waterfall and reflections: clear near and middle distances give way smoothly to borrowed hills, while cached sky lighting follows the sun, accepted PSI clarity and lunar cloud light instead of freezing at midday. No atmosphere textures or draws were added.
- Sheltered timber, stone and waterside surfaces now receive smooth local sky/ground bounce from three bounded irradiance fields, replacing measured diffuse fill rather than adding lights; sunlit garden steps, identity cloth, practicals and sky reflections retain their existing lighting.
- The garden's composed sunlight now follows the season: lower winter noon casts longer shadows than summer, with seasons reversed in the southern hemisphere, while the seat-right bearing, sunrise/sunset timing and true solar beat boundaries remain unchanged.
- The six PSI skies now have distinct cloud silhouettes, from sparse cirrus and separated fair strokes through a high veil, broken low deck, nearly closed banks and a textured overcast ceiling; they share the garden's sky radiance, retain moonless indigo bodies and held-reading timing, and add no cloud draws or textures.
- Removed two unreferenced island/islet renderer snapshots left over from v0.17.0.
- Natural fish rings now have a one-second chance to appear, without retrying busy or missed moments; the midday and sunset calm still include their full attention span.
- The viewing garden now has one asymmetric moss-side composition: two low shelves, a recessed approach, half-buried unequal stones and steps disappearing behind them, framed by an open branching pine instead of solid cloud pads.
- The moss-side ground now shares dark fibrous olive moss and a narrow warm-grey gravel interval with rounded weathered stones, lit mineral crowns, dark buried contacts and four visible worn stepping tops; a fifth continues behind the reclining stone. Noon sun reaches the middle garden, grain and a dark under-edge line distinguish the engawa boards, a flat gravel inset is reserved for the dated record without decorative rake stripes, and rim rebuilds release the threshold's shared surface lease exactly once.
- Replaced the near pine's cloud-pad outline with rooted, tapered trunks and attached branches, twigs and dense flattened opaque needle clusters separated by real sky gaps; distant trees keep their inexpensive silhouettes, and reduced motion leaves the garden's two near trees completely still.
- The reading guide now separates PSI character from source quality, assigns each visual cue a rest, inspection or retired role, and removes obsolete audit-shield and threat-sky claims; hull proportions are authored by family rather than financial trait deltas, while exact facts stay in the record and ledger.
- First-visit teaching now waits in the live reading key until you explicitly dismiss it; input, elapsed time, hidden tabs and source warnings no longer mark unread guidance as seen, existing taught visitors stay taught, and denied storage still allows dismissal for the session.
- The coast now continues beyond all four chart edges with unequal headlands and outboard coastal bites; nearby scenery stays rooted as you move, while the two sea openings, berths and market geography remain unchanged.
- Added one texture-free PBR material language for moss, stone, gravel, earth, timber, plaster and roof tile, with clone-safe shader preparation and explicit protection for identity marks, data traces and practical lights.
- Added one shared, lazily leased surface atlas for soft moss, mineral stone, tended gravel, earth, directional timber, plaster and roof tile; independently authored PNG mips retain fibrous moss and granular gravel at the seat while fading quietly at distance, preserve mean pigments, and safely replace neutral GPU placeholders without geometry, decoder or shader-recompile overhead.
- Restrained shared moss, earth, timber and roof pigments under a supporting-world chroma ceiling while preserving the four anchors, ordered risk labels and DOM contrast; decorative coastal buoys now use weathered ochre rather than the reserved Danger/beacon vermillion, and neutral noon relies on daylight instead of a honey-coloured dye rationale.
- Extended the shared, metre-scaled surface family to the headland, raked gravel and decorative coast, preserving authored substrate coverage, smooth terrain and quiet wet contacts; removed the island's two bespoke surface maps, release terrain atlas leases on every rebuild and teardown, and keep outboard coast stones inside the scenery envelope and clear of station footprints.
- Garden model publishing now records reproducible source and output hashes, tool settings, strict glTF validation and a decoded geometry census, with a checked compiler hook for future surface-atlas mip strips.
- Night lighting now gives the garden cool sky and ground fill even without a moon, while the true moon alone supplies its rim; new aspect-specific picture measurements check shoreline contrast, material separation and approach readability without lifting exposure or water glow.
- Recorded the elected Moss-side observatory destination with annotated day, night and desktop-gate boards, an outcome rubric, and an atomic invariant charter that preserves analytical truth, access and global resource limits until each owning change lands.
- Repaired the live mint-and-burn contract and offline-cache schema drift: partial valuations keep unknown net flow unavailable, gross subtotals are labelled as lower bounds, and unknown coverage or flight-to-quality readings never become measured zero or moving work.
- Added a development trace that preserves exact expensive frames through renderer replacement, then fixed the measured resting-frame spike: idle camera breath no longer re-fits or re-bakes the static shadow map, while the visible view, genuine refreshes and resource caps remain unchanged.
- Added a reusable roof-led authoring kit with fitted timber bays, recessed plaster, open verandas and crafted stone-lantern chambers; metric grain UVs and surface roles are ready for later harbour adoption, without changing the live garden yet.
- Corrected Linux hardware-preview guidance to require a visible headed browser and documented paired M5 Pro calibration and shared resource budgets; Garden Observatory hardware evidence remains explicitly pending.
- Risk water now uses one shared static surface key: mirror, bending singles, interrupted pairs, oblique triples and close dark fours, with passive night contrast and retained distant coverage; Ledger and Wreck remain separate categories, and risk-only engravings, whitecaps and rain pocks are removed.
- Representative voyages now plan on the rendered garden's hull-clearance water for the sailing ship's own size, so a hull never cuts a channel too tight for it and never jumps when it is drawn.
- Resting ships now lie along their own berth's authored line instead of all facing one way when motion is reduced, while a quay dwell still lies along its quay; the pose travels with the berth, so a recomposed harbour never leaves a hull facing its old direction.
- The fleet now shares three unequal shore-following masses and sparse satellites, with one stretch of open water reserved and kept clear from both resting eyes and a second reported as it falls; supply leaders take legal front berths without growing their hulls, changing risk waters, dropping identities or moving retained neighbours. Capacity recovery stays bounded, keeps readable spacing and labels the rare crowded berth.
- Updated renderer and LUT guidance to match the shipped Khronos Neutral tone mapping, without changing the picture or fleet scale.
- Water now stays pond-calm across every risk body: seeded directional normals replace crossed checker chop, distant detail becomes restrained roughness, and shore shelter and slicks quiet optics without erasing the static risk key.
- The tower's water image now keeps recognizable inverted tiers and a sharp foot, interrupted by a few irregular strips; projected pixel footprint and optical roughness replace the old downward smear without adding another reflection pass.
- Overview water now remains continuous through the two open-sea corridors: the plate and surrounding sea keep shared physical air without the rectangular edge veil that made the garden look like a dark tray; risk surfaces, bounds and the resting view are unchanged.

## v0.20.1 - 2026-10-03 - Steady Lamp

The harbour light now settles when a feed keeps failing, so the lamp agrees with the record instead of staying steady through an outage.

Collected from commit `78f5255` after v0.20.0.

- The lamp follows the feeds again. The harbour light waits for a second observation before it dims, so one failed poll cannot make it flicker. That second observation was counted only when the world changed, and a feed that failed the same way twice left the world unchanged, so the light could stay steady through an outage while the record already said held. Every poll result and every tick of the page's observation clock now counts, so a repeated failure settles the light within one more observation.
- Nothing else changes. A single failure that recovers on the next poll still leaves the light alone, the record and ledger still report each source the moment it changes, and a regression test confirms that two identical failed polls settle the light without rebuilding the scene.

## v0.20.0 - 2026-10-03 - Clear Record

The harbour says exactly what it knows: every source carries its own state, the record and ledger state each coin's own readings, issuance is drawn only where it is real, and the seat you look from is better made.

Collected from commits `d9b80b5` through `950e885` after v0.19.2.

- The seat is better made. The near pines now read as flat, irregular cloud pads rather than domes, and the moss bank settles into a few broad olive-and-earth planes, darkest at the front edge, instead of a bright lawn. At night the bank and the deck edge stay just readable against the water, while the land stays darker than the sky and the beacon stays brightest.
- Every source speaks for itself. Each of the seven feeds now has its own state (current, held, missing or qualified, with coverage and as-of time) in the lamp, the caption and the ledger, so one stale feed can no longer hide behind a "current" summary. A ship's record uses its own row's observation time; a DEWS reading that is missing or unknown is shown as unavailable rather than calm, and an old reading is held and labelled rather than re-certified.
- The record states the coin, not the berth. The selected record gives the coin's own DEWS score exactly and drops the old berth-edge claim. Facts that used to vanish between the world and the card — evidence status, the squad override with the coin's own distress, route source, peg deviation, harbour concentration and health, the lighthouse's market stability and sky — now reach the record in bounded rows, with the same words in the ledger.
- Issuance is drawn only where it is real. Each ship's mint and redeem reading is now categorical (minting, redeeming, balanced, inactive, partial or unavailable) with gross and net, counts, window and coverage. Balanced activity loads one lighter and unloads another; the day's largest event is a single static lift with its exact amount and time in the record. Pace follows the 24h flow intensity only when the window is current and complete, and otherwise stays neutral and says "Unmeasured". Hull height now carries the peg alone. Moving cargo work is reserved for material activity under a declared policy (at least $1M gross and 1% of the coin's own supply or 0.1% of the covered fleet's gross), with only the top three working at overview; smaller activity keeps a still pose and its exact record.
- Quays and the log stay honest. Each harbour's share of the day's issuance is allocated over the whole reported scope, so hiding one harbour no longer inflates the others, and flow that lands on unrendered harbours, outside the reported scope or on coins with no chain presence is disclosed with its reason. The harbour log narrates only accepted market readings: a change in data quality or methodology is silent, and a coin that moves Calm → Watch → Calm → Watch gets three distinct entries.
- Faster and steadier. Live fleets plan in under two seconds instead of about thirteen, with byte-identical routes. The tower's static reflection now refreshes when the view, the size, the scene or the light actually changes. Ritual companions leave with the event that brought them, overview badges stay finite while a ship arrives, and a stricter minifier keeps the bundle inside its budget.

## v0.19.2 - 2026-10-03 - Harbors Return

The harbours and the day's issuance are back: the world accepts the live feeds' newly empty history windows instead of discarding both feeds.

Collected from commit `eb82a17` after v0.19.1.

- Every harbour renders again. The live chains feed now reports no 7- or 30-day history for its newest chains, and the mint/burn feed no longer sends a per-coin flow intensity and leaves the long windows empty for young coins. The world's safety check read those empty values as broken data and discarded both feeds, so no harbour was drawn, no ship had a dock to visit and the fleet's 24h issuance disappeared. Empty history windows and a missing intensity are now accepted as "not reported"; any value that is present must still be a real number.
- Nothing is invented. A harbour without a weekly figure shows none, and a coin without an intensity keeps the neutral pace, labelled as unavailable. A regression test covers the live shapes and confirms that infinite or non-numeric values are still refused.

## v0.19.1 - 2026-10-03 - Harbor Holds

The harbour opens again on today's data: one ship that could not plan an optional patrol leg no longer takes the whole world down with it.

Collected from commit `f484902` after v0.19.0.

- The world renders again. Today's live data put TrueUSD's risk berth exactly on one of its own open-water patrol marks, so the motion planner tried to sail a patrol leg of zero length, refused it as too short for the harbour's pace, and that refusal stopped the whole fleet from being planned — every visitor saw "The harbor did not render." An open-water patrol leg is optional: a mark that sits on the ship's own berth, or that no leg at the harbour's pace can reach, is now skipped, and a ship with no reachable mark rests at its berth.
- Nothing else moves. Dock voyages keep their strict pace contract, and every route that already planned is unchanged. A regression test builds a fleet whose patrol mark coincides with its berth and checks that planning completes without any leg breaking the pace contract.

## v0.19.0 - 2026-09-27 - Hour Print

PharosVille becomes an hour-print: one fixed view of the harbour, printed in the true light of every hour, with a small score of rare events and chrome that reads as paper and ink.

Collected from commits `5309629` through `8370409` after v0.18.0 (merged with v0.17.1 and v0.18.0).

- You sit in one place. The resting view is an authored seat on the south shore — a shaded moss bank, the edge of an engawa, a pine seen from below and a stone lantern — looking across an empty mirror inlet at the Pharos, right of centre on a new crag headland. Left alone, the harbour holds this view; nothing tours on its own.
- The sky keeps real time. One air carries distance from the near water back through five painted ridges. The sun and the moon follow a solar and lunar clock for your date and hemisphere, so December darkens before five and the full moon rises when it really does. Clouds are painted onto the sky from market stability — a clear sky at BEDROCK, a high veil, a broken deck, overcast in a meltdown — and the caption and ledger say the same word.
- Light prints rather than glows. Side light from the seat's right models the tower; shade takes a cool ink; a fine keyline finds edges against the sky at every hour; nothing glows by day. The lantern is the one fire and its beam breathes. Night is deep indigo, with the tower and ridges drawn in ink.
- The sea carries the sky and the risk. The water holds the hour's sky and breaks the tower's reflection into vertical strokes. Risk reads as the state of the surface — engraved lines on rough water, glass on calm and ledger water. Hulls leave real wakes and slicks, and a moon road runs toward you at night. A tidal flat bares or floods with the week's stablecoin supply, and a wrack line marks where the water stood at your last visit.
- The fleet is crafted. Square sails hang on braced yards with belly and a curved foot, dyed from one colour book and lit from behind like shoji. Bezaisen hulls run long and low under paper stern lanterns. Anchored boats ride bow to the wind, nod to the swell and heel in the gusts; sailing boats trim to the wind they feel. The far fleet recedes into ink. Station towers gave way to one low harbour vernacular with chain nobori, and both torii are gone.
- The garden is a garden. Cloud-pruned pines stand in odd groups beside clipped karikomi waves and a raked court with set stones, and a calendar of the seventy-two kō turns each maple on its own schedule for your hemisphere. The 88 stablecoins that died rest as unmarked stones in a raked garden on the Wreck Shoal shore, grouped by how they fell, and a lantern is lit there on their anniversaries.
- The day has a score. At most six events an hour, each followed by a long quiet. A grey heron arrives and leaves; gulls fly and settle on the crag; at blue hour the keeper walks the island path and lights the lamps — embers up the stair, the lantern, then the stations outward, the engawa lantern last. One significant arrival crosses the mirror inlet with the only nameplate. Rarer still: geese at first light in their season, rings where a fish rose, the maple letting go of its leaves in one afternoon gust, a meteor on a dark-moon night.
- The chrome is paper and ink. The page opens on the hour's own sky before any code loads. The caption is one sentence in three voices; the record card is washi by day and indigo at night and readable at every hour. Ship names are ink labels on a hairline, and the controls are one italic word, *explore*, with drawers on the same paper. Stay holds the view full-screen and keeps the screen awake; Wander (W) visits six postcards from inside the world; the lighthouse card unrolls the long record of the stability index; risk changes arrive one line at a time instead of in a panel.
- Sound, if you want it. An opt-in procedural sea bound to the harbour's clocks, with far bell buoys and a separate music switch. Nothing plays until you switch it on.

## v0.18.0 - 2026-09-22 - Safety Grades

The harbour reads the upstream Safety Score directly: every hull's grade comes from the free `/api/safety-grades` feed, and the cues that depended on the retired report-card inputs are gone rather than faked.

Collected from commit `2e1e028` after v0.17.1.

- Safety grades come from the live feed again. Upstream retired `/api/report-cards` on 2026-09-05, so the canary had failed every half hour since and the world had been opening without any safety reading. The proxy, client contract, smoke matrix and world model now read `/api/safety-grades` — one overall grade and score per asset — so the Safety grade fact, its accessibility-ledger clause, the D/F watch overlay and the grade-driven beam stiffness are live once more.
- Cues without a source are removed, not imitated. The Bluechip audit shield, the per-dimension rationale rows, the seaworthiness fittings (swung lifeboats, sealed chests, the customs brand) and dependency-formation placement all read fields the new feed does not carry. Each is deleted from the world model, the renderer, the detail panel, the ledger and the visual-cue registry, so no cue claims evidence the data no longer provides.

## v0.17.1 - 2026-09-10 - Dyed Cloth

The fleet flies its own colours and the far water has a surface: sails are dyed in the issuer's hue instead of a grey wash of it, and every risk body reads as water rather than a colour plate.

Collected from commit `2861d17` after v0.17.0.

- Sails wear the coin's colour. The cloth dye was mixed in linear light, which drained the colour out of every dark brand — half the fleet flew grey-blue and thirty more issuers were forced under black canvas. The dye is now judged perceptually: the brand's hue is kept exactly, its lightness is settled into a cloth range, its chroma is kept under the palette's ceiling, and a genuinely grey brand reads as undyed canvas. Circle is blue, Tether green, PayPal cobalt, Sky and Dai amber; only the five named pale issuers still fly dark cloth. The far third of the fleet keeps half again as much colour under the haze.
- The water has a surface everywhere. Calm and ledger bodies had their ripple flattened to a mirror of one sky tone, and the far bands lost their normal past a few hundred units, so whole risk waters rendered as flat fills with hard seams between them. Glassy water keeps a fine ripple, the far field keeps half its detail, the reflected sky grades from horizon to zenith with the viewing angle, and each named body carries a slow, mean-preserving value and depth variation so its risk colour reads as a volume of water. The harbour basin under the Pharos stays a still mirror.

## v0.17.0 - 2026-09-08 - Reborn

A stablecoin harbour you watch like a garden: the viewer stands on the near shore, the day has five lights, the fleet reads as boats, and the harbour keeps its own slow time.

Collected from commits `6c18ff4` through `62cc640` after v0.16.0.

- The viewer stands on the garden shore. The locked overhead view is replaced by a low perspective camera on the near shore: the Pharos rises on its headland across an empty inlet, its reflection broken in the water, pines lean over the frame's edge, borrowed headlands sit in the haze, and the fleet recedes into silhouette at believable scale. Every hull is still on screen; distance, not deletion, orders them.
- The day has five lights. Dawn, day, golden hour, blue hour and night are five authored lighting rigs that crossfade on the wall clock: neutral whites and blue-green water at noon, an amber horizon under a violet zenith at golden hour, indigo at blue hour, and a real night — dark as negative space, the beacon the one light, lit windows and lanterns as embers on the water, a moon road, stars.
- The beacon sweeps. A narrow bright core inside the soft cone flashes when it turns toward you; its road travels across the water; only the beacon, lantern cores and lit windows bloom.
- The water is a body, not a plate. Depth, darkening, seabed, lap foam and the wet band all follow the true shoreline; calm and ledger water read as glass; ember reflections are wind-bent broken strokes.
- The fleet reads as boats. Each coin's mark is printed into dyed cloth as a mon rather than a plate; hull families are spaced by value, not hue; hulls wear a wet collar and a varnished rail; sails glow from behind at dawn and golden hour; the cargo lighter is properly rigged; far hulls simplify so the near ones can carry rigging.
- The garden is a garden. Black pine, maple, cherry, bamboo and clipped karikomi replace the shrub domes; every station has a quay apron, piles, barrels and a lantern post; reed banks gather on the calm shores; vegetation goes to silhouette after dark.
- The harbour keeps its own time. A director admits at most one foreground beat at a time with six to twelve minutes of quiet between them: an arrival ceremony for the most significant arrival, the evening keeper walking the rim path lighting the fixtures while fireflies rise, a heron at dusk, gull pairs on slow loops, koi crossing the pond. One wind moves sails, flags, foliage, smoke and water; an eight-to-twelve-minute tide swings every moored hull; ships at open rest head into the wind.
- Data arrives instead of blinking. Market stability sets the sky's clarity with slow hysteresis and freezes when its feed is stale; a stale feed arrives as a bounded fog bank over its own water with a caption naming the feed and its last good time; the sea-sign boards hide at rest and rise when a water body is inspected.
- The chrome steps back. The default frame is the world, one sentence — "12:25 — a quiet noon · readings current" — and one quiet affordance; controls reveal on approach, focus or `/`; the detail panel is a woodblock record card; the attract mode holds six named postcards for minutes at a time; the gate and loading screens show a real still of the garden.

## v0.16.0 - 2026-09-07 - Air and Lantern

The harbour gains air, light and planting: distance reads as distance, every window wakes after sunset, the fleet rides the swell, and the garden is finally planted.

Collected from commits `52c7e12` through `d9c4782` after v0.15.0.

- Ships stopped wearing signs. A coin's mark is now printed into its sail cloth instead of pasted on as its own logo badge, so the same mark at the same size reads as canvas taking the light rather than a sticker; and the cloth is pulled toward its own brightness so a fleet of a hundred and eighty-five brands settles into one palette without any ship losing its colour or going darker.
- The whole fleet is mirrored in the water. Every hull lays a reflection, not just the twenty-nine largest.
- Distance reads as distance. Haze now builds across the harbour so the far shore and the far fleet sit back behind the near water, and the sea recedes harder than the Pharos does, which keeps the monument crisp against a softening background.
- The harbour lights up after sunset. Station windows, the lit quay edges, the tower's window rows, the keeper's gatehouse and the island's stone path lanterns all wake with the sky and bank down again at noon, each on its own curve so nothing competes with the beacon.
- The fleet rides the water instead of sitting on it. Hulls roll and pitch with the swell, not just rise and fall; the calm anchorage drifts instead of standing still; moored boats work against their lines at a pace you can see; and the wind gust that crosses the harbour every half minute is now visible on the boats it passes.
- A new kind of boat. The light two-masted courier — a needle hull under opposed triangular sails, the only bowsprit in the harbour — now carries the chartered issuers, so the most common hull drops from two ships in five to one in four and the anchorages read as a mixed fleet.
- The garden is planted. Shrub understory across the land rim, a second broadleaf species among the pines, clipped azalea along the island path, and a leaning pine on each islet — and the broadleaves turn with the season: blossom in spring, green in summer, mixed reds in autumn, bare in winter.
- Calm water reads as a mirror and Danger Strait as lead, both from the same reading the sea already carries; the sky sits in the water properly at every angle; and every coastline gets a soft wet edge where the water meets the rock, not just the island's.
- The frame has depth again. The corners and foreground carry real shadow, the near pines are cut by the edge of the picture so they frame it instead of standing inside it, and a fine paper tooth sits over the whole image.
- Midday stopped being the flattest hour. Light shafts now reach across the day rather than only at dusk, distant mist returns at noon, and the sun sits in the frame instead of behind the sea.

## v0.15.0 - 2026-09-07 - Honest Waters

Watch water pulled off the strait, the north-east ladder made honest, the graveyard off the Mole, two berths traded, and the whole garden re-lit in gold over violet shadow.

Collected from commits `76c7a14` through `a989bfe` and the 2026-09-07 composition consensus work after v0.14.1.

- Re-cut the east shelf so the Watch water sits inboard of the Alert channel and never meets Danger Strait or the Warning shoals: sailing east from the island now reads open water, Alert, then the strait, and the storm gorge keeps a short Alert shore below it before the Watch bay.
- Straightened the north-east corner so the diagonal from the island's lee to the strait mouth reads open, Alert, Warning, Danger once, with no band returning after it is left.
- Pulled the graveyard's wreck water off the Ethereum Mole's stern; the shoals now run as an east-west bar along the south rim, and no wreck water lies within six tiles of the Mole.
- Traded berths: Solana moors at the Watch east bay's market hall and Hyperliquid at the Danger gorge's fishing pier, so a trading venue reads as the strait's weather rather than the flagship peg reading as a false depeg.
- No harbor count, cemetery, lighthouse, rim contour, or opening moved; all eight water shares hold within a point of their targets.
- Re-lit the garden as the Golden Garden: a warm honey key over violet complement shadows, sunlit moss land, a turquoise-to-emerald-to-indigo sea, a cerulean day sky over a gold-cream horizon, violet dusk fill with a clean ember key, and a violet-indigo night with a quieter moon; the grade LUTs, water and sky ramps, island plate and month-record foliage all derive from the one palette.
- Turned the Pharos a quarter turn so its doorway and ramp face the east gatehouse and quay stair; the beam, beacon, fire and summit birds keep their bearings.
- Improved the harbor flags and separated Polygon's berth from TON's pigeonnier.

## v0.14.1 - 2026-09-06 - Room to Sail

The harbor opens back out around the new Pharos, station names step back into captions, and boats stop wearing signs.

Collected from commit `b74f42f` after v0.14.0.

- Opened the resting frame back out from the sailed-in close view to about twice the water, so the fleet is in view without zooming; the fleet stays complete through the first zoom-out steps and sail marks are fully legible at rest. The wide framing that reads as a harbor rather than a carpet still arrives on the approach to whole-map.
- Quieted the harbor station chips into captions: smaller, half transparent, no shadow, coming forward only under the pointer.
- Removed the persistent chips on ships failing the DEX cross-check or lying in Danger water; a ship carries a chip only while selected or during an arrival or departure beat. The cross-bearing buoy, water colour, detail rows and ledger still carry those readings.

## v0.14.0 - 2026-09-05 - Epic Pharos

The Great Lighthouse of Alexandria stands on a fortified platform in a closer, warmer harbor — and the deployed site finally shows its real models.

Collected from commits `f55afbc` through `fddc5ef` after v0.13.0 — the warm village waves and the Epic Pharos rebuild.

- Rebuilt the Pharos as the Wonder: a broad battered marble keep with three rows of lit arched windows, a frontal stair to bronze doors, a corbelled gallery with four Triton finials, a pilastered octagonal drum, and a columned lantern whose fire glows gold through open arches beneath a conical cap and the bronze Zeus — 38 units to the sceptre tip on a stylobate half again as wide.
- Set the tower on a fortified precinct: crenellated curtain walls, four corner bastions rising from the sea rock, a paved court and an east gatehouse the quay stair now climbs to. The keeper's cottage, three pines and the reflection pond moved to make room; the island's shipping footprint did not grow.
- Fixed the deployed site rendering the plain fallback lighthouse, fallback hulls and blank sails: the content-security policy blocked the WebAssembly model decoder and object-URL logo images. The static header check now requires both sources.
- Moved the resting camera in from a distant plate view to a sailed-in composition (zoom 1.0, never below 0.8), re-authored the idle postcards as close framings, and let the arrival move ease into the new rest. Whole-map remains one zoom-out away, and the hull count thins toward each water's main anchorage as you pull back so the wide view reads as a harbor rather than a carpet. The taller crown is seated with slightly less sky above it; compact laptop windows keep the crown, lantern and precinct in frame.
- Warmed the world at the source: the palette's chroma ceiling rose so land reads ochre and green against a more saturated teal-to-indigo sea, dusk is an ember hour with a raking key light and a navy zenith instead of a brown-grey wash, the horizon steps through three ridge planes, and Neutral tone mapping keeps those colors.
- Named the harbor: every chain station and the TON pigeonnier carries an always-on chip with its logo, name, and concentration state at every zoom, hiding rather than covering the lighthouse, controls, or an open record. Ships get a chip while selected, during an arrival or departure, or while failing the DEX cross-check or lying in Danger water.
- Made each of the six hull families its own color on a value-and-hue ladder while sails keep issuer identity, enlarged sail emblems, raised the smallest hulls off a 0.55 floor to 0.8, grew ordinary station halls, and framed the near corner with a pine group and a dark torii and fence.
- Gave the fleet readable beats: on arrival and departure a ship dips and resets its sails, throws a bow or stern wave into the wake field, and shows a brief nameplate, capped at six at once. Birds fly wider and more often, and three hearth stations smoke while their cargo tide runs — unlit, so the beacon stays the night's one light.
- Fixed a live-data crash when a small coin's berth coincided with its anchorage, and kept every batched sail within the GPU's vertex-attribute limit.

## v0.13.0 - 2026-09-05 - Clearer Waters

More recognizable harbors, cedar sea signs, and roomier boat traffic sharpen the garden around the lighthouse.

Collected from commit `3443462` after v0.12.0.

- Raised and enlarged chain flags, moved obscured staffs clear of roofs, and preserved complete logos and visible cloth at whole-map zoom. Flags now select their harbor directly.
- Replaced stone sea labels with cedar boards on wooden pilings and readable serif lettering. More distinct Watch, Alert, and Warning water colors retain soft transitions, while subdued night lettering keeps the beacon dominant.
- Restored the lighthouse island's mature pines at distant zoom and gave long cargo barges arched reed covers with dark supporting hoops.
- Spread busy anchorages across a wider berth fan, kept hulls clear of the Ethereum Mole's stone arms, and made crowded fallback berths minimize overlap. Soft underway avoidance now follows the positions actually drawn and yields to moored boats; saturated anchorages can still overlap.
- Removed the display-only voyage cap that caused jumps at arrival, kept sailing and docking clearance consistent, and recalibrated paired arrivals and departures for the longer routes.
- Fixed the opening camera move drifting back toward its starting pose after arrival, so the intended landing frame holds, including on compact laptop windows.

## v0.12.0 - 2026-09-05 - A Calmer Harbor

A more connected sea, a more composed still harbor, and direct controls for finding a ship or choosing the light.

Collected from commits `ab5a72b` through `619ca55` after v0.11.1.

- Softened the transitions between the seven waters, shaped the shore into smoother earth and local rock ledges, and gave the foreground pines bent trunks, unequal branches and a gradual appearance as you move closer. Smaller carved sea signs leave more attention for the garden.
- Restored the intended colors, normals and material differences in the large ship models, aligned the lighthouse reflection with the view, and fixed a constrained-quality shadow fault that could make opaque scenery disappear.
- Recomposed stillness around stable risk-water positions instead of crowding ordinary ships around their home docks. Moorings prefer clear hull space while keeping a safe fallback in busy coves, and ships turn through route hairpins without a sudden sideways flip.
- Added a visible Find action, a time-of-day control with a Local time reset, and a Still choice that respects system reduced motion. Shared ship and harbor links now bring their subject into view before revealing its record.
- Made reference panels native modal dialogs, added a keyboard shortcut past the map to its controls, and gave the harbor ledger section jumps, disclosures and actions to select a ship or station. Reading panels and search hold off the idle camera tour.
- Kept retained readings aging honestly during outages and bounded stalled or interrupted responses while preserving usable last-good data. Cached fixed sea-sign placement and shared repeated shield geometry reduce unnecessary work without reducing fleet visibility or raising resource limits.

## v0.11.1 - 2026-09-04 - Mole Errata

Corrects two overstated numbers in the v0.11.0 notes below, and restores the
size headroom that release consumed.

Errata for v0.11.0; the v0.11.0 entry below is left as published.

- The ring is eight harbor mouths, not nine: the TON cote stands on its own detached islet rather than on the rim, and appears only when TON carries supply. The world itself is unchanged — only the description was wrong.
- Station geometry roughly doubled per ordinary harbor and the Ethereum Mole is about six times the largest of the old stations; v0.11.0 claimed a fourfold rise across the board, and its phrasing could be read as more stations, when the rendered count has stayed at nine throughout.
- Raised the JavaScript size budget that v0.11.0 had left with twelve bytes of room, so the guard measures real growth again instead of failing on the next sentence anyone adds.

## v0.11.0 - 2026-09-04 - The Ethereum Mole

Ethereum leaves the west-shore cluster to stand alone as a monumental stone
mole — the harbor's counterpart to the lighthouse — while the other chains
spread into a ring of nine distinct harbors around the whole rim.

Collected from commits `3c1890d` through `2b3ba3a` after v0.10.0 — the epic harbor redistribution, monument, and authoring-fidelity waves.

- Rebuilt Ethereum as a monument instead of a bigger shed: a low civic hall under a deep hipped roof, an offset open belfry rising past every other roofline, and two unequal breakwater arms enclosing a still basin of water you enter through an angled gap. It is deliberately the lighthouse's opposite — measured masonry and a carved-out void where the Pharos is a natural promontory with a pale crown and fire.
- Spread the chain harbors from a four-station west-shore cluster into eight mouths around the rim, so the largest stretch of station-free shore falls from 111° to 49°, no three harbors crowd one neighborhood, and nothing else stands within thirty tiles of Ethereum. The precinct, its annex pavilions, the bridges that joined them and the station torii are gone; Base, Arbitrum and Polygon now keep self-standing harbors of their own.
- Gave every harbor a form you can name at a glance — a lantern-rowed travellers' inn, a market hall under a great hanging steelyard, a stepped stone inlet, a tea house's moon window, a thatched reed dome, a storm-mole lantern tower, a pigeon cote on its islet — each with its own chain accent, and a roof palette now governed by the same colour contract as the rest of the world.
- Rebuilt the buildings themselves: recessed bays, real shadow-casting reveals, chamfered hero edges, waterline foundations that join the shore, and windows that vary in number rather than brightness. Station density rises roughly fourfold while the night stays exactly as quiet — the lighthouse remains the one dominant light, and the Mole's belfry carries no glow at all.
- Fixed things the old cluster had been hiding: ships could report moored while rendering up to fifty-five tiles short of the berth, sail straight through a breakwater, or moor nowhere at all when the data feed spelled a chain's name differently; quieter shipping routes never took their turn in the lane rotation; and scenery could grow through a building because clearance was measured against the cove mouth rather than the harbor standing on it.

## v0.10.0 - 2026-09-03 - The Inhabited Rim

The harbor ring finishes its circuit: stations spread around the whole rim
including the near shore, every station roof becomes articulated craft instead
of a single plane, and the map's near edges end in land rather than stray open
water.

Collected from the 2026-09-03 operator follow-up polish after the Seven-Water Garden release.

- Spread the harbor stations around the whole rim — the far north keeps at most two, the camera-near southern shore carries stations of its own, both east and west extremes are inhabited, and outside the Ethereum precinct no three stations crowd one neighborhood — so the ring no longer reads as a distant row across empty foreground water.
- Gave every station an articulated roof — ridge beam and cap, eave fascia, gable or gablet end, bracketed eaves, and a pent skirt or stepped course breaking the plane — with one named signature element per station, taller second-level silhouettes led by the Ethereum campanile, and the chain flag held at 1.6 times its former scale.
- Carried the authored shoreline out past the map's south and east edges, where a band of open water used to float free of the garden, and dressed that near ground with thinning pines, occasional boulders, and gentle relief; the far horizons still dissolve into haze, the Danger Strait stays open, and no tile, route, berth, or reading changes.
- Re-laid Wreck Shoal as a quiet graveyard: eighteen dark, waterlogged, half-sunk hulls in four uneven groups with open water between them, bone-pale frames and ribs showing through, a few leaning masts and tattered pennants, and one lantern still burning on the largest wreck — cause colour stays a small desaturated mark on the grave stone, and every grave keeps its ledger and detail-panel record.

## v0.9.0 - 2026-09-02 - Seven-Water Garden

PharosVille becomes a spacious water-led garden: a soft-edged shore frames the
lighthouse, stations move to coves, and the fleet travels between places you
can read.

Collected from the 2026-09-02 Seven-Water Garden redesign waves 0–8 and the operator follow-ups after v0.8.0.

- Recomposed the world as a finite garden plate with an irregular rim, two openings, a graded sky beyond the shore, borrowed mountains in the fog seam, and an engawa foreground that gives the lighthouse room to breathe.
- Moved every chain to a shore station in its named water, each with a silhouette you can name from the default view — the Ethereum campanile precinct bridged to its annexes, a torii landing, a thatched reed dome, a storm-mole lantern tower, a signal mast — with lit stone quays and warm windows after dusk.
- Made the seven waters into places — Calm Anchorage, Watch Breakwater, Alert Channel, Warning Shoals, Danger Strait, Ledger Mooring, and Wreck Shoal — with distinct water character and boundary seams, larger edge geography, steles carved legibly at default zoom, and a quiet wreckyard of half-sunk hulls, spars, and grave markers that keeps its accessible ledger parity.
- Gave the fleet six East-Asian hull families and voyages with paired arrivals, departures, and long restless rests, so movement reads as a calm journey rather than a uniform field; every hull now stays on the water plate, and moored hulls sit at their station berths.
- Lifted the night so hulls, island, and rim still read against moonlit water, and lengthened the lighthouse beam to the rim with a soft volumetric tail and a light pool where it lands.
- Recomposed the tsukiyama with a continuous path, unequal niwaki, a single reflection basin, one hero waterfall, koi in the engawa shallows, and a regrade that lets day, dusk, and night fall across forms instead of filtering the frame.
- Funded the richer garden with world-wide wake and harbor batches, conservative water-safety lookup, draw census reconciliation, and whole-map N8AO release; the default frame is about 245 calls and 43 textures.

## v0.8.0 - 2026-08-13 - Garden of Light

PharosVille becomes a quieter, seasonal garden observatory where atmosphere,
motion, and ship craft reveal the same live evidence as the panels and ledger.

Collected from commits `9dd34ff` through `edf9385` after v0.7.2.

- Recast the harbor as a hand-built garden of light with authored day-to-night color grades, bokashi sky, shared height fog, harbor-wide shadows, low-sun rays, reflective pond water, sculpted headlands, a torii grove, koi, and restrained seasonal dressing.
- Gave the whole world one measured pulse: wind, sails, pennants, mist, wakes, lanterns, birds, water, and ship bob now breathe together, while the arrival, hover, selection, and idle-observe choreography remains interruptible and resolves to exact static states under reduced motion.
- Turned live evidence into physical craft. Issuance moves cargo and tenders, operating age weathers hulls, backing and redemption shape fittings, notable movers gather pigeons, dock health marks the quay, and stale instruments haze only the readings they can no longer support.
- Kept every new visual claim auditable through matching detail-panel facts, legend language, accessible ledger entries, truthful missing-data fallbacks, shareable moments, and calendar-driven harbor memories and rare daily sightings.
- Made the richer scene cheaper to hold and safer to ship by rebuilding only changed data, batching repeated detail, tightening whole-map work, and expanding real-GPU, reduced-motion, worst-window, artifact, bundle, and long-session release gates.

## v0.7.2 - 2026-08-13 - Quiet Anchorage

The harbor becomes a composed picture rather than a full one: the fleet gathers
into anchorages with open water between them, distance finally reads as
distance, and the light moves through the day.

Collected from the 2026-08-13 visual poetry pass after v0.7.1.

- Moored the fleet in anchorages instead of spreading it evenly across every stretch of water, so each sea keeps one harbor that matters, a few quieter roadsteads, and genuine open water between them; the lighthouse holds the frame again.
- Restored aerial perspective at the standard framing, where a mis-set reference height had silently disabled it: the far sea now drains toward haze and dissolves at the world's edge instead of ending on a hard boundary.
- Put the sun on a real arc, so shadow direction and length, the sky's glow, and the sun's road across the water all change with the hour rather than only shifting colour; the Pharos tower now casts a long shadow over the sea that stretches toward dawn and dusk.
- Let the sails read as cloth. Each issuer's mark now sits in the canvas instead of on a hard-edged plate, and brand colour eases back when you pull out over the whole sea and returns in full as you sail in, so identity stays exact where you are actually reading it.
- Deepened the drifting mist into layered banks and settled the daylight frame, keeping every reading, hover, selection, and ledger entry unchanged.

## v0.7.1 - 2026-08-12 - Roomier Harbor

PharosVille now charts on 14-inch laptop displays and zoomed desktop windows
without weakening the mobile no-fetch boundary.

Patch release for the 2026-08-12 laptop viewport regression after v0.7.0.

- Added a 1200×640 wide-laptop size profile alongside the existing 900×720 desktop profile, admitting MacBook-class windows whose usable height is reduced by browser chrome or zoom.
- Kept compact-height framing safe by using the fitted camera instead of the tighter desktop crop, preserving the lighthouse crown, controls, footer, and selected detail panel inside the visible window.
- Extended viewport guards, browser coverage, fallback guidance, and generated runtime facts so the wider support contract remains synchronized while undersized screens still load no world data or Three.js runtime.

## v0.7.0 - 2026-07-30 - Living Sea

The harbor becomes a more responsive analytical place: weather, water, sails,
light, and guided inspection now share one deterministic world state, while
the fleet keeps its actual issuer heraldry at every zoom.

Collected from the 2026-07-30 breathtaking rendering release after v0.6.2.

- Added a weather-driven sea and sky: deterministic wind moves the Gerstner water, sails, rain, ambient life, lighthouse, and post-processing together across day, dusk, night, and reduced motion.
- Made ship movement leave persistent, correctly directed wakes and strengthened the harbor's depth with managed ambient occlusion, graded atmosphere, storm response, and calmer tier transitions.
- Reworked Observe into an interruptible guided harbor tour that begins from the displayed camera, returns safely after resize, and names the landmarks it reaches.
- Restored logo-only sail identity. Sails stay clean while a mark is loading, then show the issuer's real logo in its native colors on brand-dyed cloth; ticker letters can no longer appear on sails.
- Hardened the renderer for long sessions with explicit texture-upload ownership, resource disposal, real-GPU preview telemetry, whole-map texture census coverage, and no shipped WebGPU fallback chunk.

## v0.6.2 - 2026-07-27 - Rightful Colors

Every batched ship now flies its own stablecoin identity instead of a logo borrowed from the opposite row of the sail atlas, restoring the heraldry promised by True Colors across the full fleet.

Collected from the v0.6.2 atlas-addressing fix after v0.6.1.

- Corrected the CanvasTexture-to-WebGL row transform so each batched identity sail samples the atlas cell painted for that ship; Frankencoin no longer receives BlackRock's dark wordmark, and the same fix applies fleet-wide.
- Restored the transparent atlas cell used by ordinary sails, removing the unrelated logo plates that had leaked onto secondary canvas without adding draw calls, textures, or issuer-specific exceptions.
- Added a shader-addressing regression test and verified the corrected fleet through the complete release lane, real-GPU day and night captures, reduced motion, a 60 fps performance gate, and the eight-frame artifact probe.

## v0.6.1 - 2026-07-27 - True Colors

Stablecoin sails recover the familiar logos that disappeared into brand-dyed canvas during the Three.js migration, restoring fleet-scale recognition without bringing back the old stripe, panel, and border clutter.

Collected from the v0.6.1 sail-identity fix after v0.6.0.

- Restored each stablecoin's complete logo as the primary sail mark, preserving its original disc, colour block, and silhouette instead of preferring a disc-free extraction that became indistinct at fleet scale.
- Added one restrained logo-safe contrast plate and thin livery rim while retaining the quieter dyed cloth and weave introduced by the rendering-cleanliness pass.
- Kept deterministic emblem and ticker fallbacks for decode failures, with focused texture tests and real-GPU day, night, performance, and eight-frame artifact checks confirming the treatment remains stable.

## v0.6.0 - 2026-07-27 - Clear Bearings

The harbor keeps all 186 analytical ships while shedding the false mountains, radial glare, hard water facets, and flicker that made the sea look broken; the result is calmer at every reviewed desktop shape, faster to refresh, and easier to inspect.

Collected from the v0.6.0 implementation change after v0.5.0.

- Cleared the largest rendering artifacts. The three horizon cards that appeared as mountains in open water are gone, the lighthouse now carries one coherent beam instead of a radial fan of overlapping cones, and hero reflections, light lanes, lantern pools, seams, foam, wakes, and zone tinting have been reduced where they competed with ships.
- Made the sea read continuously through day, dusk, and night. Bathymetry now uses a softened limited-palette ramp instead of hard posterized bands, distant water no longer reads as a finite slab, danger no longer emits a full-region flash, and the beacon and water-lane shaders use calm continuous motion with anti-aliased transitions.
- Replaced world-like UI clutter with quieter inspection cues. Boundary buoys are sparse landmarks unless their region is being inspected, selection uses a compact depth-tested waterline ring rather than a translucent shaft, unrelated wakes and reflections recede in analyze view, and the full 186-ship fleet remains present.
- Removed the common refresh hitch without changing the world contract. A renderer-facing content signature retains meshes for equivalent payloads, cutting the measured refresh to a 56 ms median busy interval with 6 ms blocking, while settled reduced-motion frames now remain well below the 500,000-triangle ceiling.
- Made every allowed desktop window genuinely chartable. The lazy, orientation-free gate now requires a 900 px long side and 720 px short side, the camera preserves the lighthouse crown at edge sizes, controls meet WCAG target sizes with 44 px hoverless targets, dynamic scene scrims improve legibility, and the first-visit action arrives before the long-form ledger.
- Added regression evidence for the faults that escaped ordinary screenshot tests: first-pass, tall, standard, whole-map, and ultrawide layout coverage; source guards against horizon and obsolete beam geometry; an eight-frame real-GPU flash/bright-coverage probe; settled reduced-motion resource assertions; and a 320-ship-plus-outsider capacity fixture with selection, DOM parity, and disposal checks.

## v0.5.0 - 2026-07-26 - The Cargo Tide

The world stops showing only what exists and starts showing what is moving: crates load and land as supply is minted and burned, a tide reads the week's global drift, and a signal mast flies the fleet's peg condition — while the map-wide frame the product is judged on drops from 917 draw calls to 402, and an outage now degrades the harbour instead of emptying it.

Collected from commits `871408a` through `361a03c` after the v0.4.0 changelog entry.

- Made production failure visible and survivable. Client errors now report from every real failure site to a `/_log` that persists them behind an optional KV binding, with the canary POSTing a synthetic report every run to prove the pipe. The edge keeps a long-TTL last-good copy of each endpoint and serves it with honest age headers when upstream fails, the browser persists the last complete world so a returning visitor renders immediately from data labelled with its true age, and the 30-minute canary now asserts per-endpoint freshness so a stuck producer trips it instead of passing.
- Opened the sharing and first-visit loop. The meta description no longer calls the product "A beta desktop RPG island-city", a shared ship link unfurls as that ship through edge-rewritten OG text, the detail panel has a copy-link button, the first-visit legend closes into a "Watch the harbor" button rather than silence, and pressing `/` finds any ship or harbour by name.
- Spent the signals the world had been fetching and ignoring. A signal mast on the observatory terrace flies one pennant per depeg under a storm cone, a cross-bearing buoy rides beside any ship whose DEX price disagrees with the consensus feed, a salt high-water mark bands the lighthouse at the worst PSI band of the trailing 30 days, the beacon's sweep slows across the largest PSI contributor, a tide line reads global 7-day supply as a wet/dry band against a fixed datum, hulls ride high above par and settle below, and each harbour's gulls wheel faster, wider and higher as its chain's supply fills.
- Showed supply being made and unmade. Every signal until now was a stock; the cargo tide adds flow, with crates loaded on the pier deck when a harbour is minting and stacked on the quay's outer edge when it is burning, allocated per coin by chain-presence share and reporting `tracked: false` with a reason rather than a silent zero outside the measured scope. Flight to quality shows as skiffs converging on the titan hulls.
- Raised the frame the product is judged on. Whole-map framing went from 917 draw calls at tier `recovery` and 37.7fps to 402 at tier `full` by culling detail that cannot resolve at that distance, and the headroom paid for mirror reflections under the 29 hero hulls whose strength reads risk region. Hulls, bronze and gilt are now lit by the actual sky dome, island planting is laid in drifts instead of an isotropic spiral, five pale sails became legible without touching DAI's amber, and the warm stripe across the night sky is gone.
- Cut the cost of being left open. Ships hold their tiles across refreshes unless their risk placement actually changed, which stops refresh teleporting and takes the world rebuild from 303ms to 34ms; runtime models are meshopt-compressed from 2,282,072 to 1,133,132 bytes with a maximum geometry shift of 2.44e-4 units; the frame duty halves after three minutes without input; and logo requests stop revalidating on every visit. A real-GPU measurement of the refresh — 0ms, 239ms and 795ms of main-thread work for an identical, a typical and a fully churned payload — ruled out the Web Worker rather than estimating it.
- Made the gates tell the truth and widened what they cover. `npm run preview --assert` is now a deploy gate that fails rather than reports a software frame, the dist visual and perf lanes reach their assertions after years of stale assertions and a fixture ship that never existed, a refresh-soak gate cycles 12 payloads and requires renderer memory to return to baseline, the world-data hook and the enrichment grace path have their first tests, and `check:runtime-media` now validates that referenced media can actually render — which found a logo truncated and rendering blank since the bootstrap commit.
- Made the world's own records readable. The accessibility ledger, previously screen-reader-only, opens as a visible Harbor ledger panel from the footer with byte-identical content, the seven carved sea-name boards became keyboard targets that track their own on-screen scale, and `[` and `]` shift the time of day instead of the cheatsheet telling visitors to hand-edit the address bar.

## v0.4.0 - 2026-07-26 - The Lantern Sea

PharosVille is rebuilt on Three.js and grows into a real place: a four-times sea whose waters have names and coastlines, a fleet that flies its issuers' colours, and a harbour that starts in under two seconds and holds sixty frames a second for as long as you leave it open.

Collected from commits `deed1b3` through `82097d3` after the v0.3.0 changelog entry.

- Rebuilt the world on a Three.js renderer: a volcanic-stone island under an epic Pharos with a volumetric beam and real shadows, a lantern-lit sea with normals, a moon road, light lanes and wakes, a day/dusk/night cycle with AgX tone mapping, bloom and a graded vignette, and ambient life — gulls, fireflies, summit birds and danger weather.
- Grew the sailable sea four times over and gave every body of water a name, a coastline and a carved board standing in it. The bands are no longer ruled lines: Calm Anchorage, Watch Breakwater, Alert Channel, Warning Shoals, Danger Strait, Ledger Mooring and the wreck shoals are places, sized to the traffic they carry, and the sea's place-names left the DOM chips for the world itself.
- Gave the fleet an identity you can read at a glance: seven hull silhouettes with per-ship proportions, ten bespoke hero hulls for the titans, the issuer's colour on the sheer strake, canvas dyed in the issuer's brand with its mark cut from the coin's own logo, pennants at the masthead, and a chain's own flag over each of the eleven harbours.
- Drew the whole fleet from instanced batches, holding roughly nine draw calls for the ships however many there are, and raised the render cap to 320.
- Cut the startup freeze from about seven seconds to well under one. Ship placement was recomputing every already-placed ship for every candidate tile, the entire fleet was being built twice per world build, and the terrain classifier — six noise octaves and fifteen segment SDFs per tile — was never cached. The world now also opens on the two feeds that build it rather than all six, so one slow endpoint no longer holds an empty sea for twenty seconds, and `/api/report-cards` is projected at the edge from 2.98 MB to 1.44 MB.
- Stopped the recurring hitches and the false failures: the ten-minute route rebuild no longer re-runs the whole A* set to reproduce identical paths, a load spike no longer poisons the frame-pacing window and freezes the lighthouse beam, a transient WebGL context loss recovers instead of retiring the world to the DOM overview, and a single thrown frame no longer costs the session.

## v0.3.0 - 2026-07-10 - True Waters

PharosVille learns to tell the whole truth: inverted stability semantics, dead permalinks, and silent story beats are fixed, the harbor finally leads the first visit, and ships sail with honest wakes and cadence.

Collected from commits `c02952a` through `654ea7f` after the v0.2.2 changelog entry.

- Fixed inverted PSI semantics across the world: a healthy BEDROCK market now becalms the ambient sea and a collapse would storm it (previously reversed), the lighthouse 24h drift wording matches reality, the decorative session-hour slider no longer roughens the analytic water, and NAV ledger ships stay moored through CALM stress rows.
- Revived two silently broken features: since-last-visit deltas no longer baseline against the empty loading world, and shared ?sel= permalinks now open the linked ship instead of falling back to the lighthouse.
- Made the world the hero on first visit — one narrow legend (with hull-class thumbnails) over a visible harbor, the lighthouse panel deferred until it closes, Watch Breakwater water retuned to a distinct steel teal, and a quieter footer with the fps counter behind ?debug=1.
- Sharpened inspection: ship panels open with a zone status line and the live signed peg deviation ("-12 bps vs USD") with full ledger parity, the detail panel became a non-modal landmark so screen readers keep the accessibility ledger, keyboard Tab now exits the map-target cycle into the page controls, and nav/yield mast signals gained legend, detail, and ledger explanations.
- Let events read as story: a session harbor log turns risk-band transitions into clickable beats ("USDX left Calm Anchorage for Danger Strait"), legend movers jump to their ships, and placement and area copy speak the observatory voice.
- Tuned interaction-time performance and motion honesty: adaptive DPR now reacts to raster-bound frame pacing instead of upshifting against it, post-pan effect shedding is gone, sail-logo sprites stopped thrashing during zoom, risk tack-outs run at their documented 3-second tempo, routes no longer teleport at 10-minute rebuilds, dock calls follow real chain supply share, and wakes die away as ships settle.

## v0.2.2 - 2026-06-14 - Signal Clarity

PharosVille sharpens ship and harbor identity, expands the weathered maritime world, and trims noisy overlays back to a cleaner inspection surface.

Collected from commits `bd5c201` through `cfab83f` after the v0.2.1 changelog entry.

- Made stablecoin and chain identity easier to read with ship nameplates, logo-safe sail marks, chain-logo harbor flags, titan and heritage hull treatments, and stronger visual chrome for audit, confidence, consensus, backing, and safety signals.
- Expanded the harbor atmosphere with night mode, horizon and world-edge staging, coherent swell fronts, persistent wakes, dock caustics, lighthouse-synchronized ship rim light, threat-aware sky states, DANGER rain squalls, and richer ambient quay detail.
- Improved inspection flows with permalink state, copy-link support, richer PSI/fleet/dock/grave detail facts, since-last-visit context, safety grades, dock-member links back to in-world ships, and a compact footer that keeps the Pharos link last.
- Stabilized dense rendering with per-pass telemetry, ship-body and nameplate caches, deferred asset cache invalidation, far-zoom water and fleet LOD reductions, sustained-motion budgets, and updated runtime facts for the larger visual surface.
- Restored chain and stablecoin logos on harbors and ships after the logo decode path changed, then switched render cache invalidation to logo-load batches so the water no longer blinks while logos stream in.
- Removed the noisy visible movers, DEWS band key, fleet focus controls, and footer status line after overlap and clarity regressions, leaving those signals in details, ledger, and map semantics instead of extra chrome.

## v0.2.1 - 2026-05-18 - Curtain Up

PharosVille opens with a cinematic reveal, fleets that move with intent, and a village that finally feels lived-in.

Collected from commits `adf3993` through `a585208`, with earlier v0.2.0 smoothness work summarized in v0.2.0.

- Added a 1.8-second first-load reveal beat: sky and outer water fade in, the headland slides up, then the lighthouse turns on with a slowed first sweep. Reduced-motion users still get the deterministic final frame instantly.
- Re-skinned the loading state to the canvas palette, with horizon-ship silhouettes and a warm pulsing halo, so the wait between routes matches the world that follows.
- Brought the civic core to life with procedural chimney-smoke wisps, reshuffled vegetation to clear the future agora footprint, and retired the redundant selection-strip caption now that the detail panel carries the same load.
- Reworked fleet movement so ships in calm waters cycle deterministic patrol itineraries, squads fan out at sea and pull tight in port, and risk-band changes show as a tack-out before the next dock cycle.
- Stopped harbor pile-ups with a swell-aware sea-room separation pass and added a cue-priority arbiter so active-risk and recent-supply ships win overlay and wake slots first when render budgets bind.
- Tightened renderer hot paths through cached lighthouse god rays, shared titan foam/spray/mooring templates, Map-backed static cache lookup, and cooperative idle warmup.

## v0.2.0 - 2026-05-17 - Need For Speed

PharosVille became a smoother, faster maritime observatory with richer motion, steadier camera control, stronger rendering budgets, and a real release-history surface.

Collected from commits `009ef1a` through `a538b9f`, plus the 2026-05-17 workspace motion and renderer performance batch.

- Added continuous follow-camera behavior, keyboard target cycling, time controls, and stricter canvas interaction coverage for zoom, bounds, and selected-ship tracking.
- Reworked ship motion sampling with route-path continuity, speed-aware wakes, display velocity, smoother state transitions, map-visibility fades, and reduced heading snap during docking, sailing, and ledger patrols.
- Improved live frame pacing with visual-motion smoothing, a single active motion loop guard, browser perf telemetry, longtask checks, and sustained-motion budget documentation.
- Raised renderer throughput with pan-tolerant static and dynamic layer caches, backing-store budget metrics, cache eviction accounting, deferred asset loading during idle time, and incremental hit-target updates.
- Expanded harbor atmosphere with deterministic sea state, cinematic weather passes, richer lighthouse and ambient drama, water-zone plaques, tighter palette controls, ship identity chrome, and refreshed visual baselines.
- Added the in-app changelog panel and footer fleet counter, then aligned local push, visual, CI, and deploy gates so release checks match the Cloudflare Pages workflow.

## v0.1.3 - 2026-05-17 - Harbor Motion And Atmosphere

The beta map gained a stronger sense of weather, water, and fleet motion while keeping the same stablecoin semantics.

Collected from commits `4940b86` through `800e184`.

- Added deterministic sea-state signals for water, ship, and atmosphere rendering.
- Refined ship heading, docking choreography, lighthouse drama, and harbor life.
- Polished named water-zone borders, plaques, palette separation, and cinematic weather passes.
- Added keyboard target cycling, session time controls, and the footer fleet counter.

## v0.1.2 - 2026-05-04 - Runtime Hardening And Inspection Polish

The standalone route became easier to operate, test, and inspect before publishing.

Collected from commits `88d6a27` through `2205882`.

- Improved detail-panel accessibility, touch targets, contrast checks, and pinch-zoom coverage.
- Added error-reporting categories, asset-miss telemetry, and stricter lint/doc validation.
- Optimized hit testing, terrain rendering, React data churn, and static asset delivery.
- Added visual regeneration and swarm-operation runbooks for safer multi-agent work.

## v0.1.1 - 2026-05-03 - Launch World Buildout

The v0.1 beta surface became a full maritime observatory rather than a prototype canvas.

Collected from commits `c13d6b2` through `d1f8afd`.

- Added launch metadata, canary smoke checks, GA/Cloudflare analytics gates, favicon, and OG cards.
- Introduced the PharosWatch pigeonnier, Telegram harbor landmark, extra birds, and auto day-night controls.
- Expanded the fleet with Ethena squad ships, titan hulls, heritage hulls, route tempo, and supply-change detail facts.
- Reworked harbors, water geography, atmospheric labels, and motion performance for dense inspection.

## v0.1.0 - 2026-05-02 - Foundation, Geometry, And Performance

The first release-ready PharosVille shell was tightened around desktop gating, asset discipline, and the island layout.

Collected from commits `57fdc78` through `3704cc8`.

- Added release-readiness gates, response headers, cross-browser accessibility smoke tests, and visual CI controls.
- Reshaped the island and seawall routing while preserving DEWS water-zone semantics.
- Added Ethereum harbor Yggdrasil, iconographic sail marks, civic vegetation, and logo-colored harbor flags.
- Optimized terrain scans, hit testing, static cache behavior, and manifest-driven sprite loading.
