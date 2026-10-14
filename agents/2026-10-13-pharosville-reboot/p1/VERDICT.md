# G1 verdict (2026-10-14)

Taste authority was delegated by the operator to the orchestrator (Opus) for this run ("persist until you produce
a result you are proud of"). The operator sees the result at the end.

## Style: C "Northern Light" wins, with grafts from A

**Why C:**
- crispest premium-game read;
- best lighthouse silhouette;
- strongest night (beam through mist, moon glitter, sodium windows);
- the harbour zoom already reads like a shipped game (sloop with legible logo, wake, gulls, people).

**Grafts from A "Lantern Miniature":**
- quay bunting;
- striped market awnings;
- window boxes / flowers / ivy density;
- lusher tree clusters;
- warm dusk lamp pools;
- subtle tilt-shift at overview zoom.

**From B, none in the world.** Its chart sensibility goes to the UI voice (D12).

**C weaknesses to fix in production:**
- CG puff clouds → sculpted painterly cumulus cards;
- far-sea band too smooth → swell lines / crest glints;
- boxy houses → dormers, porches, signs, gutters, ridge ornaments, window variety;
- flat terrace tops → dressing;
- sails need a furled→set morph.

## Renderer: WebGLRenderer + GLSL + pmndrs postprocessing

From the spike:
- same look on the operator's default Chrome (no WebGPU adapter on Linux);
- 2–4× less CPU;
- faster first frame;
- honest GPU timer.

## Grey-box: layout logic accepted, composition rejected

**Accepted:** occupancy/circuit numbers.
- 26.7 under way, 6 dockings/min;
- periods 25/30/40/60 min.

**Rejected:** the composition.
- The 330-hull Ethereum comb reads as a marina car park.
- The town is a sprawl.
- The camera is too far for charm.

**Composition v2 direction:**
- **Moorings by class.**
  - Skiff and boat classes (~356) ride on **swinging moorings** in organic drifts, all bows into the wind.
  - Small and medium hulls use finger piers.
  - Large and flagship hulls use quay walls / T-heads.
- **Ethereum** gets the Grand Quay along the town front plus the largest mooring field.
- **Tron** berths along the breakwater under the Pharos.
- **Other chains** each get a distinct small harbour quarter.
- **Town:** dense terraced clusters with character, not sprawl.
- **Default camera:** a closer "harbour heart" framing. Overview is a zoom-out.
