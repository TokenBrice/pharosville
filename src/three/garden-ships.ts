import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Line,
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
import { HARBOR_PALETTE } from "../systems/palette";
import type { ShipNode } from "../systems/world-types";
import { heroHullModelFor } from "../systems/unique-ships";
import { gardenModelAnchor, type GardenModelId } from "./garden-models";
import {
  GARDEN_WATER_MAX_RIPPLE_RINGS,
  type GardenRippleRingEmitter,
} from "./garden-water-contract";
import { createGardenSailTexture } from "./garden-sail-texture";
import {
  FLEET_BATCH_TINTS,
  markAtlasSail,
  mergeTintedParts,
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

/** Motion + lantern tier: titans/uniques bob slowest and carry a lantern string. */
export type ShipFleetTier = "titan" | "heritage" | "standard";

// S5 / decision D-S5: the visual-scale mapping (~3.7× spread, 0.55 legibility
// floor) lives in garden-observatory-slice (orchestrator-integrated per
// contract C3) so selection radii and label layout consume the same spread;
// re-exported here for the fleet module's existing consumers/tests.
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
  /**
   * W1: true when this ship is drawn from the shared `FleetBatches` instances
   * rather than its own meshes. Batched ships carry no hull/sail/pennant mesh;
   * `root` is a transform carrier with no drawable children.
   */
  batched: boolean;
  bobPhase: number;
  displayOffset: { x: number; y: number };
  fineDetail: Group;
  /** Livery multiplier written to the hull batch's instanceColor. */
  hullColor: Color;
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
  /** Lantern hang points in ship-local space (stern / bow+stern / a string). */
  lanternPoints: readonly Vector3[];
  /** Warm-lane intensity this ship lays on the sea (by fleet tier). */
  laneIntensity: number;
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
  wake: Group;
  wakeDetail: Group;
}

/** Fleet-wide lantern instances: two shared draw calls for the whole fleet. */
export interface FleetLanterns {
  cores: InstancedMesh<PlaneGeometry, MeshStandardMaterial>;
  glow: InstancedMesh<PlaneGeometry, MeshBasicMaterial>;
  coreMaterial: MeshStandardMaterial;
  glowMaterial: MeshBasicMaterial;
  root: Group;
  /** One entry per lantern, flattened across the fleet. */
  entries: readonly { local: Vector3; swayPhase: number; visual: ShipVisual }[];
}

type GardenSailKind = "fore-aft" | "square" | "junk";

interface GardenSailPlan {
  centerY: number;
  height: number;
  kind: GardenSailKind;
  reverse?: boolean;
  width: number;
}

interface GardenMastPlan {
  height: number;
  sails: readonly GardenSailPlan[];
  x: number;
}

interface ShipSailTextureTarget {
  logoGenerationKey: string | null;
  ships: readonly ShipVisual[];
}

const GARDEN_SHIP_RIGS: Record<GardenHullSilhouette, readonly GardenMastPlan[]> = {
  galleon: [
    {
      height: 3.25,
      sails: [{ centerY: 2.25, height: 1.55, kind: "fore-aft", reverse: true, width: 1.35 }],
      x: -1.55,
    },
    {
      height: 4.05,
      sails: [{ centerY: 2.65, height: 1.95, kind: "square", width: 1.85 }],
      x: 0,
    },
    {
      height: 3.55,
      sails: [{ centerY: 2.4, height: 1.65, kind: "square", reverse: true, width: 1.5 }],
      x: 1.55,
    },
  ],
  clipper: [
    {
      height: 3.05,
      sails: [{ centerY: 2.15, height: 1.55, kind: "square", width: 1.25 }],
      x: -1.45,
    },
    {
      height: 3.65,
      sails: [{ centerY: 2.45, height: 1.85, kind: "square", reverse: true, width: 1.45 }],
      x: 0.15,
    },
    {
      height: 3.2,
      sails: [{ centerY: 2.2, height: 1.55, kind: "square", width: 1.2 }],
      x: 1.7,
    },
  ],
  schooner: [
    {
      height: 3.15,
      sails: [{ centerY: 2.05, height: 1.9, kind: "fore-aft", reverse: true, width: 1.35 }],
      x: -1.05,
    },
    {
      height: 3.75,
      sails: [{ centerY: 2.4, height: 2.3, kind: "fore-aft", width: 1.55 }],
      x: 0.85,
    },
  ],
  junk: [
    {
      height: 3.35,
      sails: [{ centerY: 2.25, height: 2.2, kind: "junk", width: 1.9 }],
      x: -0.75,
    },
    {
      height: 2.8,
      sails: [{ centerY: 2, height: 1.7, kind: "junk", reverse: true, width: 1.45 }],
      x: 1.05,
    },
  ],
};

// Galleon and junk carry a tall stern castle / high transom house (family
// identity, D2); the schooner stays deliberately low and sleek.
const GARDEN_SHIP_CABINS: Partial<Record<
  GardenHullSilhouette,
  { height: number; width: number; x: number; z: number }
>> = {
  galleon: { height: 1.08, width: 1.78, x: -2.4, z: 1.62 },
  junk: { height: 0.98, width: 1.68, x: -1.95, z: 1.36 },
  schooner: { height: 0.42, width: 1.05, x: -2.15, z: 0.92 },
};

// Per-tier lantern layout in ship-local space (stern, then bow, then a
// mid-string point for the biggest hulls). Warm gold points that bloom.
const STERN_LANTERN = new Vector3(-3.05, 1.28, 0);
const BOW_LANTERN = new Vector3(3.2, 1.18, 0);
const MID_LANTERN = new Vector3(0.1, 1.62, 0);

function shipFleetTier(ship: ShipNode): ShipFleetTier {
  const sizeTier = ship.visual.sizeTier;
  if (sizeTier === "titan" || sizeTier === "unique") return "titan";
  if (sizeTier === "flagship" || sizeTier === "major" || (ship.visual.scale ?? 1) >= 1.15) {
    return "heritage";
  }
  return "standard";
}

/**
 * Titans and uniques (the monumental stablecoins) get a bespoke GLB hero hull:
 * titans the three-master, uniques the elegant heritage two-master. Everything
 * else keeps the procedural fleet hull.
 */
/**
 * W1: true when a ship keeps its own scene graph (bespoke hero GLB hull,
 * grade shield, per-ship identity sail) rather than joining the instanced
 * batches. Titans and uniques only — ~18 of the ~205-ship world.
 */
export function gardenShipUsesHeroModel(ship: ShipNode): boolean {
  return shipHeroModelId(ship) !== null;
}

function shipHeroModelId(ship: ShipNode): GardenModelId | null {
  // W5 (D4/O11): ten distinct hero hulls, assigned deterministically per
  // stablecoin so a coin never changes ship between refreshes. This used to
  // hardcode two shared models for all 18 hero-tier ships.
  if (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique") {
    return heroHullModelFor(ship.id);
  }
  return null;
}

function lanternPointsForTier(tier: ShipFleetTier): readonly Vector3[] {
  if (tier === "titan") return [STERN_LANTERN, MID_LANTERN, BOW_LANTERN];
  if (tier === "heritage") return [STERN_LANTERN, BOW_LANTERN];
  return [STERN_LANTERN];
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
 * follow-selected and the wake all attach to it exactly as before.
 */
export function createBatchedShip(
  ship: ShipNode,
  displayOffset: { x: number; y: number },
  representative: boolean,
  cache: GardenShipGeometryCache,
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
  const wake = createWake(cache);
  root.add(wake.root);

  return {
    atlasCell,
    batched: true,
    bobPhase: stableUnit(ship.id) * Math.PI * 2,
    displayOffset,
    fineDetail,
    heroHideable: [],
    heroHullTint: new Color("#ffffff"),
    heroModelId: null,
    hullColor: batchedHullColor(ship),
    identitySail: null,
    identitySailMaterial: null,
    lanternPoints: lanternPointsForTier(tier),
    laneIntensity: FLEET_TIER_LANE_INTENSITY[tier],
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
    wake: wake.root,
    wakeDetail: wake.detail,
  };
}

/**
 * The livery multiplier the hull batch's `instanceColor` carries. Matches the
 * S4 color blocking `createShip` applies to its hull material, so a batched
 * ship and a hero ship of the same livery read identically.
 */
function batchedHullColor(ship: ShipNode): Color {
  return new Color(HARBOR_PALETTE.timber_dark).lerp(
    new Color(safeCssColor(ship.visual.livery?.primary, HARBOR_PALETTE.timber_warm)),
    0.32,
  );
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

  // S4 color blocking: a dark hull band (livery primary only whispers
  // through), a pale sheer stripe at the gunwale, a warm deck, cream sails,
  // and ONE colored accent per ship — the masthead pennant keeps the livery
  // accent hue, so the brand/identity channel survives unchanged.
  const hullColor = new Color(HARBOR_PALETTE.timber_dark).lerp(
    new Color(safeCssColor(ship.visual.livery?.primary, HARBOR_PALETTE.timber_warm)),
    0.32,
  );
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
    color: hullColor,
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
  // Sheer stripe: a pale rail highlight that makes the curved sheer legible;
  // deliberately NOT the livery accent (that lives on the pennant alone).
  const gunwaleMaterial = new MeshStandardMaterial({
    color: new Color(HARBOR_PALETTE.foam_white).lerp(new Color(HARBOR_PALETTE.timber_warm), 0.52),
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
      `deck.${silhouette}.inner`,
      () => createDeckGeometry(silhouette, 0.79, 0.16, "inner"),
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
  const sailColor = safeCssColor(
    ship.visual.sailColor ?? ship.visual.livery?.sailColor,
    GARDEN_COLORS.limestoneLight,
  );
  // S4: plain sails read as warm cream/ochre canvas with only a whisper of the
  // livery sail hue left in; the logo identity sail keeps the full livery
  // field via its canvas texture.
  const creamCanvas = new Color(HARBOR_PALETTE.foam_white)
    .lerp(new Color(HARBOR_PALETTE.lantern_warm), 0.16);
  const readableSailColor = new Color(sailColor).lerp(creamCanvas, 0.45);
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
  const hasBowsprit = silhouette === "clipper" || silhouette === "galleon";
  const masts = new InstancedMesh(
    mastGeometry,
    mastMaterial,
    rig.length + (hasBowsprit ? 1 : 0),
  );
  // S2: every family carries a slight mast rake now — clippers/schooners lean
  // forward (bow at +x), galleons a touch aft, junks visibly forward.
  const mastRotation = silhouette === "clipper"
    ? -0.045
    : silhouette === "schooner"
      ? -0.075
      : silhouette === "junk"
        ? -0.035
        : 0.02;
  for (const [mastIndex, mastPlan] of rig.entries()) {
    scratchMatrix.makeRotationZ(mastRotation);
    scratchMatrix.scale(scratchPosition.set(1, mastPlan.height, 1));
    scratchMatrix.setPosition(mastPlan.x, 0.55 + mastPlan.height / 2, 0);
    masts.setMatrixAt(mastIndex, scratchMatrix);
    for (const [sailIndex, sailPlan] of mastPlan.sails.entries()) {
      const reverse = sailPlan.reverse ?? false;
      const isIdentitySail = identitySail?.mastIndex === mastIndex
        && identitySail.sailIndex === sailIndex;
      const sail = new Mesh(
        cachedShipGeometry(
          cache,
          [
            "sail",
            silhouette,
            mastIndex,
            sailIndex,
            sailPlan.kind,
            sailPlan.width,
            sailPlan.height,
            reverse ? "reverse" : "forward",
          ].join("."),
          () => createSailGeometry(sailPlan),
        ),
        isIdentitySail ? identitySailMaterial : plainSailMaterial,
      );
      sail.position.set(mastPlan.x + (reverse ? -0.06 : 0.06), sailPlan.centerY, 0.03);
      if (isIdentitySail) {
        sail.scale.set(1.22, 1.22, 1);
        identitySailMesh = sail;
      } else {
        heroHideable.push(sail);
      }
      root.add(sail);
    }
  }
  if (hasBowsprit) {
    scratchMatrix.makeRotationZ(Math.PI / 2);
    scratchMatrix.scale(scratchPosition.set(
      1,
      silhouette === "clipper" ? 2.2 : 1.45,
      1,
    ));
    scratchMatrix.setPosition(silhouette === "clipper" ? 4.75 : 4.15, 0.95, 0);
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
    new LineBasicMaterial({
      color: "#3f342b",
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
  flag.position.set(tallestMast.x, tallestMast.height + 0.52, 0.02);
  fineDetail.add(flag);
  heroHideable.push(flag);

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
    root.add(signal);
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
      root.add(watchQuarter);
    }
  }

  if (
    (ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique")
    && ship.reportCard?.overallGrade
    && ship.reportCard.overallGrade !== "NR"
  ) {
    const shieldShape = new Shape();
    shieldShape.moveTo(0, 0.42);
    shieldShape.lineTo(0.34, 0.18);
    shieldShape.lineTo(0.25, -0.3);
    shieldShape.lineTo(0, -0.5);
    shieldShape.lineTo(-0.25, -0.3);
    shieldShape.lineTo(-0.34, 0.18);
    shieldShape.closePath();
    const shield = new Mesh(
      new ShapeGeometry(shieldShape),
      new MeshStandardMaterial({
        color: "#66717a",
        metalness: 0.56,
        roughness: 0.46,
        side: DoubleSide,
      }),
    );
    shield.name = "ship-bluechip-shield";
    shield.position.set(1.35, 1.05, 0.82);
    shield.rotation.x = -0.18;
    root.add(shield);
    const shieldMark = new Mesh(
      new ShapeGeometry(shieldShape),
      new MeshBasicMaterial({
        color: HARBOR_PALETTE.lantern_glow,
        side: DoubleSide,
      }),
    );
    shieldMark.scale.setScalar(0.42);
    shieldMark.position.set(1.35, 1.05, 0.835);
    shieldMark.rotation.x = -0.18;
    root.add(shieldMark);
  }

  const wake = createWake(cache);
  root.add(wake.root);
  const motion = FLEET_TIER_MOTION[tier];
  // Subtle livery cast multiplied over the hero wood on attach (white base × a
  // mostly-white tint keeps the baked 3-tone shading readable).
  const heroHullTint = new Color("#ffffff").lerp(
    new Color(safeCssColor(ship.visual.livery?.primary, "#ffffff")),
    0.3,
  );
  return {
    atlasCell: 0,
    batched: false,
    bobPhase: stableUnit(ship.id) * Math.PI * 2,
    displayOffset,
    fineDetail,
    heroHideable,
    heroHullTint,
    heroModelId,
    hullColor,
    identitySail: identitySailMesh,
    identitySailMaterial,
    lanternPoints: lanternPointsForTier(tier),
    laneIntensity: FLEET_TIER_LANE_INTENSITY[tier],
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
    wake: wake.root,
    wakeDetail: wake.detail,
  };
}

/**
 * Swaps a titan/unique ship's procedural hull for its loaded hero GLB: hides the
 * procedural hull/rig (the identity logo sail, data overlays, wake and lantern
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

  model.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const material = (object.material as MeshStandardMaterial).clone();
    if (object.name === "wood-hull") material.color.multiply(visual.heroHullTint);
    object.material = material;
    object.castShadow = true;
  });
  model.name = `hero-${heroId}`;
  visual.root.add(model);

  if (visual.identitySail) {
    const masthead = gardenModelAnchor(model, heroId, "masthead").position;
    // Hang the logo sail as the main course, just below the furled topsail yard.
    visual.identitySail.position.set(masthead.x, masthead.y * 0.64, 0.24);
    visual.identitySail.scale.set(1.6, 1.75, 1);
    visual.identitySail.rotation.set(0, 0, 0);
  }
}

export function syncShipSailTextures(
  content: ShipSailTextureTarget,
  frame: ThreeWorldRendererFrame,
): void {
  const generation = frame.logos.getLogoGenerationKey();
  if (content.logoGenerationKey === generation) return;
  content.logoGenerationKey = generation;

  for (const visual of content.ships) {
    // Batched ships shade from the shared sail-atlas material; only hero
    // ships still own a per-ship identity sail texture (W1 / D3).
    const material = visual.identitySailMaterial;
    if (!material) continue;
    const previousTexture = material.map;
    material.map = createGardenSailTexture(
      visual.ship,
      frame.logos.getLogo(visual.ship.logoSrc),
    );
    material.color.set(material.map ? "#f7f2e4" : visual.ship.visual.sailColor);
    material.emissive.set("#fff7e3");
    material.emissiveMap = material.map;
    material.needsUpdate = true;
    if (previousTexture && previousTexture !== material.map) previousTexture.dispose();
  }
}

const LANTERN_CORE_SIZE = 0.32;
// W1.10: a 3-unit additive halo per lantern was authored when 20 ships were on
// screen. At 187 ships (and up to 3 lanterns each) the halos overlap into a
// warm wash that flattens the whole frame — the opposite of the deep,
// selective night the brief asks for. 1.7 keeps each lantern a POINT of light
// with a small bloom instead of a blob.
const LANTERN_GLOW_SIZE = 1.7;
const LANTERN_SWAY = 0.09;
const zeroScaleMatrix = new Matrix4().makeScale(0, 0, 0);

/**
 * One shared pair of InstancedMeshes carries every ship lantern in the fleet:
 * an emissive core sphere (blooms) and an additive camera-facing glow quad.
 * Two draw calls for the whole fleet, updated each frame by updateFleetLanterns.
 */
export function createFleetLanterns(
  ships: readonly ShipVisual[],
  cache: GardenShipGeometryCache,
): FleetLanterns {
  const entries: { local: Vector3; swayPhase: number; visual: ShipVisual }[] = [];
  for (const visual of ships) {
    for (const [pointIndex, local] of visual.lanternPoints.entries()) {
      entries.push({
        local: local.clone(),
        swayPhase: visual.swaySeed + pointIndex * 0.8,
        visual,
      });
    }
  }
  const count = Math.max(1, entries.length);

  const coreMaterial = new MeshStandardMaterial({
    color: "#000000",
    emissive: HARBOR_PALETTE.lantern_glow,
    emissiveIntensity: 0,
    toneMapped: false,
  });
  const cores = new InstancedMesh(
    cachedShipGeometry(cache, "lantern.core", () => new PlaneGeometry(1, 1)),
    coreMaterial,
    count,
  );
  cores.name = "ship-lantern-cores";
  cores.frustumCulled = false;
  cores.renderOrder = 3;

  const glowMaterial = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: HARBOR_PALETTE.lantern_glow,
    depthWrite: false,
    map: createLanternGlowTexture(),
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });
  const glow = new InstancedMesh(
    cachedShipGeometry(cache, "lantern.glow", () => new PlaneGeometry(1, 1)),
    glowMaterial,
    count,
  );
  glow.name = "ship-lantern-glow";
  glow.frustumCulled = false;
  glow.renderOrder = 3;

  // Hide any padding instance up front; updateFleetLanterns overwrites the
  // active ones each frame.
  for (let index = 0; index < count; index += 1) {
    cores.setMatrixAt(index, zeroScaleMatrix);
    glow.setMatrixAt(index, zeroScaleMatrix);
  }
  cores.instanceMatrix.needsUpdate = true;
  glow.instanceMatrix.needsUpdate = true;

  const root = new Group();
  root.name = "ship-lanterns";
  root.add(cores, glow);
  return { coreMaterial, cores, entries, glow, glowMaterial, root };
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

const lanternScratchMatrix = new Matrix4();
const lanternScratchPosition = new Vector3();
const lanternScratchScale = new Vector3();
const lanternRootMatrix = new Matrix4();

/**
 * Rewrites the fleet lantern instance matrices from each ship's current world
 * transform, with a slow pendulum sway (frozen under reduced motion). Both the
 * bright core and the soft glow are camera-facing quads (2 tris each) sharing
 * the frame's billboard orientation — the core just sits smaller and brighter.
 */
export function updateFleetLanterns(
  lanterns: FleetLanterns,
  cameraQuaternion: Quaternion,
  timeSeconds: number,
  reducedMotion: boolean,
): void {
  for (const [index, entry] of lanterns.entries.entries()) {
    const root = entry.visual.root;
    lanternRootMatrix.compose(root.position, root.quaternion, root.scale);
    const swing = reducedMotion
      ? 0
      : Math.sin(timeSeconds * 0.9 + entry.swayPhase) * LANTERN_SWAY;
    lanternScratchPosition
      .set(entry.local.x + swing, entry.local.y, entry.local.z)
      .applyMatrix4(lanternRootMatrix);

    lanternScratchScale.setScalar(LANTERN_CORE_SIZE);
    lanternScratchMatrix.compose(lanternScratchPosition, cameraQuaternion, lanternScratchScale);
    lanterns.cores.setMatrixAt(index, lanternScratchMatrix);

    lanternScratchScale.setScalar(LANTERN_GLOW_SIZE);
    lanternScratchMatrix.compose(lanternScratchPosition, cameraQuaternion, lanternScratchScale);
    lanterns.glow.setMatrixAt(index, lanternScratchMatrix);
  }
  lanterns.cores.instanceMatrix.needsUpdate = true;
  lanterns.glow.instanceMatrix.needsUpdate = true;
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
  const hasBowsprit = silhouette === "clipper" || silhouette === "galleon";
  const mastRotation = silhouette === "clipper"
    ? -0.045
    : silhouette === "schooner"
      ? -0.075
      : silhouette === "junk"
        ? -0.035
        : 0.02;

  const parts: { geometry: BufferGeometry; tint?: Color; transform?: Matrix4 }[] = [];
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
  parts.push({
    geometry: createDeckGeometry(silhouette, 0.91, 0.34, "rim"),
    tint: FLEET_BATCH_TINTS.gunwale,
    transform: transform().setPosition(0, 0.47, 0),
  });
  parts.push({
    geometry: createDeckGeometry(silhouette, 0.79, 0.16, "inner"),
    tint: FLEET_BATCH_TINTS.deck,
    transform: transform().setPosition(0, 0.5, 0),
  });

  const mastGeometry = new CylinderGeometry(0.055, 0.08, 1, 6);
  for (const mastPlan of rig) {
    const matrix = transform().makeRotationZ(mastRotation);
    matrix.scale(new Vector3(1, mastPlan.height, 1));
    matrix.setPosition(mastPlan.x, 0.55 + mastPlan.height / 2, 0);
    parts.push({ geometry: mastGeometry, tint: FLEET_BATCH_TINTS.mast, transform: matrix });
  }
  if (hasBowsprit) {
    const matrix = transform().makeRotationZ(Math.PI / 2);
    matrix.scale(new Vector3(1, silhouette === "clipper" ? 2.2 : 1.45, 1));
    matrix.setPosition(silhouette === "clipper" ? 4.75 : 4.15, 0.95, 0);
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
    parts.push({
      geometry: new BoxGeometry(cabinDimensions.width * 1.12, 0.12, cabinDimensions.z * 1.16),
      tint: FLEET_BATCH_TINTS.mast,
      transform: transform().setPosition(cabinDimensions.x, 0.58 + cabinDimensions.height, 0),
    });
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

  const sailParts: { geometry: BufferGeometry; transform?: Matrix4 }[] = [];
  for (const [mastIndex, mastPlan] of rig.entries()) {
    for (const [sailIndex, sailPlan] of mastPlan.sails.entries()) {
      const reverse = sailPlan.reverse ?? false;
      const isIdentitySail = identitySail?.mastIndex === mastIndex
        && identitySail.sailIndex === sailIndex;
      const geometry = createSailGeometry(sailPlan);
      markAtlasSail(geometry, isIdentitySail);
      const matrix = transform();
      if (isIdentitySail) matrix.makeScale(1.22, 1.22, 1);
      matrix.setPosition(
        mastPlan.x + (reverse ? -0.06 : 0.06),
        sailPlan.centerY,
        0.03,
      );
      sailParts.push({ geometry, transform: matrix });
    }
  }
  const sails = mergeAtlasSails(sailParts);
  for (const part of sailParts) part.geometry.dispose();

  return { hull, sails };
}

/**
 * Sails merge on their own path because `aAtlasSail` must survive the merge —
 * `mergeTintedParts` strips non-standard attributes to keep the hull inputs
 * uniform.
 */
function mergeAtlasSails(
  parts: readonly { geometry: BufferGeometry; transform?: Matrix4 }[],
): BufferGeometry {
  const prepared: BufferGeometry[] = [];
  for (const part of parts) {
    const source = part.geometry.clone();
    const geometry = source.index ? source.toNonIndexed() : source;
    if (geometry !== source) source.dispose();
    if (part.transform) geometry.applyMatrix4(part.transform);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("color")) {
      const count = geometry.getAttribute("position").count;
      const colors = new Float32Array(count * 3).fill(1);
      geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    }
    prepared.push(geometry);
  }
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  if (!merged) throw new Error("garden-ships: sail merge failed");
  return merged;
}

function createHullGeometry(silhouette: GardenHullSilhouette): ExtrudeGeometry {
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
    // Galleon: high rounded tuck stern, full midship, bluff flared bow.
    galleon: [
      [-3.3, -1.05], [-3.55, -0.85], [-3.65, 0], [-3.55, 0.85], [-3.3, 1.05],
      [-1.6, 1.32], [0.4, 1.3], [2.1, 1.18], [3.4, 0.82], [4.05, 0],
      [3.4, -0.82], [2.1, -1.18], [0.4, -1.3], [-1.6, -1.32],
    ],
    // Clipper: elliptical counter stern, lean entry, long raked bow.
    clipper: [
      [-3.5, -0.42], [-3.62, -0.2], [-3.62, 0.2], [-3.5, 0.42],
      [-2.2, 0.68], [-0.6, 0.76], [1.2, 0.74], [2.9, 0.6], [4.1, 0.32], [4.85, 0],
      [4.1, -0.32], [2.9, -0.6], [1.2, -0.74], [-0.6, -0.76], [-2.2, -0.68],
    ],
    // Schooner: sleek hull with a long bow overhang, soft bilge.
    schooner: [
      [-3.68, -0.5], [-3.78, -0.22], [-3.78, 0.22], [-3.68, 0.5],
      [-2.4, 0.78], [-0.6, 0.82], [1.4, 0.78], [3, 0.55], [4.35, 0],
      [3, -0.55], [1.4, -0.78], [-0.6, -0.82], [-2.4, -0.78],
    ],
    // Junk: bluff at both ends, flat transom-like bow, beamy waist.
    junk: [
      [-3.18, -0.95], [-3.28, -0.5], [-3.3, 0], [-3.28, 0.5], [-3.18, 0.95],
      [-1.6, 1.16], [0.4, 1.14], [2, 1.02], [3.05, 0.62], [3.65, 0],
      [3.05, -0.62], [2, -1.02], [0.4, -1.14], [-1.6, -1.16],
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
  // family; the counter-sterned clipper and schooner need the overhang, and the
  // junk's near-vertical transom is now a deliberate contrast rather than the
  // only option available.
  galleon: {
    bowFlare: 0.1, bowRake: 0.14, sheerBow: 0.3, sheerStern: 0.24, sternRake: 0.2, tumblehome: 0.16,
  },
  clipper: {
    bowFlare: 0.18, bowRake: 0.38, sheerBow: 0.26, sheerStern: 0.16, sternRake: 0.3, tumblehome: 0.1,
  },
  schooner: {
    bowFlare: 0.08, bowRake: 0.24, sheerBow: 0.22, sheerStern: 0.14, sternRake: 0.26, tumblehome: 0.08,
  },
  junk: {
    bowFlare: 0.05, bowRake: 0.06, sheerBow: 0.18, sheerStern: 0.26, sternRake: 0.05, tumblehome: 0.06,
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
 * Sail cloth as a tessellated grid (S2) instead of a flat shape: the center
 * belly is displaced so sails read wind-filled, and the head (yard) is yawed
 * a few degrees versus the foot. UVs map 0–1 across the cloth so the identity
 * logo texture lands exactly as before.
 */
function createSailGeometry(plan: GardenSailPlan): BufferGeometry {
  const direction = plan.reverse ? -1 : 1;
  const halfHeight = plan.height * 0.5;
  // Leech/roach outline from head (top) back to foot, y descending — used to
  // find the right-edge x for any grid row. Mast edge stays at x = 0; the
  // final point walks the foot edge back to the mast so low rows keep width.
  const leech: Array<readonly [number, number]> = plan.kind === "fore-aft"
    ? [[halfHeight, 0], [-halfHeight * 0.78, direction * plan.width], [-halfHeight, 0]]
    : plan.kind === "square"
      ? [
        [halfHeight, 0],
        [halfHeight * 0.7, direction * plan.width * 0.88],
        [-halfHeight * 0.72, direction * plan.width],
        [-halfHeight, 0],
      ]
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

  const SEGMENTS_U = 6;
  const SEGMENTS_V = 6;
  // Belly depth scales with sail width; the yard yaw twists the head a few
  // degrees around the mast axis so square sails never read as paper.
  const belly = plan.width * (plan.kind === "square" ? 0.18 : 0.14);
  const yardYaw = plan.kind === "square" ? direction * 0.1 : direction * 0.05;

  const vertexCount = (SEGMENTS_U + 1) * (SEGMENTS_V + 1);
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices: number[] = [];
  for (let row = 0; row <= SEGMENTS_V; row += 1) {
    const v = row / SEGMENTS_V;
    const y = -halfHeight + v * plan.height;
    const edgeX = edgeXAt(y);
    for (let column = 0; column <= SEGMENTS_U; column += 1) {
      const u = column / SEGMENTS_U;
      const baseX = edgeX * u;
      // Yard yaw: rotate the row about the mast line, most at the head.
      const yaw = yardYaw * v * v;
      const x = baseX * Math.cos(yaw);
      let z = -baseX * Math.sin(yaw);
      // Belly: fullest mid-panel, pinned flat at mast, head, and foot.
      z += Math.sin(u * Math.PI) * Math.sin(v * Math.PI) * belly;
      const vertex = row * (SEGMENTS_U + 1) + column;
      positions[vertex * 3] = x;
      positions[vertex * 3 + 1] = y;
      positions[vertex * 3 + 2] = z;
      uvs[vertex * 2] = u;
      uvs[vertex * 2 + 1] = v;
      if (row < SEGMENTS_V && column < SEGMENTS_U) {
        const a = vertex;
        const b = vertex + 1;
        const c = vertex + SEGMENTS_U + 1;
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
 * W5.4 cloth detail: vertical panel seams and two reef bands baked into the
 * sail's vertex color, plus a slight shading of the belly so the cloth reads
 * as fabric under tension rather than a printed card.
 *
 * Deliberately greyscale and shallow. On the identity sail this multiplies the
 * logo atlas read, so anything strong here would eat the mark it exists to
 * show; the reef bands are placed in the lower third, clear of the logo field.
 * `mergeAtlasSails` fills color with 1 when a sail has none, so producing the
 * attribute here keeps every sail on the same merge path.
 */
function bakeSailVertexColors(geometry: BufferGeometry, plan: GardenSailPlan): void {
  const position = geometry.getAttribute("position");
  const uv = geometry.getAttribute("uv");
  const colors = new Float32Array(position.count * 3);
  const panels = plan.kind === "square" ? 4 : 3;
  for (let index = 0; index < position.count; index += 1) {
    const u = uv.getX(index);
    const v = uv.getY(index);
    // Panel seams: narrow darker lines where the cloths are sewn together.
    const seam = Math.abs((u * panels - Math.floor(u * panels)) - 0.5) * 2;
    let shade = 1 - 0.07 * (1 - MathUtils.smoothstep(seam, 0, 0.35));
    // Reef bands across the foot, where reef points would be tied off.
    for (const band of [0.14, 0.27]) {
      shade -= 0.06 * (1 - MathUtils.smoothstep(Math.abs(v - band), 0, 0.035));
    }
    // The belly catches less light toward the leech as it curves away.
    shade *= 1 - 0.06 * u * u;
    colors[index * 3] = shade;
    colors[index * 3 + 1] = shade;
    colors[index * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/**
 * S3: sparse real rigging — per mast a forestay (to the next mast toward the
 * bow, or to the bow tip for the foremast), a backstay to the stern deck, and
 * two shrouds to the rails; junks additionally keep their horizontal sail
 * battens. Everything merges into one cached LineSegments point list per
 * silhouette so the whole rig stays a single draw call.
 */
function riggingPoints(
  silhouette: GardenHullSilhouette,
  rig: readonly GardenMastPlan[],
): Vector3[] {
  const points: Vector3[] = [];
  // Bow at +x: masts sorted bow-ward first so each forestay can target the
  // mast ahead of it.
  const bowFirst = [...rig].sort((left, right) => right.x - left.x);
  const halfBeam = Math.max(
    ...createHullShape(silhouette, 1).getPoints(4).map((point) => Math.abs(point.y)),
  );
  for (const [index, mastPlan] of bowFirst.entries()) {
    const head = new Vector3(mastPlan.x, mastPlan.height + 0.34, 0);
    const ahead = bowFirst[index - 1];
    // Forestay: to the mast ahead at ~2/3 height, or to the stem/bowsprit.
    points.push(
      head,
      ahead
        ? new Vector3(ahead.x, ahead.height * 0.66, 0)
        : new Vector3(4.45, 0.78, 0),
    );
    // Backstay to the stern deck.
    points.push(head, new Vector3(-3.12, 0.74, 0));
    // Two shrouds to the rails, a touch aft of the mast.
    points.push(head, new Vector3(mastPlan.x - 0.32, 0.6, halfBeam * 0.82));
    points.push(head, new Vector3(mastPlan.x - 0.32, 0.6, -halfBeam * 0.82));
    // W5.4 halyards: the lines that actually hoist each yard, running from the
    // masthead down to the head of every sail on this mast. Two segments per
    // sail, so the rig reads as worked rather than decorative.
    for (const sailPlan of mastPlan.sails) {
      const direction = sailPlan.reverse ? -1 : 1;
      const headY = sailPlan.centerY + sailPlan.height * 0.5;
      points.push(head, new Vector3(mastPlan.x + direction * 0.05, headY, 0.05));
      points.push(
        new Vector3(mastPlan.x + direction * 0.05, headY, 0.05),
        new Vector3(mastPlan.x + direction * sailPlan.width * 0.9, headY - 0.06, 0.05),
      );
    }
  }
  if (silhouette === "junk") {
    for (const mastPlan of rig) {
      for (const sailPlan of mastPlan.sails) {
        const direction = sailPlan.reverse ? -1 : 1;
        const near = mastPlan.x;
        const far = mastPlan.x + direction * sailPlan.width;
        for (let batten = 0; batten < 3; batten += 1) {
          const y = sailPlan.centerY - sailPlan.height * 0.32
            + (batten / 2) * sailPlan.height * 0.64;
          points.push(new Vector3(near, y, 0.045), new Vector3(far, y, 0.045));
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

const WAKE_QUAD_COUNT = 7;

function createWake(cache: GardenShipGeometryCache): { detail: Group; root: Group } {
  const root = new Group();
  const detail = new Group();
  root.name = "ship-wake";
  detail.name = "ship-wake-detail";
  root.add(detail);

  // A short trail of soft foam quads astern of the hull. Each quad grows then
  // tapers along the trail so the wake reads as a widening-then-fading wedge;
  // the per-frame ship loop stretches the whole trail by wake intensity and
  // hides it entirely under reduced motion / constrained tiers.
  const quadGeometry = cachedShipGeometry(cache, "wake.quad", () => {
    const geometry = new PlaneGeometry(1, 1);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  });
  const trail = new InstancedMesh(quadGeometry, cache.wakeFillMaterial, WAKE_QUAD_COUNT);
  const matrix = new Matrix4();
  for (let index = 0; index < WAKE_QUAD_COUNT; index += 1) {
    const age = index / (WAKE_QUAD_COUNT - 1);
    const length = 1.1 + age * 1.7;
    const width = 0.9 + Math.sin(age * Math.PI) * 2.3;
    matrix.makeScale(length, 1, width);
    matrix.setPosition(-2.3 - age * 3.9, -0.34, 0);
    trail.setMatrixAt(index, matrix);
  }
  trail.instanceMatrix.needsUpdate = true;
  root.add(trail);

  for (const z of [-0.5, 0.5]) {
    const geometry = cachedShipGeometry(
      cache,
      `wake.${z}`,
      () => new BufferGeometry().setFromPoints([
        new Vector3(-2.25, -0.33, z * 0.36),
        new Vector3(-3.8, -0.34, z * 1.35),
        new Vector3(-5.8, -0.35, z * 2.48),
      ]),
    );
    detail.add(new Line(geometry, cache.wakeMaterial));
  }
  root.visible = false;
  return { detail, root };
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
