import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  SphereGeometry,
} from "three";
import {
  GARDEN_LIGHTHOUSE_ROOT_OFFSET,
  GARDEN_WATER_Y as WATER_LEVEL,
  gardenIslandDisplayTile,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { PharosVilleWorld } from "../systems/world-types";
import { createLighthouse } from "./garden-lighthouse";
import { setTilePosition, stableUnit } from "./garden-util";

const scratchMatrix = new Matrix4();

export function createWaterAccents(): Group {
  const root = new Group();
  const indices: number[] = [];
  const positions: number[] = [];
  for (let index = 0; index < 96; index += 1) {
    const centerX = (stableUnit(`water-accent-x.${index}`) - 0.5) * 172;
    const centerZ = (stableUnit(`water-accent-z.${index}`) - 0.5) * 128;
    const radius = 0.75 + stableUnit(`water-accent-r.${index}`) * 2.4;
    const start = -0.52 + stableUnit(`water-accent-a.${index}`) * 0.44;
    const arc = 0.22 + stableUnit(`water-accent-l.${index}`) * 0.34;
    for (let segment = 0; segment < 3; segment += 1) {
      const first = start + (segment / 3) * arc;
      const second = start + ((segment + 1) / 3) * arc;
      const ax = centerX + Math.cos(first) * radius * 2.5;
      const az = centerZ + Math.sin(first) * radius;
      const bx = centerX + Math.cos(second) * radius * 2.5;
      const bz = centerZ + Math.sin(second) * radius;
      const length = Math.max(0.001, Math.hypot(bx - ax, bz - az));
      const width = 0.12 + stableUnit(`water-accent-w.${index}.${segment}`) * 0.08;
      const px = (-(bz - az) / length) * width;
      const pz = ((bx - ax) / length) * width;
      const vertex = positions.length / 3;
      positions.push(
        ax + px, WATER_LEVEL + 0.052, az + pz,
        ax - px, WATER_LEVEL + 0.052, az - pz,
        bx + px, WATER_LEVEL + 0.052, bz + pz,
        bx - px, WATER_LEVEL + 0.052, bz - pz,
      );
      indices.push(
        vertex, vertex + 1, vertex + 2,
        vertex + 2, vertex + 1, vertex + 3,
      );
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const accents = new Mesh(
    geometry,
    new MeshBasicMaterial({
      color: "#d7e7d8",
      depthWrite: false,
      opacity: 0.28,
      side: DoubleSide,
      transparent: true,
    }),
  );
  accents.name = "water-silver-accents";
  accents.renderOrder = 3;
  root.add(accents);
  return root;
}

export function createTerracedIsland(world: PharosVilleWorld): {
  beacon: Mesh<SphereGeometry, MeshStandardMaterial>;
  beaconHalo: Mesh<SphereGeometry, MeshBasicMaterial>;
  beam: Group;
  decoration: Group;
  lighthouseLight: PointLight;
  lighthouseRoot: Group;
  lighthouseShell: Group;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, gardenIslandDisplayTile(world.lighthouse.tile), 0);

  const wetCliffMaterial = new MeshStandardMaterial({
    color: "#526b66",
    flatShading: true,
    roughness: 0.92,
  });
  const cliffMaterial = new MeshStandardMaterial({
    color: "#858776",
    flatShading: true,
    roughness: 0.98,
  });
  const limestoneMaterial = new MeshStandardMaterial({
    color: "#b9b49d",
    flatShading: true,
    roughness: 0.96,
  });
  const paleStoneMaterial = new MeshStandardMaterial({
    color: "#d8d0b8",
    flatShading: true,
    roughness: 0.94,
  });
  const plantedMaterial = new MeshStandardMaterial({
    color: "#617553",
    flatShading: true,
    roughness: 1,
  });
  const plantedLightMaterial = new MeshStandardMaterial({
    color: "#879064",
    flatShading: true,
    roughness: 1,
  });

  const shoal = new Mesh(
    createIrregularTerraceGeometry(19.6, 20.5, 0.16, 36, 0.8),
    new MeshBasicMaterial({
      color: "#5ca394",
      depthWrite: false,
      opacity: 0.28,
      transparent: true,
    }),
  );
  shoal.position.set(1.2, WATER_LEVEL + 0.055, 1.5);
  shoal.scale.z = 0.72;
  shoal.renderOrder = 1;
  root.add(shoal);

  const shore = new Mesh(
    createIrregularTerraceGeometry(16.8, 18.4, 1.45, 32, 0.3),
    [cliffMaterial, paleStoneMaterial, wetCliffMaterial],
  );
  shore.position.set(0.6, -0.74, 1.2);
  shore.scale.z = 0.75;
  shore.rotation.y = 0.08;
  root.add(shore);

  const lower = new Mesh(
    createIrregularTerraceGeometry(13.7, 15.7, 1.72, 30, 1.25),
    [cliffMaterial, limestoneMaterial, wetCliffMaterial],
  );
  lower.position.set(-1.8, 0.05, 0.65);
  lower.scale.z = 0.7;
  lower.rotation.y = -0.12;
  root.add(lower);

  const middle = new Mesh(
    createIrregularTerraceGeometry(10.1, 12.3, 1.55, 28, 2.2),
    [limestoneMaterial, plantedLightMaterial, cliffMaterial],
  );
  middle.position.set(-4.45, 1.22, 0.05);
  middle.scale.z = 0.64;
  middle.rotation.y = 0.18;
  root.add(middle);

  const crown = new Mesh(
    createIrregularTerraceGeometry(6.1, 8.1, 1.15, 24, 3.35),
    [limestoneMaterial, plantedMaterial, cliffMaterial],
  );
  crown.position.set(-6.7, 2.18, -1.1);
  crown.scale.z = 0.66;
  crown.rotation.y = -0.08;
  root.add(crown);

  for (const [radius, x, y, z, scaleZ, seed] of [
    [4.55, 3.55, 0.92, 2.9, 0.48, 0.4],
    [3.65, -6.0, 1.9, 2.0, 0.43, 1.8],
    [2.9, 2.25, 2.42, -3.7, 0.52, 2.7],
  ] as const) {
    const plantedShelf = new Mesh(
      createIrregularTerraceGeometry(radius, radius * 1.06, 0.2, 16, seed),
      plantedMaterial,
    );
    plantedShelf.position.set(x, y, z);
    plantedShelf.scale.z = scaleZ;
    plantedShelf.rotation.y = x * 0.08;
    root.add(plantedShelf);
  }

  const pathMaterial = new MeshStandardMaterial({
    color: "#d2c9af",
    flatShading: true,
    roughness: 1,
  });
  for (const [x, y, z, width, rotation] of [
    [5.3, 1.16, 3.35, 2.7, -0.46],
    [3.25, 1.45, 3.0, 2.35, -0.3],
    [1.25, 1.78, 2.45, 2.1, -0.23],
    [-0.55, 2.06, 1.8, 1.9, -0.18],
    [-2.2, 2.32, 1.1, 1.75, -0.13],
    [-3.75, 2.55, 0.35, 1.55, -0.03],
    [-5.2, 2.72, -0.35, 1.4, 0.08],
  ] as const) {
    const pathStep = new Mesh(new BoxGeometry(width, 0.18, 0.82), pathMaterial);
    pathStep.position.set(x, y, z);
    pathStep.rotation.y = rotation;
    root.add(pathStep);
  }

  const lighthouseRoot = new Group();
  lighthouseRoot.position.set(
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.x,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.y,
    GARDEN_LIGHTHOUSE_ROOT_OFFSET.z,
  );
  root.add(lighthouseRoot);
  const lighthouse = createLighthouse();
  lighthouseRoot.add(lighthouse.root);

  const decoration = createIslandDecoration();
  root.add(decoration);
  root.add(
    createKeeperCottage(),
    createObservatoryPavilion(),
    createIslandReflectionPond(),
  );

  return {
    beacon: lighthouse.beacon,
    beaconHalo: lighthouse.beaconHalo,
    beam: lighthouse.beam,
    decoration,
    lighthouseLight: lighthouse.light,
    lighthouseRoot,
    lighthouseShell: lighthouse.shell,
    root,
  };
}

function createIrregularTerraceGeometry(
  topRadius: number,
  bottomRadius: number,
  height: number,
  segments: number,
  seed: number,
): CylinderGeometry {
  const geometry = new CylinderGeometry(
    topRadius,
    bottomRadius,
    height,
    segments,
    1,
    false,
  );
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const z = positions.getZ(index);
    const radius = Math.hypot(x, z);
    if (radius < 0.001) continue;
    const angle = Math.atan2(z, x);
    const variation = 1
      + Math.sin(angle * 3 + seed) * 0.045
      + Math.sin(angle * 7 - seed * 0.7) * 0.026
      + Math.sin(angle * 11 + seed * 1.3) * 0.012;
    positions.setX(index, x * variation);
    positions.setZ(index, z * variation);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function createIslandDecoration(): Group {
  const root = new Group();
  const treePoints = [
    [-9.7, 1.12, -2.4, 1.06, -0.9],
    [-7.8, 1.55, 2.15, 0.9, -0.72],
    [-5.9, 1.45, -4.1, 0.84, -0.68],
    [-2.0, 1.33, 5.05, 1.02, -0.38],
    [0.55, 1.08, 4.55, 0.9, -0.25],
    [5.45, 0.92, 1.95, 0.96, 0.32],
    [-5.8, 2.42, 1.45, 0.72, -0.52],
    [2.8, 2.34, -3.55, 0.74, 0.22],
    [-5.4, 0.82, 6.15, 0.66, -0.35],
    [0.4, 0.36, 7.2, 0.58, 0.08],
    [5.7, 0.2, 5.2, 0.64, 0.3],
  ] as const;
  const trunks = new InstancedMesh(
    new CylinderGeometry(0.11, 0.22, 2.15, 7),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    treePoints.length,
  );
  const crowns = new InstancedMesh(
    new DodecahedronGeometry(1, 0),
    new MeshStandardMaterial({
      color: "#6f8058",
      flatShading: true,
      roughness: 0.96,
    }),
    treePoints.length,
  );
  treePoints.forEach(([x, y, z, scale, wind], index) => {
    scratchMatrix.makeScale(scale, scale, scale);
    scratchMatrix.setPosition(x, y + 0.9, z);
    trunks.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeScale(scale * 1.55, scale * 0.62, scale * 1.12);
    scratchMatrix.setPosition(x + wind, y + 2.18, z);
    crowns.setMatrixAt(index, scratchMatrix);
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  root.add(trunks, crowns);
  const westPine = createWindPine(1.12, -0.72);
  westPine.position.set(-10.4, 1.18, 0.1);
  westPine.rotation.y = -0.28;
  root.add(westPine);
  const eastPine = createWindPine(0.9, 0.58);
  eastPine.position.set(4.7, 1.25, -2.2);
  eastPine.rotation.y = 0.4;
  root.add(eastPine);

  const stonePoints = [
    [-13.9, -0.12, 2.7, 1.05],
    [-12.1, 0.28, -4.7, 0.82],
    [-9.0, 0.72, 5.9, 0.96],
    [-5.5, 0.55, -7.0, 0.72],
    [-1.0, 0.24, 7.2, 0.88],
    [3.6, 0.16, 6.15, 0.76],
    [8.4, -0.12, 3.7, 1.08],
    [10.8, -0.32, -0.3, 0.82],
    [7.5, -0.22, -5.2, 0.94],
    [2.4, 1.95, -4.9, 0.62],
    [-6.1, 1.52, -4.25, 0.7],
    [-8.4, 1.9, 2.85, 0.66],
    [5.9, 0.86, 4.55, 0.58],
    [-2.7, 1.35, 5.95, 0.55],
    [-7.5, 0.3, 6.2, 0.98],
    [-2.8, -0.06, 8.0, 0.9],
    [2.5, -0.22, 7.55, 1.08],
    [6.8, -0.4, 5.2, 0.94],
  ] as const;
  const stones = new InstancedMesh(
    new DodecahedronGeometry(0.8, 0),
    new MeshStandardMaterial({
      color: "#989986",
      flatShading: true,
      roughness: 1,
    }),
    stonePoints.length,
  );
  stonePoints.forEach(([x, y, z, scale], index) => {
    scratchMatrix.makeScale(scale, scale * 0.62, scale);
    scratchMatrix.setPosition(x, y, z);
    stones.setMatrixAt(index, scratchMatrix);
  });
  stones.instanceMatrix.needsUpdate = true;
  root.add(stones);

  const reedPoints = [
    [8.7, -0.05, 2.6], [9.1, -0.08, 2.1], [9.35, -0.1, 1.5],
    [7.8, 0.02, 3.6], [7.35, 0.05, 4.05], [-11.8, 0.12, 4.0],
    [-12.35, 0.02, 3.5], [-12.7, -0.05, 2.9], [3.8, 0.12, 6.2],
    [4.4, 0.04, 5.9], [5.0, -0.02, 5.5], [-4.6, 0.08, 6.5],
  ] as const;
  const reeds = new InstancedMesh(
    new ConeGeometry(0.13, 1.15, 5),
    new MeshStandardMaterial({ color: "#526a4d", flatShading: true, roughness: 1 }),
    reedPoints.length,
  );
  reedPoints.forEach(([x, y, z], index) => {
    const scale = 0.74 + stableUnit(`reed.${index}`) * 0.5;
    scratchMatrix.makeScale(scale, scale, scale);
    scratchMatrix.setPosition(x, y + 0.52 * scale, z);
    reeds.setMatrixAt(index, scratchMatrix);
  });
  reeds.instanceMatrix.needsUpdate = true;
  root.add(reeds);

  for (const [x, y, z] of [
    [-3.2, 2.78, 0.65],
    [1.4, 2.12, 2.52],
    [5.5, 1.22, 3.45],
  ] as const) {
    const lantern = new Group();
    lantern.position.set(x, y, z);
    const pedestal = new Mesh(
      new CylinderGeometry(0.16, 0.22, 0.72, 6),
      new MeshStandardMaterial({ color: "#807f71", flatShading: true, roughness: 1 }),
    );
    pedestal.position.y = 0.36;
    const lamp = new Mesh(
      new BoxGeometry(0.34, 0.32, 0.34),
      new MeshStandardMaterial({
        color: "#d4b66f",
        emissive: HARBOR_PALETTE.lantern_warm,
        emissiveIntensity: 0.7,
        roughness: 0.48,
      }),
    );
    lamp.position.y = 0.88;
    const cap = new Mesh(
      new ConeGeometry(0.32, 0.25, 4),
      new MeshStandardMaterial({ color: "#696a61", flatShading: true, roughness: 0.9 }),
    );
    cap.position.y = 1.17;
    cap.rotation.y = Math.PI / 4;
    lantern.add(pedestal, lamp, cap);
    root.add(lantern);
  }
  return root;
}

function createWindPine(scale: number, bend: number): Group {
  const root = new Group();
  const trunkMaterial = new MeshStandardMaterial({
    color: "#514536",
    flatShading: true,
    roughness: 1,
  });
  const foliageMaterial = new MeshStandardMaterial({
    color: "#3f5d49",
    flatShading: true,
    roughness: 0.96,
  });
  for (const [x, y, rotation, length, radius] of [
    [0, 0.75, bend * 0.12, 1.6, 0.2],
    [bend * 0.18, 2.05, bend * 0.18, 1.35, 0.16],
    [bend * 0.4, 3.12, bend * 0.24, 1.05, 0.12],
  ] as const) {
    const trunk = new Mesh(
      new CylinderGeometry(radius * 0.72, radius, length, 7),
      trunkMaterial,
    );
    trunk.position.set(x, y, 0);
    trunk.rotation.z = rotation;
    root.add(trunk);
  }
  for (const [x, y, z, sx, sy, sz] of [
    [bend * 0.32, 2.35, 0, 1.45, 0.5, 0.92],
    [bend * 0.62, 3.12, 0.18, 1.7, 0.58, 1.0],
    [bend * 0.82, 3.82, -0.1, 1.25, 0.48, 0.82],
    [bend * 0.18, 3.55, 0.12, 0.85, 0.42, 0.72],
  ] as const) {
    const crown = new Mesh(new DodecahedronGeometry(1, 0), foliageMaterial);
    crown.position.set(x, y, z);
    crown.scale.set(sx, sy, sz);
    root.add(crown);
  }
  root.scale.setScalar(scale);
  return root;
}

function createKeeperCottage(): Group {
  const root = new Group();
  root.position.set(-1.2, 2.08, -0.3);
  root.rotation.y = -0.18;
  const foundation = new Mesh(
    new BoxGeometry(4.7, 0.38, 3.2),
    new MeshStandardMaterial({ color: "#8f8d7d", flatShading: true, roughness: 1 }),
  );
  foundation.position.y = 0.18;
  const walls = new Mesh(
    new BoxGeometry(4.1, 1.9, 2.7),
    new MeshStandardMaterial({ color: "#c7bea7", flatShading: true, roughness: 0.96 }),
  );
  walls.position.y = 1.25;
  const roof = new Mesh(
    new ConeGeometry(3.25, 1.5, 4),
    new MeshStandardMaterial({
      color: "#6b4a3e",
      flatShading: true,
      roughness: 0.84,
    }),
  );
  roof.position.y = 2.75;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = 0.72;
  const windowMaterial = new MeshStandardMaterial({
    color: "#dfbd73",
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.45,
    roughness: 0.38,
  });
  const window = new Mesh(new BoxGeometry(0.74, 0.65, 0.08), windowMaterial);
  window.position.set(0.8, 1.42, 1.39);
  root.add(foundation, walls, roof, window);
  return root;
}

function createObservatoryPavilion(): Group {
  const root = new Group();
  root.position.set(4.4, 1.05, 2.35);
  root.rotation.y = 0.22;
  const stoneMaterial = new MeshStandardMaterial({
    color: "#a4a28e",
    flatShading: true,
    roughness: 1,
  });
  const timberMaterial = new MeshStandardMaterial({
    color: "#5d4635",
    roughness: 0.92,
  });
  const copperMaterial = new MeshStandardMaterial({
    color: "#4f7166",
    metalness: 0.28,
    roughness: 0.66,
  });
  const base = new Mesh(new CylinderGeometry(2.2, 2.4, 0.36, 8), stoneMaterial);
  base.position.y = 0.18;
  root.add(base);
  for (const [x, z] of [[-1.25, -0.8], [-1.25, 0.8], [1.25, -0.8], [1.25, 0.8]] as const) {
    const post = new Mesh(new CylinderGeometry(0.09, 0.12, 2.4, 6), timberMaterial);
    post.position.set(x, 1.45, z);
    root.add(post);
  }
  const roof = new Mesh(new ConeGeometry(2.55, 1.15, 8), copperMaterial);
  roof.position.y = 3.05;
  roof.scale.z = 0.72;
  root.add(roof);
  const instrument = new Mesh(
    new SphereGeometry(0.38, 10, 7),
    new MeshStandardMaterial({
      color: "#c79d52",
      metalness: 0.62,
      roughness: 0.38,
    }),
  );
  instrument.position.y = 1.08;
  root.add(instrument);
  return root;
}

function createIslandReflectionPond(): Group {
  const root = new Group();
  root.position.set(1.45, 2.03, -2.05);
  root.rotation.y = -0.18;
  const pond = new Mesh(
    new CircleGeometry(2.65, 32),
    new MeshStandardMaterial({
      color: "#315f60",
      metalness: 0.08,
      roughness: 0.28,
      side: DoubleSide,
    }),
  );
  pond.rotation.x = -Math.PI / 2;
  pond.scale.z = 0.62;
  root.add(pond);
  const rim = new Mesh(
    new RingGeometry(2.55, 2.83, 32),
    new MeshStandardMaterial({
      color: "#a8a590",
      flatShading: true,
      roughness: 1,
      side: DoubleSide,
    }),
  );
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.035;
  rim.scale.z = 0.62;
  root.add(rim);

  const steppingStones = new InstancedMesh(
    new DodecahedronGeometry(0.35, 0),
    new MeshStandardMaterial({
      color: "#bbb6a0",
      flatShading: true,
      roughness: 1,
    }),
    6,
  );
  for (let index = 0; index < steppingStones.count; index += 1) {
    const progress = index / (steppingStones.count - 1);
    scratchMatrix.makeScale(
      1 + (index % 2) * 0.18,
      0.3,
      0.82 + ((index + 1) % 2) * 0.16,
    );
    scratchMatrix.setPosition(
      -1.85 + progress * 3.65,
      0.16 + Math.sin(progress * Math.PI) * 0.03,
      Math.sin(progress * Math.PI * 1.2) * 0.32,
    );
    steppingStones.setMatrixAt(index, scratchMatrix);
  }
  steppingStones.instanceMatrix.needsUpdate = true;
  root.add(steppingStones);
  return root;
}
