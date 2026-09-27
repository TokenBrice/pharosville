import { Box3, Color, DataTexture, FloatType, RGBAFormat, MeshStandardMaterial } from "three";
import type {
  PharosVilleRenderSchedulerState,
  TextureOwnerManifestEntry,
} from "../renderer/render-types";
import { gardenSkyToday, gardenSolarElevationAt, type GardenSkyDay } from "../systems/sky-almanac";
import { chainGardenMaterialPatch } from "./garden-aerial";

export interface GardenKeeperRitual {
  active: boolean;
  progress: number;
  direction: "evening" | "dawn";
}

/**
 * Contract H-A — the kindling seam. Every kindled fixture multiplies its
 * day-cycle emissive by one kindle factor, `gardenLanternKindleFactor(order,
 * progress, window)`: `order` is the fixture's place in the evening
 * (`GARDEN_KINDLE_ORDER`), `progress` the ring's kindling in the same units,
 * and a fixture is half lit when the progress passes its order, fading over
 * `window`. The default clock follows the sun below the horizon
 * (`gardenDefaultKindleProgress`), so without a ritual the lamps catch one
 * after another as blue hour deepens and bank in reverse at dawn. W5's keeper
 * (K20) installs its own clock (`setGardenLanternKindleClock`) that walks the
 * same order in minutes. Whatever the clock does, the progress and window the
 * fixtures see are eased (≥ 1.5 s through any fixture's window), so a clock
 * change never pops a lamp; reduced motion rests on the clock's value.
 */
export interface GardenLanternKindleTarget {
  progress: number;
  window: number;
}
/** Receives the default (sun-driven) progress; returns the target the fixtures ease toward. */
export type GardenLanternKindleClock = (defaultProgress: number) => GardenLanternKindleTarget;

/** The default fade width in order units: at the sun's pace, several minutes per fixture. */
export const GARDEN_KINDLE_WINDOW = 0.2;
/** Every fixture's fade takes at least this long, whatever the clock does. */
export const GARDEN_KINDLE_MIN_FADE_SECONDS = 1.5;
/** Progress below every fixture / above every fixture at the default window. */
export const GARDEN_KINDLE_DARK = -0.15;
export const GARDEN_KINDLE_LIT = 1.15;

/**
 * K20's order, one ladder for every kindled fixture: the keeper leaves the
 * chaseki (its eave lantern first), passes the landing lantern, climbs the
 * tower (three stair embers, low to high), the lantern catches, the station
 * lanterns kindle outward by distance (their shoji a step behind), and the
 * engawa tōrō beside the viewer lights last.
 */
export const GARDEN_KINDLE_ORDER = {
  chasekiLantern: 0.02,
  landingLantern: 0.08,
  stairEmbers: [0.14, 0.18, 0.22],
  lantern: 0.28,
  stationNearest: 0.34,
  stationFarthest: 0.9,
  shojiLag: 0.04,
  toro: 1,
} as const;

/**
 * The sun's kindling, in order units: dark until the sun is 1.8° down (the
 * scored kindling starts by then, so the keeper walks ahead of it), the
 * island and the tower through the next 1.8° (≈ 9 min, so the belt hour keeps
 * its lit stair and caught lantern), then the ring outward to the tōrō by
 * −11°. Symmetric in elevation, so dawn banks the same order in reverse.
 */
export function gardenDefaultKindleProgress(hour: number, day: GardenSkyDay = gardenSkyToday()): number {
  const depth = -gardenSolarElevationAt(day, hour) * (180 / Math.PI);
  const tower = GARDEN_KINDLE_ORDER.lantern + 0.02;
  if (depth <= 1.8) return GARDEN_KINDLE_DARK;
  if (depth <= 3.6) return GARDEN_KINDLE_DARK + (tower - GARDEN_KINDLE_DARK) * (depth - 1.8) / 1.8;
  return tower + (GARDEN_KINDLE_LIT - tower) * Math.min(1, (depth - 3.6) / 7.4);
}

const defaultKindleClock: GardenLanternKindleClock = (progress) => ({ progress, window: GARDEN_KINDLE_WINDOW });
let kindleClock = defaultKindleClock;
/** One uniform pair shared by every kindled program: a single write per frame. */
const kindleProgress = { value: GARDEN_KINDLE_DARK };
const kindleWindow = { value: GARDEN_KINDLE_WINDOW };
let kindleEased = false;

/** Installs the ritual's clock; `null` restores the sun's default. */
export function setGardenLanternKindleClock(clock: GardenLanternKindleClock | null): void {
  kindleClock = clock ?? defaultKindleClock;
}

/**
 * Once per frame, with the wall-clock hour. The first call (and every
 * reduced-motion call) rests on the target; otherwise the window eases on a
 * 0.5 s time constant and the progress moves at most one window per
 * `GARDEN_KINDLE_MIN_FADE_SECONDS`.
 */
export function updateGardenLanternKindling(hour: number, deltaSeconds: number, reducedMotion = false): void {
  const target = kindleClock(gardenDefaultKindleProgress(hour));
  const window = Math.max(0.005, target.window);
  if (!kindleEased || reducedMotion) {
    kindleEased = true;
    kindleProgress.value = target.progress;
    kindleWindow.value = window;
    return;
  }
  const dt = Math.min(0.25, Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  kindleWindow.value += (window - kindleWindow.value) * (1 - Math.exp(-dt / 0.5));
  const step = (kindleWindow.value / GARDEN_KINDLE_MIN_FADE_SECONDS) * dt;
  const delta = target.progress - kindleProgress.value;
  kindleProgress.value += Math.max(-step, Math.min(step, delta));
}

/** The progress and window every kindled fixture sees this frame. */
export function gardenLanternKindleState(): GardenLanternKindleTarget {
  return { progress: kindleProgress.value, window: kindleWindow.value };
}

/** CPU mirror of the shader's per-fixture factor. */
export function gardenLanternKindleFactor(order: number, progress: number, window = GARDEN_KINDLE_WINDOW): number {
  const t = Math.max(0, Math.min(1, (progress - order) / window + 0.5));
  return t * t * (3 - 2 * t);
}

const KINDLE_FACTOR_GLSL = `uniform float uGardenKindleProgress;
uniform float uGardenKindleWindow;
float gardenKindleFactor(float order) {
  return smoothstep(order - 0.5 * uGardenKindleWindow, order + 0.5 * uGardenKindleWindow, uGardenKindleProgress);
}`;

/** Binds the shared kindle uniforms and the factor function into a shader (idempotent per program). */
export function bindGardenKindleUniforms(shader: { uniforms: Record<string, { value: unknown }>; fragmentShader: string }): void {
  shader.uniforms.uGardenKindleProgress = kindleProgress;
  shader.uniforms.uGardenKindleWindow = kindleWindow;
  if (!shader.fragmentShader.includes("float gardenKindleFactor(")) {
    shader.fragmentShader = `${KINDLE_FACTOR_GLSL}\n${shader.fragmentShader}`;
  }
}

/**
 * Kindles a shared fixture material. `order` is one constant for the whole
 * material, or `"attribute"`: a float `aKindleOrder` per vertex or per
 * instance (station lanterns, shoji and the island lanterns carry their own).
 */
export function patchGardenLanternKindling(material: MeshStandardMaterial, order: number | "attribute"): void {
  const perVertex = order === "attribute";
  chainGardenMaterialPatch(material, {
    key: perVertex ? "garden-kindle-attribute-v2" : `garden-kindle-v2-${order.toFixed(4)}`,
    compile: (shader) => {
      if (perVertex) {
        shader.vertexShader = `attribute float aKindleOrder;\nvarying float vKindleOrder;\n${shader.vertexShader}`
          .replace("#include <begin_vertex>", "#include <begin_vertex>\nvKindleOrder = aKindleOrder;");
      }
      shader.fragmentShader = `${perVertex ? "varying float vKindleOrder;\n" : ""}${shader.fragmentShader}`
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance *= gardenKindleFactor(${perVertex ? "vKindleOrder" : order.toFixed(4)});`);
      bindGardenKindleUniforms(shader);
    },
  });
}

/**
 * Linear luminance of the engawa tōrō's lit chamber at full night: an ember
 * beside the viewer, below the harbour lantern cores (2.7) and far below the
 * beacon, so the night keeps one dominant light.
 */
export const GARDEN_TORO_NIGHT_LUMINANCE = 1.8;

/**
 * W0.9: the engawa tōrō is a kindled fixture, not an always-lit box. Its fire
 * chamber is merged into a shared static draw as a dark hollow; this patch
 * adds `ember` emission only to fragments inside `chamber` (geometry space),
 * scaled by the kindle factor at order 1: beside the viewer, it lights last
 * (K20) and banks first at dawn. No draw and no attribute.
 */
export function patchGardenToroKindling(material: MeshStandardMaterial, chamber: Box3, ember: Color): void {
  const luminance = ember.r * 0.2126 + ember.g * 0.7152 + ember.b * 0.0722;
  const toroEmber = { value: ember.clone().multiplyScalar(GARDEN_TORO_NIGHT_LUMINANCE / luminance) };
  // A hair of slack so the chamber's own faces, which lie exactly on the
  // bounds, pass the containment test despite interpolation error.
  const toroMin = { value: chamber.min.clone().subScalar(0.005) };
  const toroMax = { value: chamber.max.clone().addScalar(0.005) };
  const previousCompile = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previousCompile.call(material, shader, renderer);
    shader.uniforms.uToroEmber = toroEmber;
    shader.uniforms.uToroMin = toroMin;
    shader.uniforms.uToroMax = toroMax;
    shader.vertexShader = `varying vec3 vToroPosition;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvToroPosition = transformed;");
    shader.fragmentShader = `uniform vec3 uToroEmber;\nuniform vec3 uToroMin;\nuniform vec3 uToroMax;\nvarying vec3 vToroPosition;\n${shader.fragmentShader}`
      .replace("#include <emissivemap_fragment>", `
      #include <emissivemap_fragment>
      {
        vec3 toroInside = step(uToroMin, vToroPosition) * step(vToroPosition, uToroMax);
        totalEmissiveRadiance += uToroEmber
          * (toroInside.x * toroInside.y * toroInside.z * gardenKindleFactor(${GARDEN_KINDLE_ORDER.toro.toFixed(1)}));
      }
    `);
    bindGardenKindleUniforms(shader);
  };
  material.customProgramCacheKey = () => `${previousKey}:toro-kindling-v3`;
  material.needsUpdate = true;
}

/**
 * Shared light-lane registry: every warm light that should lay a reflection
 * lane on the sea (beacon, ship lanterns, dock lamps, buoys, memorial
 * lanterns) registers here. The water shader samples the packed DataTexture;
 * callers never talk to the shader directly. The per-tier lane cap is policy
 * owned by this module, not by callers.
 *
 * Phase 4 (Breathtaking Rendering, item 3): a fourth kind — "route". A route
 * lane is a SEGMENT (worldX/worldZ → route.x/route.z) rather than a point,
 * and the water shader scrolls emissive pulses along it: the Cerebrium
 * "nothing moves" trick for the busiest trade routes. Pulse speed and phase
 * are seeded from the lane id (deterministic, never Math.random), so callers
 * supply only the two endpoints and an intensity.
 */
export type GardenLightLaneKind = "beacon" | "lantern" | "buoy" | "route";

export interface GardenLightLane {
  color: string;
  id: string;
  intensity: number;
  kind: GardenLightLaneKind;
  worldX: number;
  worldZ: number;
  /** Route lanes only: the segment's far endpoint in world XZ. */
  route?: { x: number; z: number };
  /**
   * A night-kindled fixture (the engawa tōrō): the pool is scaled by the
   * clock's night beat, and stands down entirely while the lamp is dark, so
   * no reflection ever outlives its lamp.
   */
  kindledAtNight?: boolean;
}

/**
 * Texture capacity — the packing layout the water shader is compiled against.
 * It is NOT the night's light budget; see `GARDEN_LANE_BUDGET_FOR_TIER`.
 */
export const MAX_GARDEN_LIGHT_LANES = 48;

/**
 * W3.1 (The Great Quieting) — the night's light hierarchy, enforced here
 * because this registry is where every reflection on the sea is authored.
 *
 * ONE dominant light (the beacon) and ONE secondary (the moon road, which the
 * water shader owns and this module never touches). Everything else is an
 * EMBER: present, warm, and subordinate. Three policies carry that:
 *
 *  1. `GARDEN_LANE_BUDGET_FOR_TIER` — how many pools may burn at once. The
 *     full tier used to pack the whole 48-texel texture; forty-plus pools over
 *     one harbour is a marina at festival, not a lighthouse over dark water.
 *  2. `GARDEN_LANE_EMBER_GAIN` — a global brightness step on the decorative
 *     kinds. Beacon and route lanes are exempt: the beacon IS the hierarchy's
 *     top, and route pulses carry a reading (see 3).
 *  3. `GARDEN_EMBER_LANE_MIN_SEPARATION` — pools closer than their own
 *     falloff merge into one pale disc, which is how the sea went milky. The
 *     dimmer of two crowded lanes stands down; its lamp still burns on land.
 *
 * Route pulses are DATA (the busiest harbours by held value). Their reading is
 * never dimmed and never spatially thinned — it is capped in SIMULTANEITY and
 * rotated, which is a viewing condition: every route still takes its turn.
 */
const GARDEN_LANE_BUDGET_FOR_TIER: Record<PharosVilleRenderSchedulerState["tier"], number> = {
  full: 16,
  balanced: 10,
  interaction: 10,
  recovery: 5,
  constrained: 3,
};

/**
 * Ember gain per lane kind. Multiplies the caller's day-cycle
 * `intensityScale`, so it demotes the pools without touching the lamps,
 * the lit windows, or any lane's relative ordering — a dangerous buoy still
 * out-reads a calm one, a titan still out-reads a standard hull.
 */
export const GARDEN_LANE_EMBER_GAIN: Record<GardenLightLaneKind, number> = {
  beacon: 1,
  route: 1,
  lantern: 0.38,
  buoy: 0.38,
};

/**
 * World units. The shader's pool is `exp(-distSq / 24)` — it falls to 1/e at
 * ~4.9 units — so two ember lanes inside this radius are painting one disc
 * between them. The brighter one keeps it.
 */
export const GARDEN_EMBER_LANE_MIN_SEPARATION = 8.5;

/** How many route pulses may run at once. Registered routes above this rotate. */
const ROUTE_RESERVE_FOR_TIER: Record<PharosVilleRenderSchedulerState["tier"], number> = {
  full: 4,
  balanced: 3,
  interaction: 3,
  recovery: 2,
  constrained: 1,
};

/**
 * Rotation period for the route-pulse cap, in seconds. Long enough that a
 * viewer reads a still harbour rather than a shuffling one; a full turn of
 * every registered route is a matter of minutes, at garden tempo.
 */
export const GARDEN_ROUTE_PULSE_ROTATION_SECONDS = 90;

/**
 * Clock for the route-pulse rotation. Absent (or reduced motion), the
 * selection holds at window 0 — a complete, deterministic, static composition,
 * identical on every reload. `night` is the wall-clock night beat (0..1) that
 * kindles `kindledAtNight` lanes; absent, those lanes count as lit.
 */
export interface GardenLaneClock {
  night?: number;
  reducedMotion?: boolean;
  timeSeconds: number;
}

export interface GardenLaneRegistry {
  /**
   * Packed lanes, 3 rows of RGBA-float texels:
   * row 0 = (worldX, worldZ, intensity, kind), row 1 = (r, g, b, active),
   * row 2 = route lanes only: (endX, endZ, pulseSpeed, pulsePhase).
   */
  readonly texture: DataTexture;
  /** The lane DataTexture is sampled by water, not owned by a mesh material. */
  getTextureManifest: () => readonly TextureOwnerManifestEntry[];
  readonly activeLaneCount: number;
  /**
   * Bounding circle (world XZ) of the active lanes, inflated by the shader's
   * 30-unit hard cull: outside it every lane contributes exactly zero, so the
   * water fragment can skip the whole loop coherently with identical output.
   */
  fieldBounds(): { centerX: number; centerZ: number; radius: number };
  clear(): void;
  dispose(): void;
  remove(id: string): void;
  set(lane: GardenLightLane): void;
  /**
   * Re-pack the texture for the tier's lane budget. Returns the active count.
   * `intensityScale` is the day-cycle gate: reflection pools are lantern
   * light, so the caller scales them down by day (near zero) and up at dusk/
   * night; without it the overlapping full-tier pools cross the bloom knee
   * and flood the frame. `clock` drives the route-pulse rotation and the
   * night kindling of `kindledAtNight` lanes, and is a pure input — the same
   * clock always packs the same texture.
   */
  sync(
    tier: PharosVilleRenderSchedulerState["tier"],
    intensityScale?: number,
    clock?: GardenLaneClock,
  ): number;
}

export function createGardenLaneRegistry(): GardenLaneRegistry {
  const lanes = new Map<string, GardenLightLane>();
  const data = new Float32Array(MAX_GARDEN_LIGHT_LANES * 3 * 4);
  const texture = new DataTexture(
    data,
    MAX_GARDEN_LIGHT_LANES,
    3,
    RGBAFormat,
    FloatType,
  );
  texture.needsUpdate = true;
  const textureManifest: readonly TextureOwnerManifestEntry[] = [
    { owner: "garden-lanterns.lane-data", texture },
  ];
  const scratchColor = new Color();
  let activeLaneCount = 0;
  let dirty = true;
  let lastCap = -1;
  let lastScale = -1;
  let lastRotation = -1;
  let lastKindle = -1;
  // Bounding circle of the packed lanes (+ the shader's 30-unit cull reach);
  // recomputed inside sync whenever the pack changes.
  let fieldCenterX = 0;
  let fieldCenterZ = 0;
  let fieldRadius = 0;

  return {
    get activeLaneCount() {
      return activeLaneCount;
    },
    texture,
    getTextureManifest() {
      return textureManifest;
    },
    fieldBounds() {
      return { centerX: fieldCenterX, centerZ: fieldCenterZ, radius: fieldRadius };
    },
    clear() {
      lanes.clear();
      dirty = true;
    },
    dispose() {
      texture.dispose();
    },
    remove(id) {
      if (lanes.delete(id)) dirty = true;
    },
    set(lane) {
      const existing = lanes.get(lane.id);
      lanes.set(lane.id, lane);
      if (
        !existing
        || existing.worldX !== lane.worldX
        || existing.worldZ !== lane.worldZ
        || existing.intensity !== lane.intensity
        || existing.color !== lane.color
        || existing.kind !== lane.kind
        || existing.route?.x !== lane.route?.x
        || existing.route?.z !== lane.route?.z
        || existing.kindledAtNight !== lane.kindledAtNight
      ) {
        dirty = true;
      }
    },
    sync(tier, intensityScale = 1, clock) {
      const cap = Math.min(GARDEN_LANE_BUDGET_FOR_TIER[tier], MAX_GARDEN_LIGHT_LANES);
      const rotation = routeRotationWindow(clock);
      const kindle = Math.min(1, Math.max(0, clock?.night ?? 1));
      if (
        !dirty
        && cap === lastCap
        && intensityScale === lastScale
        && rotation === lastRotation
        && kindle === lastKindle
      ) {
        return activeLaneCount;
      }

      const active = selectActiveLanes(
        [...lanes.values()].filter((lane) => !lane.kindledAtNight || kindle > 0),
        tier,
        cap,
        rotation,
      );
      data.fill(0);
      for (const [index, lane] of active.entries()) {
        const header = index * 4;
        data[header] = lane.worldX;
        data[header + 1] = lane.worldZ;
        data[header + 2] = lane.intensity * intensityScale * GARDEN_LANE_EMBER_GAIN[lane.kind]
          * (lane.kindledAtNight ? kindle : 1);
        data[header + 3] = laneKindCode(lane.kind);
        scratchColor.set(lane.color);
        const body = (MAX_GARDEN_LIGHT_LANES + index) * 4;
        data[body] = scratchColor.r;
        data[body + 1] = scratchColor.g;
        data[body + 2] = scratchColor.b;
        data[body + 3] = 1;
        if (lane.kind === "route" && lane.route) {
          // Pulse speed/phase are seeded from the lane id: per-route
          // variation, deterministic across sessions, zero caller burden.
          const routeRow = (MAX_GARDEN_LIGHT_LANES * 2 + index) * 4;
          data[routeRow] = lane.route.x;
          data[routeRow + 1] = lane.route.z;
          data[routeRow + 2] = 0.05 + stableUnit(`${lane.id}.pulse-speed`) * 0.09;
          data[routeRow + 3] = stableUnit(`${lane.id}.pulse-phase`);
        }
      }
      texture.needsUpdate = true;
      activeLaneCount = active.length;
      dirty = false;
      lastCap = cap;
      lastScale = intensityScale;
      lastRotation = rotation;
      lastKindle = kindle;
      // Centroid + max reach so the water can skip the lane loop wholesale for
      // fragments that no active lane can touch (the shader hard-culls at 30
      // world units, so this bound is output-identical). Route lanes pull the
      // bound out to their far endpoint as well.
      if (active.length > 0) {
        let sumX = 0;
        let sumZ = 0;
        for (const lane of active) {
          sumX += lane.worldX;
          sumZ += lane.worldZ;
        }
        fieldCenterX = sumX / active.length;
        fieldCenterZ = sumZ / active.length;
        let reach = 0;
        for (const lane of active) {
          reach = Math.max(
            reach,
            Math.hypot(lane.worldX - fieldCenterX, lane.worldZ - fieldCenterZ),
            lane.route
              ? Math.hypot(lane.route.x - fieldCenterX, lane.route.z - fieldCenterZ)
              : 0,
          );
        }
        fieldRadius = reach + 30;
      } else {
        fieldRadius = 0;
      }
      return activeLaneCount;
    },
  };
}

function selectActiveLanes(
  lanes: readonly GardenLightLane[],
  tier: PharosVilleRenderSchedulerState["tier"],
  cap: number,
  rotation: number,
): GardenLightLane[] {
  const ranked = lanes.toSorted((left, right) => (
    lanePriority(right) - lanePriority(left)
    || left.id.localeCompare(right.id)
  ));
  const beacons = ranked.filter((lane) => lane.kind === "beacon").slice(0, cap);
  const routeCapacity = Math.max(
    0,
    Math.min(ROUTE_RESERVE_FOR_TIER[tier], cap - beacons.length),
  );
  const routes = rotateRoutePulses(
    ranked.filter((lane) => lane.kind === "route"),
    routeCapacity,
    rotation,
  );
  const reservedIds = new Set([...beacons, ...routes].map((lane) => lane.id));
  const emberBudget = cap - beacons.length - routes.length;
  const embers: GardenLightLane[] = [];
  // Ember lanes are admitted brightest-first, and only where they are not
  // already inside another ember's pool: a crowd of pools reads as one pale
  // disc, so the crowd is what gets thinned, never the light's brightness.
  for (const lane of ranked) {
    if (embers.length >= emberBudget) break;
    if (reservedIds.has(lane.id)) continue;
    // A route that lost this rotation stays dark until its turn: filling the
    // ember budget with it would hand back the simultaneity the cap took.
    if (lane.kind === "route" || lane.kind === "beacon") continue;
    if (embers.some((kept) => (
      (kept.worldX - lane.worldX) ** 2 + (kept.worldZ - lane.worldZ) ** 2
        < GARDEN_EMBER_LANE_MIN_SEPARATION ** 2
    ))) {
      continue;
    }
    embers.push(lane);
  }
  return [...beacons, ...routes, ...embers];
}

/**
 * The route-pulse cap as a viewing condition: at most `capacity` of the
 * registered routes pulse at once, and which ones rotates on the clock so no
 * route is permanently unlit. A pure function of (routes, capacity, window) —
 * the same three always return the same lanes, in the same order.
 */
function rotateRoutePulses(
  routes: readonly GardenLightLane[],
  capacity: number,
  rotation: number,
): GardenLightLane[] {
  if (capacity <= 0) return [];
  if (routes.length <= capacity) return [...routes];
  const offset = ((rotation % routes.length) + routes.length) % routes.length;
  return Array.from(
    { length: capacity },
    (_, index) => routes[(offset + index) % routes.length]!,
  );
}

/** Which rotation window the clock is in; 0 whenever there is no motion. */
function routeRotationWindow(clock: GardenLaneClock | undefined): number {
  if (!clock || clock.reducedMotion || !Number.isFinite(clock.timeSeconds)) return 0;
  return Math.floor(clock.timeSeconds / GARDEN_ROUTE_PULSE_ROTATION_SECONDS);
}

function laneKindCode(kind: GardenLightLaneKind): number {
  if (kind === "route") return 3;
  if (kind === "beacon") return 2;
  if (kind === "buoy") return 1;
  return 0;
}

function lanePriority(lane: GardenLightLane): number {
  return lane.kind === "beacon"
    ? Number.MAX_SAFE_INTEGER
    : lane.intensity;
}

/** Deterministic 0..1 hash — the pulse schedule's per-route seed. */
function stableUnit(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}
