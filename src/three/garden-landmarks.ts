import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { PIGEONNIER_ROOST_VISUAL_CAP } from "../systems/pigeonnier-watch";
import {
  type GraveNode,
  type PigeonnierNode,
} from "../systems/world-types";
import { CEMETERY_CENTER } from "../systems/world-layout";
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

export interface GardenCemeteryLandmark {
  anchors: ReadonlyMap<string, GardenLandmarkAnchor<"grave">>;
  mistAnchor: Object3D;
  root: Group;
}

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

/**
 * N2 — the wreck field.
 *
 * The graveyard is no longer an islet with headstones on it: it is a stretch
 * of slack water in the south-west corner where dead stablecoins have piled
 * up as half-sunk hulls. Wreck FORM encodes `visual.marker`, which the world
 * layout derives from the coin's `causeOfDeath` — so the shape a wreck takes
 * says how it died, and says nothing at all about when, or about any live
 * coin's status. The marker names already carry the imagery; this just builds
 * what they name.
 *
 * Grouped into three degrees of decay, which decide what furniture a wreck
 * still carries:
 *
 *  - `substantial` (grounded, sinking-stern) — most of the hull, a part-
 *    standing mast with a rag of rotted sail, and the lantern still burning.
 *  - `broken` (broken-keel, skeletal) — snapped or picked to the frames, a
 *    mast stub, no light.
 *  - `remnant` (shattered) — a keel line and a mast tip, nothing more.
 */
type WreckForm = GraveNode["visual"]["marker"];
type WreckDecay = "substantial" | "broken" | "remnant";

const WRECK_FORMS: readonly WreckForm[] = [
  "grounded",
  "sinking-stern",
  "broken-keel",
  "skeletal",
  "shattered",
];

interface WreckFormSpec {
  decay: WreckDecay;
  /** Roll onto the beam, radians. A wreck never sits upright. */
  list: number;
  /** Bow-up (positive) or stern-down pitch, radians. */
  pitch: number;
  /** How far the hull's waterline sits below the sea surface. */
  sink: number;
  /** Frames still standing proud of the planking. */
  ribs: number;
  /** Mast length relative to hull length; 0 for no mast at all. */
  mast: number;
}

const WRECK_FORM_SPECS: Record<WreckForm, WreckFormSpec> = {
  // Counterparty failure: driven aground more or less whole, heeled over.
  grounded: { decay: "substantial", list: 0.42, pitch: 0.05, sink: 0.16, ribs: 3, mast: 0.85 },
  // Liquidity drain: the stern went under first and the bow still points up.
  "sinking-stern": { decay: "substantial", list: 0.3, pitch: 0.34, sink: 0.42, ribs: 3, mast: 0.7 },
  // Regulatory: the back broke. Two halves at an angle to each other.
  "broken-keel": { decay: "broken", list: 0.55, pitch: 0.1, sink: 0.36, ribs: 5, mast: 0.34 },
  // Abandoned: the planking is gone and the frames are all that is left.
  skeletal: { decay: "broken", list: 0.48, pitch: 0.08, sink: 0.44, ribs: 7, mast: 0.28 },
  // Algorithmic failure: went to pieces. A keel line and a stump.
  shattered: { decay: "remnant", list: 0.72, pitch: 0.16, sink: 0.62, ribs: 2, mast: 0.16 },
};

/**
 * Builds the wreck field at its canonical world position. Grave anchors are
 * keyed by detail id so they can be copied directly into the Three renderer's
 * entity-cue map — hit testing and the detail panel depend on that wiring, so
 * it is unchanged from the headstone era.
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

  const drownedTimber = new MeshStandardMaterial({
    color: "#4a4a44",
    flatShading: true,
    roughness: 1,
  });
  const boneTimber = new MeshStandardMaterial({
    color: "#7d7c70",
    flatShading: true,
    roughness: 1,
  });

  const anchors = new Map<string, GardenLandmarkAnchor<"grave">>();
  const gravesByForm = new Map<WreckForm, GraveNode[]>(
    WRECK_FORMS.map((form) => [form, [] as GraveNode[]]),
  );
  for (const grave of graves) {
    const localX = (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE;
    const localZ = (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE;
    const anchor = createAnchor({
      detailId: grave.detailId,
      entityId: grave.id,
      kind: "grave",
      label: grave.label,
      // A wreck is a hull, not a headstone: the pick proxy grows with it so a
      // click anywhere along the exposed timbers still selects the coin.
      selectionRadius: 1.2 + grave.visual.scale * 3,
    });
    anchor.name = `cemetery-anchor:${grave.id}`;
    anchor.position.set(localX, WATER_Y + 0.2, localZ);
    root.add(anchor);
    anchors.set(grave.detailId, anchor);
    gravesByForm.get(grave.visual.marker)?.push(grave);
  }

  // Every wreck's placement, resolved once and then shared by the hull batch
  // and by each furniture batch, so a mast is always on its own hull.
  const placements = new Map<string, Matrix4>();
  for (const grave of graves) {
    const scale = 1.5 + grave.visual.scale * 2.4;
    const spec = WRECK_FORM_SPECS[grave.visual.marker];
    const side = stableUnit(`${grave.id}.side`) > 0.5 ? 1 : -1;
    const euler = new Euler(
      side * (spec.list + (stableUnit(`${grave.id}.list`) - 0.5) * 0.22),
      stableUnit(`${grave.id}.yaw`) * Math.PI * 2,
      spec.pitch + (stableUnit(`${grave.id}.pitch`) - 0.5) * 0.16,
      // Pitch in hull space, then roll onto the beam, then yaw to the swell.
      "YXZ",
    );
    const matrix = new Matrix4().compose(
      new Vector3(
        (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE,
        WATER_Y - spec.sink * scale,
        (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE,
      ),
      new Quaternion().setFromEuler(euler),
      new Vector3(scale, scale, scale),
    );
    placements.set(grave.id, matrix);
  }

  // ---- Hulls: one batch per form -----------------------------------------
  for (const form of WRECK_FORMS) {
    const formGraves = gravesByForm.get(form) ?? [];
    if (formGraves.length === 0) continue;
    const hulls = new InstancedMesh(
      wreckHullGeometry(form),
      WRECK_FORM_SPECS[form].decay === "remnant" ? boneTimber : drownedTimber,
      formGraves.length,
    );
    hulls.name = `cemetery-wrecks-${form}`;
    hulls.castShadow = true;
    hulls.receiveShadow = true;
    formGraves.forEach((grave, index) => {
      hulls.setMatrixAt(index, placements.get(grave.id)!);
    });
    hulls.instanceMatrix.needsUpdate = true;
    root.add(hulls);
  }

  // ---- Furniture: one batch each, across every wreck ----------------------
  const partMatrix = new Matrix4();
  const local = new Matrix4();

  const ribTotal = graves.reduce(
    (sum, grave) => sum + WRECK_FORM_SPECS[grave.visual.marker].ribs,
    0,
  );
  if (ribTotal > 0) {
    const ribs = new InstancedMesh(wreckRibGeometry(), boneTimber, ribTotal);
    ribs.name = "cemetery-wreck-ribs";
    ribs.castShadow = true;
    let index = 0;
    for (const grave of graves) {
      const spec = WRECK_FORM_SPECS[grave.visual.marker];
      for (let rib = 0; rib < spec.ribs; rib += 1) {
        const along = spec.ribs === 1 ? 0 : rib / (spec.ribs - 1) - 0.5;
        const lean = (stableUnit(`${grave.id}.rib.${rib}`) - 0.5) * 0.5;
        local.makeRotationZ(lean);
        local.setPosition(along * 1.5, 0.1, 0);
        partMatrix.multiplyMatrices(placements.get(grave.id)!, local);
        ribs.setMatrixAt(index, partMatrix);
        index += 1;
      }
    }
    ribs.instanceMatrix.needsUpdate = true;
    root.add(ribs);
  }

  const masted = graves.filter((grave) => WRECK_FORM_SPECS[grave.visual.marker].mast > 0);
  if (masted.length > 0) {
    const masts = new InstancedMesh(wreckMastGeometry(), drownedTimber, masted.length);
    masts.name = "cemetery-wreck-masts";
    masts.castShadow = true;
    masted.forEach((grave, index) => {
      const spec = WRECK_FORM_SPECS[grave.visual.marker];
      // Snapped masts lean well off vertical; a standing one only slightly.
      const fall = (0.2 + (1 - spec.mast) * 1.1) * (stableUnit(`${grave.id}.fall`) > 0.5 ? 1 : -1);
      local.makeRotationZ(fall);
      local.scale(new Vector3(1, spec.mast * 2.4, 1));
      local.setPosition(0.15, 0.18, 0);
      partMatrix.multiplyMatrices(placements.get(grave.id)!, local);
      masts.setMatrixAt(index, partMatrix);
    });
    masts.instanceMatrix.needsUpdate = true;
    root.add(masts);
  }

  // Cloth: rotted sail on the substantial wrecks, and the mourning pennant
  // that used to fly on the memorial stele. One geometry, one draw; the two
  // read apart through per-instance colour.
  const clothed = graves.filter(
    (grave) => WRECK_FORM_SPECS[grave.visual.marker].decay === "substantial",
  );
  if (clothed.length > 0) {
    const cloth = new InstancedMesh(
      tatteredPennantGeometry(),
      new MeshStandardMaterial({
        color: "#ffffff",
        flatShading: true,
        roughness: 1,
        side: DoubleSide,
      }),
      clothed.length * 2,
    );
    cloth.name = "cemetery-wreck-cloth";
    const rag = new Color("#6a6a5c");
    const mourning = new Color(HARBOR_PALETTE.stone_pale);
    clothed.forEach((grave, index) => {
      const spec = WRECK_FORM_SPECS[grave.visual.marker];
      const fall = (0.2 + (1 - spec.mast) * 1.1) * (stableUnit(`${grave.id}.fall`) > 0.5 ? 1 : -1);
      // Rag of rotted sail, hanging off the standing part of the mast.
      local.makeRotationZ(fall);
      local.scale(new Vector3(1.5, 1.5, 1.5));
      local.setPosition(0.15, 0.18 + spec.mast * 1.1, 0);
      partMatrix.multiplyMatrices(placements.get(grave.id)!, local);
      cloth.setMatrixAt(index * 2, partMatrix);
      cloth.setColorAt(index * 2, rag);
      // Mourning pennant at the masthead — smaller, paler, still flying.
      local.makeRotationZ(fall);
      local.scale(new Vector3(0.7, 0.7, 0.7));
      local.setPosition(0.15, 0.18 + spec.mast * 2.1, 0);
      partMatrix.multiplyMatrices(placements.get(grave.id)!, local);
      cloth.setMatrixAt(index * 2 + 1, partMatrix);
      cloth.setColorAt(index * 2 + 1, mourning);
    });
    cloth.instanceMatrix.needsUpdate = true;
    if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
    root.add(cloth);

    // The image the whole zone is for: a lantern still burning on a dead ship.
    const lanterns = new InstancedMesh(
      new BoxGeometry(0.16, 0.2, 0.16),
      new MeshStandardMaterial({
        color: HARBOR_PALETTE.lantern_glow,
        emissive: HARBOR_PALETTE.lantern_warm,
        emissiveIntensity: 1.5,
        roughness: 0.5,
        toneMapped: false,
      }),
      clothed.length,
    );
    lanterns.name = "cemetery-wreck-lanterns";
    clothed.forEach((grave, index) => {
      local.identity();
      local.setPosition(-0.55, 0.34, 0.12);
      partMatrix.multiplyMatrices(placements.get(grave.id)!, local);
      lanterns.setMatrixAt(index, partMatrix);
    });
    lanterns.instanceMatrix.needsUpdate = true;
    root.add(lanterns);
  }

  const mistAnchor = new Object3D();
  mistAnchor.name = "cemetery-mist-anchor";
  mistAnchor.position.set(0, WATER_Y + 0.25, 0);
  root.add(mistAnchor);

  return { anchors, mistAnchor, root };
}

/**
 * A hull shell: a box bent into a hull — fine at the ends, deadrise toward
 * the keel, sheer rising fore and aft. Length runs along +X, beam along Z,
 * waterline at y = 0.
 */
function hullShell(length: number, beam: number, depth: number): BufferGeometry {
  const geometry = new BoxGeometry(length, depth, beam, 7, 2, 2);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const y = position.getY(index);
    const t = Math.abs(x) / (length / 2);
    // Fine ends, and a narrower section as the section runs down to the keel.
    const down = (depth / 2 - y) / depth;
    position.setZ(
      index,
      position.getZ(index) * Math.pow(1 - t * 0.9, 0.55) * (1 - down * 0.42),
    );
    // Sheer: the deck line lifts toward bow and stern.
    position.setY(index, y + t * t * depth * 0.42);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

/** The hull a wreck of this form has left, merged to one geometry. */
function wreckHullGeometry(form: WreckForm): BufferGeometry {
  const parts: BufferGeometry[] = [];
  switch (form) {
    case "grounded": {
      parts.push(hullShell(2.6, 0.78, 0.5));
      // Stub of bulwark still standing along one side.
      const rail = new BoxGeometry(1.7, 0.1, 0.07);
      rail.translate(-0.2, 0.3, 0.3);
      parts.push(rail);
      break;
    }
    case "sinking-stern": {
      const hull = hullShell(2.5, 0.72, 0.48);
      // Bow rides up, stern is swallowed.
      hull.rotateZ(0.18);
      parts.push(hull);
      break;
    }
    case "broken-keel": {
      // Two halves, hinged apart where the back broke.
      const fore = hullShell(1.35, 0.7, 0.46);
      fore.rotateZ(0.24);
      fore.translate(0.72, 0.06, 0);
      const aft = hullShell(1.25, 0.68, 0.44);
      aft.rotateZ(-0.3);
      aft.translate(-0.68, 0.02, 0);
      parts.push(fore, aft);
      // Splintered keel timbers spanning the break.
      for (const offset of [-0.12, 0.05, 0.2]) {
        const splinter = new BoxGeometry(0.5, 0.06, 0.06);
        splinter.rotateZ(offset * 1.6);
        splinter.translate(offset * 0.6, 0.05, offset);
        parts.push(splinter);
      }
      break;
    }
    case "skeletal": {
      // Planking gone: a keel spine and the stubs the frames stand on.
      const keel = new BoxGeometry(2.3, 0.13, 0.16);
      keel.translate(0, 0, 0);
      parts.push(keel);
      const stem = new BoxGeometry(0.12, 0.5, 0.12);
      stem.rotateZ(-0.3);
      stem.translate(1.12, 0.2, 0);
      parts.push(stem);
      break;
    }
    case "shattered": {
      // A keel line barely breaking the surface, and scattered timbers.
      const keel = new BoxGeometry(1.5, 0.1, 0.13);
      parts.push(keel);
      for (const [x, z, turn] of [[0.5, 0.28, 0.5], [-0.42, -0.3, -0.8], [0.1, 0.44, 1.2]] as const) {
        const plank = new BoxGeometry(0.42, 0.05, 0.09);
        plank.rotateY(turn);
        plank.translate(x, -0.02, z);
        parts.push(plank);
      }
      break;
    }
  }
  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`Could not merge wreck hull ${form}.`);
  return merged;
}

/** An exposed frame: a half-hoop rib standing out of the broken planking. */
function wreckRibGeometry(): BufferGeometry {
  const rib = new TorusGeometry(0.36, 0.035, 3, 7, Math.PI);
  rib.rotateY(Math.PI / 2);
  return rib;
}

/** A snapped mast, unit height so instances can scale it to what is left. */
function wreckMastGeometry(): BufferGeometry {
  const mast = new CylinderGeometry(0.032, 0.06, 1, 5);
  mast.translate(0, 0.5, 0);
  return mast;
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

  const stone = new MeshStandardMaterial({
    color: "#9b9d89",
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

  const rockMaterial = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.95,
    vertexColors: true,
  });

  const islet = new Mesh(
    createRockTerraceGeometry(2.82, 3.3, 1.2, 18, 1.8, -0.84, ROCK_TOP_WET),
    rockMaterial,
  );
  islet.name = "pigeonnier-islet";
  islet.position.y = -0.84;
  islet.scale.z = 0.76;
  islet.castShadow = true;
  islet.receiveShadow = true;
  root.add(islet);

  const isletTop = new Mesh(
    createRockTerraceGeometry(2.55, 2.85, 0.32, 16, 0.8, -0.14, ROCK_TOP_MOSS, 0.07),
    rockMaterial,
  );
  isletTop.name = "pigeonnier-planted-top";
  isletTop.position.y = -0.14;
  isletTop.scale.z = 0.76;
  isletTop.castShadow = true;
  isletTop.receiveShadow = true;
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
      toneMapped: false,
    }),
  );
  signalLamp.name = "pigeonnier-signal-lamp";
  signalLamp.position.set(0, 5.88, 0);
  root.add(signalLamp);

  // Warm dispatch glow halo — matches the ship-lantern look without a texture.
  const dispatchGlow = new Mesh(
    new SphereGeometry(0.62, 6, 5),
    new MeshBasicMaterial({
      blending: AdditiveBlending,
      color: HARBOR_PALETTE.lantern_glow,
      depthWrite: false,
      opacity: 0.32,
      toneMapped: false,
      transparent: true,
    }),
  );
  dispatchGlow.name = "pigeonnier-dispatch-glow";
  dispatchGlow.position.copy(signalLamp.position);
  root.add(dispatchGlow);

  const pier = new Mesh(new BoxGeometry(3.45, 0.22, 0.95), timber);
  pier.name = "pigeonnier-ton-pier";
  pier.position.set(-3.0, -0.05, 0.35);
  pier.rotation.y = 0.14;
  root.add(pier);

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

  const pigeonMaterial = new MeshStandardMaterial({
    color: "#777c78",
    flatShading: true,
    roughness: 0.92,
  });
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
  roostPigeons.instanceMatrix.needsUpdate = true;
  root.add(roostPigeons);

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

/** A frayed swallowtail pennant — notched edges read as wind-worn cloth. */
function tatteredPennantGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0, 0.52);
  shape.lineTo(0.64, 0.44);
  shape.lineTo(0.42, 0.29);
  shape.lineTo(0.58, 0.16);
  shape.lineTo(0.32, 0.08);
  shape.lineTo(0.44, -0.02);
  shape.lineTo(0, 0);
  shape.closePath();
  return new ShapeGeometry(shape);
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
