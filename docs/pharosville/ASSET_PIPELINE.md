# PharosVille Runtime Media

Last updated: 2026-09-27

Runtime media is deliberately narrow, same-origin, and owned by the code that
uses it. Everything else in the Garden Observatory is procedural geometry,
shader/material work, or DOM.

## Garden Observatory source policy (2026-10-05)

Procedural-first is the elected direction: reference-authored control graphs,
geometry and shared surface atlases precede any new authored model. Authored
sources are permitted only after silhouette evidence proves a procedural packet
cannot meet acceptance and the orchestrator explicitly elects an asset, with
checked provenance, license, hashes, export recipe, anchors, budgets and aligned
fallbacks. This is not permission to add remote runtime assets or hand-edit GLBs.

S2-P2 currently compiles generator-produced assets and surface atlases, validates
glTF and records the census; `.blend` ingestion is not elected. S2-P3's
GLTFLoader clean cutover stays dormant until an elected asset requires it;
there is no parallel loader. KTX2 is not adopted: the elected surface-atlas
path uses PNG mip strips. Existing owned clauses change only with their packet's
code/tests/docs, as recorded in the dated `CONTRACTS.md` charter.

## Inventory and ownership

| Media | Owner | Failure behavior |
| --- | --- | --- |
| Stablecoin logo | `useShipLogoAssets` → sail atlas | painted symbol and livery |
| Chain logo | `garden-chain-flag.ts` → nobori atlas | painted maru mon and vertical initials on kinari cloth |
| Lighthouse GLB | `garden-models.ts` | aligned procedural lighthouse |
| 8 named-titan hull GLBs | `garden-models.ts` | procedural tier hull |
| Water normal | `garden-water.ts` | shader water without normal detail |
| Sail/flag atlases | renderer memory | fallback cloth/mark remains |
| Garden surface recipes | `garden-surfaces.ts` → caller-owned PBR materials | neutral texture-free finish preserves authored colour |
| Garden surface atlas | `garden-surface-atlas.ts` → explicit renderer owner and consumer leases | neutral static recipe; lease exposes request/decode error |

Stablecoin images come from `/logos/`. The checked harbor-logo set lives under
`/chains/`; only supported rendered harbors use it. All paths must begin with
`/`. Never add a remote image, generation URL, key, token, or prototype path
to browser code.

`applyGardenSurface(material, { role, mapping, metresPerRepeat, detailStrength })`
prepares moss, stone, gravel, earth, timber, plaster and roof tile without loading
media. Each role is dielectric (metalness 0): roughness is 0.9–1 for
moss/gravel/earth, 0.8–0.98 for stone/plaster, 0.72–0.92 for timber, and
0.65–0.85 for roof tile. Vertex colours own the broad masses; the initial
detail sample is neutral albedo, zero roughness offset and zero normal relief.
The raw, unmipped shared noise pack is not an albedo atlas, and these recipes
do not acquire it or introduce a second noise implementation.

All surface positions and UVs are metres. `worldXZ` selects ground mapping,
`triplanar` is reserved for steep stone, and `uv` uses metric UVs with timber
grain along U; `metresPerRepeat` supplies the repeat scale. Optional
`vertexRoles: true` consumes scalar `gardenSurfaceRole` IDs exported in
`GARDEN_SURFACE_ROLE_CODES`: moss=0, stone=1, gravel=2, earth=3, timber=4,
plaster=5, roofTile=6. Split vertices at role boundaries so a triangle has a
constant role. Optional `vertexWeights: true` consumes scalar
`gardenSurfaceWeight` [0,1], masking detail without replacing authored colour.
Builders must supply enabled attributes; ordinary materials need neither.

`material.userData.gardenSurfaceExemption` explicitly names `cloth`, `mon`,
`nobori`, `issuerTrim`, `dataTrace`, `practicalEmission`, or `foliage`.
Identity/data/practical exemptions also apply to print ink; foliage retains
its foliage/snow/wind patches and may still receive illumination ink. The
existing mixed fleet hull's issuer-trim mask also suppresses surface detail.
Metadata survives cloning, but each clone installs its own shader/uniform state.
Call only at preparation, not per frame. Repeated preparation updates scalar
uniforms; a changed recipe replaces the surface slot instead of layering it.

The shared patch chain orders existing deformation → surface → indirect
irradiance (S4 slot) → print ink → aerial. Shader cache keys encode
role/mapping/attribute/source recipe, not repeat scale or strength.
`GardenSurfaceDetailSource` is the typed atlas sampling seam: it supplies
`gardenSampleSurface` GLSL and shared uniforms, returning neutral-relative
albedo, a roughness offset and a shallow world-normal offset. Sources own and
release their texture leases; materials never dispose shared maps. The initial
neutral source owns no GPU resources or animation. Existing builders are not
migrated by this preparation packet.

## Checked models

The model manifest in `src/three/garden-models.ts` is the contract for one
lighthouse and the eight named-titan hulls. It records content-hashed URL, bytes,
hash, dimensions, origin, anchors, pick proxy, geometry budgets, provenance,
and license. `RUNTIME_FACTS.md` is generated from that manifest.

The procedural scene is created before asynchronous GLB loads. A successful
model attaches to that semantic root; a failed request preserves its fallback.
Do not let model success or failure move labels, selection, lights, or hit
targets.

Architecture and fleet preparation uses `normalizeGardenSurfaceGeometry` before
merging: missing UVs receive a metre-scaled dominant-normal projection and
missing role/detail weights receive bucket defaults. Authored UVs, roles,
weights and broad colours survive. Harbour timber, stone, plaster (`wall`) and
tile (`roof`) remain existing global buckets; identity accents, flag cloth,
issuer trim and windows are not surface detail.

Hero static merges retain shared colour, normal and PBR maps and their UV
channels. Only incompatible map/material configurations split a merge bucket;
the merged material borrows maps rather than acquiring or disposing them.
Timber detail follows fleet deformation and retains wet-hull and service-age
finishes. The renderer-lifetime fleet lease also supplies common preparation
for procedural heroes and lighthouse/precinct stone; each harbour batch owns
and releases its separate lease on teardown. Foliage remains exempt from
surface detail while retaining foliage, snow, wind and illumination-ink patches.

Change a model only through its deterministic generator:

```bash
node scripts/pharosville/generate-garden-lighthouse.mjs
node scripts/pharosville/generate-garden-heroes.mjs
npm run compile:garden-assets
npm run check:garden-models
```

Do not hand-edit a checked GLB. Preserve model origin, scale, anchors, pick
proxy, asset metadata, and fallback together.

`assets/pharosville/garden-assets.json` is the build-time provenance and decoded
census, separate from the small runtime model contract. The compiler runs each
existing generator twice in check mode, requires byte-identical regeneration
against the shipped GLBs, and never writes those GLBs. `compile:garden-assets`
refreshes the manifest only after validation; `check:garden-models` recomputes
and compares it without writing. Source and output SHA-256, source-GLB SHA,
author/license, metre units, exact Node/three/Meshoptimizer/validator versions,
export/compression options and measured position deviation are recorded.

The census decodes real geometry and counts scene-instance primitives, indexed
triangles, vertices, unique materials/maps, image inventory, world bounds,
role-tagged anchors, extensions and encoded/decoded bytes. Mesh-definition
count is not a draw-call census. Runtime metadata and per-asset budgets remain
binding and are checked against the decoded census in `garden-models.test.ts`.
No Blender or `.blend` ingestion is enabled.

### Surface-atlas compiler registration

S2-P4 registers one `kind: "atlas"` entry with id `garden-surface-atlas`, the local
generator `scripts/pharosville/generate-garden-surface-atlas.mjs`, integer `seed`
and positive `gutter` (default two texels). The generator exports
`generateGardenSurfaceAtlas({ seed })` returning `{ maps }`: albedo, normal and
ORM, each with `name`, `colorSpace`, power-of-two `cell`/`cells` and
`levels: [{ width, height, data: Uint8Array }]` of already guttered RGBA8 pixels.
`describeAtlasEntry` and `validateAtlasStrip` validate colour tags (sRGB albedo,
linear normal/ORM), dimensions, level count, halving and gutter width. All three
maps share level dimensions. The generator owns independent periodic cell mips;
the compiler does not invent or GPU-generate them.
Generator imports are pure: only direct CLI publishing dynamically imports the
compiler hooks, so the compiler can await generation without an async import cycle.

The compiler encodes each strip left-to-right, with transparent unused rows,
to `public/pharosville/textures/garden-surface-{albedo,normal,orm}.png`.
Two generated copies must have identical colour tags, dimensions and RGBA8 mip
pixels before publishing. Write mode publishes compressed atlas PNGs and records
source hashes, per-map dimensions/gutters, SHA and bytes. Check mode decodes every
published albedo, normal and ORM strip and compares its dimensions, channel layout,
colour-space contract and every authored mip pixel (including transparent padding)
against the generator. PNG compressed bytes are toolchain-dependent: different
Node/zlib implementations may encode identical pixels differently. Pixels are the
generation contract, not compressed-byte identity; a single changed pixel fails.
The manifest's SHA-256 and byte count, and runtime `?v=` cache-busting hashes,
always describe the shipped file, never a local re-encoding. Recorded Node/zlib
versions identify the publishing toolchain and are preserved when checking on a
different runtime. Untagged PNGs use the map's manifest colour space; incompatible
embedded colour metadata is rejected. S2-P4 supplies the registered generator and
three real strips; no KTX2, Basis decoder or general-loader cutover is introduced.

The family is 1024² with seven 128² role cells and one neutral reserve in its
first row; unused space is neutral rather than additional material variants.
All eleven levels are authored independently from periodic material functions;
resolved frequencies filter out at each level, and gutters stay periodic.
The mip spectrum uses the fractional-gutter core resolution at each level.
Moss concentrates elongated, phase-offset tufts below four cycles per repeat;
gravel concentrates isotropic coarse aggregate there and retains fine grains
only while resolved. Both remain structured at near-seat mips 3–4 rather than
depending on speckle that vanishes under filtering. Their per-mip sampled constant
is removed to preserve the 0.72 linear mean; modulation stays grayscale and adds
no pigment chroma. The existing diffuse footprint fade still returns role average
at distance. PNG Up filtering changes only transfer encoding. Published
albedo/normal/ORM bytes are 53,410 / 61,312 / 87,046 (201,768 total);
RGBA8 mip residency is 16,777,212 bytes, four bytes below 16 MiB.
There are no added draws or triangles.

`createGardenSurfaceAtlasOwner(onReady)` is constructed inside the desktop
renderer, stored in the explicit `GardenScene.surfaceAtlas` build context, and
released on renderer teardown. Construction loads nothing. Consumers call
`owner.lease()` only when adopting detail, pass `lease.detailSource` into
`applyGardenSurface`, and release their lease with their own resources.
Concurrent leases share one decode and three maps; the last release aborts
pending requests, disposes the maps and drops CPU mip arrays. Late decoded
ImageBitmaps are closed without reviving disposed textures. Materials never
own or dispose atlas maps. Failed loads keep the texture-free neutral recipe;
`lease.ready` resolves false and `lease.error` carries the observed failure.
All three sampler uniforms are registered before compilation and initially bind
complete, upload-ready 1×1 neutral RGBA8 mips. Once all strips decode, placeholders
are disposed and each uniform's `.value` receives a **new** full-size Texture and
Source with eleven authored mips. Uniform objects stay shared and materials do
not recompile. Resizing the original placeholder is forbidden: three r186 uses
immutable GPU storage, so an image-only resize would upload into stale 1×1 storage.
No sampler is null while loading, and placeholder GPU storage is retired before
the replacement can become resident.

ShaderMaterial consumers use the exported `GARDEN_SURFACE_GLSL` and
`lease.uniforms`, with `GARDEN_SURFACE_WORLD_XZ`, `GARDEN_SURFACE_TRIPLANAR`, or
`GARDEN_SURFACE_UV`. World positions and architecture UVs remain metres.
Gradients precede repeat/fract and steep-stone branches. Normal `textureGrad`
relief fades from one to two core texels per pixel, before its fractional gutter
can shrink below one texel. Diffuse/ORM grain remains on explicitly selected
authored mips: two integer `textureLod` samples are blended, with each mip's UV
clamped half a texel inside its role cell, never into a neighbouring role.
Diffuse/roughness fade to neutral role-average from 16 to 32 core texels per
pixel. LOD is bounded to [0,5]; non-finite footprints/coordinates/role return
neutral detail before sampling. Encoded neutral normal and roughness channels
are centred exactly on byte 128. Ground stays single-plane; only steep stone
uses reoriented side-plane normals. Dedicated adoption packets pass the
explicit owner/source.


The post chain's grade LUT strip and the shared garden-noise pack follow the
same rule: `public/pharosville/textures/garden-grade-lut.png` (the phase cubes
in one strip) and `garden-noise-pack.png` (256² RGBA: R the 64² void-and-cluster
dither tiled 4×4, G fbm, B Worley F1, A curl direction as angle/2π; every
channel tiles at 256) are regenerated bit-exact by their generator, and
`--check` guards drift:

```bash
node scripts/pharosville/generate-garden-luts.mjs
npm run check:garden-luts
```

Do not hand-edit either PNG; retune the parametric transforms in the
generator and regenerate.

The noise pack is the only noise texture in the scene (the whole-map census is
at 72/72): new sky, water, air or particle noise samples a channel of it through
`acquireGardenNoisePack` (`src/three/garden-noise-pack.ts`) instead of adding a
texture. Read A with `texelFetch`; its angles wrap.

## Logos and atlases

- Stablecoin images are abortable, cached, and decoded only after the desktop
  gate. `useShipLogoAssets` does not load terrain, models, or chain marks.
- The fleet uses one shared 16×16 sail atlas. It stores marks while instance
  attributes supply cloth/livery, so a large fleet does not acquire a texture
  per ship.
- Harbor nobori use their own shared atlas. A real chain logo can upgrade a
  cell, but the painted mon and initials on kinari cloth are the product
  contract and a failed image is not an error state.
- A logo change needs focused atlas/sail tests and browser review at overview
  and inspection scale.

## Water texture

`public/pharosville/textures/water-normals.png` is generated by
`scripts/pharosville/generate-water-normals.mjs` and served with a content-hash
query. Regenerate it through that script; do not hand-edit it.

## Adding media

Add a model only when procedural content cannot make the required silhouette,
the object matters at normal camera distance, its origin/owner/license/budgets
are explicit, and failure has an intentional fallback. Do not use a model,
texture, or post effect to solve ordinary palette, framing, or lighting work.

Generated images are exploration material, not runtime assets. Keep them under
`outputs/`; translate an approved concept into procedural code or the checked
model pipeline before shipping it.

## Validation

```bash
npm run check:runtime-media
```

The compiler runs Khronos glTF Validator on the source, compressed container and
reconstructed decoded GLB. Errors and unreviewed warnings fail compilation.
Only `UNSUPPORTED_EXTENSION` naming `EXT_meshopt_compression` is reviewed as a
validator limitation; decoded validation independently checks the geometry.
Reports retain issue codes, severity, pointers and messages. Non-GPU image views
are copied byte-for-byte and rebased rather than compressed as vertices.
The existing maximum position-deviation limit (0.00025 model units), lossless
attribute checks and triangle winding checks remain mandatory.
Decoded validation reconstructs exact POSITION accessor bounds from decoded
FLOAT VEC3 values. Each minimum/maximum must differ from its source declaration
by at most that same 0.00025-unit compression limit; a larger mismatch fails.
Only the temporary reconstructed GLB receives these bounds. Source and shipped
compressed bytes are unchanged, and Khronos still validates the reconstructed
geometry strictly without suppressing accessor-bound errors. The decoded census
uses these actual extrema rather than the source declarations.

The runtime-media scanner also validates surface-strip RGBA8 dimensions, all
eleven contiguous mip levels, colour tags, PNG CRC/inflation/filtering, opaque
level pixels, zero unused strip rows, reachable periodic gutters, local paths
and recorded SHA/bytes. For surface changes run:

```bash
npm test -- src/three/garden-surface-atlas.test.ts src/three/garden-surfaces.test.ts src/three/garden-noise-pack.test.ts
node --test scripts/pharosville/compile-garden-assets.test.mjs
npm run check:runtime-media
```

Regenerate only this family with
`node scripts/pharosville/generate-garden-surface-atlas.mjs`; it publishes through
the compiler's atlas descriptor/encoder hook and preserves all model records.
Then update the three runtime `?v=` pins to the first twelve characters of each
recorded PNG SHA. Texture paths have immutable one-year caching in `_headers`;
the runtime-media scanner requires matching pins so new detail cannot retain
an older decoded strip.


For a model change also run:

```bash
npm test -- src/three/garden-models.test.ts
node --test scripts/pharosville/compile-garden-assets.test.mjs
npm run test:visual
npm run test:perf
```

For a URL or loading-boundary change also run `npm run check:viewport-gate`,
`npm run build`, and `npm run check:bundle-size`.
