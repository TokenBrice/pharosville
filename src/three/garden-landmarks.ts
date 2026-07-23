import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  type GraveNode,
  type PigeonnierNode,
} from "../systems/world-types";
import { CEMETERY_CENTER } from "../systems/world-layout";

const TILE_SCALE = Math.SQRT2;
const WATER_Y = -1.45;

export interface GardenLandmarkAnchorData<
  Kind extends "grave" | "pigeonnier",
> {
  detailId: string;
  entityId: string;
  kind: Kind;
  label: string;
  selectionRadius: number;
}

export type GardenLandmarkAnchor<
  Kind extends "grave" | "pigeonnier",
> = Object3D & {
  userData: GardenLandmarkAnchorData<Kind>;
};

export interface GardenCemeteryLandmark {
  anchors: ReadonlyMap<string, GardenLandmarkAnchor<"grave">>;
  mistAnchor: Object3D;
  root: Group;
}

export interface GardenPigeonnierLandmark {
  anchor: GardenLandmarkAnchor<"pigeonnier">;
  dispatchAnchor: Object3D;
  root: Group;
}

type GraveMarkerFamily = "pillar" | "shard" | "tablet";

/**
 * Builds the detached memorial islet at its canonical world position.
 * Grave anchors are keyed by detail id so they can be copied directly into
 * the Three renderer's entity-cue map.
 */
export function createGardenCemetery(
  graves: readonly GraveNode[],
): GardenCemeteryLandmark {
  const root = new Group();
  root.name = "garden-cemetery";
  root.position.set(
    CEMETERY_CENTER.x * TILE_SCALE,
    0,
    CEMETERY_CENTER.y * TILE_SCALE,
  );

  const wetStone = new MeshStandardMaterial({
    color: "#526661",
    flatShading: true,
    roughness: 1,
  });
  const limestone = new MeshStandardMaterial({
    color: "#aaa993",
    flatShading: true,
    roughness: 1,
  });
  const moss = new MeshStandardMaterial({
    color: "#607557",
    flatShading: true,
    roughness: 1,
  });
  const memorialStone = new MeshStandardMaterial({
    color: "#c6c0aa",
    flatShading: true,
    roughness: 0.98,
  });

  const shoal = new Mesh(
    irregularTerraceGeometry(7.4, 7.8, 0.12, 22, 0.4),
    new MeshBasicMaterial({
      color: "#63a394",
      depthWrite: false,
      opacity: 0.22,
      transparent: true,
    }),
  );
  shoal.name = "cemetery-shoal";
  shoal.position.y = WATER_Y + 0.055;
  shoal.scale.z = 0.68;
  shoal.renderOrder = 1;
  root.add(shoal);

  const shore = new Mesh(
    irregularTerraceGeometry(6.4, 7.1, 1.28, 20, 1.15),
    wetStone,
  );
  shore.name = "cemetery-shore";
  shore.position.y = -0.82;
  shore.scale.z = 0.68;
  shore.rotation.y = -0.08;
  root.add(shore);

  const plantedTop = new Mesh(
    irregularTerraceGeometry(5.75, 6.35, 0.42, 20, 2.4),
    [limestone, moss, wetStone],
  );
  plantedTop.name = "cemetery-planted-top";
  plantedTop.position.set(-0.18, -0.06, 0.08);
  plantedTop.scale.z = 0.68;
  plantedTop.rotation.y = 0.05;
  root.add(plantedTop);

  const path = new InstancedMesh(
    new BoxGeometry(0.82, 0.1, 0.52),
    limestone,
    7,
  );
  path.name = "cemetery-stepping-stones";
  const dummy = new Object3D();
  for (let index = 0; index < path.count; index += 1) {
    const progress = index / (path.count - 1);
    dummy.position.set(
      -4.4 + progress * 5.8,
      0.2 + Math.sin(progress * Math.PI) * 0.03,
      1.15 + Math.sin(progress * Math.PI * 1.4) * 0.32,
    );
    dummy.rotation.set(0, -0.16 + progress * 0.22, 0);
    dummy.scale.set(0.86 + (index % 2) * 0.12, 1, 1);
    dummy.updateMatrix();
    path.setMatrixAt(index, dummy.matrix);
  }
  path.instanceMatrix.needsUpdate = true;
  root.add(path);

  const memorial = new Group();
  memorial.name = "cemetery-central-memorial";
  memorial.position.set(0.05, 0.2, -0.1);
  const memorialBase = new Mesh(
    new CylinderGeometry(0.74, 0.88, 0.24, 8),
    limestone,
  );
  memorialBase.position.y = 0.12;
  const memorialStele = new Mesh(
    new BoxGeometry(0.65, 1.55, 0.32),
    memorialStone,
  );
  memorialStele.position.y = 0.98;
  memorialStele.rotation.y = 0.08;
  const memorialCap = new Mesh(
    new ConeGeometry(0.55, 0.28, 4),
    wetStone,
  );
  memorialCap.position.y = 1.88;
  memorialCap.rotation.y = Math.PI / 4;
  memorial.add(memorialBase, memorialStele, memorialCap);
  root.add(memorial);

  const stoneLantern = createStoneLantern();
  stoneLantern.position.set(-2.75, 0.18, -1.55);
  stoneLantern.rotation.y = -0.18;
  root.add(stoneLantern);

  const anchors = new Map<string, GardenLandmarkAnchor<"grave">>();
  const gravesByFamily = new Map<GraveMarkerFamily, GraveNode[]>([
    ["pillar", []],
    ["shard", []],
    ["tablet", []],
  ]);
  for (const grave of graves) {
    const localX = (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE;
    const localZ = (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE;
    const anchor = createAnchor({
      detailId: grave.detailId,
      entityId: grave.id,
      kind: "grave",
      label: grave.label,
      selectionRadius: 0.68 + grave.visual.scale,
    });
    anchor.name = `cemetery-anchor:${grave.id}`;
    anchor.position.set(localX, 0.2, localZ);
    root.add(anchor);
    anchors.set(grave.detailId, anchor);
    gravesByFamily.get(markerFamily(grave))?.push(grave);
  }

  const tabletGeometry = new BoxGeometry(0.36, 0.72, 0.2);
  const pillarGeometry = new CylinderGeometry(0.13, 0.19, 0.78, 6);
  const shardGeometry = new DodecahedronGeometry(0.32, 0);
  for (const [family, familyGraves] of gravesByFamily) {
    if (familyGraves.length === 0) continue;
    const geometry = family === "tablet"
      ? tabletGeometry
      : family === "pillar"
        ? pillarGeometry
        : shardGeometry;
    const markers = new InstancedMesh(
      geometry,
      family === "shard" ? limestone : memorialStone,
      familyGraves.length,
    );
    markers.name = `cemetery-markers-${family}`;
    familyGraves.forEach((grave, index) => {
      const scale = 0.88 + grave.visual.scale * 1.35;
      dummy.position.set(
        (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE,
        family === "shard" ? 0.34 : 0.2 + 0.39 * scale,
        (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE,
      );
      dummy.rotation.set(
        family === "shard" ? -0.2 : 0,
        (stableUnit(grave.id) - 0.5) * 0.5,
        family === "shard" ? 0.3 : (stableUnit(`${grave.id}.lean`) - 0.5) * 0.09,
      );
      dummy.scale.set(
        scale * (family === "shard" ? 1.2 : 1),
        scale * (family === "shard" ? 0.7 : 1),
        scale,
      );
      dummy.updateMatrix();
      markers.setMatrixAt(index, dummy.matrix);
    });
    markers.instanceMatrix.needsUpdate = true;
    root.add(markers);
  }

  const mistAnchor = new Object3D();
  mistAnchor.name = "cemetery-mist-anchor";
  mistAnchor.position.set(0, 0.25, 0);
  root.add(mistAnchor);

  return { anchors, mistAnchor, root };
}

/**
 * Builds the TON dispatch islet at the supplied pigeonnier tile.
 * The dispatch anchor sits above the roof for birds, signal ribbons, or light.
 */
export function createGardenPigeonnier(
  pigeonnier: PigeonnierNode,
): GardenPigeonnierLandmark {
  const root = new Group();
  root.name = "garden-pigeonnier";
  root.position.set(
    pigeonnier.tile.x * TILE_SCALE,
    0,
    pigeonnier.tile.y * TILE_SCALE,
  );

  const wetStone = new MeshStandardMaterial({
    color: "#506762",
    flatShading: true,
    roughness: 1,
  });
  const stone = new MeshStandardMaterial({
    color: "#9b9d89",
    flatShading: true,
    roughness: 1,
  });
  const planted = new MeshStandardMaterial({
    color: "#5f7658",
    flatShading: true,
    roughness: 1,
  });
  const timber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_mid,
    flatShading: true,
    roughness: 0.94,
  });
  const darkTimber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_dark,
    flatShading: true,
    roughness: 0.98,
  });
  const roofMaterial = new MeshStandardMaterial({
    color: "#536d64",
    flatShading: true,
    metalness: 0.12,
    roughness: 0.86,
  });

  const shoal = new Mesh(
    irregularTerraceGeometry(3.5, 3.8, 0.1, 18, 3.1),
    new MeshBasicMaterial({
      color: "#5e9e90",
      depthWrite: false,
      opacity: 0.2,
      transparent: true,
    }),
  );
  shoal.name = "pigeonnier-shoal";
  shoal.position.y = WATER_Y + 0.055;
  shoal.scale.z = 0.76;
  shoal.renderOrder = 1;
  root.add(shoal);

  const islet = new Mesh(
    irregularTerraceGeometry(2.82, 3.3, 1.2, 18, 1.8),
    wetStone,
  );
  islet.name = "pigeonnier-islet";
  islet.position.y = -0.84;
  islet.scale.z = 0.76;
  root.add(islet);

  const isletTop = new Mesh(
    irregularTerraceGeometry(2.55, 2.85, 0.32, 16, 0.8),
    [stone, planted, wetStone],
  );
  isletTop.name = "pigeonnier-planted-top";
  isletTop.position.y = -0.14;
  isletTop.scale.z = 0.76;
  root.add(isletTop);

  const foundation = new Mesh(
    new CylinderGeometry(1.34, 1.55, 0.72, 8),
    stone,
  );
  foundation.name = "pigeonnier-foundation";
  foundation.position.y = 0.42;
  foundation.rotation.y = Math.PI / 8;
  root.add(foundation);

  const postGeometry = new CylinderGeometry(0.12, 0.16, 2.6, 6);
  const posts = new InstancedMesh(postGeometry, darkTimber, 4);
  posts.name = "pigeonnier-timber-posts";
  const dummy = new Object3D();
  [
    [-0.82, 2.02, -0.7],
    [0.82, 2.02, -0.7],
    [-0.82, 2.02, 0.7],
    [0.82, 2.02, 0.7],
  ].forEach(([x, y, z], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    posts.setMatrixAt(index, dummy.matrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  root.add(posts);

  const lowerDeck = new Mesh(new BoxGeometry(2.35, 0.18, 2.05), timber);
  lowerDeck.name = "pigeonnier-lower-deck";
  lowerDeck.position.y = 1.02;
  root.add(lowerDeck);

  const loft = new Mesh(new BoxGeometry(2.25, 1.62, 1.92), timber);
  loft.name = "pigeonnier-loft";
  loft.position.y = 3.58;
  root.add(loft);

  const openings = new InstancedMesh(
    new BoxGeometry(0.3, 0.3, 0.08),
    new MeshBasicMaterial({ color: "#1e2724" }),
    6,
  );
  openings.name = "pigeonnier-openings";
  for (let index = 0; index < openings.count; index += 1) {
    const row = Math.floor(index / 3);
    const column = index % 3;
    dummy.position.set(-0.62 + column * 0.62, 3.34 + row * 0.52, 0.995);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    openings.setMatrixAt(index, dummy.matrix);
  }
  openings.instanceMatrix.needsUpdate = true;
  root.add(openings);

  const lookout = new Mesh(new BoxGeometry(2.65, 0.18, 2.28), darkTimber);
  lookout.name = "pigeonnier-lookout-deck";
  lookout.position.y = 4.48;
  root.add(lookout);

  const roof = new Mesh(new ConeGeometry(2.05, 1.12, 4), roofMaterial);
  roof.name = "pigeonnier-roof";
  roof.position.y = 5.1;
  roof.rotation.y = Math.PI / 4;
  root.add(roof);

  const signalLamp = new Mesh(
    new CylinderGeometry(0.18, 0.24, 0.48, 6),
    new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 1.8,
      roughness: 0.42,
    }),
  );
  signalLamp.name = "pigeonnier-signal-lamp";
  signalLamp.position.set(0, 5.88, 0);
  root.add(signalLamp);

  const pier = new Mesh(new BoxGeometry(3.45, 0.22, 0.95), timber);
  pier.name = "pigeonnier-ton-pier";
  pier.position.set(-3.0, -0.05, 0.35);
  root.add(pier);

  const pierPiles = new InstancedMesh(
    new CylinderGeometry(0.1, 0.14, 1.55, 6),
    darkTimber,
    4,
  );
  pierPiles.name = "pigeonnier-pier-piles";
  [
    [-1.75, -0.7, -0.02],
    [-1.75, -0.7, 0.72],
    [-4.2, -0.7, -0.02],
    [-4.2, -0.7, 0.72],
  ].forEach(([x, y, z], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    pierPiles.setMatrixAt(index, dummy.matrix);
  });
  pierPiles.instanceMatrix.needsUpdate = true;
  root.add(pierPiles);

  const anchor = createAnchor({
    detailId: pigeonnier.detailId,
    entityId: pigeonnier.id,
    kind: "pigeonnier",
    label: pigeonnier.label,
    selectionRadius: 2.7,
  });
  anchor.name = "pigeonnier-entity-anchor";
  anchor.position.y = 0.16;
  root.add(anchor);

  const dispatchAnchor = new Object3D();
  dispatchAnchor.name = "pigeonnier-dispatch-anchor";
  dispatchAnchor.position.set(0, 6.15, 0);
  root.add(dispatchAnchor);

  return { anchor, dispatchAnchor, root };
}

function createAnchor<Kind extends "grave" | "pigeonnier">(
  data: GardenLandmarkAnchorData<Kind>,
): GardenLandmarkAnchor<Kind> {
  const anchor = new Object3D() as GardenLandmarkAnchor<Kind>;
  anchor.userData = data;
  return anchor;
}

function createStoneLantern(): Group {
  const root = new Group();
  root.name = "cemetery-stone-lantern";
  const stone = new MeshStandardMaterial({
    color: "#8e9182",
    flatShading: true,
    roughness: 1,
  });
  const glow = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.8,
    roughness: 0.5,
  });
  const pedestal = new Mesh(new CylinderGeometry(0.14, 0.2, 0.72, 6), stone);
  pedestal.position.y = 0.36;
  const lamp = new Mesh(new BoxGeometry(0.34, 0.3, 0.34), glow);
  lamp.position.y = 0.86;
  const cap = new Mesh(new ConeGeometry(0.38, 0.3, 4), stone);
  cap.position.y = 1.18;
  cap.rotation.y = Math.PI / 4;
  root.add(pedestal, lamp, cap);
  return root;
}

function markerFamily(grave: GraveNode): GraveMarkerFamily {
  if (grave.visual.marker === "shattered" || grave.visual.marker === "broken-keel") {
    return "shard";
  }
  if (grave.visual.marker === "skeletal") return "pillar";
  return "tablet";
}

function irregularTerraceGeometry(
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
      + Math.sin(angle * 3 + seed) * 0.04
      + Math.sin(angle * 7 - seed) * 0.022;
    positions.setX(index, x * variation);
    positions.setZ(index, z * variation);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
