import { tileToScreen } from "../../systems/projection";
import { seaStateForWorld, seaStateTempoMultiplier, seaStateWindMultiplier } from "../../systems/sea-state";
import type { PharosVilleWorld } from "../../systems/world-types";
import type { DrawPharosVilleInput } from "../render-types";
import { lighthouseRenderState, type LighthouseRenderState } from "./lighthouse";
import { skyState } from "./sky";
import {
  maxActiveThreatLevel,
  threatForPoint,
  type ThreatLevel,
} from "./weather";

const VILLAGE_LIGHTS = [
  [16.7, 29.4, 0.52],
  [18.4, 27.9, 0.58],
  [19.8, 29, 0.48],
  [20.8, 30.8, 0.44],
  [24.6, 23.4, 0.42],
  [28.8, 22.3, 0.46],
  [30.1, 31.8, 0.54],
  [33.2, 30.1, 0.5],
  [35.4, 42.5, 0.48],
  [37.2, 29.5, 0.52],
  [41.1, 28.9, 0.5],
  [44.2, 33.7, 0.52],
] as const;

type BioluminescentSparkle = {
  easternShelf: boolean;
  isoX: number;
  isoY: number;
  phase: number;
  baseRadius: number;
};

const SPARKLE_POINT_DEFS = [
  [8.3, 28.4, 0],
  [9.7, 31.2, 0.72],
  [10.4, 33.8, 1.44],
  [11.1, 30.1, 2.16],
  [12.6, 35.4, 2.88],
  [13.2, 27.9, 3.6],
  [8.8, 24.6, 4.32],
  [11.9, 26.3, 5.04],
  [9.2, 29.7, 5.76],
  [13.8, 32.9, 0.38],
  [15.3, 36.8, 1.1],
  [17.2, 39.4, 1.82],
  [18.8, 41.7, 2.54],
  [20.4, 43.2, 3.26],
  [22.1, 44.8, 3.98],
  [24.3, 45.9, 4.7],
  [26.7, 46.5, 5.42],
  [28.9, 47.1, 0.19],
  [31.2, 47.4, 0.91],
  [33.5, 46.8, 1.63],
  [35.8, 45.6, 2.35],
  [37.4, 44.1, 3.07],
  [16.1, 38.2, 3.79],
  [19.6, 40.8, 4.51],
  [23.4, 43, 5.23],
  [29.7, 45.3, 0.57],
  [14.8, 35.1, 1.29],
  [21.8, 42.4, 2.01],
  [27.3, 46, 2.73],
  [32.4, 47.2, 3.45],
  [39.1, 34.2, 4.17],
  [40.8, 31.7, 4.89],
  [42.3, 29.4, 5.61],
  [44.1, 27.2, 0.45],
  [45.9, 25.1, 1.17],
  [47.6, 23.3, 1.89],
  [49.2, 26.8, 2.61],
  [50.7, 28.9, 3.33],
  [51.4, 31.5, 4.05],
  [52.1, 33.8, 4.77],
  [43.5, 32.6, 5.49],
  [46.4, 30.1, 0.83],
  [48.8, 24.7, 1.55],
  [38.3, 36.1, 2.27],
  [41.7, 22.4, 2.99],
  [4.2, 29.3, 3.71],
  [5.1, 31.8, 4.43],
  [6.4, 28.7, 5.15],
  [7.3, 30.9, 5.87],
  [5.8, 33.4, 0.63],
  [53.2, 29.7, 1.35],
  [54.1, 32.4, 2.07],
  [55.3, 35.1, 2.79],
  [54.8, 37.6, 3.51],
  [52.7, 36.2, 4.23],
] as const;

const EASTERN_SHELF_SPARKLE_SOURCE_ISO_X_THRESHOLD = 32 * 16;
const MOON_REFLECTION_GRADIENT_CACHE_LIMIT = 24;
const MOON_REFLECTION_NIGHT_BUCKETS = 256;
const moonReflectionGradientCacheByContext = new WeakMap<CanvasRenderingContext2D, Map<string, CanvasGradient>>();

const PYRE_WATER_PATHS = [
  [-92, 118, 260, 100, -0.2],
  [330, 122, 560, 170, 0.38],
] as const;
const PYRE_WATER_PATH_CORE_CUTOFF = 0.86;
const PYRE_WATER_PATH_EDGE_CUTOFF = 1.24;
const PYRE_WATER_PATH_OUTER_CUTOFF = 1.44;

function sparkleSourceIsoX(point: readonly [number, number, number]): number {
  return point[0] * 16;
}

function isEasternShelfSparkle(point: readonly [number, number, number]): boolean {
  return sparkleSourceIsoX(point) > EASTERN_SHELF_SPARKLE_SOURCE_ISO_X_THRESHOLD;
}

function buildSparklePoints(): readonly BioluminescentSparkle[] {
  const points: BioluminescentSparkle[] = [];
  let easternShelfIndex = 0;
  for (const p of SPARKLE_POINT_DEFS) {
    const easternShelf = isEasternShelfSparkle(p);
    if (easternShelf) {
      const keep = easternShelfIndex % 2 === 0;
      easternShelfIndex += 1;
      if (!keep) continue;
    }
    points.push({
      easternShelf,
      isoX: (p[0] - p[1]) * 16,
      isoY: (p[0] + p[1]) * 8,
      phase: p[2],
      baseRadius: 0.9 + Math.sin(p[2] * 2.1) * 0.4,
    });
  }
  return points;
}

const SPARKLE_POINTS = buildSparklePoints();

function pyreWaterPathSparkleScale(
  point: { x: number; y: number },
  firePoint: { x: number; y: number },
  zoom: number,
): number {
  const safeZoom = Math.max(0.001, zoom);
  let best = Number.POSITIVE_INFINITY;
  for (const path of PYRE_WATER_PATHS) {
    const centerX = firePoint.x + path[0] * safeZoom;
    const centerY = firePoint.y + path[1] * safeZoom;
    const dx = point.x - centerX;
    const dy = point.y - centerY;
    const cos = Math.cos(path[4]);
    const sin = Math.sin(path[4]);
    const localX = dx * cos + dy * sin;
    const localY = -dx * sin + dy * cos;
    const distance = Math.hypot(
      localX / (path[2] * safeZoom),
      localY / (path[3] * safeZoom),
    );
    if (distance < best) best = distance;
  }
  const normalized = best;
  if (normalized <= PYRE_WATER_PATH_CORE_CUTOFF) return 0.04;
  if (normalized <= PYRE_WATER_PATH_EDGE_CUTOFF) {
    return 0.08 + ((normalized - PYRE_WATER_PATH_CORE_CUTOFF)
      / (PYRE_WATER_PATH_EDGE_CUTOFF - PYRE_WATER_PATH_CORE_CUTOFF)) * 0.34;
  }
  if (normalized <= PYRE_WATER_PATH_OUTER_CUTOFF) {
    return 1 - ((PYRE_WATER_PATH_OUTER_CUTOFF - normalized)
      / (PYRE_WATER_PATH_OUTER_CUTOFF - PYRE_WATER_PATH_EDGE_CUTOFF)) * 0.12;
  }
  return 1;
}

export function bioluminescentSparkleWarmPathScaleForTest(
  point: { x: number; y: number },
  firePoint: { x: number; y: number },
  zoom: number,
  _phase: number,
): number {
  return pyreWaterPathSparkleScale(point, firePoint, zoom);
}

export function sparklePointDensityStatsForTest(): {
  authoredEastern: number;
  authoredTotal: number;
  renderedEastern: number;
  renderedTotal: number;
} {
  return {
    authoredEastern: SPARKLE_POINT_DEFS.filter(isEasternShelfSparkle).length,
    authoredTotal: SPARKLE_POINT_DEFS.length,
    renderedEastern: SPARKLE_POINTS.filter((point) => point.easternShelf).length,
    renderedTotal: SPARKLE_POINTS.length,
  };
}

export type BirdSpecies = "gull" | "pigeon";
export type BirdAnchor = "lighthouse" | "pigeonnier";

export interface BirdOrbitRoute {
  kind: "orbit";
  anchor: BirdAnchor;
  anchorX: number;
  anchorY: number;
  radiusX: number;
  radiusY: number;
  speed: number;
  /**
   * V2.5 — optional periodic fishing dive. Every `period` seconds the gull
   * swoops `depth` tiles toward the water over `duration` seconds and pulls
   * back up. Pure function of time, so reduced motion freezes whatever
   * static pose time-zero lands on.
   */
  dive?: { depth: number; duration: number; period: number };
}

export interface BirdShuttleRoute {
  kind: "shuttle";
  from: BirdAnchor;
  to: BirdAnchor;
  // Seconds for one full out-and-back cycle at threat 0.
  basePeriod: number;
  // Tiles of vertical lift at the arc midpoint.
  arcLift: number;
}

export interface BirdDispatchRoute {
  kind: "dispatch";
  origin: BirdAnchor;
  // Off-map destination tile; the pigeon disappears past the map edge.
  destination: { x: number; y: number };
  // Seconds for one outbound flight.
  flightDuration: number;
  // Seconds between successive launches at threat 0; threat scales this down.
  baseGapSeconds: number;
  arcLift: number;
}

export type BirdRoute = BirdOrbitRoute | BirdShuttleRoute | BirdDispatchRoute;

export interface BirdConfig {
  species: BirdSpecies;
  scale: number;
  phase: number;
  route: BirdRoute;
}

function orbitBird(
  species: BirdSpecies,
  scale: number,
  phase: number,
  anchor: BirdAnchor,
  anchorX: number,
  anchorY: number,
  radiusX: number,
  radiusY: number,
  speed: number,
  dive?: BirdOrbitRoute["dive"],
): BirdConfig {
  return {
    species,
    scale,
    phase,
    route: { kind: "orbit", anchor, anchorX, anchorY, radiusX, radiusY, speed, ...(dive ? { dive } : {}) },
  };
}

function shuttleBird(scale: number, basePeriod: number, arcLift: number): BirdConfig {
  return {
    species: "pigeon",
    scale,
    phase: 0,
    route: { kind: "shuttle", from: "pigeonnier", to: "lighthouse", basePeriod, arcLift },
  };
}

function dispatchBird(scale: number, flightDuration: number, baseGapSeconds: number, arcLift: number): BirdConfig {
  return {
    species: "pigeon",
    scale,
    phase: 0,
    route: {
      kind: "dispatch",
      origin: "pigeonnier",
      destination: { x: 65, y: 60 },
      flightDuration,
      baseGapSeconds,
      arcLift,
    },
  };
}

// Dispatch-cadence multiplier per threat level. CALM = baseline, DANGER ≈ 5×
// faster — a stronger ramp than the smoother `windMultiplier` so an active
// stress event reads as a flurry of carrier pigeons leaving the loft.
const DISPATCH_GAP_FACTOR: readonly number[] = [1.0, 0.66, 0.45, 0.30, 0.18];

export function dispatchGapForThreat(baseSeconds: number, threat: ThreatLevel): number {
  return baseSeconds * (DISPATCH_GAP_FACTOR[threat] ?? 1);
}

export const BIRDS: readonly BirdConfig[] = [
  // Lighthouse harbor gulls — the existing 9 ambient flocks.
  orbitBird("gull", 1.14, 0.1, "lighthouse", -4.2, -3.2, 3.8, 1.4, 0.24),
  orbitBird("gull", 0.98, 1.9, "lighthouse", -1.4, -5.2, 4.4, 1.7, 0.2),
  orbitBird("gull", 0.9, 3.4, "lighthouse", 2.8, -4.3, 3.2, 1.2, 0.23),
  // V2.5: the two wide-radius water gulls occasionally dive for fish.
  orbitBird("gull", 0.76, 0.6, "lighthouse", -18.5, -10.8, 8.5, 2.2, 0.13, { depth: 2.6, duration: 2.4, period: 19 }),
  orbitBird("gull", 0.68, 2.8, "lighthouse", -29.5, 4.4, 7.4, 1.8, 0.15),
  orbitBird("gull", 0.72, 4.2, "lighthouse", 10.5, -15.5, 8.8, 2.6, 0.12, { depth: 2.2, duration: 2.1, period: 27 }),
  orbitBird("gull", 0.62, 5.3, "lighthouse", 18.2, 2.2, 6.2, 1.6, 0.18),
  orbitBird("gull", 0.84, 2.2, "lighthouse", 7.2, -7.6, 5.2, 1.5, 0.19),
  orbitBird("gull", 0.82, 4.9, "lighthouse", -9.8, -8.2, 5.8, 1.7, 0.17),
  // Resident carrier pigeons orbiting the dovecote — tighter, faster radii.
  orbitBird("pigeon", 0.62, 0, "pigeonnier", -1, -1.8, 1.8, 0.7, 0.42),
  orbitBird("pigeon", 0.58, 1.7, "pigeonnier", 0.6, -1.4, 1.4, 0.55, 0.5),
  orbitBird("pigeon", 0.54, 3.6, "pigeonnier", -0.2, -2.4, 2.2, 0.85, 0.36),
  // Closed shuttle courier — back-and-forth between lighthouse and dovecote,
  // visually linking the two watch landmarks. Period scales with threat.
  shuttleBird(0.66, 36, 4),
  // Open-sea dispatch — periodic carrier pigeon launching SE off-map. Cadence
  // accelerates with active DEWS threat to mirror the bot's role: more alerts
  // when stablecoins wobble.
  dispatchBird(0.6, 6, 45, 3),
];

export interface BirdSample {
  tile: { x: number; y: number };
  bank: number;
  visible: boolean;
}

export function birdAnchorTile(anchor: BirdAnchor, world: PharosVilleWorld): { x: number; y: number } {
  return anchor === "lighthouse" ? world.lighthouse.tile : world.pigeonnier.tile;
}

export function sampleBird(
  bird: BirdConfig,
  time: number,
  world: PharosVilleWorld,
  windScale: number,
  threat: ThreatLevel,
): BirdSample {
  const { route } = bird;
  if (route.kind === "orbit") {
    const origin = birdAnchorTile(route.anchor, world);
    const angle = time * route.speed * windScale + bird.phase;
    // V2.5 fishing dive: a half-sine plunge toward the water inside the
    // periodic dive window, with the bank steepened so the swoop reads.
    let diveDrop = 0;
    let diveBank = 0;
    if (route.dive) {
      const cycle = ((time + bird.phase * 7) % route.dive.period + route.dive.period) % route.dive.period;
      if (cycle < route.dive.duration) {
        const progress = cycle / route.dive.duration;
        const plunge = Math.sin(progress * Math.PI);
        diveDrop = plunge * route.dive.depth;
        diveBank = plunge * 0.8;
      }
    }
    const bank = Math.cos(angle);
    return {
      tile: {
        x: origin.x + route.anchorX + Math.cos(angle) * route.radiusX,
        y: origin.y + route.anchorY + Math.sin(angle) * route.radiusY + diveDrop,
      },
      bank: bank + Math.sign(bank || 1) * diveBank,
      visible: true,
    };
  }
  if (route.kind === "shuttle") {
    const a = birdAnchorTile(route.from, world);
    const b = birdAnchorTile(route.to, world);
    const period = Math.max(1, route.basePeriod / Math.max(0.5, windScale));
    const cyclePhase = ((time / period) + bird.phase) % 1;
    const cycle = cyclePhase < 0 ? cyclePhase + 1 : cyclePhase;
    const outbound = cycle < 0.5;
    const t = outbound ? cycle * 2 : (1 - cycle) * 2;
    const tile = {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - Math.sin(t * Math.PI) * route.arcLift,
    };
    const dx = b.x - a.x;
    const bankSign = outbound ? Math.sign(dx) : -Math.sign(dx);
    return { tile, bank: bankSign === 0 ? 1 : bankSign, visible: true };
  }
  // dispatch
  const origin = birdAnchorTile(route.origin, world);
  const dest = route.destination;
  const gap = Math.max(2, dispatchGapForThreat(route.baseGapSeconds, threat));
  const cycleLength = gap + route.flightDuration;
  const cyclePosition = ((time + bird.phase * cycleLength) % cycleLength + cycleLength) % cycleLength;
  if (cyclePosition < gap) {
    return { tile: { x: origin.x, y: origin.y }, bank: 1, visible: false };
  }
  const t = (cyclePosition - gap) / route.flightDuration;
  const tile = {
    x: origin.x + (dest.x - origin.x) * t,
    y: origin.y + (dest.y - origin.y) * t - Math.sin(t * Math.PI) * route.arcLift,
  };
  const dx = dest.x - origin.x;
  return { tile, bank: dx >= 0 ? 1 : -1, visible: true };
}

const SEA_MIST_PATCHES = [
  [22.5, 16.2, 5.8, 1.8, 0.3, 0.018],
  [28.1, 18.5, 7.2, 2.1, 1.7, 0.014],
  [33.6, 15.8, 6.1, 1.9, 3.1, 0.021],
  [44.2, 24.3, 6.8, 2, 0.9, 0.016],
  [50.1, 29.8, 8, 2.4, 2.4, 0.013],
  [47.5, 33.1, 5.5, 1.7, 4.2, 0.019],
  [6.8, 26.4, 6.3, 1.9, 1.2, 0.017],
  [10.2, 30.2, 7.5, 2.2, 5.1, 0.015],
  [20.4, 54.3, 7.8, 2.3, 2.8, 0.012],
  [36.7, 57.1, 6.6, 2, 0.6, 0.02],
] as const;

export function drawAtmosphere(input: DrawPharosVilleInput, lighthouse?: LighthouseRenderState): void {
  const { camera, ctx, motion } = input;
  const sky = skyState(motion);
  // The new warm pool replaces this cool mist at night; drawing it would
  // visibly desaturate the pool centre.
  if (sky.nightFactor > 0.4) return;
  const { firePoint } = lighthouse ?? lighthouseRenderState(input);
  ctx.save();
  ctx.fillStyle = sky.mood.mist;
  ctx.beginPath();
  ctx.ellipse(firePoint.x - 18 * camera.zoom, firePoint.y + 30 * camera.zoom, 190 * camera.zoom, 48 * camera.zoom, -0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// Asymmetric flap: power downstroke spends ~60% of the cycle, recovery
// upstroke spends ~40% with reduced amplitude — gives birds a rhythm closer
// to real wing kinematics than the previous symmetric sin pulse.
function wingStroke(time: number, phase: number, speedMul: number): number {
  const cycle = (time * 5.2 * speedMul + phase) % (Math.PI * 2);
  const wrapped = cycle < 0 ? cycle + Math.PI * 2 : cycle;
  if (wrapped < Math.PI) {
    // Downstroke — slower, larger sweep.
    return 0.18 + Math.sin(wrapped) * 0.42;
  }
  // Upstroke — faster (sharpen the curve), smaller sweep, slight tuck.
  const upPhase = (wrapped - Math.PI) * 1.6;
  return 0.32 - Math.sin(Math.min(Math.PI, upPhase)) * 0.18;
}

export function drawBirds({ camera, ctx, motion, world }: DrawPharosVilleInput): void {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const threat = maxActiveThreatLevel(world);
  const seaState = seaStateForWorld(world, {
    reducedMotion: motion.reducedMotion,
    wallClockHour: motion.wallClockHour,
  });
  const windScale = seaStateWindMultiplier(seaState);
  ctx.save();
  for (const bird of BIRDS) {
    const sample = sampleBird(bird, time, world, windScale, threat);
    if (!sample.visible) continue;
    const p = tileToScreen(sample.tile, camera);
    const speciesScale = camera.zoom * bird.scale;
    // Pigeons flap at a faster cadence than gulls.
    const flapSpeed = bird.species === "pigeon" ? 1.45 : 1;
    const wing = motion.reducedMotion ? 0.34 : wingStroke(time, bird.phase, flapSpeed);
    drawBirdShadow(ctx, p.x, p.y, speciesScale);
    if (bird.species === "gull") {
      drawGull(ctx, p.x, p.y - 46 * speciesScale, speciesScale, wing, sample.bank);
    } else {
      drawPigeon(ctx, p.x, p.y - 38 * speciesScale, speciesScale, wing, sample.bank);
    }
  }
  ctx.restore();
}

function drawBirdShadow(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) {
  ctx.save();
  ctx.fillStyle = "rgba(8, 16, 22, 0.18)";
  ctx.beginPath();
  ctx.ellipse(x, y, 7 * zoom, 1.7 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawGull(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, wing: number, bank: number) {
  const direction = bank >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(direction, 1);
  ctx.strokeStyle = "rgba(241, 235, 207, 0.86)";
  ctx.lineWidth = Math.max(1, 1.8 * zoom);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-12 * zoom, 0);
  ctx.quadraticCurveTo(-6 * zoom, -13 * zoom * wing, -1 * zoom, 0);
  ctx.quadraticCurveTo(6 * zoom, -13 * zoom * wing, 13 * zoom, -1 * zoom);
  ctx.stroke();

  ctx.fillStyle = "rgba(24, 30, 31, 0.74)";
  ctx.beginPath();
  ctx.ellipse(1 * zoom, 1 * zoom, 3.2 * zoom, 1.6 * zoom, -0.08, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(27, 35, 37, 0.38)";
  ctx.lineWidth = Math.max(1, 1.1 * zoom);
  ctx.beginPath();
  ctx.moveTo(-5 * zoom, 1 * zoom);
  ctx.lineTo(6 * zoom, 1 * zoom);
  ctx.stroke();
  ctx.restore();
}

function drawPigeon(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, wing: number, bank: number) {
  const direction = bank >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(direction, 1);

  // Shorter, rounder wings than the gull arc.
  ctx.strokeStyle = "rgba(196, 168, 138, 0.92)";
  ctx.lineWidth = Math.max(1, 1.7 * zoom);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-8 * zoom, 0.5 * zoom);
  ctx.quadraticCurveTo(-4 * zoom, -9 * zoom * wing, 0, 0.5 * zoom);
  ctx.quadraticCurveTo(4 * zoom, -9 * zoom * wing, 8 * zoom, -0.2 * zoom);
  ctx.stroke();

  // Compact sepia body — pigeons are stockier than gulls.
  ctx.fillStyle = "rgba(94, 70, 52, 0.86)";
  ctx.beginPath();
  ctx.ellipse(0.5 * zoom, 1.1 * zoom, 2.6 * zoom, 1.7 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();

  // Pale chest highlight to read at zoom-out.
  ctx.fillStyle = "rgba(232, 212, 188, 0.55)";
  ctx.beginPath();
  ctx.ellipse(1.4 * zoom, 1.3 * zoom, 1.4 * zoom, 0.9 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// V2.5 — quay lantern placement offset from each rendered dock's tile, in
// tile units. One lamp per dock; the set stays bounded by the dock cap and
// rides the same sway/flicker family as the civic lanterns.
const DOCK_LANTERN_OFFSET = { x: 0.55, y: 0.45 } as const;
const DOCK_LANTERN_SCALE = 0.4;

export function drawDecorativeLights({ camera, ctx, motion, world }: DrawPharosVilleInput): void {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const drawSwayingLamp = (tileX: number, tileY: number, scale: number) => {
    const p = tileToScreen({ x: tileX, y: tileY }, camera);
    const phase = time + tileX * 0.31 + tileY * 0.17;
    const swayPhase = (tileX * 0.7 + tileY * 0.4) % (Math.PI * 2);
    const sway = motion.reducedMotion ? 0 : Math.sin(time * 0.9 + swayPhase);
    const swayX = sway * 1.6 * camera.zoom * scale;
    const swayRot = sway * 0.04;
    ctx.save();
    ctx.translate(p.x + swayX, p.y);
    ctx.rotate(swayRot);
    drawLamp(ctx, 0, 0, camera.zoom * scale, phase);
    ctx.restore();
  };
  for (const light of VILLAGE_LIGHTS) {
    drawSwayingLamp(light[0], light[1], light[2]);
  }
  // V2.5 quay lanterns: one per rendered dock (bounded by the dock cap).
  for (const dock of world.docks ?? []) {
    drawSwayingLamp(dock.tile.x + DOCK_LANTERN_OFFSET.x, dock.tile.y + DOCK_LANTERN_OFFSET.y, DOCK_LANTERN_SCALE);
  }
}

/** Bounded decorative-light count for the motion-cue debug contract. */
export function decorativeLightCount(world: PharosVilleWorld): number {
  return VILLAGE_LIGHTS.length + (world.docks?.length ?? 0);
}

export function drawBioluminescentSparkles(
  input: DrawPharosVilleInput,
  nightFactor: number,
  lighthouse?: LighthouseRenderState,
): void {
  if (nightFactor <= 0) return;
  const { camera, ctx, motion, width, height } = input;
  const { firePoint } = lighthouse ?? lighthouseRenderState(input);
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const seaState = seaStateForWorld(input.world, {
    reducedMotion: motion.reducedMotion,
    wallClockHour: motion.wallClockHour,
  });
  const tempo = seaStateTempoMultiplier(seaState);
  const zoom = camera.zoom;
  const offsetX = camera.offsetX;
  const offsetY = camera.offsetY;
  const cullPadding = 24 * zoom;
  const minX = -cullPadding;
  const maxX = width + cullPadding;
  const minY = -cullPadding;
  const maxY = height + cullPadding;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const sp of SPARKLE_POINTS) {
    const px = sp.isoX * zoom + offsetX;
    const py = sp.isoY * zoom + offsetY;
    if (px < minX || px > maxX || py < minY || py > maxY) continue;

    const pathScale = pyreWaterPathSparkleScale({ x: px, y: py }, firePoint, zoom);
    const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 * tempo + sp.phase);
    const alpha = twinkle * twinkle * nightFactor * 0.7 * pathScale;
    if (alpha < 0.01) continue;
    const r = Math.max(1, sp.baseRadius * zoom);
    ctx.fillStyle = `rgba(140, 230, 215, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Per-radius-bucket cache for the lamp halo (radial gradient × elliptical
// clip). Baked at glow=1 and modulated via `globalAlpha` at draw time.
// Mirrors the `lampLightConeSpriteCache` radius-bucket pattern in
// scenery.ts. Used by both the village-lamp loop in `drawDecorativeLights`
// and the harbor-lamp props rendered through `drawSceneryProp` ->
// `drawLamp` in scenery.ts.
const LAMP_HALO_RADIUS_BUCKETS = 2;
const lampHaloSpriteCache = new Map<number, { canvas: HTMLCanvasElement; centerX: number; centerY: number }>();

function quantizeLampHaloZoom(zoom: number): number {
  // Bucket the effective draw zoom by quantizing to half-pixel steps of the
  // lamp's outer radius (22 * zoom). Matches the half-pixel granularity the
  // scenery lamp-cone sprite uses for its own zoom-driven cache.
  const radius = Math.max(1, Math.round(22 * zoom * LAMP_HALO_RADIUS_BUCKETS) / LAMP_HALO_RADIUS_BUCKETS);
  return radius / 22;
}

function getLampHaloSprite(zoom: number): { canvas: HTMLCanvasElement; centerX: number; centerY: number } | null {
  if (typeof document === "undefined") return null;
  const bucketed = quantizeLampHaloZoom(zoom);
  const cached = lampHaloSpriteCache.get(bucketed);
  if (cached) return cached;

  // Mirrors the in-place ellipse + radial-gradient draw, baked once per
  // bucket. Sprite is centered on the radial gradient's anchor (y - 9*zoom);
  // callers offset by (y - 8*zoom) to keep the ellipse clip 1px below.
  const radius = 22 * bucketed;
  const ellipseX = 22 * bucketed;
  const ellipseY = 12 * bucketed;
  const padding = 2;
  const width = Math.max(2, Math.ceil(ellipseX * 2) + padding * 2);
  const height = Math.max(2, Math.ceil(ellipseY * 2) + padding * 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const offCtx = canvas.getContext("2d");
  if (!offCtx) return null;
  const cx = width / 2;
  const cy = height / 2;
  // Radial-gradient anchor sat at (y - 9*zoom); ellipse sat at (y - 8*zoom).
  // Bake the gradient anchored at (cx, cy - 1*bucketed) and the ellipse
  // centered at (cx, cy) so the same 1px offset is preserved.
  const gradAnchorY = cy - 1 * bucketed;
  const grad = offCtx.createRadialGradient(cx, gradAnchorY, 1 * bucketed, cx, gradAnchorY, radius);
  grad.addColorStop(0, "rgba(247, 214, 138, 0.9)");
  grad.addColorStop(0.46, "rgba(212, 154, 62, 0.28)");
  grad.addColorStop(1, "rgba(212, 154, 62, 0)");
  offCtx.save();
  offCtx.fillStyle = grad;
  offCtx.beginPath();
  offCtx.ellipse(cx, cy, ellipseX, ellipseY, -0.08, 0, Math.PI * 2);
  offCtx.fill();
  offCtx.restore();

  // `centerX`/`centerY` mark the ellipse center inside the sprite, so callers
  // can position the sprite so that its ellipse sits on the original
  // (x, y - 8*zoom) anchor regardless of the bucketed zoom.
  const entry = { canvas, centerX: cx, centerY: cy };
  lampHaloSpriteCache.set(bucketed, entry);
  return entry;
}

export function drawLamp(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number, phase: number): void {
  const glow = 0.22 + Math.sin(phase * 1.6) * 0.04;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const sprite = getLampHaloSprite(zoom);
  if (sprite) {
    ctx.globalAlpha = glow;
    ctx.drawImage(
      sprite.canvas,
      x - sprite.centerX,
      y - 8 * zoom - sprite.centerY,
      sprite.canvas.width,
      sprite.canvas.height,
    );
    ctx.globalAlpha = 1;
  } else {
    const halo = ctx.createRadialGradient(x, y - 9 * zoom, 1 * zoom, x, y - 9 * zoom, 22 * zoom);
    halo.addColorStop(0, `rgba(247, 214, 138, ${glow * 0.9})`);
    halo.addColorStop(0.46, `rgba(212, 154, 62, ${glow * 0.28})`);
    halo.addColorStop(1, "rgba(212, 154, 62, 0)");
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(x, y - 8 * zoom, 22 * zoom, 12 * zoom, -0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = `rgba(255, 197, 95, ${glow})`;
  ctx.beginPath();
  ctx.ellipse(x, y - 7 * zoom, 12 * zoom, 7 * zoom, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3f2d1f";
  ctx.fillRect(Math.round(x - zoom), Math.round(y - 12 * zoom), Math.max(1, Math.round(2 * zoom)), Math.max(4, Math.round(12 * zoom)));
  ctx.fillStyle = "#f5c766";
  ctx.fillRect(Math.round(x - 2 * zoom), Math.round(y - 14 * zoom), Math.max(2, Math.round(4 * zoom)), Math.max(2, Math.round(3 * zoom)));
  ctx.strokeStyle = `rgba(247, 214, 138, ${glow * 0.58})`;
  ctx.lineWidth = Math.max(1, 0.85 * zoom);
  ctx.beginPath();
  ctx.moveTo(x - 8 * zoom, y + 2 * zoom);
  ctx.lineTo(x + 9 * zoom, y + 4 * zoom);
  ctx.stroke();
  ctx.restore();
}

export function drawMoonReflection(input: DrawPharosVilleInput, nightFactor: number): void {
  if (nightFactor <= 0) return;
  const { ctx, width, height } = input;
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  const cx = width * 0.28;
  const cy = height * 0.38;
  const diagonal = Math.hypot(width, height);
  const radius = diagonal * 0.32;
  const grad = moonReflectionGradient(ctx, {
    cx,
    cy,
    ...(input.dpr !== undefined ? { dpr: input.dpr } : {}),
    height,
    nightFactor,
    radius,
    width,
  });
  ctx.fillStyle = grad;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, radius, diagonal * 0.055, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
}

function moonReflectionGradient(
  ctx: CanvasRenderingContext2D,
  params: {
    cx: number;
    cy: number;
    dpr?: number;
    height: number;
    nightFactor: number;
    radius: number;
    width: number;
  },
): CanvasGradient {
  const nightBucket = Math.max(0, Math.min(MOON_REFLECTION_NIGHT_BUCKETS, Math.round(params.nightFactor * MOON_REFLECTION_NIGHT_BUCKETS)));
  const key = [
    Math.round(params.width),
    Math.round(params.height),
    dprBucket(params.dpr),
    Math.round(params.cx),
    Math.round(params.cy),
    Math.round(params.radius),
    nightBucket,
  ].join(":");
  const cache = moonReflectionCacheForContext(ctx);
  const cached = cache.get(key);
  if (cached) return cached;

  const nightFactor = nightBucket / MOON_REFLECTION_NIGHT_BUCKETS;
  const grad = ctx.createRadialGradient(
    params.cx,
    params.cy,
    0,
    params.cx,
    params.cy,
    Math.max(1, params.radius),
  );
  grad.addColorStop(0, `rgba(108, 152, 214, ${0.034 * nightFactor})`);
  grad.addColorStop(0.38, `rgba(78, 116, 178, ${0.014 * nightFactor})`);
  grad.addColorStop(1, "rgba(52, 86, 146, 0)");
  cache.set(key, grad);
  if (cache.size > MOON_REFLECTION_GRADIENT_CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  return grad;
}

function moonReflectionCacheForContext(ctx: CanvasRenderingContext2D): Map<string, CanvasGradient> {
  let cache = moonReflectionGradientCacheByContext.get(ctx);
  if (!cache) {
    cache = new Map();
    moonReflectionGradientCacheByContext.set(ctx, cache);
  }
  return cache;
}

// Alpha-bucketed `rgba(165, 178, 195, ...)` template strings for `drawSeaMist`.
// 256 buckets cap the quantization step at 1/255 — below the alpha-channel
// resolution the canvas itself can resolve — while collapsing the per-frame
// string allocations down to one cache lookup per patch after warmup.
const SEA_MIST_FILL_BUCKETS = 256;
const seaMistFillCache: (string | undefined)[] = new Array(SEA_MIST_FILL_BUCKETS + 1);

function seaMistFillFor(alpha: number): string {
  const bucket = Math.max(0, Math.min(SEA_MIST_FILL_BUCKETS, Math.round(alpha * SEA_MIST_FILL_BUCKETS)));
  const cached = seaMistFillCache[bucket];
  if (cached !== undefined) return cached;
  const next = `rgba(165, 178, 195, ${bucket / SEA_MIST_FILL_BUCKETS})`;
  seaMistFillCache[bucket] = next;
  return next;
}

function dprBucket(dpr?: number): number {
  return Math.max(1, Math.round((dpr && dpr > 0 ? dpr : 1) * 100));
}

export function drawSeaMist(input: DrawPharosVilleInput, nightFactor: number): void {
  // Mist still gates on `nightFactor > 0` — same as Phase-0 invariant. The
  // per-patch threat modulation only scales density / alpha / drift speed
  // within the existing nightFactor envelope.
  if (nightFactor <= 0) return;
  const { camera, ctx, motion, world } = input;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  const seaState = seaStateForWorld(world, {
    reducedMotion: motion.reducedMotion,
    wallClockHour: motion.wallClockHour,
  });
  const wind = seaStateWindMultiplier(seaState);
  ctx.save();
  for (let i = 0; i < SEA_MIST_PATCHES.length; i += 1) {
    const patch = SEA_MIST_PATCHES[i]!;
    const threat = threatForPoint(world, patch[0], patch[1]);
    const driftSpeed = patch[5] * wind;
    const drift = Math.sin(time * driftSpeed + patch[4]) * 0.4;
    const p = tileToScreen({ x: patch[0] + drift, y: patch[1] + drift * 0.3 }, camera);
    // Alpha multiplier: 1.0 at CALM, scales up to ~1.7 at DANGER so storm
    // patches read as denser fog.
    const alphaScale = 1 + threat * 0.18;
    const baseAlpha = 0.042 + Math.sin(time * driftSpeed * 1.8 + patch[4]) * 0.012;
    const alpha = baseAlpha * alphaScale * nightFactor;
    ctx.fillStyle = seaMistFillFor(alpha);
    ctx.beginPath();
    // Patches over banded zones thicken slightly (max +12% radius at DANGER).
    const radiusScale = 1 + threat * 0.03;
    ctx.ellipse(
      p.x,
      p.y,
      patch[2] * camera.zoom * 12 * radiusScale,
      patch[3] * camera.zoom * 12 * radiusScale,
      -0.12,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
