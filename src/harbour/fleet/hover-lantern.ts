import type { EngineContext } from "../engine/types";
import type { LightsService } from "../lights/lights-service";

/** Warm oil light of the hovered hull's lantern and the radius of its pool on the water (m). */
const COLOR = "#FFC27A";
const POOL_M = 3.2;
/** Re-place the pool only after the hull has moved this far (a pooled light re-projects on move). */
const MOVE_M = 1.5;
/** Fade in / out (s): the lantern is turned up and down, never switched. */
const FADE_IN = 0.18;
const FADE_OUT = 0.24;

interface Lamp { id: number; k: number }

/**
 * Physical hover (12-M5): the hull under the pointer shows her lantern and throws a tiny warm pool on
 * the water. One pooled 'lamp' slot in the lights service, added on hover, eased up over ~180 ms and down
 * over ~240 ms when the hover ends (moving to another hull fades one down while the next comes up); the
 * lights system scales it with the window glow, so it is a night-time answer (by day the fleet shader's
 * sail sheen answers instead). Decorative feedback only: the hover tag carries the text.
 */
export class HoverLantern {
  private cur: Lamp | null = null;
  private readonly fading: Lamp[] = [];
  private boat: string | null = null;
  private x = 0;
  private z = 0;
  private last = -1;

  update(ctx: EngineContext, hovered: { id: string; cx: number; cy: number; cz: number; top: number } | undefined): void {
    const lights = ctx.services.get("lights") as LightsService | undefined;
    if (!lights) return;
    const now = performance.now();
    const dt = this.last < 0 ? 0 : Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (!hovered) this.release();
    else {
      const y = hovered.cy + Math.min(3, hovered.top * 0.2);
      if (hovered.id !== this.boat || !this.cur) {
        this.release();
        this.boat = hovered.id;
        this.x = hovered.cx; this.z = hovered.cz;
        this.cur = { id: lights.add("lamp", [hovered.cx, y, hovered.cz], COLOR, POOL_M), k: 0 };
        this.set(lights, this.cur);
      } else if (Math.hypot(hovered.cx - this.x, hovered.cz - this.z) > MOVE_M) {
        this.x = hovered.cx; this.z = hovered.cz;
        lights.setPosition(this.cur.id, [hovered.cx, y, hovered.cz]);
      }
    }
    if (this.cur && this.cur.k < 1) { this.cur.k = Math.min(1, this.cur.k + dt / FADE_IN); this.set(lights, this.cur); }
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.k -= dt / FADE_OUT;
      if (f.k <= 0) { lights.remove(f.id); this.fading.splice(i, 1); } else this.set(lights, f);
    }
  }

  /** Smoothstep-eased output: soft at both ends. */
  private set(lights: LightsService, l: Lamp): void {
    lights.setIntensity?.(l.id, l.k * l.k * (3 - 2 * l.k));
  }

  private release(): void {
    if (this.cur) this.fading.push(this.cur);
    this.cur = null;
    this.boat = null;
  }
}
