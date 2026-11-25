import type { EngineContext, FrameState, WorldSystem } from "./engine/types";
import { abortable } from "./engine/transport";
import { LayoutSystem } from "./layout/layout-system";
import { DataSystem } from "./sim/system";
import { SkySystem } from "./sky/sky-system";
import { OceanSystem } from "./ocean/ocean-system";
import { BeamSystem } from "./beam/beam-system";
import { IslandSystem } from "./world/island-system";
import { LighthouseSystem } from "./world/lighthouse-system";
import { LightsSystem } from "./lights/lights-system";
import { FleetSystem } from "./fleet/fleet-system";
import { ReadingsSystem } from "./readings/readings-system";
import { LazyLifeSystem } from "./life/lazy-system";
import { LazyIdentitySystem } from "./identity/lazy-system";
import { CivicSystem } from "./civic/civic-system";
import { OfficeWorksSystem } from "./civic/office-works";
import { MomentsStage } from "./life/moments-stage";
import { WeatherSystem } from "./weather/weather-system";
import { SeasonSystem } from "./season/season-system";

/** Keeps vegetation-system.ts out of harbour-app while awaiting it before Frame 1, right after IslandSystem.renderGround(). */
class LazyVegetationSystem implements WorldSystem {
  readonly name = "vegetation";
  private system: WorldSystem | undefined;

  async init(ctx: EngineContext): Promise<void> {
    ctx.signal?.throwIfAborted();
    const { VegetationSystem } = await abortable(import("./world/vegetation-system"), ctx.signal);
    ctx.signal?.throwIfAborted();
    this.system = new VegetationSystem();
    await this.system.init(ctx);
  }

  update(frame: FrameState, ctx: EngineContext): void { this.system?.update(frame, ctx); }
  resize(width: number, height: number, ctx: EngineContext): void { this.system?.resize?.(width, height, ctx); }
  dispose(ctx: EngineContext): void { this.system?.dispose(ctx); this.system = undefined; }
}

/**
 * Ordered registry of world systems. Each owner appends its factory here (keep order):
 *   layout → sky → ocean → island/kit → vegetation → lighthouse → fleet → lights → labels
 */
export const SYSTEMS: Array<() => WorldSystem> = [
  () => new SeasonSystem(), // first: the calendar sets the day, foliage and snow before anything compiles
  () => new LayoutSystem(),
  () => new DataSystem(),
  () => new ReadingsSystem(),
  () => new WeatherSystem(),
  () => new SkySystem(),
  () => new OceanSystem(),
  () => new IslandSystem(),
  () => new LazyVegetationSystem(), // right after IslandSystem so renderGround() finishes before canopy meshes join the scene
  () => new LighthouseSystem(),
  () => new CivicSystem(),
  () => new FleetSystem(),
  () => new LazyLifeSystem(),
  () => new LazyIdentitySystem(),
  () => new OfficeWorksSystem(), // T6: after identity (it rolls the awnings the identity layer dressed)
  () => new MomentsStage(), // staged data moments (events service): launch dressing, the reef beacon's flare
  () => new LightsSystem(),
  () => new BeamSystem(),
];
