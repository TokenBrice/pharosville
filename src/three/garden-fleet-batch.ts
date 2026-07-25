import {
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
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
  /** Per-instance hull proportions (length, beam, height) — N5(a). */
  hullForm: InstancedBufferAttribute;
  mesh: InstancedMesh;
  /** Per-instance cloth dye (F1); only meaningful on the sail batch. */
  sailTint: InstancedBufferAttribute | null;
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
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchScale = new Vector3();
const scratchColor = new Color();
const scratchEuler = new Euler();

/**
 * Merges a set of already-positioned part geometries into one, multiplying
 * each part's vertex colors by a tint so the merged mesh keeps the tonal
 * separation the separate materials used to provide.
 */
export function mergeTintedParts(
  parts: readonly { geometry: BufferGeometry; tint?: Color; transform?: Matrix4 }[],
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

/**
 * `mergeGeometries` rejects inputs whose attribute sets differ. Ship parts come
 * from `ExtrudeGeometry`, `ShapeGeometry` and `CylinderGeometry`, which agree
 * on position/normal/uv/color but disagree on extras — so drop the extras and
 * synthesise anything missing.
 */
function normalizeAttributes(geometry: BufferGeometry): void {
  if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  if (!geometry.getAttribute("uv")) {
    geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(position.count * 2), 2));
  }
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal" && name !== "uv" && name !== "color") {
      geometry.deleteAttribute(name);
    }
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
const HULL_FORM_ATTRIBUTE = "attribute vec3 aHullForm;";
const HULL_FORM_DEFORM = `
{
  transformed.x *= aHullForm.x;
  transformed.z *= aHullForm.y;
  // smoothstep keeps the deformation continuous across the waterline, so no
  // crease appears where the two zones meet.
  float topsides = smoothstep(0.0, 0.45, transformed.y);
  transformed.y *= mix(1.0, aHullForm.z, topsides);
}`;

/** Applies the per-instance deformation to a vertex shader source. */
function withHullForm(vertexShader: string): string {
  return vertexShader
    .replace("#include <common>", `#include <common>\n${HULL_FORM_ATTRIBUTE}`)
    .replace("#include <begin_vertex>", `#include <begin_vertex>\n${HULL_FORM_DEFORM}`);
}

export function patchFleetHullFormMaterial(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = withHullForm(shader.vertexShader);
  };
  material.customProgramCacheKey = () => "garden-fleet-hull-form";
}

export function patchSailAtlasMaterial(material: MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    // Sails carry the hull-form deformation too, otherwise a stretched hull
    // would sail out from under its own rig.
    shader.vertexShader = withHullForm(shader.vertexShader)
      .replace(
        "#include <common>",
        `#include <common>
        attribute float aAtlasSail;
        attribute float aAtlasCell;
        attribute vec3 aSailTint;
        varying vec2 vAtlasUv;
        varying vec3 vSailTint;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        {
          float columns = ${FLEET_SAIL_ATLAS_COLUMNS}.0;
          float cell = aAtlasSail > 0.5 ? aAtlasCell : 0.0;
          vec2 cellOrigin = vec2(mod(cell, columns), floor(cell / columns)) / columns;
          vAtlasUv = cellOrigin + uv / columns;
          vSailTint = aSailTint;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vAtlasUv;
        varying vec3 vSailTint;`,
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
          diffuseColor.rgb *= mix(vSailTint, sailTexel.rgb, sailTexel.a);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => "garden-fleet-sail-atlas-hull-form-dye";
}

function createInstancedPart(
  geometry: BufferGeometry,
  material: MeshStandardMaterial,
  capacity: number,
  withAtlasCell: boolean,
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
  }
  // N5(a): per-ship hull proportions. Defaults to (1,1,1) so an instance that
  // is never written renders at the authored shape rather than collapsing.
  const hullForm = new InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
  hullForm.setUsage(DynamicDrawUsage);
  geometry.setAttribute("aHullForm", hullForm);
  return { atlasCell, hullForm, mesh, sailTint };
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
  materials.push(pennantMaterial);

  const bySilhouette = new Map<GardenHullSilhouette, FleetSilhouetteBatch>();
  for (const silhouette of input.silhouettes) {
    const source = input.geometryFor(silhouette);
    const hull = createInstancedPart(source.hull, hullMaterial, input.capacity, false);
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
  hullColor: Color;
  /** F1: the ship's cloth dye — its issuer's dominant brand colour. */
  sailColor: Color;
  /** Per-ship proportions (length, beam, height) about 1 — N5(a). */
  hullForm: { beam: number; height: number; length: number };
  headingAngle: number;
  heel: number;
  pennantColor: Color;
  pitch: number;
  scale: number;
  silhouette: GardenHullSilhouette;
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
  // Same proportions on hull and sails: the rig has to follow the hull it is
  // stepped into.
  const { beam, height, length } = pose.hullForm;
  batch.hull.hullForm.setXYZ(slot, length, beam, height);
  batch.sails.hullForm.setXYZ(slot, length, beam, height);

  batch.sails.mesh.setMatrixAt(slot, scratchMatrix);
  batch.sails.mesh.count = slot + 1;
  if (batch.sails.atlasCell) {
    batch.sails.atlasCell.setX(slot, pose.atlasCell);
  }
  if (batch.sails.sailTint) {
    batch.sails.sailTint.setXYZ(slot, pose.sailColor.r, pose.sailColor.g, pose.sailColor.b);
  }

  const pennantSlot = batches.pennant.mesh.count;
  if (pennantSlot < batches.capacity) {
    batches.pennant.mesh.setMatrixAt(pennantSlot, scratchMatrix);
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
