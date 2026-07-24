import {
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  OctahedronGeometry,
  PlaneGeometry,
  Quaternion,
  Vector3,
} from "three";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";
import {
  GARDEN_ZONE_ROOT_Y,
  gardenAreaCenterTile,
} from "../systems/garden-observatory-slice";
import {
  DEWS_AREA_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../systems/risk-water-areas";
import { HARBOR_PALETTE, zoneThemeForTerrain } from "../systems/palette";
import type { AreaNode } from "../systems/world-types";
import {
  ZONE_BASE_RADIUS,
  ZONE_BASE_RADIUS_DEFAULT,
  ZONE_BASE_RADIUS_LEDGER,
  ZONE_ELLIPSE_X,
  ZONE_ELLIPSE_Z,
  zoneRadius,
} from "../systems/garden-zone-radii";
import { setTilePosition, stableUnit } from "./garden-util";

// The ellipse semi-axis factors and the per-band radius mapping live in
// ../systems/garden-zone-radii.ts (three-free) so the deterministic sea
// coverage measurement consumes the same numbers.
const ELLIPSE_X = ZONE_ELLIPSE_X;
const ELLIPSE_Z = ZONE_ELLIPSE_Z;

// Z3 (Garden Sea palette contract): day-harmonized band hues. Each DEWS label
// accent is pulled toward a HARBOR_PALETTE anchor so the charted rings sit
// inside the ukiyo-e day grade — muted teal-green calm → deep amber warning →
// ember danger (vermillion stays the reserved danger accent). The water
// shader luminance-matches the tint against the live water color (contract
// C2(a)), and DOM labels keep the raw DEWS accents, so hue is never the only
// encoding. Ledger Mooring (band null) keeps its ink accent unharmonized.
const ZONE_COLOR_HARMONY: Record<string, { anchor: string; mix: number }> = {
  CALM: { anchor: HARBOR_PALETTE.sail_teal, mix: 0.55 },
  WATCH: { anchor: HARBOR_PALETTE.sail_teal, mix: 0.3 },
  ALERT: { anchor: HARBOR_PALETTE.lantern_warm, mix: 0.4 },
  WARNING: { anchor: HARBOR_PALETTE.timber_warm, mix: 0.5 },
  DANGER: { anchor: HARBOR_PALETTE.vermillion, mix: 0.5 },
};

// The dashed perimeter is the primary marker; brightness (not alpha, since all
// zones share one merged material) encodes band escalation — danger strongest.
// Zones-v2: the floor was raised so the Calm harbor ring and the huge Watch
// arc stay legible over bright shallow water (order preserved).
const PERIMETER_STRENGTH: Record<string, number> = {
  DANGER: 1,
  WARNING: 0.82,
  ALERT: 0.72,
  WATCH: 0.62,
  CALM: 0.58,
};
const PERIMETER_STRENGTH_DEFAULT = 0.6;

// In-water tint strength per band (subtle: danger is a brooding patch, not a
// paint spill). Kept ≤ 0.25 so DOM labels stay legible over the water.
// Zones-v2: the ellipses grew into map-spanning bodies of water, so strengths
// drop with footprint — WATCH tints nearly the whole sea and must be
// barely-there; DANGER stays the strongest read but hugs the corner.
// Zones-v3: the ellipses grew again (Watch 48, Calm 32, Alert 34), so the
// large-body strengths step down once more; the escalation order is preserved.
const TINT_STRENGTH: Record<string, number> = {
  DANGER: 0.2,
  WARNING: 0.13,
  ALERT: 0.1,
  WATCH: 0.04,
  CALM: 0.08,
};
const TINT_STRENGTH_DEFAULT = 0.1;

const BUOY_HEIGHT = 1.1;
// Z3: buoys ride the water shader's swell (CPU mirror, see updateZoneBuoys).
// The shader's own displacement is sub-pixel at overview zoom, so the bob
// amplitude is exaggerated for legibility; phase and frequencies match the
// water exactly. Tilt converts the local swell gradient into a gentle lean.
const BUOY_BOB_AMPLITUDE = 0.22;
const BUOY_TILT = 1.2;
const DEEP_SEA = new Color(HARBOR_PALETTE.deep_sea_2);
const FLICKER_COLD = new Color(HARBOR_PALETTE.lantern_cold);

export interface ZoneTint {
  center: { x: number; z: number };
  color: Color;
  radiusX: number;
  radiusZ: number;
  strength: number;
}

export interface ZoneBuoyPlacement {
  color: Color;
  danger: boolean;
  worldX: number;
  worldZ: number;
}

export interface ZoneVisual {
  area: AreaNode;
  buoys: ZoneBuoyPlacement[];
  perimeter: PerimeterMesh;
  root: Group;
  tint: ZoneTint;
}

interface PerimeterMesh {
  colors: number[];
  positions: number[];
}

export interface ZoneField {
  /** Rest-pose world-XZ anchor per instanced buoy; drives the swell bob. */
  buoyAnchors: readonly { x: number; z: number }[];
  buoyBodies: InstancedMesh;
  buoyLamps: InstancedMesh;
  /** Internal: whether the last update left buoys displaced from rest pose. */
  bobbing: boolean;
  dangerLampIndices: number[];
  lampBaseColors: Color[];
  perimeter: Mesh<BufferGeometry, MeshBasicMaterial>;
  root: Group;
}

export interface GardenWeatherVisual {
  flicker: Mesh<PlaneGeometry, MeshBasicMaterial>;
  flickerPeriod: number;
  phase: number;
  root: Group;
  streaks: LineSegments<BufferGeometry, LineBasicMaterial>;
}

// Re-export so the systems-side radius mapping stays the single source of
// truth (consumed here for geometry, and by garden-zone-coverage.ts for the
// deterministic union-coverage guard).
export { ZONE_BASE_RADIUS, ZONE_BASE_RADIUS_DEFAULT, ZONE_BASE_RADIUS_LEDGER };

/** Ramanujan II ellipse-circumference approximation (world units). */
function zoneCircumference(radiusX: number, radiusZ: number): number {
  const h = ((radiusX - radiusZ) / (radiusX + radiusZ)) ** 2;
  return Math.PI * (radiusX + radiusZ) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function zoneBandColor(area: AreaNode): Color {
  const placement = area.riskPlacement
    ?? (area.band ? DEWS_AREA_PLACEMENTS[area.band] : "safe-harbor");
  const definition = riskWaterAreaForPlacement(placement);
  const theme = zoneThemeForTerrain(definition.terrain);
  const color = new Color(theme.label.accent);
  const harmony = area.band ? ZONE_COLOR_HARMONY[area.band] : undefined;
  if (harmony) color.lerp(new Color(harmony.anchor), harmony.mix);
  return color;
}

export function createZone(area: AreaNode): ZoneVisual {
  const danger = area.band === "DANGER";
  const radius = zoneRadius(area);
  const root = new Group();
  setTilePosition(root, gardenAreaCenterTile(area), GARDEN_ZONE_ROOT_Y);
  // Preserve the historic root scale so the selection-cue contract is unchanged.
  root.scale.set(radius * ELLIPSE_X, 1, radius * ELLIPSE_Z);

  const centerX = root.position.x;
  const centerZ = root.position.z;
  const radiusX = radius * ELLIPSE_X;
  const radiusZ = radius * ELLIPSE_Z;
  const bandColor = zoneBandColor(area);
  const circumference = zoneCircumference(radiusX, radiusZ);

  const perimeter = buildBrokenPerimeter(
    area,
    centerX,
    centerZ,
    radiusX,
    radiusZ,
    bandColor,
    circumference,
  );

  // Zones-v2: buoy count scales with circumference (one marker per ~9 world
  // units, capped) so map-spanning rings stay branded along their whole arc.
  const buoyCount = Math.max(5, Math.min(24, Math.round(circumference / 9)));
  const buoys: ZoneBuoyPlacement[] = [];
  const angleSeed = stableUnit(`zone-buoy-angle.${area.id}`) * Math.PI * 2;
  for (let index = 0; index < buoyCount; index += 1) {
    const angle = angleSeed + (index / buoyCount) * Math.PI * 2;
    buoys.push({
      color: bandColor,
      danger,
      worldX: centerX + Math.cos(angle) * radiusX,
      worldZ: centerZ + Math.sin(angle) * radiusZ,
    });
  }

  const tintColor = bandColor.clone();
  if (danger) tintColor.lerp(DEEP_SEA, 0.45);

  return {
    area,
    buoys,
    perimeter,
    root,
    tint: {
      center: { x: centerX, z: centerZ },
      color: tintColor,
      radiusX,
      radiusZ,
      strength: (area.band && TINT_STRENGTH[area.band]) ?? TINT_STRENGTH_DEFAULT,
    },
  };
}

function buildBrokenPerimeter(
  area: AreaNode,
  centerX: number,
  centerZ: number,
  radiusX: number,
  radiusZ: number,
  color: Color,
  circumference: number,
): PerimeterMesh {
  const strength = (area.band && PERIMETER_STRENGTH[area.band])
    ?? PERIMETER_STRENGTH_DEFAULT;
  const r = color.r * strength;
  const g = color.g * strength;
  const b = color.b * strength;
  // Z3: hand-drawn broken ring. The ring is cut into dashes whose length (and
  // therefore the gaps) varies with stable per-zone noise, and the band radius
  // wobbles slightly segment to segment, so the perimeter reads drawn, not
  // plotted. Everything is seeded by area id — the pattern never crawls.
  // Zones-v2: segment and dash counts scale with circumference so the huge
  // Watch/Ledger arcs stay smooth and keep the same drawn cadence as the
  // tight corner rings.
  const segments = Math.max(56, Math.min(160, Math.round(circumference / 1.8)));
  const dashSeed = stableUnit(`zone-dash.${area.id}`);
  const dashCount = Math.max(6, Math.min(14, Math.round(circumference / 22)));
  // Slightly thicker than the historic hairline rings so it reads as the
  // primary charted marker.
  const inner = 0.955;
  const outer = 1.012;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let segment = 0; segment < segments; segment += 1) {
    const dashPhase = (segment / segments) * dashCount + dashSeed;
    const dashIndex = Math.floor(dashPhase);
    const dashLength = 0.45
      + stableUnit(`zone-dash-length.${area.id}.${dashIndex}`) * 0.35;
    if (dashPhase - dashIndex >= dashLength) continue;
    const wobble = 1
      + (stableUnit(`zone-wobble.${area.id}.${segment}`) - 0.5) * 0.04;
    const a0 = (segment / segments) * Math.PI * 2;
    const a1 = ((segment + 1) / segments) * Math.PI * 2;
    const points = [
      [Math.cos(a0) * inner * wobble, Math.sin(a0) * inner * wobble],
      [Math.cos(a0) * outer * wobble, Math.sin(a0) * outer * wobble],
      [Math.cos(a1) * inner * wobble, Math.sin(a1) * inner * wobble],
      [Math.cos(a1) * outer * wobble, Math.sin(a1) * outer * wobble],
    ];
    const quad = [points[0], points[1], points[2], points[2], points[1], points[3]];
    for (const [px, pz] of quad) {
      positions.push(centerX + px! * radiusX, 0, centerZ + pz! * radiusZ);
      colors.push(r, g, b);
    }
  }
  return { colors, positions };
}

/**
 * Assemble every zone's dashed perimeter into one merged mesh and every zone's
 * marker buoys into two shared instanced meshes (dark spar body + band-coloured
 * emissive lamp). Buoys, not fill, carry the zone read: they bob on the swell
 * and the danger lamps blink, so colour is never the only encoding.
 */
export function createZoneField(zones: readonly ZoneVisual[]): ZoneField {
  const root = new Group();
  root.name = "garden-zone-field";
  root.position.y = GARDEN_ZONE_ROOT_Y + 0.02;

  const positions: number[] = [];
  const colors: number[] = [];
  const placements: ZoneBuoyPlacement[] = [];
  for (const zone of zones) {
    positions.push(...zone.perimeter.positions);
    colors.push(...zone.perimeter.colors);
    placements.push(...zone.buoys);
  }

  const perimeterGeometry = new BufferGeometry();
  perimeterGeometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  perimeterGeometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  const perimeter = new Mesh(
    perimeterGeometry,
    new MeshBasicMaterial({
      depthWrite: false,
      opacity: 0.92,
      side: DoubleSide,
      transparent: true,
      vertexColors: true,
    }),
  );
  perimeter.name = "garden-zone-perimeter";
  perimeter.renderOrder = 3;
  root.add(perimeter);

  const count = Math.max(1, placements.length);
  const bodyGeometry = new ConeGeometry(0.34, BUOY_HEIGHT, 5);
  bodyGeometry.translate(0, BUOY_HEIGHT / 2, 0);
  const buoyBodies = new InstancedMesh(
    bodyGeometry,
    new MeshStandardMaterial({ color: HARBOR_PALETTE.iron_dark, roughness: 0.8 }),
    count,
  );
  buoyBodies.name = "garden-zone-buoys";

  const lampGeometry = new OctahedronGeometry(0.17);
  lampGeometry.translate(0, BUOY_HEIGHT + 0.12, 0);
  const buoyLamps = new InstancedMesh(
    lampGeometry,
    new MeshBasicMaterial({ toneMapped: false }),
    count,
  );
  buoyLamps.name = "garden-zone-buoy-lamps";

  const matrix = new Matrix4();
  const dangerLampIndices: number[] = [];
  const lampBaseColors: Color[] = [];
  const scratchColor = new Color();
  for (const [index, buoy] of placements.entries()) {
    matrix.makeTranslation(buoy.worldX, 0, buoy.worldZ);
    buoyBodies.setMatrixAt(index, matrix);
    buoyLamps.setMatrixAt(index, matrix);
    // Push the lamp above the bloom threshold so it glows at night.
    scratchColor.copy(buoy.color).multiplyScalar(1.7);
    buoyLamps.setColorAt(index, scratchColor);
    lampBaseColors.push(buoy.color.clone());
    if (buoy.danger) dangerLampIndices.push(index);
  }
  if (placements.length === 0) {
    matrix.makeScale(0, 0, 0);
    buoyBodies.setMatrixAt(0, matrix);
    buoyLamps.setMatrixAt(0, matrix);
    buoyLamps.setColorAt(0, scratchColor.setRGB(0, 0, 0));
  }
  buoyBodies.instanceMatrix.needsUpdate = true;
  buoyLamps.instanceMatrix.needsUpdate = true;
  if (buoyLamps.instanceColor) buoyLamps.instanceColor.needsUpdate = true;
  root.add(buoyBodies, buoyLamps);

  return {
    buoyAnchors: placements.map((buoy) => ({ x: buoy.worldX, z: buoy.worldZ })),
    buoyBodies,
    buoyLamps,
    bobbing: false,
    dangerLampIndices,
    lampBaseColors,
    perimeter,
    root,
  };
}

const scratchLampColor = new Color();
const scratchBuoyMatrix = new Matrix4();
const scratchBuoyQuaternion = new Quaternion();
const scratchBuoyEuler = new Euler();
const scratchBuoyPosition = new Vector3();
const BUOY_UNIT_SCALE = new Vector3(1, 1, 1);

/**
 * Z3: CPU mirror of the water shader's sum-of-sines swell (`gardenWave` in
 * garden-water.ts) at mid tempo, so marker buoys ride the same sea the shader
 * draws. The plane's -90° X rotation maps world Z to negative water Y.
 */
function gardenSwellHeight(worldX: number, worldZ: number, timeSeconds: number): number {
  const px = worldX;
  const py = -worldZ;
  const speed = 0.72 + 0.5 * 0.38;
  const primary = Math.sin(px * 0.074 + py * 0.031 + timeSeconds * 0.17 * speed);
  const crossing = Math.sin(px * -0.042 + py * 0.083 - timeSeconds * 0.12 * speed);
  const longSwell = Math.sin(px * 0.018 + py * -0.027 + timeSeconds * 0.055 * speed);
  return primary * 0.5 + crossing * 0.3 + longSwell * 0.2;
}

/**
 * Danger buoys blink slowly at full tier so band colour is never the sole
 * cue, and every buoy bobs on the swell at balanced tier and above. Both
 * freeze to the rest pose under reduced motion or below balanced tier.
 *
 * The `tier` argument temporarily also accepts the legacy `fullTier` boolean
 * so the pre-integration world-renderer call site keeps compiling; the P2
 * orchestrator wiring passes `frame.renderScheduler.tier` directly.
 */
export function updateZoneBuoys(
  field: ZoneField,
  timeSeconds: number,
  reducedMotion: boolean,
  tier: PharosVilleRenderSchedulerTier | boolean,
): void {
  const tierName: PharosVilleRenderSchedulerTier = typeof tier === "boolean"
    ? (tier ? "full" : "constrained")
    : tier;
  const bobbing = !reducedMotion && (tierName === "full" || tierName === "balanced");
  if (bobbing || field.bobbing) {
    const time = bobbing ? Math.max(0, timeSeconds) : 0;
    for (const [index, anchor] of field.buoyAnchors.entries()) {
      const swell = bobbing ? gardenSwellHeight(anchor.x, anchor.z, time) : 0;
      let tiltX = 0;
      let tiltZ = 0;
      if (bobbing) {
        const sample = 0.9;
        tiltZ = (gardenSwellHeight(anchor.x - sample, anchor.z, time)
          - gardenSwellHeight(anchor.x + sample, anchor.z, time)) * BUOY_TILT;
        tiltX = (gardenSwellHeight(anchor.x, anchor.z + sample, time)
          - gardenSwellHeight(anchor.x, anchor.z - sample, time)) * BUOY_TILT;
      }
      scratchBuoyEuler.set(tiltX, 0, tiltZ);
      scratchBuoyQuaternion.setFromEuler(scratchBuoyEuler);
      scratchBuoyPosition.set(anchor.x, swell * BUOY_BOB_AMPLITUDE, anchor.z);
      scratchBuoyMatrix.compose(scratchBuoyPosition, scratchBuoyQuaternion, BUOY_UNIT_SCALE);
      field.buoyBodies.setMatrixAt(index, scratchBuoyMatrix);
      field.buoyLamps.setMatrixAt(index, scratchBuoyMatrix);
    }
    field.buoyBodies.instanceMatrix.needsUpdate = true;
    field.buoyLamps.instanceMatrix.needsUpdate = true;
    field.bobbing = bobbing;
  }

  const lamps = field.buoyLamps;
  if (!lamps.instanceColor || field.dangerLampIndices.length === 0) return;
  const blink = !reducedMotion && tierName === "full";
  for (const index of field.dangerLampIndices) {
    const base = field.lampBaseColors[index]!;
    const pulse = blink ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(timeSeconds * 1.6)) : 1;
    scratchLampColor.copy(base).multiplyScalar(1.7 * pulse);
    lamps.setColorAt(index, scratchLampColor);
  }
  lamps.instanceColor.needsUpdate = true;
}

export function createDangerWeather(area: AreaNode): GardenWeatherVisual {
  const root = new Group();
  setTilePosition(root, gardenAreaCenterTile(area), GARDEN_ZONE_ROOT_Y);
  const radius = zoneRadius(area);
  const radiusX = radius * ELLIPSE_X;
  const radiusZ = radius * ELLIPSE_Z;

  // Denser streaks than the old curtain, confined to the zone ellipse.
  const points: Vector3[] = [];
  for (let index = 0; index < 56; index += 1) {
    const spread = Math.sqrt(stableUnit(`rain-r.${area.id}.${index}`));
    const angle = stableUnit(`rain-a.${area.id}.${index}`) * Math.PI * 2;
    const x = Math.cos(angle) * spread * radiusX;
    const z = Math.sin(angle) * spread * radiusZ;
    const y = 1.4 + stableUnit(`rain-y.${area.id}.${index}`) * 7;
    points.push(
      new Vector3(x, y, z),
      new Vector3(x - 0.42, y - 2.1, z + 0.18),
    );
  }
  const streaks = new LineSegments(
    new BufferGeometry().setFromPoints(points),
    new LineBasicMaterial({
      color: HARBOR_PALETTE.lantern_cold,
      depthWrite: false,
      opacity: 0.2,
      transparent: true,
    }),
  );
  streaks.name = "danger-rain-curtain";
  root.add(streaks);

  // A wide faint additive quad above the zone for the occasional soft flicker.
  const flicker = new Mesh(
    new PlaneGeometry(radiusX * 2.1, radiusZ * 2.1),
    new MeshBasicMaterial({
      color: FLICKER_COLD,
      depthWrite: false,
      opacity: 0,
      toneMapped: false,
      transparent: true,
    }),
  );
  flicker.name = "danger-flicker";
  flicker.rotation.x = -Math.PI / 2;
  flicker.position.y = 5.2;
  flicker.renderOrder = 4;
  root.add(flicker);

  return {
    flicker,
    flickerPeriod: 9 + stableUnit(`rain-flicker.${area.id}`) * 5,
    phase: stableUnit(`rain-phase.${area.id}`),
    root,
    streaks,
  };
}

/**
 * Drive one danger squall for a frame: rain scroll (frozen under reduced
 * motion) and, at full tier only, a soft lantern-cold flicker that ramps over
 * ~0.4s every 9–14s. No hard strobe (accessibility).
 */
export function updateDangerWeather(
  effect: GardenWeatherVisual,
  timeSeconds: number,
  reducedMotion: boolean,
  fullTier: boolean,
): void {
  effect.streaks.position.y = reducedMotion
    ? 0
    : -((timeSeconds * 0.72 + effect.phase * 2) % 2);

  let opacity = 0;
  if (fullTier && !reducedMotion) {
    const period = effect.flickerPeriod;
    const cyclePos = (timeSeconds + effect.phase * period) % period;
    if (cyclePos < 0.4) opacity = Math.sin((cyclePos / 0.4) * Math.PI) * 0.16;
  }
  effect.flicker.material.opacity = opacity;
}
