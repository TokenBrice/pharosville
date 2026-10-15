import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";
import type { AOUniforms } from "../world/materials";

/**
 * SEASONAL DRIFT — declared decorative (calendar, like the time of day). Autumn leaves tumbling down in the
 * wind, spring petals drifting. One instanced draw of camera-facing, alpha-tested quads; the whole life of
 * every flake (fall, flutter, wind carry, land, respawn) runs in the vertex shader, so the CPU only sets a
 * handful of uniforms. The field is fixed in the world and wraps round the camera target, sized to the
 * view, and only falls over land (the island height field). Reduced motion hides it (a still leaf in mid-air
 * is wrong); Low tier draws fewer.
 */

const COUNT = 1800;

const VERT = /* glsl */ `
attribute vec4 aSeed;            // x, z: place in the field 0..1; y: phase; w: rank 0..1
uniform float uDriftT;
uniform vec2 uWindVec;           // downwind on the ground plane, length = strength
uniform vec3 uCenter;            // field centre (camera target)
uniform float uBox;              // field width, metres
uniform float uPxWorld;          // metres per pixel at distance 1
uniform vec2 uShare;             // x: share of flakes that are autumn leaves, y: spring petals
uniform float uCount;            // share drawn (quality tier)
uniform sampler2D uAOTex;
uniform vec4 uAOBounds;          // (minX, maxZ, 1/sizeX, 1/sizeZ)
varying vec2 vUv;
varying vec3 vCol;
varying float vPetal;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float r = aSeed.w;
  float leaf = step(r, uShare.x);
  float petal = step(1.0 - uShare.y, r) * (1.0 - leaf);
  float on = max(leaf, petal) * step(fract(r * 7.13 + aSeed.y), uCount);
  float k1 = h1(aSeed.x * 91.7 + aSeed.z), k2 = h1(aSeed.z * 53.3 + aSeed.y);
  // petals float longer and lighter than leaves
  float fallH = mix(7.0 + 6.0 * k1, 5.0 + 4.0 * k1, petal);
  float period = mix(9.0 + 5.0 * k2, 14.0 + 6.0 * k2, petal);
  float life = fract(uDriftT / period + aSeed.y);
  float w = length(uWindVec);
  // carried downwind while it falls (more for petals); a slow sideways sway
  vec2 carry = uWindVec * (1.5 + 6.0 * w) * life * period * mix(0.18, 0.3, petal);
  vec2 sway = vec2(sin(uDriftT * (0.9 + k1) + k2 * 6.28), cos(uDriftT * (0.7 + k2) + k1 * 6.28)) * (0.6 + 0.8 * petal);
  // world-fixed field wrapping round the centre: moving the camera never slides the flakes along
  vec2 home = aSeed.xz * uBox;
  vec2 p = uCenter.xz + mod(home + carry - uCenter.xz + uBox * 0.5, uBox) - uBox * 0.5 + sway * life;
  vec2 tuv = vec2((p.x - uAOBounds.x) * uAOBounds.z, (uAOBounds.y - p.y) * uAOBounds.w);
  float ground = texture2D(uAOTex, tuv).r;
  float land = step(0.0, tuv.x) * step(tuv.x, 1.0) * step(0.0, tuv.y) * step(tuv.y, 1.0) * smoothstep(1.2, 2.2, ground);
  float y = ground + 0.15 + (1.0 - life) * fallH + sin(uDriftT * 2.3 + k1 * 9.0) * 0.25 * (1.0 - life);
  vec3 c = vec3(p.x, y, p.y);
  float dist = length(cameraPosition - c);
  // a leaf is ~0.25 m; never smaller than ~2.4 px so the drift still reads from the heart view
  float size = max(mix(0.28, 0.2, petal), dist * uPxWorld * 2.4) * on * land;
  size *= smoothstep(0.0, 0.04, life) * (1.0 - smoothstep(0.93, 1.0, life));
  // tumble: the flake turns in the view plane and its width flickers as it flips
  float a = uDriftT * (1.4 + 2.2 * k1) + k2 * 6.28;
  float flip = 0.3 + 0.7 * abs(sin(uDriftT * (2.0 + 3.0 * k2) + k1 * 6.28));
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
  vec2 q = vec2(position.x * flip, position.y);
  q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
  vec3 wp = c + (right * q.x + up * q.y) * size;
  vUv = position.xy;
  vPetal = petal;
  // autumn palette per leaf; petals pink to white
  float t = h1(r * 311.0);
  vec3 lc = t < 0.3 ? vec3(0.85, 0.42, 0.05) : t < 0.55 ? vec3(0.78, 0.2, 0.03) : t < 0.75 ? vec3(0.55, 0.07, 0.03) : t < 0.92 ? vec3(0.88, 0.66, 0.1) : vec3(0.42, 0.26, 0.08);
  vec3 pc = mix(vec3(0.95, 0.55, 0.68), vec3(0.95, 0.92, 0.9), step(0.55, t));
  vCol = mix(lc, pc, petal);
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const FRAG = /* glsl */ `
uniform vec3 uDriftLit;
varying vec2 vUv;
varying vec3 vCol;
varying float vPetal;
void main() {
  // leaf: a pointed ellipse; petal: a round drop
  vec2 q = vUv;
  float leafD = length(vec2(q.x * 1.7, q.y)) + abs(q.y) * 0.25;
  float d = mix(leafD, length(q * vec2(1.25, 1.0)), vPetal);
  if (d > 1.0) discard;
  float vein = (1.0 - vPetal) * (1.0 - smoothstep(0.0, 0.12, abs(q.x))) * 0.18;
  gl_FragColor = vec4(vCol * uDriftLit * (1.0 - vein), 1.0);
}`;

export class SeasonalDrift {
  readonly mesh: THREE.Mesh;
  readonly uniforms = {
    uDriftT: { value: 0 },
    uWindVec: { value: new THREE.Vector2(0.24, -0.17) },
    uCenter: { value: new THREE.Vector3() },
    uBox: { value: 300 },
    uPxWorld: { value: 0.0005 },
    uShare: { value: new THREE.Vector2(0, 0) },
    uCount: { value: 1 },
    uDriftLit: { value: new THREE.Color(1, 1, 1) },
    uAOTex: { value: null as THREE.Texture | null },
    uAOBounds: { value: new THREE.Vector4() },
  };
  private readonly tmp = new THREE.Color();

  constructor(ao: AOUniforms, seed = 11) {
    // share the island's height-field texture (same objects: they update when the island lands)
    (this.uniforms as Record<string, THREE.IUniform>).uAOTex = ao.uAOTex;
    (this.uniforms as Record<string, THREE.IUniform>).uAOBounds = ao.uAOBounds;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const s = new Float32Array(COUNT * 4);
    let a = seed >>> 0;
    const r = () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
    for (let i = 0; i < COUNT; i++) { s[i * 4] = r(); s[i * 4 + 1] = r(); s[i * 4 + 2] = r(); s[i * 4 + 3] = r(); }
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(s, 4));
    g.instanceCount = COUNT;
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: this.uniforms, side: THREE.DoubleSide });
    mat.name = "hb_life_drift";
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.name = "life-drift";
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /**
   * @param autumn / spring calendar weights (season service): the share of the field that falls
   * @param share quality-tier share of the flakes drawn
   */
  update(dt: number, moving: boolean, autumn: number, spring: number, share: number, camera: THREE.PerspectiveCamera,
    target: THREE.Vector3, distance: number, u: WorldUniforms): void {
    const leaves = THREE.MathUtils.smoothstep(autumn, 0.15, 0.7) * 0.28;
    const petals = THREE.MathUtils.smoothstep(spring, 0.15, 0.7) * 0.24;
    this.mesh.visible = moving && leaves + petals > 0.01;
    if (!this.mesh.visible) return;
    const U = this.uniforms;
    U.uDriftT.value += dt;
    U.uShare.value.set(leaves, petals);
    U.uCount.value = share;
    U.uWindVec.value.copy(u.uWindVec.value);
    U.uCenter.value.copy(target);
    // the field covers what the camera sees round its target (heart ≈ 330 m, overview ≈ 520 m)
    U.uBox.value = THREE.MathUtils.clamp(distance * 0.5, 80, 560);
    U.uPxWorld.value = (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / Math.max(1, window.innerHeight);
    // lit like the smoke: sky radiance + a share of the key light; dimmer at night
    const lit = U.uDriftLit.value, t = this.tmp;
    lit.copy(u.uHemiSky.value).multiplyScalar(0.9).add(t.copy(u.uSunColor.value).multiplyScalar(0.25));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
