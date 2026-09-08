# Astra Garden Director

## 1. Verdict

PharosVille is an accomplished miniature harbour, not yet a contemplative garden: the tower commands height, but the fleet commands almost every surrounding interval (`noon.png @ left half and lower third`). Its strongest existing composition is night, when the lighthouse finally separates from the field; its weakest is the whole plate, whose bright exterior reads as a tabletop rather than borrowed distance (`night.png @ centre`; `noon-wholemap.png @ right half`). More atmosphere or more Japanese objects will not make the necessary leap. Rebuild the relationship between occupied ground, open water and distant scenery, then author the light to reveal those masses.

**Target look.** A harbour observed from a shaded garden threshold: one weathered Pharos rises from an asymmetric moss-and-stone headland, a quiet inlet carries its broken reflection, and unequal flotillas gather beyond a broad, curved interval of untouched water. A dark clipped pine gives the near plane weight; a half-hidden path invites imaginary walking; remote shore forms borrow depth without claiming navigable territory. Take from karesansui the authority of an empty field, tsukiyama the compression of landscape, shakkei the joining of real and imagined distance, ma unequal breathing intervals, miegakure partial disclosure, and wabi-sabi coherent weathering—not a collection of cultural props. Take from Hiroshige's harbour picture-making and Hasui's nocturnes a few interlocking value shapes; from sumi-e lost edges; from nihonga deliberate mineral-colour fields. This is a proposed direction, not a claim of historical reconstruction.

### Value plan

Numbers are **proposed perceptual greyscale values**, 0 black–100 white, not measured luminance or shader constants. Chroma: L low, M restrained moderate, A tiny accent. Each cell gives the dominant mass; isolated lights are exceptions. Rows are top/middle/bottom; columns left/centre/right of the rest frame. Target composition moves the tower slightly left of centre while retaining sky clearance.

| Phase | Top-left | Top-centre | Top-right |
|---|---|---|---|
| Noon | 60/L distant shore | 72/L air | 68/L borrowed hills/air |
| Dusk | 35/L violet distance | 52/L air; 68/A thin ember | 43/L violet distance |
| Night | 9/L distant shore | 14/L sky; 92/A beacon | 11/L night air |

| Phase | Middle-left | Middle-centre | Middle-right |
|---|---|---|---|
| Noon | 27/L grove; 62/M tower | 45/L clear inlet | 42/M receding fleet |
| Dusk | 20/L grove; 57/M lit stone | 32/L mirror; 64/A reflection | 26/L fleet silhouettes |
| Night | 5/L grove; 24/L tower | 12/L mirror; 40/L moon road | 8/L quiet fleet |

| Phase | Bottom-left | Bottom-centre | Bottom-right |
|---|---|---|---|
| Noon | 15/L clipped pine | 38/L open approach | 23/L partial quay |
| Dusk | 10/L pine | 25/L open approach | 15/L quay |
| Night | 3/L pine | 7/L water | 4/L quay; 20/A ember |

**Against the frames:** noon has useful teal depth on the right, not literally one flat value, but gold tower, ochre boats and yellow-green near land repeat competing warm accents (`noon.png @ centre, upper-left fleet, bottom rim`). Morning and dusk retain essentially the same busy mass arrangement and warm-stone emphasis, rather than exposing a different landscape (`morning.png @ centre/left`; `dusk.png @ centre/left`). Night gains hierarchy, yet its broad blue field is intensely present and the island's cyan perimeter forms an additional contour (`night.png @ right water and island base`). The proposal changes the large shapes before adjusting colour.

## 2. Findings

- **GAP — first three seconds have no landing after the tower.** My predicted scan is tower → large nearby sail marks → repeated orange barges → more marks, rather than tower → water → distant shore. This is an art-direction inference, not eye tracking (`noon.png @ central tower, left-middle sails, bottom-right fleet`). The right-hand opening is a genuine success; do not erase it. Existing odd-count anchorage rules explicitly pursue negative space (`docs/pharosville/VISUAL_INVARIANTS.md:33–42`), but screen-space overlap can defeat a correct placement contract.
- **GAP — architecture consumes the island's meaning.** Bastions, battlements and repeated masonry courses dominate; pond, grove and stair are subordinate details, not a walkable landscape (`noon.png @ island`; `dusk.png @ island foot`). The source contract explicitly sanctions the fortified platform and only three secondary reads (`docs/pharosville/VISUAL_INVARIANTS.md:300–310`). Therefore “fort” is not a bug. Reverse that choice explicitly.
- **GAP — scale is legibility-led rather than landscape-led.** Neighbouring large sails rival the grove's silhouette; the tower remains tall but its garden feels miniature beside the boats (`noon.png @ immediately left of island`). The 0.8 hull legibility floor, 2.6× scale range and full marks at rest are deliberate (`docs/pharosville/VISUAL_INVARIANTS.md:65–77`). Garden scale requires reopening that contract, not making the lighthouse taller.
- **GAP — warm treatment is applied at several levels.** The warm horizon/fog/key are authored together (`src/systems/palette.ts:57–60`); day ambient uses the warm horizon (`src/three/garden-day-cycle.ts:114–130`); day grade again favours warm highlights and 1.12 saturation (`src/three/garden-post.ts:242–255`). These are confirmed ingredients, not an isolated proof of causality. The observable result is a honey cast spanning tower, barges and foreground foliage (`noon.png @ centre and lower-left`). Prior fill/vignette reductions did land (`garden-day-cycle.ts:115–129`; `garden-post.ts:250–255`): repeating them is not a new proposal.
- **DEFECT — borrowed scenery fails its stated seam intent.** A conspicuous diagonal blue/cream transition cuts the distance; the near land has a straight outer edge against cream (`dusk-close.png @ upper-right diagonal`; `noon-wholemap.png @ lower-right plate edge`). This contradicts the far-edge dissolution contract (`docs/pharosville/VISUAL_INVARIANTS.md:224–230`). The visible transition is broad/soft in places, not literally a one-pixel hard seam, but still reads as a boundary between render domains.
- **GAP — reflective richness does not yet supply a landscape image.** Surface modulation and local light reflections are visible; a readable tower silhouette is not (`noon.png @ water below island`; `night.png @ island foot`). Thus reject “water has no effects”; the missing thing is meaningful reflected form, despite the shipped fresnel/probe work (`agents/2026-09-07-visual-refinement-consolidated.md:42–52,104–107`).
- **GAP — edge hierarchy is inverted.** Tiny masonry and hull edges remain assertive while broad distance becomes general haze (`dusk.png @ tower versus upper edge`). A faint inset rectangle is visible on all reviewed frames (`night.png @ four margins`). It is not explained by the smooth radial vignette formula (`src/three/garden-post.ts:428–431`); ownership remains untraced here.
- **Evidence caveat.** All seven supplied frames were inspected. `noon-legend.png @ entire frame` contains no visible onboarding overlay, so it cannot establish legend quality. No source changed, no captures generated, and no validation gates run.

## 3. Ranked ideas

Costs below are **unmeasured planning envelopes**, not promised timings. Draws/tris/textures are net targets; ms is incremental GPU allowance to verify later. S 2–4h, M 1–2 days, L 3–5 days, XL over 5 days. Shared work is not additive.

### 1. STEP CHANGE — Compose a harbour around a continuous empty inlet

**What/why:** Camera and fleet-placement owners author one curved, unoccupied resting-water interval from foreground to the tower, with unequal dense anchorages outside it. Contract it in projected space across supported rest viewports; check representative transit phases, not merely tile-space empty circles. This gives the eye its missing second destination (`noon.png @ crowded lower-centre versus relatively quiet right`).

**Cost:** 0 draws/tris/textures; 0 GPU ms; L. **Risk:** crowding displaced into risk regions or unsafe routes. **Displaces/re-pins:** existing anchorage arrangement, not region truth; revise placement/camera composition assertions. Keep 320 capacity, every eligible hull visible at ≥0.5, and analytical parity. **Dependencies:** CameraComposition, FleetMotionDensity, DataInformativeness; geography owner must establish feasible water before placement.

### 2. STEP CHANGE — Replace the fortress platform with a garden headland

**What/why:** Island generator/asset owner retains the Pharos silhouette and anchors but removes the curtain-wall/bastion belt. Shape two unequal ground terraces: moss under a leaning grove, one pale gravel clearing, three related weathered stones, and a path vanishing behind the grove before reappearing at the existing pavilion. Turn the current access span into one restrained timber bridge, not a ceremonial red arch. The island becomes terrain one can mentally inhabit (`noon.png @ island's masonry belt and compressed grove`).

**Cost:** target −5 to +5 draws, net −15k to +10k tris, 0–1 texture, ≤0.2ms; XL. **Risk:** loss of Pharos grandeur and asset/picking alignment. **Displaces/re-pins:** fortification permission at invariants 303–307; replace masonry, not add monuments. Keep pond/pavilion/mast, PSI truth, tower scale and pick anchors. **Dependencies:** IslandLighthouse, ShoreRimVegetation, asset owner.

### 3. STEP CHANGE — Make the calm inlet carry an actual reflected landscape

**What/why:** Water owner prototypes a tightly scoped low-resolution planar reflection of tower, island and near grove, clipped to calm water; no reflected fleet, UI or secondary lights. The dark inverted tower completes the picture rather than adding glitter (`noon.png @ directly below island`).

**Cost:** reserve ≤40 draws, ≤45k submitted tris, 1–2 textures, ≤1.5ms; L. **Risk:** transparency/order, clipping, resize and total p95. **Displaces/re-pins:** explicitly reverse planar-reflection rejection; demote existing hero-reflection approximation and calm-zone glint clutter, not stack effects. Re-pin sea one-in/one-out invariant 328–339. **Dependencies:** Water, RenderArchitecturePerf, island geometry; reject implementation if measured envelope fails.

### 4. STEP CHANGE — Join the finite garden to borrowed distance

**What/why:** Sky/rim owners replace the visible cream surround with a continuous low-chroma atmospheric field matched at the seam; place two or three partial distant headland silhouettes beyond the far shore. Near margins become irregular grounded embankments, not blurred tabletop cuts. This borrows depth without inventing more market geography (`noon-wholemap.png @ right surround`; `dusk-close.png @ upper diagonal`).

**Cost:** 0–3 draws, ≤2k tris, 0 textures, ≤0.15ms; L. **Risk:** fake horizon under orthographic pan/zoom; distant land mistaken for interactive regions. **Displaces/re-pins:** current backdrop/seam presentation, not finite-world premise or two openings. **Dependencies:** SkyAtmospherePost, CameraComposition, ShoreRimVegetation.

### 5. Re-author colour as material roles, not a universal golden treatment

**What/why:** `HARBOR_PALETTE`, light presets and `DAY/DUSK/NIGHT_GRADE` jointly follow the value plan: neutral-warm stone, subdued earth, selective living greens, cooler low-chroma air. Concentrate warmth on lit faces, not every bright material. Night uses near-neutral indigo darks rather than a broad brilliant-blue field (`noon.png @ gold tower/orange fleet`; `night.png @ right half`).

**Cost:** 0 draws/tris/textures, 0ms; L including reference comparisons. **Risk:** issuer/risk colour loss. **Displaces/re-pins:** global honey doctrine, not semantic accents; keep immutable identity tokens. Reconcile contradictory C<0.16 versus C<0.14 documentation (invariants 247–249 versus 379–384). **Dependencies:** Sky, Water, FleetVisuals; coordinate operator-owned post/LUT edits, never overwrite them.

### 6. Recover landscape scale by reducing the fleet's competing silhouettes

**What/why:** Fleet owner tests a lower small-hull floor and less extreme sail prominence while keeping all six families identifiable; selection supplies exact identity emphasis. Do not shrink everything equally or enlarge every building (`noon.png @ large sail beside island grove`).

**Cost:** 0 draws/tris/textures, 0ms; M. **Risk:** small-coin discoverability and deceptive cap ratios. **Displaces/re-pins:** explicitly reopen 0.8 floor/rest-mark prominence and ship scale tests; preserve ordered market-cap encoding, keyboard access and full hull visibility. **Dependencies:** FleetVisuals, DataInformativeness, UI selection.

### 7. Author found-and-lost edges instead of more blur

**What/why:** Material/sky owners reserve crisp edges for tower profile, foreground pine and selected vessel; simplify distant masonry/rigging contrast and let far shore edges merge into air. Current tiny structures compete with broad atmospheric shapes (`dusk.png @ tower courses/upper fleet`).

**Cost:** 0 draws, net −5k–15k tris via distance geometry, 0 textures, ≤0ms target; L. **Risk:** shimmer and identity loss across thresholds. **Displaces/re-pins:** distant microdetail and dependence on blanket softness; explicitly reopen chroma-only depth restraint, retain semantic hue and selection legibility. **Dependencies:** FleetVisuals, Sky, asset LOD owner.

### 8. Make the foreground a threshold, not more planting

**What/why:** Rim owner redistributes existing pine canopy into one clipped, irregular dark mass and gives the path a short reveal before it disappears. Preserve a smaller opposite quay mass; vary erosion/moss by moisture, not random noise. The current near rim is a bright strip with separate little trees (`noon-wholemap.png @ bottom diagonal`; `noon.png @ bottom-left`).

**Cost:** 0–1 draws, ≤3k tris, 0 textures, ≤0.05ms; M. **Risk:** blocking harbours. **Displaces/re-pins:** bright lawn strip, scattered foreground detail and reliance on vignette; keep foreground clearance and dark-night invariant. Not a repeat of shipped tree-count expansion. **Dependencies:** ShoreRimVegetation, CameraComposition.

## 4. Rejected

- More torii, lantern rows, pagodas or red bridges: cultural shorthand instead of spatial design; already crowded island (`noon.png @ island`).
- Full monochrome ink filter: deletes useful semantic colour and material distinctions.
- Paper grain, outline shader, heavy posterization: equalises edge emphasis; cannot rescue the fleet/void relationship.
- Stronger vignette as the composition fix: darkens pixels without creating an inlet or a near plane.
- Infinite navigable ocean: unnecessary geography and camera scope; borrowed scenery need not be reachable.
- Default golden hour, more ambient animals, taller tower: preserve wall clock and attention budget; none fixes scale hierarchy.

## 5. Cross-lane notes

Implement 1/2/4 as one spatial contract before final grade or reflection calibration. Water and art direction share one calm-inlet footprint; camera owns its screen-space proof. Data lane must approve any reduction in sail prominence before art narrows the identity channel. Ask UI owner to trace the inset rectangle separately; it is not evidence that vignette math is broken. Acceptance should compare the same seven GPU views and a deterministic reduced-motion rest: the viewer must see a garden silhouette, a continuous quiet interval, and a coherent far field before noticing the fleet's individual marks.
