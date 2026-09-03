import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
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
  Shape,
  ShapeGeometry,
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
 * N2 — the wreck field, redone as a QUIET GRAVEYARD (third rejection round).
 *
 * A stretch of slack water in the south-west corner where dead stablecoins
 * lie as half-sunk hulls. Wreck FORM encodes `visual.marker`, which the world
 * layout derives from the coin's `causeOfDeath` — the shape says how it died
 * and nothing about any live coin. The operator rejected both earlier reads:
 * seven pale props in an empty pool (too empty, too generic) and all ~89
 * graves rendered (one near-white mound with a mast forest and confetti).
 * The composition contract that governs the fleet governs this zone too:
 * the emptiness between groups is a positive element, and uniformity — an
 * even mound of hulls — is the failure mode.
 *
 * So the field renders a deliberately UNEVEN few: three or four loose groups
 * of hulls around the shoal, recruited deterministically from the largest
 * graves, with clearly open water between them and the whole north half of
 * the shoal left bare. One hero — the largest substantial hull, at the heart,
 * carrying the single lantern — makes the zone a place; the rest are
 * subordinate. Every grave keeps its invisible selectable anchor, so DOM
 * parity and hit testing are unchanged.
 *
 * The hulls are DARK and waterlogged — drowned and weathered timber, with a
 * bone-pale tone reserved for exposed ribs, stems and broken frames — so the
 * field sits below the water's luminance instead of glowing against it (the
 * chalk tones of the rejected rewrite are gone). At most a third of the
 * rendered wrecks carry a standing (always leaning) mast; the rest keep a
 * stump, a snapped spar in the water, or nothing. Cause colour survives only
 * as a small desaturated stain painted on each grave's marker stone, never
 * on a hull.
 */
type WreckForm = GraveNode["visual"]["marker"];
type WreckFamily = "substantial" | "broken-keel" | "bare-remains";

interface WreckFormSpec {
  /** The three-family reading contract: detail panel, legend and ledger name these. */
  family: WreckFamily;
  /** Roll floor onto the beam, radians. A wreck never sits upright. */
  list: number;
  /** Bow-up (positive) or stern-down pitch floor, radians. */
  pitch: number;
  /** Fraction of the hull silhouette's vertical extent below the waterline. */
  sinkFraction: number;
  /** Frames still standing proud of the planking, instanced per rib. */
  ribs: number;
  /** Standing-mast length as a fraction of the spar, for the wrecks that keep one. */
  mast: number;
  /** Authored plan length — drives the nominal pixel read at zoom 1. */
  hullLength: number;
}

// Byte budget: five object literals with seven named keys each minify and
// gzip far worse than one tuple table read by a single loop, so each row
// below carries the `WreckFormSpec` columns in order:
// [form, family, list, pitch, sinkFraction, ribs, mast, hullLength].
const WRECK_FORM_TABLE: readonly (readonly [
  WreckForm,
  WreckFamily,
  number,
  number,
  number,
  number,
  number,
  number,
])[] = [
  // Counterparty failure: driven aground more or less whole, heeled over.
  ["grounded", "substantial", 0.3, 0.05, 0.62, 3, 0.55, 2.8],
  // Liquidity drain: the stern went under first and the bow still points up.
  ["sinking-stern", "substantial", 0.26, 0.3, 0.72, 3, 0.46, 2.6],
  // Regulatory: the back broke. Two halves at an angle to each other.
  ["broken-keel", "broken-keel", 0.42, 0.1, 0.67, 5, 0.28, 2.75],
  // Abandoned: the planking is gone and the frames are all that is left.
  ["skeletal", "bare-remains", 0.46, 0.08, 0.76, 7, 0.2, 2.3],
  // Algorithmic failure: went to pieces. A keel line, a stump, scattered planks.
  ["shattered", "bare-remains", 0.58, 0.14, 0.78, 2, 0.12, 2.1],
];

const WRECK_FORMS: readonly WreckForm[] = WRECK_FORM_TABLE.map(([form]) => form);

const WRECK_FORM_SPECS = {} as Record<WreckForm, WreckFormSpec>;
for (const [
  form,
  family,
  list,
  pitch,
  sinkFraction,
  ribs,
  mast,
  hullLength,
] of WRECK_FORM_TABLE) {
  WRECK_FORM_SPECS[form] = { family, list, pitch, sinkFraction, ribs, mast, hullLength };
}

// Review at zoom 1.0 is the authority here: this produces a 40–60px nominal
// boat read across the five forms (the hero reads larger, on purpose). It
// remains far below the hero fleet's tall sail mass, while the input scale
// still orders individual graves.
const WRECK_SCALE_CAP = 2;
const WRECK_SCALE_BASE = 1.55;
const WRECK_SCALE_FROM_GRAVE = 0.9;
const WRECK_PIXEL_SCALE_AT_ZOOM_ONE = 10.5;

// The hero: one clearly largest wreck at the shoal heart carrying the single
// burning lantern. The boost applies to the field's chosen substantial hull;
// its cap stays far below the live fleet's sail mass and the harbor roofs.
const WRECK_HERO_SCALE_BOOST = 1.33;
const WRECK_HERO_SCALE_CAP = 2.6;

// Standing-mast length in local units. Was 2.4 with tall fractions — the
// mast forest was the worst read of the rejected rewrite, so both the count
// (see the mast budget in `addWreckFurnitureBatches`) and the height are cut.
const WRECK_MAST_LENGTH = 1.7;

// Population: a quiet graveyard, not a mound. Fields at or below the ceiling
// are already sparse enough to render whole (small ledgers, test fixtures);
// anything larger is curated down to the group plan below, choosing the
// largest-value graves deterministically per grave id and tile.
const WRECK_QUIET_CEILING = 22;

// The group plan: four loose groups around the shoal with clearly open
// water between them. The hero group sits at the heart (where the static
// `cemetery-lantern` light lane lives); the others rim it west, east and
// south, leaving the whole north half of the shoal as bare quiet water —
// the dark region the blurred-frame audit needs. Offsets are in tiles from
// CEMETERY_CENTER; sizes sum to 18 wrecks.
const WRECK_GROUP_SEEDS: readonly (readonly [number, number])[] = [
  [0.5, -0.5],
  [-8.9, 0.2],
  [9.6, 0.5],
  [3.0, 7.0],
];
const WRECK_GROUP_SIZES: readonly number[] = [5, 4, 4, 5];

// Drowned-timber palette. The rejected rewrite's chalk tones (#a8aa9f,
// #999d96, #c4c0aa, #b8b4a1) are gone: the field must sit at or below the
// surrounding water's luminance, reading waterlogged, not bleached.
const WRECK_TIMBER_DROWNED = "#4a4a44";
const WRECK_TIMBER_WEATHERED = "#5d5b52";
/** Bone-pale is reserved for exposed ribs, stems and broken frames — never whole hulls. */
const WRECK_TIMBER_BONE = "#7d7c70";
const WRECK_TIMBER_SPAR = "#55544b";
const WRECK_STONE_BASE = "#565e5b";
const WRECK_STONE = "#6a716d";

// The cause stain is a painted mark on a grave marker, not a bright dot on
// the water: cause hue is pulled most of the way toward the marker stone so
// the lifecycle reading survives without confetti.
export const WRECK_STAIN_STONE = WRECK_STONE;
export const WRECK_STAIN_DESATURATION = 0.62;

// The one still-burning lantern sits at the island path punctuation tier —
// below the harbour window ember (1.6, garden-harbor-batch) and every dock
// lamp head (1.5), and far below the Pharos beacon, which stays the only
// dominant light in the scene.
const WRECK_LANTERN_EMBER_INTENSITY = 1.15;

// Byte budget: this module's house materials repeat as object literals all
// over the wreck field and the pigeonnier; one tiny factory called many
// times gzips smaller than the same literal spelled out each time — the
// opposite of the usual inline-it style rule, noted where it bites.
function flatMaterial(color: string, roughness = 1): MeshStandardMaterial {
  return new MeshStandardMaterial({ color, flatShading: true, roughness });
}

/**
 * The scene's two warm lamps (the hero wreck's lantern and the pigeonnier
 * signal lamp) must stay in lockstep on this glow/warm/tone-mapped recipe —
 * both sit below the harbour window ember tier, and the palette pairing is
 * a pinned test contract, not a per-site choice.
 */
function lanternMaterial(emissiveIntensity: number, roughness: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity,
    roughness,
    toneMapped: false,
  });
}

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

  // The quiet graveyard: a deliberately uneven few — three or four loose
  // groups of the largest graves, plus one hero hull — recruited
  // deterministically from the ledger. This displaces both rejected reads:
  // the seven-representative compression and the all-~89 mound. Every grave
  // keeps its invisible anchor above, so DOM parity and hit testing are
  // exactly as before.
  const { field, heroId } = selectQuietWreckField(graves);
  root.userData = { heroGraveId: heroId };
  const fieldMaxScale = field.length > 0
    ? Math.max(...field.map((grave) => wreckScale(grave.visual.scale)))
    : 0;
  if (field.length > 0) {
    const poses = new Map<string, Matrix4>();
    for (const grave of field) {
      poses.set(grave.id, wreckPose(grave, grave.id === heroId, fieldMaxScale));
    }

    const wreckMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      flatShading: true,
      roughness: 1,
      vertexColors: true,
    });
    // Vertex colour owns every drowned, weathered, bone, stone and spar
    // surface. Instance colour reaches only the tiny marker/stain vertices
    // selected by `causeMask`; the hull can therefore never become a
    // cause-coloured hero.
    wreckMaterial.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <color_pars_vertex>",
          `#include <color_pars_vertex>
attribute float causeMask;`,
        )
        .replace(
          "#include <color_vertex>",
          `#include <color_vertex>
#if defined( USE_COLOR ) && defined( USE_INSTANCING_COLOR )
  vColor.rgb = mix(color.rgb, instanceColor.rgb, causeMask);
#endif`,
        );
    };
    wreckMaterial.customProgramCacheKey = () => "cemetery-wreckyard-marker-v4";

    for (const form of WRECK_FORMS) {
      const formGraves = field.filter((grave) => grave.visual.marker === form);
      if (formGraves.length === 0) continue;
      const geometry = wreckFormGeometry(form);
      const wrecks = new InstancedMesh(
        geometry,
        wreckMaterial,
        formGraves.length,
      );
      wrecks.name = `cemetery-wrecks-${form}`;
      wrecks.castShadow = wrecks.receiveShadow = true;
      wrecks.userData = {
        causeColorRole: "marker-stain-only",
        graveIds: formGraves.map((grave) => grave.id),
        hullScales: formGraves.map((grave) => renderedWreckScale(grave, grave.id === heroId, fieldMaxScale)),
        hullScaleCap: WRECK_SCALE_CAP,
        nominalPixelLengths: formGraves.map((grave) => (
          geometry.userData.hullLength * renderedWreckScale(grave, grave.id === heroId, fieldMaxScale)
            * WRECK_PIXEL_SCALE_AT_ZOOM_ONE
        )),
      };
      for (let index = 0; index < formGraves.length; index += 1) {
        const grave = formGraves[index]!;
        wrecks.setMatrixAt(index, poses.get(grave.id)!);
        wrecks.setColorAt(index, causeStainColor(grave.entry.causeOfDeath));
      }
      wrecks.instanceMatrix.needsUpdate = true;
      if (wrecks.instanceColor) wrecks.instanceColor.needsUpdate = true;
      root.add(wrecks);
    }

    addWreckFurnitureBatches(root, field, poses, heroId);

    // An irregular silt stain under the wrecks — two offset lobes with
    // harmonic outlines, deliberately NOT a concentric ring: the old cluster
    // pool read as a target decal on the water.
    const silt = new Mesh(irregularSiltPatch(), flatMaterial("#2f443c"));
    silt.name = "cemetery-silt-patch";
    silt.position.set(0, WATER_Y - 0.03, 0);
    root.add(silt);
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

/**
 * Rendered scale: grave value, with the one hero hull boosted to lead the
 * zone. The boost rides on the LARGEST subordinate scale, so the hero is
 * clearly the largest wreck even when the heart-nearest grave is not the
 * biggest value — one focal point, rest subordinate.
 */
function renderedWreckScale(grave: GraveNode, isHero: boolean, fieldMaxScale: number): number {
  if (!isHero) return wreckScale(grave.visual.scale);
  return Math.min(
    WRECK_HERO_SCALE_CAP,
    Math.max(wreckScale(grave.visual.scale), fieldMaxScale) * WRECK_HERO_SCALE_BOOST,
  );
}

/** Cause hue pulled most of the way to the marker stone: a painted mark, not confetti. */
function causeStainColor(cause: GraveNode["entry"]["causeOfDeath"]): Color {
  return new Color(CAUSE_HEX[cause]).lerp(
    new Color(WRECK_STAIN_STONE),
    WRECK_STAIN_DESATURATION,
  );
}

/**
 * Full 3-axis attitude per grave id: hull-space pitch, then roll onto the
 * beam, then full-circle yaw to the swell (Euler order YXZ). The id-hashed
 * jitter means no two wrecks sit alike, while the per-form list/pitch floors
 * keep every hull heeled — a wreck never sits upright.
 */
function wreckPose(grave: GraveNode, isHero: boolean, fieldMaxScale: number): Matrix4 {
  const spec = WRECK_FORM_SPECS[grave.visual.marker];
  const scale = renderedWreckScale(grave, isHero, fieldMaxScale);
  const side = stableUnit(`${grave.id}.side`) > 0.5 ? 1 : -1;
  const euler = new Euler(
    side * (spec.list + (stableUnit(`${grave.id}.list`) - 0.5) * 0.2),
    stableUnit(`${grave.id}.yaw`) * Math.PI * 2,
    spec.pitch + (stableUnit(`${grave.id}.pitch`) - 0.5) * 0.18,
    "YXZ",
  );
  return new Matrix4().compose(
    new Vector3(
      (grave.tile.x - CEMETERY_CENTER.x) * TILE_SCALE,
      WATER_Y,
      (grave.tile.y - CEMETERY_CENTER.y) * TILE_SCALE,
    ),
    new Quaternion().setFromEuler(euler),
    new Vector3(scale, scale, scale),
  );
}

/**
 * The quiet graveyard's population: renders the whole field when it is
 * already sparse, otherwise curates it down to the authored group plan —
 * three or four loose groups of two to five hulls with open water between
 * them, favouring the largest-value graves, always covering all five forms.
 * Deterministic per grave id and tile, invariant under input order. The
 * hero (first member) is the substantial grave nearest the shoal heart
 * weighted toward large value, so the single lantern it carries sits where
 * the renderer's static `cemetery-lantern` light lane already burns.
 */
function selectQuietWreckField(
  graves: readonly GraveNode[],
): { field: GraveNode[]; heroId: string } {
  const ordered = [...graves].sort((left, right) => left.id.localeCompare(right.id));
  if (ordered.length === 0) return { field: [], heroId: "" };
  const substantial = ordered.filter(
    (grave) => WRECK_FORM_SPECS[grave.visual.marker].family === "substantial",
  );
  const heroPool = substantial.length > 0 ? substantial : ordered;
  const hero = [...heroPool].sort((left, right) => (
    heroHeartScore(left) - heroHeartScore(right) || left.id.localeCompare(right.id)
  ))[0]!;
  if (ordered.length <= WRECK_QUIET_CEILING) {
    return { field: ordered, heroId: hero.id };
  }
  const chosenIds = new Set<string>([hero.id]);
  const groups: GraveNode[][] = WRECK_GROUP_SEEDS.map((seed, index) => {
    const size = WRECK_GROUP_SIZES[index] ?? 3;
    const members: GraveNode[] = index === 0 ? [hero] : [];
    const recruits = Math.max(0, index === 0 ? size - 1 : size);
    for (const grave of recruitWreckGroup(ordered, seed, recruits, chosenIds)) {
      members.push(grave);
      chosenIds.add(grave.id);
    }
    return members;
  });
  // All five marker forms stay readable: if a form did not make the groups,
  // its largest unused grave swaps in for the smallest member of the group
  // it sits closest to — coverage without growing the population.
  for (const form of WRECK_FORMS) {
    if (groups.some((group) => group.some((grave) => grave.visual.marker === form))) continue;
    const spare = ordered
      .filter((grave) => grave.visual.marker === form && !chosenIds.has(grave.id))
      .sort((left, right) => (
        right.visual.scale - left.visual.scale || left.id.localeCompare(right.id)
      ))[0];
    if (!spare) continue;
    const hostIndex = nearestGroupIndex(groups, spare);
    const host = groups[hostIndex]!;
    // The hero (always first in the first group) is never the weakest member.
    let weakest = hostIndex === 0 && host[0] === hero ? 1 : 0;
    if (weakest >= host.length) continue;
    for (let member = weakest + 1; member < host.length; member += 1) {
      if (host[member]!.visual.scale < host[weakest]!.visual.scale) weakest = member;
    }
    chosenIds.delete(host[weakest]!.id);
    host[weakest] = spare;
    chosenIds.add(spare.id);
  }

  return { field: groups.flat(), heroId: hero.id };
}

/** Distance to the shoal heart, discounted by grave value: small is hero-like. */
function heroHeartScore(grave: GraveNode): number {
  return Math.hypot(
    grave.tile.x - CEMETERY_CENTER.x,
    grave.tile.y - CEMETERY_CENTER.y,
  ) - (grave.visual.scale - 0.25) * 8;
}

/**
 * The `size` graves nearest a group seed, favouring large value. The value
 * discount spans 0.8 tiles of the 0.25–0.45 grave-scale range, so within a
 * loose group the bigger hulls win without dragging the group across the
 * shoal. The id tiebreak keeps the pick invariant under input order.
 */
function recruitWreckGroup(
  ordered: readonly GraveNode[],
  seed: readonly [number, number],
  size: number,
  chosenIds: ReadonlySet<string>,
): GraveNode[] {
  return ordered
    .filter((grave) => !chosenIds.has(grave.id))
    .map((grave) => ({
      grave,
      score: Math.hypot(
        grave.tile.x - (CEMETERY_CENTER.x + seed[0]),
        (grave.tile.y - (CEMETERY_CENTER.y + seed[1])) * 1.15,
      ) - (grave.visual.scale - 0.25) * 4,
    }))
    .sort((left, right) => (
      left.score - right.score || left.grave.id.localeCompare(right.grave.id)
    ))
    .slice(0, size)
    .map((entry) => entry.grave);
}

function nearestGroupIndex(groups: readonly GraveNode[][], grave: GraveNode): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index]!;
    for (const member of group) {
      const distance = Math.hypot(
        grave.tile.x - member.tile.x,
        grave.tile.y - member.tile.y,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    }
  }
  return best;
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
 * Byte budget: one tiny placement factory replaces the rotate/translate run
 * every literal part below used to spell out inline. It is called dozens of
 * times, which is the point — the gzip gate prefers this to the same call
 * chain repeated, the opposite of the usual inline-it style rule. Zero-angle
 * rotations are exact identities, so omitting them changes nothing emitted.
 */
function placed<T extends BufferGeometry>(
  geometry: T,
  x: number,
  y: number,
  z: number,
  rz = 0,
  ry = 0,
): T {
  geometry.rotateZ(rz);
  geometry.rotateY(ry);
  geometry.translate(x, y, z);
  return geometry;
}

/** `placed`, for the common case of a literal box part. */
function placedBox(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rz = 0,
  ry = 0,
): BoxGeometry {
  return placed(new BoxGeometry(w, h, d), x, y, z, rz, ry);
}

/**
 * Five genuinely different hulls, one baked geometry per cause form, each
 * sunk to its own waterline share.
 *
 * Common furniture — one fallen spar and a low stone with its tiny cause
 * stain — is merged into the form hull, so every wreck reads as one grave
 * rather than one hero ship. `wreckRole` is a test/diagnostic contract:
 * 0 decor, 1 submerged hull mass, 2 the only cause-coloured marker, 3 the
 * readable bulwark/stem/stump silhouette, and 4 the taller stone marker.
 * The big vocabulary pieces (ribs, masts, cloth, lantern) live in their own
 * shared instanced batches instead — see `addWreckFurnitureBatches`.
 */
function wreckFormGeometry(form: WreckForm): BufferGeometry {
  const spec = WRECK_FORM_SPECS[form];
  const bodyParts: BufferGeometry[] = [];
  const silhouetteParts: BufferGeometry[] = [];
  // Bone-pale is spent only here: stems, sternposts and standing frame ends.
  const frameParts: BufferGeometry[] = [];
  switch (form) {
    case "grounded": {
      bodyParts.push(hullShell(2.8, 0.82, 0.56));
      // A stub of bulwark still standing along one side, gunwale rails down
      // both flanks, one mast stump.
      silhouetteParts.push(
        placedBox(1.7, 0.34, 0.07, -0.2, 0.3, 0.3, 0.04),
        placedBox(2.1, 0.09, 0.09, 0, 0.14, -0.35),
        placedBox(2.1, 0.09, 0.09, 0, 0.14, 0.35),
        wreckStump(1.3, 0.44, -0.18),
      );
      break;
    }
    case "sinking-stern": {
      bodyParts.push(hullShell(2.6, 0.76, 0.52));
      // Stern rail going under, stem still proud at the bow.
      silhouetteParts.push(placedBox(0.9, 0.3, 0.08, -1.0, 0.26, 0.3, -0.12));
      frameParts.push(placedBox(0.1, 0.52, 0.12, 1.24, 0.3, 0, -0.25));
      break;
    }
    case "broken-keel": {
      // Two halves, hinged apart where the back broke; splintered keel
      // timbers spanning the break; a rail on each half; a knight head
      // still standing at the break itself.
      bodyParts.push(
        placed(hullShell(1.42, 0.74, 0.5), 0.75, 0.06, 0, 0.24),
        placed(hullShell(1.32, 0.72, 0.48), -0.72, 0.02, 0, -0.3),
      );
      for (const offset of [-0.12, 0.05, 0.2]) {
        bodyParts.push(placedBox(0.5, 0.06, 0.06, offset * 0.6, 0.05, offset, offset * 1.6));
      }
      silhouetteParts.push(
        placedBox(1.32, 0.09, 0.09, 0.77, 0.14, 0.34, 0.24),
        placedBox(1.22, 0.09, 0.09, -0.73, 0.12, -0.33, -0.3),
      );
      frameParts.push(placedBox(0.12, 0.5, 0.12, 0.02, 0.3, 0.18, 0.1));
      break;
    }
    case "skeletal": {
      // Planking gone: a keel spine, the stem, and the sternpost.
      bodyParts.push(placedBox(2.3, 0.13, 0.16, 0, 0, 0));
      frameParts.push(
        placedBox(0.12, 0.56, 0.12, 1.12, 0.2, 0, -0.3),
        placedBox(0.1, 0.46, 0.1, -1.1, 0.18, 0, 0.26),
      );
      break;
    }
    case "shattered": {
      // A keel line barely breaking the surface, and scattered timbers.
      bodyParts.push(placedBox(1.5, 0.1, 0.13, 0, 0, 0));
      silhouetteParts.push(wreckStump(0.55, 0.48, 0.3));
      break;
    }
  }

  sinkHullToWaterline(bodyParts, spec.sinkFraction);

  // The common grave marker every hull carries: a low stone base, its
  // taller stone, and the painted cause stain capping the stone. A painted
  // mark, not a floating dot: the stain stays small enough that even the
  // hero's scaled hull keeps it under 0.3 world units across.
  const stoneBase = placedBox(0.62, 0.18, 0.48, -1.08, 0.02, -0.82, 0, -0.18);
  const stone = placedBox(0.36, 0.82, 0.26, -1.08, 0.43, -0.82, 0, -0.18);
  const stain = placed(new CylinderGeometry(0.046, 0.052, 0.05, 7), -1.08, 0.86, -0.82);

  // One snapped spar in the water per hull — the second spar of the rejected
  // rewrite read as driftwood litter strewn across every wreck.
  const spars = [
    placed(
      new CylinderGeometry(0.035, 0.052, 2.0, 5),
      -0.1,
      0.1,
      0.6,
      Math.PI / 2 - 0.08,
      1.02,
    ),
  ];
  const scatteredPlanks: BufferGeometry[] = [];
  if (form === "shattered") {
    for (const [x, z, turn] of [[0.5, 0.28, 0.5], [-0.42, -0.3, -0.8], [0.1, 0.44, 1.2]] as const) {
      scatteredPlanks.push(placedBox(0.42, 0.05, 0.09, x, -0.02, z, 0, turn));
    }
  }

  const parts = [
    ...bodyParts,
    ...silhouetteParts,
    ...frameParts,
    stoneBase,
    stone,
    ...spars,
    ...scatteredPlanks,
    stain,
  ];
  // Drowned and waterlogged: substantial hulls keep a weathered skin, the
  // rest drown; bulwarks and rails follow their hull; the bone-pale tone
  // reaches only stems, sternposts and frame ends (plus the instanced ribs).
  const bodyColor = spec.family === "substantial" ? WRECK_TIMBER_WEATHERED : WRECK_TIMBER_DROWNED;
  for (const part of bodyParts) markWreckPart(part, bodyColor, 0, 1);
  for (const part of silhouetteParts) markWreckPart(part, WRECK_TIMBER_WEATHERED, 0, 3);
  for (const part of frameParts) markWreckPart(part, WRECK_TIMBER_BONE, 0, 3);
  markWreckPart(stoneBase, WRECK_STONE_BASE, 0, 4);
  markWreckPart(stone, WRECK_STONE, 0, 4);
  for (const spar of spars) markWreckPart(spar, WRECK_TIMBER_SPAR, 0, 0);
  for (const plank of scatteredPlanks) markWreckPart(plank, WRECK_TIMBER_SPAR, 0, 0);
  markWreckPart(stain, "#ffffff", 1, 2);

  const merged = mergeGeometries(parts, false);
  if (!merged) throw new Error(`Could not merge cemetery wreck form ${form}.`);
  merged.userData = {
    aboveWaterCue: spec.family === "substantial"
      ? "intact-gunwale"
      : spec.family === "broken-keel" ? "angled-halves" : "ribs-only",
    causeColorRole: "marker-stain-only",
    hullLength: spec.hullLength,
    sinkFraction: spec.sinkFraction,
  };
  return merged;
}

/**
 * The graveyard's shared furniture, one instanced batch per vocabulary piece:
 * exposed frames with per-rib lean, the few standing (always leaning) masts,
 * tattered cloth on the masted wrecks, and the single still-burning lantern
 * on the hero. Each batch spans every wreck, so the field costs five hull
 * draws plus four furniture draws no matter how many graves render.
 */
function addWreckFurnitureBatches(
  root: Group,
  field: readonly GraveNode[],
  poses: ReadonlyMap<string, Matrix4>,
  heroId: string,
): void {
  const weatheredTimber = flatMaterial(WRECK_TIMBER_WEATHERED);
  const boneTimber = flatMaterial(WRECK_TIMBER_BONE);
  const partMatrix = new Matrix4();
  const local = new Matrix4();
  // Byte budget: the multiply/write pair every batch below repeats, folded
  // into one local writer called from all of them.
  const writePose = (mesh: InstancedMesh, index: number, graveId: string): void => {
    partMatrix.multiplyMatrices(poses.get(graveId)!, local);
    mesh.setMatrixAt(index, partMatrix);
  };

  const ribTotal = field.reduce(
    (sum, grave) => sum + WRECK_FORM_SPECS[grave.visual.marker].ribs,
    0,
  );
  if (ribTotal > 0) {
    const ribs = new InstancedMesh(wreckRibGeometry(), boneTimber, ribTotal);
    ribs.name = "cemetery-wreck-ribs";
    ribs.castShadow = true;
    let index = 0;
    for (const grave of field) {
      const spec = WRECK_FORM_SPECS[grave.visual.marker];
      for (let rib = 0; rib < spec.ribs; rib += 1) {
        const along = spec.ribs === 1 ? 0 : rib / (spec.ribs - 1) - 0.5;
        const lean = (stableUnit(`${grave.id}.rib.${rib}`) - 0.5) * 0.5;
        local.makeRotationZ(lean);
        local.setPosition(along * spec.hullLength * 0.55, 0.1, 0);
        writePose(ribs, index, grave.id);
        index += 1;
      }
    }
    ribs.instanceMatrix.needsUpdate = true;
    root.add(ribs);
  }

  // The mast forest is thinned at the source: at most a third of the
  // rendered wrecks keep a standing mast, spent on the most substantial
  // hulls. The hero always takes the first slot — it carries the lantern —
  // and every field keeps at least that one mast so the lantern never
  // loses its masthead. Everything else keeps its baked stump, its snapped
  // spar in the water, or nothing.
  const mastBudget = Math.max(1, Math.floor(field.length / 3));
  const mastCandidates = field
    .filter((grave) => WRECK_FORM_SPECS[grave.visual.marker].family === "substantial")
    .sort((left, right) => (
      (right.id === heroId ? 1 : 0) - (left.id === heroId ? 1 : 0)
        || right.visual.scale - left.visual.scale
        || left.id.localeCompare(right.id)
    ));
  const masted = new Set<string>();
  for (const grave of mastCandidates) {
    if (masted.size >= mastBudget) break;
    masted.add(grave.id);
  }
  const mastedField = field.filter((grave) => masted.has(grave.id));
  if (mastedField.length > 0) {
    // Weathered timber, never the darkest tone: a mast must not read as a
    // black spike against pale water.
    const masts = new InstancedMesh(wreckMastGeometry(), weatheredTimber, mastedField.length);
    masts.name = "cemetery-wreck-masts";
    masts.castShadow = true;
    mastedField.forEach((grave, index) => {
      const spec = WRECK_FORM_SPECS[grave.visual.marker];
      local.makeRotationZ(wreckMastFall(grave));
      local.scale(new Vector3(1, spec.mast * WRECK_MAST_LENGTH, 1));
      local.setPosition(0.15, 0.18, 0);
      writePose(masts, index, grave.id);
    });
    masts.instanceMatrix.needsUpdate = true;
    root.add(masts);
  }

  // Cloth hangs from a mast, so only the masted wrecks carry it: rotted sail
  // rag plus the mourning pennant that used to fly on the memorial stele.
  // One geometry, one draw; the two read apart through per-instance colour.
  if (mastedField.length === 0) return;
  const clothMaterial = flatMaterial("#ffffff");
  clothMaterial.side = DoubleSide;
  const cloth = new InstancedMesh(
    tatteredPennantGeometry(),
    clothMaterial,
    mastedField.length * 2,
  );
  cloth.name = "cemetery-wreck-cloth";
  const rag = new Color("#6a6a5c");
  const mourning = new Color(HARBOR_PALETTE.stone_pale);
  mastedField.forEach((grave, index) => {
    const spec = WRECK_FORM_SPECS[grave.visual.marker];
    const fall = wreckMastFall(grave);
    // Byte budget: one slot table drives both cloth pieces — the rag of
    // rotted sail hanging off the standing part of the mast (slot 0) and
    // the smaller, paler mourning pennant still flying at the masthead
    // (slot 1). Row: [slot, scale, mast fraction, tint].
    for (const [slot, scale, frac, tint] of [[0, 1.5, 0.42, rag], [1, 0.7, 0.92, mourning]] as const) {
      local.makeRotationZ(fall);
      local.scale(new Vector3(scale, scale, scale));
      local.setPosition(0.15, 0.18 + spec.mast * WRECK_MAST_LENGTH * frac, 0);
      writePose(cloth, index * 2 + slot, grave.id);
      cloth.setColorAt(index * 2 + slot, tint);
    }
  });
  cloth.instanceMatrix.needsUpdate = true;
  if (cloth.instanceColor) cloth.instanceColor.needsUpdate = true;
  root.add(cloth);

  // The image the whole zone is for: ONE lantern still burning on ONE dead
  // ship — the hero, at the shoal heart where the renderer's static
  // `cemetery-lantern` light lane already sits. Ember level stays at the
  // island path punctuation tier, subordinate to the beacon; no new water
  // light lane is added.
  const host = field.find((grave) => grave.id === heroId) ?? mastedField[0]!;
  const hostSpec = WRECK_FORM_SPECS[host.visual.marker];
  const lanterns = new InstancedMesh(
    new BoxGeometry(0.16, 0.2, 0.16),
    lanternMaterial(WRECK_LANTERN_EMBER_INTENSITY, 0.5),
    1,
  );
  lanterns.name = "cemetery-wreck-lantern";
  lanterns.userData = { graveId: host.id };
  const reach = hostSpec.mast * WRECK_MAST_LENGTH * 0.92;
  const fall = wreckMastFall(host);
  local.makeRotationZ(fall);
  local.setPosition(0.15 - Math.sin(fall) * reach, 0.18 + Math.cos(fall) * reach, 0);
  writePose(lanterns, 0, host.id);
  lanterns.instanceMatrix.needsUpdate = true;
  root.add(lanterns);
}

/** An exposed frame: a half-hoop rib standing out of the broken planking. */
function wreckRibGeometry(): BufferGeometry {
  const rib = new TorusGeometry(0.36, 0.035, 3, 7, Math.PI);
  rib.rotateY(Math.PI / 2);
  return rib;
}

/** A snapped mast, unit height so instances scale it to what is left. */
function wreckMastGeometry(): BufferGeometry {
  const mast = new CylinderGeometry(0.032, 0.06, 1, 5);
  mast.translate(0, 0.5, 0);
  return mast;
}

/** A frayed swallowtail pennant — notched edges read as wind-worn cloth. */
function tatteredPennantGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  // Byte budget: the notch profile as one table read by a single lineTo,
  // not a call per vertex.
  for (const [x, y] of [
    [0, 0.52],
    [0.64, 0.44],
    [0.42, 0.29],
    [0.58, 0.16],
    [0.32, 0.08],
    [0.44, -0.02],
  ] as const) {
    shape.lineTo(x, y);
  }
  shape.closePath();
  return new ShapeGeometry(shape);
}

/** How far this grave's mast has fallen, and to which side. None stand upright. */
function wreckMastFall(grave: GraveNode): number {
  const mast = WRECK_FORM_SPECS[grave.visual.marker].mast;
  return (0.18 + (1 - mast) * 0.85) * (stableUnit(`${grave.id}.fall`) > 0.5 ? 1 : -1);
}

/**
 * Two offset lobes with harmonic outlines, merged into one flat stain that
 * sits a hair under the surface. Deliberately irregular and non-concentric:
 * this displaces the cluster silt pool, whose concentric ring read as a
 * target decal centred on the shoal. The main lobe underlies the heart and
 * the east/west rim groups; the small south lobe reaches the fourth group.
 * The north half of the shoal keeps clean water — that bare dark region is
 * the quiet the blurred-frame audit reads.
 */
function irregularSiltPatch(): BufferGeometry {
  const lobe = (
    radius: number,
    centerX: number,
    centerZ: number,
    seed: number,
    squash: number,
  ): BufferGeometry => {
    const disc = new CylinderGeometry(radius * 0.86, radius, 0.03, 12, 1);
    const position = disc.getAttribute("position");
    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      if (Math.hypot(x, z) < 0.001) continue;
      const angle = Math.atan2(z, x);
      const variation = 1
        + Math.sin(angle * 3 + seed) * 0.16
        + Math.sin(angle * 5 - seed * 1.7) * 0.1;
      position.setX(index, x * variation);
      position.setZ(index, z * variation * squash);
    }
    position.needsUpdate = true;
    disc.computeVertexNormals();
    disc.translate(centerX, 0, centerZ);
    return disc;
  };
  const merged = mergeGeometries(
    [lobe(9.6, 0, 0.8, 1.9, 0.66), lobe(3.6, 3.2, 5.8, 4.4, 0.8)],
    false,
  );
  if (!merged) throw new Error("Could not merge the cemetery silt patch.");
  return merged;
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

function markWreckPart(
  geometry: BufferGeometry,
  colorValue: string,
  causeMask: number,
  wreckRole: 0 | 1 | 2 | 3 | 4,
): void {
  const count = geometry.getAttribute("position").count;
  const color = new Color(colorValue);
  const colors = new Float32Array(count * 3);
  const masks = new Float32Array(count);
  const roles = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    color.toArray(colors, index * 3);
    masks[index] = causeMask;
    roles[index] = wreckRole;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setAttribute("causeMask", new Float32BufferAttribute(masks, 1));
  geometry.setAttribute("wreckRole", new Float32BufferAttribute(roles, 1));
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
    new Mesh(new CylinderGeometry(0.18, 0.24, 0.48, 6), lanternMaterial(1.8, 0.42)),
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

function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
