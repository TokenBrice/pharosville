import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { PIGEONNIER_ROOST_VISUAL_CAP } from "../systems/pigeonnier-watch";
import {
  type PigeonnierNode,
} from "../systems/world-types";
import { createRockTerraceGeometry } from "./garden-island";
const TILE_SCALE = Math.SQRT2;
const WATER_Y = -1.45;
const ROCK_TOP_WET = new Color("#33403a");
const ROCK_TOP_MOSS = new Color("#5f7350");

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

export interface GardenPigeonnierLandmark {
  anchor: GardenLandmarkAnchor<"pigeonnier">;
  dispatchAnchor: Object3D;
  moverDetailIds: readonly string[];
  moverPigeons: InstancedMesh;
  roostPigeons: InstancedMesh;
  root: Group;
  update(input: {
    moverPositions: readonly { x: number; y: number; z: number }[];
    reducedMotion: boolean;
    timeSeconds: number;
  }): void;
}

export const PIGEONNIER_MOVER_PIGEON_CAP = 5;

// Byte budget: this module's house materials repeat as object literals all
// over the pigeonnier; one tiny factory called many
// times gzips smaller than the same literal spelled out each time — the
// opposite of the usual inline-it style rule, noted where it bites.
function flatMaterial(color: string, roughness = 1): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, flatShading: true, roughness });
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

  const stone = flatMaterial("#9b9d89");
  const timber = flatMaterial(HARBOR_PALETTE.timber_mid, 0.94);
  const darkTimber = flatMaterial(HARBOR_PALETTE.timber_dark, 0.98);
  const roofMaterial = flatMaterial("#536d64", 0.86);
  roofMaterial.metalness = 0.12;

  // Byte budget: one registrar names, heights and mounts a part in a single
  // call instead of the three-statement run every part used to spell out.
  const add = (mesh: Mesh, suffix: string, y = 0, ry = 0): Mesh => {
    mesh.name = `pigeonnier-${suffix}`;
    mesh.position.y = y;
    mesh.rotation.y = ry;
    root.add(mesh);
    return mesh;
  };

  // Byte budget: the needsUpdate/mount pair every instanced batch spells
  // out, folded into one writer.
  const ready = (mesh: InstancedMesh): void => {
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
  };

  // The waterline read — a pale shoal disc, the rock terrace, and its
  // planted cap — all squashed to the same plan.
  const shoal = new Mesh(
    irregularTerraceGeometry(3.5, 3.8, 0.1, 18, 3.1),
    new MeshBasicMaterial({
      color: "#5e9e90",
      depthWrite: false,
      opacity: 0.2,
      transparent: true,
    }),
  );
  const rockMaterial = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.95,
    vertexColors: true,
  });
  const islet = new Mesh(
    createRockTerraceGeometry(2.82, 3.3, 1.2, 18, 1.8, -0.84, ROCK_TOP_WET),
    rockMaterial,
  );
  const isletTop = new Mesh(
    createRockTerraceGeometry(2.55, 2.85, 0.32, 16, 0.8, -0.14, ROCK_TOP_MOSS, 0.07),
    rockMaterial,
  );
  // Byte budget: the three waterline meshes share their dressing, so one
  // table drives it. Row: [mesh, name suffix, y, casts shadow].
  for (const [mesh, suffix, y, solid] of [
    [shoal, "shoal", WATER_Y + 0.055, false],
    [islet, "islet", -0.84, true],
    [isletTop, "planted-top", -0.14, true],
  ] as const) {
    add(mesh, suffix, y);
    mesh.scale.z = 0.76;
    mesh.castShadow = mesh.receiveShadow = solid;
  }
  shoal.renderOrder = 1;

  add(
    new Mesh(new CylinderGeometry(1.34, 1.55, 0.72, 8), stone),
    "foundation",
    0.42,
    Math.PI / 8,
  );

  const posts = new InstancedMesh(
    new CylinderGeometry(0.12, 0.16, 2.6, 6),
    darkTimber,
    4,
  );
  posts.name = "pigeonnier-timber-posts";
  const dummy = new Object3D();
  // dummy is a fresh identity here, so the pure-placement loops (posts,
  // openings) skip the rotation/scale resets the later loops need.
  [[-0.82, -0.7], [0.82, -0.7], [-0.82, 0.7], [0.82, 0.7]].forEach(([x, z], index) => {
    dummy.position.set(x, 2.02, z);
    dummy.updateMatrix();
    posts.setMatrixAt(index, dummy.matrix);
  });
  ready(posts);

  add(new Mesh(new BoxGeometry(2.35, 0.18, 2.05), timber), "lower-deck", 1.02);
  add(new Mesh(new BoxGeometry(2.25, 1.62, 1.92), timber), "loft", 3.58);

  const openings = new InstancedMesh(
    new BoxGeometry(0.3, 0.3, 0.08),
    new MeshBasicMaterial({ color: "#1e2724" }),
    6,
  );
  openings.name = "pigeonnier-openings";
  for (let index = 0; index < openings.count; index += 1) {
    dummy.position.set(
      -0.62 + (index % 3) * 0.62,
      3.34 + Math.floor(index / 3) * 0.52,
      0.995,
    );
    dummy.updateMatrix();
    openings.setMatrixAt(index, dummy.matrix);
  }
  ready(openings);

  add(new Mesh(new BoxGeometry(2.65, 0.18, 2.28), darkTimber), "lookout-deck", 4.48);
  add(new Mesh(new ConeGeometry(2.05, 1.12, 4), roofMaterial), "roof", 5.1, Math.PI / 4);
  add(
    new Mesh(new CylinderGeometry(0.18, 0.24, 0.48, 6), new MeshStandardMaterial({
      color: HARBOR_PALETTE.lantern_glow,
      emissive: HARBOR_PALETTE.lantern_warm,
      emissiveIntensity: 1.8,
      roughness: 0.42,
      toneMapped: false,
    })),
    "signal-lamp",
    5.88,
  );

  // Warm dispatch glow halo — matches the ship-lantern look without a texture.
  add(
    new Mesh(
      new SphereGeometry(0.62, 6, 5),
      new MeshBasicMaterial({
        blending: AdditiveBlending,
        color: HARBOR_PALETTE.lantern_glow,
        depthWrite: false,
        opacity: 0.32,
        toneMapped: false,
        transparent: true,
      }),
    ),
    "dispatch-glow",
    5.88,
  );

  const pier = add(new Mesh(new BoxGeometry(3.45, 0.22, 0.95), timber), "ton-pier");
  pier.position.set(-3.0, -0.05, 0.35);
  pier.rotation.y = 0.14;

  const pierPiles = new InstancedMesh(
    new CylinderGeometry(0.1, 0.14, 1.55, 6),
    darkTimber,
    3,
  );
  pierPiles.name = "pigeonnier-pier-piles";
  [
    [-1.6, -0.78, -0.12, 0.03, 1.15],
    [-2.86, -0.74, 0.77, -0.02, 1.05],
    [-4.36, -0.82, 0.37, 0.04, 1.22],
  ].forEach(([x, y, z, lean, height], index) => {
    dummy.position.set(x, y, z);
    dummy.rotation.set(0, 0.19 + index * 0.47, lean);
    dummy.scale.set(1 - index * 0.04, height, 1 + index * 0.03);
    dummy.updateMatrix();
    pierPiles.setMatrixAt(index, dummy.matrix);
  });
  ready(pierPiles);

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

  const pigeonMaterial = flatMaterial("#777c78", 0.92);
  const birdGeometry = createPigeonGeometry();
  const roostPigeons = new InstancedMesh(
    birdGeometry,
    pigeonMaterial,
    PIGEONNIER_ROOST_VISUAL_CAP,
  );
  roostPigeons.name = "pigeonnier-depeg-roost";
  roostPigeons.count = Math.min(
    pigeonnier.roost?.visualCount ?? 0,
    PIGEONNIER_ROOST_VISUAL_CAP,
  );
  for (let index = 0; index < roostPigeons.count; index += 1) {
    const row = Math.floor(index / 4);
    const column = index % 4;
    dummy.position.set(-0.72 + column * 0.48, 4.75 + row * 0.28, -0.72 + row * 0.38);
    dummy.rotation.set(0, 0.35 + index * 0.73, 0);
    dummy.scale.setScalar(0.86 + (index % 3) * 0.08);
    dummy.updateMatrix();
    roostPigeons.setMatrixAt(index, dummy.matrix);
  }
  ready(roostPigeons);

  const moverPigeons = new InstancedMesh(
    birdGeometry,
    pigeonMaterial,
    Math.min(pigeonnier.notableMovers?.length ?? 0, PIGEONNIER_MOVER_PIGEON_CAP),
  );
  moverPigeons.name = "pigeonnier-notable-mover-pigeons";
  moverPigeons.frustumCulled = false;
  moverPigeons.visible = false;
  root.add(moverPigeons);

  const update = ({ moverPositions, reducedMotion, timeSeconds }: {
    moverPositions: readonly { x: number; y: number; z: number }[];
    reducedMotion: boolean;
    timeSeconds: number;
  }): void => {
    if (reducedMotion || moverPositions.length === 0) {
      moverPigeons.visible = false;
      return;
    }
    moverPigeons.visible = true;
    moverPigeons.count = Math.min(moverPositions.length, PIGEONNIER_MOVER_PIGEON_CAP);
    for (let index = 0; index < moverPigeons.count; index += 1) {
      const target = moverPositions[index]!;
      const angle = timeSeconds * (0.24 + index * 0.018) + index * 1.73;
      const radius = 0.9 + (index % 3) * 0.18;
      dummy.position.set(
        target.x - root.position.x + Math.cos(angle) * radius,
        target.y + 3.2 + Math.sin(angle * 0.7) * 0.18,
        target.z - root.position.z + Math.sin(angle) * radius,
      );
      dummy.rotation.set(0, -angle + Math.PI / 2, Math.sin(angle * 2) * 0.08);
      dummy.scale.setScalar(0.92);
      dummy.updateMatrix();
      moverPigeons.setMatrixAt(index, dummy.matrix);
    }
    moverPigeons.instanceMatrix.needsUpdate = true;
  };

  return {
    anchor,
    dispatchAnchor,
    moverDetailIds: (pigeonnier.notableMovers ?? [])
      .slice(0, PIGEONNIER_MOVER_PIGEON_CAP)
      .map((mover) => mover.detailId),
    moverPigeons,
    roostPigeons,
    root,
    update,
  };
}

function createPigeonGeometry(): BufferGeometry {
  const body = new SphereGeometry(0.16, 5, 4);
  body.scale(1.25, 0.72, 0.75);
  const head = new SphereGeometry(0.1, 5, 4);
  head.translate(0.18, 0.12, 0);
  const leftWing = new ConeGeometry(0.13, 0.5, 3);
  leftWing.rotateZ(Math.PI / 2);
  leftWing.translate(-0.02, 0.08, 0.18);
  const rightWing = leftWing.clone();
  rightWing.scale(1, 1, -1);
  return mergeGeometries([body, head, leftWing, rightWing], false)!;
}

function createAnchor<Kind extends "grave" | "pigeonnier">(
  data: GardenLandmarkAnchorData<Kind>,
): GardenLandmarkAnchor<Kind> {
  const anchor = new Object3D() as GardenLandmarkAnchor<Kind>;
  anchor.userData = data;
  return anchor;
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
