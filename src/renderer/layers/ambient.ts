import { tileToScreen } from "../../systems/projection";
import type { PharosVilleWorld } from "../../systems/world-types";
import type { DrawPharosVilleInput } from "../render-types";
import { lighthouseRenderState, type LighthouseRenderState } from "./lighthouse";
import { skyState } from "./sky";
import {
  maxActiveThreatLevel,
  threatForPoint,
  windMultiplier,
  type ThreatLevel,
} from "./weather";

const VILLAGE_LIGHTS = [
  { x: 16.7, y: 29.4, size: 0.52 },
  { x: 18.4, y: 27.9, size: 0.58 },
  { x: 19.8, y: 29.0, size: 0.48 },
  { x: 20.8, y: 30.8, size: 0.44 },
  { x: 24.6, y: 23.4, size: 0.42 },
  { x: 28.8, y: 22.3, size: 0.46 },
  { x: 30.1, y: 31.8, size: 0.54 },
  { x: 33.2, y: 30.1, size: 0.5 },
  { x: 35.4, y: 42.5, size: 0.48 },
  { x: 37.2, y: 29.5, size: 0.52 },
  { x: 41.1, y: 28.9, size: 0.5 },
  { x: 44.2, y: 33.7, size: 0.52 },
] as const;

type BioluminescentSparkle = {
  isoX: number;
  isoY: number;
  phase: number;
  baseRadius: number;
};

const SPARKLE_POINT_DEFS = [
  { x: 8.3, y: 28.4, phase: 0.0 },
  { x: 9.7, y: 31.2, phase: 0.72 },
  { x: 10.4, y: 33.8, phase: 1.44 },
  { x: 11.1, y: 30.1, phase: 2.16 },
  { x: 12.6, y: 35.4, phase: 2.88 },
  { x: 13.2, y: 27.9, phase: 3.60 },
  { x: 8.8, y: 24.6, phase: 4.32 },
  { x: 11.9, y: 26.3, phase: 5.04 },
  { x: 9.2, y: 29.7, phase: 5.76 },
  { x: 13.8, y: 32.9, phase: 0.38 },
  { x: 15.3, y: 36.8, phase: 1.10 },
  { x: 17.2, y: 39.4, phase: 1.82 },
  { x: 18.8, y: 41.7, phase: 2.54 },
  { x: 20.4, y: 43.2, phase: 3.26 },
  { x: 22.1, y: 44.8, phase: 3.98 },
  { x: 24.3, y: 45.9, phase: 4.70 },
  { x: 26.7, y: 46.5, phase: 5.42 },
  { x: 28.9, y: 47.1, phase: 0.19 },
  { x: 31.2, y: 47.4, phase: 0.91 },
  { x: 33.5, y: 46.8, phase: 1.63 },
  { x: 35.8, y: 45.6, phase: 2.35 },
  { x: 37.4, y: 44.1, phase: 3.07 },
  { x: 16.1, y: 38.2, phase: 3.79 },
  { x: 19.6, y: 40.8, phase: 4.51 },
  { x: 23.4, y: 43.0, phase: 5.23 },
  { x: 29.7, y: 45.3, phase: 0.57 },
  { x: 14.8, y: 35.1, phase: 1.29 },
  { x: 21.8, y: 42.4, phase: 2.01 },
  { x: 27.3, y: 46.0, phase: 2.73 },
  { x: 32.4, y: 47.2, phase: 3.45 },
  { x: 39.1, y: 34.2, phase: 4.17 },
  { x: 40.8, y: 31.7, phase: 4.89 },
  { x: 42.3, y: 29.4, phase: 5.61 },
  { x: 44.1, y: 27.2, phase: 0.45 },
  { x: 45.9, y: 25.1, phase: 1.17 },
  { x: 47.6, y: 23.3, phase: 1.89 },
  { x: 49.2, y: 26.8, phase: 2.61 },
  { x: 50.7, y: 28.9, phase: 3.33 },
  { x: 51.4, y: 31.5, phase: 4.05 },
  { x: 52.1, y: 33.8, phase: 4.77 },
  { x: 43.5, y: 32.6, phase: 5.49 },
  { x: 46.4, y: 30.1, phase: 0.83 },
  { x: 48.8, y: 24.7, phase: 1.55 },
  { x: 38.3, y: 36.1, phase: 2.27 },
  { x: 41.7, y: 22.4, phase: 2.99 },
  { x: 4.2, y: 29.3, phase: 3.71 },
  { x: 5.1, y: 31.8, phase: 4.43 },
  { x: 6.4, y: 28.7, phase: 5.15 },
  { x: 7.3, y: 30.9, phase: 5.87 },
  { x: 5.8, y: 33.4, phase: 0.63 },
  { x: 53.2, y: 29.7, phase: 1.35 },
  { x: 54.1, y: 32.4, phase: 2.07 },
  { x: 55.3, y: 35.1, phase: 2.79 },
  { x: 54.8, y: 37.6, phase: 3.51 },
  { x: 52.7, y: 36.2, phase: 4.23 },
] as const;

const SPARKLE_POINTS = SPARKLE_POINT_DEFS.map((p) => ({
  isoX: (p.x - p.y) * 16,
  isoY: (p.x + p.y) * 8,
  phase: p.phase,
  baseRadius: 0.9 + Math.sin(p.phase * 2.1) * 0.4,
})) as readonly BioluminescentSparkle[];

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

// Dispatch-cadence multiplier per threat level. CALM = baseline, DANGER ≈ 5×
// faster — a stronger ramp than the smoother `windMultiplier` so an active
// stress event reads as a flurry of carrier pigeons leaving the loft.
const DISPATCH_GAP_FACTOR: readonly number[] = [1.0, 0.66, 0.45, 0.30, 0.18];

export function dispatchGapForThreat(baseSeconds: number, threat: ThreatLevel): number {
  return baseSeconds * (DISPATCH_GAP_FACTOR[threat] ?? 1);
}

export const BIRDS: readonly BirdConfig[] = [
  // Lighthouse harbor gulls — the existing 9 ambient flocks.
  { species: "gull", scale: 1.14, phase: 0.1, route: { kind: "orbit", anchor: "lighthouse", anchorX: -4.2, anchorY: -3.2, radiusX: 3.8, radiusY: 1.4, speed: 0.24 } },
  { species: "gull", scale: 0.98, phase: 1.9, route: { kind: "orbit", anchor: "lighthouse", anchorX: -1.4, anchorY: -5.2, radiusX: 4.4, radiusY: 1.7, speed: 0.2 } },
  { species: "gull", scale: 0.9,  phase: 3.4, route: { kind: "orbit", anchor: "lighthouse", anchorX: 2.8, anchorY: -4.3, radiusX: 3.2, radiusY: 1.2, speed: 0.23 } },
  { species: "gull", scale: 0.76, phase: 0.6, route: { kind: "orbit", anchor: "lighthouse", anchorX: -18.5, anchorY: -10.8, radiusX: 8.5, radiusY: 2.2, speed: 0.13 } },
  { species: "gull", scale: 0.68, phase: 2.8, route: { kind: "orbit", anchor: "lighthouse", anchorX: -29.5, anchorY: 4.4, radiusX: 7.4, radiusY: 1.8, speed: 0.15 } },
  { species: "gull", scale: 0.72, phase: 4.2, route: { kind: "orbit", anchor: "lighthouse", anchorX: 10.5, anchorY: -15.5, radiusX: 8.8, radiusY: 2.6, speed: 0.12 } },
  { species: "gull", scale: 0.62, phase: 5.3, route: { kind: "orbit", anchor: "lighthouse", anchorX: 18.2, anchorY: 2.2, radiusX: 6.2, radiusY: 1.6, speed: 0.18 } },
  { species: "gull", scale: 0.84, phase: 2.2, route: { kind: "orbit", anchor: "lighthouse", anchorX: 7.2, anchorY: -7.6, radiusX: 5.2, radiusY: 1.5, speed: 0.19 } },
  { species: "gull", scale: 0.82, phase: 4.9, route: { kind: "orbit", anchor: "lighthouse", anchorX: -9.8, anchorY: -8.2, radiusX: 5.8, radiusY: 1.7, speed: 0.17 } },
  // Resident carrier pigeons orbiting the dovecote — tighter, faster radii.
  { species: "pigeon", scale: 0.62, phase: 0.0, route: { kind: "orbit", anchor: "pigeonnier", anchorX: -1.0, anchorY: -1.8, radiusX: 1.8, radiusY: 0.7, speed: 0.42 } },
  { species: "pigeon", scale: 0.58, phase: 1.7, route: { kind: "orbit", anchor: "pigeonnier", anchorX: 0.6, anchorY: -1.4, radiusX: 1.4, radiusY: 0.55, speed: 0.5 } },
  { species: "pigeon", scale: 0.54, phase: 3.6, route: { kind: "orbit", anchor: "pigeonnier", anchorX: -0.2, anchorY: -2.4, radiusX: 2.2, radiusY: 0.85, speed: 0.36 } },
  // Closed shuttle courier — back-and-forth between lighthouse and dovecote,
  // visually linking the two watch landmarks. Period scales with threat.
  { species: "pigeon", scale: 0.66, phase: 0.0, route: { kind: "shuttle", from: "pigeonnier", to: "lighthouse", basePeriod: 36, arcLift: 4.0 } },
  // Open-sea dispatch — periodic carrier pigeon launching SE off-map. Cadence
  // accelerates with active DEWS threat to mirror the bot's role: more alerts
  // when stablecoins wobble.
  { species: "pigeon", scale: 0.6, phase: 0.0, route: { kind: "dispatch", origin: "pigeonnier", destination: { x: 65, y: 60 }, flightDuration: 6, baseGapSeconds: 45, arcLift: 3.0 } },
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
    return {
      tile: {
        x: origin.x + route.anchorX + Math.cos(angle) * route.radiusX,
        y: origin.y + route.anchorY + Math.sin(angle) * route.radiusY,
      },
      bank: Math.cos(angle),
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
  { x: 22.5, y: 16.2, rx: 5.8, ry: 1.8, phase: 0.3, speed: 0.018 },
  { x: 28.1, y: 18.5, rx: 7.2, ry: 2.1, phase: 1.7, speed: 0.014 },
  { x: 33.6, y: 15.8, rx: 6.1, ry: 1.9, phase: 3.1, speed: 0.021 },
  { x: 44.2, y: 24.3, rx: 6.8, ry: 2.0, phase: 0.9, speed: 0.016 },
  { x: 50.1, y: 29.8, rx: 8.0, ry: 2.4, phase: 2.4, speed: 0.013 },
  { x: 47.5, y: 33.1, rx: 5.5, ry: 1.7, phase: 4.2, speed: 0.019 },
  { x: 6.8,  y: 26.4, rx: 6.3, ry: 1.9, phase: 1.2, speed: 0.017 },
  { x: 10.2, y: 30.2, rx: 7.5, ry: 2.2, phase: 5.1, speed: 0.015 },
  { x: 20.4, y: 54.3, rx: 7.8, ry: 2.3, phase: 2.8, speed: 0.012 },
  { x: 36.7, y: 57.1, rx: 6.6, ry: 2.0, phase: 0.6, speed: 0.020 },
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
  const windScale = motion.reducedMotion ? 1 : windMultiplier(threat);
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

export function drawDecorativeLights({ camera, ctx, motion }: DrawPharosVilleInput): void {
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  for (const light of VILLAGE_LIGHTS) {
    const p = tileToScreen(light, camera);
    const phase = time + light.x * 0.31 + light.y * 0.17;
    const swayPhase = (light.x * 0.7 + light.y * 0.4) % (Math.PI * 2);
    const sway = motion.reducedMotion ? 0 : Math.sin(time * 0.9 + swayPhase);
    const swayX = sway * 1.6 * camera.zoom * light.size;
    const swayRot = sway * 0.04;
    ctx.save();
    ctx.translate(p.x + swayX, p.y);
    ctx.rotate(swayRot);
    drawLamp(ctx, 0, 0, camera.zoom * light.size, phase);
    ctx.restore();
  }
}

export function drawBioluminescentSparkles(
  input: DrawPharosVilleInput,
  nightFactor: number,
  lighthouse?: LighthouseRenderState,
): void {
  if (nightFactor <= 0) return;
  const { camera, ctx, motion, width, height } = input;
  const { firePoint } = lighthouse ?? lighthouseRenderState(input);
  // Suppress sparkles inside the warm pool — cyan + warm amber stack to white
  // and wash both effects out. Match the lighthouse pool radius.
  const haloRadius = 900 * camera.zoom;
  const haloRadiusSq = haloRadius * haloRadius;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
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

    const dx = px - firePoint.x;
    const dy = py - firePoint.y;
    const distSq = dx * dx + dy * dy;
    if (distSq < haloRadiusSq) continue;
    const twinkle = 0.5 + 0.5 * Math.sin(time * 1.4 + sp.phase);
    const alpha = twinkle * twinkle * nightFactor * 0.7;
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
  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(width, height) * 0.42);
  grad.addColorStop(0, `rgba(140, 170, 220, ${0.075 * nightFactor})`);
  grad.addColorStop(0.35, `rgba(115, 150, 205, ${0.034 * nightFactor})`);
  grad.addColorStop(1, "rgba(100, 135, 200, 0)");
  ctx.fillStyle = grad;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.55);
  ctx.beginPath();
  ctx.ellipse(0, 0, Math.hypot(width, height) * 0.42, Math.hypot(width, height) * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.restore();
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

export function drawSeaMist(input: DrawPharosVilleInput, nightFactor: number): void {
  // Mist still gates on `nightFactor > 0` — same as Phase-0 invariant. The
  // per-patch threat modulation only scales density / alpha / drift speed
  // within the existing nightFactor envelope.
  if (nightFactor <= 0) return;
  const { camera, ctx, motion, world } = input;
  const time = motion.reducedMotion ? 0 : motion.timeSeconds;
  ctx.save();
  for (let i = 0; i < SEA_MIST_PATCHES.length; i += 1) {
    const patch = SEA_MIST_PATCHES[i]!;
    const threat = threatForPoint(world, patch.x, patch.y);
    const wind = windMultiplier(threat);
    const driftSpeed = patch.speed * wind;
    const drift = Math.sin(time * driftSpeed + patch.phase) * 0.4;
    const p = tileToScreen({ x: patch.x + drift, y: patch.y + drift * 0.3 }, camera);
    // Alpha multiplier: 1.0 at CALM, scales up to ~1.7 at DANGER so storm
    // patches read as denser fog.
    const alphaScale = 1 + threat * 0.18;
    const baseAlpha = 0.042 + Math.sin(time * driftSpeed * 1.8 + patch.phase) * 0.012;
    const alpha = baseAlpha * alphaScale * nightFactor;
    ctx.fillStyle = seaMistFillFor(alpha);
    ctx.beginPath();
    // Patches over banded zones thicken slightly (max +12% radius at DANGER).
    const radiusScale = 1 + threat * 0.03;
    ctx.ellipse(
      p.x,
      p.y,
      patch.rx * camera.zoom * 12 * radiusScale,
      patch.ry * camera.zoom * 12 * radiusScale,
      -0.12,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }
  ctx.restore();
}
