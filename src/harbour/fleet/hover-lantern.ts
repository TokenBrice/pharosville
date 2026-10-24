import type { EngineContext } from "../engine/types";
import type { LightsService } from "../lights/lights-service";

/** Warm oil light of the hovered hull's lantern and the radius of its pool on the water (m). */
const COLOR = "#FFC27A";
const POOL_M = 3.2;
/** Re-place the pool only after the hull has moved this far (a pooled light re-projects on move). */
const MOVE_M = 1.5;

/**
 * Physical hover (12-M5): the hull under the pointer shows her lantern and throws a tiny warm pool on
 * the water. One pooled 'lamp' slot in the lights service, added on hover and removed when it ends; the
 * lights system scales it with the window glow, so it is a night-time answer (by day the fleet shader's
 * sail sheen answers instead). Decorative feedback only: the hover tag carries the text.
 */
export class HoverLantern {
  private id = -1;
  private boat: string | null = null;
  private x = 0;
  private z = 0;

  update(ctx: EngineContext, hovered: { id: string; cx: number; cy: number; cz: number; top: number } | undefined): void {
    const lights = ctx.services.get("lights") as LightsService | undefined;
    if (!lights) return;
    if (!hovered) { this.clear(lights); return; }
    const y = hovered.cy + Math.min(3, hovered.top * 0.2);
    if (hovered.id !== this.boat || this.id < 0) {
      this.clear(lights);
      this.boat = hovered.id;
      this.x = hovered.cx; this.z = hovered.cz;
      this.id = lights.add("lamp", [hovered.cx, y, hovered.cz], COLOR, POOL_M);
      return;
    }
    if (Math.hypot(hovered.cx - this.x, hovered.cz - this.z) > MOVE_M) {
      this.x = hovered.cx; this.z = hovered.cz;
      lights.setPosition(this.id, [hovered.cx, y, hovered.cz]);
    }
  }

  private clear(lights: LightsService): void {
    if (this.id >= 0) lights.remove(this.id);
    this.id = -1;
    this.boat = null;
  }
}
