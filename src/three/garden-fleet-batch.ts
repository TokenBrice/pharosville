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
import type { GardenHullSilhouette } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { GardenShipGeometryCache } from "./garden-util";
import { cachedShipGeometry } from "./garden-util";
import {
  injectGardenHeightFog,
  patchGardenHeightFogMaterial,
} from "./garden-height-fog";

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
 * Layout: two batches per silhouette (hull assembly + sails) plus one shared
 * pennant batch. Four silhouettes → 9 draw calls for the entire fleet,
 * regardless of whether it holds 20 ships or 320.
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
  /** Per-instance eased attention (W3.7); only meaningful on the sail batch. */
  sailAttention: InstancedBufferAttribute | null;
  /** Per-instance hull proportions (length, beam, height) — N5(a). */
  hullForm: InstancedBufferAttribute;
  mesh: InstancedMesh;
  /** Per-instance furl bitmask (W2.3/W4); only meaningful on the sail batch. */
  sailFurl: InstancedBufferAttribute | null;
  /** Per-instance cloth dye (F1); only meaningful on the sail batch. */
  sailTint: InstancedBufferAttribute | null;
  /** Per-instance sheer-strake paint (W1/D2); only meaningful on the hull batch. */
  trim: InstancedBufferAttribute | null;
}

export interface FleetSilhouetteBatch {
  hull: FleetBatchPart;
  sails: FleetBatchPart;
}

export interface FleetBatches {
  /** Grow-only capacity; batches are never reallocated on world replace. */
  capacity: number;
  /** Per-silhouette hull + sail batches. */
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
  gust: number;
  timeSeconds: number;
  /** World-XZ downwind bearing: where the pennant points toward. */
  windAngle: number;
  windSpeed: number;
}

const fleetWindUniforms = {
  uWindTime: { value: 0 },
  uWindFlutter: { value: 0 },
};

/**
 * Aerial perspective for the batched fleet — the "quiet the carpet" cue.
 *
 * The scene's linear fog is calibrated against the MONUMENT (garden-sky.ts):
 * everything at or below depth 178 reads at zero haze so the island's colour,
 * which the whole grade is tuned to, cannot move. That is the right call and it
 * is also why fog alone cannot fix the fleet: at the default framing the ground
 * plane spans depth ~121–255, so most of ~185 hulls sit below FOG_NEAR and are
 * rendered at full saturation regardless of where they are in the picture.
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
  uMarkPresence: { value: 1 },
  uAerialNear: { value: 1e9 },
  uAerialFar: { value: 1e9 + 1 },
  uAerialStrength: { value: 0 },
  uClothRestraint: { value: 0 },
  uFramingRestraint: { value: 0 },
  uClothWeave: { value: 0 },
};

/**
 * How much brand chroma the fleet gives up at the widest framing.
 *
 * This restraint lives in the SHADER and is keyed on zoom, deliberately, rather
 * than being baked into the cloth colour in `garden-sail-texture`. Decision F1
 * made the sails strongly brand-coloured on purpose — so a ship is nameable on
 * sight instead of by reading the small mark on its mainsail — and desaturating
 * the dye itself would quietly undo that for good, at every distance, with no
 * way back.
 *
 * Zoom-gating keeps both things true. Pulled out over the whole sea, where a
 * hundred and eighty-five saturated sails are just noise, the fleet settles
 * into the palette. Sail up to it and every ship is as brandable as F1 intended.
 * The restraint is a viewing condition, not a change to what a ship IS.
 */
const CLOTH_RESTRAINT_AT_OVERVIEW = 0.55;

/**
 * W3.7: the default-framing step — one further, gentle act of the SAME
 * restraint, at the framing where visitors actually dwell.
 *
 * The wide shot is already handled: `uClothRestraint` above ramps to 0.55 at
 * whole-map framing. But the default framing (zoom 0.7776) sits only a third of
 * the way up that ramp, and that is the frame the product opens on — ~185 sails
 * each still carrying most of its brand chroma, which reads as a corporate
 * regatta rather than as a harbour.
 *
 * This is deliberately NOT a new mechanism. It is the same shader-side,
 * zoom-keyed, chroma-only recession the restraint contract sanctions, composed
 * on top of the existing term, and it obeys the same three rules:
 *
 * 1. **Chroma, never value.** The step converges the cloth on its OWN luminance,
 *    so `luma(result) == luma(cloth)` exactly (the mix target's luminance IS the
 *    source's). Value is mathematically untouched, which is why the pirate
 *    contrast floor — a luminance ratio against white — cannot move under it.
 * 2. **Fully reversible.** It eases to exactly zero by the zoom at which marks
 *    are judged, so sailing in restores the dye F1 specified.
 * 3. **Never in the cloth.** `gardenSailClothColor` is untouched; lifting sail
 *    dye toward canvas is the recorded harmful experiment and stays dead.
 *
 * Operator decision 2026-08-13: **one gentle step — ~15-20% further
 * desaturation at default zoom; every issuer must stay recognizably itself at a
 * glance.** 0.18 is read as "a further 18% of whatever chroma is left", which is
 * why it composes multiplicatively with the existing term rather than adding to
 * it — adding would let two independent cues stack into a grey fleet.
 */
const FLEET_FRAMING_RESTRAINT = 0.18;

/**
 * Above this zoom the step begins to dissolve. Set just above the default
 * framing (0.7776) so the default frame pays the step in full and the very
 * first turn of the wheel already starts handing the dye back — the restraint
 * has to feel like a viewing condition responding to the visitor, not a mode.
 */
const FRAMING_RESTRAINT_RELEASE_ZOOM = 0.84;

/**
 * ...and by this zoom it is gone entirely. 1.05 is the explore/inspection
 * threshold `gardenSemanticView` already uses — the zoom at which world detail
 * appears and a mark is the subject rather than a suggestion. Ending the step
 * exactly there is what makes the contrast-floor guarantee structural rather
 * than tuned: at the zoom where marks are judged, the step contributes zero.
 */
const FRAMING_RESTRAINT_CLEAR_ZOOM = 1.05;

/**
 * The further chroma step this framing asks of a rank-and-file ship, before
 * attention is applied. Zero at and above inspection framing.
 */
export function gardenFleetFramingRestraint(zoom: number): number {
  const t = MathUtils.clamp(
    (zoom - FRAMING_RESTRAINT_RELEASE_ZOOM)
      / (FRAMING_RESTRAINT_CLEAR_ZOOM - FRAMING_RESTRAINT_RELEASE_ZOOM),
    0,
    1,
  );
  const eased = t * t * (3 - 2 * t);
  return FLEET_FRAMING_RESTRAINT * (1 - eased);
}

/**
 * How much of the woven cloth impression is visible at a given zoom.
 *
 * Cloth-ness is a NEAR-framing property: at whole-map framing a sail is a few
 * pixels and a thread pattern there is only shimmer, so the weave is off below
 * ~0.62 and comes fully in at explore framing, exactly where the desaturation
 * step is handing back the dye. The two trade places: far away the fleet is
 * quiet colour; up close it is coloured cloth.
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
const CLOTH_WEAVE_FADE_ZOOM = 0.62;
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

/**
 * CPU reference for the fragment shader's restraint composition — the one place
 * the contract is expressed as arithmetic, so tests read the same numbers the
 * GPU does.
 *
 * `aerial` is the depth term (already smoothstepped and scaled by strength);
 * `zoomRestraint` is `uClothRestraint`; `framing` is the W3.7 step.
 *
 * Attention cancels both ZOOM-keyed terms — the framing step and the overview
 * recession — because both are statements about how far away the visitor is
 * standing, and hovering a ship is the visitor answering "not this one." It does
 * NOT cancel the DEPTH term: a hovered ship on the far horizon is still behind
 * the same air as everything else, and punching a saturated sail through the
 * haze would break the aerial perspective the whole frame depends on.
 */
export function gardenFleetSailRestraint(input: {
  aerial: number;
  attention: number;
  framing: number;
  zoomRestraint: number;
}): number {
  const attention = MathUtils.clamp(input.attention, 0, 1);
  const framing = input.framing * (1 - attention);
  const base = Math.max(input.aerial, input.zoomRestraint * (1 - attention));
  return 1 - (1 - base) * (1 - framing);
}

/**
 * How much of the painted mark survives at a given zoom.
 *
 * Floor is deliberately non-zero at the default framing: the sails should read
 * as cloth that HAS a device on it, seen from across a harbour, rather than as
 * blank canvas. Fully suppressing the mark tips from restraint into absence.
 */
export function gardenFleetMarkPresence(zoom: number): number {
  const t = MathUtils.clamp((zoom - MARK_FADE_ZOOM) / (MARK_FULL_ZOOM - MARK_FADE_ZOOM), 0, 1);
  const eased = t * t * (3 - 2 * t);
  return MARK_MIN_PRESENCE + (1 - MARK_MIN_PRESENCE) * eased;
}

/** Below this zoom a mark is pixels of noise, so only the floor remains. */
const MARK_FADE_ZOOM = 0.58;
/** At and above explore framing the mark is the subject; render it fully. */
const MARK_FULL_ZOOM = 1.12;
/** Never fully absent — see `gardenFleetMarkPresence`. */
const MARK_MIN_PRESENCE = 0.26;

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
    fleetAerialUniforms.uMarkPresence.value = 1;
    fleetAerialUniforms.uAerialStrength.value = 0;
    fleetAerialUniforms.uClothRestraint.value = 0;
    fleetAerialUniforms.uFramingRestraint.value = 0;
    fleetAerialUniforms.uClothWeave.value = 0;
    fleetAerialUniforms.uAerialNear.value = 1e9;
    fleetAerialUniforms.uAerialFar.value = 1e9 + 1;
    return;
  }
  const presence = gardenFleetMarkPresence(aerial.zoom);
  fleetAerialUniforms.uMarkPresence.value = presence;
  // Marks and chroma recede together on the same zoom curve — one act of
  // restraint, not two competing ones.
  fleetAerialUniforms.uClothRestraint.value = (1 - presence) * CLOTH_RESTRAINT_AT_OVERVIEW;
  // W3.7: ...and the default framing takes one further, gentle step on the same
  // axis, which attention (hover/selection) cancels per instance.
  fleetAerialUniforms.uFramingRestraint.value = gardenFleetFramingRestraint(aerial.zoom);
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

const pennantWind = { active: false, angle: 0, gust: 0, speed: 0, time: 0 };

export function setFleetWeather(weather: FleetWeather | null): void {
  if (!weather) {
    fleetWindUniforms.uWindTime.value = 0;
    fleetWindUniforms.uWindFlutter.value = 0;
    pennantWind.active = false;
    return;
  }
  // The flutter envelope: sustained wind sets the floor, gusts drive the beat.
  fleetWindUniforms.uWindTime.value = Math.max(0, weather.timeSeconds);
  fleetWindUniforms.uWindFlutter.value = Math.min(
    1,
    Math.max(0, weather.windSpeed * 0.55 + weather.gust * 0.45),
  );
  pennantWind.active = true;
  pennantWind.angle = weather.windAngle;
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
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    if (part.transform) geometry.applyMatrix4(part.transform);
    applyVertexTint(geometry, part.tint);
    applyStrakeMask(geometry, part.strake ?? false);
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

function applyStrakeMask(geometry: BufferGeometry, isStrake: boolean): void {
  const position = geometry.getAttribute("position");
  const mask = new Float32Array(position.count);
  if (isStrake) mask.fill(1);
  geometry.setAttribute("aStrakeMask", new Float32BufferAttribute(mask, 1));
}

/**
 * `mergeGeometries` rejects inputs whose attribute sets differ. Ship parts come
 * from `ExtrudeGeometry`, `ShapeGeometry` and `CylinderGeometry`, which agree
 * on position/normal/uv/color but disagree on extras — so drop the extras and
 * synthesise anything missing.
 */
const MERGED_ATTRIBUTES = new Set(["position", "normal", "uv", "color", "aStrakeMask"]);

function normalizeAttributes(geometry: BufferGeometry): void {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  if (!geometry.getAttribute("uv")) {
    geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  if (!geometry.getAttribute("aStrakeMask")) {
    geometry.setAttribute("aStrakeMask", new Float32BufferAttribute(new Float32Array(position.count), 1));
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
  // smoothstep keeps the deformation continuous across the waterline, so no
  // crease appears where the two zones meet.
  float topsides = smoothstep(0.0, 0.45, transformed.y);
  transformed.y *= mix(1.0, aHullForm.z, topsides);
  // Tier 3 #13: how she rides. A rigid lift/settle of the WHOLE vessel — no
  // ramp — because a ship taking on draft does not stretch, it sinks. The sail
  // material carries the same term, so the rig stays stepped in a hull that has
  // moved.
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
 * the same canvas — 64 galleons with the same three sails set. `aSailIndex`
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
  float furlBits = floor(aSailFurl / exp2(aSailIndex));
  float furled = furlBits - 2.0 * floor(furlBits * 0.5);
  float setSail = 1.0 - furled;
  float sailDrop = clamp(aSailHead.y - transformed.y, 0.0, 1.2);
  float flutterPhase = uWindTime * (2.0 + uWindFlutter * 3.5) + aSailIndex * 1.7
    + instanceMatrix[3].x * 0.31 + instanceMatrix[3].z * 0.17;
  transformed.z += sin(flutterPhase)
    * sailDrop
    * (0.015 + uWindFlutter * 0.06)
    * setSail;
  transformed.y = mix(transformed.y, aSailHead.y - 0.05, furled);
  transformed.z = mix(transformed.z, aSailHead.z, furled * 0.8);
}`;

export interface FleetSailDeformInput {
  furlMask: number;
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
  const furlBits = Math.floor(input.furlMask / (2 ** input.sailIndex));
  const furled = furlBits - 2 * Math.floor(furlBits * 0.5);
  const setSail = 1 - furled;
  const windFlutter = Math.min(1, Math.max(0, input.windFlutter));
  const sailDrop = Math.min(1.2, Math.max(0, input.sailHead.y - input.vertex.y));
  const flutterPhase = Math.max(0, input.windTime) * (2 + windFlutter * 3.5)
    + input.sailIndex * 1.7
    + input.instanceX * 0.31
    + input.instanceZ * 0.17;
  let x = input.vertex.x;
  let y = input.vertex.y;
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
  vColor.xyz = mix(vColor.xyz, color.xyz * aTrim, aStrakeMask);
#endif`;

export function patchFleetHullFormMaterial(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = withHullForm(shader.vertexShader)
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aStrakeMask;
        attribute vec3 aTrim;`,
      )
      .replace("#include <color_vertex>", `#include <color_vertex>\n${STRAKE_PAINT}`);
    injectGardenHeightFog(shader);
  };
  material.customProgramCacheKey = () => "garden-fleet-hull-form-strake-trim-height-fog";
}

export function patchSailAtlasMaterial(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = fleetWindUniforms.uWindTime;
    shader.uniforms.uWindFlutter = fleetWindUniforms.uWindFlutter;
    shader.uniforms.uMarkPresence = fleetAerialUniforms.uMarkPresence;
    shader.uniforms.uAerialNear = fleetAerialUniforms.uAerialNear;
    shader.uniforms.uAerialFar = fleetAerialUniforms.uAerialFar;
    shader.uniforms.uAerialStrength = fleetAerialUniforms.uAerialStrength;
    shader.uniforms.uClothRestraint = fleetAerialUniforms.uClothRestraint;
    shader.uniforms.uFramingRestraint = fleetAerialUniforms.uFramingRestraint;
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
        attribute float aAtlasSail;
        attribute float aAtlasCell;
        attribute float aSailFurl;
        attribute float aSailIndex;
        attribute vec3 aSailHead;
        attribute vec3 aSailTint;
        attribute float aSailAttention;
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
          // CanvasTexture uploads with flipY=true. Atlas cells are painted in
          // canvas order (row 0 at the TOP), while texture V starts at the
          // BOTTOM. Mirror the CELL ROW here while leaving the cell-local UV
          // alone: geometry v=0 is the sail foot and must still read the
          // bottom of the painted mark.
          //
          // This is identity-critical, not a cosmetic flip. Without it every
          // batched ship samples the same column from the opposite atlas row;
          // even cell 0 (the transparent plain-sail cell) samples a populated
          // logo cell and stamps a stranger's mark across ordinary canvas.
          float canvasRow = floor(cell / columns);
          float textureRow = columns - 1.0 - canvasRow;
          vec2 cellOrigin = vec2(mod(cell, columns), textureRow) / columns;
          vAtlasUv = cellOrigin + uv / columns;
          vSailTint = aSailTint;
          // W3.7: the CELL-LOCAL uv, kept separately from the atlas uv. The
          // weave is a property of this sail's cloth, so it must run 0..1 across
          // each sail rather than across the 16x16 atlas — and every sail in the
          // rig carries a real 0..1 uv (createSailGeometry), so the plain sails
          // get their cloth too, not just the one with the mark on it.
          vClothUv = uv;
          vSailAttention = aSailAttention;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uMarkPresence;
        uniform float uAerialNear;
        uniform float uAerialFar;
        uniform float uAerialStrength;
        uniform float uClothRestraint;
        uniform float uFramingRestraint;
        uniform float uClothWeave;
        varying vec2 vAtlasUv;
        varying vec2 vClothUv;
        varying vec3 vSailTint;
        varying float vAerialDepth;
        varying float vSailAttention;
        // W3.7: the weave's relief, handed forward from <map_fragment> (which
        // runs first) to <normal_fragment_begin>. Initialised to zero so a
        // material with no map — the geometry-only test path — perturbs nothing.
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

          // Aerial perspective. See fleetAerialUniforms for why the fleet needs
          // its own recession on top of the scene fog.
          float aerial = smoothstep(uAerialNear, uAerialFar, vAerialDepth);

          // The mark thins with zoom, and thins further with depth. Both are
          // applied to the atlas ALPHA — "how much of this texel is a mark" —
          // so a faded mark reveals the ship's own dyed cloth underneath rather
          // than washing toward a neutral.
          float markVisibility = uMarkPresence * (1.0 - aerial * 0.8);
          vec3 sailCloth = mix(vSailTint, sailTexel.rgb, sailTexel.a * markVisibility);

          // Chroma, not value: converge toward the cloth's OWN luminance so the
          // sail keeps its place in the value structure while its brand colour
          // recedes. Desaturating toward a constant instead would flatten the
          // far fleet into a single grey mass and lose the silhouettes.
          // Depth restraint and zoom restraint are combined with max(), not
          // added: they are two readings of the same idea, and compounding them
          // would grey the far fleet out entirely at wide framing.
          //
          // W3.7 adds two things to that sentence and changes nothing else:
          //   * attention (0 for the rank and file, easing to 1 on hover or
          //     selection) cancels both ZOOM-keyed terms, so the ship the
          //     visitor is pointing at wears its full dye;
          //   * the framing step composes MULTIPLICATIVELY on what is left —
          //     "one further 18% of the remaining chroma" — so it can never
          //     stack with the depth cue into a grey fleet, and it is exactly
          //     zero at the zoom where marks are judged.
          // Value is untouched by all of it: the mix target's luminance IS
          // clothLuma, so luma(sailCloth) is invariant and the pirate contrast
          // floor cannot move.
          float attention = clamp(vSailAttention, 0.0, 1.0);
          float clothLuma = dot(sailCloth, vec3(0.2126, 0.7152, 0.0722));
          float framingStep = uFramingRestraint * (1.0 - attention);
          float restraint = max(aerial * uAerialStrength, uClothRestraint * (1.0 - attention));
          restraint = 1.0 - (1.0 - restraint) * (1.0 - framingStep);
          sailCloth = mix(sailCloth, vec3(clothLuma), restraint);

          // W3.7 cloth-ness: a woven canvas impression across the WHOLE sail.
          //
          // The rig already carries panel seams and reef bands in its vertex
          // colours — the coarse read, seven vertices wide. This is the fine
          // one: warp and weft threads, with the over-under crossing term that
          // makes a plain weave look woven rather than gridded, plus a slow
          // slub so it is hand-woven canvas and not a screen door. Weft is
          // slightly denser than warp, which gives the cloth a grain direction.
          //
          // Three guards keep it an impression rather than a texture:
          //   * zoom (uClothWeave) — off entirely at overview, full at explore;
          //   * fwidth — threads that have shrunk toward a pixel are faded out
          //     before they can shimmer, whatever the zoom says;
          //   * the mark — the weave stands down under the emblem, so the one
          //     thing the sail exists to show is never woven over.
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
          // Ambient occlusion in the interstices, highlight on the crowns — a
          // multiplier about 1, so the cloth's own value is preserved on average
          // and the sail keeps its place in the frame's value structure.
          sailCloth *= 1.0 + weave * ${CLOTH_WEAVE_SHADE} * weaveAmount;
          // ...and the relief the lighting reads, handed to the normal stage.
          gClothWarp = cos(threads.x) * weaveAmount;
          gClothWeft = cos(threads.y) * weaveAmount;

          diffuseColor.rgb *= sailCloth;
          // The night backlight is THIS ship's cloth glowing, not a cream wash
          // laid over it.
          //
          // The material's emissive is a flat warm gold and the batched fleet
          // shares ONE material, so without this the same cream was ADDED to
          // every sail in the world at up to 0.78 intensity — against a dyed
          // cloth whose albedo runs 0.1-0.3, that was ~85% of the sail's final
          // colour. Measured at noon on the reference GPU: forcing the dye to
          // pure red moved a sail texel by 24/255. The dye and the logo were
          // both there and both being washed out, which is why 169 of 187
          // ships flew what read as blank canvas.
          //
          // Hero ships never had the problem because they own a material each
          // and set \`emissiveMap = map\`, so their glow is already modulated by
          // their own painted sail. This is that same rule for the batch, where
          // the per-instance dye plus the atlas texel IS the sail.
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
      );
    // The aerial chroma restraint above settles the distant dye while
    // preserving value; the shared fog term then places that restrained sail
    // in the same directional air as hull, sea and land. Neither rewrites the
    // other's arithmetic.
    injectGardenHeightFog(shader);
  };
  material.customProgramCacheKey = () =>
    "garden-fleet-sail-atlas-hull-form-dye-furl-emissive-trim-aerial-framing-weave-height-fog";
}

function createInstancedPart(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  capacity: number,
  withAtlasCell: boolean,
  withTrim = false,
): FleetBatchPart {
  const mesh = new InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  // Every instance starts collapsed; the frame loop opens only the live ones.
  scratchMatrix.makeScale(0, 0, 0);
  for (let index = 0; index < capacity; index += 1) mesh.setMatrixAt(index, scratchMatrix);
  mesh.instanceMatrix.needsUpdate = true;
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
    // W2.3/W4: furl bitmask. Defaults to 0 — every sail set — so an unwritten
    // instance renders the authored rig.
    sailFurl = new InstancedBufferAttribute(new Float32Array(capacity), 1);
    sailFurl.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aSailFurl", sailFurl);
    // W3.7: attention. Defaults to 0 — rank-and-file — so an unwritten instance
    // takes the framing's restraint rather than an unexplained full-brand sail.
    sailAttention = new InstancedBufferAttribute(new Float32Array(capacity), 1);
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
  if (withTrim) {
    trim = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    trim.setUsage(DynamicDrawUsage);
    geometry.setAttribute("aTrim", trim);
  }
  return { atlasCell, hullForm, mesh, sailAttention, sailFurl, sailTint, trim };
}

export interface FleetBatchGeometrySource {
  /** Merged hull assembly (keel, hull, gunwale, deck, masts, cabin). */
  hull: BufferGeometry;
  /** Merged sail set, carrying the `aAtlasSail` selector. */
  sails: BufferGeometry;
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

  const pennantMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    flatShading: true,
    roughness: 0.7,
    side: DoubleSide,
  });
  patchGardenHeightFogMaterial(pennantMaterial);
  materials.push(pennantMaterial);

  const bySilhouette = new Map<GardenHullSilhouette, FleetSilhouetteBatch>();
  for (const silhouette of input.silhouettes) {
    const source = input.geometryFor(silhouette);
    const hull = createInstancedPart(source.hull, hullMaterial, input.capacity, false, true);
    hull.mesh.name = `fleet-hull-${silhouette}`;
    const sails = createInstancedPart(source.sails, sailMaterial, input.capacity, true);
    sails.mesh.name = `fleet-sails-${silhouette}`;
    root.add(hull.mesh, sails.mesh);
    bySilhouette.set(silhouette, { hull, sails });
  }

  const pennant = createInstancedPart(
    cachedShipGeometry(input.cache, "fleet.pennant", () => input.pennantGeometry),
    pennantMaterial,
    input.capacity,
    false,
  );
  pennant.mesh.name = "fleet-pennants";
  pennant.mesh.castShadow = false;
  root.add(pennant.mesh);

  return { capacity: input.capacity, bySilhouette, materials, pennant, root };
}

/** One ship's per-frame pose, written into every batch it participates in. */
export interface FleetInstancePose {
  atlasCell: number;
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
  /** W1/D2: the issuer's paint on the sheer strake. */
  trimColor: Color;
  x: number;
  y: number;
  z: number;
}

/**
 * Resets every batch's live count. Call once per frame before writing poses;
 * instances beyond the new count are simply not drawn, so no buffer is
 * reallocated when the fleet shrinks.
 */
export function beginFleetFrame(batches: FleetBatches): void {
  for (const batch of batches.bySilhouette.values()) {
    batch.hull.mesh.count = 0;
    batch.sails.mesh.count = 0;
  }
  batches.pennant.mesh.count = 0;
}

/**
 * Writes one ship's pose into its silhouette batches. Allocation-free: all
 * math runs through module-scope scratch objects.
 */
export function writeFleetInstance(
  batches: FleetBatches,
  pose: FleetInstancePose,
): void {
  const batch = batches.bySilhouette.get(pose.silhouette);
  if (!batch) return;
  const slot = batch.hull.mesh.count;
  if (slot >= batches.capacity) return;

  scratchPosition.set(pose.x, pose.y, pose.z);
  scratchQuaternion.setFromEuler(
    // Heading about Y, heel about Z, pitch about X — same order the per-ship
    // Group applied, so hit testing and follow-selected stay in agreement.
    scratchEuler.set(pose.pitch, pose.headingAngle, pose.heel, "YXZ"),
  );
  scratchScale.setScalar(pose.scale);
  scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);

  batch.hull.mesh.setMatrixAt(slot, scratchMatrix);
  batch.hull.mesh.setColorAt(slot, pose.hullColor);
  batch.hull.mesh.count = slot + 1;
  if (batch.hull.trim) {
    batch.hull.trim.setXYZ(slot, pose.trimColor.r, pose.trimColor.g, pose.trimColor.b);
  }
  // Same proportions on hull and sails: the rig has to follow the hull it is
  // stepped into, and so does the trim.
  const { beam, height, length } = pose.hullForm;
  const waterline = pose.hullForm.waterline ?? 0;
  batch.hull.hullForm.setXYZW(slot, length, beam, height, waterline);
  batch.sails.hullForm.setXYZW(slot, length, beam, height, waterline);

  batch.sails.mesh.setMatrixAt(slot, scratchMatrix);
  batch.sails.mesh.count = slot + 1;
  if (batch.sails.atlasCell) {
    batch.sails.atlasCell.setX(slot, pose.atlasCell);
  }
  if (batch.sails.sailTint) {
    batch.sails.sailTint.setXYZ(slot, pose.sailColor.r, pose.sailColor.g, pose.sailColor.b);
  }
  if (batch.sails.sailFurl) {
    batch.sails.sailFurl.setX(slot, pose.sailFurl);
  }
  if (batch.sails.sailAttention) {
    // W3.7: the pose may name attention outright (tests, and any future caller
    // that already holds the ship's hover/selection state); otherwise it is
    // resolved from the module's eased envelopes by atlas cell.
    batch.sails.sailAttention.setX(
      slot,
      pose.attention ?? gardenFleetAttention(pose.atlasCell),
    );
  }

  const pennantSlot = batches.pennant.mesh.count;
  if (pennantSlot < batches.capacity) {
    scratchPennantMatrix
      // The pennant is placed on the CPU, so it does not see the shader's trim
      // and has to be told: without this a trimmed hull leaves its own pennant
      // hanging where the masthead used to be.
      .makeTranslation(pose.mastheadOffset.x, pose.mastheadOffset.y + waterline, 0.02);
    if (pennantWind.active) {
      // Phase 2: the pennant streams downwind. The cloth runs along ship-local
      // +X, so the local yaw that points it at the wind bearing is
      // -heading - windAngle (heading here is the ship's own rotation.y), plus
      // a flutter wobble that stiffens with the gust envelope. Frozen into a
      // deterministic pose under reduced motion (timeSeconds pinned at 0).
      const yaw = -pose.headingAngle - pennantWind.angle
        + Math.sin(
          pennantWind.time * (2.4 + pennantWind.speed * 3.5) + pose.x * 0.37 + pose.z * 0.21,
        ) * (0.08 + pennantWind.speed * 0.22 + pennantWind.gust * 0.18);
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
  for (const batch of batches.bySilhouette.values()) {
    flushPart(batch.hull);
    flushPart(batch.sails);
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
}

/** Total live instances across the fleet — the metric the perf lane reads. */
export function fleetInstanceCount(batches: FleetBatches): number {
  let count = 0;
  for (const batch of batches.bySilhouette.values()) count += batch.hull.mesh.count;
  return count;
}

/** Draw calls the fleet contributes, independent of ship count. */
export function fleetDrawCallCount(batches: FleetBatches): number {
  let count = batches.pennant.mesh.count > 0 ? 1 : 0;
  for (const batch of batches.bySilhouette.values()) {
    if (batch.hull.mesh.count > 0) count += 1;
    if (batch.sails.mesh.count > 0) count += 1;
  }
  return count;
}

export function disposeFleetBatches(batches: FleetBatches): void {
  for (const batch of batches.bySilhouette.values()) {
    batch.hull.mesh.geometry.dispose();
    batch.hull.mesh.dispose();
    batch.sails.mesh.geometry.dispose();
    batch.sails.mesh.dispose();
  }
  batches.pennant.mesh.geometry.dispose();
  batches.pennant.mesh.dispose();
  for (const material of batches.materials) material.dispose();
  batches.bySilhouette.clear();
  batches.root.clear();
}

export const FLEET_BATCH_TINTS = {
  deck: DECK_TINT,
  gunwale: GUNWALE_TINT,
  keel: KEEL_TINT,
  mast: MAST_TINT,
} as const;
