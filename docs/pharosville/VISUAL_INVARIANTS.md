# PharosVille Design Bible

## The picture

A harbour seen from a shaded Japanese garden threshold, pleasant to watch and
informative about stablecoin markets. A weathered Pharos rises slightly right of
centre from an asymmetric moss-and-stone headland. Its broken reflection lies in
a calm inlet. Keep the whole tracked fleet: smaller craft gather in unequal
flotillas beyond a broad, continuous interval of untouched water. A few near
boats read as rigged vessels; the many beyond recede into silhouette. Ships belong
to the landscape rather than competing with its scale.

A dark clipped pine bough crosses the near corner. Borrowed headlands and a real
sky band close the distance. Use long-lens perspective to give the harbour
recession and the tower crown air. Make the precinct a shoin court, engawa and
dry-stone garden, not a fort. The pavilion, pond and signal mast remain subordinate
to the tower; do not add another monument.

The picture is taken from one authored seat, not a zoom level: seat C on the
south shore (`src/systems/rest-seat.ts`), looking at the Pharos at yaw 31°,
pitch 2.6°, eye 15.2 u, 32° vertical field. Idle is this rest shot; nothing
tours on its own. The tower foot lands in the middle-right ninth at every gate
profile (the tall 720×900 window takes its own eye along the same orbit). The
near threshold — moss bank, engawa edge, a niwaki pine seen from below and a
stone lantern — frames the bottom-left corner in shade.

## Value plan

Perceptual grey, 0–100; entries read noon / dusk / night. Judge the resting frame
as a 3×3 composition, not a collection of individually attractive objects.

| | Left | Centre | Right |
| --- | --- | --- | --- |
| Top | 60 / 35 / 9 — distant shore | 72 / 52 / 14 — air; beacon 92 at night | 68 / 43 / 11 — borrowed hills |
| Middle | 27 / 20 / 5 — grove and Mole massing | 45 / 32 / 12 — clear inlet; reflection | 42 / 26 / 8 — receding fleet; tower 62 / 57 / 24 stands centre-right |
| Bottom | 15 / 10 / 3 — clipped pine | 38 / 25 / 7 — open approach | 23 / 15 / 4 — partial quay |

## Hierarchy and emptiness

Compose one hero, the Pharos and its headland, with two subordinate masses:
the shaded near garden and the receding harbour fleet. Preserve a continuous
empty inlet from the approach to the tower. It must survive a blurred view.
Achieve spaciousness through smaller vessels, unequal anchorages and near/far
weight, never by hiding eligible ships at rest. Leave a broad dark terrace arc
bare; neither lamps nor boats form an evenly spaced ring or carpet.

The seated threshold is authored, not generated. Its pines keep six
aspect-specific limb pads (three for the landscape seat, three for the tall
companion) on their anchors. Each pad is a flattened, irregular cloud pad,
shaped only inward: notched outlines and a lowered, softly undulating crown,
never an enlarged bough or a full hemispherical cap. The bank is organized into
a few broad value planes in the moss-olive and earth family: a dappled
mid-distance plane, a darker recess, and the darkest shade at the front edge
and bottom-left. It is never a saturated or lawn-bright field. The brow knots,
deck edge, tall shoulder, lantern, offscreen cedars and eave stay; they hide the
plate edge and make the shade. The threshold stays three smooth, textureless,
unpickable draws within 15,000 construction triangles.

## Coarse truth in the world; exact truth in the DOM

The world offers three readings: the tower is market stability, water is risk
band, and hero ships show who leads. Sail identity is a complete mon on cloth,
not an identity plate. Sea-sign boards are inspection-only: no board is drawn
at rest; hover or focus raises only that water body's name over 380 ms, with
one deterministic raised pose under reduced motion. The DOM ledger remains the
canonical always-available list of named waters and their exact readings,
sources, freshness and caveats. Colour is never the only carrier of meaning.

## Atmosphere before grade

Build atmosphere from geometry and light before grade. Noon is neutral-white
and blue-green, not honey; golden hour rakes; blue hour is gentle. Let real sky,
borrowed hills, shadows and reflection establish depth before post-processing.
Night is dark, not black: a deep indigo sky (L\* 7–15) over darker land, so the
tower, ridges and masts read as ink silhouettes. One dominant light, the beacon;
one secondary, the moon road; every other lamp, window and reflection is an
ember. Nothing competes with the tower by glowing harder.

Wall clock is the premise, never a flattering default hour. It owns illumination.
Market stability owns clarity aloft; stale sources own bounded low fog in their
own water. Neither market data nor grade may counterfeit the time of day.

The clock is solar (`src/systems/sky-almanac.ts`): a nominal 35° latitude with
the hemisphere taken from the visitor's time zone. The five beats follow the
sun's true elevation for the date, not fixed hours — golden while the sun
drops through 16–8°, blue centred on sunset, night by −12°, dawn mirrored. The
real moon keeps its true timing, phase and elevation; only its displayed arc is
compressed into the rest view's sky window.

Cloud aloft is market data on a fixed ladder, never weather and never a
forecast (`SKY_CLOUD_COVER`, `src/systems/psi-sky.ts`): BEDROCK a clear sky
with two or three high strokes, STEADY fair, TREMOR a high veil, FRACTURE a
broken deck, CRISIS low cloud, MELTDOWN overcast. The same word appears in the
now-line and the ledger. A band change eases over 90 s; the wall clock lights
the clouds.

## Motion and restraint

Motion has long rests. Let an arrival, kindling lamps or a heron become an event,
then leave the garden quiet. Redistribute ambient life into fewer readable
figures, never add counts to manufacture life. Every addition names what it
displaces: a light demotes a light, a prop removes a prop, a motion stills another.
Cheap rendering does not make attention free.

The attention budget is a gate, enforced when the director admits an event
(`src/systems/garden-director.ts`) and proved for the day score
(`gardenScoreBudgetViolations`, `src/systems/garden-score.ts`). In any idle
hour: at most six discrete events, one unbroken 12-minute quiet, at least
8 minutes between foreground events and a 90 s back-off after any ritual. Over
a day: at most six gifts, no more than two between golden 0.5 and night 0.5.
Only the crossing subject crosses the inlet, and it wears the only nameplate.
Continuous ambient motion (wind, swell, water) is outside the count.

## Immutable colour anchors

Keep `lantern_warm`, `vermillion`, `sail_teal` and `sail_red` unchanged.
Vermillion retains chroma primacy; sail anchors retain issuer identity.
Only `vermillion` and `lantern_warm` exceed OKLCH C 0.12 in the world, and
vermillion is spent on two things only: the beacon flame and Danger water. No
torii, no vermillion flora; koi and maples take derived tones.
Derive supporting colours from the shared palette, never redefine these tokens
or use arbitrary colour and grading to repair a weak composition.
