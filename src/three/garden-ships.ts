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
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";
import {
  GARDEN_SHIP_ROOT_Y,
  GARDEN_SILHOUETTE_FOR_HULL as SILHOUETTE_FOR_HULL,
  gardenShipSelectionRadius,
  type GardenHullSilhouette,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { ShipNode } from "../systems/world-types";
import { gardenModelAnchor, type GardenModelId } from "./garden-models";
import { createGardenSailTexture } from "./garden-sail-texture";
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

export interface ShipVisual {
  bobPhase: number;
  displayOffset: { x: number; y: number };
  fineDetail: Group;
  /** Hero GLB hull to attach for titans/uniques (null for the procedural fleet). */
  heroModelId: GardenModelId | null;
  /** Procedural hull/rig parts hidden once a hero GLB attaches (identity sail stays). */
  heroHideable: Object3D[];
  /** Subtle livery-primary multiply applied to the hero hull wood on attach. */
  heroHullTint: Color;
  /** The logo sail mesh, repositioned onto the hero main mast when a GLB attaches. */
  identitySail: Mesh | null;
  identitySailMaterial: MeshStandardMaterial;
  /** Lantern hang points in ship-local space (stern / bow+stern / a string). */
  lanternPoints: readonly Vector3[];
  /** Warm-lane intensity this ship lays on the sea (by fleet tier). */
  laneIntensity: number;
  /** Slowed bob envelope for larger hulls (D7 motion hierarchy). */
  motionAmplitudeScale: number;
  motionPeriodScale: number;
  /** Previous heading angle, for heel-into-turn (null until first moving frame). */
  prevHeadingAngle: number | null;
  representative: boolean;
  root: Group;
  sampleState: string;
  selectionRadius: number;
  ship: ShipNode;
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
  assetGeneration: string | null;
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
function shipHeroModelId(ship: ShipNode): GardenModelId | null {
  if (ship.visual.sizeTier === "titan") return "garden-hero-titan";
  if (ship.visual.sizeTier === "unique") return "garden-hero-heritage";
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
  const visualScale = MathUtils.clamp(ship.visual.scale || 1, 0.72, 1.6) * 0.82;
  root.scale.setScalar(visualScale);

  const hullColor = new Color(HARBOR_PALETTE.timber_dark).lerp(
    new Color(safeCssColor(ship.visual.livery?.primary, HARBOR_PALETTE.timber_warm)),
    0.38,
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
    color: HARBOR_PALETTE.timber_warm,
    flatShading: true,
    roughness: 0.92,
    vertexColors: true,
  });
  const gunwaleMaterial = new MeshStandardMaterial({
    color: accentColor,
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
  const readableSailColor = new Color(sailColor)
    .lerp(new Color(GARDEN_COLORS.limestoneLight), 0.28);
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
  const mastRotation = silhouette === "clipper"
    ? -0.045
    : silhouette === "schooner"
      ? -0.075
      : 0;
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
        color: accentColor,
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
      () => new BufferGeometry().setFromPoints(riggingPoints(silhouette, rig, tallestMast)),
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
    bobPhase: stableUnit(ship.id) * Math.PI * 2,
    displayOffset,
    fineDetail,
    heroHideable,
    heroHullTint,
    heroModelId,
    identitySail: identitySailMesh,
    identitySailMaterial,
    lanternPoints: lanternPointsForTier(tier),
    laneIntensity: FLEET_TIER_LANE_INTENSITY[tier],
    motionAmplitudeScale: motion.amplitude,
    motionPeriodScale: motion.period,
    prevHeadingAngle: null,
    representative,
    root,
    sampleState: "idle",
    selectionRadius: gardenShipSelectionRadius(ship),
    ship,
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
  const generation = frame.assets.getRenderAssetGenerationKey();
  if (content.assetGeneration === generation) return;
  content.assetGeneration = generation;

  for (const visual of content.ships) {
    const material = visual.identitySailMaterial;
    const previousTexture = material.map;
    material.map = createGardenSailTexture(
      visual.ship,
      frame.assets.getLogo(visual.ship.logoSrc),
    );
    material.color.set(material.map ? "#f7f2e4" : visual.ship.visual.sailColor);
    material.emissive.set("#fff7e3");
    material.emissiveMap = material.map;
    material.needsUpdate = true;
    if (previousTexture && previousTexture !== material.map) previousTexture.dispose();
  }
}

const LANTERN_CORE_SIZE = 0.36;
const LANTERN_GLOW_SIZE = 3;
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

function createHullGeometry(silhouette: GardenHullSilhouette): ExtrudeGeometry {
  const shape = createHullShape(silhouette, 1);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: 0.13,
    bevelThickness: 0.12,
    depth: 0.72,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -0.5, 0);
  bakeHullVertexColors(geometry);
  return geometry;
}

/**
 * Bakes the 3-tone hull shading + fake AO into a vertex-color attribute (once,
 * on the cached geometry). Y runs keel→gunwale: a warm-dark waterline shadow
 * lifts through a neutral flank to a warm gunwale highlight; the very keel is
 * pinched darker for fake AO. Values multiply the per-ship livery color.
 */
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
    colors[index * 3] = scratch.r;
    colors[index * 3 + 1] = scratch.g;
    colors[index * 3 + 2] = scratch.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
}

/**
 * Deck/gunwale plate: adds a curved sheer (rises fore and aft, bow highest) and
 * a radial vertex-color AO (bright catching rail edge, darker planked center).
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
    // Sheer: parabolic rise toward both ends, bow (+x) lifted a touch more.
    position.setY(index, sheer * nx * nx * (nx > 0 ? 1.12 : 1));
    const radial = Math.min(1, Math.hypot(nx, position.getZ(index) / maxZ));
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
  const points: Record<GardenHullSilhouette, ReadonlyArray<readonly [number, number]>> = {
    galleon: [[-3.35, -1.35], [-3.65, 1.35], [1.95, 1.3], [4.05, 0], [1.95, -1.3]],
    clipper: [[-3.55, -0.72], [-3.45, 0.72], [2.65, 0.76], [4.85, 0], [2.65, -0.76]],
    schooner: [[-3.75, -0.82], [-3.6, 0.82], [2.75, 0.8], [4.35, 0], [2.75, -0.8]],
    junk: [[-3.2, -1.18], [-3.25, 1.18], [2.75, 1.12], [3.65, 0], [2.75, -1.12]],
  };
  const shape = new Shape();
  const [first, ...rest] = points[silhouette];
  shape.moveTo(first![0] * scale, first![1] * scale);
  for (const [x, y] of rest) shape.lineTo(x * scale, y * scale);
  shape.closePath();
  return shape;
}

function createSailGeometry(plan: GardenSailPlan): ShapeGeometry {
  const direction = plan.reverse ? -1 : 1;
  const halfHeight = plan.height * 0.5;
  const shape = new Shape();
  shape.moveTo(0, -halfHeight);
  shape.lineTo(0, halfHeight);
  if (plan.kind === "fore-aft") {
    shape.lineTo(direction * plan.width, -halfHeight * 0.78);
  } else if (plan.kind === "square") {
    shape.lineTo(direction * plan.width * 0.88, halfHeight * 0.7);
    shape.lineTo(direction * plan.width, -halfHeight * 0.72);
  } else {
    shape.lineTo(direction * plan.width * 0.72, halfHeight * 0.68);
    shape.lineTo(direction * plan.width, 0);
    shape.lineTo(direction * plan.width * 0.86, -halfHeight * 0.75);
  }
  shape.closePath();
  const geometry = new ShapeGeometry(shape);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = Math.abs(positions.getX(index)) / Math.max(0.01, plan.width);
    const y = positions.getY(index) / Math.max(0.01, plan.height) + 0.5;
    positions.setZ(index, Math.sin(MathUtils.clamp(y, 0, 1) * Math.PI) * x * 0.24);
  }
  positions.needsUpdate = true;
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  const uvs = geometry.getAttribute("uv");
  if (bounds && uvs) {
    const width = Math.max(0.01, bounds.max.x - bounds.min.x);
    const height = Math.max(0.01, bounds.max.y - bounds.min.y);
    for (let index = 0; index < positions.count; index += 1) {
      uvs.setXY(
        index,
        (positions.getX(index) - bounds.min.x) / width,
        (positions.getY(index) - bounds.min.y) / height,
      );
    }
    uvs.needsUpdate = true;
  }
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Stays plus, for junks, horizontal sail battens — all merged into one cached
 * LineSegments point list so the whole rig is a single draw call per silhouette.
 */
function riggingPoints(
  silhouette: GardenHullSilhouette,
  rig: readonly GardenMastPlan[],
  tallestMast: GardenMastPlan,
): Vector3[] {
  const points = [
    new Vector3(tallestMast.x, tallestMast.height + 0.34, 0),
    new Vector3(4.15, 0.7, 0),
    new Vector3(tallestMast.x, tallestMast.height + 0.34, 0),
    new Vector3(-3.05, 0.72, 0),
    new Vector3(tallestMast.x, tallestMast.height * 0.68, 0.03),
    new Vector3(2.5, 0.62, 0.03),
  ];
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

function createPennantGeometry(): ShapeGeometry {
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
  const shadows = new InstancedMesh(
    geometry,
    new MeshBasicMaterial({
      color: "#022c34",
      depthWrite: false,
      opacity: 0.2,
      transparent: true,
    }),
    count,
  );
  shadows.renderOrder = 1;
  return shadows;
}
