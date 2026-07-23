import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
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

export interface ShipVisual {
  bobPhase: number;
  displayOffset: { x: number; y: number };
  fineDetail: Group;
  identitySailMaterial: MeshStandardMaterial;
  representative: boolean;
  root: Group;
  sampleState: string;
  selectionRadius: number;
  ship: ShipNode;
  wake: Group;
  wakeDetail: Group;
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

const GARDEN_SHIP_CABINS: Partial<Record<
  GardenHullSilhouette,
  { height: number; width: number; x: number; z: number }
>> = {
  galleon: { height: 0.82, width: 1.65, x: -2.15, z: 1.55 },
  junk: { height: 0.68, width: 1.55, x: -1.35, z: 1.28 },
  schooner: { height: 0.42, width: 1.05, x: -2.15, z: 0.92 },
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
  const hullMaterial = new MeshStandardMaterial({
    color: hullColor,
    emissive: hullColor,
    emissiveIntensity: 0.035,
    flatShading: true,
    roughness: 0.82,
  });
  const deckMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_warm,
    flatShading: true,
    roughness: 0.92,
  });
  const gunwaleMaterial = new MeshStandardMaterial({
    color: accentColor,
    flatShading: true,
    roughness: 0.86,
  });
  const hullGeometry = cachedShipGeometry(
    cache,
    `hull.${silhouette}`,
    () => createHullGeometry(silhouette),
  );
  const keel = new Mesh(hullGeometry, keelMaterial);
  keel.position.y = -0.16;
  keel.scale.set(1.015, 0.82, 1.015);
  root.add(keel);
  const hull = new Mesh(hullGeometry, hullMaterial);
  hull.position.y = 0.05;
  root.add(hull);
  const gunwale = new Mesh(
    cachedShipGeometry(
      cache,
      `deck.${silhouette}.rim`,
      () => createDeckGeometry(silhouette, 0.91),
    ),
    gunwaleMaterial,
  );
  gunwale.position.y = 0.47;
  root.add(gunwale);
  const deck = new Mesh(
    cachedShipGeometry(
      cache,
      `deck.${silhouette}.inner`,
      () => createDeckGeometry(silhouette, 0.79),
    ),
    deckMaterial,
  );
  deck.position.y = 0.5;
  fineDetail.add(deck);

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
  const plainSailMaterial = new MeshStandardMaterial({
    color: readableSailColor,
    emissive: readableSailColor,
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
      if (isIdentitySail) sail.scale.set(1.22, 1.22, 1);
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
  }

  const tallestMast = rig.reduce((tallest, entry) => (
    entry.height > tallest.height ? entry : tallest
  ));
  const rigging = new LineSegments(
    cachedShipGeometry(
      cache,
      `rigging.${silhouette}`,
      () => new BufferGeometry().setFromPoints([
        new Vector3(tallestMast.x, tallestMast.height + 0.34, 0),
        new Vector3(4.15, 0.7, 0),
        new Vector3(tallestMast.x, tallestMast.height + 0.34, 0),
        new Vector3(-3.05, 0.72, 0),
        new Vector3(tallestMast.x, tallestMast.height * 0.68, 0.03),
        new Vector3(2.5, 0.62, 0.03),
      ]),
    ),
    new LineBasicMaterial({
      color: "#3f342b",
      opacity: 0.62,
      transparent: true,
    }),
  );
  fineDetail.add(rigging);
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
  return {
    bobPhase: stableUnit(ship.id) * Math.PI * 2,
    displayOffset,
    fineDetail,
    identitySailMaterial,
    representative,
    root,
    sampleState: "idle",
    selectionRadius: gardenShipSelectionRadius(ship),
    ship,
    wake: wake.root,
    wakeDetail: wake.detail,
  };
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
  return geometry;
}

function createDeckGeometry(
  silhouette: GardenHullSilhouette,
  scale: number,
): ShapeGeometry {
  const geometry = new ShapeGeometry(createHullShape(silhouette, scale));
  geometry.rotateX(-Math.PI / 2);
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
    positions.setZ(index, Math.sin(MathUtils.clamp(y, 0, 1) * Math.PI) * x * 0.15);
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

function createPennantGeometry(): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(0.68, -0.16);
  shape.lineTo(0, -0.34);
  shape.closePath();
  return new ShapeGeometry(shape);
}

function createWake(cache: GardenShipGeometryCache): { detail: Group; root: Group } {
  const root = new Group();
  const detail = new Group();
  root.name = "ship-wake";
  detail.name = "ship-wake-detail";
  root.add(detail);
  const shape = new Shape();
  shape.moveTo(-2.25, 0);
  shape.lineTo(-5.8, -1.24);
  shape.lineTo(-5.12, 0);
  shape.lineTo(-5.8, 1.24);
  shape.closePath();
  const fillGeometry = cachedShipGeometry(cache, "wake.fill", () => {
    const geometry = new ShapeGeometry(shape);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, -0.34, 0);
    return geometry;
  });
  root.add(new Mesh(fillGeometry, cache.wakeFillMaterial));
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
