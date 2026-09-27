import {
  PlaneGeometry,
  Vector2,
  Group,
  InstancedMesh,
  MeshBasicMaterial,
  Object3D,
} from "three";
import type { ScreenPoint } from "../systems/projection";
import type { WeatherPlan } from "../systems/weather";

/**
 * The island's small night life. W5.3 moved the gull flock to
 * `garden-summit-birds.ts`, where the birds have wings.
 */

export interface GardenHarborLifeOptions {
  tileScale?: number;
}

export const GARDEN_FIREFLY_COUNT = 14;

export interface GardenFirefliesUpdate {
  fullTier: boolean;
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
 * A handful of warm motes drifting near the island's path lanterns at night.
 * Full tier only; reduced motion freezes them at their seed positions. One
 * instanced additive mesh — a single extra draw call.
 */
export function createGardenFireflies(
  lanternOffsets: ReadonlyArray<{ x: number; y: number; z: number }>,
  islandTile: ScreenPoint,
  options: Pick<GardenHarborLifeOptions, "tileScale"> = {},
): GardenFireflies {
  const tileScale = options.tileScale ?? DEFAULT_TILE_SCALE;
  const root = new Group();
  root.name = "garden-fireflies";
  root.position.set(islandTile.x * tileScale, 0, islandTile.y * tileScale);

  const material = new MeshBasicMaterial({
    color: "#f7d68a",
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
      float scale = max(length(instanceMatrix[0].xyz), 1.5 / (0.15 * pixelsPerUnit));
      mvPosition.xy += position.xy * scale;
      gl_Position = projectionMatrix * mvPosition;
    `);
  };
  material.customProgramCacheKey = () => "garden-firefly-billboard-v1";
  motes.onBeforeRender = (renderer) => { renderer.getSize(viewport.value); };
  root.add(motes);

  const dummy = new Object3D();
  const update = ({ fullTier, night, reducedMotion, timeSeconds, weather }: GardenFirefliesUpdate): void => {
    const visible = fullTier && night > 0.25 && lanternOffsets.length > 0;
    root.visible = visible;
    if (!visible) return;
    material.opacity = Math.min(0.85, (night - 0.25) * 1.4);
    const time = reducedMotion ? 0 : timeSeconds;
    // Phase 4: the gust envelope sets how far the swarm leaks downwind; each
    // mote fights back to its lantern on its own slow sine, so the swarm
    // breathes with the weather instead of translating as a sheet.
    const push = reducedMotion ? 0 : (weather?.wind.speed ?? 0) * (0.5 + (weather?.wind.gust ?? 0) * 0.9);
    const windX = weather?.wind.x ?? 0;
    const windZ = weather?.wind.y ?? 0;
    for (let index = 0; index < GARDEN_FIREFLY_COUNT; index += 1) {
      // One shaded arc, never a ring of competing lantern-adjacent sparks.
      const anchor = lanternOffsets[0]!;
      const seed = index * 2.399;
      const drift = 0.55 + (index % 3) * 0.22;
      const leak = push * (1.4 + Math.sin(time * 0.07 + seed * 1.3));
      dummy.position.set(
        anchor.x - 1.8 + Math.sin(seed / GARDEN_FIREFLY_COUNT * 0.9) * 2.4
          + Math.sin(time * 0.21 + seed) * drift + windX * leak,
        anchor.y + 0.35 + Math.sin(time * 0.34 + seed * 1.7) * 0.3,
        anchor.z + Math.cos(time * 0.17 + seed * 0.6) * drift + windZ * leak,
      );
      const pulse = 0.6 + 0.4 * Math.sin(time * 0.9 + seed * 3.1);
      dummy.scale.setScalar(0.7 + pulse * 0.5);
      dummy.updateMatrix();
      motes.setMatrixAt(index, dummy.matrix);
    }
    motes.instanceMatrix.needsUpdate = true;
  };
  update({ fullTier: true, night: 1, reducedMotion: true, timeSeconds: 0 });
  return { root, update };
}

const DEFAULT_TILE_SCALE = Math.SQRT2;
