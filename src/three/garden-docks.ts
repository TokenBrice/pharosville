import {
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Group,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  GARDEN_DOCK_ROOT_Y,
  GARDEN_WATER_Y as WATER_LEVEL,
} from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DockNode } from "../systems/world-types";
import {
  assignGardenChainFlagCell,
  gardenChainFlagAtlas,
  gardenChainFlagCellUv,
} from "./garden-chain-flag";
import { applyGardenHeightFog } from "./garden-height-fog";
import { setTilePosition, stableUnit, TILE_SCALE } from "./garden-util";
import type { GardenHarborCalmMask } from "./garden-water-contract";

const scratchMatrix = new Matrix4();

/** One signature prop distinguishes each harbor at a glance. */
type SignatureKind = "arch" | "crane" | "net-racks" | "dinghy" | "crate-tower" | "derrick";
const SIGNATURE_KINDS: readonly SignatureKind[] = [
  "crane",
  "net-racks",
  "dinghy",
  "crate-tower",
  "derrick",
];

/**
 * N4: the harbour's *plan* — the shape of its stonework and piers. The
 * operator's note was that harbours are "barely noticeable and recognizable",
 * and a signature prop on an otherwise identical pier is not recognition. The
 * plan changes the footprint itself, so two harbours differ in silhouette
 * before any flag or prop is read.
 */
export type HarborPlan = "t-head" | "l-quay" | "double-finger" | "mole" | "wharf";
const HARBOR_PLANS: readonly HarborPlan[] = ["t-head", "l-quay", "double-finger", "mole", "wharf"];
/** Outermost deck edge of each plan, in pier widths from the centreline. */
const PLAN_HALF_SPAN: Record<HarborPlan, number> = {
  "double-finger": 2.26,
  "l-quay": 1.67,
  mole: 0.75,
  "t-head": 1.2,
  wharf: 1.9,
};

/**
 * H3 — the four axes of harbour identity. A plan alone still left ten wharves
 * that read as one template with the numbers twiddled, because everything above
 * deck level was identical. These are the things a viewer actually reads from
 * 40 tiles out: whether the basin is enclosed, what stands up tall over it,
 * what rhythm the roofline has, and what industry occupies the hard.
 */
/** Sea defences: how much water this harbour encloses, and from which side. */
export type HarborEnclosure = "open" | "arm" | "hook" | "pincer" | "grand";
/** The tall thing on the skyline — the single strongest identity cue. */
export type HarborLandmark = "none" | "beacon" | "campanile" | "gantry" | "sheerlegs";
/** Warehouse roof shape and bay rhythm. */
export type HarborRoofline = "gable" | "hipped" | "sawtooth" | "vault";
/** The industry worked on the hard beside the quay. */
export type HarborWorks = "none" | "careen" | "drydock" | "slipway";

export interface HarborIdentity {
  enclosure: HarborEnclosure;
  landmark: HarborLandmark;
  plan: HarborPlan;
  roofline: HarborRoofline;
  signature: SignatureKind;
  works: HarborWorks;
}

const HARBOR_ENCLOSURES: readonly HarborEnclosure[] = ["open", "arm", "hook", "pincer"];
const HARBOR_LANDMARKS: readonly HarborLandmark[] = ["none", "beacon", "campanile", "gantry", "sheerlegs"];
const HARBOR_ROOFLINES: readonly HarborRoofline[] = ["gable", "hipped", "sawtooth", "vault"];
const HARBOR_WORKS: readonly HarborWorks[] = ["none", "careen", "drydock", "slipway"];

/**
 * The named slips, each authored rather than hashed, so the ten harbours a
 * viewer actually sees are deliberately different from one another instead of
 * accidentally different. Chains outside this table fall back to a hash of
 * their id (`fallbackIdentity`), which still gives a coherent harbour.
 *
 * `grand` is Ethereum's alone: nothing else encloses a full basin, and nothing
 * else carries a campanile, a gateway and a customs house.
 */
const CHAIN_HARBOR_IDENTITIES: Record<string, HarborIdentity> = {
  aptos: { enclosure: "arm", landmark: "none", plan: "wharf", roofline: "gable", signature: "dinghy", works: "careen" },
  arbitrum: { enclosure: "hook", landmark: "gantry", plan: "wharf", roofline: "gable", signature: "crane", works: "drydock" },
  avalanche: { enclosure: "pincer", landmark: "sheerlegs", plan: "mole", roofline: "hipped", signature: "derrick", works: "careen" },
  base: { enclosure: "arm", landmark: "beacon", plan: "t-head", roofline: "sawtooth", signature: "net-racks", works: "none" },
  bsc: { enclosure: "pincer", landmark: "gantry", plan: "double-finger", roofline: "sawtooth", signature: "crate-tower", works: "none" },
  ethereum: { enclosure: "grand", landmark: "campanile", plan: "t-head", roofline: "hipped", signature: "arch", works: "drydock" },
  hyperliquid: { enclosure: "open", landmark: "campanile", plan: "double-finger", roofline: "vault", signature: "crate-tower", works: "none" },
  polygon: { enclosure: "open", landmark: "gantry", plan: "l-quay", roofline: "vault", signature: "dinghy", works: "slipway" },
  solana: { enclosure: "arm", landmark: "sheerlegs", plan: "l-quay", roofline: "gable", signature: "crane", works: "slipway" },
  ton: { enclosure: "open", landmark: "beacon", plan: "wharf", roofline: "vault", signature: "dinghy", works: "none" },
  tron: { enclosure: "hook", landmark: "beacon", plan: "mole", roofline: "vault", signature: "derrick", works: "none" },
};

// The fixed camera's azimuth. Harbour roots yaw to face the island, so the
// flag counter-rotates by this to present its face to the viewer wherever its
// harbour ended up — a flag edge-on is not a flag.
const CAMERA_FACING_YAW = Math.PI / 4;

/**
 * How many cargo-tide slots each harbour authors per lane. The RUN's length is
 * what encodes magnitude, so the slots are laid out for a full run and the tide
 * fills the first N of them.
 */
export const CARGO_TIDE_SLOTS = 6;

/** One cargo-tide berth, in the harbour root's own local space. */
export interface CargoTideSlot {
  x: number;
  y: number;
  z: number;
}

/**
 * Where the mint/burn tide stands its cargo, per direction.
 *
 * The two lanes are the cue: `aboard` runs out along the pier deck toward the
 * ships (supply being created and loaded out), `ashore` runs back along the
 * quay's seaward edge (supply destroyed and landed). Which lane is occupied is
 * the direction, and nothing else in the harbour uses either lane — the
 * backing-diversity crates stack inboard of the quay edge and the barrels sit
 * on its landward apron.
 */
export interface CargoTideLanes {
  aboard: CargoTideSlot[];
  ashore: CargoTideSlot[];
}

/**
 * The harbour's sea-washed vertical face, in local space — where the tide line
 * is read.
 *
 * NOT the pilings, despite being the obvious candidate: a pile spans local y
 * -2.7 to -0.1 against a waterline at -0.2, so barely a tenth of a unit of it
 * ever stands above water. The quay wall runs -0.44 to +0.48 and is the only
 * thing on a harbour with real height above the waterline to mark.
 */
export interface DockTideFace {
  /** Centre of the face, local space; `y` is the still-water line. */
  x: number;
  y: number;
  z: number;
  /** Width along the quay run. */
  width: number;
}

export interface DockVisual {
  /** Local-space cargo-tide berths; see `CargoTideLanes`. */
  cargoTideLanes: CargoTideLanes;
  /** Where this harbour carries its tide line; see `DockTideFace`. */
  tideFace: DockTideFace;
  dock: DockNode;
  fineDetail: Group;
  /** Seaward reach and lateral span of the built harbour, in world units. */
  footprint: { length: number; span: number };
  identity: HarborIdentity;
  /** World-space lamp positions (post tops) for sea-lane registration. */
  lampWorldPositions: { x: number; z: number }[];
  plan: HarborPlan;
  root: Group;
  signature: SignatureKind;
}

export function createHarborLanterns(
  islandTile: { x: number; y: number },
): {
  lightMaterial: MeshStandardMaterial;
  root: Group;
} {
  const root = new Group();
  setTilePosition(root, islandTile, 0);
  const count = 12;
  const bodyMaterial = new MeshStandardMaterial({
    color: "#766348",
    metalness: 0.38,
    roughness: 0.65,
  });
  const lightMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 0.25,
    roughness: 0.25,
  });
  const bodies = new InstancedMesh(
    new CylinderGeometry(0.12, 0.2, 0.42, 6),
    bodyMaterial,
    count,
  );
  const lights = new InstancedMesh(
    new SphereGeometry(0.16, 6, 4),
    lightMaterial,
    count,
  );
  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2
      + stableUnit(`harbor-lantern-angle.${index}`) * 0.16;
    const radiusX = 22 + (index % 3) * 1.25;
    const radiusZ = 15.5 + (index % 2) * 1.15;
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.26, z);
    bodies.setMatrixAt(index, scratchMatrix);
    scratchMatrix.makeTranslation(x, WATER_LEVEL + 0.58, z);
    lights.setMatrixAt(index, scratchMatrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  lights.instanceMatrix.needsUpdate = true;
  root.add(bodies, lights);
  applyGardenHeightFog(root);
  return { lightMaterial, root };
}

/**
 * Builds one chain harbour.
 *
 * Local +X points OUT TO SEA (the root yaws to face away from the island), so
 * the quay wall and its warehouses are the landward end, set against the
 * shore, and the pier runs from them out over open water to a head carrying
 * the crane, the lamps and the chain flag. H1 reversed this: the quay used to
 * be the seaward end with the pier reaching back toward the island, which put
 * the warehouses on stilts out at sea and the berths against the rock.
 *
 * Draw budget: static structure is merged by material and repeated units are
 * instanced, so a harbour is ~18 draws regardless of how much is built into it.
 * H3 added towers, sea arms, dry docks and slipways for zero extra draws by
 * pushing every one of them into the existing per-material merge buckets — the
 * number only moves when a new *material* enters the harbour.
 */
export function createDock(
  dock: DockNode,
  displayTile: { x: number; y: number },
  islandTile: { x: number; y: number },
): DockVisual {
  const root = new Group();
  const fineDetail = new Group();
  fineDetail.name = "dock-fine-detail";
  root.add(fineDetail);
  setTilePosition(root, displayTile, GARDEN_DOCK_ROOT_Y);
  const seawardX = (displayTile.x - islandTile.x) * TILE_SCALE;
  const seawardZ = (displayTile.y - islandTile.y) * TILE_SCALE;
  root.rotation.y = -Math.atan2(seawardZ, seawardX);

  const identity = harborIdentity(dock);
  const { enclosure, landmark, plan, roofline, signature, works } = identity;
  // H3: the old scale ran clamp(log10/11, 0.72, 1.18) — a 1.6x spread over the
  // whole supply range, which is why no harbour dominated. This band is wider
  // and anchored on the range stablecoin supply actually occupies (~3e8 to
  // ~5e11), so the largest chain is materially bigger than the smallest.
  const amountScale = harborAmountScale(dock.totalUsd);
  // The capital's plan is larger than any other harbour's, on top of it already
  // topping the supply band. Ordering stays honest: `amountScale` is monotonic
  // in totalUsd for every chain, and `grand` is architecture, not a thumb on
  // the scale.
  // The capital grows SEAWARD, where the harbour ring diverges and there is
  // room. Growing its quay landward instead would drive the stonework into the
  // tight part of the ring and foul the next chain's harbour.
  const grand = enclosure === "grand";
  const length = 7.2 * amountScale * (grand ? 1.34 : 1);
  const width = (1.65 + amountScale * 0.35) * (grand ? 1.18 : 1);
  const accent = dockAccentColor(dock);
  // `dock.size` is the chain's supply band (1-10). It governs how much harbour
  // gets built: a big chain gets a longer quay, more warehouses, a crane, and
  // more berths, so scale reads as consequence rather than decoration.
  const size = MathUtils.clamp(dock.size, 1, 10);
  const supply = size / 10;

  const timber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_mid,
    roughness: 0.88,
  });
  const stone = new MeshStandardMaterial({
    color: "#8e8877",
    flatShading: true,
    roughness: 0.97,
  });
  const metal = new MeshStandardMaterial({
    color: "#6d5d49",
    metalness: 0.42,
    roughness: 0.62,
  });
  // Double-sided so the flat signal pennant can share this material (and this
  // draw) with the warehouse roofs instead of costing one of its own.
  const accentMaterial = new MeshStandardMaterial({
    color: accent,
    flatShading: true,
    roughness: 0.86,
    side: DoubleSide,
  });

  // Per-material merge buckets. Everything static in the harbour lands in one
  // of these; each becomes exactly one draw call however much is pushed in.
  const deckParts: BufferGeometry[] = [];
  const stoneParts: BufferGeometry[] = [];
  const moleParts: BufferGeometry[] = [];
  const wallParts: BufferGeometry[] = [];
  const roofParts: BufferGeometry[] = [];
  const windowParts: BufferGeometry[] = [];
  const extraLampLocals: { x: number; y: number; z: number }[] = [];

  // ---- Piers --------------------------------------------------------------
  // The plan decides the deck footprint; everything downstream (bollards,
  // ropes, lamps, crane) is placed against these same numbers.
  const headX = length * 0.56;
  pushGeometry(deckParts, createPierDeckGeometry(length, width, 0.42), length * 0.2, 0, 0);
  switch (plan) {
    case "t-head":
      pushGeometry(deckParts, createPierDeckGeometry(1.25, width * 2.4, 0.36), headX, 0, 0);
      break;
    case "l-quay":
      pushGeometry(
        deckParts,
        createPierDeckGeometry(1.15, width * 1.9, 0.36),
        headX,
        0,
        width * 0.72,
      );
      break;
    case "double-finger": {
      // A second finger pier running parallel, joined at the root.
      const offset = width * 1.85;
      pushGeometry(deckParts, createPierDeckGeometry(length * 0.78, width * 0.82, 0.38), length * 0.16, 0, offset);
      pushGeometry(deckParts, createPierDeckGeometry(0.9, offset, 0.36), -length * 0.16, 0, offset / 2);
      break;
    }
    case "mole":
      // Short timber pier: the mole itself (stone, below) carries this harbour.
      pushGeometry(deckParts, createPierDeckGeometry(1.0, width * 1.5, 0.36), headX * 0.8, 0, 0);
      break;
    case "wharf":
      pushGeometry(deckParts, createPierDeckGeometry(length * 0.5, width * 0.8, 0.36), length * 0.1, 0, -width * 1.5);
      break;
  }
  if (grand) {
    // The capital moors on both sides of a central mole: a second inner pier
    // parallel to the first, so Ethereum alone has two working berth faces.
    pushGeometry(
      deckParts,
      createPierDeckGeometry(length * 0.64, width * 0.86, 0.4),
      length * 0.3,
      0,
      -width * 1.8,
    );
    pushGeometry(deckParts, createPierDeckGeometry(0.9, width * 1.8, 0.36), -length * 0.02, 0, -width * 0.9);
  }

  // R12: pilings. The deck sits above the waterline, so without legs reaching
  // down into it the outlying chain platforms read as hovering slabs. One
  // instanced mesh carries every pile on the pier.
  root.add(createPierPilings(length, width, plan, grand));

  // ---- Quay wall ----------------------------------------------------------
  // Cut stone at the seaward root of the pier, with a coping course and a
  // stepped face down to the waterline: the thing that makes a harbour read as
  // built rather than as a jetty dropped on the sea.
  const quayLength = (2.6 + supply * 3.4)
    * (plan === "mole" || plan === "wharf" ? 1.45 : 1)
    * (grand ? 1.15 : 1);
  const quayWidth = width * (plan === "wharf" ? 3.1 : 2.15);
  const quayX = -length * (grand ? 0.24 : 0.34);
  pushGeometry(stoneParts, new BoxGeometry(quayLength, 0.92, quayWidth), quayX, 0.02, 0);
  pushGeometry(stoneParts, new BoxGeometry(quayLength + 0.28, 0.16, quayWidth + 0.28), quayX, 0.54, 0);
  // Stepped face on the water side, so the wall has a section not a silhouette.
  for (let step = 0; step < 3; step += 1) {
    pushGeometry(
      stoneParts,
      new BoxGeometry(quayLength - step * 0.5, 0.3, 0.26),
      quayX,
      -0.28 - step * 0.3,
      quayWidth / 2 + 0.13 + step * 0.2,
    );
  }

  // ---- Warehouses ---------------------------------------------------------
  // The roofline sets the bay rhythm too: sawtooth sheds are many and narrow,
  // hipped blocks are few and tall, vaults are long and low.
  const warehouseCount = Math.max(1, (size >= 8 ? 3 : size >= 5 ? 2 : 1) + ROOFLINE_BAY_BIAS[roofline]);
  // Roof pitch is a per-chain constant, so a harbour's roofline is part of how
  // it is recognised.
  const pitch = 0.3 + stableUnit(`dock-roof.${dock.chainId}`) * 0.26;
  const customsIndex = grand ? Math.floor(warehouseCount / 2) : -1;
  for (let index = 0; index < warehouseCount; index += 1) {
    const bay = quayLength / warehouseCount;
    const x = quayX - quayLength / 2 + bay * (index + 0.5);
    const customs = index === customsIndex;
    const w = bay * (customs ? 0.9 : ROOFLINE_BAY_FILL[roofline]);
    const d = quayWidth * (customs ? 0.66 : 0.62);
    const h = (0.95 + stableUnit(`dock-warehouse.${dock.chainId}.${index}`) * 0.5)
      * ROOFLINE_HEIGHT[roofline]
      * (customs ? 2.05 : 1);
    pushGeometry(wallParts, new BoxGeometry(w, h, d), x, 0.62 + h / 2, 0);
    pushRoof(roofParts, customs ? "hipped" : roofline, x, w, d, 0.62 + h, pitch);
    if (customs) {
      // Plinth and eaves cornice, so the tallest block on the quay has a base
      // and a top rather than being one flat face.
      pushGeometry(stoneParts, new BoxGeometry(w * 1.1, 0.34, d * 1.1), x, 0.72, 0);
      pushGeometry(stoneParts, new BoxGeometry(w * 1.07, 0.16, d * 1.07), x, 0.62 + h, 0);
      // The customs house: a cupola and a lit clock face over the harbour's
      // one civic building. Ethereum only.
      pushGeometry(wallParts, new CylinderGeometry(d * 0.16, d * 0.18, 0.7, 8), x, 0.62 + h + 0.6, 0);
      pushGeometry(roofParts, new ConeGeometry(d * 0.22, 0.6, 8), x, 0.62 + h + 1.25, 0);
      const clock = new CylinderGeometry(0.22, 0.22, 0.06, 10);
      clock.rotateX(Math.PI / 2);
      pushGeometry(windowParts, clock, x, 0.62 + h * 0.78, d / 2 + 0.03);
    }
    // Loading door and a warm window: the harbour is worked, not abandoned.
    pushGeometry(windowParts, new BoxGeometry(0.26, 0.3, 0.05), x, 0.62 + h * 0.55, d / 2 + 0.02);
  }

  // ---- Landmark -----------------------------------------------------------
  // The tall thing. Beacon and campanile are stone, sheerlegs are timber, the
  // gantry is its own named group; all of them but the gantry cost no draw.
  const landmarkX = quayX + quayLength * 0.4;
  const landmarkZ = quayWidth * 0.72;
  switch (landmark) {
    case "beacon": {
      // A round rubble tower: splayed plinth, battered shaft, string course,
      // corbelled gallery, lantern. The batter and the two projecting courses
      // are what stop it reading as a grey pipe.
      const height = 3.6 + supply * 1.6;
      pushGeometry(stoneParts, new CylinderGeometry(0.86, 1.04, 0.46, 8), landmarkX, 0.65, landmarkZ);
      pushGeometry(stoneParts, new CylinderGeometry(0.46, 0.78, height, 8), landmarkX, height / 2 + 0.86, landmarkZ);
      pushGeometry(stoneParts, new CylinderGeometry(0.68, 0.72, 0.2, 8), landmarkX, height * 0.46 + 0.86, landmarkZ);
      pushGeometry(stoneParts, new CylinderGeometry(0.7, 0.56, 0.28, 8), landmarkX, height + 0.94, landmarkZ);
      pushGeometry(stoneParts, new CylinderGeometry(0.4, 0.4, 0.46, 8), landmarkX, height + 1.31, landmarkZ);
      pushGeometry(roofParts, new ConeGeometry(0.52, 0.66, 8), landmarkX, height + 1.87, landmarkZ);
      pushGeometry(windowParts, new BoxGeometry(0.16, 0.34, 0.1), landmarkX, height * 0.68 + 0.86, landmarkZ + 0.5);
      extraLampLocals.push({ x: landmarkX, y: height + 1.4, z: landmarkZ });
      break;
    }
    case "campanile": {
      // Three battered stages, each stepped in behind a projecting string
      // course, on a plinth, with corner pilasters running the full height and
      // a lit opening per stage. A monolith of the same width top to bottom
      // reads as a slab; a tower has a section.
      const height = (3.8 + supply * 1.7) * (grand ? 1.24 : 1);
      const shaft = height * 0.29;
      const stages = 3;
      const stage = height / stages;
      pushGeometry(stoneParts, new BoxGeometry(shaft * 1.32, 0.5, shaft * 1.32), landmarkX, 0.66, landmarkZ);
      for (let index = 0; index < stages; index += 1) {
        const base = 0.91 + index * stage;
        const wide = shaft * (1 - index * 0.11);
        pushGeometry(stoneParts, new BoxGeometry(wide, stage, wide), landmarkX, base + stage / 2, landmarkZ);
        // String course capping the stage, projecting proud of the wall.
        pushGeometry(stoneParts, new BoxGeometry(wide * 1.16, 0.16, wide * 1.16), landmarkX, base + stage, landmarkZ);
        // Corner pilasters: four vertical shadow lines that give the faces
        // relief instead of one flat plane.
        for (const corner of [-1, 1]) {
          for (const side of [-1, 1]) {
            pushGeometry(
              stoneParts,
              new BoxGeometry(wide * 0.2, stage, wide * 0.2),
              landmarkX + corner * wide * 0.48,
              base + stage / 2,
              landmarkZ + side * wide * 0.48,
            );
          }
        }
        pushGeometry(windowParts, new BoxGeometry(wide * 0.2, stage * 0.34, 0.08), landmarkX, base + stage * 0.58, landmarkZ + wide / 2 + 0.03);
      }
      // Open belfry over the top course, then the spire.
      const belfry = shaft * 0.8;
      for (const corner of [-1, 1]) {
        for (const side of [-1, 1]) {
          pushGeometry(
            stoneParts,
            new BoxGeometry(belfry * 0.26, belfry * 0.95, belfry * 0.26),
            landmarkX + corner * belfry * 0.37,
            height + 1.4,
            landmarkZ + side * belfry * 0.37,
          );
        }
      }
      pushGeometry(stoneParts, new BoxGeometry(belfry * 1.2, 0.18, belfry * 1.2), landmarkX, height + 1.96, landmarkZ);
      pushGeometry(roofParts, new ConeGeometry(belfry * 0.92, belfry * 1.15, 4), landmarkX, height + 2.5, landmarkZ);
      extraLampLocals.push({ x: landmarkX, y: height + 1.5, z: landmarkZ });
      break;
    }
    case "sheerlegs": {
      // Two raking legs and a back stay meeting over the quay edge, with the
      // purchase hanging from the head. A tripod silhouette, not a box frame.
      const height = 4.2 + supply * 1.6;
      const foot = quayWidth * 0.34;
      for (const side of [-1, 1]) {
        const leg = new BoxGeometry(0.17, height, 0.17);
        leg.rotateX(-side * 0.24);
        leg.translate(landmarkX, height / 2 + 0.62, landmarkZ + side * foot);
        deckParts.push(leg);
      }
      const stay = new BoxGeometry(0.15, height * 1.06, 0.15);
      stay.rotateZ(0.42);
      stay.translate(landmarkX - height * 0.22, height / 2 + 0.62, landmarkZ);
      deckParts.push(stay);
      pushGeometry(deckParts, new BoxGeometry(0.05, 1.5, 0.05), landmarkX, height - 0.1, landmarkZ);
      pushGeometry(deckParts, new BoxGeometry(0.3, 0.26, 0.3), landmarkX, height - 0.95, landmarkZ);
      break;
    }
    default:
      break;
  }

  // ---- Works on the hard --------------------------------------------------
  pushHarborWorks(works, { deckParts, quayLength, quayWidth, quayX, stoneParts });

  // ---- The capital's gateway ----------------------------------------------
  if (grand) {
    // A monumental stone gate straddling the pier root, with the chain's colour
    // hanging from the lintel. Ethereum is the only harbour a ship enters
    // through a building.
    const gateX = -length * 0.02;
    const gateHeight = 3.4;
    for (const side of [-1, 1]) {
      const at = side * width * 1.02;
      // Plinth, battered shaft, cornice: the piers carry a section rather than
      // standing as two grey posts.
      pushGeometry(stoneParts, new BoxGeometry(1.02, 0.34, 1.02), gateX, 0.41, at);
      pushGeometry(stoneParts, new BoxGeometry(0.7, gateHeight, 0.86), gateX, gateHeight / 2 + 0.58, at);
      pushGeometry(stoneParts, new BoxGeometry(0.82, 0.16, 0.98), gateX, gateHeight * 0.42 + 0.58, at);
      pushGeometry(stoneParts, new BoxGeometry(0.94, 0.24, 1.1), gateX, gateHeight + 0.66, at);
    }
    pushGeometry(stoneParts, new BoxGeometry(0.86, 0.5, width * 2.72), gateX, gateHeight + 1.03, 0);
    pushGeometry(stoneParts, new BoxGeometry(1.05, 0.2, width * 2.92), gateX, gateHeight + 1.38, 0);
    pushGeometry(roofParts, new BoxGeometry(0.06, 1.15, width * 1.7), gateX, gateHeight + 0.2, 0);
  }

  // ---- Sea defences -------------------------------------------------------
  // H2/H3: a curving stone arm sweeping out from the quay to shelter the basin
  // changes the harbour's whole outline, and it is the single most recognisable
  // thing a real harbour has. `open` harbours get none at all, which is itself
  // a distinction — a roadstead reads differently from a sheltered basin.
  const { maxAbsZ, tips: armTips } = pushEnclosureArms(enclosure, length, width, supply, moleParts);
  for (const tip of armTips) {
    // A light at each arm head: the thing that marks a harbour entrance.
    pushGeometry(moleParts, new CylinderGeometry(0.1, 0.16, 1.15, 6), tip.x, 0.28, tip.z);
    if (grand) {
      // Entrance towers, not just lamp posts: the capital's harbour mouth.
      pushGeometry(moleParts, new CylinderGeometry(0.36, 0.56, 2.6, 8), tip.x, 1.3, tip.z);
      pushGeometry(moleParts, new CylinderGeometry(0.5, 0.5, 0.2, 8), tip.x, 2.66, tip.z);
      extraLampLocals.push({ x: tip.x, y: 2.95, z: tip.z });
    } else {
      extraLampLocals.push({ x: tip.x, y: 0.92, z: tip.z });
    }
  }

  // ---- Signature prop -----------------------------------------------------
  // Built before the merge, because everything but the translucent net rack
  // rides in the harbour's own timber.
  const signatureAccent = createSignatureAccent(signature, length, width, deckParts);

  // ---- Merged structure ---------------------------------------------------
  const deck = new Mesh(mergeBucket(deckParts), timber);
  deck.name = "dock-deck";
  deck.castShadow = true;
  deck.receiveShadow = true;
  const quayStone = new Mesh(mergeBucket(stoneParts), stone);
  quayStone.name = "dock-quay-wall";
  quayStone.castShadow = true;
  quayStone.receiveShadow = true;
  const warehouses = new Mesh(mergeBucket(wallParts), new MeshStandardMaterial({
    color: "#9f8c68",
    flatShading: true,
    roughness: 0.96,
  }));
  warehouses.name = "dock-warehouses";
  warehouses.castShadow = true;
  warehouses.receiveShadow = true;
  root.add(deck, quayStone, warehouses);
  if (moleParts.length > 0) {
    const mole = new Mesh(mergeBucket(moleParts), stone);
    mole.name = "dock-breakwater";
    mole.castShadow = true;
    mole.receiveShadow = true;
    root.add(mole);
  }

  const signalShape = new Shape();
  signalShape.moveTo(0, 0);
  signalShape.lineTo(0.9, -0.27);
  signalShape.lineTo(0, -0.57);
  signalShape.closePath();
  const signal = new ShapeGeometry(signalShape);
  signal.translate(length * 0.52, 2.2, -width * 0.34);
  roofParts.push(signal);
  const roofs = new Mesh(mergeBucket(roofParts), accentMaterial);
  roofs.name = "dock-warehouse-roofs";
  roofs.castShadow = true;
  root.add(roofs);

  // ---- Deck planking ------------------------------------------------------
  // Planks run ACROSS the pier (athwart), which is how a real deck is laid and
  // what gives the pier a direction the eye can follow to its head.
  const plankCount = Math.max(10, Math.round(length * 2.6));
  const planks = new InstancedMesh(
    new BoxGeometry(0.1, 0.06, width * 0.94),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 0.95 }),
    plankCount,
  );
  planks.name = "dock-plank-relief";
  for (let index = 0; index < plankCount; index += 1) {
    const t = index / (plankCount - 1);
    const x = -length * 0.28 + t * length * 0.94;
    const lift = 0.235 + (stableUnit(`dock-plank.${dock.chainId}.${index}`) - 0.5) * 0.016;
    scratchMatrix.makeTranslation(x, lift, 0);
    planks.setMatrixAt(index, scratchMatrix);
  }
  planks.instanceMatrix.needsUpdate = true;
  fineDetail.add(planks);

  const pylonSpecs: { x: number; z: number }[] = [];
  for (const x of [-length * 0.2, length * 0.05, length * 0.3, headX]) {
    for (const z of [-width * 0.55, width * 0.55]) pylonSpecs.push({ x, z });
  }
  const pylons = new InstancedMesh(
    new CylinderGeometry(0.16, 0.2, 2.25, 6),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.timber_dark, roughness: 1 }),
    pylonSpecs.length,
  );
  pylons.name = "dock-pylons";
  pylonSpecs.forEach((spec, index) => {
    scratchMatrix.makeTranslation(spec.x, -0.85, spec.z);
    pylons.setMatrixAt(index, scratchMatrix);
  });
  pylons.instanceMatrix.needsUpdate = true;
  fineDetail.add(pylons);

  // ---- Bollards and mooring ropes ----------------------------------------
  // Berth count follows the chain's supply band, so a big harbour visibly
  // moors more. Each bollard trails a catenary line to the berth line beside
  // the pier — the ropes tie to the harbour, not to individual hulls, because
  // hull transforms live in the batched fleet this module never sees.
  const berths = Math.max(3, Math.round(3 + supply * 7));
  const bollardSpecs: { x: number; z: number }[] = [];
  for (let index = 0; index < berths; index += 1) {
    const t = (index + 0.5) / berths;
    const x = -length * 0.24 + t * length * 0.88;
    bollardSpecs.push({ x, z: (index % 2 === 0 ? -1 : 1) * width * 0.52 });
  }
  if (grand) {
    // The inner mole is a working face too, so it gets its own berth line.
    for (let index = 0; index < berths; index += 1) {
      const t = (index + 0.5) / berths;
      bollardSpecs.push({ x: -length * 0.02 + t * length * 0.64, z: -width * 1.8 - width * 0.44 });
    }
  }
  const bollards = new InstancedMesh(
    new CylinderGeometry(0.1, 0.14, 0.44, 6),
    metal,
    bollardSpecs.length,
  );
  bollards.name = "dock-bollards";
  bollardSpecs.forEach((spec, index) => {
    scratchMatrix.makeTranslation(spec.x, 0.42, spec.z);
    bollards.setMatrixAt(index, scratchMatrix);
  });
  bollards.instanceMatrix.needsUpdate = true;
  fineDetail.add(bollards);

  const ropeParts: BufferGeometry[] = [];
  for (const spec of bollardSpecs) {
    ropeParts.push(...mooringRopeGeometry(spec.x, spec.z, Math.sign(spec.z)));
  }
  const ropes = new Mesh(
    mergeGeometries(ropeParts, false)!,
    new MeshStandardMaterial({ color: "#3d3327", roughness: 1 }),
  );
  ropes.name = "dock-mooring-ropes";
  fineDetail.add(ropes);

  // ---- Cargo --------------------------------------------------------------
  const crateCount = Math.max(2, Math.round(2 + supply * 8))
    + (signature === "crate-tower" ? 4 : 0);
  const crates = new InstancedMesh(
    new BoxGeometry(0.44, 0.4, 0.44),
    new MeshStandardMaterial({ color: "#8d623a", flatShading: true, roughness: 1 }),
    crateCount,
  );
  crates.name = "dock-crates";
  for (let index = 0; index < crateCount; index += 1) {
    const tier = Math.floor(index / 4);
    const column = index % 4;
    scratchMatrix.makeTranslation(
      quayX + quayLength * 0.16 + column * 0.5,
      0.7 + tier * 0.42,
      quayWidth * 0.3 + (stableUnit(`dock-crate.${dock.chainId}.${index}`) - 0.5) * 0.3,
    );
    crates.setMatrixAt(index, scratchMatrix);
  }
  crates.instanceMatrix.needsUpdate = true;
  fineDetail.add(crates);

  const barrelCount = Math.max(3, Math.round(supply * 9));
  const barrels = new InstancedMesh(
    new CylinderGeometry(0.16, 0.16, 0.36, 8),
    new MeshStandardMaterial({ color: "#6f5233", flatShading: true, roughness: 1 }),
    barrelCount,
  );
  barrels.name = "dock-barrels";
  for (let index = 0; index < barrelCount; index += 1) {
    scratchMatrix.makeTranslation(
      quayX - quayLength * 0.28 + (index % 5) * 0.36,
      0.68,
      -quayWidth * 0.3 - Math.floor(index / 5) * 0.36,
    );
    barrels.setMatrixAt(index, scratchMatrix);
  }
  barrels.instanceMatrix.needsUpdate = true;
  fineDetail.add(barrels);

  // ---- Posts, lamps, flagstaff -------------------------------------------
  const lampCount = amountScale > 1.05 ? 3 : 2;
  const lampLocals: { x: number; z: number; height: number }[] = [];
  for (let index = 0; index < lampCount; index += 1) {
    const x = length * (0.16 + (index / Math.max(1, lampCount - 1)) * 0.44);
    const z = index % 2 === 0 ? 0 : width * 0.34 * (index % 4 === 1 ? 1 : -1);
    lampLocals.push({ height: 1.62, x, z });
  }
  // Quay lanterns light the stonework too. Only the pier lamps are registered
  // as sea lanes (see gardenDockLampWorldPositions): the lane registry caps at
  // 48 across the whole world and ten harbours would swamp it.
  const quayLampLocals: { x: number; z: number; height: number }[] = [];
  for (let index = 0; index < warehouseCount + 1; index += 1) {
    const bay = quayLength / (warehouseCount + 1);
    quayLampLocals.push({
      height: 1.35,
      x: quayX - quayLength / 2 + bay * (index + 0.5),
      z: quayWidth * 0.42,
    });
  }
  const flagstaffHeight = (5.2 + supply * 2.2) * (grand ? 1.3 : 1);
  const postSpecs: { x: number; z: number; height: number; radius: number }[] = [
    { height: 2.25, radius: 0.08, x: length * 0.52, z: -width * 0.35 }, // signal mast
    { height: flagstaffHeight, radius: 0.075, x: headX, z: width * 0.1 }, // flagstaff
    // Truck at the staff head — a squat cylinder in the shared post instance
    // rather than a mesh of its own.
    { height: 0.16, radius: 0.11, x: headX, z: width * 0.1 },
    ...lampLocals.map((lamp) => ({ ...lamp, radius: 0.09 })),
    ...quayLampLocals.map((lamp) => ({ ...lamp, radius: 0.075 })),
    ...signaturePostSpecs(signature, length, width),
  ];
  const posts = new InstancedMesh(
    new CylinderGeometry(1, 1.2, 1, 6),
    new MeshStandardMaterial({ color: "#5c4d3c", metalness: 0.24, roughness: 0.78 }),
    postSpecs.length,
  );
  posts.name = "dock-posts";
  postSpecs.forEach((spec, index) => {
    scratchMatrix.makeScale(spec.radius, spec.height, spec.radius);
    scratchMatrix.setPosition(spec.x, spec.height / 2 + 0.24, spec.z);
    posts.setMatrixAt(index, scratchMatrix);
  });
  posts.instanceMatrix.needsUpdate = true;
  root.add(posts);

  const lampMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_glow,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: 1.5,
    roughness: 0.25,
    toneMapped: false,
  });
  const allLamps = [
    ...lampLocals.map((lamp) => ({ x: lamp.x, y: lamp.height + 0.3, z: lamp.z })),
    ...quayLampLocals.map((lamp) => ({ x: lamp.x, y: lamp.height + 0.3, z: lamp.z })),
    ...extraLampLocals,
  ];
  const lamps = new InstancedMesh(new SphereGeometry(0.21, 6, 4), lampMaterial, allLamps.length);
  lamps.name = "dock-lamp-heads";
  allLamps.forEach((lamp, index) => {
    scratchMatrix.makeTranslation(lamp.x, lamp.y, lamp.z);
    lamps.setMatrixAt(index, scratchMatrix);
  });
  lamps.instanceMatrix.needsUpdate = true;
  root.add(lamps);

  if (windowParts.length > 0) {
    const windows = new Mesh(
      mergeBucket(windowParts),
      new MeshStandardMaterial({
        color: HARBOR_PALETTE.lantern_glow,
        emissive: HARBOR_PALETTE.lantern_warm,
        emissiveIntensity: 1.6,
        roughness: 0.5,
        toneMapped: false,
      }),
    );
    windows.name = "dock-warehouse-windows";
    root.add(windows);
  }

  // ---- The chain flag -----------------------------------------------------
  const flag = createChainFlag(dock, accent, {
    height: flagstaffHeight,
    scale: 0.72 + supply * 0.4,
    x: headX,
    yaw: CAMERA_FACING_YAW - root.rotation.y,
    z: width * 0.1,
  });
  root.add(flag);

  // ---- Cranes and signature props ----------------------------------------
  // The capital works cargo as well as ceremony, so it gets a gantry on top of
  // its campanile — no other harbour carries both.
  if ((landmark === "gantry" || grand) && size >= 4) {
    root.add(createHarborCrane(headX, width, supply, timber, metal));
  }
  if (signatureAccent) root.add(signatureAccent);

  const lampWorldPositions = lampLocals.map((lamp) =>
    localToWorldXZ(root, lamp.x, lamp.z),
  );

  // Lateral span of the built harbour: the widest of the quay, the outermost
  // deck of this plan, the inner mole, and the sea arms' bulge. Reported so the
  // ring-clearance question ("does this harbour foul the next chain's?") is
  // answerable from the visual rather than by eye.
  const span = 2 * Math.max(
    quayWidth / 2,
    maxAbsZ,
    PLAN_HALF_SPAN[plan] * width,
    grand ? width * 2.23 : 0,
  );
  applyGardenHeightFog(root);

  return {
    cargoTideLanes: cargoTideLanes(length, quayLength, quayWidth, quayX),
    tideFace: {
      width: quayLength,
      x: quayX,
      // Still water, in the harbour root's own space.
      y: WATER_LEVEL - GARDEN_DOCK_ROOT_Y,
      // Just proud of the quay's seaward face so the band is not z-fighting the
      // stonework it is painted on.
      z: quayWidth / 2 + 0.03,
    },
    dock,
    fineDetail,
    footprint: { length, span },
    identity,
    lampWorldPositions,
    plan,
    root,
    signature,
  };
}

/**
 * World-space positions of a dock's lamp heads. The orchestrator registers
 * these with the sea-lane registry so each pier lamp lays a warm reflection.
 *
 * Deliberately only the 2-3 pier lamps, not the quay lanterns: the registry
 * caps at 48 lanes for the whole world, and ten harbours' worth of quay
 * lighting would evict the beacon and the island path.
 */
export function gardenDockLampWorldPositions(dock: DockVisual): { x: number; z: number }[] {
  return dock.lampWorldPositions;
}

/** Pier deck top and quay coping top, above the harbour root. */
const PIER_DECK_TOP_Y = 0.21;
const QUAY_TOP_Y = 0.62;

/**
 * Lays out both cargo-tide lanes for one harbour.
 *
 * Slots are spread across a fraction of each surface rather than stepped by a
 * fixed pitch, so a short mole and a long grand quay both hold a full run
 * without any crate walking off its own deck.
 */
function cargoTideLanes(
  length: number,
  quayLength: number,
  quayWidth: number,
  quayX: number,
): CargoTideLanes {
  const aboard: CargoTideSlot[] = [];
  const ashore: CargoTideSlot[] = [];
  for (let index = 0; index < CARGO_TIDE_SLOTS; index += 1) {
    const t = index / (CARGO_TIDE_SLOTS - 1);
    // Local +X is out to sea, so the aboard run advances seaward along the pier
    // centreline and the ashore run retreats landward along the quay edge. The
    // two therefore point in opposite directions as well as sitting apart.
    aboard.push({ x: -length * 0.2 + t * length * 0.72, y: PIER_DECK_TOP_Y, z: 0 });
    ashore.push({ x: quayX + quayLength * (0.4 - t * 0.8), y: QUAY_TOP_Y, z: quayWidth * 0.46 });
  }
  return { aboard, ashore };
}

/**
 * H3: the supply-to-scale curve. Anchored on the decade range stablecoin
 * supply actually spans (~3e8 to ~5e11 USD) rather than on log10/11, which
 * compressed every real chain into a 1.6x band. Strictly increasing in
 * `totalUsd`, so the size ordering the viewer reads is the data's ordering.
 */
function harborAmountScale(totalUsd: number): number {
  const decades = (Math.log10(Math.max(1, totalUsd)) - 8.5) / 3.2;
  return 0.62 + MathUtils.clamp(decades, 0, 1) * 0.92;
}

/**
 * A gantry crane over the pier head: two raking legs, a jib, a counterweight,
 * and a hook block on its fall. Merged to one draw; the whole thing is static.
 */
function createHarborCrane(
  headX: number,
  width: number,
  supply: number,
  timberMaterial: MeshStandardMaterial,
  metalMaterial: MeshStandardMaterial,
): Group {
  const group = new Group();
  group.name = "dock-crane";
  const height = 2.9 + supply * 1.4;
  const frame: BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const leg = new BoxGeometry(0.14, height, 0.14);
    leg.rotateZ(side * 0.13);
    leg.translate(headX - side * 0.28, height / 2 + 0.24, side * width * 0.3);
    frame.push(leg);
  }
  // Cross brace and the head beam the jib pivots on.
  pushGeometry(frame, new BoxGeometry(0.11, 0.11, width * 0.66), headX, height * 0.52, 0);
  pushGeometry(frame, new BoxGeometry(0.16, 0.16, width * 0.72), headX, height + 0.24, 0);
  const jib = new BoxGeometry(2.3 + supply * 0.9, 0.14, 0.14);
  jib.rotateZ(-0.3);
  jib.translate(headX + 0.95, height + 0.5, 0);
  frame.push(jib);
  const crane = new Mesh(mergeGeometries(frame, false)!, timberMaterial);
  crane.castShadow = true;
  group.add(crane);

  const fittings: BufferGeometry[] = [];
  // Counterweight aft of the mast, hook block on its fall forward of it.
  pushGeometry(fittings, new BoxGeometry(0.34, 0.3, 0.34), headX - 0.62, height + 0.02, 0);
  pushGeometry(fittings, new BoxGeometry(0.03, 1.05, 0.03), headX + 1.85, height + 0.1, 0);
  pushGeometry(fittings, new BoxGeometry(0.22, 0.2, 0.22), headX + 1.85, height - 0.46, 0);
  const hook = new Mesh(mergeGeometries(fittings, false)!, metalMaterial);
  hook.castShadow = true;
  group.add(hook);
  return group;
}

/**
 * The pier-head flag. The cloth is a waved plane whose UVs are remapped onto
 * the chain's cell in the shared flag atlas, so ten harbours fly ten different
 * logos through one texture and one material.
 */
function createChainFlag(
  dock: DockNode,
  accent: Color,
  placement: { height: number; scale: number; x: number; yaw: number; z: number },
): Group {
  const group = new Group();
  group.name = "dock-chain-flag";
  const cell = assignGardenChainFlagCell(dock, accent);
  const texture = gardenChainFlagAtlas().texture;

  const flagWidth = 1.5 * placement.scale;
  const flagHeight = 1.0 * placement.scale;
  const geometry = new PlaneGeometry(flagWidth, flagHeight, 8, 3);
  // Cloth: a standing wave that deepens toward the fly, plus a slight droop,
  // so the flag reads as fabric at overview zoom rather than as a decal.
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const along = (x + flagWidth / 2) / flagWidth;
    position.setZ(index, Math.sin(along * Math.PI * 1.7) * 0.13 * placement.scale * along);
    position.setY(index, position.getY(index) - along * along * 0.1 * placement.scale);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();

  if (cell >= 0 && texture) {
    const uv = geometry.getAttribute("uv");
    const { offsetX, offsetY, scale } = gardenChainFlagCellUv(cell);
    for (let index = 0; index < uv.count; index += 1) {
      uv.setXY(index, offsetX + uv.getX(index) * scale, offsetY + uv.getY(index) * scale);
    }
    uv.needsUpdate = true;
  }

  const material = new MeshStandardMaterial({
    color: cell >= 0 && texture ? "#ffffff" : accent,
    map: cell >= 0 ? texture : null,
    roughness: 0.82,
    side: DoubleSide,
  });
  const cloth = new Mesh(geometry, material);
  // Hoist edge against the staff, cloth flying to +X of it.
  cloth.position.set(flagWidth / 2 + 0.06, 0, 0);
  cloth.castShadow = true;

  const pivot = new Group();
  pivot.add(cloth);
  pivot.position.set(placement.x, placement.height - flagHeight * 0.75, placement.z);
  pivot.rotation.y = placement.yaw;
  group.add(pivot);

  return group;
}

/** One sea arm, walked as a circular arc so it bows out and curls back in. */
interface ArmSpec {
  /** Blocks at supply 0.5; the run scales with the chain's band. */
  blocks: number;
  /** Initial heading in radians; 0 is straight out to sea. */
  heading: number;
  side: 1 | -1;
  /** Total turn over the arm's run; negative curls back toward the centreline. */
  sweep: number;
  /** Where the arm leaves the shore, as a fraction of pier length. */
  startX: number;
  /** Standoff from the centreline at the root, in pier widths. */
  startZ: number;
}

/**
 * Per-enclosure sea defences. Arms start well clear of the shore and reach
 * seaward, where the harbour ring diverges and there is room for them — an arm
 * that swept out level with the quay would foul the next chain's harbour.
 */
const ENCLOSURE_ARMS: Record<HarborEnclosure, readonly ArmSpec[]> = {
  // An open roadstead: no sea defence at all.
  open: [],
  // A single straight-ish arm giving a lee to one side.
  arm: [{ blocks: 4, heading: 0.26, side: 1, startX: 0.24, startZ: 1.5, sweep: -0.45 }],
  // A long arm hooking right round the basin — the classic fishing harbour.
  hook: [{ blocks: 6, heading: 0.52, side: 1, startX: 0.2, startZ: 1.28, sweep: -1.6 }],
  // Two arms converging on a narrow entrance.
  pincer: [
    { blocks: 4, heading: 0.55, side: 1, startX: 0.28, startZ: 1.4, sweep: -1.25 },
    { blocks: 4, heading: 0.55, side: -1, startX: 0.28, startZ: 1.4, sweep: -1.25 },
  ],
  // The capital: two moles enclosing a full basin, met by entrance towers.
  grand: [
    { blocks: 6, heading: 0.4, side: 1, startX: 0.14, startZ: 1.26, sweep: -1.42 },
    { blocks: 6, heading: 0.4, side: -1, startX: 0.14, startZ: 1.26, sweep: -1.42 },
  ],
};

/**
 * Walks each arm block by block along its arc, pushing cut stone and tumbled
 * armour into the mole bucket. Returns the arm tips so the caller can put an
 * entrance light (or, for the capital, an entrance tower) on each.
 */
function pushEnclosureArms(
  enclosure: HarborEnclosure,
  length: number,
  width: number,
  supply: number,
  parts: BufferGeometry[],
): { maxAbsZ: number; tips: { x: number; z: number }[] } {
  const tips: { x: number; z: number }[] = [];
  let maxAbsZ = 0;
  for (const spec of ENCLOSURE_ARMS[enclosure]) {
    const count = Math.max(4, Math.round(spec.blocks * (0.72 + supply * 0.56)));
    let x = length * spec.startX;
    let z = spec.side * width * spec.startZ;
    for (let index = 0; index < count; index += 1) {
      const t = index / Math.max(1, count - 1);
      const heading = spec.heading + spec.sweep * t;
      // Blocks shrink and settle as the arm reaches into deeper water. Courses
      // are laid along the heading and the step is derived from the course
      // itself, so the arm is a continuous wall rather than a dotted line.
      const block = width * 0.66 * (1.2 - t * 0.26);
      const course = block * 1.5;
      const rise = 1.16 - t * 0.42;
      const yaw = -spec.side * heading;
      // The mole is a wall with a section, not a paving strip: a wide founding
      // course at the waterline, a narrower body above it, and a parapet along
      // the seaward flank. At overview zoom the parapet's shadow is what makes
      // it read as masonry mass rather than a ribbon on the water.
      const footing = new BoxGeometry(course, rise * 0.42, block * 1.24);
      footing.rotateY(yaw);
      footing.translate(x, -0.32, z);
      parts.push(footing);
      const body = new BoxGeometry(course, rise, block);
      body.rotateY(yaw);
      body.translate(x, rise / 2 - 0.42, z);
      parts.push(body);
      const parapet = new BoxGeometry(course * 0.98, rise * 0.5, block * 0.34);
      parapet.rotateY(yaw);
      // Outward flank normal: the arm advances along (cos h, sin h) in the
      // side-mirrored frame, so the seaward side of it is (-sin h, cos h).
      const flankX = -Math.sin(heading);
      const flankZ = spec.side * Math.cos(heading);
      parapet.translate(x + flankX * block * 0.33, rise * 0.72 - 0.42, z + flankZ * block * 0.33);
      parts.push(parapet);
      // Armour blocks tumbled along the exposed flank.
      pushGeometry(
        parts,
        new BoxGeometry(block * 0.6, rise * 0.5, block * 0.6),
        x + flankX * block * 0.84,
        -0.5,
        z + flankZ * block * 0.84,
      );
      maxAbsZ = Math.max(maxAbsZ, Math.abs(z) + block * 1.14);
      const step = course * 0.8;
      x += Math.cos(heading) * step;
      z += spec.side * Math.sin(heading) * step;
    }
    tips.push({ x, z });
  }
  return { maxAbsZ, tips };
}

/** How many warehouse bays each roofline wants, relative to the supply band. */
const ROOFLINE_BAY_BIAS: Record<HarborRoofline, number> = {
  gable: 0,
  // Few, large blocks under broad hipped roofs.
  hipped: -1,
  // Many narrow north-light sheds — an industrial saw edge.
  sawtooth: 1,
  // Long low vaults: fewer bays so each barrel runs longer than it is wide.
  vault: -1,
};
/** How much of its bay each roofline's shed fills. */
const ROOFLINE_BAY_FILL: Record<HarborRoofline, number> = {
  gable: 0.82,
  hipped: 0.9,
  sawtooth: 0.88,
  vault: 0.92,
};
/** Wall height multiplier, so the roofline changes the block's proportion too. */
const ROOFLINE_HEIGHT: Record<HarborRoofline, number> = {
  gable: 1,
  hipped: 1.25,
  sawtooth: 0.86,
  vault: 0.8,
};

/** Pushes one warehouse roof of the given shape into the accent bucket. */
function pushRoof(
  parts: BufferGeometry[],
  roofline: HarborRoofline,
  x: number,
  w: number,
  d: number,
  eaves: number,
  pitch: number,
): void {
  switch (roofline) {
    case "gable": {
      for (const side of [-1, 1]) {
        const slope = new BoxGeometry(w + 0.16, 0.12, d * 0.56);
        slope.rotateX(side * pitch);
        slope.translate(x, eaves + Math.sin(pitch) * d * 0.15, side * d * 0.24);
        parts.push(slope);
      }
      pushGeometry(parts, new BoxGeometry(w + 0.24, 0.1, 0.14), x, eaves + Math.sin(pitch) * d * 0.3, 0);
      break;
    }
    case "hipped": {
      // One pyramid: a four-sided hip covering the whole block. A cone with
      // four radial segments, turned 45 degrees so its base square lines up
      // with the walls, is a cleaner hip than four leaning slabs.
      const hip = new ConeGeometry(1, 1, 4);
      hip.rotateY(Math.PI / 4);
      hip.scale(w * 0.78, Math.min(w, d) * pitch * 1.1, d * 0.78);
      parts.push(hip);
      hip.translate(x, eaves + Math.min(w, d) * pitch * 0.55, 0);
      break;
    }
    case "sawtooth": {
      // Three teeth stepping along the shed: sloping roof panel, vertical
      // glazed riser, repeat.
      const teeth = 3;
      const bay = w / teeth;
      const rake = 0.55;
      for (let index = 0; index < teeth; index += 1) {
        const panel = new BoxGeometry(bay / Math.cos(rake), 0.09, d);
        panel.rotateZ(rake);
        panel.translate(x - w / 2 + bay * (index + 0.5), eaves + 0.2, 0);
        parts.push(panel);
        pushGeometry(parts, new BoxGeometry(0.09, bay * Math.tan(rake), d), x - w / 2 + bay * (index + 1), eaves + 0.2, 0);
      }
      break;
    }
    case "vault": {
      // A barrel vault running the length of the shed: the only curved
      // roofline in the world, and unmistakable in profile.
      const vault = new CylinderGeometry(d * 0.36, d * 0.36, w, 10, 1, false, 0, Math.PI);
      vault.rotateZ(Math.PI / 2);
      vault.translate(x, eaves, 0);
      parts.push(vault);
      break;
    }
  }
}

/**
 * The industry on the hard beside the quay. Each of these is a real dockyard
 * feature with a shape of its own, merged into the stone and timber buckets so
 * none of them costs a draw call.
 */
function pushHarborWorks(
  works: HarborWorks,
  ctx: {
    deckParts: BufferGeometry[];
    quayLength: number;
    quayWidth: number;
    quayX: number;
    stoneParts: BufferGeometry[];
  },
): void {
  const { deckParts, quayLength, quayWidth, quayX, stoneParts } = ctx;
  // Tucked against the quay's landward flank: the ring is tight here, and a
  // dockyard that sprawled would run into the next chain's harbour.
  const hardZ = -quayWidth * 0.78;
  switch (works) {
    case "drydock": {
      // A graving dock: stone altars around a pit, a caisson gate at the
      // seaward end, and a hull sitting on the blocks inside it.
      const dockLength = Math.min(quayLength * 0.8, 4.2);
      pushGeometry(stoneParts, new BoxGeometry(dockLength + 0.7, 0.3, 2.4), quayX, -0.2, hardZ);
      for (const side of [-1, 1]) {
        pushGeometry(stoneParts, new BoxGeometry(dockLength, 0.9, 0.36), quayX, 0.1, hardZ + side * 0.98);
      }
      pushGeometry(stoneParts, new BoxGeometry(0.36, 0.9, 2.3), quayX - dockLength / 2, 0.1, hardZ);
      pushGeometry(stoneParts, new BoxGeometry(0.4, 1.05, 2.3), quayX + dockLength / 2, 0.18, hardZ);
      pushGeometry(deckParts, new BoxGeometry(dockLength * 0.72, 0.2, 0.3), quayX, -0.02, hardZ);
      for (let rib = 0; rib < 5; rib += 1) {
        const at = quayX - dockLength * 0.28 + rib * dockLength * 0.14;
        for (const side of [-1, 1]) {
          const frame = new BoxGeometry(0.14, 1.0, 0.14);
          frame.rotateX(side * 0.36);
          frame.translate(at, 0.4, hardZ + side * 0.22);
          deckParts.push(frame);
        }
      }
      break;
    }
    case "slipway": {
      // Inclined ways running off the quay into the water, with a hull on the
      // stocks: the harbour that builds its own ships.
      const slipZ = hardZ - 0.9;
      for (const side of [-1, 1]) {
        const way = new BoxGeometry(0.26, 0.16, 3.4);
        way.rotateX(-0.16);
        way.translate(quayX + side * 0.75, 0.16, slipZ);
        deckParts.push(way);
      }
      const keel = new BoxGeometry(0.34, 0.22, 2.4);
      keel.rotateX(-0.16);
      keel.translate(quayX, 0.62, slipZ + 0.5);
      deckParts.push(keel);
      for (let rib = 0; rib < 6; rib += 1) {
        const along = -1.0 + rib * 0.4;
        for (const side of [-1, 1]) {
          const frame = new BoxGeometry(0.12, 1.05, 0.12);
          frame.rotateZ(side * 0.34);
          frame.rotateX(-0.16);
          frame.translate(quayX + side * 0.22, 0.95 + along * 0.16, slipZ + 0.5 + along);
          deckParts.push(frame);
        }
      }
      break;
    }
    case "careen": {
      // A careening hard: a hull hove down on its side against shear posts,
      // bottom bared for breaming. Reads instantly as a beached ship.
      const hull = new SphereGeometry(0.62, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      hull.scale(0.85, 0.75, 2.0);
      hull.rotateZ(Math.PI * 0.62);
      hull.translate(quayX + 0.4, 0.5, hardZ - 0.3);
      deckParts.push(hull);
      for (const side of [-1, 1]) {
        const shear = new BoxGeometry(0.16, 3.0, 0.16);
        shear.rotateZ(0.3);
        shear.translate(quayX + 0.4, 1.6, hardZ - 0.3 + side * 0.95);
        deckParts.push(shear);
      }
      pushGeometry(stoneParts, new BoxGeometry(2.2, 0.28, 2.6), quayX + 0.4, -0.22, hardZ - 0.3);
      break;
    }
    default:
      break;
  }
}

/**
 * A mooring line: a catenary of short segments from a bollard out to the berth
 * line beside the pier, where a hull would take it up.
 */
function mooringRopeGeometry(x: number, z: number, side: number): BufferGeometry[] {
  const segments = 5;
  const reach = 1.5;
  const parts: BufferGeometry[] = [];
  const from = new Vector3(x, 0.6, z);
  const to = new Vector3(x + 0.35, WATER_LEVEL - GARDEN_DOCK_ROOT_Y + 0.28, z + side * reach);
  for (let index = 0; index < segments; index += 1) {
    const t0 = index / segments;
    const t1 = (index + 1) / segments;
    const a = catenaryPoint(from, to, t0);
    const b = catenaryPoint(from, to, t1);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const span = b.clone().sub(a);
    const segment = new BoxGeometry(0.035, 0.035, span.length());
    segment.rotateX(Math.atan2(-span.y, Math.hypot(span.x, span.z)));
    segment.rotateY(Math.atan2(span.x, span.z));
    segment.translate(mid.x, mid.y, mid.z);
    parts.push(segment);
  }
  return parts;
}

function catenaryPoint(from: Vector3, to: Vector3, t: number): Vector3 {
  const point = from.clone().lerp(to, t);
  point.y -= Math.sin(t * Math.PI) * 0.22;
  return point;
}

/**
 * Merges one per-material bucket into a single geometry.
 *
 * `mergeGeometries` refuses a mix of indexed and non-indexed inputs, and the
 * deck bucket mixes both (extruded pier decks are non-indexed, everything the
 * dockyard pushes in beside them is indexed). Drop to non-indexed only when the
 * bucket is actually mixed, so the buckets that are uniform keep their shared
 * vertices.
 */
function mergeBucket(parts: BufferGeometry[]): BufferGeometry {
  const indexed = parts.filter((part) => part.index !== null).length;
  const normalized = indexed === 0 || indexed === parts.length
    ? parts
    : parts.map((part) => (part.index === null ? part : part.toNonIndexed()));
  return mergeGeometries(normalized, false)!;
}

/** Applies a translation to a geometry and pushes it into a merge bucket. */
function pushGeometry(
  parts: BufferGeometry[],
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
): void {
  geometry.translate(x, y, z);
  parts.push(geometry);
}

// I2 mirror-basin extents (C2(b)): the calm mask spans the water between the
// composed harbor docks. The centre is their midpoint; the radii derive from
// the actual spread (half-spread + a berth margin) clamped so a single dock
// still gets a readable basin and a far-flung pair never stills the open sea.
const HARBOR_CALM_MARGIN_X = 5.5;
const HARBOR_CALM_MARGIN_Z = 4.5;
const HARBOR_CALM_MIN_RADIUS_X = 9;
const HARBOR_CALM_MIN_RADIUS_Z = 7;
const HARBOR_CALM_MAX_RADIUS_X = 18;
const HARBOR_CALM_MAX_RADIUS_Z = 13;
const HARBOR_CALM_STRENGTH = 0.75;

/**
 * Computes the harbor mirror-basin calm mask from the composed dock visuals.
 * Returns null when no harbor dock is composed (the water then keeps Lane W's
 * island-side default). The integrator feeds this to
 * `water.setHarborCalmMask(...)` in `registerHarborWater`.
 */
export function gardenHarborCalmMask(
  docks: readonly Pick<DockVisual, "root">[],
): GardenHarborCalmMask | null {
  if (docks.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let centerX = 0;
  let centerZ = 0;
  for (const dock of docks) {
    const { x, z } = dock.root.position;
    centerX += x;
    centerZ += z;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return {
    center: { x: centerX / docks.length, z: centerZ / docks.length },
    radiusX: MathUtils.clamp((maxX - minX) / 2 + HARBOR_CALM_MARGIN_X, HARBOR_CALM_MIN_RADIUS_X, HARBOR_CALM_MAX_RADIUS_X),
    radiusZ: MathUtils.clamp((maxZ - minZ) / 2 + HARBOR_CALM_MARGIN_Z, HARBOR_CALM_MIN_RADIUS_Z, HARBOR_CALM_MAX_RADIUS_Z),
    calmStrength: HARBOR_CALM_STRENGTH,
  };
}

function signaturePostSpecs(
  signature: SignatureKind,
  length: number,
  width: number,
): { x: number; z: number; height: number; radius: number }[] {
  const head = length * 0.66;
  switch (signature) {
    case "derrick":
      return [
        { height: 2.7, radius: 0.1, x: head, z: -width * 0.32 },
        { height: 2.7, radius: 0.1, x: head, z: width * 0.32 },
      ];
    case "net-racks":
      return [
        { height: 1.5, radius: 0.08, x: head, z: -width * 0.4 },
        { height: 1.5, radius: 0.08, x: head, z: width * 0.4 },
      ];
    default:
      return [];
  }
}

/**
 * The one-off signature prop. Everything that can share the harbour's timber
 * goes into the deck bucket for free; only the translucent net rack needs a
 * material — and so a draw — of its own.
 */
function createSignatureAccent(
  signature: SignatureKind,
  length: number,
  width: number,
  deckParts: BufferGeometry[],
): Mesh | null {
  const head = length * 0.66;
  switch (signature) {
    case "derrick":
      pushGeometry(deckParts, new BoxGeometry(0.16, 0.16, width * 0.72), head, 2.66, 0);
      return null;
    case "dinghy": {
      const hull = new SphereGeometry(0.55, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
      hull.scale(0.7, 0.6, 1.5);
      hull.rotateX(Math.PI);
      hull.rotateZ(0.12);
      hull.translate(length * 0.3, 0.32, width * 0.85);
      deckParts.push(hull);
      return null;
    }
    case "net-racks": {
      const net = new Mesh(
        new BoxGeometry(0.06, 1.1, width * 0.78),
        new MeshStandardMaterial({
          color: HARBOR_PALETTE.sail_teal,
          flatShading: true,
          opacity: 0.55,
          roughness: 1,
          transparent: true,
        }),
      );
      net.position.set(head, 1.05, 0);
      return net;
    }
    default:
      return null;
  }
}

/**
 * H3: the harbour's built identity. Named chains are authored in
 * `CHAIN_HARBOR_IDENTITIES`; anything else gets a coherent harbour hashed off
 * its chain id, so an unlisted chain is still a place rather than a default.
 */
export function harborIdentity(dock: DockNode): HarborIdentity {
  return CHAIN_HARBOR_IDENTITIES[dock.chainId] ?? fallbackIdentity(dock.chainId);
}

function fallbackIdentity(chainId: string): HarborIdentity {
  return {
    enclosure: pick(HARBOR_ENCLOSURES, `dock-enclosure.${chainId}`),
    landmark: pick(HARBOR_LANDMARKS, `dock-landmark.${chainId}`),
    plan: pick(HARBOR_PLANS, `dock-plan.${chainId}`),
    roofline: pick(HARBOR_ROOFLINES, `dock-roofline.${chainId}`),
    signature: pick(SIGNATURE_KINDS, `dock-signature.${chainId}`),
    works: pick(HARBOR_WORKS, `dock-works.${chainId}`),
  };
}

function pick<T>(options: readonly T[], key: string): T {
  const index = Math.floor(stableUnit(key) * options.length);
  return options[Math.min(index, options.length - 1)]!;
}

/** Deterministic per-harbor plan; Ethereum keeps the grand T-head. */
export function harborPlan(dock: DockNode): HarborPlan {
  return harborIdentity(dock).plan;
}

/**
 * Blends the dock's health-band accent with a stable per-chain hue shift so
 * neighbouring harbors of the same health still read as different districts.
 */
function dockAccentColor(dock: DockNode): Color {
  const color = new Color(dockHealthAccent(dock.healthBand));
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  const shift = (stableUnit(`dock-hue.${dock.chainId}`) - 0.5) * 0.1;
  color.setHSL(
    (hsl.h + shift + 1) % 1,
    MathUtils.clamp(hsl.s * (0.75 + stableUnit(`dock-sat.${dock.chainId}`) * 0.5), 0.2, 0.85),
    // Lightness carries most of the per-chain identity so neighbouring docks of
    // the same health band still read as distinct districts at the overview.
    MathUtils.clamp(hsl.l * (0.78 + stableUnit(`dock-light.${dock.chainId}`) * 0.42), 0.28, 0.72),
  );
  return color;
}

function dockHealthAccent(healthBand: DockNode["healthBand"]): string {
  if (healthBand === "robust" || healthBand === "healthy") return "#78b689";
  if (healthBand === "mixed") return "#dfb95a";
  if (healthBand === "fragile") return "#d98b54";
  return "#c9675c";
}

/**
 * R12: the piles a pier stands on — paired down each side, following the deck
 * run, reaching from under the deck to below the waterline so the structure is
 * visibly supported rather than floating.
 *
 * One InstancedMesh for the whole pier: piles are the most repeated element in
 * a harbour and must not cost a draw call each.
 */
function createPierPilings(
  length: number,
  width: number,
  plan: HarborPlan,
  grand: boolean,
): InstancedMesh<CylinderGeometry, MeshStandardMaterial> {
  const specs: { x: number; z: number }[] = [];
  const bays = Math.max(3, Math.round(length / 1.15));
  for (let bay = 0; bay <= bays; bay += 1) {
    const t = bay / bays;
    const x = -length * 0.28 + t * length * 0.96;
    specs.push({ x, z: -width * 0.34 });
    specs.push({ x, z: width * 0.34 });
  }
  if (plan === "double-finger") {
    const offset = width * 1.85;
    const fingerBays = Math.max(2, Math.round((length * 0.78) / 1.25));
    for (let bay = 0; bay <= fingerBays; bay += 1) {
      const x = -length * 0.22 + (bay / fingerBays) * length * 0.74;
      specs.push({ x, z: offset - width * 0.3 });
      specs.push({ x, z: offset + width * 0.3 });
    }
  }
  if (grand) {
    const innerBays = Math.max(2, Math.round((length * 0.64) / 1.25));
    for (let bay = 0; bay <= innerBays; bay += 1) {
      const x = -length * 0.02 + (bay / innerBays) * length * 0.64;
      specs.push({ x, z: -width * 1.8 - width * 0.32 });
      specs.push({ x, z: -width * 1.8 + width * 0.32 });
    }
  }

  // Long enough to pass through the waterline and disappear into the shadow
  // under the deck; the exact depth is never seen, only the fact of it.
  const pileHeight = 2.6;
  const piles = new InstancedMesh(
    new CylinderGeometry(0.075, 0.095, pileHeight, 6),
    new MeshStandardMaterial({
      color: new Color(HARBOR_PALETTE.timber_dark).lerp(new Color(HARBOR_PALETTE.iron_dark), 0.45),
      flatShading: true,
      roughness: 0.95,
    }),
    specs.length,
  );
  piles.name = "dock-pilings";
  piles.castShadow = true;
  const matrix = new Matrix4();
  specs.forEach((spec, index) => {
    matrix.makeTranslation(spec.x, -pileHeight / 2 - 0.1, spec.z);
    piles.setMatrixAt(index, matrix);
  });
  piles.instanceMatrix.needsUpdate = true;
  return piles;
}

/** Rounded-end pier deck: one extruded rounded rectangle, one draw. */
function createPierDeckGeometry(
  length: number,
  width: number,
  thickness: number,
): ExtrudeGeometry {
  const radius = Math.min(width * 0.4, length * 0.18, 0.6);
  const shape = roundedRectShape(length, width, radius);
  const geometry = new ExtrudeGeometry(shape, {
    bevelEnabled: false,
    curveSegments: 1,
    depth: thickness,
  });
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, -thickness / 2, 0);
  return geometry;
}

function roundedRectShape(w: number, h: number, r: number): Shape {
  const shape = new Shape();
  const x = -w / 2;
  const y = -h / 2;
  shape.moveTo(x + r, y);
  shape.lineTo(x + w - r, y);
  shape.quadraticCurveTo(x + w, y, x + w, y + r);
  shape.lineTo(x + w, y + h - r);
  shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  shape.lineTo(x + r, y + h);
  shape.quadraticCurveTo(x, y + h, x, y + h - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  return shape;
}

function localToWorldXZ(root: Group, localX: number, localZ: number): { x: number; z: number } {
  const cos = Math.cos(root.rotation.y);
  const sin = Math.sin(root.rotation.y);
  return {
    x: root.position.x + localX * cos + localZ * sin,
    z: root.position.z - localX * sin + localZ * cos,
  };
}
