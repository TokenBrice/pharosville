import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { GroundService } from "../world/ground";
import { getHarbourMaterials } from "../world/materials";
import { getLightsStore, type LightsStore } from "./lights-service";
import type { QualityService } from "../engine/quality";
import { BEAM_LIGHT_GLSL, beamLightUniforms } from "../beam/beam-light-glsl";
import { getBeamUniforms } from "../beam/uniforms";

const MAX_POINT = 16;
const POOL_RES = 2048;

/**
 * Dark point lights cost nothing: the promoted pool keeps a fixed count (toggling `visible` would change
 * NUM_POINT_LIGHTS and recompile every lit program), so by day and for unpromoted slots the lights sit at
 * intensity 0 (uniform colour 0). Patch three's point-light loop to skip those (a uniform branch) and to
 * skip RE_Direct when the light is out of range (directLight.visible). Both contributed exactly zero.
 * Applied at module scope, before any program compiles (the chunk is resolved at compile time); idempotent
 * under HMR re-evaluation.
 */
const POINT_LOOP = /(pointLight = pointLights\[ i \];)([\s\S]*?)(RE_Direct\( directLight, [^;]*\);)(\s*\}\s*#pragma unroll_loop_end)/;
const POINT_SKIP = "if ( pointLight.color != vec3( 0.0 ) ) {";
{
  const chunk = THREE.ShaderChunk.lights_fragment_begin;
  if (!chunk.includes(POINT_SKIP)) {
    if (POINT_LOOP.test(chunk)) {
      THREE.ShaderChunk.lights_fragment_begin = chunk.replace(POINT_LOOP, `$1\n\t\t${POINT_SKIP}$2if ( directLight.visible ) $3\n\t\t}$4`);
    } else if (import.meta.env.DEV) {
      throw new Error("[harbour] lights_fragment_begin point-light loop changed (three upgrade?): update the dark-light skip");
    }
  }
}

const GLSL_HASH = /* glsl */ `
float lhHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float lhNoise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(lhHash(i), lhHash(i + vec2(1, 0)), u.x), mix(lhHash(i + vec2(0, 1)), lhHash(i + vec2(1, 1)), u.x), u.y); }
`;

/** Light glow per kind from the shared clock: windows follow uWindowGlow; lamps come on a little earlier. */
const GLSL_GLOW = /* glsl */ `
uniform float uWindowGlow;
float lhGlow(float kind) { return kind < 0.0 ? uWindowGlow : smoothstep(0.02, 0.55, uWindowGlow); }
`;

function quad(): THREE.InstancedBufferGeometry {
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

/**
 * GPU side of the 'lights' service: projected pools (one top-down RT sampled by every kit material),
 * instanced bloomed sprites, water pillars, and a fixed pool of 16 real point lights.
 */
export class LightsSystem implements WorldSystem {
  readonly name = "lights";
  private store!: LightsStore;
  private cap = 0;
  private iPos!: THREE.InstancedBufferAttribute;
  private iCol!: THREE.InstancedBufferAttribute;
  private iPar!: THREE.InstancedBufferAttribute;
  private readonly poolGeo = quad();
  private readonly spriteGeo = quad();
  private readonly pillarGeo = quad();
  private poolRT!: THREE.WebGLRenderTarget;
  private poolScene = new THREE.Scene();
  private readonly poolCam = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
  private sprites!: THREE.Mesh;
  private pillars!: THREE.Mesh;
  private readonly points: THREE.PointLight[] = [];
  private pointCount = MAX_POINT;
  private readonly bestD = new Float64Array(MAX_POINT);
  private readonly bestI = new Int32Array(MAX_POINT);
  private readonly clearColor = new THREE.Color();
  private seenVersion = -1;
  private seenMove = -1;
  private pickTimer = 0;
  private readonly uPx: THREE.IUniform<number> = { value: 0.001 };
  private ground: GroundService | undefined;
  private nearWater: Uint8Array = new Uint8Array(0);
  /** Metres from the light to open water along the (fixed-yaw) view direction: the pillar starts there. */
  private iWet!: THREE.InstancedBufferAttribute;
  private wetYaw = NaN;

  init(ctx: EngineContext): void {
    this.store = getLightsStore(ctx);
    this.ground = ctx.services.get("ground") as GroundService | undefined;
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    for (const l of layout?.lights ?? []) this.store.add(l.kind, l.position, l.color);

    const mats = getHarbourMaterials(ctx);
    const b = layout?.bounds;
    const [minX, minZ, maxX, maxZ] = b ? [b.min[0], b.min[2], b.max[0], b.max[2]] : [-500, -500, 500, 500];
    this.poolRT = new THREE.WebGLRenderTarget(POOL_RES, POOL_RES, { type: THREE.HalfFloatType, depthBuffer: false, magFilter: THREE.LinearFilter, minFilter: THREE.LinearFilter });
    mats.pool.uPoolTex.value = this.poolRT.texture;
    mats.pool.uPoolBounds.value.set(minX, minZ, 1 / (maxX - minX), 1 / (maxZ - minZ));
    const u = ctx.uniforms;

    // ---- pool projection (top-down, additive rgb, MAX height in alpha)
    const poolMat = new THREE.ShaderMaterial({
      uniforms: { uBounds: mats.pool.uPoolBounds },
      vertexShader: /* glsl */ `
        uniform vec4 uBounds;
        attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iPar;
        varying vec2 vQ; varying vec3 vC; varying float vH; varying float vMount; varying float vR;
        void main() {
          float R = iPar.z;
          vR = R;
          vQ = position.xy * 2.0 * R;
          vC = iCol.rgb * abs(iPar.w);
          vH = iPos.y; vMount = max(abs(iPar.y), 0.5);
          vec2 w = iPos.xz + position.xy * 2.0 * R;
          vec2 uv = (w - uBounds.xy) * uBounds.zw;
          gl_Position = R > 0.0 && iCol.a > 0.5 ? vec4(uv * 2.0 - 1.0, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vQ; varying vec3 vC; varying float vH; varying float vMount; varying float vR;
        void main() {
          float r2 = dot(vQ, vQ);
          float h2 = vMount * vMount;
          float f = pow(h2 / (r2 + h2), 1.5) * (1.0 - smoothstep(0.55 * vR, vR, sqrt(r2)));
          gl_FragColor = vec4(vC * f, vH);
        }`,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      blendEquationAlpha: THREE.MaxEquation, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
      depthTest: false, depthWrite: false, transparent: true,
    });
    const poolMesh = new THREE.Mesh(this.poolGeo, poolMat);
    poolMesh.frustumCulled = false;
    this.poolScene.add(poolMesh);

    // ---- sprites
    const spriteMat = new THREE.ShaderMaterial({
      uniforms: { uWindowGlow: u.uWindowGlow, uNight: u.uNight, uPx: this.uPx, ...beamLightUniforms(getBeamUniforms(ctx)) },
      vertexShader: /* glsl */ `
        ${GLSL_GLOW}
        ${BEAM_LIGHT_GLSL}
        uniform float uPx;
        attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iPar;
        varying vec2 vQ; varying vec3 vC;
        void main() {
          vQ = position.xy * 2.0;
          vec4 mv = viewMatrix * vec4(iPos, 1.0);
          float d = -mv.z;
          float size = max(iPar.x, d * uPx * 2.4) * 2.0;
          float k = iPar.x / size;                 // shrink brightness as the min-pixel clamp grows it
          mv.xy += position.xy * size * 3.0;
          mv.z += 0.6;
          vC = iCol.rgb * iCol.a * lhGlow(iPar.y) * (0.35 + 0.65 * k);
          // the quay lamps answer the beam as it passes over them (05-P1)
          vC *= 1.0 + 0.8 * dot(hbBeamLight(iPos, vec3(0.0, 1.0, 0.0)), vec3(0.3333));
          gl_Position = iPar.x > 0.0 && iCol.a > 0.0 ? projectionMatrix * mv : vec4(2.0, 2.0, 2.0, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying vec2 vQ; varying vec3 vC;
        void main() {
          float r2 = dot(vQ, vQ) * 9.0;
          float core = exp(-r2 * 6.0);
          float halo = exp(-r2 * 1.1) * 0.10;
          gl_FragColor = vec4(vC * (core + halo), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.sprites = new THREE.Mesh(this.spriteGeo, spriteMat);
    this.sprites.frustumCulled = false;
    this.sprites.renderOrder = 11;
    this.sprites.name = "harbour-light-sprites";

    // ---- water pillars
    const g = this.ground;
    const pillarMat = new THREE.ShaderMaterial({
      uniforms: {
        uWindowGlow: u.uWindowGlow, uNight: u.uNight, uTime: u.uTime,
        uGround: { value: g?.texture ?? null }, uGroundB: { value: g ? new THREE.Vector4(g.bounds[0], g.bounds[3], 1 / (g.bounds[2] - g.bounds[0]), 1 / (g.bounds[3] - g.bounds[1])) : new THREE.Vector4() },
        uHasGround: { value: g ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        ${GLSL_GLOW}
        attribute vec3 iPos; attribute vec4 iCol; attribute vec4 iPar; attribute float iWet;
        varying vec2 vQ; varying vec3 vC; varying vec2 vW; varying vec2 vL;
        void main() {
          vec2 toCam = normalize(cameraPosition.xz - iPos.xz);
          vec2 side = vec2(-toCam.y, toCam.x);
          float h = max(iPos.y, 1.0);
          float len = 3.5 + h * 1.5;                  // short: a pillar, not a laser down the bay
          float wid = 0.9 + max(iPar.x, 0.4) * 1.6;
          float t = position.y + 0.5;                 // 0 under the light … 1 toward the camera
          vec2 p = iPos.xz + side * position.x * wid * (1.0 + t * 0.6) + toCam * (iWet + (t - 0.04) * len);
          vQ = vec2(position.x * 2.0, t); vW = p;
          vL = vec2(position.x * wid, t * len + iPos.x * 0.37 + iPos.z * 0.61);   // pillar frame (m), per-light phase
          // fade with distance (the overview keeps a hint), and riding lights (small sprites) stay modest
          float camD = distance(cameraPosition, iPos);
          vC = iCol.rgb * lhGlow(iPar.y) * 0.85 * mix(1.0, 0.3, smoothstep(220.0, 900.0, camD)) * (iPar.x < 0.4 ? 0.5 : 1.0);
          bool show = iCol.a > 0.0 && iPar.w < 0.0;
          gl_Position = show ? projectionMatrix * viewMatrix * vec4(p.x, 1.1, p.y, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);   // above the swell crests
        }`,
      fragmentShader: /* glsl */ `
        ${GLSL_HASH}
        uniform float uTime; uniform sampler2D uGround; uniform vec4 uGroundB; uniform float uHasGround;
        varying vec2 vQ; varying vec3 vC; varying vec2 vW; varying vec2 vL;
        void main() {
          if (uHasGround > 0.5) {
            vec2 guv = vec2((vW.x - uGroundB.x) * uGroundB.z, (uGroundB.y - vW.y) * uGroundB.w);
            if (texture2D(uGround, guv).r > 0.15) discard;
          }
          // ripple bands run across the streak: fine along it, broad across it
          float n = lhNoise(vec2(vL.x * 0.9, vL.y * 1.3 - uTime * 0.9));
          float n2 = lhNoise(vec2(vL.x * 2.1 + 7.0, vL.y * 0.55 + uTime * 0.35));
          float across = exp(-vQ.x * vQ.x * 3.2);
          float along = pow(max(1.0 - vQ.y, 0.0), 0.9) * smoothstep(0.0, 0.06, vQ.y);
          float shimmer = smoothstep(0.35, 0.85, n * 0.7 + n2 * 0.45);
          gl_FragColor = vec4(vC * across * along * (0.3 + 1.6 * shimmer), 1.0);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
    });
    this.pillars = new THREE.Mesh(this.pillarGeo, pillarMat);
    this.pillars.frustumCulled = false;
    this.pillars.renderOrder = 9;
    this.pillars.name = "harbour-light-pillars";
    ctx.scene.add(this.sprites, this.pillars);

    // ---- real point lights (fixed count: no shader recompiles)
    for (let i = 0; i < MAX_POINT; i++) {
      const p = new THREE.PointLight(0xffae57, 0, 18, 2);
      p.castShadow = false;
      this.points.push(p);
      ctx.scene.add(p);
    }
    this.ensureCapacity(Math.max(256, this.store.lights.length));
  }

  private ensureCapacity(n: number): void {
    if (n <= this.cap) return;
    this.cap = Math.ceil(n * 1.5);
    this.iPos = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 3), 3).setUsage(THREE.DynamicDrawUsage);
    this.iCol = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iPar = new THREE.InstancedBufferAttribute(new Float32Array(this.cap * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.iWet = new THREE.InstancedBufferAttribute(new Float32Array(this.cap), 1).setUsage(THREE.DynamicDrawUsage);
    this.pillarGeo.setAttribute("iWet", this.iWet);
    for (const g of [this.poolGeo, this.spriteGeo, this.pillarGeo]) {
      g.setAttribute("iPos", this.iPos); g.setAttribute("iCol", this.iCol); g.setAttribute("iPar", this.iPar);
    }
    this.nearWater = new Uint8Array(this.cap);
    this.seenVersion = -1;
  }

  /** Is there open water within a few metres of the light (so it can throw a pillar)? */
  private isNearWater(x: number, z: number, y: number): boolean {
    const g = this.ground;
    if (!g || y > 40) return false;
    for (const r of [4, 7, 10]) {
      for (let a = 0; a < 8; a++) {
        if (g.heightAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r) < -0.5) return true;
      }
    }
    return g.heightAt(x, z) < -0.2;
  }

  /** March from the light toward the camera side until open water (≤ 14 m). */
  private wetDistance(x: number, z: number): number {
    const g = this.ground;
    if (!g) return 0;
    const dx = Math.sin(this.wetYaw), dz = Math.cos(this.wetYaw);
    for (let d = 0; d <= 14; d += 0.5) if (g.heightAt(x + dx * d, z + dz * d) < -0.3) return Math.max(0, d - 0.5);
    return 0;
  }

  private upload(full: boolean): void {
    const L = this.store.lights;
    this.ensureCapacity(L.length);
    const P = this.iPos.array as Float32Array, C = this.iCol.array as Float32Array, Q = this.iPar.array as Float32Array;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      P[i * 3] = l.position.x; P[i * 3 + 1] = l.position.y; P[i * 3 + 2] = l.position.z;
      if (!full) continue;
      const on = l.alive && l.on;
      if (on && this.nearWater[i] === 0) this.nearWater[i] = this.isNearWater(l.position.x, l.position.z, l.position.y) ? 2 : 1;
      (this.iWet.array as Float32Array)[i] = this.nearWater[i] === 2 ? this.wetDistance(l.position.x, l.position.z) : 0;
      C[i * 4] = l.color.r; C[i * 4 + 1] = l.color.g; C[i * 4 + 2] = l.color.b;
      C[i * 4 + 3] = on ? Math.max(l.spec.spriteK, 0.001) : 0;
      Q[i * 4] = l.spec.sprite;
      // y: mounting height; negative = window (follows uWindowGlow), positive = lamp-like
      Q[i * 4 + 1] = (l.kind === "window" ? -1 : 1) * Math.max(0.5, l.spec.mount);
      Q[i * 4 + 2] = l.spec.pool > 0 ? l.radius : 0;
      // w: pool peak (>0) ; negative marks a pillar-thrower (pool peak is re-derived in the pool pass)
      Q[i * 4 + 3] = this.nearWater[i] === 2 && l.kind !== "window" ? -Math.max(l.spec.poolK, 0.001) : l.spec.poolK;
    }
    for (const g of [this.poolGeo, this.spriteGeo, this.pillarGeo]) g.instanceCount = L.length;
    this.iPos.addUpdateRange(0, L.length * 3); this.iPos.needsUpdate = true;
    if (full) {
      this.iCol.addUpdateRange(0, L.length * 4); this.iCol.needsUpdate = true;
      this.iPar.addUpdateRange(0, L.length * 4); this.iPar.needsUpdate = true;
      this.iWet.addUpdateRange(0, L.length); this.iWet.needsUpdate = true;
    }
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const s = this.store;
    // the pillar start depends on the view azimuth (fixed in presets; re-derive if it ever changes)
    if (Math.abs(ctx.rig.yaw - this.wetYaw) > 0.05 || Number.isNaN(this.wetYaw)) { this.wetYaw = ctx.rig.yaw; this.seenVersion = -1; }
    if (s.version !== this.seenVersion) {
      this.upload(true);
      this.seenVersion = s.version; this.seenMove = s.moveVersion;
      this.renderPools(ctx);
    } else if (s.moveVersion !== this.seenMove) {
      this.upload(false);
      this.seenMove = s.moveVersion;
    }
    const cam = ctx.camera;
    this.uPx.value = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(1, ctx.renderer.domElement.height);
    this.pickTimer -= frame.delta;
    if (this.pickTimer <= 0) { this.pickTimer = 0.2; this.pickPoints(ctx); }
    const glow = THREE.MathUtils.smoothstep(ctx.uniforms.uWindowGlow.value, 0.02, 0.55);
    for (let k = 0; k < MAX_POINT; k++) { const p = this.points[k]; p.intensity = ((p.userData.base as number | undefined) ?? 0) * glow; }
  }

  private renderPools(ctx: EngineContext): void {
    const r = ctx.renderer;
    const prev = r.getRenderTarget();
    const prevClear = r.getClearColor(this.clearColor), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(this.poolRT);
    r.setClearColor(0x000000, 0);
    r.clear(true, false, false);
    r.render(this.poolScene, this.poolCam);
    r.setRenderTarget(prev);
    r.setClearColor(prevClear, prevAlpha);
  }

  /**
   * Promote the N lights nearest the camera focus to real point lights (N by quality tier; changing N
   * recompiles lit programs once, so it only follows the tier). Allocation-free top-N selection.
   */
  private pickPoints(ctx: EngineContext): void {
    const q = (ctx.services.get("quality") as QualityService | undefined)?.settings;
    const want = Math.min(MAX_POINT, q?.pointLights ?? MAX_POINT);
    if (want !== this.pointCount) {
      this.pointCount = want;
      for (let k = 0; k < MAX_POINT; k++) this.points[k].visible = k < want;
    }
    const focus = ctx.rig.target;
    const camPos = ctx.camera.position;
    const L = this.store.lights;
    const bestD = this.bestD, bestI = this.bestI;
    let n = 0;
    for (let i = 0; i < L.length; i++) {
      const l = L[i];
      if (!l.alive || !l.on || l.spec.point <= 0) continue;
      const d = l.position.distanceToSquared(focus) * 0.7 + l.position.distanceToSquared(camPos) * 0.3;
      if (n === want && d >= bestD[n - 1]) continue;
      let j = n < want ? n++ : n - 1;
      while (j > 0 && bestD[j - 1] > d) { bestD[j] = bestD[j - 1]; bestI[j] = bestI[j - 1]; j--; }
      bestD[j] = d; bestI[j] = i;
    }
    for (let k = 0; k < MAX_POINT; k++) {
      const p = this.points[k];
      if (k >= n) { p.userData.base = 0; continue; }
      const l = L[bestI[k]];
      p.position.copy(l.position);
      p.color.copy(l.color);
      p.distance = Math.max(10, l.radius * 3);
      p.userData.base = l.spec.point;
    }
  }

  dispose(ctx: EngineContext): void {
    ctx.scene.remove(this.sprites, this.pillars, ...this.points);
    this.poolRT.dispose();
    for (const g of [this.poolGeo, this.spriteGeo, this.pillarGeo]) g.dispose();
    (this.sprites.material as THREE.Material).dispose();
    (this.pillars.material as THREE.Material).dispose();
  }
}
