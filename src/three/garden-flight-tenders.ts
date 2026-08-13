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
 * flotilla of open tenders that come in off open water, LIE ON STATION under
 * each titan for a long while, and draw back out, on periods measured in
 * minutes. `flightIntensity` sets how much of each boat's cycle is spent on
 * station — so it reads as HOW MANY boats are standing off a hull at any moment
 * (and, as before, how close in they lie): a weak reading keeps one or two
 * attending well out, a strong one has nearly the whole flotilla lying close
 * under the hull.
 *
 * The verb matters. This cue used to run the same boats in at the hull over and
 * over on a 13–26 s loop, and a dozen craft charging a hull forever reads as
 * agitation — the harbour's calm register cannot carry it, and a market rotation
 * is not an emergency (W3.5, the Great Quieting). Attendance says the same thing
 * more strongly: capital gathering is boats GATHERED, not boats rushing.
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
 * Reduced motion draws the flotilla's own statement as a still: the intensity's
 * share of each titan's boats lying on station close under the hull, the rest
 * standing off in open water. That is a real static composition rather than an
 * arbitrary freeze — it carries BOTH halves of the reading (how many attend, and
 * how close in they lie) with no clock read at all.
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

/** Just off the hull: where a boat lies when she is on station, at full intensity. */
const NEAR_CLEARANCE = 1.1;
/** Open water: where a boat waits her turn, plus a hashed spread. */
const FAR_CLEARANCE = 5.2;
const FAR_JITTER = 1.8;

/**
 * The weakest reading still keeps boats attending. `flightToQuality` is a
 * boolean the feed has already asserted, so a zero intensity means "flight,
 * weakly" and must still put a boat or two under the hull — an EMPTY flotilla is
 * what "no flight" looks like, and the two states can never share an image.
 */
const PULL_FLOOR = 0.35;

/**
 * One tide of attendance, in seconds: come in, lie on station, draw back out,
 * wait offshore. Deliberately at the harbour's slowest register — nothing in a
 * calm world should repeat on a timescale the eye can count. Each boat's own
 * period is jittered around this so a flotilla never breathes as one.
 */
const STATION_SECONDS = 190;
const STATION_PERIOD_JITTER = 0.34;
/** Shares of the on-station leg spent easing in and easing back out. */
const APPROACH_SHARE = 0.26;
const DEPART_SHARE = 0.26;
/**
 * How much of a boat's cycle is spent on station, as a ramp on `pull`. THIS is
 * where intensity now lives: `pull` runs [PULL_FLOOR, 1], so the share runs
 * [0.43, 0.94] — with four boats to a titan, the weakest reading holds ~1.7 of
 * them under the hull at any moment and the strongest ~3.8. Frequency carries
 * nothing: every reading keeps the same slow tide.
 */
const STATION_SHARE_BASE = 0.16;
const STATION_SHARE_SPAN = 0.78;

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
 * How hard the flotilla attends, in [PULL_FLOOR, 1], from the gauge's intensity.
 * The feed's other intensity fields are scored -100..100, so this reads the same
 * scale and clamps rather than trusting the range. UNCHANGED by W3.5: the
 * derivation and its scale are the cue's contract; only what the number drives
 * moved, from how far a charge carried to how many boats lie on station.
 */
export function flightTenderPull(flightIntensity: number): number {
  const normalized = Number.isFinite(flightIntensity)
    ? Math.min(1, Math.max(0, Math.abs(flightIntensity) / 100))
    : 0;
  return PULL_FLOOR + (1 - PULL_FLOOR) * normalized;
}

/** Share of a boat's cycle spent on station, from `flightTenderPull`. */
export function flightTenderStationShare(pull: number): number {
  return STATION_SHARE_BASE + STATION_SHARE_SPAN * Math.min(1, Math.max(0, pull));
}

function smoothstep01(value: number): number {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

/**
 * How far a boat is onto her station, in [0, 1] — 0 waiting out in open water,
 * 1 lying under the hull. The leg is eased in at one end and out at the other
 * with a long flat hold between, and BOTH joins to the offshore stretch are flat
 * (smoothstep's derivative is zero there), so a boat never snaps on or off
 * station however long her cycle is.
 */
export function flightTenderStationProgress(
  cyclePhase: number,
  stationShare: number,
): number {
  const share = Math.min(0.98, Math.max(0.02, stationShare));
  const frac = cyclePhase - Math.floor(cyclePhase);
  if (frac >= share) return 0;
  const leg = frac / share;
  return smoothstep01(leg / APPROACH_SHARE)
    * (1 - smoothstep01((leg - (1 - DEPART_SHARE)) / DEPART_SHARE));
}

/**
 * How far round a boat has come about, in [0, 1] — 0 bow at the hull, 1 bow to
 * open water. She turns as she draws off station and turns back while she is
 * out there and small, so the reversal never happens under the hull. Continuous
 * across both joins and at the wrap.
 */
export function flightTenderTurn(cyclePhase: number, stationShare: number): number {
  const share = Math.min(0.98, Math.max(0.02, stationShare));
  const frac = cyclePhase - Math.floor(cyclePhase);
  if (frac < share) {
    const leg = frac / share;
    return smoothstep01((leg - (1 - DEPART_SHARE)) / DEPART_SHARE);
  }
  const offshore = (frac - share) / (1 - share);
  return 1 - smoothstep01((offshore - 0.1) / 0.45);
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
  /** Where in her own tide the boat starts, so a flotilla never moves as one. */
  phase: number;
  /** Seconds for her whole tide, jittered off the shared one for the same reason. */
  period: number;
  /**
   * Her place in the flotilla's standing order, in (0, 1). Under reduced motion
   * the boats whose place falls inside the intensity's station share are the
   * ones lying under the hull — so the still frame shows the right COUNT, and
   * shows the same boats every time.
   */
  stand: number;
  /** Bow pointed up the approach line, at the hull. */
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
  const stationShare = flightTenderStationShare(pull);

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
        period: STATION_SECONDS
          * (1 + (stableUnit(`${seed}.period`) - 0.5) * STATION_PERIOD_JITTER),
        phase: stableUnit(`${seed}.phase`),
        // Evenly spread rather than hashed: the count on station in a still
        // frame then follows the share exactly instead of approximately.
        stand: (boat + 0.5) / FLIGHT_TENDERS_PER_TITAN,
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
    // Reduced motion draws ONE frame and reads no clock at all: the boats whose
    // place in the standing order falls inside the intensity's station share lie
    // under the hull, the rest wait offshore, bows out. Same frame every time.
    const seconds = reducedMotion ? 0 : Math.max(0, timeSeconds);
    // Indexed rather than `for...of instances.entries()`: an iterator pair per
    // frame is the one allocation this path could still make.
    for (let index = 0; index < instances.length; index += 1) {
      const boat = instances[index]!;
      const onStation = boat.stand <= stationShare;
      const cycle = seconds / boat.period + boat.phase;
      const station = reducedMotion
        ? (onStation ? 1 : 0)
        : flightTenderStationProgress(cycle, stationShare);
      const turn = reducedMotion
        ? (onStation ? 0 : 1)
        : flightTenderTurn(cycle, stationShare);
      const radius = boat.farRadius + (boat.nearRadius - boat.farRadius) * station * pull;
      dummy.position.set(
        anchors[boat.anchor * 2]! + boat.cos * radius,
        GARDEN_WATER_Y,
        anchors[boat.anchor * 2 + 1]! + boat.sin * radius,
      );
      // She comes about as she draws off, so a departing boat is never a boat
      // going backwards. Half a turn, eased, out where she is smallest.
      dummy.rotation.set(boat.pitch, boat.yaw + Math.PI * turn, boat.roll);
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
