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
import { setTilePosition, stableUnit, TILE_SCALE } from "./garden-util";
import { seaRegionBoundaryPoints, seaRegionIdForArea } from "../systems/garden-sea-regions";
import type { WeatherPlan } from "../systems/weather";

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



// W2.7 (tuned against the render): a partition does not stack, so these can
// exceed the old 0.04-0.20 ellipse values — but 0.32/0.44 read as UI paint
// rather than water. Character (swell/chop/foam/reflectivity) carries the
// signal; colour only has to make the region FINDABLE.
//
// Raised again after the world doubled: across 4x more sea, at whole-map
// framing, 0.17 left calm, watch and ledger reading as one undifferentiated
// blue. Data legibility is a pillar of the brief — a viewer has to be able to
// see where one body of water ends and the next begins.
//
// S1: raised again with the switch to theme-bridge WATER colours. The old
// ceiling existed because the tints were UI accents, which read as paint the
// moment they carried any weight. A cyan-blue, a teal and an ink are all water
// already, so they can be laid on at a strength that actually separates the
// bodies of water at whole-map framing.
//
// L3 (Sea Master): 0.44 -> 0.28, danger 0.54 -> 0.36.
//
// The old weights existed to force separation out of tints that were fighting
// the sea rather than belonging to it. Now that every ZONE_THEMES water base
// sits in the sea's own blue-green family and separates by LIGHTNESS, less
// weight reads as more: the day palette's jade ramp shows through, and the
// regions still part because value and character (swell, chop, foam,
// reflectivity) carry them. Laying a water colour on at 0.44 was what turned
// 43% of the sea cyan and buried the authored teal underneath it.
const REGION_TINT_STRENGTH_BAND = 0.18;
const REGION_TINT_STRENGTH_DANGER = 0.24;

const BUOY_HEIGHT = 0.72;
// Z3: buoys ride the water shader's swell (CPU mirror, see updateZoneBuoys).
// The shader's own displacement is sub-pixel at overview zoom, so the bob
// amplitude is exaggerated for legibility; phase and frequencies match the
// water exactly. Tilt converts the local swell gradient into a gentle lean.
const BUOY_BOB_AMPLITUDE = 0.22;
const BUOY_TILT = 1.2;
/**
 * R5: the anchor every band tint is pulled toward, so regions stay inside a
 * WATER gamut.
 *
 * This used to be deep_sea_2, which is nearly black — pulling toward it
 * darkened a band without rotating its hue, so alert stayed ochre, warning
 * stayed orange and danger stayed red. At the raised tint strengths that read
 * as concentric cream / mauve / pink / khaki bands and the sea looked like
 * mud. A mid BLUE anchor moves the hue into the sea's family while keeping
 * enough value for each band to stay findable; the rest of the separation is
 * carried by value and by the region's own swell, chop and foam (D6).
 */
const SEA_GAMUT_ANCHOR = new Color(HARBOR_PALETTE.shallow_teal_lit);

export interface ZoneTint {
  center: { x: number; z: number };
  color: Color;
  radiusX: number;
  radiusZ: number;
  /**
   * W2 / D5: which sea-region slot this band colours. The rendered footprint
   * is the terrain-derived region field, not this ellipse — the ellipse
   * survives only as the DOM label anchor and selection-cue extent.
   */
  regionId: number;
  strength: number;
}

export interface ZoneBuoyPlacement {
  areaDetailId: string;
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
  /** Area ownership in instance order, used to isolate analyze-mode markers. */
  buoyAreaDetailIds: readonly string[];
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
  /** Last per-area filter applied; null means every region. */
  visibleAreaDetailId: string | null;
}

export interface GardenWeatherVisual {
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

/**
 * S1 (2026-07-25): the colour a region's WATER is tinted, as distinct from the
 * band accent its buoys and DOM label carry.
 *
 * The tint used to be the band accent — a UI hue — pulled 0.5-0.62 of the way
 * to one shared mid-teal anchor. That anchor was introduced to stop the
 * accents reading as paint, and it worked, but pulling five different hues
 * toward a single point collapses them into each other: at whole-map framing
 * calm, watch, alert and ledger were one undifferentiated blue, which is the
 * operator's report that the sea zones need clarifying.
 *
 * `ZONE_THEMES[terrain].base` is already the theme bridge's WATER colour for
 * each terrain, and it is already a naturalistic ramp — cyan-blue calm, teal
 * watch, green alert, olive warning, ink storm, slate ledger. Using it means
 * no anchor collapse is needed: every region is inside a water gamut to begin
 * with, so hue AND value separate, and the invariant that zone colour comes
 * from the shared palette bridge is satisfied more directly than before.
 */
function zoneSeaColor(area: AreaNode): Color {
  const placement = area.riskPlacement
    ?? (area.band ? DEWS_AREA_PLACEMENTS[area.band] : "safe-harbor");
  const definition = riskWaterAreaForPlacement(placement);
  return new Color(zoneThemeForTerrain(definition.terrain).base);
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

  // W2.8: the dashed ellipse perimeter is gone. It traced an ellipse that no
  // longer matches anything — the region field draws the real footprint, and
  // W2.6's boundary foam line draws its edge. Keeping both meant two
  // contradictory outlines for the same body of water. An empty perimeter
  // keeps the merged-mesh plumbing (and its dispose path) intact.
  const perimeter: PerimeterMesh = { colors: [], positions: [] };

  // W2.8: buoys mark the REAL region boundary now, not an ellipse that had
  // nothing to do with where the region actually was. This is the positional
  // (non-colour) encoding the accessibility contract requires, finally
  // pointing at the true edge.
  const regionId = seaRegionIdForArea(area);
  // A few stable landmarks communicate the real boundary without carpeting
  // the explore/analyze views in dark cones. The water seam and DOM record
  // carry the continuous outline; buoys provide the non-colour positional cue.
  const buoyCount = Math.max(3, Math.min(8, Math.round(circumference / 24)));
  const buoys: ZoneBuoyPlacement[] = seaRegionBoundaryPoints(regionId, buoyCount)
    .map((tile) => ({
      areaDetailId: area.detailId,
      color: bandColor,
      danger,
      worldX: tile.x * TILE_SCALE,
      worldZ: tile.y * TILE_SCALE,
    }));

  // S1: the water tint is the theme bridge's water colour for this terrain, not
  // the band accent. No pull toward a shared anchor — see zoneSeaColor for why
  // that anchor was what flattened the regions into one another. A light lift
  // toward the sea gamut keeps the darkest band from punching a hole in the
  // surface at dusk.
  const tintColor = zoneSeaColor(area);
  if (danger) tintColor.lerp(SEA_GAMUT_ANCHOR, 0.18);

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
      regionId: seaRegionIdForArea(area),
      // W2.7: a partition does not stack, so a region can tint at a strength
      // that actually reads (the old 0.04-0.20 range existed only because six
      // ellipses overlapped). Danger keeps a touch more weight.
      strength: danger ? REGION_TINT_STRENGTH_DANGER : REGION_TINT_STRENGTH_BAND,
    },
  };
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
  const bodyGeometry = new ConeGeometry(0.2, BUOY_HEIGHT, 6);
  bodyGeometry.translate(0, BUOY_HEIGHT / 2, 0);
  const buoyBodies = new InstancedMesh(
    bodyGeometry,
    new MeshStandardMaterial({ color: HARBOR_PALETTE.stone_mid, roughness: 0.88 }),
    count,
  );
  buoyBodies.name = "garden-zone-buoys";

  const lampGeometry = new OctahedronGeometry(0.12);
  lampGeometry.translate(0, BUOY_HEIGHT + 0.08, 0);
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
    buoyAreaDetailIds: placements.map((buoy) => buoy.areaDetailId),
    buoyAnchors: placements.map((buoy) => ({ x: buoy.worldX, z: buoy.worldZ })),
    buoyBodies,
    buoyLamps,
    bobbing: false,
    dangerLampIndices,
    lampBaseColors,
    perimeter,
    root,
    visibleAreaDetailId: null,
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
  visibleAreaDetailId: string | null = null,
): void {
  // S1: callers resolve `tier` through `seaQualityTier`, so a camera drag no
  // longer counts as load pressure here — reading the raw tier froze every
  // marker buoy mid-swell and stopped the danger lamps the moment the camera
  // moved.
  const tierName: PharosVilleRenderSchedulerTier = typeof tier === "boolean"
    ? (tier ? "full" : "constrained")
    : tier;
  const bobbing = !reducedMotion && (tierName === "full" || tierName === "balanced");
  const filterChanged = visibleAreaDetailId !== field.visibleAreaDetailId;
  if (bobbing || field.bobbing || filterChanged) {
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
      if (
        visibleAreaDetailId !== null
        && field.buoyAreaDetailIds[index] !== visibleAreaDetailId
      ) {
        scratchBuoyMatrix.makeScale(0, 0, 0);
      } else {
        scratchBuoyMatrix.compose(scratchBuoyPosition, scratchBuoyQuaternion, BUOY_UNIT_SCALE);
      }
      field.buoyBodies.setMatrixAt(index, scratchBuoyMatrix);
      field.buoyLamps.setMatrixAt(index, scratchBuoyMatrix);
    }
    field.buoyBodies.instanceMatrix.needsUpdate = true;
    field.buoyLamps.instanceMatrix.needsUpdate = true;
    field.bobbing = bobbing;
    field.visibleAreaDetailId = visibleAreaDetailId;
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

  return {
    phase: stableUnit(`rain-phase.${area.id}`),
    root,
    streaks,
  };
}

/**
 * Drive one danger squall for a frame. Rain scrolls gently and freezes under
 * reduced motion. The former full-zone flash plane was removed: a large
 * luminance pulse looked like a renderer fault, while rain plus the risk body
 * and DOM record already communicate the same warning.
 *
 * Phase 2 weather: the fall slants downwind (up to ~30° at full gale), the
 * scroll quickens and the streaks thicken as the storm builds. The slant is
 * world state, not motion — the reduced-motion still frame keeps it, so a
 * storm reads as a storm even in the static composition.
 */
export function updateDangerWeather(
  effect: GardenWeatherVisual,
  timeSeconds: number,
  reducedMotion: boolean,
  _fullTier: boolean,
  weather?: WeatherPlan,
): void {
  const stormLevel = weather?.stormLevel ?? 0;
  effect.streaks.position.y = reducedMotion
    ? 0
    : -((timeSeconds * (0.72 + stormLevel * 1.1) + effect.phase * 2) % 2);
  // Tip the fall downwind. The streaks run mostly -Y, so a rotation about Z
  // leans them along world X and a rotation about X leans them along -Z.
  const slant = (weather?.windSpeed ?? 0) * 0.42 + stormLevel * 0.14;
  effect.streaks.rotation.x = -(weather?.windDirZ ?? 0) * slant;
  effect.streaks.rotation.z = (weather?.windDirX ?? 0) * slant;
  effect.streaks.material.opacity = 0.2 + stormLevel * 0.3;
}
