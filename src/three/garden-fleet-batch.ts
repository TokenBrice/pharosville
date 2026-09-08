import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  MathUtils,
  Matrix4,
  MeshStandardMaterial,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GARDEN_SAIL_DIP_MIN_SCALE } from "../systems/garden-arrival-beats";
import type { GardenHullSilhouette } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { cameraEye, cameraPoseFromIso, type IsoCamera, type ScreenPoint } from "../systems/projection";
import {
  GARDEN_GUST_ATTACK_SECONDS,
  GARDEN_GUST_CYCLE_SECONDS,
  GARDEN_GUST_RELEASE_SECONDS,
  GARDEN_GUST_WORLD_SPEED,
  gardenGustAtWorldPosition,
} from "../systems/weather";
import { dayCycleBeats } from "./garden-day-cycle";
import { gardenSunPose } from "./garden-sun";
import type { GardenShipGeometryCache } from "./garden-util";
import { cachedShipGeometry } from "./garden-util";

/**
 * W1 (Grand Scale Revamp, decision D2): the fleet is drawn as a small fixed
 * set of `InstancedMesh` batches instead of one `Group` of ~14 meshes per
 * ship.
 *
 * Measured cause (agents/2026-07-25-grand-scale-revamp-plan.md, finding F3):
 * the per-ship scene graph cost 28.1 ms of JS draw submission at 187 ships —
 * 90% of the frame — because every ship contributed ~14 draw calls and cloned
 * its own materials, so nothing batched.
 *
 * Layout: near hull + sails and one combined far hull/identity quad per
 * silhouette, plus the shared near pennants. Six silhouettes → at most 19
 * draws, independent of ship count; each ship enters only one LOD per frame.
 *
 * The hull assembly merges keel, hull, gunwale, deck, masts, bowsprit and
 * cabin into ONE geometry with the per-part tonal split baked into vertex
 * colors, so a single `instanceColor` (the ship's livery) reproduces the old
 * multi-material read. Sails merge likewise; the identity sail's vertices
 * carry `aAtlasSail = 1` so the shader routes only that sail's UVs through
 * the per-instance logo atlas cell (decision D3).
 */

/** Ship parts whose color must survive the merge as a vertex-color multiplier. */
const KEEL_TINT = new Color(0.3, 0.26, 0.25);
const DECK_TINT = new Color(1.06, 0.99, 0.86);
const GUNWALE_TINT = new Color(1.25, 1.2, 1.1);
const MAST_TINT = new Color(0.52, 0.44, 0.36);
const MATTING_TINT = new Color(0.86, 0.87, 0.75);

/**
 * Atlas geometry (D3). A 16x16 grid of 128px cells in a 2048² canvas texture.
 * Cell 0 is the plain-canvas cell every non-identity sail samples.
 */
/**
 * Instance capacity for every fleet batch. Sized above the ~205-ship world
 * (D1 raises the render cap to 320) so a data refresh never reallocates GPU
 * buffers — batches are grow-only for the life of the renderer.
 */
export const GARDEN_FLEET_BATCH_CAPACITY = 320;

export const FLEET_SAIL_ATLAS_COLUMNS = 16;
export const FLEET_SAIL_ATLAS_CELLS = FLEET_SAIL_ATLAS_COLUMNS * FLEET_SAIL_ATLAS_COLUMNS;
export const FLEET_SAIL_ATLAS_CELL_PX = 128;
export const FLEET_SAIL_ATLAS_SIZE_PX = FLEET_SAIL_ATLAS_COLUMNS * FLEET_SAIL_ATLAS_CELL_PX;

export interface FleetBatchPart {
  /** Per-instance atlas cell index; only meaningful on the sail batch. */
  atlasCell: InstancedBufferAttribute | null;
  /** Packed eased attention (x) and eye-distance presence (y). */
  sailAttention: InstancedBufferAttribute | null;
  /** Per-instance hull proportions (length, beam, height) — N5(a). */
  hullForm: InstancedBufferAttribute;
  /** W5.8/W7.3: (value scalar, age patina or -1, prop rotation, rope sag). */
  hullSurface: InstancedBufferAttribute | null;
  mesh: InstancedMesh;
  /** Per-instance furl bitmask plus fractional sail dip; only meaningful on the sail batch. */
  sailFurl: InstancedBufferAttribute | null;
  /** Per-instance cloth dye (F1); only meaningful on the sail batch. */
  sailTint: InstancedBufferAttribute | null;
  /** Per-instance sheer-strake paint (W1/D2); only meaningful on the hull batch. */
  trim: InstancedBufferAttribute | null;
}

export interface FleetSilhouetteBatch {
  hull: FleetBatchPart;
  sails: FleetBatchPart;
  /** One draw for the distant hull, mast and identity-sail quad. */
  far: FleetBatchPart;
}

export interface FleetBatches {
  /** Grow-only capacity; batches are never reallocated on world replace. */
  capacity: number;
  /** Per-silhouette near hull/sails and combined far batches. */
  bySilhouette: Map<GardenHullSilhouette, FleetSilhouetteBatch>;
  materials: MeshStandardMaterial[];
  pennant: FleetBatchPart;
  root: Group;
}

const scratchMatrix = new Matrix4();
const scratchPennantMatrix = new Matrix4();
const scratchWindRotation = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchScale = new Vector3();
const scratchColor = new Color();
const scratchEuler = new Euler();

/**
 * Phase 2 (Breathtaking Rendering): the fleet's share of the weather system.
 *
 * Two channels, both uniform/scratch writes — no new geometry, no new draws:
 *
 * - SAILS flutter in the vertex stage. `patchSailAtlasMaterial` attaches the
 *   shared uniform objects below, so one write per frame moves every sail in
 *   the fleet: the belly of each set sail breathes with the wind and gust
 *   envelope, phased per instance from the ship's own position so the fleet
 *   never ripples in lockstep.
 * - PENNANTS yaw downwind and flutter on the CPU in `writeFleetInstance`,
 *   where their matrices are already restamped every frame.
 *
 * The clock is the render loop's `timeSeconds`, so reduced motion (pinned at
 * 0) freezes both channels into the deterministic static composition.
 */
export interface FleetWeather {
  breath: number;
  gust: number;
  timeSeconds: number;
  /** World-XZ downwind bearing: where the pennant points toward. */
  windAngle: number;
  windDirX: number;
  windDirZ: number;
  windSpeed: number;
}

const fleetWindUniforms = {
  uWindBreath: { value: 0.5 },
  uWindDir: { value: { x: 0, y: 0 } },
  uWindSpeed: { value: 0 },
  uWindTime: { value: 0 },
  uWindFlutter: { value: 0 },
};

const fleetLightUniforms = {
  uBacklight: { value: 0 },
  uSunDir: { value: new Vector3(0, 1, 0) },
};
const fleetSunPose = { direction: fleetLightUniforms.uSunDir.value, elevation: 0 };
// Cloth never enters the practical-light bloom band.
const FLEET_CLOTH_RADIANCE_CEILING = 2.2;

/** Wall-clock illumination only; shared by every fleet sail material. */
export function setFleetLightHour(hour: number): void {
  const beats = dayCycleBeats(hour);
  fleetLightUniforms.uBacklight.value = beats.dawn + beats.golden;
  gardenSunPose(hour, fleetSunPose);
}

/**
 * Aerial perspective for the batched fleet — the "quiet the carpet" cue.
 *
 * The scene's linear fog is calibrated against the MONUMENT (garden-sky.ts):
 * everything at or below depth 178 reads at zero haze so the island's colour,
 * which the whole grade is tuned to, cannot move. That is the right call and it
 * is also why fog alone cannot fix the fleet: much of the harbour lies in
 * front of FOG_NEAR, where a dense field of hulls receives no fog restraint.
 *
 * So the fleet carries its own recession, on two axes that fog does not touch:
 *
 * 1. **Saturation, by depth.** Real aerial perspective loses CHROMA long before
 *    it loses value — distant things go grey, not white. Desaturating toward the
 *    cloth's own luminance keeps every sail's value intact (so the fleet does
 *    not smear into the water) while draining the brand chroma that makes sixty
 *    identical rectangles shout. The ramp starts well inside FOG_NEAR, so the
 *    midground grades continuously instead of stacking the whole cue into the
 *    top tenth of the frame.
 *
 * 2. **Mark legibility, by zoom.** Under a locked orthographic camera, "far
 *    away" is the top of the screen, not the edge of the fleet — depth and
 *    apparent size are decoupled. The axis that actually governs whether a
 *    logo is READABLE is zoom. At whole-map framing a mark is a few pixels of
 *    high-contrast noise and nothing else; at explore framing it is the point.
 *    So marks fade out as the camera pulls back and return crisp as it comes
 *    in, which is the same policy `garden-overview-lod.ts` already applies to
 *    props, expressed on the sail atlas.
 *
 * Identity is not lost, it is relocated: cloth keeps the ship's brand DYE at
 * every distance (a tinted sail still reads as "that issuer's colour"), and the
 * mark itself stays available through hover, selection, the detail panel and the
 * accessibility ledger — which VISUAL_INVARIANTS designates as the redundant
 * channel for exactly this reason.
 */
const fleetAerialUniforms = {
  uAerialNear: { value: 1e9 },
  uAerialFar: { value: 1e9 + 1 },
  uAerialStrength: { value: 0 },
  uClothWeave: { value: 0 },
};

/** Chroma-only loss across the middle eye-distance third. */
const FLEET_FRAMING_RESTRAINT = 0.25;

export function gardenFleetFramingRestraint(distancePresence: number): number {
  return FLEET_FRAMING_RESTRAINT * MathUtils.clamp(distancePresence, 0, 1);
}

/**
 * How much of the woven cloth impression is visible at a given zoom.
 *
 * Cloth-ness is a NEAR-framing property: at whole-map framing a sail is a few
 * pixels and a thread pattern there is only shimmer, so the weave is off below
 * ~0.52 and nearly resolved at the authored zoom-1.0 rest. The final fraction
 * arrives at inspection framing. The weave and desaturation step trade places:
 * far away the fleet is quiet colour; up close it is coloured cloth.
 */
export function gardenFleetClothWeave(zoom: number): number {
  const t = MathUtils.clamp(
    (zoom - CLOTH_WEAVE_FADE_ZOOM) / (CLOTH_WEAVE_FULL_ZOOM - CLOTH_WEAVE_FADE_ZOOM),
    0,
    1,
  );
  return t * t * (3 - 2 * t);
}

/** Below this zoom the weave is sub-pixel and would only alias. */
const CLOTH_WEAVE_FADE_ZOOM = 0.52;
/** At and above this zoom the cloth reads at full weave. */
const CLOTH_WEAVE_FULL_ZOOM = 1.12;

/**
 * Weave geometry and depth, as GLSL float literals.
 *
 * Thread counts are per sail (the uv runs 0..1 across each sail), chosen for
 * heavy sailcloth rather than shirting: coarse enough that a thread is still
 * two or three pixels at explore framing, which is what keeps it a surface and
 * not a moire. Weft is denser than warp so the cloth has a grain.
 *
 * `SHADE` is the albedo swing and `RELIEF` the normal tilt. Both are small on
 * purpose. The sail's job is to carry a colour and a mark; the weave's job is
 * to stop that colour reading as plastic. At 4.5% albedo swing, and standing
 * down 70% under the mark, the weave cannot move a white mark's contrast against
 * the cloth by anything a floor would notice — and it never runs at all at the
 * wide framings where the fleet is judged as a mass.
 */
const CLOTH_WARP_THREADS = "14.0";
const CLOTH_WEFT_THREADS = "19.0";
const CLOTH_WEAVE_SHADE = "0.045";
const CLOTH_WEAVE_RELIEF = "0.085";
/** How far the weave stands down where the emblem is — legibility first. */
const CLOTH_WEAVE_MARK_RELIEF = "0.7";

/** Attention restores issuer dye, but never removes the atmosphere in front. */
export function gardenFleetSailRestraint(input: {
  aerial: number;
  attention: number;
  framing: number;
}): number {
  const attention = MathUtils.clamp(input.attention, 0, 1);
  const framing = input.framing * (1 - attention);
  return 1 - (1 - input.aerial) * (1 - framing);
}

/** Distance presence is eased per instance before reaching either cue. */
export function gardenFleetMarkPresence(distancePresence: number): number {
  return 1 - (1 - MARK_MIN_PRESENCE) * MathUtils.clamp(distancePresence, 0, 1);
}

const MARK_MIN_PRESENCE = 0.45;
const DISTANCE_HYSTERESIS_SECONDS = 0.35;
/**
 * Eye-space distance in scene units; the dead band is 0.5 units wide. At the
 * rest shot the island sits ~120 u from the eye, so 150 keeps every hull in
 * the inlet and the mid-ground clusters rigged (they are 30-60 px there) and
 * swaps only the far-shore fleet, where a hull is a dozen pixels.
 */
export const FLEET_HULL_LOD_DISTANCE = 150;
const FLEET_HULL_LOD_HALF_HYSTERESIS = 0.25;

export interface FleetAerialPerspective {
  /** Scene fog near plane, already view-scaled by garden-sky. */
  fogNear: number;
  /** Scene fog far plane, already view-scaled by garden-sky. */
  fogFar: number;
  /** Peak chroma loss at the far end, 0..1. */
  strength: number;
  zoom: number;
}

export function setFleetAerialPerspective(aerial: FleetAerialPerspective | null): void {
  if (!aerial) {
    fleetAerialUniforms.uAerialStrength.value = 0;
    fleetAerialUniforms.uClothWeave.value = 0;
    fleetAerialUniforms.uAerialNear.value = 1e9;
    fleetAerialUniforms.uAerialFar.value = 1e9 + 1;
    return;
  }
  fleetAerialUniforms.uClothWeave.value = gardenFleetClothWeave(aerial.zoom);
  // Start the chroma ramp well inside the fog's near plane so the midground
  // grades continuously; end it with the fog so the two cues resolve together
  // at the bokashi seam rather than fighting over the horizon band.
  fleetAerialUniforms.uAerialNear.value = aerial.fogNear * AERIAL_NEAR_FACTOR;
  fleetAerialUniforms.uAerialFar.value = aerial.fogFar;
  fleetAerialUniforms.uAerialStrength.value = MathUtils.clamp(aerial.strength, 0, 1);
}

/** The chroma ramp opens at 62% of the fog's near plane. */
const AERIAL_NEAR_FACTOR = 0.62;

/**
 * W3.7: attention — chroma as the answer to "which one?"
 *
 * The framing step above quiets every rank-and-file ship. Attention is what
 * gives one of them its full dye back the moment the visitor points at it, so
 * colour becomes the world's way of saying "this one" instead of every ship
 * shouting at once. It is the same restraint read from the other end: the
 * fleet is quiet so that ONE ship can be loud.
 *
 * Attention is per instance and is keyed on the ship's ATLAS CELL, which is the
 * only stable per-ship identifier that reaches the batch — cells are assigned
 * once per world in stable ship order (`assignGardenSailAtlasCells`) and a ship
 * keeps its cell for the life of that world. Cell 0 is the shared plain-canvas
 * cell, so it can never carry attention: it is "no ship" here, exactly as it is
 * "no mark" in the atlas. (Ships past the 255 usable slots therefore cannot be
 * attended — the same overflow ships that already cannot carry a mark. At the
 * ~205-ship world no ship overflows.)
 *
 * Values EASE rather than switch. A hard cut would read as a highlight state
 * bolted onto the world; the point is that the cloth's colour comes back, the
 * way a thing resolves when you look at it. Attack is quick enough to feel
 * answered, release slow enough that sweeping the pointer across the anchorage
 * leaves a soft wake rather than a strobe.
 */
const ATTENTION_ATTACK_SECONDS = 0.12;
const ATTENTION_RELEASE_SECONDS = 0.38;
/** Below this an easing-out ship is indistinguishable from quiet; stop tracking it. */
const ATTENTION_EPSILON = 0.002;

const fleetAttention = new Map<number, number>();

export interface FleetAttention {
  deltaSeconds: number;
  /** Atlas cell of the hovered ship, or 0 for none. */
  hoveredCell: number;
  reducedMotion: boolean;
  /** Atlas cell of the selected ship, or 0 for none. */
  selectedCell: number;
}

/**
 * Advances the fleet's attention envelopes one frame. Null clears them —
 * the same "no world" reset `setFleetAerialPerspective(null)` performs.
 */
export function setFleetAttention(attention: FleetAttention | null): void {
  if (!attention) {
    fleetAttention.clear();
    return;
  }
  const hovered = Math.max(0, Math.floor(attention.hoveredCell));
  const selected = Math.max(0, Math.floor(attention.selectedCell));
  if (hovered > 0 && !fleetAttention.has(hovered)) fleetAttention.set(hovered, 0);
  if (selected > 0 && !fleetAttention.has(selected)) fleetAttention.set(selected, 0);
  if (fleetAttention.size === 0) return;

  const delta = Math.max(0, attention.deltaSeconds);
  for (const [cell, value] of fleetAttention) {
    const target = cell === hovered || cell === selected ? 1 : 0;
    let next: number;
    if (attention.reducedMotion) {
      // Reduced motion is a complete deterministic static composition: the
      // answer arrives, it does not animate into place.
      next = target;
    } else {
      const tau = target > value ? ATTENTION_ATTACK_SECONDS : ATTENTION_RELEASE_SECONDS;
      next = value + (target - value) * (1 - Math.exp(-delta / tau));
    }
    if (target === 0 && next < ATTENTION_EPSILON) fleetAttention.delete(cell);
    else fleetAttention.set(cell, next);
  }
}

/** Eased attention for one atlas cell, 0 when the ship is rank-and-file. */
export function gardenFleetAttention(cell: number): number {
  if (fleetAttention.size === 0 || cell <= 0) return 0;
  return fleetAttention.get(cell) ?? 0;
}

const pennantWind = {
  active: false,
  angle: 0,
  breath: 0.5,
  dirX: 0,
  dirZ: 0,
  gust: 0,
  speed: 0,
  time: 0,
};

export function setFleetWeather(weather: FleetWeather | null): void {
  if (!weather) {
    fleetWindUniforms.uWindTime.value = 0;
    fleetWindUniforms.uWindFlutter.value = 0;
    fleetWindUniforms.uWindSpeed.value = 0;
    pennantWind.active = false;
    return;
  }
  // The flutter envelope: sustained wind sets the floor, gusts drive the beat.
  fleetWindUniforms.uWindTime.value = Math.max(0, weather.timeSeconds);
  fleetWindUniforms.uWindBreath.value = Math.min(1, Math.max(0, weather.breath));
  fleetWindUniforms.uWindDir.value.x = weather.windDirX;
  fleetWindUniforms.uWindDir.value.y = weather.windDirZ;
  fleetWindUniforms.uWindSpeed.value = Math.min(1, Math.max(0, weather.windSpeed));
  fleetWindUniforms.uWindFlutter.value = Math.min(
    1,
    Math.max(0, weather.windSpeed * 0.55 + weather.gust * 0.45),
  );
  pennantWind.active = true;
  pennantWind.angle = weather.windAngle;
  pennantWind.breath = Math.min(1, Math.max(0, weather.breath));
  pennantWind.dirX = weather.windDirX;
  pennantWind.dirZ = weather.windDirZ;
  pennantWind.gust = weather.gust;
  pennantWind.speed = weather.windSpeed;
  pennantWind.time = Math.max(0, weather.timeSeconds);
}

/**
 * Merges a set of already-positioned part geometries into one, multiplying
 * each part's vertex colors by a tint so the merged mesh keeps the tonal
 * separation the separate materials used to provide.
 */
export function mergeTintedParts(
  parts: readonly {
    /** W7.6 fitting selector, collapsed per instance when its raw input does not support it. */
    fittingTag?: number;
    geometry: BufferGeometry;
    /**
     * W1/D2: marks this part as the sheer strake — the one band that takes the
     * issuer's paint instead of the ship's timber. Per-part rather than
     * per-vertex on purpose: the gunwale ring already follows the sheer curve
     * exactly, so a whole-part flag yields a crisp line where a height-banded
     * mask would smear across the hull's ~7 vertical rings.
     */
    strake?: boolean;
    tint?: Color;
    transform?: Matrix4;
  }[],
): BufferGeometry {
  const prepared: BufferGeometry[] = [];
  for (const part of parts) {
    // `mergeGeometries` needs every input to agree on indexing AND on the
    // attribute set. Ship parts come from ExtrudeGeometry (indexed),
    // ShapeGeometry (indexed) and CylinderGeometry (indexed) with differing
    // extras, so normalise to non-indexed with exactly position/normal/uv/color.
    const source = part.geometry.clone();
    const ropeLike = isRopeLikePart(source);
    const cylinder = part.geometry.type === "CylinderGeometry";
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    if (part.transform) geometry.applyMatrix4(part.transform);
    applyVertexTint(geometry, part.tint);
    applyStrakeMask(geometry, part.fittingTag ? -part.fittingTag : part.strake ? 1 : 0);
    const smallPart = isSmallRepeatedPart(geometry);
    applySurfaceMasks(geometry, {
      fitting: cylinder && smallPart,
      prop: smallPart,
      rope: ropeLike,
    });
    normalizeAttributes(geometry);
    prepared.push(geometry);
  }
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  if (!merged) throw new Error("garden-fleet-batch: geometry merge failed");
  return merged;
}

function applyVertexTint(geometry: BufferGeometry, tint: Color | undefined): void {
  const position = geometry.getAttribute("position");
  const existing = geometry.getAttribute("color");
  const colors = new Float32Array(position.count * 3);
  const multiplier = tint ?? new Color(1, 1, 1);
  for (let index = 0; index < position.count; index += 1) {
    if (existing) {
      scratchColor.setRGB(
        existing.getX(index),
        existing.getY(index),
        existing.getZ(index),
      );
    } else {
      scratchColor.setRGB(1, 1, 1);
    }
    colors[index * 3] = scratchColor.r * multiplier.r;
    colors[index * 3 + 1] = scratchColor.g * multiplier.g;
    colors[index * 3 + 2] = scratchColor.b * multiplier.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

function applyStrakeMask(geometry: BufferGeometry, value: number): void {
  const position = geometry.getAttribute("position");
  const mask = new Float32Array(position.count);
  if (value !== 0) mask.fill(value);
  geometry.setAttribute("aStrakeMask", new Float32BufferAttribute(mask, 1));
}

function geometrySpan(geometry: BufferGeometry): { x: number; y: number; z: number } {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  return { x: box.max.x - box.min.x, y: box.max.y - box.min.y, z: box.max.z - box.min.z };
}

function isSmallRepeatedPart(geometry: BufferGeometry): boolean {
  const span = geometrySpan(geometry);
  return Math.max(span.x, span.y, span.z) <= 1.4;
}

function isRopeLikePart(geometry: BufferGeometry): boolean {
  const spans = Object.values(geometrySpan(geometry)).sort((a, b) => b - a);
  return spans[0]! >= 0.5 && spans[1]! <= 0.1 && spans[2]! <= 0.1;
}

function applySurfaceMasks(
  geometry: BufferGeometry,
  flags: { fitting: boolean; prop: boolean; rope: boolean },
): void {
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const centerX = (box.min.x + box.max.x) / 2;
  const centerY = (box.min.y + box.max.y) / 2;
  const centerZ = (box.min.z + box.max.z) / 2;
  const extentX = Math.max(0.001, (box.max.x - box.min.x) / 2);
  const extentY = Math.max(0.001, (box.max.y - box.min.y) / 2);
  const extentZ = Math.max(0.001, (box.max.z - box.min.z) / 2);
  const pivot = new Float32Array(position.count * 4);
  // Pack four scalar masks into one vertex slot. InstancedMesh already spends
  // four slots on instanceMatrix; keeping these separate exceeded the WebGL
  // minimum of 16 attributes on the operator GPU once hull surface landed.
  const partMasks = new Float32Array(position.count * 4);
  for (let index = 0; index < position.count; index += 1) {
    pivot[index * 4] = centerX;
    pivot[index * 4 + 1] = centerY;
    pivot[index * 4 + 2] = centerZ;
    pivot[index * 4 + 3] = extentX;
    partMasks[index * 4] = flags.prop ? 1 : 0;
    partMasks[index * 4 + 1] = flags.rope ? 1 : 0;
    partMasks[index * 4 + 2] = flags.fitting ? 1 : 0;
    const nx = Math.abs(position.getX(index) - centerX) / extentX;
    const ny = Math.abs(position.getY(index) - centerY) / extentY;
    const nz = Math.abs(position.getZ(index) - centerZ) / extentZ;
    partMasks[index * 4 + 3] = Math.max(
      ny > 0.82 ? 1 : 0,
      nx > 0.92 || nz > 0.92 ? 0.55 : 0,
    );
  }
  geometry.setAttribute("aVariationPivot", new Float32BufferAttribute(pivot, 4));
  geometry.setAttribute("aPartMasks", new Float32BufferAttribute(partMasks, 4));
}

/**
 * `mergeGeometries` rejects inputs whose attribute sets differ. Ship parts come
 * from `ExtrudeGeometry`, `ShapeGeometry` and `CylinderGeometry`, which agree
 * on position/normal/uv/color but disagree on extras — so drop the extras and
 * synthesise anything missing.
 */
const MERGED_ATTRIBUTES = new Set([
  "position", "normal", "uv", "color", "aStrakeMask", "aVariationPivot",
  "aPartMasks",
]);

function normalizeAttributes(geometry: BufferGeometry): void {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  if (!geometry.getAttribute("uv")) {
    geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  if (!geometry.getAttribute("aStrakeMask")) {
    geometry.setAttribute("aStrakeMask", new Float32BufferAttribute(new Float32Array(position.count), 1));
  }
  if (!geometry.getAttribute("aVariationPivot")) {
    geometry.setAttribute("aVariationPivot", new Float32BufferAttribute(new Float32Array(position.count * 4), 4));
  }
  if (!geometry.getAttribute("aPartMasks")) {
    geometry.setAttribute(
      "aPartMasks",
      new Float32BufferAttribute(new Float32Array(position.count * 4), 4),
    );
  }
  for (const name of Object.keys(geometry.attributes)) {
    if (!MERGED_ATTRIBUTES.has(name)) geometry.deleteAttribute(name);
  }
}

/**
 * Marks which vertices route their UVs through the per-instance logo atlas
 * cell. Non-identity sails keep `0` and sample the plain-canvas cell.
 */
export function markAtlasSail(geometry: BufferGeometry, isIdentitySail: boolean): void {
  const position = geometry.getAttribute("position");
  const flags = new Float32Array(position.count);
  if (isIdentitySail) flags.fill(1);
  geometry.setAttribute("aAtlasSail", new Float32BufferAttribute(flags, 1));
}

/**
 * Patches a sail material so each instance samples its own atlas cell.
 *
 * Per-vertex `aAtlasSail` selects between the plain-canvas cell (0) and the
 * instance's logo cell, so a merged multi-sail geometry can carry both reads
 * in a single draw call.
 */
/**
 * N5(a): deforms the shared silhouette into each ship's own proportions.
 *
 * The batched fleet draws one InstancedMesh per silhouette, so ships cannot
 * have their own geometry — but they can have their own shape. `aHullForm`
 * carries (length, beam, height) per instance and this patch applies it in the
 * vertex stage, which costs no extra draw call and no extra geometry.
 *
 * Height scales the topsides ONLY: the multiplier ramps in above the waterline
 * so the underwater body and the keel stay put. Scaling y uniformly would push
 * hulls through the sea surface or lift them off it, and the waterline is the
 * one line the whole scene reads against.
 *
 * Applied identically to the hull and sail materials so rigs stay attached to
 * the masts they hang on.
 */
const HULL_FORM_ATTRIBUTE = "attribute vec4 aHullForm;";
const HULL_FORM_DEFORM = `
{
  transformed.x *= aHullForm.x;
  transformed.z *= aHullForm.y;
  float topsides = smoothstep(0.0, 0.45, transformed.y);
  transformed.y *= mix(1.0, aHullForm.z, topsides);
  transformed.y += aHullForm.w;
}`;

/** Applies the per-instance deformation to a vertex shader source. */
function withHullForm(vertexShader: string): string {
  return vertexShader
    .replace("#include <common>", `#include <common>\n${HULL_FORM_ATTRIBUTE}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${HULL_FORM_DEFORM}`);
}

/**
 * W2.3 / W4: per-instance furling.
 *
 * The rig is one merged geometry per silhouette, so every ship of a family flew
 * the same canvas — dozens of bezaisen with the same single great sail set. `aSailIndex`
 * says which sail a vertex belongs to and `aSailHead` where that sail's yard
 * is; a per-instance bitmask then collapses chosen sails onto their yards.
 *
 * That buys two things at once and costs no extra batch: rig variety under way
 * (a working ship rarely has everything set), and a real harbour furl for the
 * ~120 ships that sit at a berth. The identity sail is never furled — the
 * emblem is the fleet's heraldry and must survive at anchor.
 *
 * A furled sail keeps its width and collapses in Y onto the yard, which is what
 * a bundled sail actually looks like from above; it is not hidden, so the ship
 * still reads as rigged rather than stripped.
 */
export const FLEET_MAX_SAILS = 6;
const SAIL_LOCAL_DEFORM = `
{
  float sailScale = 1.0 - fract(aSailFurl) / 0.99;
  transformed.y = aSailHead.y - (aSailHead.y - transformed.y) * sailScale;
  float furlBits = floor(floor(aSailFurl) / exp2(aSailIndex));
  float furled = furlBits - 2.0 * floor(furlBits * 0.5);
  float setSail = 1.0 - furled;
  float sailDrop = clamp(aSailHead.y - transformed.y, 0.0, 1.2);
  float gustDelay = dot(instanceMatrix[3].xz, uWindDir) / ${GARDEN_GUST_WORLD_SPEED.toFixed(1)};
  float gustClock = max(0.0, uWindTime - gustDelay);
  float gustPhase = mod(gustClock, ${GARDEN_GUST_CYCLE_SECONDS.toFixed(1)});
  float gustEnvelope = 0.0;
  if (gustPhase < ${GARDEN_GUST_ATTACK_SECONDS.toFixed(1)}) {
    float attack = gustPhase / ${GARDEN_GUST_ATTACK_SECONDS.toFixed(1)};
    gustEnvelope = 0.5 - 0.5 * cos(3.14159265 * attack);
  } else if (gustPhase < ${(GARDEN_GUST_ATTACK_SECONDS + GARDEN_GUST_RELEASE_SECONDS).toFixed(1)}) {
    float release = (gustPhase - ${GARDEN_GUST_ATTACK_SECONDS.toFixed(1)})
      / ${GARDEN_GUST_RELEASE_SECONDS.toFixed(1)};
    gustEnvelope = 0.5 + 0.5 * cos(3.14159265 * release);
  }
  float localFlutter = clamp(
    uWindSpeed * 0.55 + gustEnvelope * (0.3 + uWindSpeed * 0.7) * 0.45,
    0.0,
    1.0
  );
  float flutterPhase = uWindTime * (1.2 + localFlutter * 1.6) + aSailIndex * 1.7
    + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
  transformed.z += sin(flutterPhase)
    * sailDrop
    * (0.015 + localFlutter * 0.06)
    * (0.92 + uWindBreath * 0.16)
    * setSail;
  transformed.y = mix(transformed.y, aSailHead.y - 0.05, furled);
  transformed.z = mix(transformed.z, aSailHead.z, furled * 0.8);
}`;

export interface FleetSailDeformInput {
  /** Integer furl bitmask, optionally carrying the packed sail dip fraction. */
  furlMask: number;
  sailScale?: number;
  hullForm: { beam: number; height: number; length: number; waterline: number };
  instanceX: number;
  instanceZ: number;
  sailHead: { y: number; z: number };
  sailIndex: number;
  vertex: { x: number; y: number; z: number };
  windFlutter: number;
  windTime: number;
}

/** CPU reference for the sail-local animation followed by hull deformation. */
export function deformFleetSailVertex(input: FleetSailDeformInput): {
  setSail: number;
  x: number;
  y: number;
  z: number;
} {
  const furlMask = Math.floor(input.furlMask);
  const furlBits = Math.floor(furlMask / (2 ** input.sailIndex));
  const furled = furlBits - 2 * Math.floor(furlBits * 0.5);
  const setSail = 1 - furled;
  const windFlutter = Math.min(1, Math.max(0, input.windFlutter));
  const sailScale = input.sailScale === undefined
    ? 1 - (input.furlMask - furlMask) / 0.99
    : MathUtils.clamp(input.sailScale, GARDEN_SAIL_DIP_MIN_SCALE, 1);
  const scaledY = input.sailHead.y - (input.sailHead.y - input.vertex.y) * sailScale;
  const sailDrop = Math.min(1.2, Math.max(0, input.sailHead.y - scaledY));
  const flutterPhase = Math.max(0, input.windTime) * (2 + windFlutter * 3.5)
    + input.sailIndex * 1.7
    + input.instanceX * 0.31
    + input.instanceZ * 0.17;
  let x = input.vertex.x;
  let y = scaledY;
  let z = input.vertex.z
    + Math.sin(flutterPhase) * sailDrop * (0.015 + windFlutter * 0.06) * setSail;
  y = y * setSail + (input.sailHead.y - 0.05) * furled;
  z = z * (1 - furled * 0.8) + input.sailHead.z * furled * 0.8;

  x *= input.hullForm.length;
  z *= input.hullForm.beam;
  const topsidesT = Math.min(1, Math.max(0, y / 0.45));
  const topsides = topsidesT * topsidesT * (3 - 2 * topsidesT);
  y *= 1 + (input.hullForm.height - 1) * topsides;
  y += input.hullForm.waterline;
  return { setSail, x, y, z };
}

/**
 * W1 (decision D2): the sheer strake carries the issuer's paint, the rest of
 * the hull carries its timber.
 *
 * `<color_vertex>` has already folded the baked vertex colours and the ship's
 * per-instance timber into `vColor`. On the strake we swap the timber for the
 * per-instance `aTrim` while KEEPING the baked colour — the gunwale's own
 * highlight tint rides along, so the painted rail stays the brightest band on
 * the hull rather than going dark under a dark brand.
 */
const STRAKE_PAINT = `
#ifdef USE_COLOR
  vColor.xyz = mix(vColor.xyz, color.xyz * aTrim, step(0.5, aStrakeMask));
#endif`;

const HULL_FITTINGS_DEFORM = `
{
  float fittingTag = -aStrakeMask;
  if (fittingTag > 0.5) {
    float fittingCode = floor(aHullSurface.w + 0.5);
    float redemptionLevel = mod(fittingCode, 4.0);
    float collateralCargo = floor(mod(fittingCode, 12.0) / 4.0);
    float customsBrand = floor(fittingCode / 12.0);
    float showFitting = fittingTag < 3.5
      ? step(fittingTag, redemptionLevel)
      : fittingTag < 4.5
        ? step(0.5, 1.0 - abs(collateralCargo - 1.0))
        : fittingTag < 5.5
          ? step(0.5, 1.0 - abs(collateralCargo - 2.0))
          : step(0.5, customsBrand);
    transformed = mix(aVariationPivot.xyz, transformed, showFitting);
  }
}`;

const HULL_WABI_DEFORM = `
{
  if (aPartMasks.x > 0.5) {
    float propSign = sin(aVariationPivot.x * 12.9898 + aVariationPivot.z * 78.233) < 0.0 ? -1.0 : 1.0;
    float angle = aHullSurface.z * propSign;
    vec2 offset = transformed.xz - aVariationPivot.xz;
    float c = cos(angle);
    float s = sin(angle);
    transformed.xz = aVariationPivot.xz + mat2(c, -s, s, c) * offset;
  }
  if (aPartMasks.y > 0.5) {
    float along = clamp(abs(transformed.x - aVariationPivot.x) / aVariationPivot.w, 0.0, 1.0);
    float catenary = 1.0 - along * along;
    float ropeSag = aHullSurface.w - floor(aHullSurface.w + 0.5);
    transformed.y -= abs(ropeSag) * catenary;
    transformed.z += ropeSag * catenary * 0.35;
  }
}`;

const HULL_SURFACE_COLOR = `
#ifdef USE_COLOR
  float age = max(aHullSurface.y, 0.0);
  vColor.xyz *= aHullSurface.x * mix(1.0, 0.88, age);
  vColor.xyz *= 1.0 + aPartMasks.w * age * 0.075;
  float fittingWear = aPartMasks.z * age * 0.18;
  float fittingLuma = dot(vColor.xyz, vec3(0.2126, 0.7152, 0.0722));
  vec3 verdigris = vec3(0.35, 0.52, 0.43);
  verdigris *= fittingLuma / dot(verdigris, vec3(0.2126, 0.7152, 0.0722));
  vColor.xyz = mix(vColor.xyz, verdigris, fittingWear);
#endif`;

/**
 * Wet timber is darker, less saturated and glossier; the painted gunwale
 * carries full varnish. Interpolate height, not a vertex-sampled wet mask:
 * coarse topside faces can cross the whole collar without a vertex inside it.
 * World-space width keeps the 0.22 collar readable across the scale ladder.
 * The authored waterline stays fixed on the planks instead of following bob.
 * No new attributes: the rail uses the existing strake mask.
 */
const HULL_SURFACE_GLOSS = `
#ifdef USE_INSTANCING
  float shipScale = max(0.001, length(instanceMatrix[1].xyz));
#else
  float shipScale = 1.0;
#endif
  vHullFinish = vec2(transformed.y * shipScale + 0.38, step(0.5, aStrakeMask));`;

const HULL_WET_FRAGMENT = `
  float wet = 1.0 - smoothstep(0.0, 0.22, abs(vHullFinish.x));
  float wetLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(wetLuma), wet * 0.3);
  diffuseColor.rgb *= mix(1.0, 0.62, wet);`;

const HULL_GLOSS_FRAGMENT = `
  roughnessFactor = mix(roughnessFactor, 0.45, clamp(max(vHullFinish.y, wet), 0.0, 1.0));`;

export function patchFleetHullFormMaterial(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = withHullForm(shader.vertexShader)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${HULL_WABI_DEFORM}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${HULL_FITTINGS_DEFORM}`)
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aStrakeMask;
        attribute vec3 aTrim;
        attribute vec4 aHullSurface;
        attribute vec4 aVariationPivot;
        attribute vec4 aPartMasks;
        varying vec2 vHullFinish;`,
      )
      .replace("#include <color_vertex>", `#include <color_vertex>\n${STRAKE_PAINT}\n${HULL_SURFACE_COLOR}`)
      // After every deform: `transformed` has to be final before the waterline
      // band can know where on the planking it lands.
      .replace("#include <project_vertex>", `${HULL_SURFACE_GLOSS}\n#include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec2 vHullFinish;")
      .replace("#include <color_fragment>", `#include <color_fragment>\n${HULL_WET_FRAGMENT}`)
      .replace(
        "#include <roughnessmap_fragment>",
        `#include <roughnessmap_fragment>\n${HULL_GLOSS_FRAGMENT}`,
      );
  };
  // The shader shape changed, so previously compiled fleet programs cannot be reused.
  material.customProgramCacheKey = () =>
    "garden-fleet-hull-form-strake-trim-wabi-age-fittings-wet-collar";
}

export function patchSailAtlasMaterial(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uBacklight = fleetLightUniforms.uBacklight;
    shader.uniforms.uSunDir = fleetLightUniforms.uSunDir;
    shader.uniforms.uWindTime = fleetWindUniforms.uWindTime;
    shader.uniforms.uWindFlutter = fleetWindUniforms.uWindFlutter;
    shader.uniforms.uWindBreath = fleetWindUniforms.uWindBreath;
    shader.uniforms.uWindDir = fleetWindUniforms.uWindDir;
    shader.uniforms.uWindSpeed = fleetWindUniforms.uWindSpeed;
    shader.uniforms.uAerialNear = fleetAerialUniforms.uAerialNear;
    shader.uniforms.uAerialFar = fleetAerialUniforms.uAerialFar;
    shader.uniforms.uAerialStrength = fleetAerialUniforms.uAerialStrength;
    shader.uniforms.uClothWeave = fleetAerialUniforms.uClothWeave;
    // Sail-local flutter and furling run before hull form, so height and ride
    // cannot change the animation envelope or reopen bundled canvas.
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${HULL_FORM_ATTRIBUTE}`)
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>\n${SAIL_LOCAL_DEFORM}\n${HULL_FORM_DEFORM}`,
      )
      // Our own depth varying rather than `vViewPosition`: that one is declared
      // by three's normal chunks and is absent under FLAT_SHADED, so relying on
      // it would make this patch depend on an unrelated material flag.
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>\n        vAerialDepth = -mvPosition.z;`,
      )
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uWindTime;
        uniform float uWindFlutter;
        uniform float uWindBreath;
        uniform vec2 uWindDir;
        uniform float uWindSpeed;
        attribute float aAtlasSail;
        attribute float aAtlasCell;
        attribute float aSailFurl;
        attribute float aSailIndex;
        attribute vec3 aSailHead;
        attribute vec3 aSailTint;
        attribute vec2 aSailAttention;
        varying float vSailDistance;
        varying vec2 vAtlasUv;
        varying vec2 vClothUv;
        varying vec3 vSailTint;
        varying float vAerialDepth;
        varying float vSailAttention;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        {
          float columns = ${FLEET_SAIL_ATLAS_COLUMNS}.0;
          float cell = aAtlasSail > 0.5 ? aAtlasCell : 0.0;
          float canvasRow = floor(cell / columns);
          float textureRow = columns - 1.0 - canvasRow;
          vec2 cellOrigin = vec2(mod(cell, columns), textureRow) / columns;
          vAtlasUv = cellOrigin + uv / columns;
          vSailTint = aSailTint;
          vClothUv = uv;
          vSailAttention = aSailAttention.x;
          vSailDistance = aSailAttention.y;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uAerialNear;
        uniform float uAerialFar;
        uniform float uAerialStrength;
        uniform float uClothWeave;
        uniform float uBacklight;
        uniform vec3 uSunDir;
        varying vec2 vAtlasUv;
        varying vec2 vClothUv;
        varying vec3 vSailTint;
        varying float vAerialDepth;
        varying float vSailAttention;
        varying float vSailDistance;
        float gClothWarp = 0.0;
        float gClothWeft = 0.0;`,
      )
      // F1: the cloth is DYED per instance and the atlas carries only marks.
      //
      // The atlas cell is painted with a transparent ground, so its alpha is
      // "how much of this texel is a mark". Where there is no mark the sail
      // takes the ship's brand colour; where there is one, the mark's own
      // colour survives untinted, which is what keeps a logo legible on a
      // saturated sail.
      //
      // This composite has to live in <map_fragment> and use its own attribute
      // rather than three's instanceColor: <color_fragment> runs AFTER this and
      // would multiply the mark by the dye as well.
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec4 sailTexel = texture2D(map, vAtlasUv);

          float aerial = smoothstep(uAerialNear, uAerialFar, vAerialDepth);

          float markPresence = mix(1.0, ${MARK_MIN_PRESENCE}, vSailDistance);
          float markVisibility = markPresence * (1.0 - aerial * 0.8);
          vec3 sailCloth = mix(vSailTint, sailTexel.rgb, sailTexel.a * markVisibility);

          float attention = clamp(vSailAttention, 0.0, 1.0);
          float clothLuma = dot(sailCloth, vec3(0.2126, 0.7152, 0.0722));
          float framingStep = vSailDistance * ${FLEET_FRAMING_RESTRAINT} * (1.0 - attention);
          float restraint = aerial * uAerialStrength;
          restraint = 1.0 - (1.0 - restraint) * (1.0 - framingStep);
          sailCloth = mix(sailCloth, vec3(clothLuma), restraint);

          vec2 threads = vClothUv * vec2(${CLOTH_WARP_THREADS}, ${CLOTH_WEFT_THREADS}) * 6.2831853;
          float warp = sin(threads.x);
          float weft = sin(threads.y);
          float weave = warp * 0.5 + weft * 0.4 + warp * weft * 0.34;
          weave *= 0.86 + 0.14 * sin(vClothUv.x * 7.3 + vClothUv.y * 5.1);
          float threadPitch = max(fwidth(vClothUv.x), fwidth(vClothUv.y));
          float clothDetail = 1.0 - smoothstep(0.02, 0.085, threadPitch);
          float markCover = sailTexel.a * markVisibility;
          float weaveAmount = uClothWeave * clothDetail
            * (1.0 - markCover * ${CLOTH_WEAVE_MARK_RELIEF});
          sailCloth *= 1.0 + weave * ${CLOTH_WEAVE_SHADE} * weaveAmount;
          gClothWarp = cos(threads.x) * weaveAmount;
          gClothWeft = cos(threads.y) * weaveAmount;

          diffuseColor.rgb *= sailCloth;
          totalEmissiveRadiance *= sailCloth;
        #endif`,
      )
      // W3.7: the weave has to catch the light or it is a printed pattern, not
      // cloth. A tangent frame built from the shading normal itself (the sails
      // carry no tangents, and generating them would cost a buffer per
      // silhouette for a sub-pixel effect) tilts the normal along warp and weft.
      // The cross with world up is safe here because sails stand near-vertical,
      // and the epsilon guards the degenerate case rather than relying on that.
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
        {
          vec3 clothTangent = normalize(cross(normal, vec3(0.0, 1.0, 0.0)) + vec3(1e-4, 0.0, 0.0));
          vec3 clothBitangent = cross(normal, clothTangent);
          normal = normalize(
            normal
              + (clothTangent * gClothWarp + clothBitangent * gClothWeft)
                * ${CLOTH_WEAVE_RELIEF}
          );
        }`,
      )
      .replace(
        "#include <opaque_fragment>",
        `{
          // Three's face-oriented shading normal is view-space; transform the
          // shared world-space sun before comparing the back face to the light.
          vec3 clothSunDir = normalize(mat3(viewMatrix) * uSunDir);
          float wrap = clamp(-dot(normal, clothSunDir), 0.0, 1.0);
          outgoingLight += wrap * diffuseColor.rgb * uBacklight;
          float clothPeak = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b);
          outgoingLight *= min(1.0, ${FLEET_CLOTH_RADIANCE_CEILING.toFixed(1)} / max(clothPeak, 0.0001));
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () =>
    "garden-fleet-sail-atlas-hull-form-dye-furl-emissive-trim-aerial-framing-weave-backlight";
}

function createInstancedPart(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  capacity: number,
  withAtlasCell: boolean,
  withTrim = false,
  withLivery = false,
): FleetBatchPart {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance starts collapsed; the frame loop opens only the live ones.
  scratchMatrix.makeScale(0, 0, 0);
  for (let index = 0; index < capacity; index += 1) mesh.setMatrixAt(index, scratchMatrix);
  mesh.instanceMatrix.needsUpdate = true;
  // Livery parts are written with setColorAt; allocate the buffer now so the
  // program compiles with USE_INSTANCING_COLOR from its first frame instead of
  // once without it (an undeclared `instanceColor` in the far shader) and
  // once with. Cloth never carries it: the sail program is at the 16-slot cap.
  if (withLivery) {
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
  }
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  // Instance transforms are written every frame, so three's per-instance
  // bounding-sphere culling would be wrong; the fleet spans the whole sea and
  // the batch is always on screen.
  mesh.frustumCulled = false;
  let atlasCell: InstancedBufferAttribute | null = null;
  let sailAttention: InstancedBufferAttribute | null = null;
  let sailFurl: InstancedBufferAttribute | null = null;
  let sailTint: InstancedBufferAttribute | null = null;
  if (withAtlasCell) {
    atlasCell = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    atlasCell.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aAtlasCell", atlasCell);
    // F1: the cloth dye. Defaults to white so an unwritten instance renders as
    // plain canvas rather than black.
    sailTint = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    sailTint.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aSailTint", sailTint);
    // Integer bits select furled sails; the fractional part stores the yard-relative
    // arrival dip without consuming another vertex attribute. Zero means fully set.
    sailFurl = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    sailFurl.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aSailFurl", sailFurl);
    // Two viewing conditions share one attribute location: the sail geometry
    // already consumes WebGL's guaranteed sixteen-location budget.
    sailAttention = new InstancedBufferAttribute(new Float32Array(capacity * 2), 2);
    sailAttention.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aSailAttention", sailAttention);
  }
  // N5(a): per-ship hull proportions, plus the Tier 3 #13 peg trim in `w`.
  // Defaults to (1,1,1,0) — authored shape, even keel — so an instance that is
  // never written neither collapses nor claims a peg reading.
  const hullFormDefaults = new Float32Array(capacity * 4);
  for (let index = 0; index < capacity; index += 1) {
    hullFormDefaults[index * 4] = 1;
    hullFormDefaults[index * 4 + 1] = 1;
    hullFormDefaults[index * 4 + 2] = 1;
  }
  const hullForm = new InstancedBufferAttribute(hullFormDefaults, 4);
  hullForm.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aHullForm", hullForm);
  // W1/D2: the sheer strake's paint. Defaults to white, which leaves the rail
  // reading as bare timber highlight until an instance is written.
  let trim: InstancedBufferAttribute | null = null;
  let hullSurface: InstancedBufferAttribute | null = null;
  if (withTrim) {
    trim = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    trim.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aTrim", trim);
    const defaults = new Float32Array(capacity * 4);
    for (let index = 0; index < capacity; index += 1) {
      defaults[index * 4] = 1;
      // -1 is missing/neutral, distinct from a known age of zero days.
      defaults[index * 4 + 1] = -1;
    }
    hullSurface = new InstancedBufferAttribute(defaults, 4);
    hullSurface.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aHullSurface", hullSurface);
  }
  return { atlasCell, hullForm, hullSurface, mesh, sailAttention, sailFurl, sailTint, trim };
}

export interface FleetBatchGeometrySource {
  /** Merged hull assembly (keel, hull, gunwale, deck, masts, cabin). */
  hull: BufferGeometry;
  /** Merged sail set, carrying the `aAtlasSail` selector. */
  sails: BufferGeometry;
  far: BufferGeometry;
}

/**
 * Builds the fleet batch set. `capacity` is the maximum concurrent ships; the
 * batches are allocated once and reused across world replaces (grow-only), so
 * a data refresh never reallocates GPU buffers.
 */
export function createFleetBatches(input: {
  cache: GardenShipGeometryCache;
  capacity: number;
  geometryFor: (silhouette: GardenHullSilhouette) => FleetBatchGeometrySource;
  pennantGeometry: BufferGeometry;
  sailTexture: Texture | null;
  silhouettes: readonly GardenHullSilhouette[];
}): FleetBatches {
  const root = new Group();
  root.name = "fleet-batches";
  const materials: MeshStandardMaterial[] = [];

  const hullMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    flatShading: true,
    roughness: 0.84,
    vertexColors: true,
  });
  patchFleetHullFormMaterial(hullMaterial);
  materials.push(hullMaterial);

  const sailMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    emissive: new Color(HARBOR_PALETTE.lantern_glow),
    emissiveIntensity: 0.04,
    map: input.sailTexture,
    roughness: 0.82,
    side: DoubleSide,
    vertexColors: true,
  });
  patchSailAtlasMaterial(sailMaterial);
  materials.push(sailMaterial);

  // One material keeps the far hull and its single identity quad in one draw.
  // Reuse the cloth's atlas/atmosphere, but do not flutter timber or dye the
  // emblem with instanceColor. Existing attributes suffice (14 locations).
  const farMaterial = sailMaterial.clone();
  farMaterial.emissiveIntensity = 0;
  patchSailAtlasMaterial(farMaterial);
  const patchFarCloth = farMaterial.onBeforeCompile;
  farMaterial.onBeforeCompile = (shader, renderer) => {
    patchFarCloth(shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace(SAIL_LOCAL_DEFORM, "")
      .replace("attribute float aSailFurl;", "")
      .replace("attribute float aSailIndex;", "")
      .replace("attribute vec3 aSailHead;", "")
      .replace("vSailTint = aSailTint;", `
        #ifdef USE_INSTANCING_COLOR
          vSailTint = aAtlasSail > 0.5 ? aSailTint : instanceColor;
        #else
          vSailTint = aSailTint;
        #endif`)
      .replace("#include <color_vertex>", `#include <color_vertex>
        #if defined( USE_INSTANCING_COLOR ) && defined( USE_COLOR )
          // Undo three's instanceColor multiply: the far livery is applied via
          // vSailTint on the hull, the vertex tone stays the authored split.
          vColor.rgb = color.rgb;
        #endif`)
      .replace("varying vec2 vAtlasUv;", "varying vec2 vAtlasUv; varying float vFarCloth;")
      .replace("vClothUv = uv;", "vClothUv = uv; vFarCloth = aAtlasSail;");
    shader.fragmentShader = shader.fragmentShader
      .replace("varying vec2 vAtlasUv;", "varying vec2 vAtlasUv; varying float vFarCloth;")
      .replace("vec4 sailTexel = texture2D(map, vAtlasUv);",
        "vec4 sailTexel = vFarCloth > 0.5 ? texture2D(map, vAtlasUv) : vec4(0.0);")
      .replace("float weaveAmount = uClothWeave", "float weaveAmount = vFarCloth * uClothWeave")
      .replace("outgoingLight += wrap", "outgoingLight += vFarCloth * wrap");
  };
  farMaterial.customProgramCacheKey = () => "garden-fleet-far-hull-identity-atlas";
  materials.push(farMaterial);

  const pennantMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    flatShading: true,
    roughness: 0.7,
    side: DoubleSide,
  });
  materials.push(pennantMaterial);

  const bySilhouette = new Map<GardenHullSilhouette, FleetSilhouetteBatch>();
  for (const silhouette of input.silhouettes) {
    const source = input.geometryFor(silhouette);
    const hull = createInstancedPart(source.hull, hullMaterial, input.capacity, false, true, true);
    hull.mesh.name = `fleet-hull-${silhouette}`;
    const sails = createInstancedPart(source.sails, sailMaterial, input.capacity, true);
    sails.mesh.name = `fleet-sails-${silhouette}`;
    // Ship transforms move every frame while the harbour shadow map is static
    // between sun re-steers. Canvas shadows would therefore be stale ghosts;
    // hulls retain the low-sun silhouette and every ship already owns a live
    // water-contact shadow. Four sail shadow submissions are also the measured
    // margin that keeps the dawn scene inside its unchanged draw-call budget.
    sails.mesh.castShadow = false;
    const far = createInstancedPart(source.far, farMaterial, input.capacity, true, false, true);
    far.mesh.name = `fleet-far-${silhouette}`;
    far.mesh.geometry.deleteAttribute("aSailFurl");
    far.sailFurl = null;
    far.mesh.castShadow = false;
    root.add(hull.mesh, sails.mesh, far.mesh);
    bySilhouette.set(silhouette, { hull, sails, far });
  }

  const pennant = createInstancedPart(
    cachedShipGeometry(input.cache, "fleet.pennant", () => input.pennantGeometry),
    pennantMaterial,
    input.capacity,
    false,
    false,
    true,
  );
  pennant.mesh.name = "fleet-pennants";
  pennant.mesh.castShadow = false;
  root.add(pennant.mesh);

  return { capacity: input.capacity, bySilhouette, materials, pennant, root };
}

/** One ship's per-frame pose, written into every batch it participates in. */
export interface FleetInstancePose {
  atlasCell: number;
  shipId: string;
  /**
   * W3.7: eased attention, 0..1. Omit to let the batch resolve it from
   * `setFleetAttention`'s envelopes via this ship's atlas cell.
   */
  attention?: number;
  hullColor: Color;
  /** F1: the ship's cloth dye — its issuer's dominant brand colour. */
  sailColor: Color;
  /**
   * Per-ship proportions (length, beam, height) about 1 — N5(a) — and the
   * signed peg trim (Tier 3 #13). `waterline` is optional so a caller with no
   * peg reading to hand still gets an even keel rather than a type error.
   */
  hullForm: { beam: number; height: number; length: number; waterline?: number };
  headingAngle: number;
  heel: number;
  pennantColor: Color;
  pitch: number;
  scale: number;
  silhouette: GardenHullSilhouette;
  /**
   * W3: where this silhouette's masthead is, in ship-local units.
   *
   * The pennant batch is ONE shared geometry for the whole fleet, so it cannot
   * carry a per-silhouette offset in its vertices — it was drawn at the ship's
   * own origin, which is the waterline, i.e. buried inside the hull. Every
   * batched ship has been flying an invisible pennant; only the hero hulls,
   * which keep their own scene graph, ever showed one.
   */
  mastheadOffset: { x: number; y: number };
  /** W2.3/W4: bitmask of sails furled onto their yards, bit i = sail i. */
  sailFurl: number;
  /** Vertical sail scale about the yard; 1 at rest, 0.6 at a transient beat's minimum. */
  sailScale?: number;
  /** W1/D2: the issuer's paint on the sheer strake. */
  trimColor: Color;
  x: number;
  y: number;
  z: number;
}

interface FleetDistanceFrame {
  camera: IsoCamera;
  viewport: ScreenPoint;
  timeSeconds: number;
}

interface FleetDistanceState {
  eye: { x: number; y: number; z: number };
  time: number;
  blend: number;
  distances: number[];
  ships: Map<string, {
    distance: number;
    far: boolean;
    presence: number | null;
    part: FleetBatchPart;
    slot: number;
    seen: boolean;
  }>;
}

const fleetDistanceStates = new WeakMap<FleetBatches, FleetDistanceState>();

/**
 * Resets every batch's live count. Call once per frame before writing poses;
 * instances beyond the new count are simply not drawn, so no buffer is
 * reallocated when the fleet shrinks.
 */
export function beginFleetFrame(batches: FleetBatches, frame?: FleetDistanceFrame): void {
  if (frame) {
    const eye = cameraEye(cameraPoseFromIso(frame.camera, frame.viewport));
    const previous = fleetDistanceStates.get(batches);
    if (previous) {
      previous.eye = eye;
      previous.blend = 1 - Math.exp(-Math.max(0, frame.timeSeconds - previous.time) / DISTANCE_HYSTERESIS_SECONDS);
      previous.time = frame.timeSeconds;
      previous.distances.length = 0;
      for (const ship of previous.ships.values()) ship.seen = false;
    } else {
      fleetDistanceStates.set(batches, {
        eye, time: frame.timeSeconds, blend: 1, distances: [], ships: new Map(),
      });
    }
  } else {
    fleetDistanceStates.delete(batches);
  }
  for (const batch of batches.bySilhouette.values()) {
    batch.hull.mesh.count = 0;
    batch.sails.mesh.count = 0;
    batch.far.mesh.count = 0;
  }
  batches.pennant.mesh.count = 0;
}

/**
 * Writes one ship's pose into its chosen LOD. Pose math is allocation-free;
 * a distance record is allocated only when a ship first enters the fleet.
 */
export function writeFleetInstance(
  batches: FleetBatches,
  pose: FleetInstancePose,
): void {
  const batch = batches.bySilhouette.get(pose.silhouette);
  if (!batch) return;
  if (batch.hull.mesh.count + batch.far.mesh.count >= batches.capacity) return;
  const distanceState = fleetDistanceStates.get(batches);
  let far = false;
  let distance = 0;
  if (distanceState) {
    const eye = distanceState.eye;
    distance = Math.hypot(pose.x - eye.x, pose.y - eye.y, pose.z - eye.z);
    const previous = distanceState.ships.get(pose.shipId);
    const threshold = FLEET_HULL_LOD_DISTANCE + (previous
      ? previous.far ? -FLEET_HULL_LOD_HALF_HYSTERESIS : FLEET_HULL_LOD_HALF_HYSTERESIS
      : 0);
    far = distance > threshold;
  }
  const hull = far ? batch.far : batch.hull;
  const sails = far ? batch.far : batch.sails;
  const slot = hull.mesh.count;
  if (distanceState) {
    let ship = distanceState.ships.get(pose.shipId);
    if (!ship) {
      ship = { distance, far, presence: null, part: sails, slot, seen: true };
      distanceState.ships.set(pose.shipId, ship);
    } else {
      ship.distance = distance;
      ship.far = far;
      ship.part = sails;
      ship.slot = slot;
      ship.seen = true;
    }
    distanceState.distances.push(distance);
  }

  scratchPosition.set(pose.x, pose.y, pose.z);
  scratchQuaternion.setFromEuler(
    // Heading about Y, heel about Z, pitch about X — same order the per-ship
    // Group applied, so hit testing and follow-selected stay in agreement.
    scratchEuler.set(pose.pitch, pose.headingAngle, pose.heel, "YXZ"),
  );
  scratchScale.setScalar(pose.scale);
  scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);

  hull.mesh.setMatrixAt(slot, scratchMatrix);
  hull.mesh.setColorAt(slot, far
    ? scratchColor.copy(pose.hullColor).multiplyScalar(MathUtils.clamp(
      (pose.hullForm as FleetInstancePose["hullForm"] & { hullValue?: number }).hullValue ?? 1,
      0.85, 1.15,
    ))
    : pose.hullColor);
  hull.mesh.count = slot + 1;
  if (hull.trim) {
    hull.trim.setXYZ(slot, pose.trimColor.r, pose.trimColor.g, pose.trimColor.b);
  }
  if (hull.hullSurface) {
    const surface = pose.hullForm as FleetInstancePose["hullForm"] & {
      agePatina?: number;
      fittingCode?: number;
      hullValue?: number;
      propRotation?: number;
      ropeSag?: number;
    };
    hull.hullSurface.setXYZW(
      slot,
      // 2026-09-07 T1.10: 0.9-1.1 -> 0.85-1.15, to pass the widened decorative
      // value spread `deriveShipWabiSurface` now produces (+-6-15%).
      MathUtils.clamp(surface.hullValue ?? 1, 0.85, 1.15),
      surface.agePatina == null ? -1 : MathUtils.clamp(surface.agePatina, -1, 1),
      MathUtils.clamp(surface.propRotation ?? 0, -Math.PI / 18, Math.PI / 18),
      Math.max(0, Math.floor(surface.fittingCode ?? 0))
        + MathUtils.clamp(surface.ropeSag ?? 0, -0.1, 0.1),
    );
  }
  // Same proportions on hull and sails: the rig has to follow the hull it is
  // stepped into, and so does the trim.
  const { beam, height, length } = pose.hullForm;
  const waterline = pose.hullForm.waterline ?? 0;
  hull.hullForm.setXYZW(slot, length, beam, height, waterline);
  if (!far) {
    sails.hullForm.setXYZW(slot, length, beam, height, waterline);
    sails.mesh.setMatrixAt(slot, scratchMatrix);
    sails.mesh.count = slot + 1;
  }
  if (sails.atlasCell) {
    sails.atlasCell.setX(slot, pose.atlasCell);
  }
  if (sails.sailTint) {
    sails.sailTint.setXYZ(slot, pose.sailColor.r, pose.sailColor.g, pose.sailColor.b);
  }
  if (sails.sailFurl) {
    const sailScale = MathUtils.clamp(pose.sailScale ?? 1, GARDEN_SAIL_DIP_MIN_SCALE, 1);
    sails.sailFurl.setX(slot, pose.sailFurl + (1 - sailScale) * 0.99);
  }
  if (sails.sailAttention) {
    // W3.7: the pose may name attention outright (tests, and any future caller
    // that already holds the ship's hover/selection state); otherwise it is
    // resolved from the module's eased envelopes by atlas cell.
    sails.sailAttention.setX(
      slot,
      pose.attention ?? gardenFleetAttention(pose.atlasCell),
    );
  }

  if (far) return;
  const pennantSlot = batches.pennant.mesh.count;
  if (pennantSlot < batches.capacity) {
    scratchPennantMatrix
      // The pennant is placed on the CPU, so it does not see the shader's trim
      // and has to be told: without this a trimmed hull leaves its own pennant
      // hanging where the masthead used to be.
      .makeTranslation(pose.mastheadOffset.x, pose.mastheadOffset.y + waterline, 0.02);
    const surface = pose.hullForm as FleetInstancePose["hullForm"] & { propRotation?: number };
    const propRotation = surface.propRotation ?? 0;
    if (pennantWind.active || propRotation !== 0) {
      // Phase 2: the pennant streams downwind. The cloth runs along ship-local
      // +X, so the local yaw that points it at the wind bearing is
      // -heading - windAngle (heading here is the ship's own rotation.y), plus
      // a flutter wobble that stiffens with the gust envelope. Frozen into a
      // deterministic pose under reduced motion (timeSeconds pinned at 0).
      const localGust = gardenGustAtWorldPosition(
        pennantWind.time,
        pose.x,
        pose.z,
        {
          windDirX: pennantWind.dirX,
          windDirZ: pennantWind.dirZ,
          windSpeed: pennantWind.speed,
        },
      );
      const yaw = propRotation + (pennantWind.active ? -pose.headingAngle - pennantWind.angle
        + Math.sin(
          pennantWind.time * (1.2 + pennantWind.speed * 1.6) + pose.x * 0.37 + pose.z * 0.21,
        ) * (0.08 + pennantWind.speed * 0.22 + localGust * 0.18)
          * (0.92 + pennantWind.breath * 0.16) : 0);
      scratchPennantMatrix.multiply(scratchWindRotation.makeRotationY(yaw));
    }
    scratchPennantMatrix.premultiply(scratchMatrix);
    batches.pennant.mesh.setMatrixAt(pennantSlot, scratchPennantMatrix);
    batches.pennant.mesh.setColorAt(pennantSlot, pose.pennantColor);
    batches.pennant.mesh.count = pennantSlot + 1;
  }
}

/** Flushes every buffer touched this frame. One upload per buffer, not per ship. */
export function endFleetFrame(batches: FleetBatches): void {
  const distanceState = fleetDistanceStates.get(batches);
  if (distanceState) {
    const { distances } = distanceState;
    distances.sort((left, right) => left - right);
    const near = distances[Math.max(0, Math.ceil(distances.length / 3) - 1)] ?? 0;
    const far = distances[Math.min(distances.length - 1, Math.floor(distances.length * 2 / 3))] ?? near;
    for (const [id, ship] of distanceState.ships) {
      if (!ship.seen) {
        distanceState.ships.delete(id);
        continue;
      }
      const target = far > near ? MathUtils.clamp((ship.distance - near) / (far - near), 0, 1) : 0;
      const previous = ship.presence ?? target;
      ship.presence = previous + (target - previous) * distanceState.blend;
      ship.part.sailAttention!.setY(ship.slot, ship.presence);
    }
  }
  for (const batch of batches.bySilhouette.values()) {
    flushPart(batch.hull);
    flushPart(batch.sails);
    flushPart(batch.far);
  }
  flushPart(batches.pennant);
}

function flushPart(part: FleetBatchPart): void {
  part.hullForm.needsUpdate = true;
  part.mesh.instanceMatrix.needsUpdate = true;
  if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
  if (part.atlasCell) part.atlasCell.needsUpdate = true;
  if (part.sailTint) part.sailTint.needsUpdate = true;
  if (part.sailFurl) part.sailFurl.needsUpdate = true;
  if (part.sailAttention) part.sailAttention.needsUpdate = true;
  if (part.trim) part.trim.needsUpdate = true;
  if (part.hullSurface) part.hullSurface.needsUpdate = true;
}

/** Total live instances across the fleet — the metric the perf lane reads. */
export function fleetInstanceCount(batches: FleetBatches): number {
  let count = 0;
  for (const batch of batches.bySilhouette.values()) count += batch.hull.mesh.count + batch.far.mesh.count;
  return count;
}

/** Draw calls the fleet contributes, independent of ship count. */
export function fleetDrawCallCount(batches: FleetBatches): number {
  let count = batches.pennant.mesh.count > 0 ? 1 : 0;
  for (const batch of batches.bySilhouette.values()) {
    if (batch.hull.mesh.count > 0) count += 1;
    if (batch.sails.mesh.count > 0) count += 1;
    if (batch.far.mesh.count > 0) count += 1;
  }
  return count;
}

export function disposeFleetBatches(batches: FleetBatches): void {
  for (const batch of batches.bySilhouette.values()) {
    batch.hull.mesh.geometry.dispose();
    batch.hull.mesh.dispose();
    batch.sails.mesh.geometry.dispose();
    batch.sails.mesh.dispose();
    batch.far.mesh.geometry.dispose();
    batch.far.mesh.dispose();
  }
  batches.pennant.mesh.geometry.dispose();
  batches.pennant.mesh.dispose();
  for (const material of batches.materials) material.dispose();
  batches.bySilhouette.clear();
  batches.root.clear();
  fleetDistanceStates.delete(batches);
}

export const FLEET_BATCH_TINTS = {
  deck: DECK_TINT,
  gunwale: GUNWALE_TINT,
  keel: KEEL_TINT,
  mast: MAST_TINT,
  matting: MATTING_TINT,
} as const;
