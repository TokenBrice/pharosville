import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";

/**
 * In-world hover for landmarks (12-M5): the building under the pointer answers physically. Inside a
 * sphere round it, walls catch a thin brass rim (by day, faded at night) and lit windows burn ~30 %
 * brighter (night). Decorative feedback only; the hover tag carries the text. One vec4 + one float
 * uniform shared by the kit and window materials (world/materials.ts); zero cost when nothing is hovered
 * beyond one distance test per fragment.
 */
export interface LandmarkHoverUniforms {
  /** xyz centre, w radius (m). */
  uLmHover: THREE.IUniform<THREE.Vector4>;
  /** 0..1 eased presence. */
  uLmHoverK: THREE.IUniform<number>;
  /** 1 by day … 0 at night (the brass rim is a daylight answer; windows answer at night). */
  uLmHoverDay: THREE.IUniform<number>;
}

export class LandmarkHover {
  readonly uniforms: LandmarkHoverUniforms = { uLmHover: { value: new THREE.Vector4(0, -1e4, 0, 1) }, uLmHoverK: { value: 0 }, uLmHoverDay: { value: 1 } };
  private on = false;

  /** Hover a building: its centre and radius (m), or null to let go. */
  set(sphere: [number, number, number, number] | null): void {
    this.on = !!sphere;
    if (!sphere) return;
    const u = this.uniforms;
    // a new building while one is still lit: switch at once (the ease restarts from the current glow)
    u.uLmHover.value.set(sphere[0], sphere[1], sphere[2], sphere[3]);
  }

  /** Per frame: ease in over ~200 ms, out a little slower. */
  step(dt: number, night: number): void {
    this.uniforms.uLmHoverDay.value = 1 - THREE.MathUtils.clamp(night, 0, 1);
    const u = this.uniforms.uLmHoverK;
    const target = this.on ? 1 : 0;
    if (u.value === target) return;
    u.value += (target - u.value) * (1 - Math.exp(-dt * (this.on ? 12 : 8)));
    if (Math.abs(u.value - target) < 1e-3) u.value = target;
  }
}

const byUniforms = new WeakMap<WorldUniforms, LandmarkHover>();
/** The landmark hover shared by everything that renders with these world uniforms. */
export function landmarkHover(u: WorldUniforms): LandmarkHover {
  let h = byUniforms.get(u);
  if (!h) { h = new LandmarkHover(); byUniforms.set(u, h); }
  return h;
}

/** GLSL: presence of the hover at a world point (0 outside the sphere, soft edge). */
export const LANDMARK_HOVER_GLSL = /* glsl */ `
uniform vec4 uLmHover;
uniform float uLmHoverK;
uniform float uLmHoverDay;
float hbLmHoverIn(vec3 w) {
  if (uLmHoverK < 0.001) return 0.0;
  float d = distance(w, uLmHover.xyz) / uLmHover.w;
  return uLmHoverK * (1.0 - smoothstep(0.75, 1.0, d));
}
// a thin brass rim on walls (not roofs or ground), by day; relative to the surface's own light
vec3 hbLmHoverRim(vec3 w, vec3 n, vec3 v, vec3 lit) {
  float k = hbLmHoverIn(w);
  if (k <= 0.0) return vec3(0.0);
  float rim = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), 3.0) * (1.0 - abs(n.y));
  float lum = max(dot(lit, vec3(0.2126, 0.7152, 0.0722)), 0.02);
  return vec3(1.0, 0.78, 0.45) * rim * lum * 2.4 * k * uLmHoverDay + lit * 0.07 * k;
}
`;
