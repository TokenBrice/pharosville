import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";
import type { V3 } from "./walkways";

/**
 * CHIMNEY SMOKE — declared decorative. Soft wisps from a share of the chimneys in the cool hours and at night,
 * bent downwind by the wind service (DEWS). One instanced draw of camera-facing puffs; the whole life cycle of
 * every puff (rise, spread, drift, fade) runs in the vertex shader, so the CPU only sets four uniforms.
 * Reduced motion: the clock stops and the wisps hold still.
 */

const PUFFS = 7;

const VERT = /* glsl */ `
attribute vec3 aOrigin;
attribute vec4 aSeed;          // x puff slot 0..1, y chimney rand, z chimney rand 2, w active rank
uniform float uSmokeT;
uniform float uSmokeAmt;
uniform vec4 uWind;             // xy downwind dir (x, z), z strength 0..1
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
void main() {
  float rate = 0.075 + 0.03 * aSeed.y;                         // one puff cycle ≈ 10-13 s
  float life = fract(uSmokeT * rate + aSeed.x + aSeed.z);
  float on = step(aSeed.w, uSmokeAmt * 0.42);
  float w = uWind.z;
  // rise slows as the wisp leans over; the wind carries it off, more the higher it gets
  float rise = (5.2 - 2.4 * w) * (1.0 - exp(-life * 2.6)) * 1.25;
  float drift = (2.0 + 13.0 * w) * life * life + 1.2 * life;
  vec3 c = aOrigin + vec3(uWind.x * drift, rise, uWind.y * drift);
  // a lazy curl so the column is not a rod
  float ph = uSmokeT * 0.35 + aSeed.y * 6.28 + life * 4.0;
  c.x += sin(ph) * 0.45 * life; c.z += cos(ph * 0.8) * 0.45 * life;
  float size = (0.45 + 2.1 * life) * (0.85 + 0.3 * aSeed.z);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec3 wp = c + (right * position.x + up * position.y) * size;
  vUv = position.xy;
  vLife = life;
  vAlpha = on * smoothstep(0.0, 0.08, life) * (1.0 - smoothstep(0.45, 1.0, life)) * (0.55 + 0.45 * uSmokeAmt);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uSmokeLit;
uniform vec3 uSmokeShade;
uniform float uSmokeOpacity;
varying vec2 vUv;
varying float vAlpha;
varying float vLife;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  // a soft ball, lit from above: the top lighter, the underside in shade
  float a = pow(max(1.0 - r * r, 0.0), 1.6);
  vec3 col = mix(uSmokeShade, uSmokeLit, clamp(0.7 + 0.45 * vUv.y, 0.0, 1.0));
  // young puffs are a little denser and warmer (wood smoke), old ones thin to the haze
  gl_FragColor = vec4(col, a * vAlpha * uSmokeOpacity * (1.0 - 0.45 * vLife));
}`;

export class ChimneySmoke {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uSmokeT: { value: 0 },
    uSmokeAmt: { value: 0.5 },
    uWind: { value: new THREE.Vector4(0.8, -0.55, 0.3, 0) },
    uSmokeLit: { value: new THREE.Color() },
    uSmokeShade: { value: new THREE.Color() },
    uSmokeOpacity: { value: 0.26 },
  };
  private readonly tmp = new THREE.Color();

  constructor(chimneys: readonly V3[], seed = 5) {
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const n = chimneys.length * PUFFS;
    const origin = new Float32Array(n * 3), s = new Float32Array(n * 4);
    let a = seed >>> 0;
    const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    chimneys.forEach((c, ci) => {
      const r1 = r(), r2 = r(), rank = r();
      for (let k = 0; k < PUFFS; k++) {
        const i = ci * PUFFS + k;
        origin[i * 3] = c[0]; origin[i * 3 + 1] = c[1] + 0.15; origin[i * 3 + 2] = c[2];
        s[i * 4] = k / PUFFS; s[i * 4 + 1] = r1; s[i * 4 + 2] = r2; s[i * 4 + 3] = rank;
      }
    });
    g.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(origin, 3));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(s, 4));
    g.instanceCount = n;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms,
      transparent: true, depthWrite: false, depthTest: true,
    });
    mat.name = "hb_life_smoke";
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = "life-smoke";
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  /**
   * @param amount share of chimneys smoking (hour curve)
   * @param windTo downwind direction (x, z), unit
   */
  update(dt: number, moving: boolean, amount: number, windTo: [number, number], wind: number, u: WorldUniforms): void {
    if (moving) this.uniforms.uSmokeT.value += dt;
    this.uniforms.uSmokeAmt.value = amount;
    this.uniforms.uWind.value.set(windTo[0], windTo[1], wind, 0);
    // lit like a white kit surface (sky radiance + key light × cos/π); the shade side takes the hemisphere ground
    const lit = this.uniforms.uSmokeLit.value, shade = this.uniforms.uSmokeShade.value, t = this.tmp;
    lit.copy(u.uHemiSky.value).add(t.copy(u.uSunColor.value).multiplyScalar(0.32));
    lit.multiply(t.setRGB(0.95, 0.93, 0.9));
    shade.copy(u.uHemiSky.value).multiplyScalar(0.62).add(t.copy(u.uHemiGround.value).multiplyScalar(0.35));
    shade.multiply(t.setRGB(0.8, 0.8, 0.82));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
