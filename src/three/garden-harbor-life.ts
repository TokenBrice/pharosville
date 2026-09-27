import {
  AdditiveBlending,
  Color,
  PlaneGeometry,
  Vector2,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import type { WeatherPlan } from "../systems/weather";

/**
 * The harbour's small night life: the fireflies over the near reed bed. W5.3
 * moved the gull flock to `garden-summit-birds.ts`, where the birds have wings.
 */

export const GARDEN_FIREFLY_COUNT = 9;

export interface GardenFirefliesUpdate {
  /** The decorative tiers (full, balanced, interaction); constrained and recovery keep the night empty. */
  beautyTier: boolean;
  night: number;
  reducedMotion: boolean;
  timeSeconds: number;
  /**
   * Phase 4: wind-coupled drift. Gusts push the swarm downwind and each mote
   * swims back home on its own slow cycle — a pure function of the weather
   * plan and the clock, frozen flat under reduced motion.
   */
  weather?: Pick<WeatherPlan, "wind">;
}

export interface GardenFireflies {
  root: Group;
  update(input: GardenFirefliesUpdate): void;
}

/**
 * Peak glow, HDR multiple of the lantern glow colour: under the lanterns'
 * ≤ 2.0 swell, but enough to survive the night grade as a point of light.
 */
const FIREFLY_GLOW = 1.4;
/** Screen floor for one mote, px: a readable point at the rest distance. */
const FIREFLY_MIN_PIXELS = 3;
/** Seconds a firefly's glow takes to rise and fall in each cycle. */
const FIREFLY_FLASH_SECONDS = 1.2;

/**
 * X5 (life-7): a few fireflies over the reed bed the rest seat sees, on
 * early-summer nights. Each is a slow blinking point — a soft 1.2 s rise and
 * fall, then a long dark (genji-botaru, 3–5.5 s a cycle) — drifting a little
 * over the reeds. Additive and dimmer than any lantern. Decorative tiers only; reduced
 * motion freezes them in one static pose (some lit, some dark). One instanced
 * draw.
 *
 * `reedBed` is the bed's world centre on the water; `alongX` whether the bed
 * runs along world x (its bearing is 0) or along z.
 */
export function createGardenFireflies(
  reedBed: { x: number; y: number; z: number },
  bed: { alongX: boolean; halfLength: number; halfWidth: number } = { alongX: true, halfLength: 1.7, halfWidth: 0.9 },
): GardenFireflies {
  const root = new Group();
  root.name = "garden-fireflies";
  root.position.set(reedBed.x, reedBed.y, reedBed.z);

  const material = new MeshBasicMaterial({
    blending: AdditiveBlending,
    color: new Color(HARBOR_PALETTE.lantern_glow).multiplyScalar(FIREFLY_GLOW),
    depthWrite: false,
    opacity: 0,
    toneMapped: false,
    transparent: true,
  });
  const motes = new InstancedMesh(
    new PlaneGeometry(0.15, 0.15),
    material,
    GARDEN_FIREFLY_COUNT,
  );
  motes.name = "garden-firefly-motes";
  motes.frustumCulled = false;
  motes.renderOrder = 9;
  const viewport = { value: new Vector2(1, 1) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.keeperViewport = viewport;
    shader.vertexShader = `uniform vec2 keeperViewport;\n${shader.vertexShader}`;
    shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", `
      vec4 centre = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      vec4 mvPosition = modelViewMatrix * centre;
      float pixelsPerUnit = keeperViewport.y * projectionMatrix[1][1] / (2.0 * max(0.001, -mvPosition.z));
      float scale = max(length(instanceMatrix[0].xyz), ${FIREFLY_MIN_PIXELS.toFixed(1)} / (0.15 * pixelsPerUnit));
      mvPosition.xy += position.xy * scale;
      gl_Position = projectionMatrix * mvPosition;
    `);
  };
  material.customProgramCacheKey = () => "garden-firefly-billboard-v2";
  motes.onBeforeRender = (renderer) => { renderer.getSize(viewport.value); };
  root.add(motes);

  // Per-mote seeds, drawn once: home over the reeds, height, drift, blink.
  const homeA = new Float32Array(GARDEN_FIREFLY_COUNT);
  const homeB = new Float32Array(GARDEN_FIREFLY_COUNT);
  const height = new Float32Array(GARDEN_FIREFLY_COUNT);
  const period = new Float32Array(GARDEN_FIREFLY_COUNT);
  const phase = new Float32Array(GARDEN_FIREFLY_COUNT);
  for (let index = 0; index < GARDEN_FIREFLY_COUNT; index += 1) {
    const seed = index * 2.399;
    homeA[index] = Math.sin(seed * 1.7) * bed.halfLength;
    homeB[index] = Math.cos(seed * 2.3) * bed.halfWidth;
    height[index] = 1.4 + ((index * 7) % GARDEN_FIREFLY_COUNT) / GARDEN_FIREFLY_COUNT * 1.6;
    period[index] = 3 + ((index * 5) % GARDEN_FIREFLY_COUNT) / GARDEN_FIREFLY_COUNT * 2.5;
    phase[index] = ((index * 0.618) % 1) * period[index]!;
  }
  const glow = new Color();
  const dummy = new Object3D();
  const update = ({ beautyTier, night, reducedMotion, timeSeconds, weather }: GardenFirefliesUpdate): void => {
    const visible = beautyTier && night > 0.25;
    root.visible = visible;
    if (!visible) return;
    material.opacity = Math.min(1, (night - 0.25) * 1.6);
    const time = reducedMotion ? 0 : timeSeconds;
    // Phase 4: the gust envelope sets how far the swarm leaks downwind; each
    // mote fights back to its reeds on its own slow sine.
    const push = reducedMotion ? 0 : (weather?.wind.speed ?? 0) * (0.3 + (weather?.wind.gust ?? 0) * 0.5);
    const windX = weather?.wind.x ?? 0;
    const windZ = weather?.wind.y ?? 0;
    for (let index = 0; index < GARDEN_FIREFLY_COUNT; index += 1) {
      const seed = index * 2.399;
      const drift = 0.35 + (index % 3) * 0.15;
      const leak = push * (1 + Math.sin(time * 0.07 + seed * 1.3));
      const along = homeA[index]! + Math.sin(time * 0.13 + seed) * drift;
      const across = homeB[index]! + Math.cos(time * 0.11 + seed * 0.6) * drift * 0.6;
      dummy.position.set(
        (bed.alongX ? along : across) + windX * leak,
        height[index]! + Math.sin(time * 0.23 + seed * 1.7) * 0.2,
        (bed.alongX ? across : along) + windZ * leak,
      );
      dummy.updateMatrix();
      motes.setMatrixAt(index, dummy.matrix);
      // The blink: a soft rise and fall, dark for the rest of the cycle.
      const cycle = ((time + phase[index]!) % period[index]!) / FIREFLY_FLASH_SECONDS;
      const lit = cycle < 1 ? Math.sin(Math.PI * cycle) ** 2 : 0;
      motes.setColorAt(index, glow.setScalar(lit));
    }
    motes.instanceMatrix.needsUpdate = true;
    if (motes.instanceColor) motes.instanceColor.needsUpdate = true;
  };
  update({ beautyTier: true, night: 1, reducedMotion: true, timeSeconds: 0 });
  return { root, update };
}
