import {
  BufferGeometry,
  Color,
  ConeGeometry,
  DoubleSide,
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
  Vector3,
} from "three";
import {
  GARDEN_ZONE_ROOT_Y,
  gardenAreaDisplayTile,
} from "../systems/garden-observatory-slice";
import {
  DEWS_AREA_PLACEMENTS,
  riskWaterAreaForPlacement,
} from "../systems/risk-water-areas";
import { HARBOR_PALETTE, zoneThemeForTerrain } from "../systems/palette";
import type { AreaNode } from "../systems/world-types";
import { setTilePosition, stableUnit } from "./garden-util";

// The zone ellipse's world semi-axes relative to the base radius. These match
// the historic `root.scale` (x = 1.25·r, z = 0.76·r) so the selection-cue
// contract (`entityCues` reads `zone.root`) and the DOM label placement stay
// put while the filled disc is replaced by a charted perimeter.
const ELLIPSE_X = 1.25;
const ELLIPSE_Z = 0.76;

// The dashed perimeter is the primary marker; brightness (not alpha, since all
// zones share one merged material) encodes band escalation — danger strongest.
const PERIMETER_STRENGTH: Record<string, number> = {
  DANGER: 1,
  WARNING: 0.82,
  ALERT: 0.68,
  WATCH: 0.55,
  CALM: 0.48,
};
const PERIMETER_STRENGTH_DEFAULT = 0.6;

// In-water tint strength per band (subtle: danger is a brooding patch, not a
// paint spill). Kept ≤ 0.25 so DOM labels stay legible over the water.
const TINT_STRENGTH: Record<string, number> = {
  DANGER: 0.22,
  WARNING: 0.15,
  ALERT: 0.12,
  WATCH: 0.1,
  CALM: 0.08,
};
const TINT_STRENGTH_DEFAULT = 0.1;

const PERIMETER_SEGMENTS = 56;
const BUOY_HEIGHT = 1.1;
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
  buoyBodies: InstancedMesh;
  buoyLamps: InstancedMesh;
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

function zoneRadius(area: AreaNode): number {
  return 5.2 + Math.min(3.8, Math.sqrt(Math.max(1, area.count ?? 1)) * 0.78);
}

function zoneBandColor(area: AreaNode): Color {
  const placement = area.riskPlacement
    ?? (area.band ? DEWS_AREA_PLACEMENTS[area.band] : "safe-harbor");
  const definition = riskWaterAreaForPlacement(placement);
  const theme = zoneThemeForTerrain(definition.terrain);
  return new Color(theme.label.accent);
}

export function createZone(area: AreaNode): ZoneVisual {
  const danger = area.band === "DANGER";
  const radius = zoneRadius(area);
  const root = new Group();
  setTilePosition(root, gardenAreaDisplayTile(area), GARDEN_ZONE_ROOT_Y);
  // Preserve the historic root scale so the selection-cue contract is unchanged.
  root.scale.set(radius * ELLIPSE_X, 1, radius * ELLIPSE_Z);

  const centerX = root.position.x;
  const centerZ = root.position.z;
  const radiusX = radius * ELLIPSE_X;
  const radiusZ = radius * ELLIPSE_Z;
  const bandColor = zoneBandColor(area);

  const perimeter = buildBrokenPerimeter(
    area,
    centerX,
    centerZ,
    radiusX,
    radiusZ,
    bandColor,
  );

  const buoyCount = Math.max(
    4,
    Math.min(6, 4 + Math.round(((radius - 5.2) / 3.8) * 2)),
  );
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
): PerimeterMesh {
  const strength = (area.band && PERIMETER_STRENGTH[area.band])
    ?? PERIMETER_STRENGTH_DEFAULT;
  const r = color.r * strength;
  const g = color.g * strength;
  const b = color.b * strength;
  const seed = stableUnit(`zone-arc.${area.id}`);
  // Slightly thicker than the historic hairline rings so it reads as the
  // primary charted marker.
  const inner = 0.955;
  const outer = 1.012;
  const positions: number[] = [];
  const colors: number[] = [];
  for (let segment = 0; segment < PERIMETER_SEGMENTS; segment += 1) {
    const progress = (segment / PERIMETER_SEGMENTS + seed * 0.24) % 1;
    const visible = (progress > 0.06 && progress < 0.42)
      || (progress > 0.54 && progress < 0.83);
    if (!visible) continue;
    const a0 = (segment / PERIMETER_SEGMENTS) * Math.PI * 2;
    const a1 = ((segment + 1) / PERIMETER_SEGMENTS) * Math.PI * 2;
    const points = [
      [Math.cos(a0) * inner, Math.sin(a0) * inner],
      [Math.cos(a0) * outer, Math.sin(a0) * outer],
      [Math.cos(a1) * inner, Math.sin(a1) * inner],
      [Math.cos(a1) * outer, Math.sin(a1) * outer],
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
 * emissive lamp). Buoys, not fill, carry the zone read; danger lamps also blink
 * so colour is never the only encoding.
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
    buoyBodies,
    buoyLamps,
    dangerLampIndices,
    lampBaseColors,
    perimeter,
    root,
  };
}

const scratchLampColor = new Color();

/**
 * Danger buoys blink slowly at full tier so band colour is never the sole cue.
 * Frozen (steady lamp) under reduced motion or below full tier.
 */
export function updateZoneBuoys(
  field: ZoneField,
  timeSeconds: number,
  reducedMotion: boolean,
  fullTier: boolean,
): void {
  const lamps = field.buoyLamps;
  if (!lamps.instanceColor || field.dangerLampIndices.length === 0) return;
  const blink = !reducedMotion && fullTier;
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
  setTilePosition(root, gardenAreaDisplayTile(area), GARDEN_ZONE_ROOT_Y);
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
