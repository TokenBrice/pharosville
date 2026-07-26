import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { stableUnit } from "./garden-util";

/**
 * Flight to quality: small craft making for the biggest hulls.
 *
 * `mintBurn.gauge.flightToQuality` says capital is leaving smaller or riskier
 * stablecoins and concentrating into the largest, most trusted ones. It reached
 * the DOM and nothing else — the one signal the cargo tide left on the table,
 * because the image it wants is motion and the tide is a standing state.
 *
 * The world already had the vocabulary. The titan hulls ARE the largest market
 * caps, so capital concentrating into them is boats making for those hulls: a
 * flotilla of open tenders standing off each titan and running in, over and
 * over, for as long as the gauge holds. `flightIntensity` sets how far in the
 * run carries — a weak reading leaves them nosing in from well out, a strong one
 * crowds them against the hull.
 *
 * ## Not the fleet
 *
 * A boat in this world normally means a coin, so this one has to be unmistakably
 * NOT that, in the world model and on screen both:
 *
 * - It is not a `ShipNode`. It never enters `world.ships`, so it cannot appear
 *   in the fleet count, the ledger's ship rows, quick find, or any figure
 *   derived from the fleet.
 * - It has no `detailId` and no `entityCues` entry, which is the only way this
 *   renderer resolves a click or a hover into a selection. It is unselectable by
 *   construction rather than by a guard someone can forget.
 * - It carries NO RIG. Every coin-ship in PharosVille has a mast, and the sail
 *   is its identity surface — the logo atlas cell, the livery, the mast signals.
 *   An open boat with a bare thwart and nothing above the gunwale shares no
 *   silhouette with anything that represents an asset.
 * - It gets no wake, no lantern, no contact shadow, no reflection column and no
 *   light lane. Every one of those is a per-ship mark, and a tender wearing one
 *   would start reading as a ship.
 *
 * Called TENDERS and not skiffs on purpose: `ShipSizeTier` already spends
 * "skiff" on a coin-ship under $10M, so a second, unrelated skiff in the same
 * harbour would be exactly the collision this module exists to avoid.
 *
 * ## Cost
 *
 * ONE InstancedMesh over one merged, vertex-coloured geometry: one draw call for
 * every tender working every titan, and none at all when the gauge is absent or
 * reads false. No shadow pass — a boat a fifth of a unit tall casts nothing
 * worth a second draw call, and the frame's budget is 687 against a 700 ceiling.
 *
 * ## Motion
 *
 * The boats ride the ONE motion sample the repo already keeps. Their positions
 * are offsets from their titan's live hull position, which `world-renderer.ts`
 * hands over after the ship loop has written it from
 * `frame.shipMotionSamples` — the same sample that draws the hull, hit-tests it,
 * follows it and reports it. Nothing here samples motion, plans a route, or
 * keeps a clock: `flush` is given the frame's own `timeSeconds`.
 *
 * Reduced motion pins every tender at the converged end of its run. That is a
 * real static statement rather than an arbitrary freeze — the boats are gathered
 * at the hull, and because the converged radius is still set by
 * `flightIntensity`, the static frame carries the strength of the reading too.
 */

/** How many hulls carry a flotilla. The largest market caps, in order. */
export const FLIGHT_TENDER_TITAN_COUNT = 3;
/** Boats per titan. Enough to read as traffic, few enough to stay countable. */
export const FLIGHT_TENDERS_PER_TITAN = 4;
/** The instanced mesh's name, so tests can find it in a composed world. */
export const FLIGHT_TENDERS_MESH_NAME = "fleet-flight-tenders";

/**
 * Boat proportions. Long enough to read at default framing beside a hull,
 * and — deliberately — under the isometric silhouette law's ~0.7-unit clearance
 * in HEIGHT, which is why the overview policy sheds it: at whole-map framing
 * these are two pixels of mud apiece, and twelve of them would be litter.
 */
const TENDER_LENGTH = 1.6;
const TENDER_BEAM = 0.62;

/** Just off the hull: the converged end of a run at full intensity. */
const NEAR_CLEARANCE = 1.1;
/** Open water: where a boat starts its run, plus a hashed spread. */
const FAR_CLEARANCE = 5.2;
const FAR_JITTER = 1.8;

/**
 * The weakest reading still converges. `flightToQuality` is a boolean the feed
 * has already asserted, so a zero intensity means "flight, weakly" and must not
 * render as boats holding station — that would read as calm.
 */
const PULL_FLOOR = 0.35;
/** Seconds for one run, at the calm end. Strong flight quickens it. */
const RUN_SECONDS_CALM = 26;
const RUN_SECONDS_URGENT = 13;
/** Share of the run spent making IN. The rest is the slow drift back out, so
    the eye reads repeated inbound traffic rather than boats milling. */
const DASH_SHARE = 0.34;

// Bare timber and a bleached thwart. Nothing from the warning end of the
// palette: capital moving toward the strongest issuers is a market rotation,
// not an emergency, and an amber boat would turn a reading into a verdict.
const TIMBER = new Color(HARBOR_PALETTE.timber_warm);
const THWART = new Color(HARBOR_PALETTE.foam_white);

export interface FlightTenderSpec {
  /** The titan this flotilla works; seeds every boat's bearing, phase and size. */
  shipId: string;
  /**
   * That hull's own selection radius. A titan's footprint is nearly three times
   * a small hull's, so a fixed stand-off would either bury the boats inside the
   * ship or leave them adrift well off it.
   */
  hullRadius: number;
}

export interface GardenFlightTenders {
  readonly root: Group;
  /** Boats afloat across every titan. Zero when there is no flight to show. */
  readonly count: number;
  dispose(): void;
  /**
   * Anchor titan `index`'s flotilla on that hull's live position. Called once
   * per titan per frame, from the renderer, after the ship loop has written the
   * hull's transform from the shared motion sample.
   */
  place(index: number, worldX: number, worldZ: number): void;
  /** Restamp every boat against the anchors, then one buffer upload. */
  flush(input: { detail: number; reducedMotion: boolean; timeSeconds: number }): void;
}

/**
 * The hulls a flotilla works, largest market cap first — or none at all.
 *
 * Absence is the whole contract here: no gauge, or a gauge reading false, builds
 * nothing. A quiet version of the cue would say "flight to quality, calm and
 * measured", which is not a state this signal has.
 */
export function flightTenderTitans<T extends { ship: { id: string; marketCapUsd: number } }>(
  ships: readonly T[],
  issuance: { flightToQuality: boolean } | null | undefined,
): T[] {
  if (!issuance?.flightToQuality) return [];
  return [...ships]
    .sort((left, right) => (right.ship.marketCapUsd ?? 0) - (left.ship.marketCapUsd ?? 0)
      || left.ship.id.localeCompare(right.ship.id))
    .slice(0, FLIGHT_TENDER_TITAN_COUNT);
}

/**
 * How far in a run carries, in [PULL_FLOOR, 1], from the gauge's intensity.
 * The feed's other intensity fields are scored -100..100, so this reads the
 * same scale and clamps rather than trusting the range.
 */
export function flightTenderPull(flightIntensity: number): number {
  const normalized = Number.isFinite(flightIntensity)
    ? Math.min(1, Math.max(0, Math.abs(flightIntensity) / 100))
    : 0;
  return PULL_FLOOR + (1 - PULL_FLOOR) * normalized;
}

function smoothstep01(value: number): number {
  return value * value * (3 - 2 * value);
}

/**
 * Where along its run a boat sits, in [0, 1] — 0 out in open water, 1 converged
 * on the hull. A quick eased dash in, a slower eased drift out; smoothstep at
 * both ends means the joins at the turn and at the wrap are both flat, so the
 * cycle never snaps.
 */
export function flightTenderRunProgress(cyclePhase: number): number {
  const frac = cyclePhase - Math.floor(cyclePhase);
  return frac < DASH_SHARE
    ? smoothstep01(frac / DASH_SHARE)
    : 1 - smoothstep01((frac - DASH_SHARE) / (1 - DASH_SHARE));
}

/**
 * The tender, as one geometry: a low open hull, tapered to the bow, under a
 * single pale thwart. The thwart is baked as vertex colour rather than a second
 * material, because a second material is a second draw call.
 */
function createTenderGeometry(): BufferGeometry {
  const paint = (geometry: BufferGeometry, color: Color): BufferGeometry => {
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geometry;
  };

  const parts: BufferGeometry[] = [];
  // Six-sided and tapered: broad at the transom, fine at the stem. Laid along
  // +Z so the instance yaw can simply point the bow at the hull, then flattened
  // so she sits low in the water like a working boat rather than a barrel.
  const hull = new CylinderGeometry(TENDER_BEAM * 0.18, TENDER_BEAM * 0.5, TENDER_LENGTH, 6, 1);
  hull.rotateX(Math.PI / 2);
  hull.scale(1, 0.55, 1);
  hull.translate(0, 0.06, 0);
  parts.push(paint(hull, TIMBER));

  // One thwart across the beam. It is what says OPEN BOAT at a glance — the
  // read that keeps a tender from being mistaken for a decked, rigged hull.
  const thwart = new BoxGeometry(TENDER_BEAM * 0.86, 0.05, 0.18);
  thwart.translate(0, 0.19, -0.12);
  parts.push(paint(thwart, THWART));

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("flight tender geometry failed to merge");
  return merged;
}

interface TenderInstance {
  /** Which anchor (titan) this boat works. */
  anchor: number;
  /** Fixed approach line, so boats close from every side of the hull. */
  cos: number;
  sin: number;
  farRadius: number;
  nearRadius: number;
  /** Where in its own run the boat starts, so a flotilla never moves as one. */
  phase: number;
  /** Bow pointed up the approach line, at the hull. Fixed. */
  yaw: number;
  pitch: number;
  roll: number;
  size: number;
}

export function createGardenFlightTenders(
  specs: readonly FlightTenderSpec[],
  flightIntensity: number,
): GardenFlightTenders {
  const root = new Group();
  root.name = FLIGHT_TENDERS_MESH_NAME;
  if (specs.length === 0) {
    // Nothing built at all. No gauge, or no flight, costs exactly zero.
    return { root, count: 0, dispose() {}, place() {}, flush() {} };
  }

  const pull = flightTenderPull(flightIntensity);
  const runSeconds = RUN_SECONDS_CALM - (RUN_SECONDS_CALM - RUN_SECONDS_URGENT) * pull;

  const instances: TenderInstance[] = [];
  for (const [anchor, spec] of specs.entries()) {
    for (let boat = 0; boat < FLIGHT_TENDERS_PER_TITAN; boat += 1) {
      const seed = `flight-tender.${spec.shipId}.${boat}`;
      // Bearings are spread evenly round the hull and then jittered, so the
      // flotilla closes from all sides instead of stacking into one lane.
      const bearing = (boat / FLIGHT_TENDERS_PER_TITAN + stableUnit(`${seed}.bearing`) * 0.6)
        * Math.PI * 2;
      const cos = Math.cos(bearing);
      const sin = Math.sin(bearing);
      instances.push({
        anchor,
        cos,
        sin,
        farRadius: spec.hullRadius + FAR_CLEARANCE + stableUnit(`${seed}.reach`) * FAR_JITTER,
        nearRadius: spec.hullRadius + NEAR_CLEARANCE,
        phase: stableUnit(`${seed}.phase`),
        // The mesh's bow is +Z, and the boat is heading inward along -bearing.
        yaw: Math.atan2(-cos, -sin),
        pitch: (stableUnit(`${seed}.pitch`) - 0.5) * 0.1,
        roll: (stableUnit(`${seed}.roll`) - 0.5) * 0.16,
        size: 0.9 + stableUnit(`${seed}.size`) * 0.2,
      });
    }
  }

  const geometry = createTenderGeometry();
  const material = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.9,
    vertexColors: true,
  });
  const mesh = new InstancedMesh(geometry, material, instances.length);
  mesh.name = FLIGHT_TENDERS_MESH_NAME;
  // No shadow pass. A boat this low casts nothing legible from the fixed high
  // camera, and it would double this cue's cost from one draw call to two.
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // The boats ride hulls that patrol the whole map, so the geometry-derived
  // bounding sphere would cull the flotilla the moment the origin left frame.
  mesh.frustumCulled = false;
  root.add(mesh);

  // Anchors, written by the renderer each frame from the live hull transforms.
  // Preallocated so the frame path allocates nothing.
  const anchors = new Float32Array(specs.length * 2);
  const dummy = new Object3D();

  const place = (index: number, worldX: number, worldZ: number): void => {
    if (index < 0 || index >= specs.length) return;
    anchors[index * 2] = worldX;
    anchors[index * 2 + 1] = worldZ;
  };

  const flush = (
    { detail, reducedMotion, timeSeconds }: { detail: number; reducedMotion: boolean; timeSeconds: number },
  ): void => {
    const shed = Math.min(1, Math.max(0, detail));
    mesh.visible = shed > 0;
    if (!mesh.visible) return;
    // Reduced motion draws ONE frame, so every boat lands at the converged end
    // of its run — no clock, no phase, and the same positions every time.
    const cycle = reducedMotion ? 0 : Math.max(0, timeSeconds) / runSeconds;
    // Indexed rather than `for...of instances.entries()`: an iterator pair per
    // frame is the one allocation this path could still make.
    for (let index = 0; index < instances.length; index += 1) {
      const boat = instances[index]!;
      const run = reducedMotion ? 1 : flightTenderRunProgress(cycle + boat.phase);
      const radius = boat.farRadius + (boat.nearRadius - boat.farRadius) * run * pull;
      dummy.position.set(
        anchors[boat.anchor * 2]! + boat.cos * radius,
        GARDEN_WATER_Y,
        anchors[boat.anchor * 2 + 1]! + boat.sin * radius,
      );
      dummy.rotation.set(boat.pitch, boat.yaw, boat.roll);
      // The overview policy's own detail value, applied per instance rather
      // than to the group: these boats carry world-space matrices, so scaling
      // the group would drag the whole flotilla toward a shared centroid. This
      // is the gate the hull wakes already use, for the same reason.
      dummy.scale.setScalar(boat.size * shed);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };

  // Composed once so every instance has a valid matrix before the first frame.
  flush({ detail: 1, reducedMotion: true, timeSeconds: 0 });

  return {
    root,
    count: instances.length,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    place,
    flush,
  };
}
