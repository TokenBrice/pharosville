import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CAUSE_HEX } from "@shared/lib/cause-of-death";
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
 * Grouped into three silhouette families, which keep the field within three
 * draws while retaining non-colour cause reads:
 *
 *  - `substantial` (grounded, sinking-stern) — most of the hull and three ribs.
 *  - `broken-keel` — two hull halves hinged apart around five exposed frames.
 *  - `remains` (skeletal, shattered) — bare keel and seven ribs; Shattered's
 *    deeper cause pose submerges the frames until only fragments remain.
 */
type WreckForm = GraveNode["visual"]["marker"];
type WreckFamily = "substantial" | "broken-keel" | "remains";

const WRECK_FORMS: readonly WreckForm[] = [
  "grounded",
  "sinking-stern",
  "broken-keel",
  "skeletal",
  "shattered",
];

interface WreckFormSpec {
  family: WreckFamily;
  /** Roll onto the beam, radians. A wreck never sits upright. */
  list: number;
  /** Bow-up (positive) or stern-down pitch, radians. */
  pitch: number;
  /** How far the hull's waterline sits below the sea surface. */
  sink: number;
}

const WRECK_FORM_SPECS: Record<WreckForm, WreckFormSpec> = {
  // Counterparty failure: driven aground more or less whole, heeled over.
  grounded: { family: "substantial", list: 0.42, pitch: 0.05, sink: 0.16 },
  // Liquidity drain: the stern went under first and the bow still points up.
  "sinking-stern": { family: "substantial", list: 0.3, pitch: 0.34, sink: 0.42 },
  // Regulatory: the back broke. Two halves at an angle to each other.
  "broken-keel": { family: "broken-keel", list: 0.55, pitch: 0.1, sink: 0.36 },
  // Abandoned: the planking is gone and the frames are all that is left.
  skeletal: { family: "remains", list: 0.48, pitch: 0.08, sink: 0.44 },
  // Algorithmic failure: went to pieces. A keel line and a stump.
  shattered: { family: "remains", list: 0.72, pitch: 0.16, sink: 0.62 },
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

  const anchors = new Map<string, GardenLandmarkAnchor<"grave">>();
  for (const grave of graves) {
    const anchor = createAnchor({
      detailId: grave.detailId,
      entityId: grave.id,
      kind: "grave",
      label: grave.label,
      selectionRadius: 1.2 + grave.visual.scale * 3,
    });
    anchor.name = `cemetery-anchor:${grave.id}`;
    anchor.position.set(
      (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE,
      WATER_Y + 0.2,
      (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE,
    );
    root.add(anchor);
    anchors.set(grave.detailId, anchor);
  }

  // W2a: seven structural memories UP; the one-hull-per-record field and its
  // cloth/lantern furniture DOWN. Every grave retains its anchor and DOM row,
  // while deterministic representatives carry the available cause forms and
  // colours across one dark, still pool.
  const representatives = representativeWrecks(graves, 7);
  if (representatives.length > 0) {
    const wreckMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      flatShading: true,
      roughness: 1,
      vertexColors: true,
    });
    // Geometry colour is the bleached spar colour; instance colour is the
    // cause colour. `causeMask` selects between them, so colour remains a
    // redundant channel while the three family silhouettes do the first read.
    wreckMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <color_pars_vertex>",
          "#include <color_pars_vertex>\nattribute float causeMask;",
        )
        .replace(
          "#include <color_vertex>",
          `#include <color_vertex>
#if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
  vColor.rgb = mix(color.rgb, instanceColor.rgb, causeMask);
#endif`,
        );
    };
    wreckMaterial.customProgramCacheKey = () => "cemetery-wreck-cause-mask-v1";

    const placement = new Matrix4();
    for (const family of ["substantial", "broken-keel", "remains"] as const) {
      const familyWrecks = representatives.filter(
        (grave) => WRECK_FORM_SPECS[grave.visual.marker].family === family,
      );
      if (familyWrecks.length === 0) continue;
      const wrecks = new InstancedMesh(
        wreckFamilyGeometry(family),
        wreckMaterial,
        familyWrecks.length,
      );
      wrecks.name = `cemetery-wrecks-${family}`;
      wrecks.castShadow = true;
      wrecks.receiveShadow = true;
      for (let index = 0; index < familyWrecks.length; index += 1) {
        const grave = familyWrecks[index]!;
        const spec = WRECK_FORM_SPECS[grave.visual.marker];
        const scale = 2.2 + grave.visual.scale * 3.2;
        const localX = (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE;
        const localZ = (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE;
        const side = stableUnit(`${grave.id}.side`) > 0.5 ? 1 : -1;
        const fanYaw = Math.atan2(localZ, localX)
          + (stableUnit(`${grave.id}.fan`) - 0.5) * 0.42;
        const euler = new Euler(
          side * (spec.list + (stableUnit(`${grave.id}.list`) - 0.5) * 0.22),
          fanYaw,
          spec.pitch + (stableUnit(`${grave.id}.pitch`) - 0.5) * 0.16,
          "YXZ",
        );
        placement.compose(
          new Vector3(localX, WATER_Y - spec.sink * scale * 0.58, localZ),
          new Quaternion().setFromEuler(euler),
          new Vector3(scale, scale, scale),
        );
        wrecks.setMatrixAt(index, placement);
        wrecks.setColorAt(index, new Color(CAUSE_HEX[grave.entry.causeOfDeath]));
      }
      wrecks.instanceMatrix.needsUpdate = true;
      if (wrecks.instanceColor) wrecks.instanceColor.needsUpdate = true;
      root.add(wrecks);
    }
  }

  const mistAnchor = new Object3D();
  mistAnchor.name = "cemetery-mist-anchor";
  mistAnchor.position.set(0, WATER_Y + 0.25, 0);
  root.add(mistAnchor);
  return { anchors, mistAnchor, root };
}

function representativeWrecks(
  graves: readonly GraveNode[],
  maximum: number,
): GraveNode[] {
  if (graves.length <= maximum) return [...graves];
  const chosen: GraveNode[] = [];
  const chosenIds = new Set<string>();
  for (const form of WRECK_FORMS) {
    const candidate = graves
      .filter((grave) => grave.visual.marker === form)
      .sort((left, right) => stableUnit(`${left.id}.representative`)
        - stableUnit(`${right.id}.representative`))[0];
    if (candidate) {
      chosen.push(candidate);
      chosenIds.add(candidate.id);
    }
  }
  const remaining = graves
    .filter((grave) => !chosenIds.has(grave.id))
    .sort((left, right) => stableUnit(`${left.id}.representative`)
      - stableUnit(`${right.id}.representative`));
  for (const grave of remaining) {
    if (chosen.length >= maximum) break;
    chosen.push(grave);
  }
  return chosen.slice(0, maximum);
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

/** Three silhouettes, each including its ribs/hull and one bleached spar. */
function wreckFamilyGeometry(family: WreckFamily): BufferGeometry {
  const causeParts: BufferGeometry[] = [];
  const paleParts: BufferGeometry[] = [];
  if (family === "substantial") {
    causeParts.push(hullShell(2.7, 0.76, 0.48));
    addWreckRibs(causeParts, 3, 1.45);
  } else if (family === "broken-keel") {
    const fore = hullShell(1.35, 0.7, 0.46);
    fore.rotateZ(0.24);
    fore.translate(0.72, 0.06, 0);
    const aft = hullShell(1.25, 0.68, 0.44);
    aft.rotateZ(-0.3);
    aft.translate(-0.68, 0.02, 0);
    causeParts.push(fore, aft);
    addWreckRibs(causeParts, 5, 1.65);
  } else {
    const keel = new BoxGeometry(2.3, 0.13, 0.16);
    const stem = new BoxGeometry(0.12, 0.5, 0.12);
    stem.rotateZ(-0.3);
    stem.translate(1.12, 0.2, 0);
    causeParts.push(keel, stem);
    addWreckRibs(causeParts, 7, 1.8);
  }
  const spar = new CylinderGeometry(0.032, 0.065, family === "substantial" ? 1.8 : 1.1, 5);
  spar.translate(0.12, family === "substantial" ? 1.0 : 0.62, 0);
  spar.rotateZ(family === "broken-keel" ? 0.92 : 0.48);
  paleParts.push(spar);

  for (const part of causeParts) markWreckPart(part, "#ffffff", 1);
  for (const part of paleParts) markWreckPart(part, "#b2ad98", 0);
  const merged = mergeGeometries([...causeParts, ...paleParts], false);
  if (!merged) throw new Error(`Could not merge cemetery wreck family ${family}.`);
  return merged;
}

function addWreckRibs(parts: BufferGeometry[], count: number, span: number): void {
  for (let rib = 0; rib < count; rib += 1) {
    const frame = new TorusGeometry(0.36, 0.035, 3, 7, Math.PI);
    frame.rotateY(Math.PI / 2);
    frame.rotateZ((rib - (count - 1) / 2) * 0.035);
    frame.translate((rib / Math.max(1, count - 1) - 0.5) * span, 0.12, 0);
    parts.push(frame);
  }
}

function markWreckPart(geometry: BufferGeometry, colorValue: string, causeMask: number): void {
  const count = geometry.getAttribute("position").count;
  const color = new Color(colorValue);
  const colors = new Float32Array(count * 3);
  const masks = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    color.toArray(colors, index * 3);
    masks[index] = causeMask;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("causeMask", new Float32BufferAttribute(masks, 1));
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
