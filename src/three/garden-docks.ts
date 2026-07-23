import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_WATER_Y as WATER_LEVEL,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DockNode } from "../systems/world-types";
import { setTilePosition, stableUnit, TILE_SCALE } from "./garden-util";

const scratchMatrix = new Matrix4();

export interface DockVisual {
  dock: DockNode;
  fineDetail: Group;
  root: Group;
}

export function createHarborLanterns(
  islandTile: { x: number; y: number },
): {
  lightMaterial: MeshStandardMaterial;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, islandTile, 0);
  const count = 12;
  const bodyMaterial = new MeshStandardMaterial({
    color: "#766348",
    metalness: 0.38,
    roughness: 0.65,
  });
  const lightMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.25,
    roughness: 0.25,
  });
  const bodies = new InstancedMesh(
    new CylinderGeometry(0.12, 0.2, 0.42, 6),
    bodyMaterial,
    count,
  );
  const lights = new InstancedMesh(
    new SphereGeometry(0.16, 8, 6),
    lightMaterial,
    count,
  );
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
      + stableUnit(`harbor-lantern-angle.${index}`) * 0.16;
    const radiusX = 22 + (index % 3) * 1.25;
    const radiusZ = 15.5 + (index % 2) * 1.15;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.26, z);
    bodies.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.58, z);
    lights.setMatrixAt(index, scratchMatrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  root.add(bodies, lights);
  return { lightMaterial, root };
}

export function createDock(
  dock: DockNode,
  displayTile: { x: number; y: number },
  islandTile: { x: number; y: number },
): DockVisual {
  const root = new Group();
  const fineDetail = new Group();
  fineDetail.name = "dock-fine-detail";
  root.add(fineDetail);
  setTilePosition(root, displayTile, GARDEN_DOCK_ROOT_Y);
  const toIslandX = (islandTile.x - displayTile.x) * TILE_SCALE;
  const toIslandZ = (islandTile.y - displayTile.y) * TILE_SCALE;
  root.rotation.y = -Math.atan2(toIslandZ, toIslandX);

  const amountScale = MathUtils.clamp(Math.log10(Math.max(1, dock.totalUsd)) / 11, 0.72, 1.18);
  const length = 7.2 * amountScale;
  const width = 1.65 + amountScale * 0.35;
  const timber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_mid,
    roughness: 0.88,
  });
  const pier = new Mesh(new BoxGeometry(length, 0.42, width), timber);
  pier.position.x = length * 0.2;
  root.add(pier);
  const crossPier = new Mesh(new BoxGeometry(1.25, 0.36, width * 2.25), timber);
  crossPier.position.x = length * 0.56;
  root.add(crossPier);

  const plankPoints: Vector3[] = [];
  for (let index = 0; index <= 7; index += 1) {
    const x = -length * 0.3 + (index / 7) * length;
    plankPoints.push(
      new Vector3(x, 0.225, -width * 0.46),
      new Vector3(x, 0.225, width * 0.46),
    );
  }
  const planks = new LineSegments(
    new BufferGeometry().setFromPoints(plankPoints),
    new LineBasicMaterial({
      color: HARBOR_PALETTE.timber_dark,
      opacity: 0.4,
      transparent: true,
    }),
  );
  fineDetail.add(planks);

  const pylons = new InstancedMesh(
    new CylinderGeometry(0.16, 0.2, 2.25, 6),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    6,
  );
  let pylonIndex = 0;
  for (const x of [-length * 0.2, length * 0.18, length * 0.55]) {
    for (const z of [-width * 0.55, width * 0.55]) {
      scratchMatrix.makeTranslation(x, -0.85, z);
      pylons.setMatrixAt(pylonIndex, scratchMatrix);
      pylonIndex += 1;
    }
  }
  pylons.instanceMatrix.needsUpdate = true;
  fineDetail.add(pylons);

  const bollards = new InstancedMesh(
    new CylinderGeometry(0.1, 0.14, 0.44, 6),
    new MeshStandardMaterial({
      color: "#6d5d49",
      metalness: 0.42,
      roughness: 0.62,
    }),
    4,
  );
  let bollardIndex = 0;
  for (const x of [-length * 0.18, length * 0.54]) {
    for (const z of [-width * 0.52, width * 0.52]) {
      scratchMatrix.makeTranslation(x, 0.42, z);
      bollards.setMatrixAt(bollardIndex, scratchMatrix);
      bollardIndex += 1;
    }
  }
  bollards.instanceMatrix.needsUpdate = true;
  fineDetail.add(bollards);

  const signalColor = dockHealthAccent(dock.healthBand);
  const signalMast = new Mesh(
    new CylinderGeometry(0.065, 0.09, 2.25, 6),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.96 }),
  );
  signalMast.position.set(length * 0.52, 1.25, -width * 0.35);
  root.add(signalMast);
  const signalShape = new Shape();
  signalShape.moveTo(0, 0);
  signalShape.lineTo(0.9, -0.27);
  signalShape.lineTo(0, -0.57);
  signalShape.closePath();
  const signal = new Mesh(
    new ShapeGeometry(signalShape),
    new MeshStandardMaterial({
      color: signalColor,
      emissive: signalColor,
      emissiveIntensity: 0.1,
      side: DoubleSide,
    }),
  );
  signal.position.set(length * 0.52, 2.2, -width * 0.34);
  root.add(signal);

  const storehouse = new Group();
  storehouse.position.set(-length * 0.2, 0.3, 0);
  const storehouseWalls = new Mesh(
    new BoxGeometry(1.7, 0.88, Math.max(1.35, width * 0.86)),
    new MeshStandardMaterial({
      color: "#9f8c68",
      flatShading: true,
      roughness: 0.96,
    }),
  );
  storehouseWalls.position.y = 0.44;
  const storehouseRoof = new Mesh(
    new BoxGeometry(2, 0.2, Math.max(1.58, width)),
    new MeshStandardMaterial({
      color: signalColor,
      flatShading: true,
      roughness: 0.88,
    }),
  );
  storehouseRoof.position.y = 0.98;
  storehouseRoof.rotation.z = -0.06;
  storehouse.add(storehouseWalls, storehouseRoof);
  root.add(storehouse);

  const crateCount = dock.backingDiversity == null
    ? 0
    : dock.backingDiversity < 0.35
      ? 3
      : dock.backingDiversity < 0.55
        ? 2
        : 0;
  if (crateCount > 0) {
    const crates = new InstancedMesh(
      new BoxGeometry(0.46, 0.4, 0.46),
      new MeshStandardMaterial({
        color: "#8d623a",
        flatShading: true,
        roughness: 1,
      }),
      crateCount,
    );
    for (let index = 0; index < crateCount; index += 1) {
      scratchMatrix.makeTranslation(
        length * 0.22 + index * 0.48,
        0.42,
        width * 0.3,
      );
      crates.setMatrixAt(index, scratchMatrix);
    }
    crates.instanceMatrix.needsUpdate = true;
    fineDetail.add(crates);
  }

  const lampPost = new Mesh(
    new CylinderGeometry(0.055, 0.08, 1.52, 6),
    new MeshStandardMaterial({ color: "#615342", metalness: 0.28, roughness: 0.72 }),
  );
  lampPost.position.set(length * 0.55, 1, 0);
  root.add(lampPost);
  const lamp = new Mesh(
    new SphereGeometry(0.23, 8, 6),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    }),
  );
  lamp.position.set(length * 0.55, 1.8, 0);
  root.add(lamp);
  return { dock, fineDetail, root };
}

function dockHealthAccent(healthBand: DockNode["healthBand"]): string {
  if (healthBand === "robust" || healthBand === "healthy") return "#78b689";
  if (healthBand === "mixed") return "#dfb95a";
  if (healthBand === "fragile") return "#d98b54";
  return "#c9675c";
}
