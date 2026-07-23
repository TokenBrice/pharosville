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

export const GARDEN_GULL_COUNT = 9;

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
  reducedMotion: boolean;
  timeSeconds: number;
}

export interface GardenGullFlock {
  gulls: InstancedMesh<BufferGeometry, MeshBasicMaterial>;
  root: Group;
  update(input: GardenGullFlockUpdate): void;
}

const DEFAULT_TILE_SCALE = Math.SQRT2;
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
  const displayedDocks = docks.map((dock, index) => ({
    dock,
    tile: gardenDockDisplayTile(dock.tile, index),
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
 */
export function createGardenGullFlock(
  lighthouseTile: ScreenPoint,
  options: Pick<GardenHarborLifeOptions, "tileScale"> = {},
): GardenGullFlock {
  const tileScale = options.tileScale ?? DEFAULT_TILE_SCALE;
  const islandTile = gardenIslandDisplayTile(lighthouseTile);
  const root = new Group();
  root.name = "garden-harbor-gull-flock";
  root.position.set(islandTile.x * tileScale, 0, islandTile.y * tileScale);

  const gulls = new InstancedMesh(
    createGullGeometry(),
    new MeshBasicMaterial({
      color: "#ece8d8",
      depthWrite: false,
      opacity: 0.82,
      side: DoubleSide,
      transparent: true,
    }),
    GARDEN_GULL_COUNT,
  );
  gulls.name = "garden-harbor-gulls";
  gulls.frustumCulled = false;
  gulls.renderOrder = 8;
  root.add(gulls);

  const dummy = new Object3D();
  const update = ({
    constrained,
    reducedMotion,
    timeSeconds,
  }: GardenGullFlockUpdate): void => {
    root.visible = !constrained;
    if (constrained) return;

    const time = reducedMotion ? 0 : timeSeconds;
    for (let index = 0; index < GARDEN_GULL_COUNT; index += 1) {
      const unit = index / GARDEN_GULL_COUNT;
      const speed = 0.09 + (index % 3) * 0.012;
      const phase = unit * Math.PI * 2 + time * speed;
      const radius = 10.5 + (index % 4) * 1.55;
      const scale = 0.52 + (index % 3) * 0.09;
      dummy.position.set(
        Math.cos(phase) * radius,
        7.2 + (index % 4) * 0.72 + Math.sin(phase * 2.3) * 0.5,
        Math.sin(phase) * radius * 0.68,
      );
      dummy.rotation.set(0, -phase, 0);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      gulls.setMatrixAt(index, dummy.matrix);
    }
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

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
