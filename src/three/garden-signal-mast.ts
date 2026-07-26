import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import { SIGNAL_MAST_MAX_PENNANTS } from "../systems/world-types";
import { stableUnit } from "./garden-util";

/**
 * 3a — the observatory's storm-signal mast.
 *
 * Every peg reading in the world before this was per-coin: a ship's berth, a
 * hull's weathering, the water it rides in. `pegSummary.summary` is the only
 * payload that speaks for the whole fleet at once, and it drove nothing. This
 * mast is where it lands, so "read the market's broad condition at a glance"
 * has one anchor to land on instead of asking the visitor to survey 200 hulls.
 *
 * It is a real practice, not a metaphor invented here: coastal signal
 * stations hoisted shapes and pennants on a mast, and mariners read the hoist
 * from the water. The register that buys is the point — a hoist REPORTS. It
 * does not flash, pulse, or turn red, and neither does this.
 *
 * Tone rules this module enforces:
 *  - the cloth is lantern-warm and the cone is iron-dark; no vermillion, no
 *    `bloodmoon_red`, nothing from the danger end of the palette;
 *  - motion is a slow lift of the cloth, ~0.07 rad, on a ~10s period — the
 *    amount of movement a still afternoon puts into a flag;
 *  - the hoist tops out at `SIGNAL_MAST_MAX_PENNANTS`, so a bad day reads as
 *    a full hoist rather than a forest.
 *
 * Everything is built once at the composed maximum and toggled by visibility.
 * A data refresh changes what is flying, never what exists, so no frame ever
 * allocates geometry and the draw-call count is flat.
 */

/** Overall mast height in world units — a fifth of the 34-unit tower beside it. */
const MAST_HEIGHT = 7.2;
/** Yard (crosstree) height; the hoist and the cone hang from its two arms. */
const YARD_Y = 5.5;
const YARD_HALF_SPAN = 1.2;

/**
 * Cloth size. The silhouette law says a feature under ~0.7 units of clearance
 * does not read at overview zoom, so the pennant is sized past that in both
 * axes and spaced past it again — five of these are a countable ladder, not a
 * smear.
 */
const PENNANT_WIDTH = 1.15;
const PENNANT_HEIGHT = 0.62;
const PENNANT_SPACING = 1.02;
/** Topmost pennant sits just under the yard. */
const PENNANT_TOP_Y = 5.15;

const STORM_CONE_RADIUS = 0.42;
const STORM_CONE_HEIGHT = 0.95;

export interface GardenSignalMastState {
  /** Pennants to fly; clamped to the hoist. */
  pennantCount: number;
  stormCone: boolean;
}

export interface GardenSignalMastUpdate {
  reducedMotion: boolean;
  timeSeconds: number;
  /** Tier gate — the mast is shed with the rest of the fine detail. */
  visible: boolean;
}

export interface GardenSignalMast {
  readonly root: Group;
  dispose(): void;
  setState(state: GardenSignalMastState): void;
  update(input: GardenSignalMastUpdate): void;
}

interface PennantHoist {
  pivot: Group;
  /** Deterministic per-pennant phase, so the hoist lifts raggedly like cloth
      rather than in lockstep like a machine. */
  phase: number;
}

export function createGardenSignalMast(): GardenSignalMast {
  const root = new Group();
  root.name = "signal-mast-root";

  const timber = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_dark,
    flatShading: true,
    roughness: 0.94,
  });
  const stone = new MeshStandardMaterial({
    color: HARBOR_PALETTE.stone_mid,
    flatShading: true,
    roughness: 1,
  });
  // Lantern-warm cloth: the same warm the harbour's own lights use, so the
  // hoist belongs to the observatory rather than being pasted onto it.
  const cloth = new MeshStandardMaterial({
    color: HARBOR_PALETTE.lantern_warm,
    roughness: 0.86,
    side: DoubleSide,
  });
  // The cone is a SHAPE signal, and shapes read by outline. Iron-dark keeps it
  // legible against both the day sky and the terrace stone without spending a
  // warning colour on it.
  const coneMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.iron_dark,
    flatShading: true,
    roughness: 0.9,
  });

  const plinth = new Mesh(new CylinderGeometry(0.44, 0.54, 0.34, 8), stone);
  plinth.name = "signal-mast-plinth";
  plinth.position.y = 0.17;
  plinth.castShadow = true;
  root.add(plinth);

  const pole = new Mesh(new CylinderGeometry(0.075, 0.125, MAST_HEIGHT, 8), timber);
  pole.name = "signal-mast-pole";
  pole.position.y = MAST_HEIGHT / 2;
  pole.castShadow = true;
  root.add(pole);

  const yard = new Mesh(new BoxGeometry(YARD_HALF_SPAN * 2, 0.1, 0.1), timber);
  yard.name = "signal-mast-yard";
  yard.position.y = YARD_Y;
  yard.castShadow = true;
  root.add(yard);

  // One geometry and one material for all five pennants: the hoist is five
  // copies of the same signal flag, so five instances of the same cloth is
  // what it should cost.
  const pennantGeometry = createPennantClothGeometry();
  const pennants: PennantHoist[] = [];
  for (let index = 0; index < SIGNAL_MAST_MAX_PENNANTS; index += 1) {
    const mesh = new Mesh(pennantGeometry, cloth);
    mesh.castShadow = true;
    // Hoist edge at the halyard, cloth flying outboard to +X.
    mesh.position.x = PENNANT_WIDTH / 2 + 0.04;

    const pivot = new Group();
    pivot.name = `signal-mast-pennant-${index}`;
    pivot.add(mesh);
    pivot.position.set(YARD_HALF_SPAN, PENNANT_TOP_Y - index * PENNANT_SPACING, 0);
    pivot.visible = false;
    root.add(pivot);
    pennants.push({ pivot, phase: stableUnit(`signal-mast-pennant.${index}`) });
  }

  const stormCone = new Mesh(
    new ConeGeometry(STORM_CONE_RADIUS, STORM_CONE_HEIGHT, 10),
    coneMaterial,
  );
  stormCone.name = "signal-mast-storm-cone";
  // Point down: the gale cone of the storm-signal code, and the reading the
  // silhouette gives away at a glance.
  stormCone.rotation.x = Math.PI;
  stormCone.position.set(-YARD_HALF_SPAN, YARD_Y - 0.15 - STORM_CONE_HEIGHT / 2, 0);
  stormCone.castShadow = true;
  stormCone.visible = false;
  root.add(stormCone);

  return {
    root,
    dispose() {
      pennantGeometry.dispose();
      plinth.geometry.dispose();
      pole.geometry.dispose();
      yard.geometry.dispose();
      stormCone.geometry.dispose();
      timber.dispose();
      stone.dispose();
      cloth.dispose();
      coneMaterial.dispose();
    },
    setState(state) {
      const flying = Math.max(0, Math.min(SIGNAL_MAST_MAX_PENNANTS, Math.trunc(state.pennantCount)));
      for (const [index, pennant] of pennants.entries()) {
        pennant.pivot.visible = index < flying;
      }
      stormCone.visible = state.stormCone;
    },
    update({ reducedMotion, timeSeconds, visible }) {
      root.visible = visible;
      // Reduced motion reads the clock as zero rather than skipping the write.
      // The pose is then the same one the animated hoist passes through at
      // t=0 — a deterministic still frame, not a second authored arrangement
      // that could drift from the moving one.
      const clock = reducedMotion ? 0 : timeSeconds;
      for (const pennant of pennants) {
        if (!pennant.pivot.visible) continue;
        const phase = clock * 0.6 + pennant.phase * Math.PI * 2;
        pennant.pivot.rotation.y = Math.sin(phase) * 0.07;
        pennant.pivot.rotation.z = Math.sin(phase * 0.7) * 0.04;
      }
    },
  };
}

/**
 * The cloth: a plane that tapers toward the fly and carries one standing wave,
 * the same discipline `garden-docks.ts` uses for the pier-head chain flag. It
 * is authored here rather than shared because a signal pennant carries no
 * device — there is no atlas cell to remap, so the atlas machinery
 * (`garden-chain-flag.ts`) has nothing to contribute and its texture upload
 * would be paid for nothing.
 */
function createPennantClothGeometry(): PlaneGeometry {
  const geometry = new PlaneGeometry(PENNANT_WIDTH, PENNANT_HEIGHT, 6, 2);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const along = (x + PENNANT_WIDTH / 2) / PENNANT_WIDTH;
    // Taper to a blunt point so the silhouette reads as a pennant and not as
    // a rectangle, which at this size would be mistaken for a mast signal.
    position.setY(index, position.getY(index) * (1 - along * 0.62));
    position.setZ(index, Math.sin(along * Math.PI * 1.7) * 0.1 * along);
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}
