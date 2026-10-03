/**
 * The per-frame fleet pass: every hull's pose, the batched fleet restamp, the
 * arrival-beat visuals, the wake batch and wake-field stamps, the contact
 * shadows, and the hull-anchored instance sets (cross-bearing buoys, flight
 * tenders, issuance worksets, pigeonnier movers, fleet lanterns).
 *
 * Extracted from `world-renderer.ts` (Hour-Print W0.24) as one seam the fleet
 * owners can edit without touching the renderer shell. `updateSceneForFrame`
 * calls `updateGardenShipFrame` once per frame, after the dock pass and before
 * the lane registry is re-packed; nothing in it reads the camera zoom directly
 * — every camera-keyed decision arrives through the `RendererDetailPolicy`
 * (`renderer-semantic-view.ts`).
 *
 * Hot path rules: the loop is indexed (no iterator pairs), every per-hull
 * record below is module scratch, and each touched instance buffer is flushed
 * once at the end of the pass, never per ship.
 */
import {
  MathUtils,
  Matrix4,
  Quaternion,
  Vector3,
  InstancedMesh,
  type Camera,
  type PerspectiveCamera,
  type CircleGeometry,
  type MeshBasicMaterial,
} from "three";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";
import { seaQualityTier } from "../renderer/render-scheduler";
import {
  GARDEN_SHIP_ROOT_Y,
  gardenShipVisualScale,
  GARDEN_WATER_Y as WATER_LEVEL,
  resolveGardenShipDisplayTile,
} from "../systems/garden-observatory-slice";
import type { GardenFleetThinningShip } from "../systems/garden-fleet-thinning";
import {
  GARDEN_SAIL_DIP_MIN_SCALE,
  gardenArrivalBeatEnvelopeInto,
  selectGardenArrivalBeatShipDetailIds,
  type GardenArrivalBeatEnvelope,
} from "../systems/garden-arrival-beats";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  gardenShipHullReachWorld,
  isGardenShipWater,
  nearestGardenShipWater,
} from "../systems/garden-water-exclusion";
import {
  GARDEN_BREATH_PHASE,
  gardenBreathAt,
  type WeatherPlan,
} from "../systems/weather";
import type { GardenPigeonnierLandmark } from "./garden-landmarks";
import type { GardenWater } from "./garden-water";
import { prepareGardenHullSwell, sampleGardenHullSwellInto, type GardenHullSwellPose } from "./garden-hull-swell";
import type { GardenWakes } from "./garden-wakes";
import type { GardenWakeBatch } from "./garden-wake-batch";
import type { GardenFlightTenders } from "./garden-flight-tenders";
import type { GardenShipIssuanceWorksets } from "./garden-ship-issuance";
import type { GardenLaneRegistry } from "./garden-lanterns";
import type { GardenCrossBearingBuoys } from "./garden-cross-bearing-buoys";
import {
  gardenShipMastheadOffset,
  gardenShipSailFurl,
  syncShipRippleRings,
  updateFleetLanterns,
  updateShipPennants,
  type FleetLanternFrame,
  type FleetLanterns,
  type ShipVisual,
} from "./garden-ships";
import {
  beginFleetFrame,
  endFleetFrame,
  gardenFleetShipHeroWeight,
  setFleetAerialPerspective,
  setFleetWeather,
  writeFleetInstance,
  type FleetBatches,
} from "./garden-fleet-batch";
import { syncGardenSailAtlas, type GardenSailAtlas } from "./garden-sail-atlas";
import {
  disposeThreeObjectTree,
  normalizedHeading,
  setTilePosition,
} from "./garden-util";
import type { TextureUploadScheduler } from "./texture-upload-scheduler";
import {
  sampleGardenShipTransition,
  type GardenShipTransitionSample,
  type GardenShipTransitionSpec,
} from "./renderer-transitions";
import {
  gardenFineDetailVisible,
  gardenWakeDetailVisible,
  resolveGardenFleetDisplayPresence,
  type RendererDetailPolicy,
} from "./renderer-semantic-view";

/**
 * Peak chroma the fleet loses at the far end of the haze ramp.
 *
 * Deliberately partial: the operator asked for a GENTLE recession, where a
 * distant hull is still identifiable to someone who looks for it and merely
 * stops competing for attention. Full desaturation would make the far fleet a
 * monochrome band and turn a depth cue into a wall.
 *
 * Lowered from 0.62 once the scene fog was repaired (garden-sky.ts, 2026-08-13
 * — the reference view height had switched aerial perspective off entirely at
 * the default framing). While fog was inert this term was carrying the whole
 * depth cue alone and needed to be strong; now that the haze itself grades the
 * midground, the two compound, and the far fleet was losing its colour twice
 * over.
 */
const GARDEN_FLEET_AERIAL_STRENGTH = 0.4;

const scratchMatrix = new Matrix4();
// R8: reused per-frame scratch for the oriented ship contact shadow.
const scratchShadowPosition = new Vector3();
const scratchShadowScale = new Vector3();
const scratchShadowQuaternion = new Quaternion();
const SHADOW_UP = new Vector3(0, 1, 0);
const scratchWakePose = { headingY: 0, hullScale: 1, x: 0, y: 0, z: 0 };
const scratchArrivalBeat: GardenArrivalBeatEnvelope = { furl: 0, bowWave: 0, nameplate: false };
const scratchSwellPose: GardenHullSwellPose = { heave: 0, pitch: 0, rollToPort: 0 };
const transitionFrameSample: GardenShipTransitionSample = {
  complete: false,
  headingX: 0,
  headingY: 0,
  progress: 0,
  visibility: 1,
  x: 0,
  y: 0,
};

/** Scene-scope systems the fleet pass writes into; `GardenScene` satisfies it. */
export interface GardenShipFrameScene {
  /** Identity guard: deferred sail-atlas work belongs to the content that queued it. */
  content: object | null;
  laneRegistry: GardenLaneRegistry;
  sky: { fog: { near: number; far: number } };
  wakes: GardenWakes;
  water: Pick<GardenWater, "rippleRings">;
  weather: WeatherPlan;
}

/** World-content state the fleet pass reads and writes; `GardenContent` satisfies it. */
export interface GardenShipFrameContent {
  crossBearingBuoyShips: ShipVisual[];
  crossBearingBuoys: GardenCrossBearingBuoys;
  departingShips: ShipVisual[];
  fleetBatches: FleetBatches;
  fleetDisplayPresenceByShipId: Map<string, number>;
  fleetLanterns: FleetLanterns;
  fleetThinningShips: GardenFleetThinningShip[];
  flightTenderShips: ShipVisual[];
  flightTenders: GardenFlightTenders;
  issuanceWorksetShips: ShipVisual[];
  issuanceWorksets: GardenShipIssuanceWorksets;
  /** The ships part's texture-upload owner; a rebuild replaces it. */
  parts: { ships: { owner: object } };
  pendingShipTransitions: Map<string, GardenShipTransitionSpec>;
  pigeonnier: GardenPigeonnierLandmark;
  pigeonnierMoverPositions: Array<{ x: number; y: number; z: number }>;
  pigeonnierMoverShips: Array<ShipVisual | null>;
  sailAtlas: GardenSailAtlas;
  shipShadows: InstancedMesh<CircleGeometry, MeshBasicMaterial>;
  shipTransitions: Map<string, GardenShipTransitionSpec>;
  ships: ShipVisual[];
  visibleShipCount: number;
  wakeBatch: GardenWakeBatch;
}

/**
 * Per-frame scalars and per-renderer hooks for the fleet pass. One record per
 * renderer (`createGardenShipFrameInput`); `updateSceneForFrame` refreshes the
 * scalar fields in place each frame, so the call mints nothing.
 */
export interface GardenShipFrameInput {
  /** Clock the shared breath curves read: 0 under reduced motion. */
  breathTime: number;
  /** `constrained` scheduler tier: sheds wakes and arrival bow flourishes. */
  constrained: boolean;
  /**
   * Seconds since the previous frame on the scene's beam clock, unclamped.
   * Drives the heel rate.
   */
  deltaSeconds: number;
  /** Fires when the deferred sail-atlas repaint has uploaded. */
  onAssetReady: (() => void) | undefined;
  /** This frame's eased overview-LOD detail (`advanceGardenOverviewDetail`). */
  overviewDetail: number;
  uploadScheduler: TextureUploadScheduler;
}

export function createGardenShipFrameInput(
  uploadScheduler: TextureUploadScheduler,
  onAssetReady: (() => void) | undefined,
): GardenShipFrameInput {
  return {
    breathTime: 0,
    constrained: false,
    deltaSeconds: 0,
    onAssetReady,
    overviewDetail: 1,
    uploadScheduler,
  };
}

/**
 * Roll into a turn, from the ship's angular RATE.
 *
 * Pure and exported so the frame-rate independence below is actually testable —
 * the old inline form scaled a per-FRAME heading delta by 2.4, so on a 120 Hz
 * display every ship heeled half as far into the same turn as on a 60 Hz one,
 * and a hitched frame produced a spike that the clamp quietly swallowed.
 *
 * 0.04 is 2.4/60, so 60 fps behaviour is unchanged by construction. The
 * denominator floor caps the rate a single very short frame can report.
 */
export function gardenShipHeelFromTurn(
  deltaRadians: number,
  deltaSeconds: number,
): number {
  if (!Number.isFinite(deltaRadians) || !Number.isFinite(deltaSeconds)) return 0;
  const rate = deltaRadians / Math.max(deltaSeconds, 1 / 240);
  // W4.F10: a turn is a whisper of roll (≤ 2.9°); the wind and the swell
  // carry the hull's life now.
  return MathUtils.clamp(rate * 0.04, -0.05, 0.05);
}

/** Removes a departing hull's scene presence and the GPU buffers it owns. */
export function disposeDepartingVisual(
  scene: Pick<GardenShipFrameScene, "laneRegistry" | "water">,
  visual: ShipVisual,
): void {
  visual.root.removeFromParent();
  scene.laneRegistry.remove(`ship-lantern.${visual.ship.id}`);
  scene.water.rippleRings.removeRing(`ship-mooring.${visual.ship.id}`);
  // Batched departure roots own only their wake instance buffers; hull/sail
  // geometry and materials belong to the scene-scope fleet cache. Overflow
  // procedural ghosts own their temporary cache and can dispose the full tree.
  if (visual.batched) {
    visual.root.traverse((object) => {
      if (object instanceof InstancedMesh) object.dispose();
    });
  } else disposeThreeObjectTree(visual.root);
}

function removeCompletedDepartures(
  scene: Pick<GardenShipFrameScene, "laneRegistry" | "water">,
  content: Pick<GardenShipFrameContent, "departingShips" | "shipTransitions">,
  timeSeconds: number,
): void {
  for (let index = content.departingShips.length - 1; index >= 0; index -= 1) {
    const visual = content.departingShips[index]!;
    const transition = content.shipTransitions.get(visual.ship.id);
    if (
      !transition
      || !sampleGardenShipTransition(transition, timeSeconds, transitionFrameSample).complete
    ) continue;
    disposeDepartingVisual(scene, visual);
    content.departingShips.splice(index, 1);
    content.shipTransitions.delete(visual.ship.id);
  }
}

/**
 * One frame of the fleet: runs after the dock pass in `updateSceneForFrame`
 * and before the lane registry is re-packed (this pass sets the ship lanes).
 */
export function updateGardenShipFrame(
  scene: GardenShipFrameScene,
  content: GardenShipFrameContent,
  camera: Camera,
  frame: ThreeWorldRendererFrame,
  detailPolicy: RendererDetailPolicy,
  input: GardenShipFrameInput,
): void {
  const { breathTime, constrained, deltaSeconds, overviewDetail } = input;
  const weather = scene.weather;
  // W1: the batched fleet is restamped from scratch each frame. Counts reset
  // here, poses are written in the ship loop, and every touched buffer is
  // flushed once at the end — one upload per buffer, not one per ship.
  // Phase 2: one weather write moves every sail and pennant in the fleet.
  setFleetWeather({
    breath: gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.sails),
    gust: weather.wind.gust,
    timeSeconds: frame.timeSeconds,
    windAngle: Math.atan2(weather.wind.y, weather.wind.x),
    windDirX: weather.wind.x,
    windDirZ: weather.wind.y,
    windSpeed: weather.wind.speed,
  });
  // W4.F10: hulls read the same swell the water shader draws this frame.
  prepareGardenHullSwell({
    timeSeconds: frame.reducedMotion ? 0 : frame.timeSeconds,
    tempo: frame.seaState.tempo,
    swell: frame.seaState.swell,
    stormLevel: weather.stormLevel,
    windX: weather.wind.x,
    windZ: weather.wind.y,
    windSpeed: weather.wind.speed,
  });
  // ...and one aerial write gives the whole fleet its recession. Reads the fog
  // planes the sky already view-scaled (scene.sky.update runs earlier in
  // `updateSceneForFrame`), so the chroma ramp and the haze can never disagree
  // about where the distance begins.
  setFleetAerialPerspective({
    fogNear: scene.sky.fog.near,
    fogFar: scene.sky.fog.far,
    strength: GARDEN_FLEET_AERIAL_STRENGTH,
    zoom: detailPolicy.fleetClothZoom,
  });
  removeCompletedDepartures(scene, content, frame.timeSeconds);
  beginFleetFrame(content.fleetBatches, {
    camera: frame.camera,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
    viewport: { x: frame.width, y: frame.height },
  });
  const sailTexture = content.sailAtlas.texture;
  const logoGeneration = frame.logos.getLogoGenerationKey();
  if (sailTexture && content.sailAtlas.logoGenerationKey !== logoGeneration) {
    const ships = content.ships.map((visual) => visual.ship);
    const logos = frame.logos;
    // W4.1: the atlas paint belongs to the current ships build. A ships
    // rebuild replaces the part owner, which cancels this task and lets the
    // rebuild's own repaint supersede it.
    const shipsPart = content.parts.ships;
    const owner = shipsPart.owner;
    // Defer BOTH repaint and upload. Painting here would increment the
    // CanvasTexture version and let Three auto-upload the 2048² atlas during
    // the hot scene draw before the queue had a chance to run.
    input.uploadScheduler.schedule({
      isOwnerValid: () => scene.content === content && shipsPart.owner === owner,
      key: `sail-atlas.${sailTexture.uuid}`,
      onOwnerDrained: () => {
        if (scene.content === content) input.onAssetReady?.();
      },
      owner,
      ownerName: "fleet.sail-atlas",
      prepare: () => syncGardenSailAtlas(
        content.sailAtlas,
        ships,
        logos,
      ),
      texture: sailTexture,
    });
  }

  content.fleetDisplayPresenceByShipId = resolveGardenFleetDisplayPresence(
    content.ships,
    content.fleetThinningShips,
    frame,
    detailPolicy,
  );
  const readableArrivalBeatDetailIds = selectGardenArrivalBeatShipDetailIds(
    content.ships,
    frame.shipMotionSamples,
    frame.reducedMotion,
  );
  // K8: at full/balanced the wake field carries every wake, so the
  // ship-locked trail/bow quads are only the low-tier fallback (−2 draws).
  const seaTier = seaQualityTier(frame.renderScheduler);
  const wakeFieldTier = seaTier === "full" || seaTier === "balanced";
  const stampWakeField = wakeFieldTier && !frame.reducedMotion;
  // Hulls sit in the water under reduced motion too: contact is static.
  const stampContactField = wakeFieldTier;
  content.wakeBatch.root.visible = !wakeFieldTier;
  let visibleShipCount = 0;
  // Indexed rather than `entries()`: the iterator mints an `[index, value]` pair
  // per hull per frame, and this loop runs over the whole fleet. Same below.
  const renderedShipCount = content.ships.length + content.departingShips.length;
  for (let index = 0; index < renderedShipCount; index += 1) {
    const departing = index >= content.ships.length;
    const visual = departing
      ? content.departingShips[index - content.ships.length]!
      : content.ships[index]!;
    const displayPresence = departing
      ? 1
      : content.fleetDisplayPresenceByShipId.get(visual.ship.id) ?? 1;
    const sample = departing ? undefined : frame.shipMotionSamples.get(visual.ship.id);
    gardenArrivalBeatEnvelopeInto(sample, frame.reducedMotion, scratchArrivalBeat);
    const beatSailScale = 1 - scratchArrivalBeat.furl * (1 - GARDEN_SAIL_DIP_MIN_SCALE);
    const readableArrivalBeat = readableArrivalBeatDetailIds.includes(visual.ship.detailId);
    const targetTile = resolveGardenShipDisplayTile({
      displayOffset: visual.displayOffset,
      representative: visual.representative,
      sample,
      ship: visual.ship,
    });
    const transition = content.shipTransitions.get(visual.ship.id)
      ?? content.pendingShipTransitions.get(visual.ship.id);
    let tile = targetTile;
    let transitionVisibility = 1;
    let transitionHeadingX = 0;
    let transitionHeadingY = 0;
    if (transition) {
      const transitionSample = sampleGardenShipTransition(
        transition,
        frame.timeSeconds,
        transitionFrameSample,
      );
      if (transitionSample.complete && !departing) {
        content.shipTransitions.delete(visual.ship.id);
      } else {
        const targetBerth = transition.to;
        // Existing within-berth patrol motion remains live, but its ANCHOR is
        // the easing path. Departures have no new-world motion sample.
        tile = {
          x: transitionSample.x + (departing ? 0 : targetTile.x - targetBerth.x),
          y: transitionSample.y + (departing ? 0 : targetTile.y - targetBerth.y),
        };
        transitionVisibility = transitionSample.visibility;
        transitionHeadingX = transitionSample.headingX;
        transitionHeadingY = transitionSample.headingY;
        if (!isGardenShipWater(tile, transition.marginTiles)) {
          tile = nearestGardenShipWater(
            tile,
            transition.marginTiles,
            `transition-display.${visual.ship.id}.${transition.kind}`,
          );
        }
      }
    }
    visual.root.visible = displayPresence > 0;
    if (displayPresence >= 0.5) visibleShipCount += 1;
    visual.root.scale.setScalar(
      gardenShipVisualScale(visual.ship.visual.scale || 1)
        * transitionVisibility
        * displayPresence,
    );
    setTilePosition(visual.root, tile, GARDEN_SHIP_ROOT_Y);

    const heading = Math.hypot(transitionHeadingX, transitionHeadingY) > 0.5
      ? { x: transitionHeadingX, y: transitionHeadingY }
      : normalizedHeading(sample?.heading);
    let yaw = visual.root.rotation.y;
    let turnRollToPort = 0;
    if (heading) {
      const headingAngle = Math.atan2(heading.y, heading.x);
      yaw = -headingAngle;
      // A small roll out of a turn, from the display heading's angular RATE
      // (frame-rate independent); frozen under reduced motion.
      if (!frame.reducedMotion && visual.prevHeadingAngle !== null) {
        let delta = headingAngle - visual.prevHeadingAngle;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        // Turning to starboard (+) lays the hull over to port (+).
        turnRollToPort = gardenShipHeelFromTurn(delta, deltaSeconds);
      }
      visual.prevHeadingAngle = headingAngle;
    } else {
      visual.prevHeadingAngle = null;
    }
    // W4.F10 + F-A: the hull rides the swell at its own position (so
    // neighbours nod in sequence) and heels to leeward by the sampler's small
    // wind heel. Pitch is about the athwartships axis (Euler z, bow up +),
    // roll about the keel (Euler x, + = starboard down). Reduced motion: level.
    let pitch = 0;
    let rollToPort = 0;
    if (!frame.reducedMotion && heading) {
      sampleGardenHullSwellInto(
        visual.root.position.x,
        visual.root.position.z,
        heading.x,
        heading.y,
        sample?.zone ?? visual.ship.riskZone,
        sample?.state === "moored" && sample.currentDockId !== null,
        visual.ship.visual.scale || 1,
        scratchSwellPose,
      );
      visual.root.position.y += scratchSwellPose.heave;
      pitch = scratchSwellPose.pitch;
      rollToPort = scratchSwellPose.rollToPort + (sample?.heelRad ?? 0) + turnRollToPort;
    }
    visual.root.rotation.set(-rollToPort, yaw, pitch, "YXZ");
    visual.sampleState = transition
      ? (departing ? "departing" : transition.kind === "arrival" ? "arriving" : "sailing")
      : (sample?.state ?? "idle");
    // Lay a warm reflection lane on the sea under each ship's lantern(s).
    scene.laneRegistry.set({
      color: HARBOR_PALETTE.lantern_glow,
      id: `ship-lantern.${visual.ship.id}`,
      // W4.F3: at night the far fleet is embers — only the hero band's lamps.
      intensity: visual.laneIntensity * displayPresence
        * gardenFleetShipHeroWeight(content.fleetBatches, visual.ship.id),
      kind: "lantern",
      worldX: visual.root.position.x,
      worldZ: visual.root.position.z,
    });
    const wakeBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.wakes);
    const wakeIntensityBase = transition && !frame.reducedMotion
      ? Math.max(sample?.wakeIntensity ?? 0, 0.68 * transitionVisibility)
      : (sample?.wakeIntensity ?? 0);
    const wakeIntensity = wakeIntensityBase * (0.94 + wakeBreath * 0.12);
    const showShipDetail = gardenFineDetailVisible(detailPolicy, visual.ship.detailId, frame);
    // Wakes remain a fleet-motion cue in overview/explore. In analyze, where a
    // selection already owns the hierarchy, retain only the focused hull's
    // wake so unrelated foam cannot compete with its ring, route, or panel.
    const wakeVisible = displayPresence > 0
      && !frame.reducedMotion
      && !constrained
      && wakeIntensity > 0.08
      && gardenWakeDetailVisible(detailPolicy, overviewDetail, showShipDetail);
    const wakeScaleX = (0.7 + Math.min(1.5, wakeIntensity) * 0.85)
      * overviewDetail
      * displayPresence;
    scratchWakePose.x = visual.root.position.x;
    scratchWakePose.y = visual.root.position.y;
    scratchWakePose.z = visual.root.position.z;
    scratchWakePose.headingY = visual.root.rotation.y;
    scratchWakePose.hullScale = visual.root.scale.x;
    content.wakeBatch.setShip(
      visual.wakeSlot,
      scratchWakePose,
      wakeVisible,
      wakeScaleX,
    );
    // The hull's rendered x/z half-extents (family reach table × rendered
    // scale × hull-form span), shared by the wake field and the shadow below.
    const hullReach = gardenShipHullReachWorld(
      gardenShipVisualScale(visual.ship.visual.scale || 1),
      visual.silhouette,
      visual.ship.visual.hullForm,
    );
    // K8 wake field (W3.8/W3.9). The pose is final for this frame; the field
    // consumes these at the top of next frame. Every hull in the window
    // writes its waterline footprint (B); a hull making way adds bow/stern
    // foam (R) and lays its glassy lane (G) at the wake's intensity, which
    // carries the risk zone and 24 h change as lane length.
    const hullSizeScale = transitionVisibility * displayPresence;
    const wakeHalfLength = hullReach.x * 0.9 * hullSizeScale;
    const wakeHalfBeam = hullReach.z * hullSizeScale;
    if (stampContactField && hullSizeScale > 0.05) {
      const rotationY = visual.root.rotation.y;
      scene.wakes.stampContact(
        visual.root.position.x,
        visual.root.position.z,
        heading ? heading.x : Math.cos(rotationY),
        heading ? heading.y : -Math.sin(rotationY),
        wakeHalfLength,
        wakeHalfBeam,
        1,
      );
      if (stampWakeField && heading && wakeIntensity * displayPresence > 0.12) {
        const wakeStrength = Math.min(1, wakeIntensity * displayPresence);
        scene.wakes.stamp(
          visual.root.position.x,
          visual.root.position.z,
          heading.x,
          heading.y,
          wakeStrength,
          wakeHalfLength,
          wakeHalfBeam,
          wakeStrength,
        );
      }
    }
    if (
      heading
      && stampWakeField
      && readableArrivalBeat
      && scratchArrivalBeat.bowWave > 0
      && displayPresence > 0
      && overviewDetail > 0
    ) {
      const stampStrength = scratchArrivalBeat.bowWave * displayPresence;
      if (sample?.segment?.kind === "dock-dwell") {
        // Three positions push one bow flourish ahead of the stem in the
        // existing field (foam only); no particles, geometry, draw, or clock.
        for (let stampIndex = 1; stampIndex <= 3; stampIndex += 1) {
          const bowOffset = wakeHalfLength * stampIndex * 0.16;
          scene.wakes.stamp(
            visual.root.position.x + heading.x * bowOffset,
            visual.root.position.z + heading.y * bowOffset,
            heading.x,
            heading.y,
            stampStrength * (1 - stampIndex * 0.12),
            wakeHalfLength,
            wakeHalfBeam,
          );
        }
      } else if (sample?.segment?.kind === "departure-transit") {
        const sternOffset = wakeHalfLength * 0.35;
        scene.wakes.stamp(
          visual.root.position.x - heading.x * sternOffset,
          visual.root.position.z - heading.y * sternOffset,
          heading.x,
          heading.y,
          stampStrength,
          wakeHalfLength,
          wakeHalfBeam,
        );
      }
    }
    if (visual.identitySail) {
      const previousScale = typeof visual.identitySail.userData.arrivalBeatScale === "number"
        ? visual.identitySail.userData.arrivalBeatScale
        : 1;
      // Restore the authored hero/GLB identity sail when no transient dip is active.
      visual.identitySail.scale.y = visual.identitySail.scale.y / previousScale * beatSailScale;
      visual.identitySail.userData.arrivalBeatScale = beatSailScale;
      // W4.F1: a hero's square identity sail braces with the same F-A trim.
      if (visual.identitySail.userData.gardenSquareSail === true) {
        visual.identitySail.rotation.y = sample?.sailTrimRad ?? visual.sailRestBraceRad;
      }
    }
    visual.fineDetail.visible = showShipDetail;

    // R8 grounding: the shadow is THIS ship's shadow — the hull's rendered
    // x/z footprint (family reach table × rendered scale × hull-form span),
    // rotated with the heading, padded a little so the soft edge clears the
    // waterline rather than the topsides. G2/W3.3: it was a selection-radius
    // guess before, so every family threw the same elongated blob.
    scratchShadowScale.set(
      Math.max(0.9, hullReach.x * 1.12) * displayPresence,
      displayPresence,
      Math.max(0.6, hullReach.z * 1.35) * displayPresence,
    );
    scratchShadowQuaternion.setFromAxisAngle(
      SHADOW_UP,
      visual.root.rotation.y,
    );
    scratchShadowPosition.set(
      // Ambient contact grounding stays under the hull through the day cycle;
      // this disc is not a directional cast shadow from the moving sun.
      visual.root.position.x,
      WATER_LEVEL + 0.028,
      visual.root.position.z,
    );
    scratchMatrix.compose(scratchShadowPosition, scratchShadowQuaternion, scratchShadowScale);
    content.shipShadows.setMatrixAt(index, scratchMatrix);

    // The ship's transform is final for this frame — hand it to the batch.
    // Hero ships skip this: they carry their own meshes under `root`.
    if (visual.batched) {
      writeFleetInstance(content.fleetBatches, {
        atlasCell: visual.atlasCell,
        leader: visual.ship.visual.sizeTier === "titan" || visual.ship.visual.sizeTier === "unique",
        shipId: visual.ship.id,
        headingAngle: visual.root.rotation.y,
        heel: visual.root.rotation.z,
        hullColor: visual.hullColor,
        hullForm: visual.ship.visual.hullForm,
        sailColor: visual.sailColor,
        pennantColor: visual.pennantColor,
        pitch: visual.root.rotation.x,
        scale: visual.root.scale.x,
        mastheadOffset: gardenShipMastheadOffset(visual.silhouette),
        sailFurl: gardenShipSailFurl(visual.ship.id, visual.sampleState),
        sailScale: beatSailScale,
        // Contract F-A: the brace and luff from apparent wind; the hashed
        // rest brace when the sampler leaves them out (reduced motion).
        sailBraceRad: sample?.sailTrimRad ?? visual.sailRestBraceRad,
        sailLuff: sample?.luff,
        silhouette: visual.silhouette,
        trimColor: visual.trimColor,
        x: visual.root.position.x,
        y: visual.root.position.y,
        z: visual.root.position.z,
      });
    }
  }
  content.wakeBatch.commit();
  endFleetFrame(content.fleetBatches);
  // W4.1: the shadow buffer holds a spare slot for the transient outsider;
  // clamp the live count so slots beyond the fleet are never drawn.
  content.shipShadows.count = renderedShipCount;
  content.shipShadows.instanceMatrix.needsUpdate = true;
  content.visibleShipCount = visibleShipCount;

  // 3b: the cross-bearing buoys ride alongside their hulls, so they are placed
  // once the ship transforms are final. One pass over the crossed ships only —
  // usually a handful, and none at all on an ordinary afternoon — then a single
  // buffer upload, the same discipline the shadows and the batches use.
  // Nothing here is tier or reduced-motion gated: the buoy has no motion of its
  // own, and it stops moving exactly when the ship it is moored to does.
  for (let index = 0; index < content.crossBearingBuoyShips.length; index += 1) {
    const visual = content.crossBearingBuoyShips[index]!;
    content.crossBearingBuoys.place(index, visual.root.position.x, visual.root.position.z);
  }
  content.crossBearingBuoys.flush();

  // The flight-to-quality flotilla, anchored on the same final hull transforms.
  // Its boats have no motion sample of their own and no clock of their own: each
  // one is an offset from its titan's position, which the loop above wrote from
  // `frame.shipMotionSamples`, advanced along its run by the frame's own
  // `timeSeconds`. `detail` is the overview policy's value, applied per instance
  // because these matrices are world-space — the same gate the wakes use.
  // Nothing runs when the gauge reported no flight: the list is empty.
  for (let index = 0; index < content.flightTenderShips.length; index += 1) {
    const visual = content.flightTenderShips[index]!;
    content.flightTenders.place(index, visual.root.position.x, visual.root.position.z);
  }
  content.flightTenders.flush({
    detail: overviewDetail,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  for (let index = 0; index < content.issuanceWorksetShips.length; index += 1) {
    const visual = content.issuanceWorksetShips[index]!;
    content.issuanceWorksets.place(
      index,
      visual.root.position.x,
      GARDEN_SHIP_ROOT_Y,
      visual.root.position.z,
      visual.root.rotation.y,
    );
  }
  content.issuanceWorksets.flush({
    detail: overviewDetail,
    overview: detailPolicy.semanticView === "overview",
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });

  // Ship transforms are final — flutter the pennants (S8), ground moored
  // ships with karesansui ripple rings (S7 via contract C2 (d)), and restamp
  // the fleet lantern instances. The caller re-packs the lane texture next,
  // now that this frame's ship lanes are set.
  updateShipPennants(content.ships, frame.timeSeconds, frame.reducedMotion);
  for (let index = 0; index < content.pigeonnier.moverDetailIds.length; index += 1) {
    const visual = content.pigeonnierMoverShips[index];
    const position = content.pigeonnierMoverPositions[index]!;
    if (visual) {
      position.x = visual.root.position.x;
      position.y = visual.root.position.y;
      position.z = visual.root.position.z;
    }
  }
  content.pigeonnier.update({
    moverPositions: content.pigeonnierMoverPositions,
    reducedMotion: frame.reducedMotion,
    timeSeconds: frame.timeSeconds,
  });
  syncShipRippleRings(scene.water.rippleRings, content.ships, {
    reducedMotion: frame.reducedMotion,
    tier: seaQualityTier(frame.renderScheduler),
  });
  // W4.F7/F8: the stern chōchin and the standing rig follow the hero band
  // (at night the far fleet is embers, by day it is ink — neither carries a
  // lamp or a stay) and each hull's display presence. The rig's alpha is its
  // projected coverage, so it needs the drawing-buffer scale.
  lanternFrameContent = content;
  const fovY = (camera as PerspectiveCamera).isPerspectiveCamera
    ? MathUtils.degToRad((camera as PerspectiveCamera).fov)
    : 0;
  lanternFrame.cameraQuaternion = camera.quaternion;
  lanternFrame.eye = camera.position;
  lanternFrame.pixelsPerUnitAtUnitDistance = fovY > 0
    ? frame.height * frame.dpr / (2 * Math.tan(fovY / 2))
    : 0;
  lanternFrame.hoveredDetailId = frame.hoveredDetailId;
  lanternFrame.selectedDetailId = frame.selectedDetailId;
  lanternFrame.reducedMotion = frame.reducedMotion;
  lanternFrame.timeSeconds = frame.reducedMotion ? 0 : frame.timeSeconds;
  updateFleetLanterns(content.fleetLanterns, lanternFrame);
  lanternFrameContent = null;
}

/** The content the lantern callbacks read; set only for the duration of the call. */
let lanternFrameContent: GardenShipFrameContent | null = null;

function fleetLanternPresence(visual: ShipVisual): number {
  const content = lanternFrameContent!;
  // The lamp kindles and dims with the hero band's eased weight (W5: no pop).
  return gardenFleetShipHeroWeight(content.fleetBatches, visual.ship.id)
    * (content.fleetDisplayPresenceByShipId.get(visual.ship.id) ?? 1);
}

/** One record for the renderer's lifetime; refreshed in place each frame. */
const lanternFrame: FleetLanternFrame = {
  cameraQuaternion: new Quaternion(),
  presence: fleetLanternPresence,
  reducedMotion: false,
  timeSeconds: 0,
};
