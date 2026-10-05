/**
 * The static directional shadow rig: the key light that casts, its fitted
 * orthographic shadow camera, the re-steer thresholds that decide when the
 * cached map is redrawn, the PCF configuration, and the caster flagging for
 * static world subtrees.
 *
 * Extracted from `world-renderer.ts` (Hour-Print W0.24). The contract is
 * unchanged: casters are static (island, lighthouse, shore stations, sea
 * edges), so `shadow.autoUpdate` stays false and the map is redrawn only when
 * the rig re-steers (unbreathed visitor pose past half a world unit / half a
 * degree, aspect change, or sun bearing past `SHADOW_RESTEER_RADIANS`), when the map size
 * changes with the sea-quality tier, or when a caller sets `shadowNeedsRender`
 * (content rebuild, GLB swap, context restore). Ships never cast into it.
 *
 * Per frame the renderer calls `captureGardenShadowView` with its unbreathed
 * shadow-view camera after that camera's matrices are final, then
 * `updateGardenShadows` with the same pose after the scene update. K16 idle
 * breath still moves the color/picking camera, never this static-map key.
 * All fit scratch is module state; the hot path allocates nothing.
 */
import {
  type Box3,
  DirectionalLight,
  Frustum,
  InstancedMesh,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  Plane,
  Quaternion,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
  type WebGLRenderer,
} from "three";
import type { ThreeWorldRendererFrame } from "../renderer/world-renderer-backend";
import { seaQualityTier } from "../renderer/render-scheduler";
import { TILE_SCALE } from "../systems/projection";
import {
  PHAROSVILLE_MAP_HEIGHT,
  PHAROSVILLE_MAP_WIDTH,
} from "../systems/world-layout";
import type { DayCyclePhase } from "./garden-day-cycle";
import { gardenKeyLightPose, type GardenLightPose } from "./garden-sun";

/** Epic Pharos 2026-09-05 sceptre tip — the tallest caster sizes the frustum. */
const SHADOW_CASTER_HEIGHT = 38;
/** Conservative bootstrap until the first world-derived fit is applied. */
const GARDEN_SHADOW_INITIAL_RADIUS = 128;
/** Clears the finite plate and its static casters along every sun bearing. */
const SHADOW_LIGHT_DISTANCE = 260;
/** Sun and camera orientation share the half-degree re-fit threshold. */
const SHADOW_RESTEER_RADIANS = Math.PI / 360;
/** PCF radius (texels) with the sun high, and with it on the horizon (light-7). */
const GARDEN_SHADOW_NOON_RADIUS = 3;
const GARDEN_SHADOW_LOW_SUN_RADIUS = 7;

/** Reused across frames so the shadow rig allocates nothing in the hot path. */
const scratchKeyPose: GardenLightPose = {
  direction: new Vector3(0, 1, 0),
  elevation: Math.PI / 2,
};
const cameraViewFrustum = new Frustum();
const cameraViewMatrix = new Matrix4();
const shadowFrustumCorners = Array.from({ length: 8 }, () => new Vector3());
/** The shown threshold's bounds as box corners, same bit order as the plate. */
const shadowThresholdCorners = Array.from({ length: 8 }, () => new Vector3());
const shadowPlateCorners = Array.from({ length: 8 }, (_, index) => new Vector3(
  (index & 1) ? PHAROSVILLE_MAP_WIDTH * TILE_SCALE : 0,
  (index & 2) ? SHADOW_CASTER_HEIGHT : 0,
  (index & 4) ? PHAROSVILLE_MAP_HEIGHT * TILE_SCALE : 0,
));
const shadowPlatePlanes = [
  new Plane(new Vector3(1, 0, 0), 0),
  new Plane(new Vector3(-1, 0, 0), PHAROSVILLE_MAP_WIDTH * TILE_SCALE),
  new Plane(new Vector3(0, 1, 0), 0),
  new Plane(new Vector3(0, -1, 0), SHADOW_CASTER_HEIGHT),
  new Plane(new Vector3(0, 0, 1), 0),
  new Plane(new Vector3(0, 0, -1), PHAROSVILLE_MAP_HEIGHT * TILE_SCALE),
];
/** Inward faces of the shown threshold's box, in the plate planes' order. */
const shadowThresholdPlanes = [
  new Plane(new Vector3(1, 0, 0), 0),
  new Plane(new Vector3(-1, 0, 0), 0),
  new Plane(new Vector3(0, 1, 0), 0),
  new Plane(new Vector3(0, -1, 0), 0),
  new Plane(new Vector3(0, 0, 1), 0),
  new Plane(new Vector3(0, 0, -1), 0),
];
const shadowFitPoint = new Vector3();
const shadowFitMin = new Vector3();
const shadowFitMax = new Vector3();

/**
 * The key light plus the state that decides when its cached map is redrawn.
 * `GardenScene` extends this, so the rig's fields live flat on the scene.
 */
export interface GardenShadowRig {
  directionalLight: DirectionalLight;
  /** Map edge length the last frame drew with; 0 while shadows are shed. */
  shadowActiveSize: number;
  /** Sun bearing the current shadow map was drawn for; drives the re-steer. */
  shadowLightDirection: Vector3;
  /** Camera pose the current fit was taken from; drives the view re-steer. */
  shadowViewPosition: Vector3;
  shadowViewRotation: Quaternion;
  shadowViewAspect: number;
  /** Whether the current fit folded in the rest threshold's bounds. */
  shadowFitHasThreshold: boolean;
  /** Set to force one redraw of the static map on the next frame. */
  shadowNeedsRender: boolean;
}

/**
 * Renderer-level shadow configuration; call once on construction.
 *
 * D3 / W2.2: soft harbour-wide static shadows. Supported tiers share the
 * shadow shader variant; constrained disables the caster (see
 * `updateGardenShadows`) so a cold start never binds an absent PCF depth map.
 *
 * W2.2 correction: this said `PCFSoftShadowMap`, which three 0.185 rewrites to
 * `PCFShadowMap` on the first shadow render while logging a deprecation
 * warning (WebGLShadowMap.js:99). So the world has been drawing PCF all along
 * and the softness knob is `shadow.radius` (Vogel-disk sample radius in
 * texels, hardware-PCF filtered — 5 taps ≈ 20 filtered taps, set in
 * `createGardenShadowRig`), not the map type. Naming the type we actually get
 * makes that knob findable and drops the warning.
 */
export function configureGardenShadowRenderer(renderer: WebGLRenderer): void {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
}

/**
 * Builds the key light with its bootstrap shadow camera and bias/PCF settings,
 * plus the initial re-steer state. The caller adds the light (and later its
 * target) to the scene at the child indices the renderer tests assert.
 */
export function createGardenShadowRig(): GardenShadowRig {
  const directionalLight = new DirectionalLight("#ffe8b5", 2.3);
  // Bootstrap only; the first frame fits the visible plate before rendering.
  directionalLight.position.set(-35, 48, -30);
  // updateGardenShadows retains the fitted sun rig between hysteresis thresholds.
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  // W2.2 bias hygiene. The old pair (-0.0005 / 0.8) was fitted to a 1024 map
  // over the island alone — one texel was ~0.06 units there, so a 0.8-unit
  // normal offset was ~13 texels of slop, which the island's chunky terraces
  // hid but the harbour's thin dock planks and quay copings would not (offsets
  // that large slide a plank's shadow off the plank — peter-panning). At
  // At the dense station fit one texel is ~0.11 world units at noon, so the
  // offset remains a few texels while clearing acne on the terraces.
  //
  // `bias` is in normalized depth, so it scales with the ortho depth range:
  // -0.00015 over the ~389-unit near/far span is ~0.058 world units, preserving
  // the old world-space slop after extending the light for remote stations.
  directionalLight.shadow.bias = -0.00015;
  directionalLight.shadow.normalBias = 0.35;
  // Vogel-disk PCF radius, in texels (see the shadowMap.type note above). The
  // bootstrap is the noon value; `updateGardenShadows` widens it at low sun.
  // 3 texels at noon keeps a bollard touching the deck it stands on.
  directionalLight.shadow.radius = GARDEN_SHADOW_NOON_RADIUS;
  const shadowCamera = directionalLight.shadow.camera;
  shadowCamera.left = -GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.right = GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.top = GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.bottom = -GARDEN_SHADOW_INITIAL_RADIUS;
  shadowCamera.near = 1;
  shadowCamera.far = SHADOW_LIGHT_DISTANCE + GARDEN_SHADOW_INITIAL_RADIUS + 2;
  shadowCamera.updateProjectionMatrix();
  return {
    directionalLight,
    shadowActiveSize: 0,
    // Deliberately not a legal light direction, so the first frame always
    // re-steers and draws the map for wherever the sun actually is.
    shadowLightDirection: new Vector3(0, 0, 0),
    shadowViewPosition: new Vector3(Infinity, Infinity, Infinity),
    shadowViewRotation: new Quaternion(),
    shadowViewAspect: 0,
    shadowFitHasThreshold: false,
    shadowNeedsRender: true,
  };
}

/**
 * Captures the camera's ground-bounded view volume (frustum corners and
 * planes) for the next `updateGardenShadows` fit. Call once per frame after
 * the camera's projection and world matrices are final.
 */
export function captureGardenShadowView(camera: PerspectiveCamera): void {
  // Bound the horizon-facing frustum by the farthest plate corner in view
  // depth; upward rays otherwise spend the map on empty sky.
  let groundFar = camera.near;
  for (const corner of shadowPlateCorners) {
    shadowFitPoint.copy(corner).applyMatrix4(camera.matrixWorldInverse);
    groundFar = Math.max(groundFar, -shadowFitPoint.z);
  }
  groundFar = Math.min(camera.far, groundFar);
  for (let index = 0; index < 8; index += 1) {
    const corner = shadowFrustumCorners[index]!;
    corner.set((index & 1) ? 1 : -1, (index & 2) ? 1 : -1, -1)
      .applyMatrix4(camera.projectionMatrixInverse)
      .multiplyScalar((index & 4) ? groundFar / camera.near : 1)
      .applyMatrix4(camera.matrixWorld);
  }
  cameraViewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  cameraViewFrustum.setFromProjectionMatrix(cameraViewMatrix);
}

/**
 * Named harbour meshes that are static and lit but must never enter the shadow
 * map: they ARE the light. A lamp head or a lit warehouse window dropping its
 * own shadow reads as a bug at any hour, and at low sun it reads as a smear.
 */
const SHADOW_CASTER_EXCLUDED_NAMES = new Set([
  "dock-chain-flag-cloth",
  "dock-chain-flag",
  "dock-warehouse-windows",
]);

/**
 * Flags one static subtree for the directional map: every lit surface casts,
 * every surface receives.
 *
 * Casting is keyed on MeshStandardMaterial because that is what "a real lit
 * surface" means in this world — the flat MeshBasicMaterial discs (island
 * shoal, zone tints) are transparent paint on the water
 * and would stamp hard-edged silhouettes if they were ever allowed in.
 *
 * `castsShadows` lets a caller keep a subtree as a receiver only. That is what
 * the docks' LOD-toggled fine detail needs: the map is rendered on re-steer and
 * content change, NOT per frame (updateGardenShadows), so anything whose `visible`
 * flips with zoom or hover would leave its shadow behind — or lose it — until
 * the next re-steer. Receiving has no such hazard: it is sampled per frame by
 * the material.
 */
export function flagStaticShadowUsers(root: Object3D, castsShadows = true): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh) && !(object instanceof InstancedMesh)) return;
    const material = object.material;
    const lit = Array.isArray(material)
      ? material.some((entry) => entry instanceof MeshStandardMaterial)
      : material instanceof MeshStandardMaterial;
    object.castShadow = castsShadows
      && lit
      && !object.name.startsWith("harbor-fine-")
      && !SHADOW_CASTER_EXCLUDED_NAMES.has(object.name);
    object.receiveShadow = true;
  });
}

/** Vertices of the convex intersection, projected directly into light space. */
function accumulateShadowEdges(corners: readonly Vector3[], planes: readonly Plane[], lightView: Matrix4): void {
  for (let index = 0; index < 8; index += 1) {
    for (let bit = 1; bit <= 4; bit *= 2) {
      if (index & bit) continue;
      const start = corners[index]!;
      const end = corners[index | bit]!;
      let enter = 0;
      let exit = 1;
      for (const plane of planes) {
        const a = plane.distanceToPoint(start);
        const b = plane.distanceToPoint(end);
        if (a < 0 && b < 0) {
          exit = -1;
          break;
        }
        if (a < 0) enter = Math.max(enter, a / (a - b));
        else if (b < 0) exit = Math.min(exit, a / (a - b));
      }
      if (enter > exit) continue;
      shadowFitPoint.lerpVectors(start, end, enter).applyMatrix4(lightView);
      shadowFitMin.min(shadowFitPoint);
      shadowFitMax.max(shadowFitPoint);
      shadowFitPoint.lerpVectors(start, end, exit).applyMatrix4(lightView);
      shadowFitMin.min(shadowFitPoint);
      shadowFitMax.max(shadowFitPoint);
    }
  }
}

/**
 * Fits the visible plate in light space, retaining the last fit while the
 * perspective pose breathes within half a world unit / half a degree.
 * Shadow-supported tiers share a shader variant and reallocate only when the
 * map size changes. Constrained removes the caster and its comparison sampler.
 *
 * `thresholdBounds` is the shown W1.5 rest threshold at its current placement
 * (null while hidden). It stands in front of and behind the eye, off the
 * plate: its visible part joins the XY fit and every one of its casters
 * (cedars to y 44, the tea-house behind the seat) joins the depth range.
 */
export function updateGardenShadows(
  rig: GardenShadowRig,
  camera: PerspectiveCamera,
  frame: Pick<ThreeWorldRendererFrame, "renderScheduler" | "wallClockHour">,
  phase: DayCyclePhase,
  thresholdBounds: Box3 | null,
  onTraceEvent?: (kind: string, value?: number, detail?: string) => void,
): number {
  const light = rig.directionalLight;
  const pose = gardenKeyLightPose(frame.wallClockHour, phase, scratchKeyPose);
  const direction = pose.direction;
  // W2.13 (light-7): long low-sun shadows end in a brush-soft tip instead of
  // an aliased one; noon stays crisp. The radius is a sampling uniform, so it
  // costs no map redraw and no extra taps.
  const lowSun = 1 - MathUtils.smoothstep(pose.elevation, 0.12, 0.5);
  light.shadow.radius = MathUtils.lerp(GARDEN_SHADOW_NOON_RADIUS, GARDEN_SHADOW_LOW_SUN_RADIUS, lowSun);
  const viewChanged = camera.position.distanceToSquared(rig.shadowViewPosition) > 0.25
    || camera.quaternion.angleTo(rig.shadowViewRotation) > Math.PI / 360
    || camera.aspect !== rig.shadowViewAspect
    || (thresholdBounds !== null) !== rig.shadowFitHasThreshold;
  const sunChanged = direction.angleTo(rig.shadowLightDirection) > SHADOW_RESTEER_RADIANS;
  if (viewChanged || sunChanged) {
    const centerX = PHAROSVILLE_MAP_WIDTH * TILE_SCALE / 2;
    const centerZ = PHAROSVILLE_MAP_HEIGHT * TILE_SCALE / 2;
    light.target.position.set(centerX, 0, centerZ);
    light.position.set(
      centerX + direction.x * SHADOW_LIGHT_DISTANCE,
      direction.y * SHADOW_LIGHT_DISTANCE,
      centerZ + direction.z * SHADOW_LIGHT_DISTANCE,
    );
    light.updateMatrixWorld();
    light.target.updateMatrixWorld();
    light.shadow.updateMatrices(light);
    const shadowCamera = light.shadow.camera;
    shadowFitMin.set(Infinity, Infinity, Infinity);
    shadowFitMax.set(-Infinity, -Infinity, -Infinity);
    // Clip BOTH sets of box edges. This also handles a plate fully enclosed
    // by the view, and a narrow view entirely inside the plate.
    accumulateShadowEdges(shadowFrustumCorners, shadowPlatePlanes, shadowCamera.matrixWorldInverse);
    accumulateShadowEdges(shadowPlateCorners, cameraViewFrustum.planes, shadowCamera.matrixWorldInverse);
    if (thresholdBounds) {
      for (let index = 0; index < 8; index += 1) {
        shadowThresholdCorners[index]!.set(
          (index & 1) ? thresholdBounds.max.x : thresholdBounds.min.x,
          (index & 2) ? thresholdBounds.max.y : thresholdBounds.min.y,
          (index & 4) ? thresholdBounds.max.z : thresholdBounds.min.z,
        );
      }
      shadowThresholdPlanes[0]!.constant = -thresholdBounds.min.x;
      shadowThresholdPlanes[1]!.constant = thresholdBounds.max.x;
      shadowThresholdPlanes[2]!.constant = -thresholdBounds.min.y;
      shadowThresholdPlanes[3]!.constant = thresholdBounds.max.y;
      shadowThresholdPlanes[4]!.constant = -thresholdBounds.min.z;
      shadowThresholdPlanes[5]!.constant = thresholdBounds.max.z;
      // The eye stands inside this box, so both edge sets are needed here too.
      accumulateShadowEdges(shadowFrustumCorners, shadowThresholdPlanes, shadowCamera.matrixWorldInverse);
      accumulateShadowEdges(shadowThresholdCorners, cameraViewFrustum.planes, shadowCamera.matrixWorldInverse);
    }
    if (Number.isFinite(shadowFitMin.x)) {
      shadowCamera.left = shadowFitMin.x - 8;
      shadowCamera.right = shadowFitMax.x + 8;
      shadowCamera.bottom = shadowFitMin.y - 8;
      shadowCamera.top = shadowFitMax.y + 8;
      // Offscreen architecture upstream still casts into the visible plate:
      // retain its light-space depth even though the XY fit is view-limited.
      for (const corner of shadowPlateCorners) {
        shadowFitPoint.copy(corner).applyMatrix4(shadowCamera.matrixWorldInverse);
        shadowFitMin.z = Math.min(shadowFitMin.z, shadowFitPoint.z);
        shadowFitMax.z = Math.max(shadowFitMax.z, shadowFitPoint.z);
      }
      if (thresholdBounds) {
        for (const corner of shadowThresholdCorners) {
          shadowFitPoint.copy(corner).applyMatrix4(shadowCamera.matrixWorldInverse);
          shadowFitMin.z = Math.min(shadowFitMin.z, shadowFitPoint.z);
          shadowFitMax.z = Math.max(shadowFitMax.z, shadowFitPoint.z);
        }
      }
      shadowCamera.near = Math.max(1, -shadowFitMax.z - 8);
      shadowCamera.far = Math.max(shadowCamera.near + 1, -shadowFitMin.z + 8);
      shadowCamera.updateProjectionMatrix();
    }
    rig.shadowViewPosition.copy(camera.position);
    rig.shadowViewRotation.copy(camera.quaternion);
    rig.shadowViewAspect = camera.aspect;
    rig.shadowFitHasThreshold = thresholdBounds !== null;
    rig.shadowLightDirection.copy(direction);
    rig.shadowNeedsRender = true;
    onTraceEvent?.("shadow-invalidate", (viewChanged ? 1 : 0) | (sunChanged ? 2 : 0), "view/sun-bitmask");
  }

  // W6.2 (Grand Scale Revamp): shadows survive down to `recovery`.
  //
  // The casters (island, lighthouse, and shore stations) are static and the light
  // direction moves only on the re-steer threshold above, so
  // `autoUpdate = false` means the map is rendered on scene change and on
  // re-steer, not per frame — the recurring cost is still just the PCF taps in
  // the receiving materials.
  //
  // Dropping that at `recovery` bought almost nothing
  // while removing the single strongest cue that the island has form, and on
  // an integrated GPU at 1080p the app sits in `recovery` most of the time, so
  // in practice the monument was ALWAYS flat-lit (plan finding F1).
  //
  // `constrained` still drops them: that tier means the machine is genuinely
  // drowning and every pass has to go.
  // S1: resolved through seaQualityTier. Keying the map size on the raw tier
  // meant a camera drag reallocated the shadow map 1024 -> 384 and back on
  // release — a visible softening of the island's shadow on every pan, plus a
  // GPU reallocation per drag, for a tier that says nothing about load.
  //
  // Resolution is unchanged; only the visible-plate fit changes on camera
  // reframe or sun re-steer. Recurring PCF sampling cost is unchanged.
  const shadowTier = seaQualityTier(frame.renderScheduler);
  const size = shadowTier === "full"
    ? 2048
    : shadowTier === "balanced"
      ? 1024
      : shadowTier === "constrained"
        ? 0
        : 768;
  // Intensity zero still samples the PCF depth texture. On a cold constrained
  // start no map exists, and Three's unallocated shadow-array fallback binds a
  // color texture to sampler2DShadow, invalidating every receiving mesh draw.
  // Remove the sampler entirely while shadows are disabled.
  light.castShadow = size > 0;
  if (size === 0) {
    light.shadow.intensity = 0;
    light.shadow.autoUpdate = false;
    rig.shadowActiveSize = 0;
    return 0;
  }
  light.shadow.intensity = 1;
  // The casters (island, lighthouse, and all shore stations) are
  // static, so the shadow map only needs re-rendering when the scene, the
  // frustum size, or the sun's bearing changes — not every frame. This keeps
  // the extra pass near-zero cost. Ships stay out of the map for exactly this
  // reason: one moving caster would make it a per-frame pass again.
  light.shadow.autoUpdate = false;
  if (light.shadow.mapSize.width !== size) {
    light.shadow.mapSize.set(size, size);
    // Force a reallocation at the new size (three only builds the map when null).
    light.shadow.map?.dispose();
    light.shadow.map = null;
    onTraceEvent?.("shadow-map-resize", size);
    rig.shadowNeedsRender = true;
  }
  if (rig.shadowActiveSize !== size) rig.shadowNeedsRender = true;
  rig.shadowActiveSize = size;
  if (rig.shadowNeedsRender) {
    light.shadow.needsUpdate = true;
    onTraceEvent?.("shadow-refresh-request", size);
    rig.shadowNeedsRender = false;
  }
  return size;
}
