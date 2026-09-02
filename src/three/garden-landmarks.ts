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
  InstancedBufferAttribute,
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
 *  - `broken-keel` — two hull halves hinged apart around four exposed frames.
 *  - `bare-remains` (skeletal, shattered) — only a keel, stem, and five ribs.
 *
 * Each family is 60–80% submerged; a low stone, two fallen spars, and a silt
 * stain make every representative read as one grave rather than one hero ship.
 */
type WreckForm = GraveNode["visual"]["marker"];
type WreckFamily = "substantial" | "broken-keel" | "bare-remains";

const WRECK_FORMS: readonly WreckForm[] = [
  "grounded",
  "sinking-stern",
  "broken-keel",
  "skeletal",
  "shattered",
];

interface WreckFamilySpec {
  /** Roll baked into the hull alone; the grave stone and silt remain level. */
  list: number;
  /** Bow-up pitch baked into the hull alone. */
  pitch: number;
  /** Fraction of the hull silhouette's vertical extent below the waterline. */
  sinkFraction: number;
}

const WRECK_FAMILY_FOR_FORM: Record<WreckForm, WreckFamily> = {
  grounded: "substantial",
  "sinking-stern": "substantial",
  "broken-keel": "broken-keel",
  skeletal: "bare-remains",
  shattered: "bare-remains",
};

const WRECK_FAMILY_SPECS: Record<WreckFamily, WreckFamilySpec> = {
  substantial: { list: 0.22, pitch: 0.04, sinkFraction: 0.6 },
  "broken-keel": { list: 0.3, pitch: 0.08, sinkFraction: 0.67 },
  "bare-remains": { list: 0.36, pitch: 0.11, sinkFraction: 0.76 },
};

// Review at zoom 1.0 is the authority here: this produces a 40–60px nominal
// boat read across the three families. It remains far below the hero fleet's
// tall sail mass, while the input scale still orders individual graves.
const WRECK_SCALE_CAP = 2;
const WRECK_SCALE_BASE = 1.55;
const WRECK_SCALE_FROM_GRAVE = 0.9;
const WRECK_PIXEL_SCALE_AT_ZOOM_ONE = 10.5;

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
    // Vertex colour owns every grey, bleached, stone, and silt surface.
    // Instance colour reaches only the tiny marker/stain vertices selected by
    // `causeMask`; the hull can therefore never become a cause-coloured hero.
    wreckMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <color_pars_vertex>",
          `#include <color_pars_vertex>
attribute float causeMask;
attribute float poolMask;
attribute float poolVisible;`,
        )
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
transformed *= mix(1.0, poolVisible, poolMask);`,
        )
        .replace(
          "#include <color_vertex>",
          `#include <color_vertex>
#if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
  vColor.rgb = mix(color.rgb, instanceColor.rgb, causeMask);
#endif`,
        );
    };
    wreckMaterial.customProgramCacheKey = () => "cemetery-wreckyard-marker-pool-v3";

    const placement = new Matrix4();
    const poolOwner = representatives[0]!;
    for (const family of ["substantial", "broken-keel", "bare-remains"] as const) {
      const familyWrecks = representatives.filter(
        (grave) => WRECK_FAMILY_FOR_FORM[grave.visual.marker] === family,
      );
      if (familyWrecks.length === 0) continue;
      const poolOwnerIndex = familyWrecks.findIndex((grave) => grave.id === poolOwner.id);
      const poolOwnerPlacement = poolOwnerIndex >= 0 ? wreckPlacement(poolOwner) : null;
      const geometry = wreckFamilyGeometry(family, poolOwnerPlacement);
      const poolVisibility = new Float32Array(familyWrecks.length);
      if (poolOwnerIndex >= 0) poolVisibility[poolOwnerIndex] = 1;
      geometry.setAttribute("poolVisible", new InstancedBufferAttribute(poolVisibility, 1));
      const wrecks = new InstancedMesh(
        geometry,
        wreckMaterial,
        familyWrecks.length,
      );
      wrecks.name = `cemetery-wrecks-${family}`;
      wrecks.castShadow = true;
      wrecks.receiveShadow = true;
      wrecks.userData = {
        causeColorRole: "marker-stain-only",
        graveIds: familyWrecks.map((grave) => grave.id),
        hullScaleCap: WRECK_SCALE_CAP,
        hullScales: familyWrecks.map((grave) => wreckScale(grave.visual.scale)),
        nominalPixelLengths: familyWrecks.map((grave) => (
          geometry.userData.hullLength * wreckScale(grave.visual.scale)
            * WRECK_PIXEL_SCALE_AT_ZOOM_ONE
        )),
        poolOwnerId: poolOwnerIndex >= 0 ? poolOwner.id : null,
        sinkFractions: familyWrecks.map(() => WRECK_FAMILY_SPECS[family].sinkFraction),
      };
      for (let index = 0; index < familyWrecks.length; index += 1) {
        const grave = familyWrecks[index]!;
        const authored = wreckPlacement(grave);
        placement.compose(
          new Vector3(authored.x, WATER_Y, authored.z),
          new Quaternion().setFromEuler(new Euler(0, authored.yaw, 0)),
          new Vector3(authored.scale, authored.scale, authored.scale),
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

function wreckScale(graveScale: number): number {
  return Math.min(WRECK_SCALE_CAP, WRECK_SCALE_BASE + graveScale * WRECK_SCALE_FROM_GRAVE);
}

interface WreckPlacement {
  scale: number;
  x: number;
  yaw: number;
  z: number;
}

function wreckPlacement(grave: GraveNode): WreckPlacement {
  const x = (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE;
  const z = (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE;
  return {
    scale: wreckScale(grave.visual.scale),
    x,
    yaw: Math.atan2(z, x) + (stableUnit(`${grave.id}.fan`) - 0.5) * 0.72,
    z,
  };
}

function representativeWrecks(
  graves: readonly GraveNode[],
  maximum: number,
): GraveNode[] {
  if (graves.length <= maximum) return [...graves];
  const chosen: GraveNode[] = [];
  const chosenIds = new Set<string>();
  for (const form of WRECK_FORMS) {
    const candidate = mostSeparatedRepresentative(
      graves.filter((grave) => grave.visual.marker === form),
      chosen,
    );
    if (candidate) {
      chosen.push(candidate);
      chosenIds.add(candidate.id);
    }
  }
  const remaining = graves.filter((grave) => !chosenIds.has(grave.id));
  while (chosen.length < maximum && remaining.length > 0) {
    const grave = mostSeparatedRepresentative(remaining, chosen)!;
    chosen.push(grave);
    remaining.splice(remaining.findIndex((candidate) => candidate.id === grave.id), 1);
  }
  return chosen.slice(0, maximum);
}

/**
 * Chooses real grave anchors, never decorative offsets, but favours the anchor
 * furthest from those already shown. The tiny stable-id tiebreak keeps the
 * result invariant under API ordering while preventing seven readable boats
 * from collapsing into four overlapping piles.
 */
function mostSeparatedRepresentative(
  candidates: readonly GraveNode[],
  chosen: readonly GraveNode[],
): GraveNode | undefined {
  return [...candidates].sort((left, right) => {
    const score = (grave: GraveNode) => {
      const separation = chosen.length === 0
        ? 0
        : Math.min(...chosen.map((other) => Math.hypot(
          grave.tile.x - other.tile.x,
          grave.tile.y - other.tile.y,
        )));
      return separation + stableUnit(`${grave.id}.representative`) * 0.001;
    };
    return score(right) - score(left) || left.id.localeCompare(right.id);
  })[0];
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

/**
 * Three quiet grave silhouettes, each baked into one instanced geometry.
 *
 * Common furniture — two fallen spars, a motionless silt oval, and a low
 * stone with its tiny cause stain — is merged into the family hull. One family
 * also carries the single cluster-wide silt disc, hidden on every instance but
 * its deterministic owner through `poolVisible`. That keeps
 * the complete cemetery at three draws instead of charging a draw for every
 * grave or every prop. `wreckRole` is a test/diagnostic contract: 0 decor,
 * 1 submerged hull mass, 2 the only cause-coloured marker, 3 the readable
 * gunwale/rib/stump silhouette, and 4 the taller stone marker.
 */
function wreckFamilyGeometry(
  family: WreckFamily,
  poolOwner: WreckPlacement | null,
): BufferGeometry {
  const bodyParts: BufferGeometry[] = [];
  const silhouetteParts: BufferGeometry[] = [];
  let hullLength: number;
  if (family === "substantial") {
    hullLength = 2.8;
    bodyParts.push(hullShell(hullLength, 0.82, 0.56));
    addGunwale(silhouetteParts, hullLength, 0.39);
    addReadableRibs(silhouetteParts, 3, 1.5, 0.42);
    silhouetteParts.push(wreckStump(1.3, 0.56, -0.18));
  } else if (family === "broken-keel") {
    hullLength = 2.75;
    const fore = hullShell(1.42, 0.74, 0.5);
    fore.rotateZ(0.24);
    fore.translate(0.75, 0.06, 0);
    const aft = hullShell(1.32, 0.72, 0.48);
    aft.rotateZ(-0.3);
    aft.translate(-0.72, 0.02, 0);
    bodyParts.push(fore, aft);
    const foreRail = new BoxGeometry(1.32, 0.09, 0.09);
    foreRail.rotateZ(0.24);
    foreRail.translate(0.77, 0.14, 0.34);
    const aftRail = new BoxGeometry(1.22, 0.09, 0.09);
    aftRail.rotateZ(-0.3);
    aftRail.translate(-0.73, 0.12, -0.33);
    silhouetteParts.push(foreRail, aftRail);
    addReadableRibs(silhouetteParts, 4, 1.55, 0.4);
    silhouetteParts.push(wreckStump(-1.22, 0.5, 0.24));
  } else {
    hullLength = 2.45;
    bodyParts.push(new BoxGeometry(hullLength, 0.16, 0.18));
    addReadableRibs(silhouetteParts, 5, 1.82, 0.44);
    silhouetteParts.push(wreckStump(1.12, 0.48, -0.3));
  }

  const spec = WRECK_FAMILY_SPECS[family];
  const hullPose = new Matrix4().makeRotationFromEuler(new Euler(spec.list, 0, spec.pitch));
  for (const part of bodyParts) part.applyMatrix4(hullPose);
  sinkHullToWaterline(bodyParts, spec.sinkFraction);

  const stoneBase = new BoxGeometry(0.62, 0.18, 0.48);
  stoneBase.rotateY(-0.18);
  stoneBase.translate(-1.08, 0.02, -0.82);
  const stone = new BoxGeometry(0.36, 0.82, 0.26);
  stone.rotateY(-0.18);
  stone.translate(-1.08, 0.43, -0.82);

  const stain = new CylinderGeometry(0.12, 0.135, 0.045, 7);
  stain.translate(-1.08, 0.86, -0.82);

  const spars = [
    fallenSpar(2.15, -0.1, 0.12, 0.66, 1.08),
    fallenSpar(1.65, 0.48, 0.09, -0.72, -0.52),
  ];

  const parts = [...bodyParts, ...silhouetteParts, stoneBase, stone, ...spars, stain];
  const bodyColor = family === "substantial" ? "#a8aa9f" : "#999d96";
  for (const part of bodyParts) markWreckPart(part, bodyColor, 0, 1);
  for (const part of silhouetteParts) markWreckPart(part, "#c4c0aa", 0, 3);
  markWreckPart(stoneBase, "#626b68", 0, 4);
  markWreckPart(stone, "#747d79", 0, 4);
  for (const spar of spars) markWreckPart(spar, "#b8b4a1", 0, 0);
  markWreckPart(stain, "#ffffff", 1, 2);

  if (poolOwner) parts.push(clusterSiltPool(poolOwner));
  const pool = parts.at(-1)!;
  if (poolOwner) markWreckPart(pool, "#314842", 0, 0, 1);

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`Could not merge cemetery wreck family ${family}.`);
  merged.userData = {
    aboveWaterCue: family === "substantial"
      ? "intact-gunwale"
      : family === "broken-keel" ? "angled-halves" : "ribs-only",
    causeColorRole: "marker-stain-only",
    family,
    hasClusterPool: Boolean(poolOwner),
    hullLength,
    sinkFraction: spec.sinkFraction,
    waterlineY: 0,
  };
  return merged;
}

/** One low-contrast pool, inverse-authored so its sole visible instance lands at the cluster origin. */
function clusterSiltPool(owner: WreckPlacement): BufferGeometry {
  const localCenter = new Vector3(-owner.x, 0, -owner.z)
    .applyAxisAngle(new Vector3(0, 1, 0), -owner.yaw)
    .divideScalar(owner.scale);
  const pool = new CylinderGeometry(10.2 / owner.scale, 10.5 / owner.scale, 0.025, 32);
  pool.scale(1, 1, 0.74);
  pool.translate(localCenter.x, -0.025 / owner.scale, localCenter.z);
  return pool;
}

function addGunwale(parts: BufferGeometry[], length: number, halfBeam: number): void {
  for (const z of [-halfBeam, halfBeam]) {
    const rail = new BoxGeometry(length, 0.09, 0.09);
    rail.translate(0, 0.14, z);
    parts.push(rail);
  }
}

function wreckStump(x: number, height: number, rake: number): BufferGeometry {
  const stump = new BoxGeometry(0.14, height, 0.16);
  stump.rotateZ(rake);
  stump.translate(x, height * 0.42, 0);
  return stump;
}

/** Places a complete posed hull so the requested share of its height is wet. */
function sinkHullToWaterline(parts: BufferGeometry[], sinkFraction: number): void {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const part of parts) {
    part.computeBoundingBox();
    minY = Math.min(minY, part.boundingBox!.min.y);
    maxY = Math.max(maxY, part.boundingBox!.max.y);
  }
  const localWaterline = minY + (maxY - minY) * sinkFraction;
  for (const part of parts) part.translate(0, -localWaterline, 0);
}

/** A snapped spar lying in the silt rather than making the wreck a mast hero. */
function fallenSpar(
  length: number,
  x: number,
  y: number,
  z: number,
  yaw: number,
): BufferGeometry {
  const spar = new CylinderGeometry(0.035, 0.052, length, 5);
  spar.rotateZ(Math.PI / 2 - 0.08);
  spar.rotateY(yaw);
  spar.translate(x, y, z);
  return spar;
}

function addReadableRibs(
  parts: BufferGeometry[],
  count: number,
  span: number,
  radius: number,
): void {
  for (let rib = 0; rib < count; rib += 1) {
    const frame = new TorusGeometry(radius, 0.055, 4, 8, Math.PI);
    frame.rotateY(Math.PI / 2);
    frame.rotateZ((rib - (count - 1) / 2) * 0.035);
    frame.translate((rib / Math.max(1, count - 1) - 0.5) * span, 0.2, 0);
    parts.push(frame);
  }
}

function markWreckPart(
  geometry: BufferGeometry,
  colorValue: string,
  causeMask: number,
  wreckRole: 0 | 1 | 2 | 3 | 4,
  poolMask = 0,
): void {
  const count = geometry.getAttribute("position").count;
  const color = new Color(colorValue);
  const colors = new Float32Array(count * 3);
  const masks = new Float32Array(count);
  const roles = new Float32Array(count);
  const poolMasks = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    color.toArray(colors, index * 3);
    masks[index] = causeMask;
    roles[index] = wreckRole;
    poolMasks[index] = poolMask;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("causeMask", new Float32BufferAttribute(masks, 1));
  geometry.setAttribute("wreckRole", new Float32BufferAttribute(roles, 1));
  geometry.setAttribute("poolMask", new Float32BufferAttribute(poolMasks, 1));
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
