import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
} from "three";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  blendDayCycleColor,
  DAY_CYCLE_SKY_PRESETS,
  type DayCyclePhase,
  type DayCyclePhaseName,
} from "./garden-day-cycle";
import { stableUnit } from "./garden-util";

/**
 * Z4 — Shakkei horizon (borrowed scenery).
 *
 * Three distant hazy island silhouettes stand at the far sea edge so the
 * water reads as extending to a borrowed horizon instead of ending at a fog
 * wall. They are flat pre-fogged ridgeline cards facing the fixed isometric
 * camera (azimuth 45°, elevation ~30°), colored a shade between the C1 sky
 * preset's horizon and zenith bands so they read as aerial-perspective
 * landmasses in every time-of-day state. No hex literals: all colors derive
 * from `DAY_CYCLE_SKY_PRESETS` (contract C1).
 *
 * Placement is tuned for the default ortho framing (camera
 * ~{offsetX 646, offsetY 98, zoom 0.78} at 1440×960): the cards sit on open
 * plane water just beyond the map's north/west edges, clear of every zone
 * ring from the approved Z1 layout. Like the sky dome, the group re-anchors
 * to the camera target each frame, so the composition is parallax-free
 * under pan; at explore zoom the cards simply leave the frustum.
 *
 * Cheap by construction: two merged fan geometries (near/far aerial bands) =
 * 2 draw calls, MeshBasicMaterial with scene fog on, no animation (static
 * under reduced motion by definition). Purely decorative: hit-testing in
 * this app is DOM/projection-driven (`src/renderer/hit-testing.ts`), and the
 * horizon registers no targets, so it can never intercept hover/selection.
 */

export interface GardenHorizonFrame {
  /** Camera target in world XZ (the sky re-anchors the same way). */
  targetX: number;
  targetZ: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface GardenHorizon {
  /** C4 evidence: merged draw-call count (one per aerial band). */
  drawCallCount: number;
  root: Group;
  silhouetteCount: number;
  triangleCount: number;
  dispose: () => void;
  update: (phase: DayCyclePhase, frame: GardenHorizonFrame) => void;
}

interface SilhouetteSpec {
  /** Aerial band: "near" cards sit a shade darker than the "far" apex card. */
  band: "near" | "far";
  height: number;
  /** Local offset from the camera target (world units, world axes). */
  offsetX: number;
  offsetZ: number;
  seed: string;
  width: number;
}

// Tuned against the default framing: screen (sx, sy) bases at ~(300,130),
// (660,100), (1030,140) — just inside the frame top, over open water beyond
// the map edges (verified clear of the approved Z1 zone ellipses).
const SILHOUETTES: readonly SilhouetteSpec[] = [
  { band: "near", height: 13, offsetX: -60.8, offsetZ: -15.1, seed: "shakkei.left", width: 26 },
  { band: "far", height: 5, offsetX: -44.6, offsetZ: -40.8, seed: "shakkei.apex", width: 44 },
  { band: "near", height: 8, offsetX: -20.1, offsetZ: -53.8, seed: "shakkei.right", width: 20 },
];

// How far each band's color travels from the sky horizon band toward the
// zenith. The frame top at the default framing is far water, not sky, so the
// silhouettes must sit clearly BELOW the horizon-haze value to read as land
// rather than clouds: day pushes almost fully to the indigo zenith (distant
// print mountains), night/dusk keep a smaller mix so they stay hazy dark
// shapes in the pale fog.
const BAND_ZENITH_MIX: Record<DayCyclePhaseName, Record<SilhouetteSpec["band"], number>> = {
  day: { far: 0.92, near: 1 },
  dusk: { far: 0.75, near: 0.9 },
  night: { far: 0.2, near: 0.35 },
};

const RIDGE_POINTS = 12;
const BASE_Y = GARDEN_WATER_Y;

function bandColor(phase: DayCyclePhaseName, band: SilhouetteSpec["band"]): Color {
  const preset = DAY_CYCLE_SKY_PRESETS[phase];
  return preset.horizon.clone().lerp(preset.zenith, BAND_ZENITH_MIX[phase][band]);
}

/**
 * Multi-peak ridgeline with sharp asymmetric crags and a per-point jitter, zero
 * at both ends so the silhouette rises out of the water. Deterministic via
 * `stableUnit` (no `Math.random`).
 */
function ridgeHeight(spec: SilhouetteSpec, t: number): number {
  const bump = (center: number, width: number) => (
    Math.max(0, 1 - ((t - center) / width) ** 2) ** 2.4
  );
  const peakA = 0.5 + stableUnit(`${spec.seed}.a`) * 0.5;
  const peakB = 0.35 + stableUnit(`${spec.seed}.b`) * 0.45;
  const centerA = 0.22 + stableUnit(`${spec.seed}.c1`) * 0.2;
  const centerB = 0.58 + stableUnit(`${spec.seed}.c2`) * 0.24;
  const envelope = Math.sin(Math.PI * t) ** 0.55;
  const jitter = (stableUnit(`${spec.seed}.j.${Math.round(t * 24)}`) - 0.5) * 0.16;
  const profile = peakA * bump(centerA, 0.22) + peakB * bump(centerB, 0.27) + jitter;
  return spec.height * envelope * Math.min(1.1, Math.max(0.04, profile));
}

/**
 * Merges one band's silhouettes into a single triangle-fan geometry, baked in
 * root-local coordinates and pre-rotated to face the 45°-azimuth camera
 * (local card X runs along the screen-horizontal diagonal (1, 0, -1) / √2).
 */
function buildBandGeometry(band: SilhouetteSpec["band"]): {
  geometry: BufferGeometry;
  triangles: number;
} {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const spec of SILHOUETTES) {
    if (spec.band !== band) continue;
    // Fan center below the waterline so the bottom edge is never visible.
    const fanCenter = positions.length / 3;
    positions.push(spec.offsetX, BASE_Y - 2, spec.offsetZ);
    for (let point = 0; point <= RIDGE_POINTS; point += 1) {
      const t = point / RIDGE_POINTS;
      const localX = (t - 0.5) * spec.width;
      positions.push(
        spec.offsetX + localX * Math.SQRT1_2,
        BASE_Y + ridgeHeight(spec, t),
        spec.offsetZ - localX * Math.SQRT1_2,
      );
    }
    for (let point = 0; point < RIDGE_POINTS; point += 1) {
      indices.push(fanCenter, fanCenter + 1 + point, fanCenter + 2 + point);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return { geometry, triangles: indices.length / 3 };
}

export function createGardenHorizon(): GardenHorizon {
  const root = new Group();
  root.name = "garden-horizon";

  // Pre-blend per-phase band colors once; update() re-derives the live blend
  // with the same law the sky dome uses (C1), so horizon haze, fog, and
  // silhouettes always agree.
  const bandPalettes = (["near", "far"] as const).map((band) => ({
    day: bandColor("day", band),
    dusk: bandColor("dusk", band),
    night: bandColor("night", band),
  }));

  const meshes = (["near", "far"] as const).map((band, index) => {
    const { geometry } = buildBandGeometry(band);
    const material = new MeshBasicMaterial({
      color: bandPalettes[index]!.night.clone(),
      fog: true,
      // The merged fan winding is not guaranteed camera-facing; the cards are
      // a handful of triangles, so double-siding costs nothing.
      side: DoubleSide,
    });
    const mesh = new Mesh(geometry, material);
    mesh.name = `garden-horizon-${band}`;
    root.add(mesh);
    return mesh;
  });

  const triangleCount = meshes.reduce(
    (sum, mesh) => sum + (mesh.geometry.getIndex()?.count ?? 0) / 3,
    0,
  );

  return {
    drawCallCount: meshes.length,
    root,
    silhouetteCount: SILHOUETTES.length,
    triangleCount,
    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.material.dispose();
      }
    },
    update(phase, frame) {
      root.position.set(frame.targetX, 0, frame.targetZ);
      // Tier ladder: the borrowed horizon is a balanced+ beauty layer;
      // recovery/constrained keep the plain fog-to-sea gradient.
      root.visible = frame.tier === "full" || frame.tier === "balanced";
      for (const [index, mesh] of meshes.entries()) {
        const palette = bandPalettes[index]!;
        blendDayCycleColor(
          mesh.material.color,
          palette.night,
          palette.dusk,
          palette.day,
          phase.dusk,
          phase.daylight,
        );
      }
    },
  };
}
