import * as THREE from "three";
import { styleCDirection } from "../engine/time-of-day";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import { FullscreenPass } from "../ocean/gpu-bake";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import { bakeCloudAtlas, CLOUD_CELLS } from "./clouds";
import { applySkyPalette, createSkyPaletteUniforms } from "./palette";
import { MAX_BANKS, SKY_BAND_GLSL } from "./sky-glsl";

/**
 * SKY: a camera-attached painted backdrop (a cylindrical card around the camera, not a dome), placed
 * beyond the island so the top of the overview frame shows a horizon band: gradient, sun/moon, stars,
 * painted cumulus impostors, cirrus, shakkei hills and a haze line that matches the sea fog.
 *
 * Service 'sky': setCloudCover(0..1), setWind(0..1) (DEWS drives them later) and the shared uniforms the
 * ocean uses (band texture for reflection/haze, pretend-horizon distance, virtual glint light).
 */
export interface SkyShared {
  uSkyBand: THREE.IUniform<THREE.Texture | null>;
  /** band texture range: th min, th max, e min, e max (deg) */
  uSkyBandRange: THREE.IUniform<THREE.Vector4>;
  /** forward azimuth (rad, 0 = north/-z, +pi/2 = east/+x) */
  uFwdAz: THREE.IUniform<number>;
  /** horizontal distance camera -> backdrop (m) */
  uHorizonDist: THREE.IUniform<number>;
  /** depression of the pretend horizon below horizontal, seen from the camera (rad) */
  uHorizonDepr: THREE.IUniform<number>;
  /** virtual light whose sea reflection lands under the painted sun/moon disc */
  uGlintDir: THREE.IUniform<THREE.Vector3>;
  uGlintCol: THREE.IUniform<THREE.Color>;
  /** x cloud cover, y wind, z wind dir x, w wind dir z */
  uWeatherSea: THREE.IUniform<THREE.Vector4>;
}

export interface SkyService {
  setCloudCover(v: number): void;
  setWind(v: number): void;
  readonly shared: SkyShared;
  /** Horizontal distance (m) from the camera to the painted horizon; content beyond it is hidden. */
  horizonDistance(): number;
}

const BAND_FRAC = 0.2;               // pretend horizon sits this fraction of the frame below the top
const BAND_TH = 48, BAND_E0 = -1.5, BAND_E1 = 14;
const D2R = Math.PI / 180;

const BACKDROP_VERT = /* glsl */ `
uniform vec3 uCam; uniform float uFwdAzV, uR, uSpan, uYBot, uYTop;
varying float vTh; varying float vY;
void main() {
  float a = uFwdAzV + (position.x - 0.5) * 2.0 * uSpan;
  vec3 wp = vec3(uCam.x + sin(a) * uR, mix(uYBot, uYTop, position.y), uCam.z - cos(a) * uR);
  vTh = degrees((position.x - 0.5) * 2.0 * uSpan);
  vY = wp.y;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}`;

const BACKDROP_FRAG = /* glsl */ `
${SKY_BAND_GLSL}
uniform vec3 uCam; uniform float uR, uPxDeg;
varying float vTh; varying float vY;
void main() {
  float e = degrees(atan((vY - uCam.y) / uR) - atan(-uCam.y / uR));
  vec3 c = skyBand(vTh, e, uPxDeg);
  c += (sbHash(gl_FragCoord.xy) - 0.5) / 255.0;       // de-band
  gl_FragColor = vec4(c, 1.0);
}`;

const BAND_FRAG = /* glsl */ `
#define SKY_REFLECTION
${SKY_BAND_GLSL}
uniform vec4 uRange;
varying vec2 vUv;
void main() {
  float th = mix(uRange.x, uRange.y, vUv.x), e = mix(uRange.z, uRange.w, vUv.y);
  gl_FragColor = vec4(skyBand(th, e, 0.25), 1.0);
}`;

interface Bank { th: number; e: number; h: number; w: number; cell: number; mirror: number; slot: number; drift: number }

export class SkySystem implements WorldSystem {
  readonly name = "sky";
  private mesh!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private atlas!: THREE.WebGLRenderTarget;
  private bandRT!: THREE.WebGLRenderTarget;
  private bandPass!: FullscreenPass;
  private fx!: FxTextures;
  private cover = 0.38;
  private coverS = 0.38;
  private wind = 0.3;
  private windS = 0.3;
  private cirrusDrift = 0;
  private banks: Bank[] = [];
  private landPts: Array<[number, number]> = [];
  private horizon = 1500;
  readonly shared: SkyShared = {
    uSkyBand: { value: null },
    uSkyBandRange: { value: new THREE.Vector4(-BAND_TH, BAND_TH, BAND_E0, BAND_E1) },
    uFwdAz: { value: 0 },
    uHorizonDist: { value: 1500 },
    uHorizonDepr: { value: 0.47 },
    uGlintDir: { value: new THREE.Vector3(0, 0.5, -1).normalize() },
    uGlintCol: { value: new THREE.Color(0, 0, 0) },
    uWeatherSea: { value: new THREE.Vector4(0.38, 0.3, 0.8, -0.6) },
  };
  private readonly u = {
    ...createSkyPaletteUniforms(),
    uSunDisc: { value: new THREE.Vector4() },
    uMoonDisc: { value: new THREE.Vector4() },
    uLight: { value: new THREE.Vector4() },
    uBanks: { value: Array.from({ length: MAX_BANKS }, () => new THREE.Vector4()) },
    uBankB: { value: Array.from({ length: MAX_BANKS }, () => new THREE.Vector4()) },
    uCloudAtlas: { value: null as THREE.Texture | null },
    uSkyNoise: { value: null as THREE.Texture | null },
    uParallax: { value: new THREE.Vector4() },
    uWeather: { value: new THREE.Vector3() },
  };
  private readonly bd = {
    uCam: { value: new THREE.Vector3() }, uFwdAzV: { value: 0 }, uR: { value: 1500 }, uSpan: { value: 0.5 },
    uYBot: { value: -3 }, uYTop: { value: 100 }, uPxDeg: { value: 0.025 },
  };
  private readonly tmp = new THREE.Vector3();
  private readonly moonDir = new THREE.Vector3();
  private readonly glint = new THREE.Vector3();

  init(ctx: EngineContext): void {
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    if (layout) {
      const pts: Array<[number, number]> = [];
      const coast = layout.island?.coast as unknown;
      const polys = Array.isArray(coast) && Array.isArray((coast as unknown[][])[0]?.[0]) ? (coast as Array<Array<[number, number]>>) : [coast as Array<[number, number]>];
      for (const poly of polys) if (Array.isArray(poly)) for (const p of poly) pts.push([p[0], p[1]]);
      for (const line of [layout.island?.breakwater, layout.island?.mole]) for (const p of line ?? []) pts.push([p[0], p[1]]);
      this.landPts = pts;
    }
    this.fx = acquireFxTextures(ctx);
    this.atlas = bakeCloudAtlas(ctx.renderer);
    this.u.uCloudAtlas.value = this.atlas.texture;
    this.u.uSkyNoise.value = this.fx.noise;
    const W = ctx.uniforms;
    const world = { uTime: W.uTime, uNight: W.uNight, uZenith: W.uZenith, uHorizon: W.uHorizon, uHaze: W.uHaze, uSunColor: W.uSunColor };

    // backdrop card: unit grid, vertex shader wraps it round the camera
    const g = new THREE.PlaneGeometry(1, 1, 96, 1);
    g.translate(0.5, 0.5, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: BACKDROP_VERT, fragmentShader: BACKDROP_FRAG,
      uniforms: { ...world, ...this.u, ...this.bd }, side: THREE.DoubleSide, depthWrite: true, fog: false,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 50;             // after ordinary opaque geometry: early-z rejects hidden sky
    this.mesh.name = "sky-backdrop";
    ctx.scene.add(this.mesh);

    // low-res band texture for sea reflection + horizon haze colour
    this.bandRT = new THREE.WebGLRenderTarget(512, 128, {
      type: THREE.HalfFloatType, format: THREE.RGBAFormat, depthBuffer: false, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.ClampToEdgeWrapping, wrapT: THREE.ClampToEdgeWrapping,
    });
    this.bandPass = new FullscreenPass(BAND_FRAG, { ...world, ...this.u, uRange: this.shared.uSkyBandRange });
    this.shared.uSkyBand.value = this.bandRT.texture;

    this.seedBanks();
    const svc: SkyService = {
      setCloudCover: (v) => { this.cover = THREE.MathUtils.clamp(v, 0, 1); },
      setWind: (v) => { this.wind = THREE.MathUtils.clamp(v, 0, 1); },
      shared: this.shared,
      horizonDistance: () => this.horizon,
    };
    ctx.services.set("sky", svc);
    const q = new URLSearchParams(location.search);
    if (q.has("cloud")) svc.setCloudCover(Number(q.get("cloud")));
    if (q.has("wind")) svc.setWind(Number(q.get("wind")));
    this.coverS = this.cover; this.windS = this.wind;
  }

  private seedBanks(): void {
    // hand-placed composition (th, e base, height in deg) - far to near; cover reveals them in `slot` order
    const spec: Array<[number, number, number, number, number]> = [
      // th,   e,    h,    cell, slot   (view half-width is ~19 deg; banks crop at the frame top like style C)
      [-14,  1.35, 5.2,  0, 0],
      [ 13,  1.05, 3.4,  1, 1],
      [  2,  2.3,  2.6,  3, 3],
      [ 27,  1.5,  4.6,  2, 2],
      [-33,  1.1,  3.0,  4, 4],
      [-2,   0.95, 4.2,  5, 5],
      [ 36,  2.6,  2.4,  6, 6],
      [-24,  0.9,  2.8,  7, 7],
    ];
    this.banks = spec.map(([th, e, h, cell, slot], i) => ({ th, e, h, w: h * 4 * (0.9 + 0.2 * ((i * 37) % 7) / 7), cell: cell % CLOUD_CELLS, mirror: i % 2, slot, drift: 0 }));
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const { camera, rig, uniforms: W } = ctx;
    const dt = frame.delta;
    this.coverS += (this.cover - this.coverS) * (1 - Math.exp(-dt * 0.5));
    this.windS += (this.wind - this.windS) * (1 - Math.exp(-dt * 0.5));
    applySkyPalette(ctx.timeOfDay.hour, this.u);

    // ---- camera frame
    const fwd = camera.getWorldDirection(this.tmp);
    const fwdAz = Math.atan2(fwd.x, -fwd.z);
    const vfov = camera.fov * D2R;
    const halfH = Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const pitch = Math.asin(THREE.MathUtils.clamp(-fwd.y, -1, 1));
    const camY = camera.position.y;
    const deprWanted = pitch - vfov / 2 + BAND_FRAC * vfov;
    let R = camY / Math.tan(Math.max(0.05, deprWanted));
    // never cut through land: push the card beyond the farthest land point in view
    const cx = camera.position.x, cz = camera.position.z;
    const span = halfH + 0.25;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    let far = 0;
    for (const [px, pz] of this.landPts) {
      const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
      if ((dx * fwd.x + dz * fwd.z) / (d * fl) < Math.cos(span)) continue;   // outside the card's arc
      far = Math.max(far, d);
    }
    if (far > 0) R = Math.max(R, far + 14);
    this.horizon = R;
    const depr = Math.atan(camY / R);
    const yTop = camY - R * Math.tan(Math.max(0.02, pitch - vfov / 2 - 0.06));
    const bd = this.bd;
    bd.uCam.value.copy(camera.position);
    bd.uFwdAzV.value = fwdAz; bd.uR.value = R; bd.uSpan.value = span;
    bd.uYBot.value = -4; bd.uYTop.value = Math.max(yTop, 20);
    bd.uPxDeg.value = camera.fov / Math.max(1, W.uResolution.value.y);
    this.mesh.visible = yTop > 0;

    // ---- parallax: lateral pan relative to the island centre shifts far layers a little
    const rightX = Math.cos(fwdAz), rightZ = Math.sin(fwdAz);
    const lateral = rig.target.x * rightX + rig.target.z * rightZ;
    const deg = (d: number) => (lateral / d) * (180 / Math.PI);
    this.u.uParallax.value.set(deg(9000), deg(5200), deg(3000), deg(7000));

    // ---- sun & moon. The key light (uSunDir) is the sun by day and the moon by night (TimeOfDay);
    //      the painted discs are art-directed: the moon keeps style C's station (az 50, el 26), drifting slowly.
    const hour = ctx.timeOfDay.hour;
    const night = W.uNight.value;
    const sunDir = W.uSunDir.value;
    const moonDir = styleCDirection(50 + (((hour + 12) % 24) - 10) * 4, 26 + Math.sin(((hour + 12) % 24) * 0.26) * 4, this.moonDir);
    const relAz = (d: THREE.Vector3) => {
      let a = Math.atan2(d.x, -d.z) - fwdAz;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      return a / D2R;
    };
    const elev = (d: THREE.Vector3) => Math.asin(THREE.MathUtils.clamp(d.y, -1, 1));
    const sunAz = relAz(sunDir), moonAz = relAz(moonDir), sunEl = elev(sunDir), moonEl = elev(moonDir);
    const COMP = 0.34;                                 // azimuth compression: pull sun/moon toward the view
    const visTop = Math.max(0.3, (depr - (pitch - vfov / 2)) / D2R);   // visible band height above the horizon (deg)
    const discE = (el: number) => THREE.MathUtils.clamp(0.7 + 2.6 * THREE.MathUtils.clamp(el / (55 * D2R), 0, 1), 0.45, Math.max(0.5, visTop - 0.95));
    const sunVis = THREE.MathUtils.smoothstep(sunEl, -0.06, 0.04) * (1 - THREE.MathUtils.smoothstep(night, 0.35, 0.7));
    const moonVis = THREE.MathUtils.smoothstep(night, 0.45, 0.9);
    this.u.uSunDisc.value.set(sunAz * COMP, discE(sunEl), 0.62, sunVis);
    this.u.uMoonDisc.value.set(moonAz * COMP, discE(moonEl), 0.72, moonVis);
    // clouds/hills are lit by the key light (true azimuth)
    this.u.uLight.value.set(relAz(sunDir), Math.max(0.05, sunEl), 0, 0);

    // ---- glint: a virtual light whose mirror image sits under the painted disc
    // when the band is out of frame (close zooms) the glint follows the true elevation instead
    const bandK = THREE.MathUtils.smoothstep(visTop, 0.4, 2.0);
    const glintOf = (azRelDeg: number, discEDeg: number, trueEl: number) => {
      const az = fwdAz + azRelDeg * THREE.MathUtils.lerp(1, COMP, bandK) * D2R;
      const el = THREE.MathUtils.lerp(trueEl, depr + discEDeg * D2R, bandK);
      return this.glint.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    };
    const sunW = sunVis * this.u.uDiscK.value.x;
    const moonW = moonVis * this.u.uDiscK.value.y;
    const keyLum = Math.max(0.05, W.uSunColor.value.r * 0.3 + W.uSunColor.value.g * 0.59 + W.uSunColor.value.b * 0.11);
    if (moonW > sunW) {
      this.shared.uGlintDir.value.copy(glintOf(moonAz, discE(moonEl), moonEl));
      this.shared.uGlintCol.value.setRGB(0.78, 0.85, 1.0).multiplyScalar(1.5 * moonW);
    } else {
      this.shared.uGlintDir.value.copy(glintOf(sunAz, discE(sunEl), sunEl));
      this.shared.uGlintCol.value.copy(W.uSunColor.value).multiplyScalar((1.2 / keyLum) * sunW);
    }
    this.shared.uFwdAz.value = fwdAz;
    this.shared.uHorizonDist.value = R;
    this.shared.uHorizonDepr.value = depr;

    // ---- clouds: cover reveals banks, wind drifts them; wrap at the band edge with a fade
    const driftDeg = (0.004 + 0.05 * this.windS) * dt;
    this.cirrusDrift += driftDeg * 0.6;
    const vis = this.coverS * MAX_BANKS * 1.25;
    this.banks.forEach((b, i) => {
      b.drift += driftDeg * (0.7 + 0.08 * i);
      let th = b.th + b.drift;
      const lim = 52;
      th = ((th + lim) % (2 * lim) + 2 * lim) % (2 * lim) - lim;
      const edge = THREE.MathUtils.smoothstep(lim - Math.abs(th) - b.w * 0.5, 0, 8);
      const a = THREE.MathUtils.clamp(vis - b.slot, 0, 1) * edge;
      const grow = 0.85 + 0.3 * this.coverS;
      this.u.uBanks.value[i].set(th, b.e, b.w * grow, b.h * grow);
      this.u.uBankB.value[i].set(b.cell, a, 0.06 + 0.04 * (MAX_BANKS - 1 - i) / MAX_BANKS, b.mirror);
    });
    this.u.uWeather.value.set(this.coverS, this.windS, this.cirrusDrift);
    const wdA = -0.6 + 0.15 * Math.sin(frame.elapsed * 0.01);
    this.shared.uWeatherSea.value.set(this.coverS, this.windS, Math.cos(wdA), Math.sin(wdA));

    // ---- band texture for the sea (cheap: 512 x 128)
    this.bandPass.render(ctx.renderer, this.bandRT);
  }

  dispose(ctx: EngineContext): void {
    ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.atlas.dispose();
    this.bandRT.dispose();
    this.bandPass.dispose();
    this.fx.release();
    ctx.services.delete("sky");
  }
}
