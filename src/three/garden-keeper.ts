import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { registerRitual, type GardenRitualHandler } from "../systems/garden-director";
import { HARBOR_PALETTE } from "../systems/palette";
import { gardenSkyToday, gardenSolarElevationAt, gardenSolarHourAngle } from "../systems/sky-almanac";
import {
  GARDEN_CRAG_CROWN_Y,
  GARDEN_CHASEKI_ANCHORS,
  GARDEN_QUAY_STAIR_HEAD,
  GARDEN_QUAY_STAIR_LANDING,
  islandTerrainHeight,
} from "./garden-island";
import {
  GARDEN_KINDLE_LIT,
  GARDEN_KINDLE_ORDER,
  GARDEN_KINDLE_WINDOW,
  gardenDefaultKindleProgress,
  setGardenLanternKindleClock,
  type GardenKeeperRitual,
  type GardenLanternKindleTarget,
} from "./garden-lanterns";

/**
 * W5.4 — the lamps are lit (K20, O19 keeper figure).
 *
 * At the blue-hour edge the score admits the `kindling` ritual. A small,
 * hatless keeper in a dark indigo robe, carrying a lit taper, steps out of
 * the chaseki, lights the lantern under its eave, walks the island path,
 * lights the landing lantern as he passes, climbs the quay stair and goes in
 * at the precinct gate. Inside, unseen, he climbs the tower: its three stair
 * embers rise one per breath, and when he reaches the lantern room the
 * lantern catches (the brazier lifts and the glass swells once). Then the
 * station lanterns kindle outward across the water by distance, and the
 * engawa tōrō beside the viewer lights last — about 3¾ minutes in all.
 *
 * The keeper owns the H-A kindle clock for as long as it lives: during the
 * ritual the ring follows his timeline (a narrow fade window, so each lamp
 * catches in a few seconds); afterwards what he lit stays lit until the sun's
 * default clock catches up; if the ritual never runs (hidden tab, reduced
 * motion, a late load) the sun's default clock lights the same order by
 * itself, and dawn banks it in reverse with no figure. The seam eases every
 * change, so nothing pops.
 *
 * At rest distance the figure is a ~14 px dark silhouette with one warm
 * point; it never reads bright (MeshBasic, dark robe, a taper of ~0.1 u).
 */

/** The ritual's fade window: a lamp takes a few seconds to catch at the keeper's pace. */
export const GARDEN_KEEPER_KINDLE_WINDOW = 0.02;
/** The figure fades in at the chaseki door and out at the precinct gate. */
export const GARDEN_KEEPER_FADE_SECONDS = 1.5;
/** Walking pace on the path and on the quay stair (world units per second). */
const PATH_PACE = 0.7;
const STAIR_PACE = 0.45;
/** How long he stands at each lantern he lights. */
const LIGHTING_PAUSE_SECONDS = 3.2;


interface WalkPoint { x: number; y: number; z: number }
interface WalkStep {
  /** Seconds from the start of the ritual. */
  start: number;
  end: number;
  from: WalkPoint;
  to: WalkPoint;
  /** Standing still (lighting a lantern) rather than walking. */
  pause: boolean;
  /** Sample the headland continuously on gravel, not a chord over its shoulders. */
  terrain?: boolean;
}

export interface GardenKeeperWalk {
  steps: readonly WalkStep[];
  /** He passes out of sight at the precinct gate. */
  gateSeconds: number;
  /** The chaseki eave lantern and the landing lantern, lit at these times. */
  chasekiLitSeconds: number;
  landingLitSeconds: number;
}

/** The authored walk, island-root-local, timed from the path's own lengths. */
export function gardenKeeperWalk(): GardenKeeperWalk {
  const onGround = (x: number, z: number): WalkPoint => ({ x, y: islandTerrainHeight(x, z), z });
  const anchors = GARDEN_CHASEKI_ANCHORS;
  const path = [
    anchors.door,
    anchors.deck,
    anchors.threshold,
    onGround(anchors.approach.x, anchors.approach.z),
    onGround(anchors.underEave.x, anchors.underEave.z),
    onGround(7.8, 0.9),
    onGround(10.8, 0.2),
    onGround(12.6, -2.2),
    onGround(14.35, -3.05),
    onGround(GARDEN_QUAY_STAIR_LANDING.x, GARDEN_QUAY_STAIR_LANDING.z),
  ];
  const head: WalkPoint = { x: GARDEN_QUAY_STAIR_HEAD.x, y: GARDEN_CRAG_CROWN_Y + 0.07, z: GARDEN_QUAY_STAIR_HEAD.z };
  const steps: WalkStep[] = [];
  let clock = GARDEN_KEEPER_FADE_SECONDS;
  steps.push({ end: clock, from: path[0]!, pause: true, start: 0, to: path[0]! });
  const walk = (from: WalkPoint, to: WalkPoint, pace: number, terrain = false) => {
    const span = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z) / pace;
    steps.push({ end: clock + span, from, pause: false, start: clock, to, terrain });
    clock += span;
  };
  const pause = (at: WalkPoint) => {
    steps.push({ end: clock + LIGHTING_PAUSE_SECONDS, from: at, pause: true, start: clock, to: at });
    clock += LIGHTING_PAUSE_SECONDS;
  };
  for (let index = 1; index <= 4; index += 1) {
    walk(path[index - 1]!, path[index]!, PATH_PACE, index === 4);
  }
  const chasekiLitSeconds = clock;
  pause(path[4]!);
  for (let index = 5; index <= 8; index += 1) walk(path[index - 1]!, path[index]!, PATH_PACE, true);
  const landingLitSeconds = clock;
  pause(path[8]!);
  walk(path[8]!, path[9]!, PATH_PACE, true);
  walk(path[9]!, head, STAIR_PACE);
  return { chasekiLitSeconds, gateSeconds: clock, landingLitSeconds, steps };
}

/**
 * The ritual's kindle progress keyframes (seconds, progress), from the walk:
 * each island lantern catches while he stands at it, the stair embers climb
 * over 30 s once he is inside, the lantern catches over three breaths when he
 * reaches the top, the stations kindle outward over 90 s, the tōrō last.
 */
export function gardenKeeperTimeline(walk: GardenKeeperWalk = gardenKeeperWalk()): Array<readonly [number, number]> {
  const order = GARDEN_KINDLE_ORDER;
  const half = GARDEN_KEEPER_KINDLE_WINDOW / 2;
  const gate = walk.gateSeconds;
  return [
    [0, order.chasekiLantern - 2.5 * half],
    [walk.chasekiLitSeconds, order.chasekiLantern - 1.5 * half],
    [walk.chasekiLitSeconds + LIGHTING_PAUSE_SECONDS, order.chasekiLantern + 1.5 * half],
    [walk.landingLitSeconds, order.landingLantern - 1.5 * half],
    [walk.landingLitSeconds + LIGHTING_PAUSE_SECONDS, order.landingLantern + 1.5 * half],
    [gate, order.stairEmbers[0] - 1.5 * half],
    [gate + 32, order.stairEmbers[2] + 1.5 * half],
    [gate + 34, order.lantern - 1.5 * half],
    [gate + 61, order.lantern + 1.5 * half],
    [gate + 64, order.stationNearest - 1.5 * half],
    [gate + 154, order.stationFarthest + order.shojiLag + 1.5 * half],
    [gate + 160, order.toro - 1.5 * half],
    [gate + 163, order.toro + 1.5 * half],
    [gate + 166, order.toro + 2.5 * half],
    // Settle onto the fully lit rest the latch then holds.
    [gate + 172, GARDEN_KINDLE_LIT],
  ];
}

function sampleTimeline(timeline: ReadonlyArray<readonly [number, number]>, seconds: number): number {
  if (seconds <= timeline[0]![0]) return timeline[0]![1];
  for (let index = 1; index < timeline.length; index += 1) {
    const [t1, p1] = timeline[index]!;
    if (seconds <= t1) {
      const [t0, p0] = timeline[index - 1]!;
      return p0 + (p1 - p0) * (t1 > t0 ? (seconds - t0) / (t1 - t0) : 1);
    }
  }
  return timeline[timeline.length - 1]![1];
}

export interface GardenKeeperUpdate {
  /** Wall-clock hour of the sky day. */
  hour: number;
  deltaSeconds: number;
  reducedMotion: boolean;
}

export interface GardenKeeper {
  /** Scene-owned; the integrator seats it at the island root's position. */
  readonly root: Group;
  readonly figure: Mesh<BufferGeometry, MeshBasicMaterial>;
  /** The ritual's state for the gulls settling as he walks (and the tests). */
  readonly ritual: GardenKeeperRitual;
  /** The director's `kindling` handler (registered on creation). */
  readonly handler: GardenRitualHandler;
  /** Seconds from start to done. */
  readonly durationSeconds: number;
  update(input: GardenKeeperUpdate): void;
  dispose(): void;
}

export function createGardenKeeper(options: { register?: boolean } = {}): GardenKeeper {
  const root = new Group();
  root.name = "garden-keeper";
  const material = new MeshBasicMaterial({ opacity: 0, transparent: true, vertexColors: true });
  const figure = new Mesh(createKeeperGeometry(), material);
  figure.name = "garden-evening-keeper";
  figure.visible = false;
  root.add(figure);

  const walk = gardenKeeperWalk();
  const timeline = gardenKeeperTimeline(walk);
  const durationSeconds = timeline[timeline.length - 1]![0];
  const ritual: GardenKeeperRitual = { active: false, direction: "evening", progress: 0 };
  let running = false;
  let startSeconds = 0;
  let elapsed = 0;
  /** What the keeper lit and must stay lit until the sun's clock catches up. */
  let latch: number | null = null;
  /** A (re)start never banks what an earlier walk already lit. */
  let floor = Number.NEGATIVE_INFINITY;
  let opacity = 0;

  const clock = (defaultProgress: number): GardenLanternKindleTarget => {
    if (running) {
      return {
        progress: Math.max(sampleTimeline(timeline, elapsed), defaultProgress, floor),
        window: GARDEN_KEEPER_KINDLE_WINDOW,
      };
    }
    if (latch !== null && latch > defaultProgress) {
      return { progress: latch, window: latch >= GARDEN_KINDLE_LIT ? GARDEN_KINDLE_WINDOW : GARDEN_KEEPER_KINDLE_WINDOW };
    }
    return { progress: defaultProgress, window: GARDEN_KINDLE_WINDOW };
  };
  setGardenLanternKindleClock(clock);

  const handler: GardenRitualHandler = {
    start(t) {
      floor = running ? Math.max(floor, sampleTimeline(timeline, elapsed)) : latch ?? Number.NEGATIVE_INFINITY;
      running = true;
      startSeconds = t;
      elapsed = 0;
      latch = null;
    },
    update(t) {
      if (!running) return true;
      elapsed = Math.max(0, t - startSeconds);
      if (elapsed < durationSeconds) return false;
      running = false;
      latch = GARDEN_KINDLE_LIT;
      floor = Number.NEGATIVE_INFINITY;
      return true;
    },
    cancel() {
      if (!running) return;
      running = false;
      // Hold what he has lit; the rest waits for the sun's clock.
      latch = Math.max(floor, sampleTimeline(timeline, elapsed));
      floor = Number.NEGATIVE_INFINITY;
    },
  };
  const unregister = options.register === false ? () => {} : registerRitual("kindling", handler);

  const place = (seconds: number) => {
    const step = walk.steps.find((candidate) => seconds <= candidate.end) ?? walk.steps[walk.steps.length - 1]!;
    const t = step.end > step.start ? Math.min(1, Math.max(0, (seconds - step.start) / (step.end - step.start))) : 1;
    figure.position.set(
      step.from.x + (step.to.x - step.from.x) * t,
      step.from.y + (step.to.y - step.from.y) * t,
      step.from.z + (step.to.z - step.from.z) * t,
    );
    if (step.terrain) figure.position.y = islandTerrainHeight(figure.position.x, figure.position.z);
    if (!step.pause) figure.rotation.y = Math.atan2(step.to.x - step.from.x, step.to.z - step.from.z);
  };

  return {
    dispose() {
      unregister();
      setGardenLanternKindleClock(null);
      figure.geometry.dispose();
      material.dispose();
    },
    durationSeconds,
    figure,
    handler,
    ritual,
    root,
    update({ deltaSeconds, hour, reducedMotion }) {
      if (latch !== null) {
        const day = gardenSkyToday();
        const morning = gardenSolarHourAngle(day, hour) < 0;
        const sunUp = gardenSolarElevationAt(day, hour) * (180 / Math.PI) > -1;
        if (morning || sunUp || gardenDefaultKindleProgress(hour, day) >= latch) latch = null;
      }
      ritual.active = running;
      ritual.progress = running ? Math.min(1, elapsed / durationSeconds) : 0;
      ritual.direction = "evening";
      // Seen only on the walk: fading in at the door, out at the gate, and
      // out wherever a cancel leaves him.
      const onWalk = running && elapsed < walk.gateSeconds;
      const target = onWalk && elapsed < walk.gateSeconds - GARDEN_KEEPER_FADE_SECONDS ? 1 : 0;
      if (reducedMotion) opacity = target;
      else {
        const step = Math.min(0.25, Math.max(0, deltaSeconds)) / GARDEN_KEEPER_FADE_SECONDS;
        opacity += Math.max(-step, Math.min(step, target - opacity));
      }
      material.opacity = opacity;
      figure.visible = opacity > 0.001;
      if (onWalk) place(elapsed);
    },
  };
}

/**
 * ≤ 300 triangles, one draw: a tapered indigo robe (24), a small bare head
 * (48), the taper-hand sleeve (12) and the taper's flame (12). The flame is
 * the one warm point; everything else is darker than the dusk water.
 */
function createKeeperGeometry(): BufferGeometry {
  const robe = new CylinderGeometry(0.11, 0.27, 1.02, 6).translate(0, 0.51, 0);
  const head = new SphereGeometry(0.105, 6, 5).translate(0, 1.13, 0);
  const sleeve = new BoxGeometry(0.08, 0.08, 0.3).translate(0.14, 0.74, 0.14);
  const flame = new BoxGeometry(0.07, 0.11, 0.07).translate(0.15, 0.84, 0.31);
  const robeColor = new Color(HARBOR_PALETTE.deep_sea_1).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.55);
  const parts: Array<[BufferGeometry, Color]> = [
    [robe, robeColor],
    [head, new Color(HARBOR_PALETTE.stone_dark)],
    [sleeve, robeColor],
    [flame, new Color(HARBOR_PALETTE.lantern_warm)],
  ];
  const geometries = parts.map(([part, color]) => {
    const flat = part.index ? part.toNonIndexed() : part;
    const colors = new Float32Array(flat.getAttribute("position").count * 3);
    for (let offset = 0; offset < colors.length; offset += 3) color.toArray(colors, offset);
    flat.setAttribute("color", new Float32BufferAttribute(colors, 3));
    flat.deleteAttribute("uv");
    if (flat !== part) part.dispose();
    return flat;
  });
  const geometry = mergeGeometries(geometries)!;
  for (const part of geometries) part.dispose();
  return geometry;
}
