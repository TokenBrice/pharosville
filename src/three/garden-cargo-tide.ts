import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import type { DockCargoTide } from "../systems/world-types";
import { CARGO_TIDE_SLOTS, type CargoTideSlot, type DockVisual } from "./garden-docks";
import { stableUnit } from "./garden-util";

/**
 * The mint/burn cargo tide, at the quays.
 *
 * PharosVille shows stocks everywhere and flow nowhere: how much supply exists,
 * which chain holds it, how far off par it trades. Whether that supply is being
 * CREATED or DESTROYED — the dynamic the whole asset class turns on — had no
 * expression in the world at all. This is it: cargo working through the harbour.
 *
 * ## Reading it
 *
 * Direction is POSITION, not colour or count, because position is the one
 * channel that cannot be confused with the cues already in the harbour:
 *
 * - Net MINTING puts cargo out along the PIER DECK, heading seaward toward the
 *   ships. Supply is being made and loaded out.
 * - Net BURNING puts cargo back along the QUAY EDGE, landed and standing on the
 *   stone. Supply has come ashore and is not going out again.
 *
 * The two runs point in opposite directions along opposite surfaces, so a
 * minting harbour and a burning one cannot be mistaken for each other even at a
 * glance, and neither can be mistaken for the third state — an empty harbour,
 * which means either nothing moved or nothing was measured.
 *
 * Run LENGTH carries magnitude: how lopsided the harbour's gross flow was, up to
 * `CARGO_TIDE_SLOTS` crates.
 *
 * ## Not the other crates
 *
 * `garden-docks.ts` already speaks crate: stacked cargo on the quay means the
 * chain's BACKING is narrowing (`cue.dock.congestion`). Those crates are a
 * different sentence in the same vocabulary and stay distinguishable four ways —
 * they STACK in tiers where these stand in a single course; they sit inboard on
 * the quay apron where these take the quay's outer edge or the pier itself; they
 * are plain brown boxes where these carry a lashed pale canvas lid; and they
 * ride the dock's own `fineDetail` group, which is only shown at inspect zoom or
 * on hover, where the tide is visible at default framing.
 *
 * ## Cost
 *
 * ONE InstancedMesh over one merged, vertex-coloured geometry, for every crate
 * at every harbour: one draw call for the whole world's tide, at most
 * `CARGO_TIDE_SLOTS` per harbour. Nothing is built when no harbour has a tide.
 *
 * ## Motion
 *
 * There is none, at any setting. Cargo standing on a quay is a state, not an
 * event, and a crate that slid along the deck would be inventing a rate the
 * payload does not report. The reduced-motion presentation is therefore
 * identical to the full one, which is the strongest form the requirement can
 * take: nothing to freeze, nothing to diverge.
 */

/** Crate proportions. Big enough that a run of them reads at default framing. */
const CRATE_WIDTH = 0.62;
const CRATE_HEIGHT = 0.46;
const LID_HEIGHT = 0.1;

// Bare timber for the case, bleached canvas for the lashed lid. Deliberately
// nothing from the warning end of the palette: cargo working through a harbour
// is the ordinary business of the place in both directions, and a burning
// harbour is not a harbour in trouble.
const CASE = new Color(HARBOR_PALETTE.timber_mid);
const CANVAS = new Color(HARBOR_PALETTE.foam_white);

export interface CargoTideSpec {
  /** Dock detail id — the run's identity, and its deterministic jitter seed. */
  detailId: string;
  /** Content-root-space berths for this harbour's occupied slots. */
  slots: { x: number; y: number; z: number }[];
  /** Harbour yaw, so every crate in a run stands square to its own quay. */
  yaw: number;
}

export interface GardenCargoTide {
  readonly root: Group;
  /** Total crates standing across every harbour. */
  readonly count: number;
  dispose(): void;
}

/**
 * How many crates a harbour's tide stands.
 *
 * Scaled on the SIGNED pressure score — the share of the harbour's gross 24h
 * flow that ended up as net issuance — rather than on the dollar figure, so a
 * small chain whose issuance ran one way all day reads as strongly as a large
 * one, which is the thing worth seeing. A tracked harbour that genuinely moved
 * supply always stands at least one crate, so "small" and "none" stay apart.
 */
export function cargoTideCrateCount(tide: DockCargoTide | undefined): number {
  if (!tide?.tracked) return 0;
  if (tide.direction !== "minting" && tide.direction !== "burning") return 0;
  const pressure = Math.abs(tide.pressureScore ?? 0) / 100;
  return Math.max(1, Math.min(CARGO_TIDE_SLOTS, Math.round(pressure * CARGO_TIDE_SLOTS)));
}

/**
 * Turns composed harbours into the world-space runs their tides occupy.
 *
 * Local slot coordinates are rotated by the harbour's own yaw and offset by its
 * root, because the tide is ONE instanced mesh for the whole world — it has no
 * per-harbour parent to inherit that transform from.
 */
export function cargoTideSpecs(docks: readonly DockVisual[]): CargoTideSpec[] {
  const specs: CargoTideSpec[] = [];
  for (const visual of docks) {
    const tide = visual.dock.cargoTide;
    const count = cargoTideCrateCount(tide);
    if (count === 0) continue;
    const lane: CargoTideSlot[] = tide?.direction === "minting"
      ? visual.cargoTideLanes.aboard
      : visual.cargoTideLanes.ashore;
    const yaw = visual.root.rotation.y;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    specs.push({
      detailId: visual.dock.detailId,
      slots: lane.slice(0, count).map((slot) => ({
        x: visual.root.position.x + slot.x * cos + slot.z * sin,
        y: visual.root.position.y + slot.y,
        z: visual.root.position.z - slot.x * sin + slot.z * cos,
      })),
      yaw,
    });
  }
  return specs;
}

/**
 * The crate, as one geometry: a timber case under a lashed canvas lid.
 *
 * The lid is baked as vertex colour rather than a second material, because a
 * second material is a second draw call and the whole point of this module is
 * that the world's tide costs one.
 */
function createCrateGeometry(): BufferGeometry {
  const paint = (geometry: BufferGeometry, color: Color): BufferGeometry => {
    const count = geometry.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) {
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    return geometry;
  };

  const parts: BufferGeometry[] = [];
  const body = new BoxGeometry(CRATE_WIDTH, CRATE_HEIGHT, CRATE_WIDTH);
  body.translate(0, CRATE_HEIGHT / 2, 0);
  parts.push(paint(body, CASE));
  // The lid overhangs the case slightly, so the pale line reads as a cover
  // lashed over the crate rather than as its top face catching the light.
  const lid = new BoxGeometry(CRATE_WIDTH * 1.08, LID_HEIGHT, CRATE_WIDTH * 1.08);
  lid.translate(0, CRATE_HEIGHT + LID_HEIGHT / 2, 0);
  parts.push(paint(lid, CANVAS));

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("cargo tide crate geometry failed to merge");
  return merged;
}

export function createGardenCargoTide(specs: readonly CargoTideSpec[]): GardenCargoTide {
  const root = new Group();
  // Named for `OVERVIEW_LOD_DETAIL_NAMES`: a 0.6-unit crate is under the
  // silhouette law's ~0.7-unit clearance, so the run cannot read at whole-map
  // framing and should not be paying a draw call there. The group is built even
  // when empty so the name always resolves in the composed world.
  root.name = "dock-cargo-tide";
  const total = specs.reduce((sum, spec) => sum + spec.slots.length, 0);
  if (total === 0) return { root, count: 0, dispose() {} };

  const geometry = createCrateGeometry();
  const material = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.94,
    vertexColors: true,
  });
  const mesh = new InstancedMesh(geometry, material, total);
  mesh.name = "dock-cargo-tide-crates";
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new Object3D();
  let index = 0;
  for (const spec of specs) {
    for (const [slotIndex, slot] of spec.slots.entries()) {
      dummy.position.set(slot.x, slot.y, slot.z);
      // A hashed quarter-turn of yaw and a hair of scale: cargo landed by hand
      // is never laid out on a grid. Seeded from the berth's identity, so a data
      // refresh restands every crate exactly as it was.
      const wobble = stableUnit(`cargo-tide.${spec.detailId}.${slotIndex}`);
      dummy.rotation.set(0, spec.yaw + (wobble - 0.5) * 0.5, 0);
      dummy.scale.setScalar(0.92 + wobble * 0.16);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      index += 1;
    }
  }
  mesh.instanceMatrix.needsUpdate = true;
  // Instances are scattered around the whole harbour ring, so the
  // geometry-derived bounding sphere would cull them all at once.
  mesh.frustumCulled = false;
  root.add(mesh);

  return {
    root,
    count: total,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
