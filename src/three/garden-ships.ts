import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LatheGeometry,
  LineBasicMaterial,
  LineSegments,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Shape,
  ShapeGeometry,
  Uint8BufferAttribute,
  Vector2,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";
import {
  GARDEN_SHIP_ROOT_Y,
  GARDEN_SILHOUETTE_FOR_HULL as SILHOUETTE_FOR_HULL,
  gardenShipSelectionRadius,
  gardenShipVisualScale,
  type GardenHullSilhouette,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE, hexToOklch, oklchToHex } from "../systems/palette";
import { shipRestSailBraceRad } from "../systems/ship-visuals";
import type { ShipNode } from "../systems/world-types";
import { heroHullModelFor } from "../systems/unique-ships";
import { gardenModelAnchor, type GardenModelId } from "./garden-models";
import {
  advanceShipLanternAttention,
  createShipLanternAttentionState,
  shipLanternWarmth,
  type ShipLanternAttentionState,
} from "./garden-ship-lantern-attention";
import {
  GARDEN_WATER_MAX_RIPPLE_RINGS,
  type GardenRippleRingEmitter,
} from "./garden-water-contract";
import { createGardenSailTexture, gardenSailClothColor } from "./garden-sail-texture";
import {
  FLEET_BATCH_TINTS,
  FLEET_MAX_SAILS,
  FLEET_SAIL_ATLAS_COLUMNS,
  markAtlasSail,
  mergeTintedParts,
  setFleetAttention,
  type FleetBatchGeometrySource,
} from "./garden-fleet-batch";
import {
  cachedShipGeometry,
  safeCssColor,
  setTilePosition,
  stableUnit,
  type GardenShipGeometryCache,
} from "./garden-util";

const scratchMatrix = new Matrix4();
const scratchPosition = new Vector3();

const GARDEN_COLORS = {
  limestone: "#b7ad96",
  limestoneLight: "#ded6c2",
  limestoneShade: "#958b75",
  path: "#c8bea5",
  roof: "#5b3430",
  vegetation: "#3f5744",
  vegetationLight: "#71805a",
} as const;

/** Motion tier: titans/uniques bob slowest; also sets the lane intensity. */
export type ShipFleetTier = "titan" | "heritage" | "standard";

// S5 / decision D-S5: the visual-scale mapping (~2.6× spread since the
// 2026-09-05 resting-frame re-base, 0.8 legibility floor) lives in
// garden-observatory-slice (orchestrator-integrated per contract C3) so
// selection radii and label layout consume the same spread; re-exported here
// for the fleet module's existing consumers/tests.
export {
  GARDEN_SHIP_DATA_SCALE_MAX,
  GARDEN_SHIP_DATA_SCALE_MIN,
  GARDEN_SHIP_VISUAL_SCALE_MAX,
  GARDEN_SHIP_VISUAL_SCALE_MIN,
  gardenShipVisualScale,
} from "../systems/garden-observatory-slice";

export interface ShipVisual {
  /** Sail-atlas cell (D3). 0 = the shared plain canvas. Batched ships only. */
  atlasCell: number;
  /** W7.3 service-age finish, retained for late hero-GLB attachment. */
  agePatina: number;
  /**
   * W1: true when this ship is drawn from the shared `FleetBatches` instances
   * rather than its own meshes. Batched ships carry no hull/sail/pennant mesh;
   * `root` is a transform carrier with no drawable children.
   */
  batched: boolean;
  bobPhase: number;
  displayOffset: { x: number; y: number };
  fineDetail: Group;
  /** Family timber + issuer whisper, written to the hull batch's instanceColor (W1/D1, warm-village C2). */
  hullColor: Color;
  /** Issuer paint written to the hull batch's `aTrim` — the sheer strake (W1/D2). */
  trimColor: Color;
  /** F1: the cloth dye handed to the batched sail material. */
  sailColor: Color;
  /**
   * W4.F1: the square sail's brace at rest (`shipRestSailBraceRad`), cached so
   * the frame loop never re-hashes the id. Under way contract F-A's
   * `sailTrimRad` replaces it.
   */
  sailRestBraceRad: number;
  /** Hero GLB hull to attach for titans/uniques (null for the procedural fleet). */
  heroModelId: GardenModelId | null;
  /** Procedural hull/rig parts hidden once a hero GLB attaches (identity sail stays). */
  heroHideable: Object3D[];
  /** Subtle livery-primary multiply applied to the hero hull wood on attach. */
  heroHullTint: Color;
  /** The logo sail mesh, repositioned onto the hero main mast when a GLB attaches. */
  identitySail: Mesh | null;
  /** Null for batched ships — their sail shades from the shared atlas material. */
  identitySailMaterial: MeshStandardMaterial | null;
  /**
   * W4.F7: where the ship's one stern chōchin hangs, ship-local and before the
   * peg trim and the batch's hull form (`updateFleetLanterns` applies both).
   * Mutable: a hero GLB re-homes it onto its own `lantern-stern` anchor when
   * it attaches.
   */
  sternLantern: Vector3;
  /**
   * True while the lamp hangs from the procedural stern pole the fleet rig
   * draws; false once a hero GLB carries it on its own structure.
   */
  sternLanternOnPole: boolean;
  /** Warm-lane intensity this ship lays on the sea (by fleet tier). */
  laneIntensity: number;
  /**
   * W6.4: masthead height in SHIP-LOCAL units, which is what a mirror column
   * has to be as long as. Seeded from the procedural rig plan and replaced with
   * the GLB's own masthead anchor when a hero model attaches — those hulls are
   * taller than the rig they stand in for, and a reflection cut to the wrong
   * length reads as a smear rather than as the ship.
   */
  mastheadHeight: number;
  /** Slowed bob envelope for larger hulls (D7 motion hierarchy). */
  motionAmplitudeScale: number;
  motionPeriodScale: number;
  /**
   * Masthead pennant — the ship's ONE livery accent; flutters with the wind
   * (S8). Null for batched ships, whose pennant is an instance in the shared
   * pennant batch.
   */
  pennant: Mesh | null;
  /** Accent written to the pennant batch's instanceColor. */
  pennantColor: Color;
  /** Previous heading angle, for heel-into-turn (null until first moving frame). */
  prevHeadingAngle: number | null;
  representative: boolean;
  root: Group;
  sampleState: string;
  selectionRadius: number;
  ship: ShipNode;
  /** Which silhouette batch this ship belongs to. */
  silhouette: GardenHullSilhouette;
  /** Deterministic phase offset for lantern pendulum sway. */
  swaySeed: number;
  tier: ShipFleetTier;
  /** World-wide wake-batch slot; -1 only until the ship is assigned one. */
  wakeSlot: number;
}

/**
 * Fleet-wide stern lanterns and the hero band's standing rig: three shared
 * draw calls for the whole fleet (paper lamp bodies, additive halos, and one
 * LineSegments for stays, shrouds and lantern poles).
 */
export interface FleetLanterns {
  attention: ShipLanternAttentionState;
  cores: InstancedMesh<BufferGeometry, MeshStandardMaterial>;
  glow: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  coreMaterial: MeshStandardMaterial;
  glowMaterial: MeshBasicMaterial;
  /** W4.F8: hero-band standing rigging + stern poles, rewritten each frame. */
  rig: LineSegments<BufferGeometry, LineBasicMaterial>;
  root: Group;
  /** One entry per ship: its stern lantern. */
  entries: readonly { swayPhase: number; visual: ShipVisual }[];
}

type GardenSailKind = "fore-aft" | "triangle" | "rectangle" | "junk";

interface GardenSailPlan {
  centerY: number;
  height: number;
  kind: GardenSailKind;
  /** W4.F5: momen-ho cotton strips across a square sail (6–9); omitted on other rigs. */
  panels?: number;
  reverse?: boolean;
  width: number;
}

interface GardenMastPlan {
  height: number;
  sails: readonly GardenSailPlan[];
  x: number;
  /** Athwartships offset; used by the council boat's visibly split rig. */
  z?: number;
}

interface ShipSailTextureTarget {
  logoGenerationKey: string | null;
  ships: readonly ShipVisual[];
}

/**
 * Yaw of a hero hull's identity sail, matching the yard yaw the procedural rigs
 * already use. Small on purpose: enough that the cloth is clearly bent to a
 * spar and not squared to the viewer, not so much that the mark skews away.
 */
const HERO_IDENTITY_SAIL_YAW = 0.09;

const GARDEN_SHIP_RIGS: Record<GardenHullSilhouette, readonly GardenMastPlan[]> = {
  // Bezaisen: one mast and one deliberately outsize square of cloth. There is
  // no secondary sail to dilute the family read or the atlas identity mark.
  bezaisen: [
    {
      height: 5.4,
      sails: [{ centerY: 3.15, height: 3.0, kind: "rectangle", panels: 9, width: 4.3 }],
      x: 0.15,
    },
  ],
  // Kobaya: a low needle under two opposed triangular sails. The long spar
  // below continues the bow past the already-fine stem.
  kobaya: [
    {
      height: 4.75,
      sails: [{ centerY: 2.65, height: 3.65, kind: "triangle", reverse: true, width: 2.45 }],
      x: -1.45,
    },
    {
      height: 5.15,
      sails: [{ centerY: 2.85, height: 3.9, kind: "triangle", width: 2.7 }],
      x: 1.25,
    },
  ],
  // Twin-hull council boat: each hull owns a mast. Their z offsets are part of
  // the rig geometry, leaving a clear slot of water beneath the bridge deck.
  twinhull: [
    {
      height: 5.55,
      sails: [{ centerY: 3.05, height: 4.15, kind: "triangle", reverse: true, width: 2.15 }],
      x: -0.7,
      z: -1.02,
    },
    {
      height: 6.05,
      sails: [{ centerY: 3.25, height: 4.45, kind: "triangle", width: 2.3 }],
      x: 0.7,
      z: 1.02,
    },
  ],
  // Takasebune: an aft working rig above two banks of reed-covered cargo.
  takasebune: [
    {
      height: 4.4,
      sails: [{ centerY: 3.05, height: 2.2, kind: "rectangle", panels: 6, width: 2.9 }],
      x: -3.35,
    },
  ],
  // Junk: a short hull underneath a tall asymmetric battened fan. The small
  // forward fan exposes more lattice and prevents a generic single-mast read.
  junk: [
    {
      height: 7.35,
      sails: [{ centerY: 4.05, height: 5.7, kind: "junk", width: 3.05 }],
      x: -0.8,
    },
    {
      height: 4.15,
      sails: [{ centerY: 2.45, height: 2.75, kind: "junk", reverse: true, width: 1.55 }],
      x: 1.55,
    },
  ],
  // Scow: one squat mast and one low sail over the deepest, roundest hull.
  scow: [
    {
      height: 2.85,
      sails: [{ centerY: 1.75, height: 1.8, kind: "fore-aft", width: 2.05 }],
      x: 0,
    },
  ],
};

// Large deck structures that belong to the silhouette rather than per-ship
// fittings. Takasebune bays and the twin-hull bridge are authored below as
// repeated family parts because neither is a single cabin.
const GARDEN_SHIP_CABINS: Partial<Record<
  GardenHullSilhouette,
  { height: number; width: number; x: number; z: number }
>> = {
  // W4.F6 (fleet-craft-6): the bezaisen's yagura — a long LOW deckhouse on the
  // raised stern, under a gentle roof (`addFamilySilhouetteParts`). It was a
  // 2.4-tall cube (T3.3) that turned the whole family into a tub with a phone
  // box. The forward face stops at x −1.25, clear of the fitting boats and of
  // the braced yard's sweep (|z| ≤ 0.8 only meets the yard within ~0.75 of the
  // mast), and the roof crown sits at ≈1.64, far below the identity mark. At
  // 1.6 across it leaves the gunwale showing either side from astern.
  bezaisen: { height: 0.9, width: 1.75, x: -2.125, z: 1.6 },
  junk: { height: 0.72, width: 1.4, x: -2, z: 1.45 },
  scow: { height: 0.48, width: 1.5, x: -0.9, z: 2.35 },
};

// Every family carries a slight mast rake: runners and working craft lean
// forward (bow at +x), while the broad carrier sits almost upright. A table
// rather than a ternary chain: at six silhouettes the chain
// was already the least readable thing in the file, and it lived in two copies.
const GARDEN_SHIP_MAST_RAKE: Record<GardenHullSilhouette, number> = {
  bezaisen: 0.025,
  kobaya: -0.075,
  twinhull: -0.025,
  takasebune: -0.02,
  junk: -0.035,
  scow: -0.015,
};

/**
 * W2.4: what stands on the deck.
 *
 * The batched fleet carried one cabin box and nothing else, while the hero
 * hulls have hatches, capstans, boats and cargo — so the 188 ships people
 * actually look at were the bare ones. These props ride the shared per-
 * silhouette geometry, so they cost triangles once and nothing per ship, and
 * they are what makes a hull read as INHABITED rather than extruded.
 *
 * Layout is a free hash-free choice under decision D3: it varies by silhouette,
 * which is already trait-derived, and claims nothing further.
 */
interface GardenDeckProps {
  /** Stowed ship's boat, on chocks. */
  boat?: number;
  /** W6: a boat towed astern on a painter — x of the transom it streams from. */
  towedBoat?: number;
  /** Capstan drum. */
  capstan?: number;
  /** Netted deck cargo: columns along the keel × rows athwartships. */
  cargo?: { columns: number; rows: number; x: number };
  /** Grating hatches, by x. */
  hatches?: readonly number[];
}

const GARDEN_SHIP_DECK_PROPS: Record<GardenHullSilhouette, GardenDeckProps> = {
  bezaisen: { capstan: 1.8, cargo: { columns: 2, rows: 2, x: -0.4 }, hatches: [1.1] },
  kobaya: { capstan: -0.2, hatches: [0.4] },
  twinhull: { hatches: [0] },
  takasebune: {},
  junk: { cargo: { columns: 2, rows: 2, x: -0.3 }, hatches: [0.8] },
  scow: { capstan: 1.05, cargo: { columns: 2, rows: 2, x: -0.2 } },
};

/**
 * W3: the masthead of a silhouette's tallest mast, in ship-local units — where
 * the pennant flies. Derived rather than authored so it can never drift from
 * the rig table.
 */
export function gardenShipMastheadOffset(
  silhouette: GardenHullSilhouette,
): { x: number; y: number } {
  const tallest = GARDEN_SHIP_RIGS[silhouette].reduce((best, mast) => (
    mast.height > best.height ? mast : best
  ));
  return { x: tallest.x, y: tallest.height + 0.52 };
}

/** Families that carry a bowsprit, and how far it reaches past the stem. */
const GARDEN_SHIP_BOWSPRITS: Partial<Record<
  GardenHullSilhouette,
  { length: number; x: number }
>> = {
  // 2026-09-07 T3.3: length 3.6 -> 2.2, x 6.25 -> 5.6 (tip 8.05 -> 6.7). The
  // spar was sized when kobaya was an unused silhouette; with the chartered
  // brigantine routed here it is 39 ships, and berth footprint is driven by
  // `GARDEN_HULL_MAX_X_REACH_WORLD`, which the spar tip alone was setting.
  kobaya: { length: 2.2, x: 5.6 },
};

/**
 * W4.F7 (fleet-craft-7): one paper chōchin per boat, hung from a short stern
 * pole. It used to be one shared point (x −3.05, y 1.28) for every family, so
 * on the scow the lamp hung in the air past the transom, on the bezaisen it sat
 * inside the stern castle, and titans floated two more over the deck. Now the
 * pole steps just inboard of each family's own stern, leans a touch aft, and a
 * short arm carries the lamp clear of the taffrail. Ship-local, before the
 * per-instance hull form; `pole` is the height above the stern rail.
 */
const GARDEN_SHIP_STERN_LANTERNS: Record<
  GardenHullSilhouette,
  { pole: number; x: number; z: number }
> = {
  // Tall enough to hang the lamp aft of the yagura roof.
  bezaisen: { pole: 1.2, x: -3.2, z: 0 },
  kobaya: { pole: 0.8, x: -4.05, z: 0 },
  // On the starboard demi-hull: there is no deck on the centreline aft.
  twinhull: { pole: 0.8, x: -4.25, z: 1.02 },
  takasebune: { pole: 0.8, x: -5.7, z: 0 },
  junk: { pole: 0.85, x: -2.92, z: 0 },
  scow: { pole: 0.75, x: -2.38, z: 0 },
};
/** The stern rail the pole steps on: rim plate 0.47 + its end sheer 0.34. */
const STERN_POLE_FOOT_Y = 0.8;
const STERN_POLE_LEAN = 0.12;
const STERN_LANTERN_ARM = 0.18;
/** Arm end to lamp centre. */
const STERN_LANTERN_DROP = 0.26;

/** Stern pole foot, head, arm end and hanging lamp centre, ship-local. */
export function gardenShipSternLantern(silhouette: GardenHullSilhouette): {
  arm: Vector3;
  foot: Vector3;
  head: Vector3;
  lamp: Vector3;
} {
  const plan = GARDEN_SHIP_STERN_LANTERNS[silhouette];
  const head = new Vector3(plan.x - STERN_POLE_LEAN, STERN_POLE_FOOT_Y + plan.pole, plan.z);
  const arm = new Vector3(head.x - STERN_LANTERN_ARM, head.y, plan.z);
  return {
    arm,
    foot: new Vector3(plan.x, STERN_POLE_FOOT_Y, plan.z),
    head,
    lamp: new Vector3(arm.x, arm.y - STERN_LANTERN_DROP, plan.z),
  };
}

function shipFleetTier(ship: ShipNode): ShipFleetTier {
  const sizeTier = ship.visual.sizeTier;
  if (sizeTier === "titan" || sizeTier === "unique") return "titan";
  if (sizeTier === "flagship" || sizeTier === "major" || (ship.visual.scale ?? 1) >= 1.15) {
    return "heritage";
  }
  return "standard";
}

/**
 * Named titans and uniques get their bespoke GLB hero hull. All other issuers
 * keep the procedural fleet hull, including unnamed ships in those size tiers.
 */
/**
 * W1: true when a ship keeps its own scene graph (bespoke hero GLB hull,
 * per-ship identity sail) rather than joining the instanced
 * batches. Only issuers with an authored hero model qualify.
 */
export function gardenShipUsesHeroModel(ship: ShipNode): boolean {
  return shipHeroModelId(ship) !== null;
}

function shipHeroModelId(ship: ShipNode): GardenModelId | null {
  // Named hero hulls stay bound to issuer identity across refreshes; there are
  // no shared tier-based slots for unnamed issuers.
  if (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique") {
    return heroHullModelFor(ship.id);
  }
  return null;
}

const FLEET_TIER_MOTION: Record<ShipFleetTier, { amplitude: number; period: number }> = {
  titan: { amplitude: 0.7, period: 1.8 },
  heritage: { amplitude: 1, period: 1.3 },
  standard: { amplitude: 1, period: 1 },
};

const FLEET_TIER_LANE_INTENSITY: Record<ShipFleetTier, number> = {
  titan: 0.55,
  heritage: 0.45,
  standard: 0.3,
};

/**
 * W1 (decision D2): the batched counterpart to `createShip`.
 *
 * Builds only the transform carrier and the per-ship metadata every consumer
 * needs (lane registry, shadows, ripple rings, selection cues, hit testing) —
 * NO hull, deck, mast, sail, cabin or pennant meshes. Those live in the shared
 * `FleetBatches` instances and are stamped from `root`'s transform each frame.
 *
 * `root` is a real `Group` and still receives the full per-frame transform, but
 * carries no drawable children, so it contributes zero draw calls. Keeping it
 * an `Object3D` (rather than a bare struct) is deliberate: `entityCues`,
 * follow-selected and the wake batch's pose all read from it exactly as before.
 */
export function createBatchedShip(
  ship: ShipNode,
  displayOffset: { x: number; y: number },
  representative: boolean,
  atlasCell: number,
): ShipVisual {
  const root = new Group();
  const fineDetail = new Group();
  fineDetail.name = "ship-fine-detail";
  root.add(fineDetail);
  setTilePosition(root, ship.tile, GARDEN_SHIP_ROOT_Y);
  root.scale.setScalar(gardenShipVisualScale(ship.visual.scale || 1));

  const tier = shipFleetTier(ship);
  const motion = FLEET_TIER_MOTION[tier];

  return {
    agePatina: MathUtils.clamp(ship.visual.hullForm?.agePatina ?? 0, 0, 1),
    atlasCell,
    batched: true,
    bobPhase: stableUnit(ship.id) * Math.PI * 2,
    displayOffset,
    fineDetail,
    heroHideable: [],
    heroHullTint: new Color("#ffffff"),
    heroModelId: null,
    hullColor: batchedHullColor(ship),
    trimColor: batchedTrimColor(ship),
    sailColor: weatheredSailColor(ship),
    sailRestBraceRad: shipRestSailBraceRad(ship.id),
    identitySail: null,
    identitySailMaterial: null,
    sternLantern: gardenShipSternLantern(SILHOUETTE_FOR_HULL[ship.visual.hull]).lamp,
    sternLanternOnPole: true,
    laneIntensity: FLEET_TIER_LANE_INTENSITY[tier],
    mastheadHeight: gardenShipMastheadOffset(SILHOUETTE_FOR_HULL[ship.visual.hull]).y,
    motionAmplitudeScale: motion.amplitude,
    motionPeriodScale: motion.period,
    pennant: null,
    pennantColor: batchedPennantColor(ship),
    prevHeadingAngle: null,
    representative,
    root,
    sampleState: "idle",
    selectionRadius: gardenShipSelectionRadius(ship),
    ship,
    silhouette: SILHOUETTE_FOR_HULL[ship.visual.hull],
    swaySeed: stableUnit(`${ship.id}.sway`) * Math.PI * 2,
    tier,
    wakeSlot: -1,
  };
}

/**
 * The colour multiplier the hull batch's `instanceColor` carries: family
 * timber plus the brand whisper. Matches the hull material `createShip`
 * applies, so a batched ship and a hero ship of one family and issuer read
 * identically.
 */
/**
 * W1 (decision D1) → warm-village C2 (2026-09-05): the hull is a MATERIAL,
 * and the material belongs to the FAMILY.
 *
 * Two steps of history. The hull was once timber_dark lerped 0.58 toward the
 * issuer's primary — measured over the 214 branded coins that put 100 hulls
 * (47%) more than 60° off the timber hue: violet, magenta, lime and
 * electric-blue hulls that swamped the plank/wale/AO ramp bakeHullVertexColors
 * bakes in and out-shouted the sail, which since the heraldry work is the
 * identity channel. W1 D1 replaced that with six authored timbers — but
 * HASH-PICKED PER ISSUER, so hull colour and hull form stayed uncorrelated:
 * six near-identical browns scattered across six silhouettes, with nothing
 * for the eye to group by. That hash encoded nothing and was not claimed to;
 * this is what replaces it.
 *
 * Since the warm-village resting frame (zoom 1.0, hulls 33–106 px) each of
 * the six families carries its own authored pair — timber + trim — derived
 * from the harbour timber hues, re-spaced by value (C < 0.14).
 * Silhouette and colour now correlate: a bezaisen is
 * dark kogecha, a kobaya is pale sand, and the fleet groups by hull the way
 * it already grouped by rig.
 *
 * Value-first timber ladder in OKLCH: junk .28, bezaisen .41, cool
 * twinhull .47, scow .60, takasebune .68, kobaya .82. Timber chroma is
 * reduced by a quarter; the saturated identity stays in the strake and dye.
 * Values are material colours before the vertex ramp and illumination.
 *
 * Treat the exported colours as constants: clone before use.
 */
export const GARDEN_HULL_FAMILY_PAINT: Readonly<
  Record<GardenHullSilhouette, Readonly<{ timber: Color; trim: Color }>>
> = {
  // Dark tea timber / bengara strake.
  bezaisen: {
    timber: new Color("#5d452a"),
    trim: new Color(HARBOR_PALETTE.roof_clay),
  },
  // Pale weathered timber / indigo strake.
  kobaya: {
    timber: new Color("#ccc3b2"),
    trim: new Color(HARBOR_PALETTE.deep_sea_1),
  },
  // The only cool timber afloat.
  twinhull: {
    timber: new Color("#4a5e68"),
    trim: new Color(HARBOR_PALETTE.foam_white),
  },
  // Sun-bleached reed carrier / green strake.
  takasebune: {
    timber: new Color("#b7906a"),
    trim: new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.35),
  },
  // Soot-dark lacquer / black strake.
  junk: {
    timber: new Color("#3a2312"),
    trim: new Color(HARBOR_PALETTE.iron_dark),
  },
  // Mid-value timber / ember strake.
  scow: {
    timber: new Color("#907d62"),
    trim: new Color(HARBOR_PALETTE.ember),
  },
};

/**
 * How much of the issuer's brand survives in the timber. Small on purpose:
 * the timber is the family's material and this whisper is the only issuer
 * dye it takes — a coin and its staked sibling still agree whenever they
 * share a family, at a hue shift too slight to look painted. The brand
 * proper lives on the sheer strake (D2) and on the sails.
 */
const HULL_BRAND_WHISPER = 0.12;

/**
 * Family timber + the 0.12 issuer whisper; see GARDEN_HULL_FAMILY_PAINT.
 *
 * The timber is keyed on the ship's FAMILY (its silhouette), not its issuer.
 * The W1 hash of the yard tried to make two coins of one issuer agree; keying
 * the family does that whenever the coins share a class AND makes every
 * kobaya from every yard the same pale sand — the grouping the eye was
 * missing. Issuer kinship reads through the strake, pennant and sails;
 * family reads through the hull.
 */
function batchedHullColor(ship: ShipNode): Color {
  const timber = GARDEN_HULL_FAMILY_PAINT[SILHOUETTE_FOR_HULL[ship.visual.hull]].timber;
  return timber.clone().lerp(
    new Color(safeCssColor(ship.visual.livery?.primary, HARBOR_PALETTE.timber_warm)),
    HULL_BRAND_WHISPER,
  );
}

/**
 * W2.3 / W4: the bitmask of sails this ship has furled onto their yards.
 *
 * Bit 0 is the identity sail and is never set — the emblem must survive at
 * anchor, which is where two thirds of the fleet spends its time.
 *
 * Two channels, both honest:
 * - **Moored**, a ship hands her UPPER sails and leaves her courses hanging,
 *   which is what a real ship does at anchor. Striking everything was tried
 *   first and reverted twice over: it put two thirds of the harbour on bare
 *   poles, which trades one monotony for another and looked worse still once
 *   W3 made the masts taller.
 * - **Under way**, a stable per-ship hash furls at most one sail. Working ships
 *   rarely carry everything; this is what stops dozens of carriers from flying
 *   an identical rig.
 *
 * `idle` is deliberately NOT treated as berthed: it is the state of a ship with
 * no motion sample yet, not a ship at a quay.
 */
export function gardenShipSailFurl(shipId: string, sampleState: string): number {
  if (sampleState === "moored") return FURL_ALL_UPPERS;
  const roll = stableUnit(`${shipId}.furl`);
  if (roll < 0.5) return 0;
  // Favour an upper — a working ship hands a topsail far more often than a
  // course — but let one roll in six take in a course, which is the reef that
  // reads most strongly at overview zoom.
  if (roll < 0.85) {
    return 2 ** (FURL_UPPER_FIRST + Math.floor(roll * 7) % (FLEET_MAX_SAILS - FURL_UPPER_FIRST));
  }
  return 2 ** (FURL_COURSE_FIRST + Math.floor(roll * 11) % (FURL_UPPER_FIRST - FURL_COURSE_FIRST));
}

/** First index in the course band, and in the upper-sail band. See below. */
const FURL_COURSE_FIRST = 1;
const FURL_UPPER_FIRST = 3;
/** Bits FURL_UPPER_FIRST..FLEET_MAX_SAILS-1 — every topsail, topgallant and jib. */
const FURL_ALL_UPPERS = (2 ** FLEET_MAX_SAILS - 1) - (2 ** FURL_UPPER_FIRST - 1);

/**
 * W1 (decision D2): the sheer strake's paint — the issuer's colour as a single
 * thin line at the rail, tracing the sheer curve.
 *
 * Historically where an owner's colours went, and the only band on the hull
 * high enough to survive the isometric camera's occlusion (see the silhouette
 * findings in agents/2026-07-25-fleet-hulls-and-titans-plan.md).
 *
 * W4.F13 (critic-3 step 3): the paint is the issuer's HUE at no more than
 * OKLCH C 0.08, then ×0.8 in linear light. At full brand chroma the ring was
 * the brightest, loudest band on the hull — a violet neon rim on blue-violet
 * issuers that bloomed at dusk. Clamped, it is a thin line of issuer colour
 * under the dyed cloth, which stays the identity channel.
 *
 * Warm-village C2: an unbranded ship's fallback is no longer the shared
 * timber_warm but her FAMILY's trim, so a hull with no livery still names its
 * family twice. Branded ships carry the issuer.
 */
const STRAKE_MAX_CHROMA = 0.08;
const STRAKE_VALUE = 0.8;

function batchedTrimColor(ship: ShipNode): Color {
  const paint = GARDEN_HULL_FAMILY_PAINT[SILHOUETTE_FOR_HULL[ship.visual.hull]];
  const source = new Color(safeCssColor(ship.visual.livery?.primary, paint.trim.getStyle()));
  const { c, h, l } = hexToOklch(`#${source.getHexString()}`);
  return new Color(oklchToHex({ c: Math.min(c, STRAKE_MAX_CHROMA), h, l }))
    .multiplyScalar(STRAKE_VALUE);
}

/**
 * W6: weathered canvas.
 *
 * `gardenSailClothColor` is a pure function of the livery, so every ship of an
 * issuer — and every sail of every ship — flew cloth at exactly one value. A
 * real fleet's canvas is not uniform: some suits are new, some have had five
 * years of sun. A stable per-ship brightness of ±6% is enough to break the
 * flatness and reads as age rather than as a different colour.
 *
 * Deliberately a scalar, not a hue shift: the dye is the issuer's identity, so
 * the hue must survive untouched.
 */
function weatheredSailColor(ship: ShipNode): Color {
  const cloth = gardenSailClothColor(ship.visual.livery);
  return cloth.multiplyScalar(0.94 + stableUnit(`${ship.id}.weather`) * 0.12);
}

/**
 * The masthead pennant (S4/S8), carrying BOTH the ship's livery accent and its
 * dominant chain (W5.5).
 *
 * The livery accent still sets the pennant's base, so a ship's own identity
 * stays readable; the chain then pulls that base toward a fixed per-chain hue.
 * Because the pull is a bounded lerp rather than a replacement, ships on the
 * same chain visibly cluster without any two liveries collapsing onto the same
 * colour — the pennant reads as "this ship, flying that chain's colours".
 *
 * Chain hues are keyed off the chain id, so they are stable across refreshes
 * and identical for every ship on a chain.
 */
const CHAIN_PENNANT_HUES: Readonly<Record<string, string>> = {
  ethereum: "#7b8cc4",
  tron: "#c25b5b",
  bsc: "#d8b04a",
  solana: "#59b89a",
  base: "#5b8fdd",
  arbitrum: "#5aa7c8",
  polygon: "#9a7fc4",
  avalanche: "#cf6f63",
  optimism: "#d0707f",
  ton: "#5fa8c9",
};
const CHAIN_PENNANT_FALLBACK = "#8d9298";

function batchedPennantColor(ship: ShipNode): Color {
  const accent = new Color(HARBOR_PALETTE.timber_warm).lerp(
    new Color(safeCssColor(ship.visual.livery?.accent, GARDEN_COLORS.roof)),
    0.78,
  );
  const chainId = ship.dominantChainId;
  if (chainId === null) return accent;
  const hue = CHAIN_PENNANT_HUES[chainId] ?? CHAIN_PENNANT_FALLBACK;
  return accent.lerp(new Color(safeCssColor(hue, CHAIN_PENNANT_FALLBACK)), 0.42);
}

/**
 * Tier 3 #13: the peg trim, for the ~29 hulls that keep their own scene graph.
 *
 * The batched fleet gets this for free — its `aHullForm.w` lifts or settles
 * every vertex in the vertex shader — but a hero ship IS meshes, so the offset
 * has to be applied to them. It goes on the ship's drawable children rather
 * than on `root`, whose Y the frame loop rewrites from the tile every frame.
 */
function applyShipPegTrim(root: Group, ship: ShipNode): void {
  const waterline = ship.visual.hullForm?.waterline ?? 0;
  if (waterline === 0) return;
  for (const child of root.children) child.position.y += waterline;
}

/** W5.8/W7.3: value-only decorative drift plus even service-age patina. */
function shipWoodSurfaceScale(ship: ShipNode): number {
  const surface = ship.visual.hullForm;
  // 2026-09-07 T1.10: 0.9-1.1 -> 0.85-1.15, matching the batch clamp.
  const value = MathUtils.clamp(surface?.hullValue ?? 1, 0.85, 1.15);
  const age = MathUtils.clamp(surface?.agePatina ?? 0, 0, 1);
  return value * MathUtils.lerp(1, 0.88, age);
}

export function createShip(
  ship: ShipNode,
  displayOffset: { x: number; y: number },
  representative: boolean,
  cache: GardenShipGeometryCache,
): ShipVisual {
  const root = new Group();
  const fineDetail = new Group();
  fineDetail.name = "ship-fine-detail";
  root.add(fineDetail);
  setTilePosition(root, ship.tile, GARDEN_SHIP_ROOT_Y);
  const silhouette = SILHOUETTE_FOR_HULL[ship.visual.hull];
  const tier = shipFleetTier(ship);
  // Procedural hull/rig parts a hero GLB replaces; the identity sail is tracked
  // separately so it can re-home onto the GLB main mast.
  const heroModelId = shipHeroModelId(ship);
  const heroHideable: Object3D[] = [];
  let identitySailMesh: Mesh | null = null;
  const visualScale = gardenShipVisualScale(ship.visual.scale || 1);
  root.scale.setScalar(visualScale);

  // W1 (D1/D2, warm-village C2): the hull is the FAMILY's timber; the
  // issuer's colour lives on the sheer strake, the pennant and the sails.
  // Same paint map and same whisper the batched fleet uses, so a hero's
  // fallback hull and a skiff of one family agree.
  const hullColor = batchedHullColor(ship);
  const trimColor = batchedTrimColor(ship);
  const accentColor = new Color(HARBOR_PALETTE.timber_warm).lerp(
    new Color(safeCssColor(ship.visual.livery?.accent, GARDEN_COLORS.roof)),
    0.78,
  );
  const keelMaterial = new MeshStandardMaterial({
    color: ship.riskZone === "danger"
      ? "#553833"
      : ship.riskZone === "warning"
        ? "#665143"
        : HARBOR_PALETTE.iron_dark,
    flatShading: true,
    roughness: 0.9,
  });
  // Baked vertex colors carry the 3-tone wood read (warm-dark waterline →
  // neutral flank → warm gunwale) and fake AO; they multiply the per-ship
  // livery material color, so hull hue stays per-ship. The old flat emissive
  // lift is gone — it washed the new shading flat.
  const hullMaterial = new MeshStandardMaterial({
    color: hullColor.clone().multiplyScalar(shipWoodSurfaceScale(ship)),
    flatShading: true,
    roughness: 0.82,
    vertexColors: true,
  });
  const deckMaterial = new MeshStandardMaterial({
    color: new Color(HARBOR_PALETTE.timber_warm).lerp(new Color(HARBOR_PALETTE.sun_day_warm), 0.22),
    flatShading: true,
    roughness: 0.92,
    vertexColors: true,
  });
  // W1/D2: the sheer strake, painted in the issuer's colour. The baked rim
  // vertex colours run bright, so this stays the most legible band on the hull
  // even under a dark brand.
  const gunwaleMaterial = new MeshStandardMaterial({
    color: trimColor,
    flatShading: true,
    roughness: 0.86,
    vertexColors: true,
  });
  const hullGeometry = cachedShipGeometry(
    cache,
    `hull.${silhouette}`,
    () => createHullGeometry(silhouette),
  );
  // The keel is the dark underbody — it keeps the flat iron color (no vertex
  // colors) so the waterline shadow reads as a distinct band beneath the hull.
  const keel = new Mesh(hullGeometry, keelMaterial);
  keel.position.y = -0.16;
  keel.scale.set(1.015, 0.82, 1.015);
  root.add(keel);
  heroHideable.push(keel);
  const hull = new Mesh(hullGeometry, hullMaterial);
  hull.position.y = 0.05;
  root.add(hull);
  heroHideable.push(hull);
  const gunwale = new Mesh(
    cachedShipGeometry(
      cache,
      `deck.${silhouette}.rim`,
      () => createDeckGeometry(silhouette, 0.91, 0.34, "rim"),
    ),
    gunwaleMaterial,
  );
  gunwale.position.y = 0.47;
  root.add(gunwale);
  heroHideable.push(gunwale);
  const deck = new Mesh(
    cachedShipGeometry(
      cache,
      `deck.${silhouette}.inner.sheer`,
      () => createDeckGeometry(silhouette, 0.86, 0.3, "inner"),
    ),
    deckMaterial,
  );
  deck.position.y = 0.5;
  fineDetail.add(deck);
  heroHideable.push(deck);

  const mastMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_dark,
    roughness: 0.92,
  });
  // S4: plain sails read as warm cream/ochre canvas with only a whisper of the
  // livery sail hue left in; the logo identity sail keeps the full livery
  // field via its canvas texture.
  // F1: a hero's plain sails take the SAME dye as the batched fleet's, so a
  // titan and a skiff of the same issuer read as the same colour. This used to
  // be the livery's cream-mixed sail colour lifted a further 45% toward canvas,
  // which is how the whole fleet ended up in one band of oatmeal.
  const readableSailColor = weatheredSailColor(ship);
  const sailRestBraceRad = shipRestSailBraceRad(ship.id);
  // Warm the emissive toward lantern gold so the night curve backlights the
  // canvas as if a lantern hung beneath it (D4).
  const plainSailMaterial = new MeshStandardMaterial({
    color: readableSailColor,
    emissive: new Color(readableSailColor).lerp(new Color(HARBOR_PALETTE.lantern_glow), 0.4),
    emissiveIntensity: 0.045,
    roughness: 0.82,
    side: DoubleSide,
  });
  const identitySailMaterial = plainSailMaterial.clone();
  const mastGeometry = cachedShipGeometry(
    cache,
    "mast",
    () => new CylinderGeometry(0.055, 0.08, 1, 6),
  );
  const rig = GARDEN_SHIP_RIGS[silhouette];
  const identitySail = rig
    .flatMap((mastPlan, mastIndex) => mastPlan.sails.map((sailPlan, sailIndex) => ({
      area: sailPlan.width * sailPlan.height,
      mastIndex,
      sailIndex,
    })))
    .toSorted((left, right) => right.area - left.area)[0];
  const bowsprit = GARDEN_SHIP_BOWSPRITS[silhouette];
  const masts = new InstancedMesh(
    mastGeometry,
    mastMaterial,
    rig.length + (bowsprit ? 1 : 0),
  );
  const mastRotation = GARDEN_SHIP_MAST_RAKE[silhouette];
  for (const [mastIndex, mastPlan] of rig.entries()) {
    scratchMatrix.makeRotationZ(mastRotation);
    scratchMatrix.scale(scratchPosition.set(1, mastPlan.height, 1));
    scratchMatrix.setPosition(mastPlan.x, 0.55 + mastPlan.height / 2, mastPlan.z ?? 0);
    masts.setMatrixAt(mastIndex, scratchMatrix);
    for (const [sailIndex, sailPlan] of mastPlan.sails.entries()) {
      const reverse = sailPlan.reverse ?? false;
      const square = sailPlan.kind === "rectangle";
      const isIdentitySail = identitySail?.mastIndex === mastIndex
        && identitySail.sailIndex === sailIndex;
      const sailKey = [
        "sail",
        silhouette,
        mastIndex,
        sailIndex,
        sailPlan.kind,
        sailPlan.width,
        sailPlan.height,
        reverse ? "reverse" : "forward",
      ].join(".");
      const sail = new Mesh(
        cachedShipGeometry(cache, `${sailKey}.cloth`, () => createSailClothGeometry(sailPlan)),
        isIdentitySail ? identitySailMaterial : plainSailMaterial,
      );
      // W4.F1: the yard is timber on the mast material, a child of its cloth
      // so the dip and the brace carry both.
      if (square || sailPlan.kind === "fore-aft") {
        sail.add(new Mesh(
          cachedShipGeometry(cache, `${sailKey}.spars`, () => createSailSparGeometry(sailPlan)!),
          mastMaterial,
        ));
      }
      // A square sail hangs about its mast and braces there; the others run
      // from a point just off the mast along the keel.
      sail.position.set(
        mastPlan.x + (square ? 0 : reverse ? -0.06 : 0.06),
        sailPlan.centerY,
        (mastPlan.z ?? 0) + (square ? 0 : 0.03),
      );
      if (square) {
        sail.rotation.y = sailRestBraceRad;
        sail.userData.gardenSquareSail = true;
      }
      if (isIdentitySail) {
        if (square) sail.scale.setScalar(IDENTITY_SQUARE_SAIL_SCALE);
        else sail.scale.set(1.22, 1.22, 1);
        identitySailMesh = sail;
      } else {
        heroHideable.push(sail);
      }
      root.add(sail);
    }
  }
  if (bowsprit) {
    scratchMatrix.makeRotationZ(Math.PI / 2);
    scratchMatrix.scale(scratchPosition.set(1, bowsprit.length, 1));
    scratchMatrix.setPosition(bowsprit.x, 0.95, 0);
    masts.setMatrixAt(rig.length, scratchMatrix);
  }
  masts.instanceMatrix.needsUpdate = true;
  root.add(masts);
  heroHideable.push(masts);

  const cabinDimensions = GARDEN_SHIP_CABINS[silhouette];
  if (cabinDimensions) {
    const cabin = new Mesh(
      cachedShipGeometry(
        cache,
        `cabin.${silhouette}`,
        () => new BoxGeometry(
          cabinDimensions.width,
          cabinDimensions.height,
          cabinDimensions.z,
        ),
      ),
      new MeshStandardMaterial({
        color: new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(HARBOR_PALETTE.timber_mid), 0.42),
        flatShading: true,
        roughness: 0.9,
      }),
    );
    cabin.position.set(cabinDimensions.x, 0.52 + cabinDimensions.height / 2, 0);
    root.add(cabin);
    heroHideable.push(cabin);
    const cabinRoof = new Mesh(
      cachedShipGeometry(
        cache,
        `cabin.${silhouette}.roof`,
        () => new BoxGeometry(cabinDimensions.width * 1.12, 0.12, cabinDimensions.z * 1.16),
      ),
      mastMaterial,
    );
    cabinRoof.position.set(
      cabinDimensions.x,
      0.58 + cabinDimensions.height,
      0,
    );
    fineDetail.add(cabinRoof);
    heroHideable.push(cabinRoof);
  }

  const tallestMast = rig.reduce((tallest, entry) => (
    entry.height > tallest.height ? entry : tallest
  ));
  // Rigging (and junk sail battens) batch into one cached LineSegments per
  // silhouette. Titans and heritage hulls keep it on the root so it survives at
  // overview zoom; standard ships gate it to fine detail to hold draw calls flat.
  const rigging = new LineSegments(
    cachedShipGeometry(
      cache,
      `rigging.${silhouette}`,
      () => new BufferGeometry().setFromPoints(riggingPoints(silhouette, rig)),
    ),
    // W6: warmed from a flat brown toward lantern gold. LineBasicMaterial is
    // unlit, so its colour IS its night appearance — lifting it is the only way
    // standing rigging reads once the sun is down.
    new LineBasicMaterial({
      color: "#57452f",
      opacity: 0.62,
      transparent: true,
    }),
  );
  (tier === "standard" ? fineDetail : root).add(rigging);
  heroHideable.push(rigging);
  const flag = new Mesh(
    cachedShipGeometry(cache, "pennant", createPennantGeometry),
    new MeshStandardMaterial({
      color: accentColor,
      emissive: accentColor,
      emissiveIntensity: 0.08,
      roughness: 0.82,
      side: DoubleSide,
    }),
  );
  flag.position.set(tallestMast.x, tallestMast.height + 0.52, (tallestMast.z ?? 0) + 0.02);
  flag.rotation.z = ship.visual.hullForm?.propRotation ?? 0;
  fineDetail.add(flag);
  heroHideable.push(flag);

  // The overlay signal is a ~0.5-unit badge pinned to the
  // rig — legible from default framing in, three pixels of noise from whole-map
  // framing out. They hang off their own group so `garden-overview-lod` can
  // shed both with one gate per hull rather than four.
  const overviewDetail = new Group();
  overviewDetail.name = "ship-overview-detail";
  root.add(overviewDetail);

  if (ship.visual.overlay !== "none") {
    const overlayColor = ship.visual.overlay === "nav"
      ? HARBOR_PALETTE.lantern_cold
      : ship.visual.overlay === "yield"
        ? HARBOR_PALETTE.aurora_green
        : "#c9675c";
    const signalShape = new Shape();
    signalShape.moveTo(0, 0);
    signalShape.lineTo(0.56, 0);
    signalShape.lineTo(0.56, -0.56);
    signalShape.lineTo(0, -0.56);
    signalShape.closePath();
    const signal = new Mesh(
      cachedShipGeometry(cache, "signal-square", () => new ShapeGeometry(signalShape)),
      new MeshStandardMaterial({
        color: overlayColor,
        emissive: overlayColor,
        emissiveIntensity: 0.1,
        side: DoubleSide,
      }),
    );
    signal.name = `ship-signal-${ship.visual.overlay}`;
    signal.position.set(tallestMast.x + 0.12, tallestMast.height + 0.18, 0.055);
    overviewDetail.add(signal);
    if (ship.visual.overlay === "watch") {
      const watchQuarter = new Mesh(
        cachedShipGeometry(cache, "signal-watch-quarter", () => new ShapeGeometry(signalShape)),
        new MeshBasicMaterial({
          color: GARDEN_COLORS.limestoneLight,
          side: DoubleSide,
        }),
      );
      watchQuarter.scale.setScalar(0.48);
      watchQuarter.position.set(
        tallestMast.x + 0.12,
        tallestMast.height + 0.18,
        0.06,
      );
      overviewDetail.add(watchQuarter);
    }
  }

  applyShipPegTrim(root, ship);
  const motion = FLEET_TIER_MOTION[tier];
  // Subtle livery cast multiplied over the hero wood on attach (white base × a
  // mostly-white tint keeps the baked 3-tone shading readable).
  const heroHullTint = new Color("#ffffff").lerp(
    new Color(safeCssColor(ship.visual.livery?.primary, "#ffffff")),
    0.3,
  ).multiplyScalar(shipWoodSurfaceScale(ship));
  return {
    agePatina: MathUtils.clamp(ship.visual.hullForm?.agePatina ?? 0, 0, 1),
    atlasCell: 0,
    batched: false,
    sailColor: readableSailColor,
    sailRestBraceRad,
    bobPhase: stableUnit(ship.id) * Math.PI * 2,
    displayOffset,
    fineDetail,
    heroHideable,
    heroHullTint,
    heroModelId,
    hullColor,
    trimColor,
    identitySail: identitySailMesh,
    identitySailMaterial,
    sternLantern: gardenShipSternLantern(silhouette).lamp,
    sternLanternOnPole: true,
    laneIntensity: FLEET_TIER_LANE_INTENSITY[tier],
    mastheadHeight: gardenShipMastheadOffset(silhouette).y,
    motionAmplitudeScale: motion.amplitude,
    motionPeriodScale: motion.period,
    pennant: flag,
    pennantColor: accentColor,
    prevHeadingAngle: null,
    representative,
    root,
    sampleState: "idle",
    selectionRadius: gardenShipSelectionRadius(ship),
    ship,
    silhouette,
    swaySeed: stableUnit(`${ship.id}.sway`) * Math.PI * 2,
    tier,
    wakeSlot: -1,
  };
}

/**
 * Swaps a titan/unique ship's procedural hull for its loaded hero GLB: hides the
 * procedural hull/rig (the identity logo sail, data overlays and lantern
 * sprites stay), clones each GLB material so this instance can tint the wood by
 * livery without touching the shared model cache, and re-homes the identity sail
 * onto the GLB main mast. Geometry stays shared with the cache (kept flat for the
 * geometry-count budget); Three re-uploads it after a content-swap dispose.
 *
 * The caller must only invoke this while the ship is still live; a rejected or
 * stale model promise leaves the procedural hull visible (the intended
 * asset-failure fallback).
 */
export function attachGardenHeroModel(visual: ShipVisual, model: Group): void {
  const heroId = visual.heroModelId;
  if (heroId === null) return;

  for (const part of visual.heroHideable) part.visible = false;

  const masthead = gardenModelAnchor(model, heroId, "masthead").position.clone();
  const sternLantern = gardenModelAnchor(model, heroId, "lantern-stern").position.clone();
  mergeGardenHeroStatics(visual, model);
  model.name = `hero-${heroId}`;
  // The GLB arrives after `createShip` has already trimmed the procedural
  // children, so it takes the same offset here or the hero rides level while
  // the rest of the fleet answers to its peg.
  const waterline = visual.ship.visual.hullForm?.waterline ?? 0;
  model.position.y += waterline;
  visual.root.add(model);

  // W6.4: the GLB's own masthead, so the mirror column is cut to the hull that
  // is actually standing there rather than to the procedural stand-in.
  visual.mastheadHeight = masthead.y + waterline;
  // W4.F7: the stern chōchin hangs where the GLB's own stern lamp is authored
  // (pre-trim, like every `sternLantern`); the procedural pole went with the
  // procedural hull.
  visual.sternLantern.copy(sternLantern);
  visual.sternLanternOnPole = false;

  if (visual.identitySail) {
    // Hang the logo sail as the main course, just below the furled topsail yard.
    //
    // It used to be scaled 1.6 x 1.75 with its rotation ZEROED, which squared a
    // flat oversized panel to the camera on every hero hull — a signboard bolted
    // to a ship rather than a sail bent to its yard. Keeping the rig's own slight
    // yaw and easing the scale back lets the curved patch geometry read as cloth
    // catching wind, which is what the sail already is underneath.
    //
    // W4.F1: a square identity sail hangs across the GLB's main mast and braces
    // about it (the frame loop keeps the brace on contract F-A's trim).
    const square = visual.identitySail.userData.gardenSquareSail === true;
    visual.identitySail.position.set(masthead.x, masthead.y * 0.64 + waterline, square ? 0 : 0.24);
    if (square) visual.identitySail.scale.set(1.28, 1.42, 1.28);
    else visual.identitySail.scale.set(1.28, 1.42, 1);
    visual.identitySail.rotation.set(0, square ? visual.sailRestBraceRad : HERO_IDENTITY_SAIL_YAW, 0);
  }
}

/**
 * Routes a hero's identity sail through the fleet's shared mark atlas.
 *
 * Shore-station voyages bring more hero hulls into the default frustum. Their
 * former one-texture-per-hero sails made that camera-dependent residency exceed
 * the texture ceiling even though stations themselves own no texture. Sharing
 * the already-painted fleet atlas preserves every mark and makes residency
 * independent of which cove a hero is visiting.
 */
export function assignGardenHeroSailAtlas(
  visual: ShipVisual,
  texture: CanvasTexture | null,
  cell: number,
): void {
  const material = visual.identitySailMaterial;
  if (!material || !texture || cell <= 0) return;
  const previousCompile = material.onBeforeCompile;
  const previousCacheKey = material.customProgramCacheKey.bind(material);
  material.map = texture;
  material.emissiveMap = null;
  material.color.copy(visual.sailColor);
  material.userData.gardenSailAtlas = true;
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile(shader, renderer);
    shader.uniforms.uHeroAtlasCell = { value: cell };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
        uniform float uHeroAtlasCell;
        varying vec2 vHeroAtlasUv;`,
      )
      .replace(
        "#include <uv_vertex>",
        `#include <uv_vertex>
        {
          float columns = ${FLEET_SAIL_ATLAS_COLUMNS}.0;
          float canvasRow = floor(uHeroAtlasCell / columns);
          float textureRow = columns - 1.0 - canvasRow;
          vec2 cellOrigin = vec2(mod(uHeroAtlasCell, columns), textureRow) / columns;
          vHeroAtlasUv = cellOrigin + uv / columns;
        }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
        varying vec2 vHeroAtlasUv;`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
          vec4 heroSailTexel = texture2D(map, vHeroAtlasUv);
          diffuseColor.rgb = mix(diffuseColor.rgb, heroSailTexel.rgb, heroSailTexel.a);
        #endif`,
      );
  };
  material.customProgramCacheKey = () => `${previousCacheKey()}|garden-hero-sail-atlas-v1`;
  material.needsUpdate = true;
}

function mergeGardenHeroStatics(visual: ShipVisual, model: Group): void {
  model.updateMatrixWorld(true);
  const inverseRoot = model.matrixWorld.clone().invert();
  const solidParts: BufferGeometry[] = [];
  const sailParts: BufferGeometry[] = [];

  model.traverse((object) => {
    if (!(object instanceof Mesh) || Array.isArray(object.material)) return;
    const source = object.geometry.clone();
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    geometry.applyMatrix4(inverseRoot.clone().multiply(object.matrixWorld));
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    const position = geometry.getAttribute("position");
    const sourceColor = geometry.getAttribute("color");
    const colors = new Float32Array(position.count * 3);
    const glow = new Float32Array(position.count);
    const surface = new Uint8Array(position.count * 2);
    const material = object.material as MeshStandardMaterial;
    const tint = material.color.clone();
    if (object.name === "wood-hull") tint.multiply(visual.heroHullTint);
    if (object.name === "trim-hull") tint.multiply(visual.trimColor);
    if (object.name === "sail-hull") tint.multiply(visual.sailColor);
    if (object.name === "spar-hull") tint.lerp(new Color("#597869"), visual.agePatina * 0.18);
    const bounds = geometry.boundingBox;
    const centerX = bounds ? (bounds.min.x + bounds.max.x) / 2 : 0;
    const centerY = bounds ? (bounds.min.y + bounds.max.y) / 2 : 0;
    const halfX = bounds ? Math.max(0.001, (bounds.max.x - bounds.min.x) / 2) : 1;
    const halfY = bounds ? Math.max(0.001, (bounds.max.y - bounds.min.y) / 2) : 1;
    for (let index = 0; index < position.count; index += 1) {
      const edge = object.name === "wood-hull"
        ? Math.max(
            Math.abs(position.getX(index) - centerX) / halfX,
            Math.abs(position.getY(index) - centerY) / halfY,
          )
        : 0;
      const wearLift = 1 + MathUtils.smoothstep(edge, 0.78, 1) * visual.agePatina * 0.075;
      colors[index * 3] = tint.r * (sourceColor?.getX(index) ?? 1) * wearLift;
      colors[index * 3 + 1] = tint.g * (sourceColor?.getY(index) ?? 1) * wearLift;
      colors[index * 3 + 2] = tint.b * (sourceColor?.getZ(index) ?? 1) * wearLift;
      glow[index] = object.name === "glow-hull" ? 1 : object.name === "spar-hull" ? 0.035 : 0;
      surface[index * 2] = Math.round(MathUtils.clamp(material.roughness ?? 0.84, 0, 1) * 255);
      surface[index * 2 + 1] = Math.round(MathUtils.clamp(material.metalness ?? 0, 0, 1) * 255);
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    geometry.setAttribute("aHeroGlow", new Float32BufferAttribute(glow, 1));
    geometry.setAttribute("aHeroSurface", new Uint8BufferAttribute(surface, 2, true));
    if (object.name === "sail-hull") sailParts.push(geometry);
    else solidParts.push(geometry);
  });

  model.clear();
  const build = (parts: BufferGeometry[], name: string, canvas: boolean): void => {
    if (parts.length === 0) return;
    const geometry = mergeGeometries(parts, false)!;
    const material = new MeshStandardMaterial({
      color: "#ffffff",
      flatShading: !canvas,
      roughness: canvas ? 0.8 : 1,
      metalness: canvas ? 0 : 1,
      side: DoubleSide,
      vertexColors: true,
    });
    if (!canvas) {
      const previousCompile = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        previousCompile.call(material, shader, renderer);
        shader.vertexShader = shader.vertexShader
          .replace("#include <common>", "#include <common>\nattribute float aHeroGlow; varying float vHeroGlow; attribute vec2 aHeroSurface; varying vec2 vHeroSurface;")
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHeroGlow = aHeroGlow; vHeroSurface = aHeroSurface;");
        shader.fragmentShader = shader.fragmentShader
          .replace("#include <common>", "#include <common>\nvarying float vHeroGlow; varying vec2 vHeroSurface;")
          .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor *= vHeroSurface.x;")
          .replace("#include <metalnessmap_fragment>", "#include <metalnessmap_fragment>\nmetalnessFactor *= vHeroSurface.y;")
          .replace(
            "#include <emissivemap_fragment>",
            "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.72, 0.35) * vHeroGlow * 1.4;",
          );
      };
      material.customProgramCacheKey = () => "garden-hero-merged-solid-v2";
    }
    const mesh = new Mesh(geometry, material);
    mesh.name = name;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    model.add(mesh);
  };
  build(solidParts, "hero-merged-solid", false);
  build(sailParts, "hero-merged-canvas", true);
}

/**
 * W3.7: hands the frame's hover/selection to the batched fleet as ATTENTION.
 *
 * The batch has no ship ids — it is instanced geometry with per-instance
 * buffers — so the bridge is the atlas cell, the one stable per-ship number
 * that already crosses into it. This resolves at most two ids per frame and
 * only walks the fleet when one of them has actually changed, so a still
 * pointer over a 205-ship harbour costs two string comparisons.
 *
 * Attention itself (the eased envelopes, the crossfade when the pointer moves
 * from one ship to the next) lives in `garden-fleet-batch`, next to the
 * restraint it cancels.
 */
export function syncFleetSailAttention(
  content: ShipSailTextureTarget,
  frame: ThreeWorldRendererFrame,
): void {
  const hovered = frame.hoveredDetailId;
  const selected = frame.selectedDetailId;
  // The ships array is re-created by every world build, and a world build also
  // REASSIGNS atlas cells. So the memo has to be keyed on the fleet as well as
  // on the ids: a refresh that keeps the same ship selected can still move that
  // ship's cell, and a cached cell would then light a stranger.
  if (
    hovered !== lastAttentionHovered
    || selected !== lastAttentionSelected
    || content.ships !== lastAttentionShips
  ) {
    lastAttentionHovered = hovered;
    lastAttentionSelected = selected;
    lastAttentionShips = content.ships;
    lastAttentionHoveredCell = 0;
    lastAttentionSelectedCell = 0;
    if (hovered !== null || selected !== null) {
      for (const visual of content.ships) {
        // Hero ships are not in the batch at all — they own their own sail
        // material and never took the framing step, so they need no restoring.
        if (!visual.batched) continue;
        const id = visual.ship.detailId;
        if (id === hovered) lastAttentionHoveredCell = visual.atlasCell;
        if (id === selected) lastAttentionSelectedCell = visual.atlasCell;
      }
    }
  }
  // The batch's own clock: `frame.timeSeconds` is pinned at 0 under reduced
  // motion, which would freeze an envelope mid-ease — so reduced motion is
  // passed through and snaps the value instead of easing it.
  const delta = frame.timeSeconds - lastAttentionTimeSeconds;
  lastAttentionTimeSeconds = frame.timeSeconds;
  setFleetAttention({
    deltaSeconds: Number.isFinite(delta) ? delta : 0,
    hoveredCell: lastAttentionHoveredCell,
    reducedMotion: frame.reducedMotion,
    selectedCell: lastAttentionSelectedCell,
  });
}

let lastAttentionHovered: string | null = null;
let lastAttentionSelected: string | null = null;
let lastAttentionShips: readonly ShipVisual[] | null = null;
let lastAttentionHoveredCell = 0;
let lastAttentionSelectedCell = 0;
let lastAttentionTimeSeconds = 0;

/** Forgets the memoised hover/selection so a fresh renderer starts clean. */
export function resetFleetSailAttention(): void {
  lastAttentionHovered = null;
  lastAttentionSelected = null;
  lastAttentionShips = null;
  lastAttentionHoveredCell = 0;
  lastAttentionSelectedCell = 0;
  lastAttentionTimeSeconds = 0;
  setFleetAttention(null);
}

export function syncShipSailTextures(
  content: ShipSailTextureTarget,
  frame: ThreeWorldRendererFrame,
): void {
  // W3.7: attention is a per-FRAME reading, so it runs before the logo-
  // generation guard below, which is a per-WORLD one. This function is the only
  // per-frame hook this module is given the frame on; the alternative was a
  // second call site in the renderer for two numbers.
  syncFleetSailAttention(content, frame);

  const generation = frame.logos.getLogoGenerationKey();
  if (content.logoGenerationKey === generation) return;
  content.logoGenerationKey = generation;

  for (const visual of content.ships) {
    // Batched ships shade from the shared sail-atlas material; only hero
    // ships still own a per-ship identity sail texture (W1 / D3).
    const material = visual.identitySailMaterial;
    if (!material) continue;
    if (material.userData.gardenSailAtlas === true) continue;
    const previousTexture = material.map;
    material.map = createGardenSailTexture(
      visual.ship,
      frame.logos.getLogo(visual.ship.logoSrc),
    );
    // F1: white when the map is present — the cloth colour is baked into the
    // canvas now, so a cream multiplier here only desaturates the dye.
    material.color.set(material.map ? "#ffffff" : visual.ship.visual.sailColor);
    material.emissive.set("#fff7e3");
    material.emissiveMap = material.map;
    material.needsUpdate = true;
    if (previousTexture && previousTexture !== material.map) previousTexture.dispose();
  }
}

/**
 * W4.F7: the chōchin body, ship-local, before the ship's scale: a paper barrel
 * 0.3 across and 0.42 tall. It scales with its hull (it was a fixed 0.24-unit
 * disc on every boat from skiff to titan).
 */
const LANTERN_BODY_WIDTH = 0.3;
const LANTERN_BODY_HEIGHT = 0.42;
// W1.10: a 3-unit additive halo per lantern was authored when 20 ships were on
// screen. At 187 ships (and up to 3 lanterns each) the halos overlap into a
// warm wash that flattens the whole frame — the opposite of the deep,
// selective night the brief asks for. A sub-unit halo keeps each lantern a
// point of light with a small bloom instead of a fleet-wide field of blobs.
const LANTERN_GLOW_SIZE = 0.95;
/** Pendulum swing at the lamp, ship-local: ~8° on its 0.26 drop. */
const LANTERN_SWAY = 0.035;
/** Day paper: unbleached washi, lit like any other surface. */
const LANTERN_PAPER = "#d9c9a8";
/** Lacquered top and bottom rims: dark by day, and they never kindle. */
const LANTERN_RIM_VALUE = 0.18;

export function patchShipLanternEmissiveMaterial(material: MeshStandardMaterial): void {
  material.vertexColors = true;
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <emissivemap_fragment>",
      `#include <emissivemap_fragment>
#ifdef USE_COLOR
  totalEmissiveRadiance *= vColor.rgb;
#endif`,
    );
  };
  material.customProgramCacheKey = () => "garden-ship-lantern-instanced-emissive-warmth";
}

/**
 * The chōchin: a six-sided lathe barrel with lacquered rims (36 triangles).
 * Vertex colour is white on the paper and dark on the rims, so the shared
 * warmth patch lights the paper and leaves the rims unlit. It hangs plumb, so
 * its matrix needs no billboard and no hull heel.
 */
function createChochinGeometry(): BufferGeometry {
  const geometry = new LatheGeometry([
    new Vector2(0.3, -0.5),
    new Vector2(0.47, -0.3),
    new Vector2(0.47, 0.3),
    new Vector2(0.3, 0.5),
  ], 6);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const value = Math.abs(position.getY(index)) > 0.45 ? LANTERN_RIM_VALUE : 1;
    colors.fill(value, index * 3, index * 3 + 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

function createLanternGlowGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(1, 1);
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(count * 3).fill(1), 3));
  return geometry;
}

/**
 * W4.F8 (fleet-craft-8): the hero band's standing rig as line segments in
 * ship-local space — per mast a forestay, a backstay and two shrouds (the
 * standing part of `riggingPoints`) — plus the W4.F7 stern pole and its lamp
 * arm. `widths` is each line's modelled thickness in ship-local units: the
 * frame pass turns it into projected pixels and writes alpha = coverage, so a
 * rope is drawn as faint as it is thin instead of as a 1-px scratch.
 */
interface FleetHeroRigLines {
  /** Six floats per segment (two endpoints). */
  points: Float32Array;
  widths: Float32Array;
}

const FLEET_RIG_STAY_WIDTH = 0.05;
const FLEET_RIG_SHROUD_WIDTH = 0.04;
const FLEET_RIG_POLE_WIDTH = 0.09;
const FLEET_RIG_ARM_WIDTH = 0.05;
/** Coverage below which a line fades out entirely (it would only shimmer). */
const FLEET_RIG_FADE_START = 0.18;
const FLEET_RIG_FADE_FULL = 0.5;
/** Rope and pole: dark timber, a shade under the batched mast. */
const FLEET_RIG_COLOR = new Color(HARBOR_PALETTE.timber_dark).multiplyScalar(0.8);

const fleetHeroRigCache = new Map<string, FleetHeroRigLines>();

function fleetHeroRigLines(silhouette: GardenHullSilhouette, standing: boolean): FleetHeroRigLines {
  const key = `${silhouette}.${standing ? "rig" : "pole"}`;
  const cached = fleetHeroRigCache.get(key);
  if (cached) return cached;
  const points: number[] = [];
  const widths: number[] = [];
  if (standing) {
    const stays = standingRiggingPoints(silhouette, GARDEN_SHIP_RIGS[silhouette]);
    for (let index = 0; index + 1 < stays.length; index += 2) {
      const from = stays[index]!;
      const to = stays[index + 1]!;
      points.push(from.x, from.y, from.z, to.x, to.y, to.z);
      // Pairs arrive forestay, backstay, shroud, shroud per mast.
      widths.push((index / 2) % 4 < 2 ? FLEET_RIG_STAY_WIDTH : FLEET_RIG_SHROUD_WIDTH);
    }
  }
  const lantern = gardenShipSternLantern(silhouette);
  points.push(
    lantern.foot.x, lantern.foot.y, lantern.foot.z, lantern.head.x, lantern.head.y, lantern.head.z,
    lantern.head.x, lantern.head.y, lantern.head.z, lantern.arm.x, lantern.arm.y, lantern.arm.z,
  );
  widths.push(FLEET_RIG_POLE_WIDTH, FLEET_RIG_ARM_WIDTH);
  const lines = { points: new Float32Array(points), widths: new Float32Array(widths) };
  fleetHeroRigCache.set(key, lines);
  return lines;
}

/** Lines a ship can draw: batched hulls carry the whole rig, heroes only a pole. */
function fleetHeroRigFor(visual: ShipVisual): FleetHeroRigLines | null {
  if (visual.batched) return fleetHeroRigLines(visual.silhouette, true);
  return visual.sternLanternOnPole ? fleetHeroRigLines(visual.silhouette, false) : null;
}

/**
 * Fleet-wide stern lanterns and the hero band's rig: an instanced chōchin body
 * (lit paper by day, kindled by the day cycle's dusk/night emissive), an
 * additive halo quad (opacity 0 by day), and one LineSegments for stays,
 * shrouds and stern poles. Three draw calls for the whole fleet; only ships
 * the frame pass reports present (the hero band) are written each frame.
 */
export function createFleetLanterns(
  ships: readonly ShipVisual[],
  cache: GardenShipGeometryCache,
): FleetLanterns {
  const entries = ships.map((visual) => ({ swayPhase: visual.swaySeed, visual }));
  const count = Math.max(1, entries.length);

  const coreMaterial = new MeshStandardMaterial({
    color: LANTERN_PAPER,
    emissive: HARBOR_PALETTE.lantern_glow,
    emissiveIntensity: 0,
    roughness: 0.9,
    toneMapped: false,
  });
  patchShipLanternEmissiveMaterial(coreMaterial);
  const cores = new InstancedMesh(
    cachedShipGeometry(cache, "lantern.chochin", createChochinGeometry),
    coreMaterial,
    count,
  );
  cores.name = "ship-lantern-cores";
  cores.frustumCulled = false;
  cores.renderOrder = 3;
  cores.count = 0;

  const glowMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: HARBOR_PALETTE.lantern_glow,
    depthWrite: false,
    map: createLanternGlowTexture(),
    opacity: 0,
    toneMapped: false,
    transparent: true,
    vertexColors: true,
  });
  const glow = new InstancedMesh(
    cachedShipGeometry(cache, "lantern.glow", createLanternGlowGeometry),
    glowMaterial,
    count,
  );
  glow.name = "ship-lantern-glow";
  glow.frustumCulled = false;
  glow.renderOrder = 3;
  glow.count = 0;

  let rigSegments = 0;
  for (const visual of ships) {
    // A hero GLB drops its pole on attach, never gains one: size for the most.
    rigSegments += visual.batched
      ? fleetHeroRigLines(visual.silhouette, true).widths.length
      : fleetHeroRigLines(visual.silhouette, false).widths.length;
  }
  const rigGeometry = new BufferGeometry();
  const rigPosition = new Float32BufferAttribute(new Float32Array(Math.max(1, rigSegments) * 6), 3);
  rigPosition.setUsage(DynamicDrawUsage);
  // RGBA: the alpha channel carries each line's projected coverage.
  const rigColor = new Float32BufferAttribute(new Float32Array(Math.max(1, rigSegments) * 8).fill(1), 4);
  rigColor.setUsage(DynamicDrawUsage);
  rigGeometry.setAttribute("position", rigPosition);
  rigGeometry.setAttribute("color", rigColor);
  rigGeometry.setDrawRange(0, 0);
  const rig = new LineSegments(
    rigGeometry,
    new LineBasicMaterial({
      color: FLEET_RIG_COLOR,
      depthWrite: false,
      transparent: true,
      vertexColors: true,
    }),
  );
  rig.name = "ship-hero-rig";
  rig.frustumCulled = false;

  const root = new Group();
  root.name = "ship-lanterns";
  root.add(cores, glow, rig);
  return {
    attention: createShipLanternAttentionState(),
    coreMaterial,
    cores,
    entries,
    glow,
    glowMaterial,
    rig,
    root,
  };
}

function createLanternGlowTexture(): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const size = 64;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, "rgba(255, 236, 196, 1)");
  gradient.addColorStop(0.4, "rgba(247, 214, 138, 0.55)");
  gradient.addColorStop(1, "rgba(247, 214, 138, 0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  const texture = new CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** One frame of the fleet lanterns and hero rig. */
export interface FleetLanternFrame {
  cameraQuaternion: Quaternion;
  /** World eye position, for each hero's projected line width. */
  eye?: { x: number; y: number; z: number };
  hoveredDetailId?: string | null;
  /**
   * Drawing-buffer pixels per world unit at unit distance
   * (`bufferHeight / (2 tan(fovY / 2))`). Zero or absent hides the rig: with no
   * projection there is no way to keep a line from reading as a scratch.
   */
  pixelsPerUnitAtUnitDistance?: number;
  /**
   * 0..1 per ship: 0 hides its lamp and rig (outside the hero band, thinned
   * out), fractions shrink the lamp and fade the rig. Absent = every ship at 1.
   */
  presence?: (visual: ShipVisual) => number;
  reducedMotion: boolean;
  selectedDetailId?: string | null;
  timeSeconds: number;
}

const lanternMatrix = new Matrix4();
const lanternRootMatrix = new Matrix4();
const lanternRootQuaternion = new Quaternion();
const lanternRootEuler = new Euler(0, 0, 0, "YXZ");
const lanternPlumb = new Quaternion();
const lanternPosition = new Vector3();
const lanternScale = new Vector3();
const lanternCoreWarmth = new Color();
const lanternGlowWarmth = new Color();

/**
 * The batch's per-instance hull form (`garden-fleet-batch.ts` HULL_FORM_DEFORM)
 * on the CPU, so the lamp, its pole and the stays land on the deformed hull.
 * Hero scene graphs take only the peg trim.
 */
function fleetLocalToShip(
  visual: ShipVisual,
  x: number,
  y: number,
  z: number,
  target: Vector3,
): Vector3 {
  const form = visual.ship.visual.hullForm;
  const waterline = form?.waterline ?? 0;
  if (!visual.batched) return target.set(x, y + waterline, z);
  const t = MathUtils.clamp(y / 0.45, 0, 1);
  const topsides = t * t * (3 - 2 * t);
  return target.set(
    x * (form?.length ?? 1),
    y * (1 + ((form?.height ?? 1) - 1) * topsides) + waterline,
    z * (form?.beam ?? 1),
  );
}

function fleetRigAlpha(coverage: number): number {
  return Math.min(1, coverage) * MathUtils.smoothstep(coverage, FLEET_RIG_FADE_START, FLEET_RIG_FADE_FULL);
}

/**
 * Rewrites the stern lanterns and the hero rig from each present ship's world
 * transform. Absent ships are skipped, not zero-scaled: both instance sets and
 * the line buffer are compacted to the ships actually shown, so the fleet pays
 * for ~20 lamps, not ~190. The lamp swings a little on its arm (frozen under
 * reduced motion); the rig rides the frozen pose.
 */
export function updateFleetLanterns(lanterns: FleetLanterns, frame: FleetLanternFrame): void {
  advanceShipLanternAttention(lanterns.attention, {
    hoveredDetailId: frame.hoveredDetailId ?? null,
    reducedMotion: frame.reducedMotion,
    selectedDetailId: frame.selectedDetailId ?? null,
    timeSeconds: frame.timeSeconds,
  });
  const pixelsPerUnit = frame.eye ? frame.pixelsPerUnitAtUnitDistance ?? 0 : 0;
  const rigPosition = lanterns.rig.geometry.getAttribute("position") as Float32BufferAttribute;
  const rigColor = lanterns.rig.geometry.getAttribute("color") as Float32BufferAttribute;
  const rigPositions = rigPosition.array as Float32Array;
  const rigColors = rigColor.array as Float32Array;
  const rigCapacity = rigPosition.count / 2;
  // A lamp is on only because it was kindled (§1.1 rule 2): the day cycle's
  // dusk/night emissive on the shared material is that kindling.
  const kindled = MathUtils.smoothstep(lanterns.coreMaterial.emissiveIntensity, 0.05, 0.3);
  let slot = 0;
  let segment = 0;
  for (let index = 0; index < lanterns.entries.length; index += 1) {
    const entry = lanterns.entries[index]!;
    const visual = entry.visual;
    const presence = frame.presence ? frame.presence(visual) : 1;
    if (!(presence > 0)) continue;
    const root = visual.root;
    // Same rotation order as the batch's instance matrix (heading, pitch, heel).
    lanternRootEuler.set(root.rotation.x, root.rotation.y, root.rotation.z, "YXZ");
    lanternRootQuaternion.setFromEuler(lanternRootEuler);
    lanternRootMatrix.compose(root.position, lanternRootQuaternion, root.scale);
    const shipScale = root.scale.x;
    const lines = pixelsPerUnit > 0 ? fleetHeroRigFor(visual) : null;
    // Device pixels per ship-local unit at this hull.
    const pixelsPerLocal = lines
      ? pixelsPerUnit * shipScale / Math.max(
        1e-3,
        Math.hypot(root.position.x - frame.eye!.x, root.position.y - frame.eye!.y, root.position.z - frame.eye!.z),
      )
      : 0;
    // By day an unlit paper lamp is only a lamp if its pole reads too; past
    // that distance it would be a cream speck floating off the stern.
    const poleVisible = lines && visual.sternLanternOnPole
      ? MathUtils.smoothstep(FLEET_RIG_POLE_WIDTH * pixelsPerLocal, 0.35, 0.8)
      : 1;
    const lampPresence = presence * Math.max(kindled, poleVisible);

    const swing = frame.reducedMotion
      ? 0
      : Math.sin(frame.timeSeconds * 0.9 + entry.swayPhase) * LANTERN_SWAY;
    const lamp = visual.sternLantern;
    fleetLocalToShip(visual, lamp.x + swing, lamp.y, lamp.z, lanternPosition)
      .applyMatrix4(lanternRootMatrix);
    const bodyScale = shipScale * lampPresence;
    lanternScale.set(
      LANTERN_BODY_WIDTH * bodyScale,
      LANTERN_BODY_HEIGHT * bodyScale,
      LANTERN_BODY_WIDTH * bodyScale,
    );
    lanternMatrix.compose(lanternPosition, lanternPlumb, lanternScale);
    lanterns.cores.setMatrixAt(slot, lanternMatrix);
    lanternScale.setScalar(LANTERN_GLOW_SIZE * lampPresence);
    lanternMatrix.compose(lanternPosition, frame.cameraQuaternion, lanternScale);
    lanterns.glow.setMatrixAt(slot, lanternMatrix);

    const warmth = shipLanternWarmth(lanterns.attention, visual.ship.detailId);
    // Instance colour is the per-lantern emissive gain: no extra mesh or pass,
    // and the same envelope warms both the kindled paper and painted halo.
    lanternCoreWarmth.setRGB(1 + warmth * 0.62, 1 + warmth * 0.28, 1 + warmth * 0.06);
    lanternGlowWarmth.setRGB(1 + warmth * 0.32, 1 + warmth * 0.16, 1 + warmth * 0.04);
    lanterns.cores.setColorAt(slot, lanternCoreWarmth);
    lanterns.glow.setColorAt(slot, lanternGlowWarmth);
    if (lampPresence > 0) slot += 1;

    if (!lines) continue;
    const count = lines.widths.length;
    if (segment + count > rigCapacity) continue;
    if (!(fleetRigAlpha(FLEET_RIG_POLE_WIDTH * pixelsPerLocal) > 0)) continue;
    for (let line = 0; line < count; line += 1) {
      const source = line * 6;
      const target = (segment + line) * 6;
      for (let end = 0; end < 2; end += 1) {
        const offset = source + end * 3;
        fleetLocalToShip(
          visual,
          lines.points[offset]!,
          lines.points[offset + 1]!,
          lines.points[offset + 2]!,
          lanternPosition,
        ).applyMatrix4(lanternRootMatrix);
        rigPositions[target + end * 3] = lanternPosition.x;
        rigPositions[target + end * 3 + 1] = lanternPosition.y;
        rigPositions[target + end * 3 + 2] = lanternPosition.z;
      }
      const alpha = fleetRigAlpha(lines.widths[line]! * pixelsPerLocal) * presence;
      rigColors[(segment + line) * 8 + 3] = alpha;
      rigColors[(segment + line) * 8 + 7] = alpha;
    }
    segment += count;
  }
  flushLanternInstances(lanterns.cores, slot);
  flushLanternInstances(lanterns.glow, slot);
  lanterns.rig.geometry.setDrawRange(0, segment * 2);
  if (segment > 0) {
    rigPosition.clearUpdateRanges();
    rigPosition.addUpdateRange(0, segment * 6);
    rigPosition.needsUpdate = true;
    rigColor.clearUpdateRanges();
    rigColor.addUpdateRange(0, segment * 8);
    rigColor.needsUpdate = true;
  }
}

/** Draws the first `count` instances and uploads only those. */
function flushLanternInstances(mesh: InstancedMesh, count: number): void {
  mesh.count = count;
  if (count === 0) return;
  mesh.instanceMatrix.clearUpdateRanges();
  mesh.instanceMatrix.addUpdateRange(0, count * 16);
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) {
    mesh.instanceColor.clearUpdateRanges();
    mesh.instanceColor.addUpdateRange(0, count * 3);
    mesh.instanceColor.needsUpdate = true;
  }
}

/**
 * S8 motion poetry: the masthead pennant (the ship's single livery accent)
 * flutters with the wind — a slow yaw flap plus a slight shortening as it
 * swings. Larger hulls flutter slower (titans slowest, D7 motion hierarchy);
 * under reduced motion the pennant freezes flat, as every other motion does.
 * Cheap enough to run for the whole fleet each frame; pennants on hero-GLB
 * ships are hidden anyway and simply no-op visually.
 */
export function updateShipPennants(
  ships: readonly ShipVisual[],
  timeSeconds: number,
  reducedMotion: boolean,
): void {
  for (const visual of ships) {
    // Batched pennants are instances stamped from the ship transform; they
    // inherit the hull's pose and need no per-mesh flutter (W1 / D2).
    const pennant = visual.pennant;
    if (!pennant) continue;
    if (reducedMotion) {
      pennant.rotation.y = 0;
      pennant.scale.x = 1;
      continue;
    }
    const wave = Math.sin(
      timeSeconds * (2.2 / visual.motionPeriodScale) + visual.swaySeed * 2.7,
    );
    pennant.rotation.y = wave * 0.3;
    pennant.scale.x = 1 - Math.abs(wave) * 0.09;
  }
}

/**
 * S7 grounding: registers karesansui ripple rings (contract C2 (d)) at the
 * waterline of moored/idle ships, and removes them as soon as a ship gets
 * underway, the tier drops below balanced, or reduced motion freezes the
 * sea. Rings are capped below GARDEN_WATER_MAX_RIPPLE_RINGS so Lane Z's
 * islet rings and the island ring keep headroom.
 *
 * Defensive by contract: the Lane W runtime lands concurrently — pass
 * `null`/`undefined` (or nothing) and this is a no-op.
 */
export function syncShipRippleRings(
  emitter: GardenRippleRingEmitter | null | undefined,
  ships: readonly ShipVisual[],
  frame: { reducedMotion: boolean; tier: string },
): void {
  if (!emitter) return;
  // S1: callers resolve `tier` through `seaQualityTier`, so a camera drag no
  // longer counts as load pressure here. Reading the raw tier made every moored
  // ship's ring vanish the instant the camera moved (measured: 24 -> 15) and
  // pop back on release.
  const ringsAllowed = !frame.reducedMotion
    && (frame.tier === "full" || frame.tier === "balanced");
  const ringBudget = Math.max(0, GARDEN_WATER_MAX_RIPPLE_RINGS - 3);
  let registered = 0;
  for (const visual of ships) {
    const id = `ship-mooring.${visual.ship.id}`;
    const slow = visual.sampleState === "moored" || visual.sampleState === "idle";
    if (!ringsAllowed || !slow || registered >= ringBudget) {
      emitter.removeRing(id);
      continue;
    }
    registered += 1;
    const scale = visual.root.scale.x;
    emitter.setRing({
      id,
      center: { x: visual.root.position.x, z: visual.root.position.z },
      radius: 1.4 + 3.6 * scale,
      bands: 2,
      periodSeconds: 8.5 * visual.motionPeriodScale,
      strength: 0.22,
    });
  }
}

/**
 * W1 (decision D2): builds the merged, instance-ready geometry pair for one
 * silhouette — everything `createShip` used to spread across ~14 meshes.
 *
 * The hull assembly bakes each part's tonal identity into vertex colors (via
 * `FLEET_BATCH_TINTS`) so one `instanceColor` carrying the ship's livery
 * reproduces the old multi-material read in a single draw call. Sails merge
 * separately because they need the atlas UV path and double-sided shading.
 *
 * Local transforms below MUST match `createShip`'s part placement exactly —
 * hero hulls, hit testing and follow-selected all assume the same ship-local
 * frame.
 */
export function createFleetBatchGeometry(
  silhouette: GardenHullSilhouette,
): FleetBatchGeometrySource {
  const hullGeometry = createHullGeometry(silhouette);
  const rig = GARDEN_SHIP_RIGS[silhouette];
  const bowsprit = GARDEN_SHIP_BOWSPRITS[silhouette];
  const mastRotation = GARDEN_SHIP_MAST_RAKE[silhouette];

  const parts: {
    geometry: BufferGeometry;
    strake?: boolean;
    tint?: Color;
    transform?: Matrix4;
  }[] = [];
  const transform = () => new Matrix4();

  // Keel: dark underbody, slightly wider and squashed, sunk below the hull.
  parts.push({
    geometry: hullGeometry,
    tint: FLEET_BATCH_TINTS.keel,
    transform: transform().makeScale(1.015, 0.82, 1.015).setPosition(0, -0.16, 0),
  });
  // Hull proper: untinted, so instanceColor delivers the livery unmodified.
  parts.push({
    geometry: hullGeometry,
    transform: transform().setPosition(0, 0.05, 0),
  });
  // W1/D2: the gunwale ring IS the sheer strake — it already follows the sheer
  // curve exactly and faces the camera, so it takes the issuer's paint while
  // every other part takes the ship's timber.
  //
  // The inner deck plate below sits at 0.86 (was 0.79) so what is left proud of
  // it is a RAIL, not a deck. At 0.79 the painted annulus covered most of the
  // deck well and a small hull read as a plastic tray with a coloured tub in it.
  parts.push({
    geometry: createDeckGeometry(silhouette, 0.91, 0.34, "rim"),
    strake: true,
    tint: FLEET_BATCH_TINTS.gunwale,
    transform: transform().setPosition(0, 0.47, 0),
  });
  parts.push({
    geometry: createDeckGeometry(silhouette, 0.86, 0.3, "inner"),
    tint: FLEET_BATCH_TINTS.deck,
    transform: transform().setPosition(0, 0.5, 0),
  });

  const mastGeometry = new CylinderGeometry(0.055, 0.08, 1, 6);
  for (const mastPlan of rig) {
    const matrix = transform().makeRotationZ(mastRotation);
    matrix.scale(new Vector3(1, mastPlan.height, 1));
    matrix.setPosition(mastPlan.x, 0.55 + mastPlan.height / 2, mastPlan.z ?? 0);
    parts.push({ geometry: mastGeometry, tint: FLEET_BATCH_TINTS.mast, transform: matrix });
  }
  if (bowsprit) {
    const matrix = transform().makeRotationZ(Math.PI / 2);
    matrix.scale(new Vector3(1, bowsprit.length, 1));
    matrix.setPosition(bowsprit.x, 0.95, 0);
    parts.push({ geometry: mastGeometry, tint: FLEET_BATCH_TINTS.mast, transform: matrix });
  }

  const cabinDimensions = GARDEN_SHIP_CABINS[silhouette];
  if (cabinDimensions) {
    parts.push({
      geometry: new BoxGeometry(cabinDimensions.width, cabinDimensions.height, cabinDimensions.z),
      tint: FLEET_BATCH_TINTS.mast,
      transform: transform().setPosition(
        cabinDimensions.x,
        0.52 + cabinDimensions.height / 2,
        0,
      ),
    });
    if (silhouette !== "bezaisen") {
      parts.push({
        geometry: new BoxGeometry(cabinDimensions.width * 1.12, 0.12, cabinDimensions.z * 1.16),
        tint: FLEET_BATCH_TINTS.mast,
        transform: transform().setPosition(cabinDimensions.x, 0.58 + cabinDimensions.height, 0),
      });
    }
  }

  addFamilySilhouetteParts(parts, silhouette);

  // W2.4: deck furniture. `DECK_Y` is the inner deck plate; props sit on it.
  const props = GARDEN_SHIP_DECK_PROPS[silhouette];
  const DECK_Y = 0.52;
  for (const x of props.hatches ?? []) {
    parts.push({
      geometry: new BoxGeometry(0.44, 0.1, 0.4),
      tint: FLEET_BATCH_TINTS.mast,
      transform: transform().setPosition(x, DECK_Y + 0.05, 0),
    });
  }
  if (props.capstan !== undefined) {
    parts.push({
      geometry: new CylinderGeometry(0.13, 0.16, 0.3, 6),
      tint: FLEET_BATCH_TINTS.gunwale,
      transform: transform().setPosition(props.capstan, DECK_Y + 0.15, 0),
    });
  }
  if (props.boat !== undefined) {
    parts.push({
      geometry: new BoxGeometry(0.95, 0.2, 0.34),
      tint: FLEET_BATCH_TINTS.gunwale,
      transform: transform().setPosition(props.boat, DECK_Y + 0.14, 0),
    });
  }
  // W6: a boat towed astern on its painter. Rides at the waterline (ship-local
  // y is 0.38 above the sea), so it bobs with the hull it trails. Merchant
  // hulls only — a ship that works cargo keeps a boat in the water.
  if (props.towedBoat !== undefined) {
    const sternX = props.towedBoat;
    parts.push({
      geometry: new BoxGeometry(0.8, 0.22, 0.32),
      tint: FLEET_BATCH_TINTS.gunwale,
      transform: transform().setPosition(sternX - 1.15, -0.3, 0.16),
    });
    parts.push({
      geometry: new BoxGeometry(0.62, 0.07, 0.2),
      tint: FLEET_BATCH_TINTS.mast,
      transform: transform().setPosition(sternX - 1.15, -0.19, 0.16),
    });
    // The painter itself, sloping down from the taffrail to the boat's stem.
    parts.push({
      geometry: new BoxGeometry(0.9, 0.035, 0.035),
      tint: FLEET_BATCH_TINTS.mast,
      transform: transform().makeRotationZ(0.5).setPosition(sternX - 0.4, 0.02, 0.16),
    });
  }
  if (props.cargo) {
    const { columns, rows, x } = props.cargo;
    for (let column = 0; column < columns; column += 1) {
      for (let row = 0; row < rows; row += 1) {
        parts.push({
          geometry: new BoxGeometry(0.36, 0.26, 0.32),
          tint: (column + row) % 2 === 0 ? FLEET_BATCH_TINTS.mast : FLEET_BATCH_TINTS.gunwale,
          transform: transform().setPosition(
            x + (column - (columns - 1) / 2) * 0.42,
            DECK_Y + 0.13 + (row % 2) * 0.26,
            (row - (rows - 1) / 2) * 0.38,
          ),
        });
      }
    }
  }

  const hull = mergeTintedParts(parts);
  for (const part of parts) {
    if (part.geometry !== hullGeometry) part.geometry.dispose();
  }
  hullGeometry.dispose();

  // Sails. The largest by area is the identity sail: only its vertices route
  // through the per-instance logo atlas cell (D3).
  const identitySail = rig
    .flatMap((mastPlan, mastIndex) => mastPlan.sails.map((sailPlan, sailIndex) => ({
      area: sailPlan.width * sailPlan.height,
      mastIndex,
      sailIndex,
    })))
    .toSorted((left, right) => right.area - left.area)[0];

  const sailParts: {
    geometry: BufferGeometry;
    pivot?: { x: number; z: number } | undefined;
    transform?: Matrix4;
  }[] = [];
  // W2.3/W4: each sail gets an index so a per-instance bitmask can furl it.
  //
  // The index BANDS are load-bearing, not just identifiers:
  //   0     the identity sail, never furled — the emblem is the fleet's
  //         heraldry and has to survive a ship sitting at anchor
  //   1-2   courses (the lowest sail on a mast)
  //   3-5   upper sails (topsails, topgallants, jibs)
  // A ship at anchor hands her topsails and leaves her courses hanging, which
  // is both what a real ship does and what stops a taller rig from reading as
  // a row of bare flagpoles. Banding the indices is what lets the furl policy
  // say "uppers" without knowing any silhouette's rig plan.
  let courseIndex = FURL_COURSE_FIRST;
  let upperIndex = FURL_UPPER_FIRST;
  for (const [mastIndex, mastPlan] of rig.entries()) {
    for (const [sailIndex, sailPlan] of mastPlan.sails.entries()) {
      const reverse = sailPlan.reverse ?? false;
      const isIdentitySail = identitySail?.mastIndex === mastIndex
        && identitySail.sailIndex === sailIndex;
      const geometry = createSailGeometry(sailPlan);
      markAtlasSail(geometry, isIdentitySail);
      if (isIdentitySail) {
        markFurlableSail(geometry, 0);
      } else if (sailIndex === 0) {
        markFurlableSail(geometry, Math.min(courseIndex, FURL_UPPER_FIRST - 1));
        courseIndex += 1;
      } else {
        markFurlableSail(geometry, Math.min(upperIndex, FLEET_MAX_SAILS - 1));
        upperIndex += 1;
      }
      const matrix = transform();
      const square = sailPlan.kind === "rectangle";
      // F1: the mark lives on this sail alone, so the sail is deliberately
      // oversized against the rest of the rig — a ship's device has to be
      // readable at the zoom the fleet is scanned at, not just when one ship is
      // inspected.
      //
      // W3: 1.42 -> 1.2. The whole rig grew, so the emblem sail is larger in
      // absolute terms than it was at 1.42; keeping the old multiplier on the
      // new course made it wider than the gap to the next mast. W4.F1: a
      // square sail spans athwartships, so it scales uniformly (1.1).
      if (isIdentitySail) {
        if (square) matrix.makeScale(IDENTITY_SQUARE_SAIL_SCALE, IDENTITY_SQUARE_SAIL_SCALE, IDENTITY_SQUARE_SAIL_SCALE);
        else matrix.makeScale(1.2, 1.2, 1);
      }
      // A square sail is authored about its mast (the brace pivot); the others
      // run from a point just off the mast along the keel.
      matrix.setPosition(
        mastPlan.x + (square ? 0 : reverse ? -0.06 : 0.06),
        sailPlan.centerY,
        (mastPlan.z ?? 0) + (square ? 0 : 0.03),
      );
      sailParts.push({
        geometry,
        pivot: square ? { x: mastPlan.x, z: mastPlan.z ?? 0 } : undefined,
        transform: matrix,
      });
    }
  }
  const sails = mergeAtlasSails(sailParts);
  for (const part of sailParts) part.geometry.dispose();

  return { hull, sails, far: createFarFleetGeometry(silhouette) };
}

/**
 * W4.F3 (fleet-craft-3 ∪ critic-5): the far fleet is an ink silhouette in the
 * family's outline — a thin dark V-section hull sliver under the family's own
 * sail shapes, one 3-5-vertex polygon per mast. There is no deck plate to catch
 * the sun (the old extruded slab read as a plank) and no mast: at far distance
 * a spar is a 1-px scratch, so each sail's foot is dropped onto the rail
 * instead and the boat reads as one cut-paper shape.
 *
 * Square sails hang braced across the keel and fore-and-aft sails are sheeted
 * out, so no sail is ever edge-on to the eye whatever the heading. The far
 * material paints this in airlight inks (`garden-fleet-batch.ts`), so the
 * geometry carries only position, normal, uv, color and the cloth selector.
 */
const FAR_HULL_OUTLINES: Record<GardenHullSilhouette, readonly (readonly [number, number])[]> = {
  bezaisen: [[-3.4, -1], [-3.4, 1], [0, 1.28], [2.6, 0.84], [3.4, 0], [2.6, -0.84], [0, -1.28]],
  kobaya: [[-4.28, -0.38], [-4.28, 0.38], [-0.8, 0.65], [3.45, 0.48], [5.32, 0], [3.45, -0.48], [-0.8, -0.65]],
  twinhull: [[-4.5, 0], [-2.7, 0.44], [1.65, 0.46], [4.5, 0], [1.65, -0.46], [-2.7, -0.44]],
  takasebune: [[-5.92, 0], [-4.2, 1.4], [4.3, 1.4], [5.95, 0], [4.3, -1.4], [-4.2, -1.4]],
  junk: [[-3.12, -0.95], [-3.12, 0.95], [0.35, 1.3], [2.95, 0.72], [3.38, 0], [2.95, -0.72], [0.35, -1.3]],
  scow: [[-2.58, 0], [-2.12, 1.55], [0.2, 2], [2.58, 0], [0.2, -2], [-2.12, -1.55]],
};
/** Rail height: a touch above the near hull's, so the sliver survives at a dozen pixels. */
const FAR_HULL_RAIL_Y = 0.52;
const FAR_HULL_KEEL_Y = -0.3;
/** Keel half-beam as a share of the rail's: the V-section. */
const FAR_HULL_KEEL_PINCH = 0.18;
/** Every far sail's foot reaches down to the rail: no floating cloth. */
const FAR_SAIL_FOOT_MAX_Y = 0.95;
/** Square sails braced ~52° off the keel line. */
const FAR_SQUARE_BRACE = 0.9;
/** Fore-and-aft sails sheeted ~20° out, both to the same side. */
const FAR_FORE_AFT_SHEET = 0.35;

/** Sail outline as (along-yard, height) pairs from the mast, fan-triangulated from the first point. */
function farSailOutline(
  kind: GardenSailKind,
  direction: number,
  width: number,
  top: number,
  foot: number,
): readonly (readonly [number, number])[] {
  const height = top - foot;
  switch (kind) {
    case "rectangle":
      // A braced square with a concave (sheeted) foot, centred on the mast.
      return [
        [-width / 2, top], [width / 2, top], [width * 0.44, foot],
        [0, foot + height * 0.1], [-width * 0.44, foot],
      ];
    case "triangle":
      return [[0, top], [direction * width, foot + height * 0.11], [0, foot]];
    case "junk":
      return [
        [0, top], [direction * width * 0.72, top - height * 0.16], [direction * width, foot + height * 0.5],
        [direction * width * 0.86, foot + height * 0.125], [0, foot],
      ];
    case "fore-aft":
      // A lug: the yard peaks up away from the mast.
      return [
        [-direction * width * 0.12, top - height * 0.3], [direction * width, top],
        [direction * width * 0.94, foot], [0, foot],
      ];
  }
}

function createFarFleetGeometry(silhouette: GardenHullSilhouette): BufferGeometry {
  const outline = FAR_HULL_OUTLINES[silhouette];
  const count = outline.length;
  const hullPositions: number[] = [];
  const rail = outline.map(([x, z]) => [x, FAR_HULL_RAIL_Y, z] as const);
  const keel = outline.map(([x, z]) => [x * 0.94, FAR_HULL_KEEL_Y, z * FAR_HULL_KEEL_PINCH] as const);
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    hullPositions.push(...rail[index]!, ...keel[index]!, ...rail[next]!);
    hullPositions.push(...rail[next]!, ...keel[index]!, ...keel[next]!);
  }
  // The deck closes the silhouette for the whole-map view; the ink tone makes
  // it the same dark as the topsides, so it can no longer read as a plank.
  for (let index = 1; index < count - 1; index += 1) {
    hullPositions.push(...rail[0]!, ...rail[index]!, ...rail[index + 1]!);
  }
  const demiHull = new BufferGeometry();
  demiHull.setAttribute("position", new Float32BufferAttribute(hullPositions, 3));
  shapeHullVerticalForm(demiHull, silhouette);
  const hulls = (silhouette === "twinhull" ? [-1.02, 1.02] : [0]).map((z) => demiHull.clone().translate(0, 0, z));
  demiHull.dispose();

  const rig = GARDEN_SHIP_RIGS[silhouette];
  const largest = rig.reduce((best, candidate) => (
    candidate.sails[0]!.width * candidate.sails[0]!.height
      > best.sails[0]!.width * best.sails[0]!.height ? candidate : best
  ));
  const sailPositions: number[] = [];
  for (const mast of rig) {
    const plan = mast.sails[0]!;
    const scale = mast === largest ? 1.2 : 1;
    const width = plan.width * scale;
    const halfHeight = plan.height * scale * 0.5;
    const direction = plan.reverse ? -1 : 1;
    const top = plan.centerY + halfHeight;
    const foot = Math.min(plan.centerY - halfHeight, FAR_SAIL_FOOT_MAX_Y);
    const angle = plan.kind === "rectangle" ? FAR_SQUARE_BRACE : direction * FAR_FORE_AFT_SHEET;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const points = farSailOutline(plan.kind, direction, width, top, foot).map(([along, y]) => [
      mast.x + along * cos,
      y,
      (mast.z ?? 0) - along * sin,
    ] as const);
    for (let index = 1; index < points.length - 1; index += 1) {
      sailPositions.push(...points[0]!, ...points[index]!, ...points[index + 1]!);
    }
  }
  const sail = new BufferGeometry();
  sail.setAttribute("position", new Float32BufferAttribute(sailPositions, 3));

  const parts = [...hulls, sail];
  // Only the established cloth attributes: no new location on the program.
  for (const geometry of parts) {
    const vertices = geometry.getAttribute("position").count;
    geometry.computeVertexNormals();
    geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(vertices * 2), 2));
    geometry.setAttribute("color", new Float32BufferAttribute(new Float32Array(vertices * 3).fill(1), 3));
    markAtlasSail(geometry, geometry === sail);
  }
  const far = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  if (!far) throw new Error("garden-ships: far hull merge failed");
  return far;
}

type ShipPart = {
  geometry: BufferGeometry;
  tint?: Color;
  transform?: Matrix4;
};

/**
 * Family-defining structures that must survive the fleet merge. These are not
 * per-ship facts: they are the large, repeated shapes that let a 20 px hull be
 * named before its logo can be read.
 */
function addFamilySilhouetteParts(
  parts: ShipPart[],
  silhouette: GardenHullSilhouette,
): void {
  // A short deck lashing keeps the existing per-instance rope-sag surface
  // channel live without changing any family's outline or adding a draw.
  parts.push({
    geometry: new BoxGeometry(0.82, 0.035, 0.035),
    tint: FLEET_BATCH_TINTS.mast,
    transform: new Matrix4().setPosition(0.2, 0.76, 0.32),
  });

  if (silhouette === "twinhull") {
    // A bridge deck visibly spans the two hulls; two crossbeams leave water
    // showing fore and aft instead of turning the pair into one broad slab.
    parts.push({
      geometry: new BoxGeometry(3.7, 0.18, 3.05),
      tint: FLEET_BATCH_TINTS.deck,
      transform: new Matrix4().setPosition(0, 0.7, 0),
    });
    for (const x of [-1.75, 1.75]) {
      parts.push({
        geometry: new BoxGeometry(0.34, 0.28, 3.1),
        tint: FLEET_BATCH_TINTS.mast,
        transform: new Matrix4().setPosition(x, 0.61, 0),
      });
    }
  }

  if (silhouette === "bezaisen") {
    // W4.F6 (fleet-craft-6): the yagura's eave band and gentle roof — a
    // squashed half-cylinder over a dark trim band, the takasebune covers'
    // shape language — sized from the cabin table so the two cannot drift.
    // Deck 0.52 + house 0.9 = 1.42; the roof rises 1.10 * 0.22 ≈ 0.24 to a
    // crown of ≈1.68, below the braced yard's foot.
    const house = GARDEN_SHIP_CABINS.bezaisen!;
    const eaveY = 0.52 + house.height + 0.02;
    parts.push({
      geometry: new BoxGeometry(house.width * 1.12, 0.08, house.z * 1.12),
      tint: FLEET_BATCH_TINTS.mast,
      transform: new Matrix4().setPosition(house.x, eaveY, 0),
    });
    const roofRadius = house.z * 0.58;
    const roof = new CylinderGeometry(roofRadius, roofRadius, house.width * 1.14, 8, 1, false, 0, Math.PI);
    roof.rotateZ(Math.PI / 2);
    roof.scale(1, 0.22, 1);
    parts.push({
      geometry: roof,
      tint: FLEET_BATCH_TINTS.deck,
      transform: new Matrix4().setPosition(house.x, eaveY, 0),
    });
    // The misaki: a stem post rising from the forefoot, raked forward, its
    // head recurving aft — the prow that names the family at a distance.
    // Front corners stay inside x 3.65 (the 3.7 clearance reach).
    parts.push({
      geometry: new BoxGeometry(0.16, 1.16, 0.1),
      tint: FLEET_BATCH_TINTS.mast,
      transform: new Matrix4().makeRotationZ(-0.138).setPosition(3.48, 0.775, 0),
    }, {
      geometry: new BoxGeometry(0.14, 0.27, 0.1),
      tint: FLEET_BATCH_TINTS.mast,
      transform: new Matrix4().makeRotationZ(0.235).setPosition(3.53, 1.475, 0),
    });
  }

  if (silhouette === "takasebune") {
    // Two cargo banks of three, with an open working well amidships.
    for (const groupX of [-2.75, 2.75]) {
      for (const offset of [-0.94, 0, 0.94]) {
        const cover = new CylinderGeometry(0.96, 0.96, 0.86, 8, 1, false, 0, Math.PI);
        cover.rotateZ(Math.PI / 2);
        cover.scale(1, 0.65, 1);
        parts.push({
          geometry: cover,
          tint: FLEET_BATCH_TINTS.matting,
          transform: new Matrix4().setPosition(groupX + offset, 0.64, 0),
        });
        const hoop = new CylinderGeometry(0.99, 0.99, 0.06, 8, 1, true, 0, Math.PI);
        hoop.rotateZ(Math.PI / 2);
        hoop.scale(1, 0.65, 1);
        parts.push({
          geometry: hoop,
          tint: FLEET_BATCH_TINTS.mast,
          transform: new Matrix4().setPosition(groupX + offset, 0.64, 0),
        });
      }
      for (const angle of [-0.22, 0.22]) {
        parts.push({
          geometry: new BoxGeometry(2.9, 0.035, 0.045),
          tint: FLEET_BATCH_TINTS.mast,
          transform: new Matrix4().makeRotationY(angle).setPosition(groupX, 1.28, 0),
        });
      }
    }
    // A shipping oar rests inboard, clear of the working well.
    parts.push({
      geometry: new BoxGeometry(3.4, 0.07, 0.07),
      tint: FLEET_BATCH_TINTS.mast,
      transform: new Matrix4().setPosition(-0.4, 0.78, 1.12),
    }, {
      geometry: new BoxGeometry(0.7, 0.08, 0.24),
      tint: FLEET_BATCH_TINTS.mast,
      transform: new Matrix4().setPosition(1.6, 0.78, 1.12),
    });
  }
}

/** W2.3/W4: which sail this is, for the per-instance furl bitmask. */
function markFurlableSail(geometry: BufferGeometry, index: number): void {
  const count = geometry.getAttribute("position").count;
  geometry.setAttribute(
    "aSailIndex",
    new Float32BufferAttribute(new Float32Array(count).fill(index), 1),
  );
}

/**
 * W2.3/W4: the yard a furled sail bundles onto — the top edge of this sail,
 * in ship space. Every vertex of one sail carries the same head, so the shader
 * can collapse the cloth onto it without knowing the rig plan. W4.F1: a
 * square sail's head x/z is its mast, the pivot the shader braces it about.
 */
function bakeSailHead(geometry: BufferGeometry, pivot?: { x: number; z: number }): void {
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const head = new Float32Array(position.count * 3);
  const centerX = pivot?.x ?? (box.min.x + box.max.x) / 2;
  const centerZ = pivot?.z ?? (box.min.z + box.max.z) / 2;
  for (let index = 0; index < position.count; index += 1) {
    head[index * 3] = centerX;
    head[index * 3 + 1] = box.max.y;
    head[index * 3 + 2] = centerZ;
  }
  geometry.setAttribute("aSailHead", new Float32BufferAttribute(head, 3));
}

/**
 * Sails merge on their own path because `aAtlasSail` must survive the merge —
 * `mergeTintedParts` strips non-standard attributes to keep the hull inputs
 * uniform.
 */
function mergeAtlasSails(
  parts: readonly {
    geometry: BufferGeometry;
    pivot?: { x: number; z: number } | undefined;
    transform?: Matrix4;
  }[],
): BufferGeometry {
  const prepared: BufferGeometry[] = [];
  for (const part of parts) {
    const source = part.geometry.clone();
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    if (part.transform) geometry.applyMatrix4(part.transform);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("color")) {
      // Plain cloth: full shade, cloth flag, no panels (so never braced).
      const count = geometry.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) colors.set([1, 1, 0], index * 3);
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    }
    // The yard is only known once the sail sits in ship space, so `aSailHead`
    // is written after the transform rather than at authoring time.
    bakeSailHead(geometry, part.pivot);
    prepared.push(geometry);
  }
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  if (!merged) throw new Error("garden-ships: sail merge failed");
  return merged;
}

function createHullGeometry(silhouette: GardenHullSilhouette): BufferGeometry {
  if (silhouette !== "twinhull") return createSingleHullGeometry(silhouette);

  const demiHulls = [-1.02, 1.02].map((z) => {
    const geometry = createSingleHullGeometry(silhouette);
    geometry.translate(0, 0, z);
    return geometry;
  });
  const merged = mergeGeometries(demiHulls, false);
  for (const geometry of demiHulls) geometry.dispose();
  if (!merged) throw new Error("garden-ships: twin-hull merge failed");
  return merged;
}

function createSingleHullGeometry(silhouette: GardenHullSilhouette): ExtrudeGeometry {
  const shape = createHullShape(silhouette, 1);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.13,
    bevelThickness: 0.12,
    depth: 0.72,
    // W5.3: 4 vertical steps, not 1. `depth` becomes the vertical axis after
    // the rotateX below, so this is the only source of vertices between keel
    // and gunwale. At 1 step the sheer and tumblehome in shapeHullVerticalForm
    // could only interpolate linearly across the bevel rings, and there was
    // nowhere to hang planking. The cost is paid once per silhouette (four
    // cached geometries), not per ship.
    steps: 4,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.5, 0);
  shapeHullVerticalForm(geometry, silhouette);
  bakeHullVertexColors(geometry);
  return geometry;
}

/**
 * Bakes the 3-tone hull shading + fake AO into a vertex-color attribute (once,
 * on the cached geometry). Y runs keel→gunwale: a warm-dark waterline shadow
 * lifts through a neutral flank to a warm gunwale highlight; the very keel is
 * pinched darker for fake AO. Values multiply the per-ship livery color.
 *
 * W5.3 adds planking on top: `PLANK_STRAKES` horizontal bands across the
 * topsides, each seam pinched darker. This is what makes the batched fleet
 * read as built rather than extruded, and it costs nothing at runtime — the
 * banding rides the vertex color the hull already carried. It needs the
 * subdivided hull from `createHullGeometry`; at 1 extrude step there were not
 * enough vertical vertices to resolve a single plank.
 */
const PLANK_STRAKES = 7;

function bakeHullVertexColors(geometry: BufferGeometry): void {
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const span = Math.max(0.001, box.max.y - box.min.y);
  const colors = new Float32Array(position.count * 3);
  const shadow = new Color(0.34, 0.26, 0.22);
  const mid = new Color(0.82, 0.79, 0.75);
  const highlight = new Color(1, 0.97, 0.9);
  const scratch = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const t = (position.getY(index) - box.min.y) / span;
    if (t < 0.5) {
      scratch.copy(shadow).lerp(mid, MathUtils.smoothstep(t, 0, 0.5));
    } else {
      scratch.copy(mid).lerp(highlight, MathUtils.smoothstep(t, 0.5, 1));
    }
    if (t < 0.16) scratch.multiplyScalar(0.72 + t * 1.5);
    // Planking: a sawtooth across the strake bands, darkest at each seam and
    // lifting to a lit plank face. Faded out below the waterline, where the
    // wet-dark tone owns the surface, and kept shallow so it never fights the
    // livery hue the instance color supplies.
    const strake = t * PLANK_STRAKES;
    const seam = Math.abs((strake - Math.floor(strake)) - 0.5) * 2;
    const plankDepth = 0.12 * MathUtils.smoothstep(t, 0.12, 0.4);
    scratch.multiplyScalar(1 - plankDepth * (1 - seam));
    colors[index * 3] = scratch.r;
    colors[index * 3 + 1] = scratch.g;
    colors[index * 3 + 2] = scratch.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/** Athwartships deck crown, in ship-local units at the rail. */
const DECK_CAMBER = 0.07;

/**
 * Deck/gunwale plate: adds a curved sheer (rises fore and aft, bow highest),
 * an athwartships camber, and a radial vertex-color AO (bright catching rail
 * edge, darker planked center).
 */
function createDeckGeometry(
  silhouette: GardenHullSilhouette,
  scale: number,
  sheer: number,
  kind: "rim" | "inner",
): BufferGeometry {
  if (silhouette !== "twinhull") {
    return createSingleDeckGeometry(silhouette, scale, sheer, kind);
  }
  const demiDecks = [-1.02, 1.02].map((z) => {
    const geometry = createSingleDeckGeometry(silhouette, scale, sheer, kind);
    geometry.translate(0, 0, z);
    return geometry;
  });
  const merged = mergeGeometries(demiDecks, false);
  for (const geometry of demiDecks) geometry.dispose();
  if (!merged) throw new Error("garden-ships: twin-deck merge failed");
  return merged;
}

function createSingleDeckGeometry(
  silhouette: GardenHullSilhouette,
  scale: number,
  sheer: number,
  kind: "rim" | "inner",
): ShapeGeometry {
  const geometry = new ShapeGeometry(createHullShape(silhouette, scale));
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const maxX = Math.max(Math.abs(box.min.x), Math.abs(box.max.x), 0.001);
  const maxZ = Math.max(Math.abs(box.min.z), Math.abs(box.max.z), 0.001);
  const colors = new Float32Array(position.count * 3);
  const edge = kind === "rim" ? new Color(1, 0.98, 0.92) : new Color(0.92, 0.88, 0.82);
  const center = kind === "rim" ? new Color(0.82, 0.76, 0.66) : new Color(0.6, 0.55, 0.48);
  const scratch = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const nx = position.getX(index) / maxX;
    const nz = position.getZ(index) / maxZ;
    // Sheer: parabolic rise toward both ends, bow (+x) lifted a touch more.
    // Camber (W5.3): the deck crowns athwartships so water runs to the rails.
    // A ShapeGeometry only has outline vertices — there is no centreline row
    // to raise — so the crown is expressed by dropping the rails instead,
    // which produces the same silhouette from the isometric camera.
    const camber = DECK_CAMBER * nz * nz;
    position.setY(index, sheer * nx * nx * (nx > 0 ? 1.12 : 1) - camber);
    const radial = Math.min(1, Math.hypot(nx, nz));
    scratch.copy(center).lerp(edge, radial);
    colors[index * 3] = scratch.r;
    colors[index * 3 + 1] = scratch.g;
    colors[index * 3 + 2] = scratch.b;
  }
  position.needsUpdate = true;
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createHullShape(silhouette: GardenHullSilhouette, scale: number): Shape {
  // S1: 13–15-point plan outlines (was a 5-point polygon). The extra points
  // buy a rounded/counter stern, a gentle beam curve, and a flared bow entry
  // per family; the vertical form (sheer, tumblehome, rake) is displaced in
  // createHullGeometry via GARDEN_HULL_FORM. Points run stern → starboard →
  // bow → port, x along the keel (bow at +x), y = half-beam.
  const points: Record<GardenHullSilhouette, ReadonlyArray<readonly [number, number]>> = {
    // Bezaisen (W4.F6, fleet-craft-6): the long, low coastal trader. Half-beam
    // 2.0 -> 1.28 (plan L/B 1.73 -> 2.65), a fine entry and a narrower transom,
    // on the same 14 points (no triangle cost). The overall reach stays inside
    // the 3.7 clearance table, so no berth moves; the stem post is a family
    // part (`addFamilySilhouetteParts`).
    bezaisen: [
      [-3.25, -1], [-3.4, 0], [-3.25, 1],
      [-1.8, 1.24], [0, 1.28], [1.6, 1.18], [2.6, 0.84], [3.12, 0.42], [3.4, 0],
      [3.12, -0.42], [2.6, -0.84], [1.6, -1.18], [0, -1.28], [-1.8, -1.24],
    ],
    // Kobaya: intentionally needle-thin, with a long fine run into the stem.
    kobaya: [
      [-4.15, -0.38], [-4.28, -0.18], [-4.28, 0.18], [-4.15, 0.38],
      [-2.7, 0.58], [-0.8, 0.65], [1.4, 0.62], [3.45, 0.48], [4.72, 0.24], [5.32, 0],
      [4.72, -0.24], [3.45, -0.48], [1.4, -0.62], [-0.8, -0.65], [-2.7, -0.58],
    ],
    // Twin-hull: this is one narrow demi-hull; createHullGeometry places a
    // mirrored pair far enough apart that the water slot remains unmistakable.
    twinhull: [
      [-4.35, -0.32], [-4.5, 0], [-4.35, 0.32], [-2.7, 0.44], [-0.6, 0.46],
      [1.65, 0.43], [3.55, 0.3], [4.5, 0], [3.55, -0.3], [1.65, -0.43],
      [-0.6, -0.46], [-2.7, -0.44],
    ],
    // Takasebune: an extremely long, parallel-sided river barge.
    takasebune: [
      [-5.78, -1.05], [-5.92, 0], [-5.78, 1.05], [-4.2, 1.35], [-1.5, 1.4],
      [1.5, 1.4], [4.3, 1.3], [5.55, 0.9], [5.95, 0], [5.55, -0.9],
      [4.3, -1.3], [1.5, -1.4], [-1.5, -1.4], [-4.2, -1.35],
    ],
    // Junk: short, bluff and transom-ended beneath its tall fan.
    junk: [
      [-3.02, -0.95], [-3.12, -0.48], [-3.12, 0], [-3.12, 0.48], [-3.02, 0.95],
      [-1.5, 1.28], [0.35, 1.3], [1.85, 1.16], [2.95, 0.72], [3.38, 0],
      [2.95, -0.72], [1.85, -1.16], [0.35, -1.3], [-1.5, -1.28],
    ],
    // Scow: round-ended, very beamy and visually deep.
    scow: [
      [-2.12, -1.55], [-2.48, -1], [-2.58, 0], [-2.48, 1], [-2.12, 1.55],
      [-1.1, 1.92], [0.2, 2], [1.4, 1.88], [2.3, 1.42], [2.58, 0],
      [2.3, -1.42], [1.4, -1.88], [0.2, -2], [-1.1, -1.92],
    ],
  };
  const shape = new Shape();
  const [first, ...rest] = points[silhouette];
  shape.moveTo(first![0] * scale, first![1] * scale);
  for (const [x, y] of rest) shape.lineTo(x * scale, y * scale);
  shape.closePath();
  return shape;
}

// S1 vertical form per family: sheer is the deck-line rise toward the ends
// (bow lifts more than the stern), tumblehome narrows the deck versus the
// waterline, bowFlare widens the bow topsides, bowRake leans the stem forward.
const GARDEN_HULL_FORM: Record<
  GardenHullSilhouette,
  {
    bowFlare: number;
    bowRake: number;
    sheerBow: number;
    sheerStern: number;
    sternRake: number;
    tumblehome: number;
  }
> = {
  // sternRake (W5.3) leans the sternpost aft as the topsides rise, the mirror
  // of bowRake. Without it every hull ended in a vertical transom regardless of
  // family; the kobaya needs a slight overhang, while the junk's near-vertical
  // transom is a deliberate contrast rather than the
  // only option available.
  // W4.F6: the bow sweeps up into the stem post (sheerBow 0.18 -> 0.42) and the
  // stern rises under the yagura (0.38 -> 0.44); bowRake stays low so the stem
  // head keeps inside the 3.7 reach.
  bezaisen: {
    bowFlare: 0.06, bowRake: 0.06, sheerBow: 0.42, sheerStern: 0.44, sternRake: 0.04, tumblehome: 0.08,
  },
  kobaya: {
    bowFlare: 0.08, bowRake: 0.32, sheerBow: 0.16, sheerStern: 0.08, sternRake: 0.14, tumblehome: 0.08,
  },
  twinhull: {
    bowFlare: 0.05, bowRake: 0.18, sheerBow: 0.14, sheerStern: 0.08, sternRake: 0.12, tumblehome: 0.05,
  },
  takasebune: {
    bowFlare: 0.02, bowRake: 0.03, sheerBow: 0.07, sheerStern: 0.05, sternRake: 0.02, tumblehome: 0.02,
  },
  junk: {
    bowFlare: 0.05, bowRake: 0.06, sheerBow: 0.18, sheerStern: 0.26, sternRake: 0.05, tumblehome: 0.06,
  },
  scow: {
    bowFlare: 0.1, bowRake: 0.02, sheerBow: 0.08, sheerStern: 0.1, sternRake: 0.02, tumblehome: -0.12,
  },
};

/**
 * Displaces the extruded hull into the family's vertical form (S1): a curved
 * sheer (ends rise, bow most), slight tumblehome, and a flared/raked bow.
 * Runs on the cached geometry before the vertex-color bake so the waterline
 * AO follows the displaced hull. Flat shading derives normals in-shader, so
 * no normal recompute is needed.
 */
function shapeHullVerticalForm(
  geometry: BufferGeometry,
  silhouette: GardenHullSilhouette,
): void {
  const form = GARDEN_HULL_FORM[silhouette];
  const position = geometry.getAttribute("position");
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const minY = box.min.y;
  const spanY = Math.max(0.001, box.max.y - box.min.y);
  const bowX = Math.max(0.001, box.max.x);
  const sternX = Math.max(0.001, Math.abs(box.min.x));
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    // t: 0 at the keel, 1 at the deck edge.
    const t = MathUtils.clamp((position.getY(index) - minY) / spanY, 0, 1);
    // Sheer: parabolic rise toward both ends, bow higher than the stern.
    const bowT = Math.max(0, x / bowX);
    const sternT = Math.max(0, -x / sternX);
    const y = position.getY(index)
      + form.sheerBow * bowT * bowT
      + form.sheerStern * sternT * sternT;
    // Tumblehome: topsides lean inboard as they rise.
    let z = position.getZ(index) * (1 - form.tumblehome * t);
    // Bow flare + rake: topsides near the stem widen and lean forward.
    const stemT = MathUtils.smoothstep(bowT, 0.35, 1);
    z *= 1 + form.bowFlare * t * stemT;
    // Stern rake: the counter overhangs aft as the topsides rise.
    const postT = MathUtils.smoothstep(sternT, 0.35, 1);
    const rakedX = x + form.bowRake * t * stemT - form.sternRake * t * postT;
    position.setXYZ(index, rakedX, y, z);
  }
  position.needsUpdate = true;
}

/**
 * Sail cloth tessellation. Every baked vertex-color band (2026-09-07 T1.9) has
 * to land on one of these rows/columns or it does not exist: vertex color is
 * sampled only at the grid, so an off-row band interpolates to nothing.
 */
export const GARDEN_SAIL_SEGMENTS_U = 6;
export const GARDEN_SAIL_SEGMENTS_V = 6;

/**
 * Junk batten rows, 2026-09-07 T1.9.
 * Was `[0.16, 0.32, 0.48, 0.64, 0.8]` — only 0.48 and 0.8 were near a row and
 * three of five rendered as exactly zero. Now `n / GARDEN_SAIL_SEGMENTS_V`,
 * n = 1..5: five real battens, one per interior row, top row left clear for
 * the head.
 */
export const GARDEN_SAIL_BATTEN_V: readonly number[] = [1, 2, 3, 4, 5]
  .map((row) => row / GARDEN_SAIL_SEGMENTS_V);

/**
 * Band half-width, 2026-09-07 T1.9: 0.025 -> 0.08, ~half the row pitch
 * (1/6 = 0.1667). Narrower than the pitch keeps adjacent battens from bleeding
 * into each other; wide enough that a band survives being sampled at one row.
 */
export const GARDEN_SAIL_BAND_FALLOFF = 0.08;

/**
 * W4.F1 (fleet-craft-1): the square sail is cloth on a yard, not a banner on a
 * pole. It hangs ATHWARTSHIPS, centred on the mast, from a dark yard that
 * crosses the mast (1.08× the cloth), and the batch shader braces cloth and
 * yard together about the mast (contract F-A). There is no foot spar: the
 * foot rises in a catenary between the two sheeted clews, and the cloth
 * bellies forward, fullest a little below the middle, with the troughs baked
 * a shade darker. The mon rides the curved cloth.
 */
const SQUARE_SAIL_BELLY = 0.2;
const SQUARE_SAIL_FOOT_RISE = 0.12;
const SQUARE_SAIL_FOOT_RISE_ABOVE = 0.05;
/** The cloth hangs just forward of the mast; the yard sits between them. */
const SQUARE_SAIL_FORWARD = 0.14;
const SQUARE_SAIL_YARD_X = 0.08;
const SQUARE_SAIL_YARD_SPAN = 1.08;
const SQUARE_SAIL_TROUGH = 0.12;
/** Braced, centred cloth shows more of itself than the old one-sided card: 1.2 → 1.1. */
const IDENTITY_SQUARE_SAIL_SCALE = 1.1;

/** Belly profile of a square sail: 0 at the leeches and the yard, fullest near v 0.43. */
function squareSailBelly(u: number, v: number): number {
  return Math.sin(Math.PI * u) * Math.sin(Math.PI * (0.12 + 0.88 * v));
}

/**
 * Sail cloth as a tessellated grid (S2) instead of a flat shape. Square sails
 * are described above. The other rigs run from the mast (x = 0) out along the
 * keel to their leech, belly athwartships, and twist their head a few degrees
 * about the mast. UVs map 0–1 across the cloth so the identity logo lands on
 * the atlas cell.
 */
function createSailClothGeometry(plan: GardenSailPlan): BufferGeometry {
  const square = plan.kind === "rectangle";
  const direction = plan.reverse ? -1 : 1;
  const halfHeight = plan.height * 0.5;
  // Leech/roach outline from head (top) back to foot, y descending — used to
  // find the right-edge x for any grid row. Mast edge stays at x = 0; the
  // final point walks the foot edge back to the mast so low rows keep width.
  const leech: Array<readonly [number, number]> = plan.kind === "fore-aft" || plan.kind === "triangle"
    ? [[halfHeight, 0], [-halfHeight * 0.78, direction * plan.width], [-halfHeight, 0]]
    : [
      [halfHeight, 0],
      [halfHeight * 0.68, direction * plan.width * 0.72],
      [0, direction * plan.width],
      [-halfHeight * 0.75, direction * plan.width * 0.86],
      [-halfHeight, 0],
    ];
  const edgeXAt = (y: number): number => {
    for (let index = 0; index < leech.length - 1; index += 1) {
      const [y0, x0] = leech[index]!;
      const [y1, x1] = leech[index + 1]!;
      if (y <= y0 && y >= y1) {
        const t = y0 === y1 ? 0 : (y0 - y) / (y0 - y1);
        return x0 + (x1 - x0) * t;
      }
    }
    return 0;
  };
  const belly = plan.width * 0.14;
  const yardYaw = direction * 0.05;

  const vertexCount = (GARDEN_SAIL_SEGMENTS_U + 1) * (GARDEN_SAIL_SEGMENTS_V + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];
  for (let row = 0; row <= GARDEN_SAIL_SEGMENTS_V; row += 1) {
    const v = row / GARDEN_SAIL_SEGMENTS_V;
    const y = -halfHeight + v * plan.height;
    const edgeX = square ? 0 : edgeXAt(y);
    for (let column = 0; column <= GARDEN_SAIL_SEGMENTS_U; column += 1) {
      const u = column / GARDEN_SAIL_SEGMENTS_U;
      const vertex = row * (GARDEN_SAIL_SEGMENTS_U + 1) + column;
      if (square) {
        const footRise = row === 0 ? SQUARE_SAIL_FOOT_RISE : row === 1 ? SQUARE_SAIL_FOOT_RISE_ABOVE : 0;
        positions[vertex * 3] = SQUARE_SAIL_FORWARD + SQUARE_SAIL_BELLY * plan.width * squareSailBelly(u, v);
        positions[vertex * 3 + 1] = y + footRise * plan.height * Math.sin(Math.PI * u);
        // u runs to starboard, so the mon reads true from astern — the face
        // the rest seat sees on hulls lying at their moorings.
        positions[vertex * 3 + 2] = (u - 0.5) * plan.width;
      } else {
        const baseX = edgeX * u;
        // Yard yaw: rotate the row about the mast line, most at the head.
        const yaw = yardYaw * v * v;
        positions[vertex * 3] = baseX * Math.cos(yaw);
        positions[vertex * 3 + 1] = y;
        // Belly: fullest mid-panel, pinned flat at mast, head, and foot.
        positions[vertex * 3 + 2] = -baseX * Math.sin(yaw)
          + Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * belly;
      }
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
      if (row < GARDEN_SAIL_SEGMENTS_V && column < GARDEN_SAIL_SEGMENTS_U) {
        const a = vertex;
        const b = vertex + 1;
        const c = vertex + GARDEN_SAIL_SEGMENTS_U + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  bakeSailVertexColors(geometry, plan);
  return geometry;
}

/**
 * The timber a sail is bent to. Square sails: one yard across the mast,
 * tapering to its yardarms, as two crossed strips so it never goes edge-on.
 * Fore-and-aft: the head yard and the foot boom it keeps. Other rigs: none.
 * Vertex colour is (1, 0, panels/16): green 0 marks timber (dark, undyed, no
 * belly) and blue lets the yard brace with its cloth.
 */
function createSailSparGeometry(plan: GardenSailPlan): BufferGeometry | null {
  const halfHeight = plan.height * 0.5;
  const positions: number[] = [];
  if (plan.kind === "rectangle") {
    const reach = plan.width * SQUARE_SAIL_YARD_SPAN * 0.5;
    const y = halfHeight + 0.05;
    const stations = [-reach, 0, reach];
    const thickness = (z: number): number => (z === 0 ? 0.07 : 0.035);
    for (let index = 0; index < stations.length - 1; index += 1) {
      const z0 = stations[index]!;
      const z1 = stations[index + 1]!;
      const t0 = thickness(z0);
      const t1 = thickness(z1);
      positions.push(
        // Vertical strip (faces fore and aft).
        SQUARE_SAIL_YARD_X, y - t0, z0, SQUARE_SAIL_YARD_X, y + t0, z0, SQUARE_SAIL_YARD_X, y - t1, z1,
        SQUARE_SAIL_YARD_X, y - t1, z1, SQUARE_SAIL_YARD_X, y + t0, z0, SQUARE_SAIL_YARD_X, y + t1, z1,
        // Horizontal strip (faces up and down).
        SQUARE_SAIL_YARD_X - t0, y, z0, SQUARE_SAIL_YARD_X + t0, y, z0, SQUARE_SAIL_YARD_X - t1, y, z1,
        SQUARE_SAIL_YARD_X - t1, y, z1, SQUARE_SAIL_YARD_X + t0, y, z0, SQUARE_SAIL_YARD_X + t1, y, z1,
      );
    }
  } else if (plan.kind === "fore-aft") {
    const direction = plan.reverse ? -1 : 1;
    const span = direction * plan.width * 1.04;
    for (const [y, yaw] of [[halfHeight, direction * 0.05], [-halfHeight, 0]] as const) {
      positions.push(
        -direction * 0.09, y - 0.055, 0,
        -direction * 0.09, y + 0.055, 0,
        span * Math.cos(yaw), y, -span * Math.sin(yaw),
      );
    }
  } else {
    return null;
  }
  const count = positions.length / 3;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    colors[index * 3] = 1;
    colors[index * 3 + 2] = (plan.panels ?? 0) / 16;
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new Float32BufferAttribute(new Float32Array(count * 2), 2));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex([...Array(count).keys()]);
  geometry.computeVertexNormals();
  return geometry;
}

/** Cloth and its spars as one geometry, for the batch: they share dip, furl and brace. */
function createSailGeometry(plan: GardenSailPlan): BufferGeometry {
  const cloth = createSailClothGeometry(plan);
  const spars = createSailSparGeometry(plan);
  if (!spars) return cloth;
  const merged = mergeGeometries([cloth, spars], false);
  cloth.dispose();
  spars.dispose();
  if (!merged) throw new Error("garden-ships: sail spar merge failed");
  return merged;
}

/**
 * Cloth detail baked into the sail's vertex colour, as three channels:
 * - red: the cloth's shade — the junk's battens, and a gentle darkening where
 *   the cloth curves away (the leech of a fore-and-aft sail, the troughs of a
 *   square sail's belly). Deliberately shallow: on the identity sail it
 *   multiplies the mark.
 * - green: 1 on cloth, 0 on timber (`createSailSparGeometry`).
 * - blue: W4.F5 panel count / 16 — the batch shader draws the momen-ho strips
 *   from it, and it marks the square sails the shader braces. The old
 *   three-panel vertex seam is gone; seams at vertex resolution were too
 *   coarse to read.
 *
 * `mergeAtlasSails` fills colour with 1 when a sail has none, so every sail
 * writes all three channels here.
 *
 * 2026-09-07 T1.9 (Nyquist): the cloth is a `GARDEN_SAIL_SEGMENTS_V`-row grid,
 * so a band only exists at all if it lands ON a row — vertex color cannot
 * represent anything between two rows. Battens sit on
 * `n / GARDEN_SAIL_SEGMENTS_V` and the falloff is half the row pitch, so each
 * band is sampled by exactly its own row.
 */
function bakeSailVertexColors(geometry: BufferGeometry, plan: GardenSailPlan): void {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const colors = new Float32Array(position.count * 3);
  const panels = (plan.panels ?? 0) / 16;
  for (let index = 0; index < position.count; index += 1) {
    const u = uv.getX(index);
    const v = uv.getY(index);
    let shade = 1;
    if (plan.kind === "rectangle") {
      shade -= SQUARE_SAIL_TROUGH * (1 - squareSailBelly(u, v));
    } else {
      if (plan.kind === "junk") {
        // Five high-contrast battens make the sail an asymmetric fan at default
        // zoom; they are cloth shading, so they stay inside the one sail draw.
        for (const batten of GARDEN_SAIL_BATTEN_V) {
          shade -= 0.18 * (1 - MathUtils.smoothstep(
            Math.abs(v - batten),
            0,
            GARDEN_SAIL_BAND_FALLOFF,
          ));
        }
      }
      // The belly catches less light toward the leech as it curves away.
      shade *= 1 - 0.06 * u * u;
    }
    colors[index * 3] = shade;
    colors[index * 3 + 1] = 1;
    colors[index * 3 + 2] = panels;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/**
 * The masthead the stays hang from: 0.34 above the deck-stepped mast's
 * nominal height, moved along the mast's rake so the lines meet the spar the
 * batch actually draws (the rake pivots the mast about its mid-height).
 */
function riggingMastHead(silhouette: GardenHullSilhouette, mastPlan: GardenMastPlan): Vector3 {
  const y = mastPlan.height + 0.34;
  const rake = GARDEN_SHIP_MAST_RAKE[silhouette];
  return new Vector3(
    mastPlan.x - Math.sin(rake) * (y - (0.55 + mastPlan.height / 2)),
    y,
    mastPlan.z ?? 0,
  );
}

/**
 * S3 standing rigging, as endpoint pairs: per mast (bow-most first) a
 * forestay (to the next mast toward the bow, or to the stem for the foremast),
 * a backstay to the stern deck and two shrouds to the rails — always in that
 * order. The batched hero band draws exactly these (W4.F8, `fleetHeroRigLines`).
 */
function standingRiggingPoints(
  silhouette: GardenHullSilhouette,
  rig: readonly GardenMastPlan[],
): Vector3[] {
  const points: Vector3[] = [];
  // Bow at +x: masts sorted bow-ward first so each forestay can target the
  // mast ahead of it.
  const bowFirst = [...rig].sort((left, right) => right.x - left.x);
  const hullPoints = createHullShape(silhouette, 1).getPoints(4);
  const halfBeam = Math.max(...hullPoints.map((point) => Math.abs(point.y)));
  const bowX = Math.max(...hullPoints.map((point) => point.x));
  const sternX = Math.min(...hullPoints.map((point) => point.x));
  for (const [index, mastPlan] of bowFirst.entries()) {
    const mastZ = mastPlan.z ?? 0;
    const head = riggingMastHead(silhouette, mastPlan);
    const ahead = bowFirst[index - 1];
    // Forestay: to the mast ahead at ~2/3 height, or to the stem/bowsprit.
    points.push(
      head,
      ahead
        ? new Vector3(ahead.x, ahead.height * 0.66, ahead.z ?? 0)
        : new Vector3(bowX, 0.78, mastZ),
    );
    // Backstay to the stern deck.
    points.push(head, new Vector3(sternX, 0.74, mastZ));
    // Two shrouds to the rails, a touch aft of the mast.
    points.push(head, new Vector3(mastPlan.x - 0.32, 0.6, mastZ + halfBeam * 0.82));
    points.push(head, new Vector3(mastPlan.x - 0.32, 0.6, mastZ - halfBeam * 0.82));
  }
  return points;
}

/**
 * S3: sparse real rigging for the scene-graph hulls — the standing rig above,
 * the W5.4 halyards, and the junk's horizontal sail battens. Everything merges
 * into one cached LineSegments point list per silhouette so the whole rig
 * stays a single draw call.
 */
function riggingPoints(
  silhouette: GardenHullSilhouette,
  rig: readonly GardenMastPlan[],
): Vector3[] {
  const points = standingRiggingPoints(silhouette, rig);
  for (const mastPlan of rig) {
    const mastZ = mastPlan.z ?? 0;
    const head = riggingMastHead(silhouette, mastPlan);
    // W5.4 halyards: the lines that actually hoist each yard, running from the
    // masthead down to the head of every sail on this mast. Two segments per
    // sail, so the rig reads as worked rather than decorative.
    for (const sailPlan of mastPlan.sails) {
      const direction = sailPlan.reverse ? -1 : 1;
      const headY = sailPlan.centerY + sailPlan.height * 0.5;
      // W4.F1: a square sail's halyard hoists the yard's slings at the mast;
      // the yard itself is timber on the sail, braced with it.
      if (sailPlan.kind === "rectangle") {
        points.push(head, new Vector3(mastPlan.x + SQUARE_SAIL_YARD_X, headY + 0.05, mastZ));
        continue;
      }
      points.push(head, new Vector3(mastPlan.x + direction * 0.05, headY, mastZ + 0.05));
      points.push(
        new Vector3(mastPlan.x + direction * 0.05, headY, mastZ + 0.05),
        new Vector3(
          mastPlan.x + direction * sailPlan.width * 0.9,
          headY - 0.06,
          mastZ + 0.05,
        ),
      );
    }
  }
  if (silhouette === "junk") {
    for (const mastPlan of rig) {
      for (const sailPlan of mastPlan.sails) {
        const direction = sailPlan.reverse ? -1 : 1;
        const near = mastPlan.x;
        const far = mastPlan.x + direction * sailPlan.width;
        const mastZ = mastPlan.z ?? 0;
        for (let batten = 0; batten < 3; batten += 1) {
          const y = sailPlan.centerY - sailPlan.height * 0.32
            + (batten / 2) * sailPlan.height * 0.64;
          points.push(
            new Vector3(near, y, mastZ + 0.045),
            new Vector3(far, y, mastZ + 0.045),
          );
        }
      }
    }
  }
  return points;
}

export function createPennantGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.68, -0.16);
  shape.lineTo(0, -0.34);
  shape.closePath();
  return new ShapeGeometry(shape);
}

export function createShipShadows(count: number): InstancedMesh<CircleGeometry, MeshBasicMaterial> {
  const geometry = new CircleGeometry(1, 20);
  geometry.rotateX(-Math.PI / 2);
  // S7 grounding: a deeper water-shadow hue (palette-derived) and a stronger
  // base opacity so hulls sit IN the sea, not on it. The per-frame opacity
  // curve lives in garden-day-cycle.ts (orchestrator-integrated).
  const shadows = new InstancedMesh(
    geometry,
    new MeshBasicMaterial({
      color: new Color(HARBOR_PALETTE.deep_sea_1).lerp(new Color(HARBOR_PALETTE.shallow_teal), 0.25),
      depthWrite: false,
      opacity: 0.28,
      transparent: true,
    }),
    count,
  );
  shadows.renderOrder = 1;
  return shadows;
}
