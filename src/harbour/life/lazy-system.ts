import type { EngineContext, FrameState, WorldSystem } from "../engine/types";

/** A static implementation import would put deferred people/gull code back in the main chunk. */
export class LazyLifeSystem implements WorldSystem {
  readonly name = "life";
  private system: WorldSystem | undefined;

  async init(ctx: EngineContext): Promise<void> {
    const { LifeSystem } = await import("./life-system");
    this.system = new LifeSystem();
    await this.system.init(ctx);
  }

  update(frame: FrameState, ctx: EngineContext): void { this.system?.update(frame, ctx); }
  resize(width: number, height: number, ctx: EngineContext): void { this.system?.resize?.(width, height, ctx); }
  dispose(ctx: EngineContext): void { this.system?.dispose(ctx); this.system = undefined; }
}
