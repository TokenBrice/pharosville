import {
  BufferGeometry,
  CircleGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import {
  GARDEN_WATER_Y,
  gardenDockDisplayTile,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import type { ScreenPoint } from "../systems/projection";
import { ETHEREUM_L2_DOCK_CHAIN_IDS } from "../systems/world-layout";
import type { DockNode } from "../systems/world-types";

/** Gulls wheeling over the island itself. */
export const GARDEN_GULL_COUNT = 9;
/** Gulls working each rendered harbour — see `createGardenGullFlock`. */
export const GARDEN_QUAY_GULL_COUNT = 2;

export interface GardenHarborLifeOptions {
  tileScale?: number;
  waterY?: number;
}

export interface GardenHarborDistricts {
  causewayChainIds: readonly string[];
  causeways: Mesh<BufferGeometry, MeshBasicMaterial> | null;
  pads: InstancedMesh<CircleGeometry, MeshBasicMaterial> | null;
  root: Group;
}

export interface GardenGullFlockUpdate {
  constrained: boolean;
  /** 0..1 — gulls roost (fade out) as night settles. */
  night?: number;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * Phase 2 weather: a downwind drift on every orbit, and the storm scatter
   * beat — as the storm level crosses ~0.6 the flock climbs and disperses.
   * Both are pure functions of the plan, so the reduced-motion still frame
   * keeps them as composition.
   */
  weather?: {
    windDirX: number;
    windDirZ: number;
    windSpeed: number;
    stormLevel: number;
  };
}

export interface GardenGullFlock {
  gulls: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  root: Group;
  update(input: GardenGullFlockUpdate): void;
}

export interface GardenGullFlockOptions {
  /** Harbours the flock works, in the order the renderer draws them. */
  docks?: readonly DockNode[];
  tileScale?: number;
}

export const GARDEN_FIREFLY_COUNT = 14;

export interface GardenFirefliesUpdate {
  fullTier: boolean;
  night: number;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * Phase 4: wind-coupled drift. Gusts push the swarm downwind and each mote
   * swims back home on its own slow cycle — a pure function of the weather
   * plan and the clock, frozen flat under reduced motion.
   */
  weather?: {
    gust: number;
    windDirX: number;
    windDirZ: number;
    windSpeed: number;
  };
}

export interface GardenFireflies {
  root: Group;
  update(input: GardenFirefliesUpdate): void;
}

/**
 * A handful of warm motes drifting near the island's path lanterns at night.
 * Full tier only; reduced motion freezes them at their seed positions. One
 * instanced additive mesh — a single extra draw call.
 */
export function createGardenFireflies(
  lanternOffsets: ReadonlyArray<{ x: number; y: number; z: number }>,
  islandTile: ScreenPoint,
  options: Pick<GardenHarborLifeOptions, "tileScale"> = {},
): GardenFireflies {
  const tileScale = options.tileScale ?? DEFAULT_TILE_SCALE;
  const root = new Group();
  root.name = "garden-fireflies";
  root.position.set(islandTile.x * tileScale, 0, islandTile.y * tileScale);

  const material = new MeshBasicMaterial({
    color: "#f7d68a",
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });
  const motes = new InstancedMesh(
    new CircleGeometry(0.075, 6),
    material,
    GARDEN_FIREFLY_COUNT,
  );
  motes.name = "garden-firefly-motes";
  motes.frustumCulled = false;
  motes.renderOrder = 9;
  // Face the fixed isometric camera.
  motes.rotation.set(-Math.PI / 5.1, Math.PI / 4, 0, "YXZ");
  root.add(motes);

  const dummy = new Object3D();
  const update = ({ fullTier, night, reducedMotion, timeSeconds, weather }: GardenFirefliesUpdate): void => {
    const visible = fullTier && night > 0.25 && lanternOffsets.length > 0;
    root.visible = visible;
    if (!visible) return;
    material.opacity = Math.min(0.85, (night - 0.25) * 1.4);
    const time = reducedMotion ? 0 : timeSeconds;
    // Phase 4: the gust envelope sets how far the swarm leaks downwind; each
    // mote fights back to its lantern on its own slow sine, so the swarm
    // breathes with the weather instead of translating as a sheet.
    const push = (weather?.windSpeed ?? 0) * (0.5 + (weather?.gust ?? 0) * 0.9);
    const windX = weather?.windDirX ?? 0;
    const windZ = weather?.windDirZ ?? 0;
    for (let index = 0; index < GARDEN_FIREFLY_COUNT; index += 1) {
      const anchor = lanternOffsets[index % lanternOffsets.length]!;
      const seed = index * 2.399;
      const drift = 0.55 + (index % 3) * 0.22;
      const leak = push * (1.4 + Math.sin(time * 0.07 + seed * 1.3));
      dummy.position.set(
        anchor.x + Math.sin(time * 0.21 + seed) * drift + windX * leak,
        anchor.y + 0.35 + Math.sin(time * 0.34 + seed * 1.7) * 0.3,
        anchor.z + Math.cos(time * 0.17 + seed * 0.6) * drift + windZ * leak,
      );
      const pulse = 0.6 + 0.4 * Math.sin(time * 0.9 + seed * 3.1);
      dummy.scale.setScalar(0.7 + pulse * 0.5);
      dummy.updateMatrix();
      motes.setMatrixAt(index, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
  };
  update({ fullTier: true, night: 1, reducedMotion: true, timeSeconds: 0 });
  return { root, update };
}

const DEFAULT_TILE_SCALE = Math.SQRT2;

// Harbour tempo. One scalar in -1..1 drives orbit rate, wheel radius and
// height together, so the three read as one state rather than three cues.
//
// Full scale is 3% of held supply in 24h: chain supply moves in fractions of a
// percent on a normal day, so a 3% swing is already a decisive one, and
// clamping there stops a single outlier chain from flattening every other
// harbour into the same tempo.
const QUAY_TEMPO_FULL_SCALE_PCT = 3;
// Deliberately narrow. At the extremes a filling quay's gulls circle roughly
// half again as fast as a draining one's, half again as wide, and a unit
// higher — enough to tell two harbours apart side by side, not enough to look
// frantic.
//
// The wheel stays tight because harbours may sit as close as
// GARDEN_DOCK_SEPARATION_TILES (3.5 tiles, ~5 units) apart, and two flocks
// that overlap belong to neither quay. Clearance is bought with height
// instead: the tallest dock furniture is a landmark tower topping out near
// y = 5, so the flock rides above the cranes and below the island's own gulls
// at 7.2+, which keeps the two flocks separate readings.
const QUAY_GULL_SPEED = 0.085;
const QUAY_GULL_SPEED_SWING = 0.45;
const QUAY_GULL_RADIUS = 2.4;
const QUAY_GULL_RADIUS_SWING = 0.6;
const QUAY_GULL_HEIGHT = 4.2;
const QUAY_GULL_HEIGHT_SWING = 0.5;
const QUAY_GULL_SCALE = 0.42;

/**
 * 24h held-supply change -> tempo in -1..1. Chains with no reading sit at 0,
 * the same tempo as a chain that genuinely did not move, because an absent
 * number is not evidence of a busy quay.
 */
function quayTempo(change24hPct: number | null | undefined): number {
  if (typeof change24hPct !== "number" || !Number.isFinite(change24hPct)) return 0;
  const unit = change24hPct / QUAY_TEMPO_FULL_SCALE_PCT;
  return Math.max(-1, Math.min(1, unit));
}
const DISTRICT_COLORS = {
  ethereum: new Color("#94c9be"),
  harbor: new Color("#b4b69a"),
} as const;

/**
 * Adds quiet harbor thresholds beneath the live docks. Ethereum's rollup
 * relationships are one merged ribbon mesh, so the whole layer costs at most
 * two draw calls regardless of dock count.
 */
export function createGardenHarborDistricts(
  docks: readonly DockNode[],
  lighthouseTile: ScreenPoint,
  options: GardenHarborLifeOptions = {},
): GardenHarborDistricts {
  const root = new Group();
  root.name = "garden-harbor-districts";
  const tileScale = options.tileScale ?? DEFAULT_TILE_SCALE;
  const waterY = options.waterY ?? GARDEN_WATER_Y;
  const displayedDocks = docks.map((dock) => ({
    dock,
    tile: gardenDockDisplayTile(dock.tile),
  }));

  let pads: GardenHarborDistricts["pads"] = null;
  if (displayedDocks.length > 0) {
    pads = new InstancedMesh(
      new CircleGeometry(1, 20),
      new MeshBasicMaterial({
        color: "#ffffff",
        depthWrite: false,
        opacity: 0.12,
        side: DoubleSide,
        transparent: true,
        vertexColors: true,
      }),
      displayedDocks.length,
    );
    pads.name = "garden-harbor-district-pads";
    pads.renderOrder = 2;

    const dummy = new Object3D();
    displayedDocks.forEach(({ dock, tile }, index) => {
      const size = Math.max(1, Math.min(10, dock.size));
      dummy.position.set(tile.x * tileScale, waterY + 0.055, tile.y * tileScale);
      dummy.rotation.set(-Math.PI / 2, 0, stableUnit(dock.chainId) * Math.PI);
      dummy.scale.set(2.2 + size * 0.16, 1.15 + size * 0.07, 1);
      dummy.updateMatrix();
      pads?.setMatrixAt(index, dummy.matrix);
      pads?.setColorAt(
        index,
        isEthereumHarbor(dock.chainId)
          ? DISTRICT_COLORS.ethereum
          : DISTRICT_COLORS.harbor,
      );
    });
    pads.instanceMatrix.needsUpdate = true;
    if (pads.instanceColor) pads.instanceColor.needsUpdate = true;
    root.add(pads);
  }

  const ethereum = displayedDocks.find(({ dock }) => dock.chainId === "ethereum");
  const rollups = ETHEREUM_L2_DOCK_CHAIN_IDS.flatMap((chainId) => {
    const match = displayedDocks.find(({ dock }) => dock.chainId === chainId);
    return match ? [match] : [];
  });
  const linkedRollups = ethereum ? rollups : [];
  const islandTile = gardenIslandDisplayTile(lighthouseTile);
  const causewayGeometry = ethereum
    ? createCausewayGeometry(
        ethereum.tile,
        linkedRollups.map(({ tile }) => tile),
        islandTile,
        tileScale,
        waterY + 0.09,
      )
    : null;
  const causeways = causewayGeometry && linkedRollups.length > 0
    ? new Mesh(
        causewayGeometry,
        new MeshBasicMaterial({
          color: "#d5c69d",
          depthWrite: false,
          opacity: 0.34,
          side: DoubleSide,
          transparent: true,
        }),
      )
    : null;
  if (causeways) {
    causeways.name = "garden-ethereum-rollup-causeways";
    causeways.renderOrder = 3;
    root.add(causeways);
  }

  return {
    causewayChainIds: linkedRollups.map(({ dock }) => dock.chainId),
    causeways,
    pads,
    root,
  };
}

/**
 * Creates one instanced flock. Reduced motion always resolves to the same
 * still composition; constrained mode removes the batch without rebuilding it.
 *
 * Tier 3 #13, harbour tempo: given `docks`, the flock also works the quays.
 * Each harbour gets its own small wheel of gulls whose orbit rate, radius and
 * height ride that chain's 24h HELD-SUPPLY change, so a viewer can see which
 * harbours are filling and which are draining. Gulls follow activity — a
 * working quay keeps them wheeling wide and high, a quiet one lets them tuck
 * in and settle. Deliberately no colour, count or jitter channel: a busy
 * harbour has to read as busy, never as distress.
 *
 * This does NOT duplicate the cargo-tide crates on the quay below. Those are
 * ISSUANCE, coins minted and burned at this harbour; this is the chain's total
 * held supply, which also moves when supply bridges in or out. A harbour can
 * be shipping crates out and still filling, and the two marks sit at different
 * heights precisely so that disagreement is readable rather than hidden.
 *
 * Every quay's gulls are extra INSTANCES of the flock's existing mesh, so the
 * whole layer stays the single draw call it already cost.
 */
export function createGardenGullFlock(
  lighthouseTile: ScreenPoint,
  options: GardenGullFlockOptions = {},
): GardenGullFlock {
  const tileScale = options.tileScale ?? DEFAULT_TILE_SCALE;
  const islandTile = gardenIslandDisplayTile(lighthouseTile);
  const root = new Group();
  root.name = "garden-harbor-gull-flock";
  root.position.set(islandTile.x * tileScale, 0, islandTile.y * tileScale);

  // Quays are held island-relative so the flock keeps its single root.
  const quays = (options.docks ?? []).map((dock) => {
    const tile = gardenDockDisplayTile(dock.tile);
    return {
      seed: stableUnit(dock.chainId),
      tempo: quayTempo(dock.change24hPct),
      x: (tile.x - islandTile.x) * tileScale,
      z: (tile.y - islandTile.y) * tileScale,
    };
  });
  const gullCount = GARDEN_GULL_COUNT + quays.length * GARDEN_QUAY_GULL_COUNT;

  const gulls = new InstancedMesh(
    createGullGeometry(),
    new MeshBasicMaterial({
      color: "#ece8d8",
      depthWrite: false,
      opacity: 0.82,
      side: DoubleSide,
      transparent: true,
    }),
    gullCount,
  );
  gulls.name = "garden-harbor-gulls";
  gulls.frustumCulled = false;
  gulls.renderOrder = 8;
  root.add(gulls);

  const dummy = new Object3D();
  const update = ({
    constrained,
    night = 0,
    reducedMotion,
    timeSeconds,
    weather,
  }: GardenGullFlockUpdate): void => {
    // Gulls roost as night settles — the night sky belongs to the lanterns.
    const roosted = night > 0.72;
    root.visible = !constrained && !roosted;
    if (constrained || roosted) return;
    gulls.material.opacity = 0.82 * (1 - Math.max(0, (night - 0.3) / 0.42));

    // Phase 2 weather: a downwind drift shared by every orbit, and the storm
    // scatter — gulls ride weather, and a building storm sends them climbing
    // and spreading off their stations.
    const scatterT = Math.max(0, Math.min(1, ((weather?.stormLevel ?? 0) - 0.55) / 0.23));
    const scatter = scatterT * scatterT * (3 - 2 * scatterT);
    const driftX = (weather?.windDirX ?? 0) * (weather?.windSpeed ?? 0) * 2.2;
    const driftZ = (weather?.windDirZ ?? 0) * (weather?.windSpeed ?? 0) * 2.2;

    const time = reducedMotion ? 0 : timeSeconds;
    // Phase 4 flocking: no per-bird neighbor loops. Cohesion comes from a
    // SHARED wandering wheel center (the whole flock drifts together), and
    // organic turns from a clock-driven flow field sampled at each gull's own
    // position — the heading blends the orbital tangent toward the local flow,
    // so the flock veers as one instead of circling like a mobile.
    const wanderX = Math.sin(time * 0.11 + 1.2) * 2.4 + Math.sin(time * 0.043 + 0.3) * 1.6;
    const wanderZ = Math.cos(time * 0.09 + 0.5) * 2.0 + Math.sin(time * 0.051 + 2.0) * 1.4;
    for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
      const unit = index / GARDEN_GULL_COUNT;
      const speed = (0.09 + (index % 3) * 0.012) * (1 + scatter * 0.8);
      const phase = unit * Math.PI * 2 + time * speed;
      const radius = (10.5 + (index % 4) * 1.55) * (1 + scatter * 0.7);
      const scale = 0.52 + (index % 3) * 0.09;
      const gullX = Math.cos(phase) * radius + driftX + wanderX;
      const gullZ = Math.sin(phase) * radius * 0.68 + driftZ + wanderZ;
      dummy.position.set(
        gullX,
        7.2 + (index % 4) * 0.72 + Math.sin(phase * 2.3) * 0.5
          + scatter * (2.2 + (index % 3) * 0.9),
        gullZ,
      );
      // Orbital tangent (same heading convention as the fleet:
      // rotation.y = -atan2(vz, vx)), steered toward the flow field.
      const orbitHeading = Math.atan2(Math.cos(phase) * 0.68, -Math.sin(phase));
      const flow = gullFlowAngle(gullX, gullZ, time);
      dummy.rotation.set(0, -(orbitHeading + angleDelta(flow, orbitHeading) * 0.55), 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      gulls.setMatrixAt(index, dummy.matrix);
    }

    quays.forEach((quay, quayIndex) => {
      const speed = QUAY_GULL_SPEED * (1 + quay.tempo * QUAY_GULL_SPEED_SWING) * (1 + scatter * 0.6);
      const radius = (QUAY_GULL_RADIUS + quay.tempo * QUAY_GULL_RADIUS_SWING) * (1 + scatter * 0.5);
      const height = QUAY_GULL_HEIGHT + quay.tempo * QUAY_GULL_HEIGHT_SWING + scatter * 1.6;
      for (let seat = 0; seat < GARDEN_QUAY_GULL_COUNT; seat += 1) {
        const index = GARDEN_GULL_COUNT
          + quayIndex * GARDEN_QUAY_GULL_COUNT
          + seat;
        // Harbours wheel out of step with each other, and the seats of one
        // wheel sit opposite so the quay always has a gull on both sides.
        const phase = quay.seed * Math.PI * 2
          + (seat / GARDEN_QUAY_GULL_COUNT) * Math.PI * 2
          + time * speed;
        const gullX = quay.x + Math.cos(phase) * radius + driftX;
        const gullZ = quay.z + Math.sin(phase) * radius * 0.68 + driftZ;
        dummy.position.set(
          gullX,
          height + seat * 0.26 + Math.sin(phase * 1.7) * 0.16,
          gullZ,
        );
        // Same flow steering as the island wheel, gentler — the quay wheel is
        // a tempo reading first, a flock second.
        const orbitHeading = Math.atan2(Math.cos(phase) * 0.68, -Math.sin(phase));
        const flow = gullFlowAngle(gullX, gullZ, time);
        dummy.rotation.set(0, -(orbitHeading + angleDelta(flow, orbitHeading) * 0.3), 0);
        dummy.scale.setScalar(QUAY_GULL_SCALE + seat * 0.05);
        dummy.updateMatrix();
        gulls.setMatrixAt(index, dummy.matrix);
      }
    });
    gulls.instanceMatrix.needsUpdate = true;
  };

  const flock = { gulls, root, update };
  update({ constrained: false, reducedMotion: true, timeSeconds: 0 });
  return flock;
}

function createCausewayGeometry(
  fromTile: ScreenPoint,
  toTiles: readonly ScreenPoint[],
  islandTile: ScreenPoint,
  tileScale: number,
  y: number,
): BufferGeometry | null {
  if (toTiles.length === 0) return null;

  const positions: number[] = [];
  const indices: number[] = [];
  for (const toTile of toTiles) {
    const from = {
      x: fromTile.x * tileScale,
      z: fromTile.y * tileScale,
    };
    const to = {
      x: toTile.x * tileScale,
      z: toTile.y * tileScale,
    };
    const island = {
      x: islandTile.x * tileScale,
      z: islandTile.y * tileScale,
    };
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const length = Math.max(0.001, Math.hypot(dx, dz));
    const normal = { x: -dz / length, z: dx / length };
    const midpoint = { x: (from.x + to.x) / 2, z: (from.z + to.z) / 2 };
    const direction = (
      (midpoint.x + normal.x * 2.4 - island.x) ** 2
      + (midpoint.z + normal.z * 2.4 - island.z) ** 2
    ) >= (
      (midpoint.x - normal.x * 2.4 - island.x) ** 2
      + (midpoint.z - normal.z * 2.4 - island.z) ** 2
    ) ? 1 : -1;
    const control = {
      x: midpoint.x + normal.x * direction * 2.4,
      z: midpoint.z + normal.z * direction * 2.4,
    };
    const firstVertex = positions.length / 3;
    const segments = 6;
    const halfWidth = 0.18;

    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      const oneMinusT = 1 - t;
      const x = oneMinusT ** 2 * from.x
        + 2 * oneMinusT * t * control.x
        + t ** 2 * to.x;
      const z = oneMinusT ** 2 * from.z
        + 2 * oneMinusT * t * control.z
        + t ** 2 * to.z;
      const tangentX = 2 * oneMinusT * (control.x - from.x)
        + 2 * t * (to.x - control.x);
      const tangentZ = 2 * oneMinusT * (control.z - from.z)
        + 2 * t * (to.z - control.z);
      const tangentLength = Math.max(0.001, Math.hypot(tangentX, tangentZ));
      const sideX = (-tangentZ / tangentLength) * halfWidth;
      const sideZ = (tangentX / tangentLength) * halfWidth;
      positions.push(
        x + sideX, y, z + sideZ,
        x - sideX, y, z - sideZ,
      );
    }

    for (let segment = 0; segment < segments; segment += 1) {
      const left = firstVertex + segment * 2;
      indices.push(
        left, left + 1, left + 2,
        left + 2, left + 1, left + 3,
      );
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createGullGeometry(): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute([
    0, 0, -0.16,
    -1, 0, 0.22,
    -0.34, 0, -0.04,
    0, 0, -0.16,
    0.34, 0, -0.04,
    1, 0, 0.22,
    -0.1, 0, -0.28,
    0.1, 0, -0.28,
    0, 0, 0.42,
  ], 3));
  geometry.setIndex([
    0, 1, 2,
    3, 4, 5,
    6, 7, 8,
  ]);
  geometry.computeVertexNormals();
  return geometry;
}

function isEthereumHarbor(chainId: string): boolean {
  return chainId === "ethereum"
    || (ETHEREUM_L2_DOCK_CHAIN_IDS as readonly string[]).includes(chainId);
}

/**
 * Phase 4: the shared gull flow field. Two layered curl-ish sine pairs give a
 * slowly turning heading at any point — gulls sample it at their own position
 * and blend their orbital tangent toward it, which is the cheap boid trick:
 * headings cohere and turns feel organic with zero neighbor queries. Pure in
 * (x, z, t); reduced motion samples it at t = 0 like everything else.
 */
function gullFlowAngle(x: number, z: number, timeSeconds: number): number {
  const u = Math.sin(x * 0.21 + timeSeconds * 0.13)
    + 0.6 * Math.sin((x + z) * 0.11 - timeSeconds * 0.09);
  const v = Math.cos(z * 0.17 - timeSeconds * 0.11)
    + 0.6 * Math.sin(x * 0.13 + timeSeconds * 0.07);
  return Math.atan2(v, u);
}

/** Shortest signed angle from `from` to `to`, in (-PI, PI]. */
function angleDelta(to: number, from: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
