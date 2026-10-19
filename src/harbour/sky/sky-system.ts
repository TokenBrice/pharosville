import * as THREE from "three";
import { styleCDirection } from "../engine/time-of-day";
import type { EngineContext, FrameState, PreparationService, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import { FullscreenPass } from "../ocean/gpu-bake";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import { bakeCloudAtlas, CLOUD_CELLS } from "./clouds";
import { cloudShadowUniforms } from "./cloud-shadow";
import { applySkyPalette, createSkyPaletteUniforms } from "./palette";
import { MAX_BANKS, SKY_BAND_GLSL } from "./sky-glsl";
import { ensureMotionService, MotionClock } from "../ui/services";

/**
 * SKY: a camera-attached painted backdrop (a flat card facing the camera, so the pretend horizon is a
 * straight line, not a fishbowl arc), placed beyond the island so the top of the overview frame shows a
 * horizon band: gradient, sun/moon, stars, painted cumulus impostors in depth layers with parallax,
 * cirrus, shakkei hills and a haze line that matches the sea fog.
 *
 * Weather: cloud cover (DEWS) also drives a storm grade: a slate cloud deck with rain veils, a greyer
 * horizon, a dimmer and duller key light, a desaturated grade, and drifting cloud shadows on land and sea.
 *
 * Service 'sky': setCloudCover(0..1), setWind(0..1) (the weather director drives both from DEWS) and the
 * shared uniforms the ocean uses (band texture for reflection/haze, pretend-horizon distance, virtual glint light).
 * From the 'weather' service it also paints rain curtains / snow veils hanging from the deck, the lightning
 * flash inside the clouds (and a brief cold flash on the world light), and Danger's darkened light (gloom).
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
  /** immediate: jump there (first reading, dev overrides) instead of easing. */
  setCloudCover(v: number, immediate?: boolean): void;
  setWind(v: number, immediate?: boolean): void;
  readonly shared: SkyShared;
  /** Horizontal distance (m) from the camera to the painted horizon; content beyond it is hidden. */
  horizonDistance(): number;
}

/** What the sky reads from the weather director's service (src/harbour/weather). */
interface WeatherSkyLike { readonly gloom: number; readonly flash: { readonly azimuth: number; readonly elevation: number } }

const BAND_FRAC = 0.2;               // pretend horizon sits this fraction of the frame below the top
const BAND_TH = 48, BAND_E0 = -1.5, BAND_E1 = 14;
const D2R = Math.PI / 180;

const BACKDROP_VERT = /* glsl */ `
uniform vec3 uCam; uniform float uFwdAzV, uR, uSpan, uYBot, uYTop;
varying float vTh; varying float vY;
void main() {
  float u = (position.x - 0.5) * 2.0 * tan(uSpan);
  vec2 f = vec2(sin(uFwdAzV), -cos(uFwdAzV)), r = vec2(cos(uFwdAzV), sin(uFwdAzV));
  vec2 h = uCam.xz + (f + r * u) * uR;
  vec3 wp = vec3(h.x, mix(uYBot, uYTop, position.y), h.y);
  vTh = degrees(atan(u));
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

interface Bank { th: number; e: number; h: number; w: number; cell: number; mirror: number; slot: number; drift: number; dist: number; haze: number }

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
  /** Cloud drift eases to a stop under reduced motion. */
  private clock: MotionClock | null = null;
  private banks: Bank[] = [];
  private landPts: Array<[number, number]> = [];
  private horizon = 1500;
  private layout: HarbourLayout | undefined;
  private readonly cameraKey = {
    valid: false, matrix: new THREE.Matrix4(), projection: new THREE.Matrix4(), position: new THREE.Vector3(), target: new THREE.Vector3(),
    resolution: new THREE.Vector2(), fov: 0, aspect: 0,
  };
  private readonly geometry = { fwdAz: 0, vfov: 0, halfH: 0, pitch: 0, R: 1500, depr: 0, rightX: 1, rightZ: 0, lateralDeg: 0 };
  private bandInputs: Array<THREE.IUniform<number | THREE.Color | THREE.Vector3 | THREE.Vector4>> = [];
  private bandState: number[] = [];
  private bandNext: number[] = [];
  private bandDirty = true;
  private bandNoise: THREE.Texture | null = null;
  private bandNoiseVersion = -1;
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
    uStorm: { value: 0 },
    /** rain, snow (0..1), lightning flash (0..1), flash azimuth (deg, band space) */
    uPrecipSky: { value: new THREE.Vector4() },
    /** flash elevation (deg), wind slant of the curtains, -, - */
    uPrecipSkyB: { value: new THREE.Vector4() },
  };
  private readonly bd = {
    uCam: { value: new THREE.Vector3() }, uFwdAzV: { value: 0 }, uR: { value: 1500 }, uSpan: { value: 0.5 },
    uYBot: { value: -3 }, uYTop: { value: 100 }, uPxDeg: { value: 0.025 },
  };
  private readonly tmp = new THREE.Vector3();
  private readonly moonDir = new THREE.Vector3();
  private readonly glint = new THREE.Vector3();
  private readonly tmpC = new THREE.Color();
  private shadowDrift = (Date.now() / 1000) % 5000;

  init(ctx: EngineContext): void {
    this.syncLayout(ctx.services.get("layout") as HarbourLayout | undefined);
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
    (ctx.services.get("preparation") as PreparationService | undefined)?.register(this.bandPass.preparationEntry(() => this.bandRT));
    // Only inputs consumed by SKY_REFLECTION: no stars/discs/cloud atlas/banks/cirrus.
    this.bandInputs = [
      W.uNight, W.uZenith, W.uHorizon, W.uHaze, this.u.uGlowCol, this.u.uCloudLight, this.u.uCloudMid,
      this.u.uCloudShade, this.u.uMount, this.u.uMountLit, this.u.uSkyK, this.u.uSunDisc, this.u.uMoonDisc,
      this.u.uLight, this.u.uParallax, this.u.uStorm, this.u.uPrecipSky, this.u.uPrecipSkyB, this.shared.uSkyBandRange,
    ];
    this.bandNext = new Array<number>(4 + this.bandInputs.length * 4).fill(0);
    this.bandState = new Array<number>(this.bandNext.length).fill(NaN);
    this.shared.uSkyBand.value = this.bandRT.texture;

    this.seedBanks();
    const svc: SkyService = {
      setCloudCover: (v, now) => { this.cover = THREE.MathUtils.clamp(v, 0, 1); if (now) this.coverS = this.cover; },
      setWind: (v, now) => { this.wind = THREE.MathUtils.clamp(v, 0, 1); if (now) this.windS = this.wind; },
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
    // hand-placed composition in three depth layers (far to near): th, e base, height (deg), cell, slot,
    // distance (m, drives parallax) and aerial haze. Far banks sit low, small and hazy on the horizon;
    // near banks are big, lifted and crop at the frame top like style C. Cover reveals them in slot order.
    const spec: Array<[number, number, number, number, number, number, number]> = [
      // th,   e,    h,    cell, slot, dist,  haze
      [ 21,  0.25, 1.5,  1, 0, 16000, 0.42],
      [-27,  0.3,  1.8,  7, 3, 14000, 0.4],
      [  4,  0.45, 1.3,  6, 5, 15000, 0.45],
      [-12,  0.9,  3.4,  3, 1, 9000,  0.2],
      [ 30,  1.15, 3.0,  4, 4, 8000,  0.18],
      [ 12,  1.7,  4.4,  0, 2, 5200,  0.08],
      [-36,  1.9,  5.0,  2, 6, 4800,  0.07],
      [ -4,  2.6,  5.6,  5, 7, 4200,  0.05],
    ];
    // the composition drifts with the wall clock, so each visit (and each hour) frames it differently
    const t0 = (Date.now() / 1000) % 1e6;
    this.banks = spec.map(([th, e, h, cell, slot, dist, haze], i) => ({
      th, e, h, w: h * 4 * (0.9 + 0.2 * ((i * 37) % 7) / 7), cell: cell % CLOUD_CELLS, mirror: i % 2, slot,
      drift: t0 * 0.012 * (3000 / dist), dist, haze,
    }));
  }

  private syncLayout(layout: HarbourLayout | undefined): void {
    this.layout = layout;
    const pts: Array<[number, number]> = [];
    if (layout) {
      const coast = layout.island?.coast as unknown;
      const polys = Array.isArray(coast) && Array.isArray((coast as unknown[][])[0]?.[0]) ? (coast as Array<Array<[number, number]>>) : [coast as Array<[number, number]>];
      for (const poly of polys) if (Array.isArray(poly)) for (const p of poly) pts.push([p[0], p[1]]);
      for (const line of [layout.island?.breakwater, layout.island?.mole]) for (const p of line ?? []) pts.push([p[0], p[1]]);
      // Keep the Pharos islet inside the card as well as the main island.
      for (const poly of layout.island?.islets ?? []) for (const p of poly) pts.push([p[0], p[1]]);
    }
    this.landPts = pts;
    this.cameraKey.valid = false;
  }

  /** Geometry depends only on the immutable layout, camera frame, target and drawing size, not sky lighting/weather. */
  private cameraFrame(ctx: EngineContext): void {
    const { camera, rig, uniforms: W } = ctx;
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    if (layout !== this.layout) this.syncLayout(layout);
    const fwd = camera.getWorldDirection(this.tmp), key = this.cameraKey;
    if (key.valid && key.matrix.equals(camera.matrixWorld) && key.projection.equals(camera.projectionMatrix) && key.position.equals(camera.position)
      && key.target.equals(rig.target) && key.resolution.equals(W.uResolution.value)
      && key.fov === camera.fov && key.aspect === camera.aspect) return;
    key.matrix.copy(camera.matrixWorld); key.projection.copy(camera.projectionMatrix);
    key.position.copy(camera.position); key.target.copy(rig.target);
    key.resolution.copy(W.uResolution.value); key.fov = camera.fov; key.aspect = camera.aspect; key.valid = true;
    this.bandDirty = true;
    const fwdAz = Math.atan2(fwd.x, -fwd.z);
    const vfov = camera.fov * D2R;
    const halfH = Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const pitch = Math.asin(THREE.MathUtils.clamp(-fwd.y, -1, 1));
    const camY = camera.position.y;
    const deprWanted = pitch - vfov / 2 + BAND_FRAC * vfov;
    let R = camY / Math.tan(Math.max(0.05, deprWanted));
    const cx = camera.position.x, cz = camera.position.z;
    const span = halfH + 0.25;
    const fl = Math.hypot(fwd.x, fwd.z) || 1;
    let far = 0;
    for (const [px, pz] of this.landPts) {
      const dx = px - cx, dz = pz - cz, d = Math.hypot(dx, dz);
      const df = (dx * fwd.x + dz * fwd.z) / fl;
      if (df / d < Math.cos(span)) continue;
      far = Math.max(far, df);
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
    const rightX = Math.cos(fwdAz), rightZ = Math.sin(fwdAz);
    const lateral = rig.target.x * rightX + rig.target.z * rightZ;
    this.u.uParallax.value.set((lateral / 9000) * (180 / Math.PI), (lateral / 5200) * (180 / Math.PI), (lateral / 3000) * (180 / Math.PI), (lateral / 7000) * (180 / Math.PI));
    const geometry = this.geometry;
    geometry.fwdAz = fwdAz; geometry.vfov = vfov; geometry.halfH = halfH; geometry.pitch = pitch;
    geometry.R = R; geometry.depr = depr; geometry.rightX = rightX; geometry.rightZ = rightZ;
    geometry.lateralDeg = (lateral / 1) * (180 / Math.PI);
  }

  /** Reuse only identical inputs; animated rain/decks and each lightning flash retain full frame cadence. */
  private renderBand(ctx: EngineContext): void {
    const next = this.bandNext, prev = this.bandState;
    const weather = this.u.uWeather.value, precip = this.u.uPrecipSky.value;
    // Below 0.009 the GLSL sum cannot cross its 0.01 branch through float rounding.
    const rain = precip.x + precip.y > 0.009;
    const nightDeck = THREE.MathUtils.smoothstep(weather.x, 0.2, 0.36) * THREE.MathUtils.smoothstep(ctx.uniforms.uNight.value, 0.25, 0.75);
    // A lower threshold than the GLSL branch is conservative around CPU/GPU float rounding.
    const deck = this.u.uStorm.value > 0.001 || nightDeck > 0.001;
    next[0] = weather.x; next[1] = rain || deck ? weather.z : 0;
    next[2] = rain ? ctx.uniforms.uTime.value : 0; next[3] = weather.y;
    for (let i = 0; i < this.bandInputs.length; i++) {
      const value = this.bandInputs[i].value, offset = 4 + i * 4;
      if (typeof value === "number") next[offset] = value;
      else value.toArray(next, offset);
    }
    const noise = this.u.uSkyNoise.value;
    let dirty = this.bandDirty || noise !== this.bandNoise || noise?.version !== this.bandNoiseVersion;
    for (let i = 0; i < next.length; i++) if (next[i] !== prev[i]) dirty = true;
    if (!dirty) return;
    this.bandPass.render(ctx.renderer, this.bandRT);
    for (let i = 0; i < next.length; i++) prev[i] = next[i];
    this.bandNoise = noise; this.bandNoiseVersion = noise?.version ?? -1; this.bandDirty = false;
  }

  update(frame: FrameState, ctx: EngineContext): void {
    const { uniforms: W } = ctx;
    const dt = frame.delta;
    this.coverS += (this.cover - this.coverS) * (1 - Math.exp(-dt * 0.5));
    this.windS += (this.wind - this.windS) * (1 - Math.exp(-dt * 0.5));
    applySkyPalette(ctx.timeOfDay.hour, this.u);

    // Only the card/horizon geometry is cached; all hour/weather/glint/cloud work below stays live.
    this.cameraFrame(ctx);
    const { fwdAz, vfov, halfH, pitch, R, depr, rightX, rightZ, lateralDeg } = this.geometry;

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
    const sunAz = relAz(sunDir), sunEl = elev(sunDir), moonEl = elev(moonDir);
    const COMP = 0.34;                                 // azimuth compression: pull sun/moon toward the view
    const visTop = Math.max(0.3, (depr - (pitch - vfov / 2)) / D2R);   // visible band height above the horizon (deg)
    const discE = (el: number) => THREE.MathUtils.clamp(0.7 + 2.6 * THREE.MathUtils.clamp(el / (55 * D2R), 0, 1), 0.45, Math.max(0.5, visTop - 0.95));
    const sunVis = THREE.MathUtils.smoothstep(sunEl, -0.06, 0.04) * (1 - THREE.MathUtils.smoothstep(night, 0.35, 0.7));
    // the night overcast (skyNightDeck in the band shader): broken at WATCH, shut from ALERT up — the moon goes behind it
    const nightClosed = THREE.MathUtils.smoothstep(this.coverS, 0.2, 0.36) * THREE.MathUtils.smoothstep(night, 0.25, 0.75);
    const nightGaps = 1 - THREE.MathUtils.smoothstep(this.coverS, 0.42, 0.58);
    const moonVis = THREE.MathUtils.smoothstep(night, 0.45, 0.9) * (1 - nightClosed * (1 - nightGaps));
    this.u.uSunDisc.value.set(sunAz * COMP, discE(sunEl), 0.62, sunVis);
    // the moon keeps a fixed station left of the harbour mouth (not on the beam's axis), small, with a halo
    const moonTh = -12 + 1.2 * Math.sin(hour * 0.26);
    this.u.uMoonDisc.value.set(moonTh, discE(moonEl) + 0.35, 0.3, moonVis);
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
    // the storm deck hides the moon and the sun: their glitter on the sea goes with them
    const deck = 1 - 0.92 * THREE.MathUtils.smoothstep(this.coverS, 0.45, 0.85);
    if (moonW > sunW) {
      this.shared.uGlintDir.value.copy(glintOf(moonTh / COMP, discE(moonEl) + 0.35, moonEl));
      // through a broken night deck the moon's path on the sea comes and goes: keep a little of it
      this.shared.uGlintCol.value.setRGB(0.78, 0.85, 1.0).multiplyScalar(0.85 * moonW * deck * (1 - nightClosed * (1 - 0.35 * nightGaps)));
    } else {
      this.shared.uGlintDir.value.copy(glintOf(sunAz, discE(sunEl), sunEl));
      this.shared.uGlintCol.value.copy(W.uSunColor.value).multiplyScalar((1.2 / keyLum) * sunW * deck);
    }
    this.shared.uFwdAz.value = fwdAz;
    this.shared.uHorizonDist.value = R;
    this.shared.uHorizonDepr.value = depr;

    // ---- clouds: cover reveals banks, wind drifts them (near layers faster); wrap at the band edge with a fade
    this.clock ??= new MotionClock(ensureMotionService(ctx));
    const driftT = this.clock.step(dt), live = this.clock.live;
    const driftDeg = (0.004 + 0.05 * this.windS) * dt * live;
    this.cirrusDrift += driftDeg * 0.6;
    // fair-weather cumulus even when calm (2-3 banks), the full sky at ALERT and above
    const vis = 5 + this.coverS * MAX_BANKS;
    this.banks.forEach((b, i) => {
      b.drift += driftDeg * (3000 / b.dist) * 1.6;
      const grow = 0.85 + 0.3 * this.coverS;
      // each bank cycles just beyond the frame edge, fading only while (mostly) out of view
      const lim = halfH / D2R + b.w * grow * 0.5 + 3;
      let th = b.th + b.drift + lateralDeg / b.dist;
      th = ((th + lim) % (2 * lim) + 2 * lim) % (2 * lim) - lim;
      const edge = THREE.MathUtils.smoothstep(lim - Math.abs(th), 0, 6);
      const a = THREE.MathUtils.clamp(vis - b.slot, 0, 1) * edge;
      this.u.uBanks.value[i].set(th, b.e, b.w * grow, b.h * grow);
      this.u.uBankB.value[i].set(b.cell, a, b.haze, b.mirror);
    });
    this.u.uWeather.value.set(this.coverS, this.windS, this.cirrusDrift);
    // one wind field: the weather director's direction (uWindVec, the way the hulls lie) with a slow wobble
    const wv0 = W.uWindVec.value;
    const wdA = (wv0.lengthSq() > 1e-6 ? Math.atan2(wv0.y, wv0.x) : -0.6) + 0.15 * Math.sin(driftT * 0.01);
    this.shared.uWeatherSea.value.set(this.coverS, this.windS, Math.cos(wdA), Math.sin(wdA));

    // ---- storm grade (ALERT and above): slate sky, dimmer duller key light, greyer world, flatter grade.
    //      Runs after TimeOfDay and the readings binder wrote the uniforms, before the island copies them.
    const storm = THREE.MathUtils.smoothstep(this.coverS, 0.38, 0.75);
    this.u.uStorm.value = storm;
    if (storm > 1e-3) {
      const greyOf = (c: THREE.Color, k: number, mul: number) => {
        const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
        c.lerp(this.tmpC.setRGB(l * 0.96, l, l * 1.02), k).multiplyScalar(mul);
      };
      greyOf(W.uZenith.value, 0.75 * storm, 1 - 0.38 * storm);
      greyOf(W.uHorizon.value, 0.6 * storm, 1 - 0.22 * storm);
      greyOf(W.uHaze.value, 0.55 * storm, 1 - 0.18 * storm);
      greyOf(W.uSunColor.value, 0.55 * storm, 1 - 0.62 * storm);
      greyOf(W.uHemiSky.value, 0.5 * storm, 1 - 0.12 * storm);
      greyOf(W.uAmbient.value, 0.5 * storm, 1 - 0.12 * storm);
      greyOf(W.uFillColor.value, 0.5 * storm, 1);
      const g = ctx.timeOfDay.grade;
      g.saturation *= 1 - 0.42 * storm;
      g.gain[0] *= 1 - 0.04 * storm; g.gain[1] *= 1 - 0.01 * storm; g.gain[2] *= 1 - 0.03 * storm;
      g.contrast = 1 + (g.contrast - 1) * (1 - 0.35 * storm);
    }

    // ---- weather (director): curtains, the lightning flash in the deck and on the world, Danger's gloom
    const wx = ctx.services.get("weather") as WeatherSkyLike | undefined;
    if (wx) {
      const flash = W.uLightning.value;
      let fth = wx.flash.azimuth - fwdAz;
      fth = Math.atan2(Math.sin(fth), Math.cos(fth)) / D2R;
      this.u.uPrecipSky.value.set(W.uPrecip.value.x, W.uPrecip.value.y, flash, fth);
      const wv = W.uWindVec.value;
      // curtains lean downwind: + when the wind blows to the view's right
      this.u.uPrecipSkyB.value.set(wx.flash.elevation, (wv.x * rightX + wv.y * rightZ) * 0.6, 0, 0);
      const gloom = wx.gloom * (1 - 0.6 * night);
      if (gloom > 1e-3) {
        W.uSunColor.value.multiplyScalar(1 - 0.38 * gloom);
        W.uHemiSky.value.multiplyScalar(1 - 0.16 * gloom);
        W.uAmbient.value.multiplyScalar(1 - 0.16 * gloom);
        W.uZenith.value.multiplyScalar(1 - 0.22 * gloom);
        W.uHorizon.value.multiplyScalar(1 - 0.12 * gloom);
        const g = ctx.timeOfDay.grade;
        g.gain[0] *= 1 - 0.06 * gloom; g.gain[1] *= 1 - 0.05 * gloom; g.gain[2] *= 1 - 0.02 * gloom;
      }
      if (flash > 1e-3) {
        // a cold blue-white flash on everything the sky lights (the hemisphere and fill lights copy these next)
        const fk = flash * (0.55 + 0.9 * night);
        W.uHemiSky.value.r += 0.55 * fk; W.uHemiSky.value.g += 0.6 * fk; W.uHemiSky.value.b += 0.78 * fk;
        W.uFillColor.value.r += 0.9 * fk; W.uFillColor.value.g += 1.0 * fk; W.uFillColor.value.b += 1.25 * fk;
        W.uAmbient.value.r += 0.25 * fk; W.uAmbient.value.g += 0.28 * fk; W.uAmbient.value.b += 0.36 * fk;
      }
    } else this.u.uPrecipSky.value.set(0, 0, 0, 0);

    // ---- drifting cloud shadows on land and sea (projected along the key light from ~600 m)
    const cs = cloudShadowUniforms;
    cs.uCloudShadowTex.value = this.fx.noise;
    const sunUp = THREE.MathUtils.smoothstep(sunDir.y, 0.04, 0.3);
    const proj = 600 / Math.max(0.25, sunDir.y);
    const wind = this.shared.uWeatherSea.value;
    this.shadowDrift += dt * live * (1.5 + 7 * this.windS);
    cs.uCloudShadow.value.set(
      -wind.z * this.shadowDrift + sunDir.x * proj * 0.15,
      -wind.w * this.shadowDrift + sunDir.z * proj * 0.15,
      1 / (1100 - 300 * storm),
      (0.42 + 0.2 * storm) * sunUp * THREE.MathUtils.smoothstep(this.coverS, 0.12, 0.45) * (1 - 0.7 * night),
    );
    cs.uCloudShadowK.value.set(0.66 - 0.3 * this.coverS, 0.16);

    // ---- band texture for the sea (cheap: 512 x 128)
    this.renderBand(ctx);
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
