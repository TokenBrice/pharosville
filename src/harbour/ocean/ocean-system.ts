import { ensureGustService } from "../weather/gust";
import * as THREE from "three";
import { getBeamUniforms } from "../beam/uniforms";
import type { EngineContext, FrameState, PreparationEntry, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { SkyShared } from "../sky/sky-system";
import { cloudShadowUniforms } from "../sky/cloud-shadow";
import { sunShadowUniforms } from "../world/sun-shadow";
import { shoalCoordsCpu } from "./shaders/ocean-disp";
import { buildSeaSdf, defaultSeaBounds, landMaskFromHeights, SDF_COAST_RANGE, sdfMainlandFade, seaSdfInputFromLayout, type Bounds4, type HeightField } from "./sea-sdf";
import { acquireFxTextures, type FxTextures } from "./textures";
import { WakeField, type WakeMode, type WakeService } from "./wake";
import { updateAerial } from "../world/aerial";
import { runupUniforms } from "../world/runup";
import { hullSwell, POINT_DAMP_AT, pointSwell, SEA_STATES, swellPhase, waveHeight, WAVES } from "./waves";
import { ensureMotionService, MotionClock } from "../ui/services";
import { buildZoneMask, type SeaZoneLike } from "./zone-mask";
import { loadSdfImage } from "./sdf-image";
import { getHarbourMaterials } from "../world/materials";
import { lampWaveUniforms } from "../lights/lamp-wave";
import { TimeOfDay } from "../engine/time-of-day";
import { createWorldUniforms } from "../engine/uniforms";
import { seaHour } from "./sea-tone";
import { extraEnabled } from "../engine/extras";
import { SceneCapture } from "./scene-capture";
import type { Seabed } from "./seabed";
import type { CausticsPass } from "./caustics-pass";
import type { WakeCollars } from "./wake-collars";
import type { WakeRibbons } from "./wake-ribbons";
import type { FftWaveSystem } from "./fft/fft-system";
import type { ProjectedGrid } from "./projected-grid";
import type { PlanarMirror } from "./planar-mirror";
import type { HiZSSR } from "./hiz-ssr";
import type { SprayService, SpraySystem } from "./spray-system";
import type { WakeCollarService, WakeRibbonService } from "../engine/services";
import type { QualitySettings, QualityTier } from "../engine/quality";
import { abortable } from "../engine/transport";
import { MAX_NIGHT_GLINTS } from "../lights/dyn-pool";

/**
 * OCEAN: adaptive camera-centered Projected Grid (High/Med) / static grid (Low), 3-cascade WebGL2 FFT + phase-locked
 * `WAVES[0]` swell with bathymetric shoaling & shore wrapping (Low keeps Gerstner + `uRipple`), zero-lag `SceneCapture`
 * depth refraction over a continuous runtime seabed, 3-tier shadow-occluded caustics, High half-res `PlanarMirror` /
 * Medium same-frame `R32F` Hi-Z SSR / Low `uSkyBand` IBL, persistent `RGBA16F` `WakeField` + target-centered curved
 * `RGBA16F` `WakeRibbons`, and nocturnal pools + hero anisotropic GGX glints.
 *
 * Services: 'wake' (WakeService), 'wakeCollars' (WakeCollarService), 'wakeRibbons' (WakeRibbonService), and 'ocean' (OceanService).
 */
export type SeaState = 0 | 1 | 2 | 3;

export interface OceanService {
  preparationScope(tierOrLite: QualityTier | boolean): () => void;
  prepareTier?(tier: QualityTier): Promise<void> | void;
  featureIdentity?(tier: QualityTier): string;
  mirrorFrustum?(): THREE.Frustum | null;
  setSeaState(state: SeaState): void;
  readonly seaState: SeaState;
  heightAt(x: number, z: number, point?: Float64Array): number;
  hullHeights(x: number, z: number, bx: number, bz: number, px: number, pz: number, out: Float64Array, cache: Float64Array | null): void;
  coastAt(x: number, z: number): number;
  dampAt(x: number, z: number): number;
  bindDynPool?(tex: THREE.Texture | null, intensity: number, bounds?: Bounds4): void;
  bindNightGlints?(posArr: readonly THREE.Vector4[], colArr: readonly THREE.Vector4[], count: number): void;
  readonly shared: {
    uTime: THREE.IUniform<number>;
    uSea: THREE.IUniform<THREE.Vector4>;
    uSdf: THREE.IUniform<THREE.Texture>;
    uSdfBounds: THREE.IUniform<THREE.Vector4>;
    uSceneCenter: THREE.IUniform<THREE.Vector2>;
    uFftAtlas: THREE.IUniform<THREE.DataArrayTexture>;
    uFftOn: THREE.IUniform<number>;
    uFftScales: THREE.IUniform<THREE.Vector4>;
    uFftWeights: THREE.IUniform<THREE.Vector4>;
  };
}

export { MAX_NIGHT_GLINTS };

const GRID_N = 192;
const FAR_EXTENT = 7000;
const W0 = WAVES[0]!;
const W0_QA = W0.steep / (W0.k * WAVES.length);

const coastOf = (r: number) => (r / 255 - 0.5) * SDF_COAST_RANGE;
const dampOf = (coast: number) => THREE.MathUtils.smoothstep(coast, 0, 34) * 0.9 + 0.1 * THREE.MathUtils.smoothstep(coast, -2, 2);
const DAMP_BY_BYTE = Float64Array.from({ length: 256 }, (_, r) => dampOf(coastOf(r)));

function oceanGeometry(bounds: Bounds4): THREE.BufferGeometry {
  const cx = (bounds[0] + bounds[2]) / 2, cz = (bounds[1] + bounds[3]) / 2;
  const half = Math.max(bounds[2] - bounds[0], bounds[3] - bounds[1]) / 2;
  const INNER = 0.8;
  const map = (u: number) => {
    const a = Math.abs(u), s = Math.sign(u);
    return a <= INNER ? (u / INNER) * half : s * (half + ((a - INNER) / (1 - INNER)) ** 2.2 * (FAR_EXTENT - half));
  };
  const N = GRID_N, P = new Float32Array((N + 1) * (N + 1) * 3), I: number[] = [];
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    const k = (j * (N + 1) + i) * 3;
    P[k] = cx + map(-1 + (2 * i) / N); P[k + 1] = 0; P[k + 2] = cz + map(-1 + (2 * j) / N);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1;
    I.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(P, 3));
  g.setIndex(I);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, 0, cz), FAR_EXTENT * 1.5);
  return g;
}

function makeFftFallback(): THREE.DataArrayTexture {
  const data = new Uint8Array(6 * 4);
  for (let l = 0; l < 3; l++) data[l * 4 + 3] = 255; // J_det = 1 on layers 0..2
  const tex = new THREE.DataArrayTexture(data, 1, 1, 6);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

async function loadSdf(ctx: EngineContext, url: string): Promise<{ tex: THREE.DataTexture; data: Uint8Array; coast: Uint8Array; size: number } | null> {
  const img = await loadSdfImage(ctx, url);
  if (!img) return null;
  const tex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = false;
  return { tex, data: img.data, coast: img.coast, size: img.width };
}

export class OceanSystem implements WorldSystem {
  readonly name = "ocean";
  private mesh!: THREE.Mesh;
  private staticGeo!: THREE.BufferGeometry;
  private material!: THREE.ShaderMaterial;
  private wake!: WakeField;
  private unsubQuality: (() => void) | null = null;
  private lite = false;
  private tier: QualityTier = "medium";
  private featureKey = "";
  private sdfTex!: THREE.DataTexture;
  private sdfData!: Uint8Array;
  private coastR!: Uint8Array;
  private coastMip2Data!: Uint8Array;
  private coastMip2Size = 1;
  private sdfSize = 1024;
  private bounds!: Bounds4;
  private bx0 = 0;
  private bz0 = 0;
  private bw = 1;
  private bh = 1;
  private scx = 0;
  private scz = 0;
  private fx: FxTextures | null = null;
  private state: SeaState = 1;
  private readonly seaU = { value: new THREE.Vector4(SEA_STATES[1].amp, SEA_STATES[1].chop, SEA_STATES[1].caps, SEA_STATES[1].bands) };
  private readonly seaGoal = new THREE.Vector4().copy(this.seaU.value);
  private time = 0;
  private lastDt = 1 / 60;
  private sdfVersion = 0;
  private readonly seaTime = { value: 0 };
  private clock: MotionClock | null = null;
  private layout: HarbourLayout | null = null;
  private awaitGround = false;
  private seabedAwaitingGround = false;
  private zoneTex: THREE.DataTexture | null = null;
  private dynPoolFallback: THREE.DataTexture | null = null;
  private causticFallback: THREE.DataTexture | null = null;
  private mirrorFallback: THREE.DataTexture | null = null;
  private fftFallback: THREE.DataArrayTexture | null = null;
  private debugMovers: Array<{ cx: number; cz: number; r: number; w: number; ph: number; hw: number }> = [];
  private hourTod: TimeOfDay | null = null;
  private readonly hourU = createWorldUniforms();
  private readonly noonU = createWorldUniforms();
  private collars!: WakeCollars;
  private refractEnabled = false;
  private fftEnabled = false;
  private mirrorEnabled = false;
  private planarEnabled = false;
  private sprayEnabled = false;
  private reflectMode: 0 | 1 | 2 = 0;
  private captureHalfRes = true;
  private inPreparation = false;
  private fftUpdated = false;
  private sceneCapture: SceneCapture | null = null;
  private seabed: Seabed | null = null;
  private caustics: CausticsPass | null = null;
  private fft: FftWaveSystem | null = null;
  private projectedGrid: ProjectedGrid | null = null;
  private wakeRibbons: WakeRibbons | null = null;
  private planarMirror: PlanarMirror | null = null;
  private hizSsr: HiZSSR | null = null;
  private spray: SpraySystem | null = null;
  private reefAnchors: Array<[number, number, number, number]> = [];
  private lastWindDir: [number, number] = [0.8, -0.6];
  private readonly unregPrep: Array<() => void> = [];
  private cachedMirrorFrustum: THREE.Frustum | null = null;
  private readonly shoalScratch: [number, number, number] = [0, 0, 0];
  private readonly fftDispScratch: [number, number, number] = [0, 0, 0];
  private readonly hybridScratch: [number, number, number] = [0, 0, 0];
  private upperTierLoad: Promise<void> | null = null;
  private planarLoad: Promise<void> | null = null;
  private fftU!: OceanService["shared"] & { uFftAtlas: THREE.IUniform<THREE.DataArrayTexture> };
  private disposed = false;
  private lastQualitySettings: Partial<QualitySettings> | undefined;
  private lastDpr = 1;
  private ctxRef: EngineContext | null = null;
  private applyQualityFn: ((tier: QualityTier, settings?: Partial<QualitySettings>, dpr?: number, allowResize?: boolean) => void) | null = null;

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout");
    if (!layout) throw new Error("[harbour/ocean] needs the 'layout' service");
    this.bounds = (layout.sea?.bounds as Bounds4 | undefined) ?? defaultSeaBounds(layout);
    this.bx0 = this.bounds[0]; this.bz0 = this.bounds[1];
    this.scx = (layout.bounds.min[0] + layout.bounds.max[0]) / 2; this.scz = (layout.bounds.min[2] + layout.bounds.max[2]) / 2;
    this.bw = this.bounds[2] - this.bounds[0]; this.bh = this.bounds[3] - this.bounds[1];

    this.ctxRef = ctx;
    this.refractEnabled = extraEnabled("refract");
    this.fftEnabled = extraEnabled("fft");
    this.mirrorEnabled = extraEnabled("mirror");
    this.planarEnabled = this.mirrorEnabled && extraEnabled("planar");
    this.sprayEnabled = extraEnabled("spray");

    const quality = ctx.services.get("quality");
    const initTier: QualityTier = quality?.tier ?? "medium";
    const needUpper = initTier !== "low";
    const needPlanar = initTier === "high" && this.planarEnabled;

    const [
      { OCEAN_FRAG, OCEAN_VERT, SEA_PALETTE },
      { WakeCollars },
      seabedMod,
      causticsMod,
      projMod,
      ribMod,
      fftMod,
      planarMod,
      ssrMod,
      sprayMod,
    ] = await abortable(
      Promise.all([
        import("./ocean-material"),
        import("./wake-collars"),
        this.refractEnabled ? import("./seabed") : Promise.resolve(null),
        this.refractEnabled ? import("./caustics-pass") : Promise.resolve(null),
        needUpper ? import("./projected-grid") : Promise.resolve(null),
        needUpper ? import("./wake-ribbons") : Promise.resolve(null),
        needUpper && this.fftEnabled ? import("./fft/fft-system") : Promise.resolve(null),
        needPlanar ? import("./planar-mirror") : Promise.resolve(null),
        needUpper && this.mirrorEnabled ? import("./hiz-ssr") : Promise.resolve(null),
        needUpper && this.sprayEnabled ? import("./spray-system") : Promise.resolve(null),
      ]),
      ctx.signal,
    );
    ctx.signal?.throwIfAborted();
    const fx = await acquireFxTextures(ctx);
    if (ctx.signal?.aborted) { fx.release(); ctx.signal.throwIfAborted(); }
    this.fx = fx;

    const loaded = await loadSdf(ctx, layout.sea?.sdf ?? "/harbour/sea-sdf.webp");
    if (ctx.signal?.aborted) { this.fx.release(); this.fx = null; ctx.signal.throwIfAborted(); }
    if (loaded) {
      this.sdfTex = loaded.tex; this.sdfData = loaded.data; this.coastR = loaded.coast; this.sdfSize = loaded.size;
    } else {
      this.layout = layout;
      this.awaitGround = true;
      const n = 1024;
      const data = buildSeaSdf(seaSdfInputFromLayout(layout, this.bounds, n));
      this.sdfTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
      this.sdfData = data;
      this.coastR = new Uint8Array(n * n);
      for (let i = 0; i < n * n; i++) this.coastR[i] = data[i * 4];
      this.sdfSize = n;
    }
    this.sdfTex.magFilter = THREE.LinearFilter;
    this.sdfTex.minFilter = THREE.LinearMipmapLinearFilter;
    this.sdfTex.wrapS = this.sdfTex.wrapT = THREE.ClampToEdgeWrapping;
    this.sdfTex.flipY = false;
    this.buildSdfMipmaps();
    this.sdfTex.needsUpdate = true;

    const wakeRes = Math.min(2048, THREE.MathUtils.ceilPowerOfTwo(Math.ceil(Math.max(this.bounds[2] - this.bounds[0], this.bounds[3] - this.bounds[1]) / 0.55)));
    const initWakeMode: WakeMode = initTier === "low" ? "r16f" : "rgba16f";
    const initWakeRes = initTier === "high" ? wakeRes : Math.min(1024, wakeRes);
    this.wake = new WakeField(this.bounds, initWakeRes, initWakeRes, initWakeMode);
    this.wake.bindSdf(this.sdfTex, this.bounds, this.scx, this.scz);

    if (projMod) this.projectedGrid = new projMod.ProjectedGrid();
    if (ribMod) this.wakeRibbons = new ribMod.WakeRibbons();
    if (fftMod) this.fft = new fftMod.FftWaveSystem();
    if (planarMod) this.planarMirror = new planarMod.PlanarMirror();
    if (ssrMod) this.hizSsr = new ssrMod.HiZSSR();

    const prep = ctx.services.get("preparation");
    const registerPrep = (entries: PreparationEntry[]) => {
      if (!prep) return;
      for (const entry of entries) this.unregPrep.push(prep.register(entry));
    };
    if (this.fft) registerPrep(this.fft.preparationEntries());
    if (this.wakeRibbons) registerPrep(this.wakeRibbons.preparationEntries());
    if (this.hizSsr) registerPrep(this.hizSsr.preparationEntries());

    const sky = ctx.services.get("sky");
    const skyShared: SkyShared | Record<string, THREE.IUniform> = sky?.shared ?? {
      uSkyBand: { value: null }, uSkyBandRange: { value: new THREE.Vector4(-48, 48, -1.5, 14) }, uFwdAz: { value: 0 },
      uHorizonDist: { value: 2500 }, uHorizonDepr: { value: 0.4 }, uGlintDir: { value: new THREE.Vector3(0, 0.6, -0.8) },
      uGlintCol: { value: new THREE.Color(0, 0, 0) }, uWeatherSea: { value: new THREE.Vector4(0.4, 0.3, 0.8, -0.6) },
    };
    const W = ctx.uniforms;
    const col = (h: string) => ({ value: new THREE.Color(h) });

    const uSdf = { value: this.sdfTex };
    const uSdfBounds = { value: new THREE.Vector4(...this.bounds) };
    const uZones = { value: (this.zoneTex = buildZoneMask((layout as { seaZones?: SeaZoneLike[] }).seaZones, this.bounds)) };
    const uNoise = { value: fx.noise };
    const uSceneCenter = { value: new THREE.Vector2(this.scx, this.scz) };

    this.fftFallback = makeFftFallback();
    const fftUniforms = {
      uFftAtlas: { value: this.fft?.uniforms.uFftAtlas.value ?? this.fftFallback },
      uFftOn: { value: this.fft?.uniforms.uFftOn.value ?? 0 },
      uFftScales: { value: this.fft ? this.fft.uniforms.uFftScales.value.clone() : new THREE.Vector4(1 / 509, 1 / 97, 1 / 17.3, 0.55) },
      uFftWeights: { value: this.fft ? this.fft.uniforms.uFftWeights.value.clone() : new THREE.Vector4(1, 1, 1, 1) },
    };
    this.fftU = {
      uTime: this.seaTime,
      uSea: this.seaU,
      uSdf,
      uSdfBounds,
      uSceneCenter,
      ...fftUniforms,
    };

    const gridUniforms = this.projectedGrid?.uniforms ?? {
      uProjGridOn: { value: 0 },
      uGridBL: { value: new THREE.Vector2() },
      uGridBR: { value: new THREE.Vector2() },
      uGridTL: { value: new THREE.Vector2() },
      uGridTR: { value: new THREE.Vector2() },
      uGridWeights: { value: new THREE.Vector4(1, 1, 2500, 0) },
    };
    const ribbonUniforms = this.wakeRibbons?.uniforms ?? {
      uLiveBounds: { value: new THREE.Vector4(...this.bounds) },
      uRibbonsOn: { value: 0 },
    };

    this.sceneCapture = new SceneCapture();
    this.reefAnchors = this.buildReefSprayAnchors(layout);
    if (sprayMod) {
      this.spray = new sprayMod.SpraySystem({ capture: this.sceneCapture.uniforms });
      this.spray.setReefAnchors(this.reefAnchors);
      this.spray.setEnabled(this.sprayEnabled);
      registerPrep(this.spray.preparationEntries());
    }
    if (this.refractEnabled && causticsMod && seabedMod) {
      this.caustics = new causticsMod.CausticsPass({
        uTime: this.seaTime,
        uSea: this.seaU,
        uSdf,
        uSdfBounds,
        uSceneCenter,
        uSunDir: W.uSunDir,
        uCameraPos: W.uCameraPos,
        uFftAtlas: fftUniforms.uFftAtlas,
        uFftOn: fftUniforms.uFftOn,
        uFftScales: fftUniforms.uFftScales,
        uFftWeights: fftUniforms.uFftWeights,
      });
      registerPrep(this.caustics.preparationEntries());
      const existingGround = ctx.services.get("ground");
      const initialGround = existingGround?.heights ? existingGround : null;
      this.seabed = new seabedMod.Seabed({
        bounds: this.bounds,
        sdfData: this.sdfData,
        sdfSize: this.sdfSize,
        sceneCenter: [this.scx, this.scz],
        ground: initialGround,
        uSdf,
        uSdfBounds,
        uZones,
        uNoise,
        uniforms: W,
      });
      this.seabedAwaitingGround = !initialGround;
    }

    const causticUniforms = this.caustics?.uniforms ?? {
      uCausticMap: { value: (this.causticFallback = Object.assign(new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1), { needsUpdate: true })) },
      uCausticBounds: { value: new THREE.Vector4(...this.bounds) },
      uCausticMode: { value: 0 },
    };

    this.mirrorFallback = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1, THREE.RGBAFormat);
    this.mirrorFallback.needsUpdate = true;

    this.material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      uniforms: {
        uTime: this.seaTime, uNight: W.uNight, uCameraPos: W.uCameraPos, uSunDir: W.uSunDir, uSunColor: W.uSunColor,
        uAmbient: W.uAmbient, uZenith: W.uZenith,
        uSea: this.seaU,
        uSdfBounds,
        uSdf,
        uZones,
        uWake: { value: null },
        uWakeLive: { value: null },
        uWakeBounds: { value: new THREE.Vector4(...this.bounds) },
        uWakeRgba: { value: initWakeMode === "rgba16f" ? 1 : 0 },
        ...ribbonUniforms,
        ...gridUniforms,
        ...fftUniforms,
        uFftAtlas: { value: null },
        uNoise, uRipple: { value: fx.ripple },
        uMirrorTex: { value: this.mirrorFallback },
        uPlanarVP: this.planarMirror?.uniforms.uPlanarVP ?? { value: new THREE.Matrix4() },
        uMirror: { value: new THREE.Vector4(0, 0.032, 0, 0) },
        uReflectMode: { value: 0 },
        uAbyss: col(SEA_PALETTE.abyss), uDeep: col(SEA_PALETTE.deep), uMid: col(SEA_PALETTE.mid), uShallow: col(SEA_PALETTE.shallow),
        uShoal: col(SEA_PALETTE.shoal), uSunlitShoal: col(SEA_PALETTE.sunlitShoal), uFoamCol: col(SEA_PALETTE.foam), uFoamNight: col(SEA_PALETTE.foamNight),
        ...skyShared,
        ...getBeamUniforms(ctx),
        ...cloudShadowUniforms,
        ...sunShadowUniforms,
        uFoliage: W.uFoliage,
        uDebug: { value: 0 },
        uGust: ensureGustService(ctx).uniform,
        uPoolTex: getHarbourMaterials(ctx).pool.uPoolTex, uPoolBounds: getHarbourMaterials(ctx).pool.uPoolBounds,
        uDynPoolTex: { value: (this.dynPoolFallback = Object.assign(new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1), { needsUpdate: true })) },
        uDynPool: { value: new THREE.Vector4(0, 0, 0, 0) },
        uDynPoolBounds: { value: new THREE.Vector4(...this.bounds) },
        uNightGlintPos: { value: Array.from({ length: MAX_NIGHT_GLINTS }, () => new THREE.Vector4()) },
        uNightGlintCol: { value: Array.from({ length: MAX_NIGHT_GLINTS }, () => new THREE.Vector4()) },
        uNightGlintCount: { value: 0 },
        uWindowGlow: W.uWindowGlow,
        uLampArrive: lampWaveUniforms.uLampArrive,
        uPrecip: W.uPrecip,
        uSceneCenter,
        uSceneRadius: { value: Math.hypot(layout.bounds.max[0] - layout.bounds.min[0], layout.bounds.max[2] - layout.bounds.min[2]) / 2 },
        uSeaHour: { value: new THREE.Vector4(1, 1, 1, 1) }, uSeaLow: { value: new THREE.Vector2(1, 0) }, uBloomT: { value: 1.5 },
        ...this.sceneCapture.uniforms,
        ...causticUniforms,
      },
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NoBlending,
      fog: false,
      defines: W.uFoliage.value.y > 0.001 ? { HB_BIOLUM: "" } : {},
    });
    this.material.uniforms.uWake.value = this.wake.texture;
    this.material.uniforms.uWakeLive.value = this.wake.live;
    this.material.uniforms.uFftAtlas = fftUniforms.uFftAtlas;

    // At most 2 ocean variants (HB_OCEAN_FULL shared by High & Medium, HB_LITE on Low) × 2 seasonal bits: zero compile on High↔Medium.
    const features = () => Object.freeze({ biolum: W.uFoliage.value.y > 0.001, lite: this.lite });
    this.material.customProgramCacheKey = () => { const f = features(); return `hb_ocean_${Number(f.biolum)}_${Number(f.lite)}`; };
    this.material.onBeforeCompile = (shader) => {
      const f = features();
      shader.defines = { ...shader.defines };
      delete shader.defines.HB_BIOLUM; delete shader.defines.HB_LITE;
      if (f.biolum) shader.defines.HB_BIOLUM = "";
      if (f.lite) shader.defines.HB_LITE = "";
    };

    this.collars = new WakeCollars({
      uTime: this.seaTime,
      uCameraPos: W.uCameraPos,
      uSea: this.seaU,
      uSdfBounds: this.material.uniforms.uSdfBounds,
      uSdf: this.material.uniforms.uSdf,
      uSceneCenter: this.material.uniforms.uSceneCenter,
      uNoise: this.material.uniforms.uNoise,
      uSunDir: W.uSunDir,
      uSunColor: W.uSunColor,
      uAmbient: W.uAmbient,
      uNight: W.uNight,
      uFftAtlas: fftUniforms.uFftAtlas,
      uFftOn: fftUniforms.uFftOn,
      uFftScales: fftUniforms.uFftScales,
      uFftWeights: fftUniforms.uFftWeights,
    });

    this.staticGeo = oceanGeometry(this.bounds);
    this.mesh = new THREE.Mesh(this.staticGeo, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;
    this.mesh.name = "ocean";

    const rebindWakeTextures = () => {
      this.material.uniforms.uWake.value = this.wake.texture;
      this.material.uniforms.uWakeRgba.value = this.wake.wakeMode === "rgba16f" ? 1 : 0;
      this.material.uniforms.uWakeLive.value = this.wakeRibbons?.active ? this.wakeRibbons.texture : this.wake.live;
    };

    const applyQuality = (
      tier: QualityTier,
      settings?: Partial<QualitySettings>,
      dpr = quality?.dpr ?? 1,
      allowResize = false,
    ) => {
      const high = tier === "high";
      const low = tier === "low";
      this.tier = tier;
      this.lastQualitySettings = settings;
      this.lastDpr = dpr;
      this.lite = low;
      this.captureHalfRes = settings?.captureHalfRes ?? !high;

      const causticMode: 0 | 1 | 2 = settings?.oceanCaustics
        ? (settings.oceanCaustics === "lightspace" ? 2 : settings.oceanCaustics === "hessian" ? 1 : 0)
        : (high ? 2 : tier === "medium" ? 1 : 0);
      this.collars.setActive(high);
      this.caustics?.setActive(causticMode === 2);
      this.caustics?.setMode(causticMode);

      const fftTier: QualityTier = this.fftEnabled ? tier : "low";
      this.fft?.setTier(fftTier);
      this.syncFftUniforms();
      if (low) this.fftUpdated = false;

      if (this.projectedGrid) {
        this.projectedGrid.setTier(tier);
        const gridGeo = this.projectedGrid.geometryFor(tier);
        this.mesh.geometry = gridGeo ?? this.staticGeo;
      } else {
        this.mesh.geometry = this.staticGeo;
        this.material.uniforms.uProjGridOn.value = 0;
      }

      this.wakeRibbons?.setTier(tier);
      const wantWakeMode: WakeMode = low ? "r16f" : "rgba16f";
      const wantWakeSize = high ? wakeRes : Math.min(1024, wakeRes);
      if (allowResize && ctx.renderer) {
        this.wake.setMode(ctx.renderer, wantWakeMode, wantWakeSize, rebindWakeTextures);
      } else {
        rebindWakeTextures();
      }

      // Tiered reflections: High = PlanarMirror (fallback to Hi-Z SSR if &extras=-planar); Med = Hi-Z SSR; Low = sky IBL.
      const wantRefl = settings?.oceanReflection ?? (high ? "planar" : tier === "medium" ? "ssr" : "ibl");
      const usePlanar = this.mirrorEnabled && this.planarEnabled && !low && wantRefl === "planar" && this.planarMirror !== null;
      const useSsr = this.mirrorEnabled && !low && !usePlanar && (wantRefl === "ssr" || wantRefl === "planar") && this.hizSsr !== null;
      this.reflectMode = usePlanar ? 2 : useSsr ? 1 : 0;
      this.material.uniforms.uReflectMode.value = this.reflectMode;
      this.planarMirror?.setActive(usePlanar, low || useSsr);
      this.hizSsr?.setActive(useSsr, low || usePlanar);
      if (!usePlanar && !useSsr) {
        this.material.uniforms.uMirrorTex.value = this.mirrorFallback;
        (this.material.uniforms.uMirror.value as THREE.Vector4).x = 0;
      }

      const refractActive = this.refractEnabled && dpr >= 0.8;
      this.seabed?.setVisible(refractActive);
      if (!refractActive) this.sceneCapture?.release();
      this.spray?.setTier(tier);
      this.spray?.setEnabled(this.sprayEnabled);
      this.syncFeatures();
      if (!low && (!this.projectedGrid || !this.wakeRibbons || (this.sprayEnabled && !this.spray) || (high && this.planarEnabled && !this.planarMirror))) {
        void this.ensureTierModules(tier, registerPrep).then(() => {
          if (!this.disposed && this.tier !== "low") this.applyQualityFn?.(this.tier, this.lastQualitySettings, this.lastDpr, false);
        });
      }
    };
    this.applyQualityFn = applyQuality;

    if (quality) {
      applyQuality(quality.tier, quality.settings, quality.dpr, false);
      this.unsubQuality = quality.onChange((q) => {
        applyQuality(q.tier, q, quality.dpr, true);
      });
    } else {
      applyQuality("medium", undefined, 1, false);
    }

    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const capture = this.sceneCapture;
      if (!capture) return;
      const source = ctx.composer?.inputBuffer;
      const dpr = ctx.services.get("quality")?.dpr ?? 1;
      const validPass = Boolean(
        source &&
        camera === ctx.camera &&
        renderer.getRenderTarget() === source &&
        !this.inPreparation,
      );
      if (!validPass) {
        if (dpr < 0.8) capture.release();
        else capture.uniforms.uCapReady.value = 0;
        return;
      }
      const gl = typeof renderer.getContext === "function" ? (renderer.getContext() as WebGL2RenderingContext | null) : null;
      const wasScissor = gl && typeof gl.isEnabled === "function" ? gl.isEnabled(gl.SCISSOR_TEST) : false;
      try {
        if (this.refractEnabled && dpr >= 0.8) {
          capture.capture(renderer, source!, ctx.camera, this.captureHalfRes, !this.lite);
        } else {
          if (dpr < 0.8) capture.release();
          else capture.uniforms.uCapReady.value = 0;
        }
        // Zero-latency frame-N curved moving wake ribbons (pushed during FleetSystem.update)
        if (!this.lite && this.wakeRibbons?.active && ctx.rig?.target) {
          this.wakeRibbons.render(renderer, ctx.rig.target.x, ctx.rig.target.z, ctx.rig.distance, this.lastDt);
          this.material.uniforms.uWakeLive.value = this.wakeRibbons.texture;
        }
        // High PlanarMirror or Medium same-frame Hi-Z SSR inside ocean.onBeforeRender (C1/C4 safe)
        if (!this.lite && this.reflectMode === 2 && this.planarMirror?.enabled) {
          this.planarMirror.render(renderer, ctx.scene, ctx.camera, ctx.rig?.target, this.lastDt);
          this.material.uniforms.uMirrorTex.value = this.planarMirror.uniforms.uMirrorTex.value;
          (this.material.uniforms.uMirror.value as THREE.Vector4).copy(this.planarMirror.uniforms.uMirror.value);
        } else if (!this.lite && this.reflectMode === 1 && this.hizSsr?.enabled && capture.uniforms.uCapReady.value > 0.5) {
          this.hizSsr.render(renderer, capture.uniforms.uCapColor.value, capture.uniforms.uCapDepth.value, ctx.camera, this.seaU.value.x, this.lastDt);
          this.material.uniforms.uMirrorTex.value = this.hizSsr.texture;
          (this.material.uniforms.uMirror.value as THREE.Vector4).copy(this.hizSsr.uniforms.uMirror.value);
        } else {
          this.material.uniforms.uMirrorTex.value = this.mirrorFallback;
          (this.material.uniforms.uMirror.value as THREE.Vector4).x = 0;
        }
      } finally {
        renderer.setRenderTarget(source!);
        if (gl) {
          if ((renderer.state?.bindFramebuffer?.(gl.READ_FRAMEBUFFER, null) as unknown as boolean | undefined) === false) {
            gl.bindFramebuffer?.(gl.READ_FRAMEBUFFER, null);
          }
        }
        renderer.state?.setScissorTest?.(wasScissor);
      }
    };

    ctx.scene.add(this.mesh, this.collars.mesh);
    if (this.seabed) ctx.scene.add(this.seabed.mesh);
    if (this.spray) ctx.scene.add(this.spray.mesh);

    const q = new URLSearchParams(location.search);
    const dbg = q.get("debugWake");
    if (dbg) {
      this.material.uniforms.uDebug.value = dbg === "2" ? 2 : dbg === "view" ? 1 : 0;
      this.seedDebugMovers(layout);
    }
    if (q.has("debugSea")) this.material.uniforms.uDebug.value = Number(q.get("debugSea"));
    if (q.has("sea")) this.setSeaState(Number(q.get("sea")) as SeaState);
    if (q.has("mirrorK")) {
      const k = THREE.MathUtils.clamp(Number(q.get("mirrorK")) || 0, 0, 1);
      if (this.planarMirror) this.planarMirror.strength = k;
      if (this.hizSsr) this.hizSsr.strength = k;
    }
    this.seaU.value.copy(this.seaGoal);

    const getState = () => this.state;
    const evalHybridDisp = (x: number, z: number, out: [number, number, number]): void => {
      const coast = this.evalShoalAt(x, z, this.shoalScratch);
      const sx = this.shoalScratch[0], sz = this.shoalScratch[1], shoalK = this.shoalScratch[2];
      const damp = dampOf(coast);
      const shoreDamp = damp * THREE.MathUtils.smoothstep(Math.max(coast, 0), 0, 2.8);
      const ph = swellPhase(sx, sz, this.time);
      const swAmp = this.seaU.value.x * damp * this.fftU.uFftWeights.value.w;
      const cPh = Math.cos(ph) * W0_QA * swAmp;
      const swY = W0.amp * Math.sin(ph) * swAmp * (1 + 0.24 * shoalK);
      this.fft!.sampleRawDisplacement(sx, sz, this.fftDispScratch);
      out[0] = cPh * W0.dirX + this.fftDispScratch[0] * shoreDamp;
      out[1] = swY + this.fftDispScratch[1] * shoreDamp * (1 + 0.32 * shoalK);
      out[2] = cPh * W0.dirZ + this.fftDispScratch[2] * shoreDamp;
    };
    const heightAtHybrid = (x: number, z: number): number => {
      let xEst = x, zEst = z;
      for (let it = 0; it < 2; it++) {
        evalHybridDisp(xEst, zEst, this.hybridScratch);
        xEst = x - this.hybridScratch[0];
        zEst = z - this.hybridScratch[2];
      }
      evalHybridDisp(xEst, zEst, this.hybridScratch);
      return this.hybridScratch[1];
    };

    const svc: OceanService = {
      preparationScope: (tierOrLite) => {
        const targetLite = typeof tierOrLite === "boolean" ? tierOrLite : tierOrLite === "low";
        const previous = this.lite;
        const prevPrep = this.inPreparation;
        this.lite = targetLite;
        this.inPreparation = true;
        return () => { this.lite = previous; this.inPreparation = prevPrep; };
      },
      prepareTier: (tier) => {
        if (tier === "low") return;
        const needUpper = !this.projectedGrid || !this.wakeRibbons || (this.fftEnabled && !this.fft) || (this.mirrorEnabled && !this.hizSsr) || (this.sprayEnabled && !this.spray);
        const needPlanar = tier === "high" && this.planarEnabled && !this.planarMirror;
        if (!needUpper && !needPlanar) return;
        return this.ensureTierModules(tier, registerPrep);
      },
      featureIdentity: (tier) =>
        `${tier === "low" ? "lite" : "full"}:${this.fftEnabled ? 1 : 0}:${this.refractEnabled ? 1 : 0}:${this.mirrorEnabled ? 1 : 0}:${this.planarEnabled ? 1 : 0}`,
      mirrorFrustum: () => this.cachedMirrorFrustum,
      setSeaState: (s) => this.setSeaState(s),
      get seaState() { return getState(); },
      heightAt: (x, z, point) => {
        if (this.fft && this.fftUpdated && this.fft.uniforms.uFftOn.value > 0.5) {
          return heightAtHybrid(x, z);
        }
        if (!point) return waveHeight(x, z, this.time, this.seaU.value.x) * this.dampAt(x, z);
        const D = POINT_DAMP_AT;
        if (!(point[0] === x && point[1] === z && point[D] === this.sdfVersion)) { point[D] = this.sdfVersion; point[D + 1] = this.dampAt(x, z); }
        return pointSwell(x, z, this.time, this.seaU.value.x, point) * point[D + 1];
      },
      hullHeights: (x, z, bx, bz, px, pz, out, cache) => {
        if (this.fft && this.fftUpdated && this.fft.uniforms.uFftOn.value > 0.5) {
          out[0] = heightAtHybrid(x, z);
          out[1] = heightAtHybrid(x + bx, z + bz);
          out[2] = heightAtHybrid(x - bx, z - bz);
          out[3] = heightAtHybrid(x + px, z + pz);
          out[4] = heightAtHybrid(x - px, z - pz);
          return;
        }
        hullSwell(x, z, bx, bz, px, pz, this.time, this.seaU.value.x, out, cache);
        out[0] *= this.dampAt(x, z);
        out[1] *= this.dampAt(x + bx, z + bz); out[2] *= this.dampAt(x - bx, z - bz);
        out[3] *= this.dampAt(x + px, z + pz); out[4] *= this.dampAt(x - px, z - pz);
      },
      coastAt: (x, z) => this.coastAt(x, z),
      dampAt: (x, z) => this.dampAt(x, z),
      bindDynPool: (tex, intensity, bounds) => {
        this.material.uniforms.uDynPoolTex.value = tex ?? this.dynPoolFallback;
        (this.material.uniforms.uDynPool.value as THREE.Vector4).x = tex ? intensity : 0;
        if (bounds) (this.material.uniforms.uDynPoolBounds.value as THREE.Vector4).set(bounds[0], bounds[1], bounds[2], bounds[3]);
      },
      bindNightGlints: (posArr, colArr, count) => {
        const n = Math.min(MAX_NIGHT_GLINTS, Math.max(0, Math.floor(count)));
        const dstPos = this.material.uniforms.uNightGlintPos.value as THREE.Vector4[];
        const dstCol = this.material.uniforms.uNightGlintCol.value as THREE.Vector4[];
        for (let i = 0; i < n; i++) {
          dstPos[i].copy(posArr[i]);
          dstCol[i].copy(colArr[i]);
        }
        this.material.uniforms.uNightGlintCount.value = n;
      },
      shared: this.fftU,
    };

    const wakeSvc: WakeService = {
      clear: (renderer) => {
        this.wake.clear(renderer);
        this.wakeRibbons?.clear(renderer);
      },
      preparationEntries: () => this.wake.preparationEntries(),
      stamp: (x, z, vx, vz, hw, str, hl, seed, ringScale) => this.wake.stamp(x, z, vx, vz, hw, str, hl, seed, ringScale),
      get texture() { return wakeFieldRef.texture; },
      get live() { return wakeFieldRef.live; },
      bounds: this.wake.bounds,
    };
    const wakeFieldRef = this.wake;

    const getRibbons = () => this.wakeRibbons;
    const ribbonSvc: WakeRibbonService = {
      get active() { return Boolean(getRibbons()?.active); },
      pushMoving: (id, x, z, vx, vz, hw, hl, str, fx0, fz0) => {
        getRibbons()?.pushMoving(id, x, z, vx, vz, hw, hl, str, fx0, fz0);
      },
    };

    const getSpray = () => this.spray;
    const sampleSprayWaterY = (x: number, z: number) => svc.heightAt(x, z);
    const spraySvc: SprayService = {
      get enabled() { return Boolean(getSpray()?.enabled); },
      get activeCount() { return getSpray()?.activeCount ?? 0; },
      get maxParticles() { return getSpray()?.maxParticles ?? 0; },
      beginFrame: () => { getSpray()?.beginFrame(); },
      pushBow: (x, z, vx, vz, bowLen, speed, impact, focusX, focusZ) => {
        getSpray()?.pushBow(x, z, vx, vz, bowLen, speed, impact, focusX, focusZ);
      },
      pushOar: (x, z, vx, vz, beam, camDist, oarPhase) => {
        getSpray()?.pushOar(x, z, vx, vz, beam, camDist, oarPhase);
      },
      setReefAnchors: (points) => {
        getSpray()?.setReefAnchors(points);
      },
      flush: () => {
        const spray = getSpray();
        if (!spray || this.lite || !this.sprayEnabled) return;
        // Runs right before composer.render() after FleetSystem queued bow/oar emitters, so Three.js
        // render-list collection and GPU buffer upload see current frame visibility, count, and wave-relative heights.
        spray.step(
          this.lastDt,
          this.time,
          this.seaU.value.x,
          this.lastWindDir[0],
          this.lastWindDir[1],
          ctx.uniforms.uSunColor.value,
          ctx.uniforms.uAmbient.value,
          ctx.uniforms.uNight.value,
          this.clock ? this.clock.live : 1,
          sampleSprayWaterY,
        );
      },
    };

    ctx.services.set("ocean", svc);
    ctx.services.set("wake", wakeSvc);
    ctx.services.set("wakeCollars", this.collars satisfies WakeCollarService);
    ctx.services.set("wakeRibbons", ribbonSvc);
    ctx.services.set("spray", spraySvc);
  }

  resize(width: number, height: number): void {
    this.planarMirror?.resize(width, height);
    this.hizSsr?.resize(width, height);
  }

  setSeaState(s: SeaState): void {
    const st = Math.max(0, Math.min(3, Math.round(s))) as SeaState;
    this.state = st;
    const p = SEA_STATES[st];
    this.seaGoal.set(p.amp, p.chop, p.caps, p.bands);
  }

  private syncFftUniforms(): void {
    if (!this.fftU) return;
    if (this.fft) {
      this.fftU.uFftAtlas.value = this.fft.uniforms.uFftAtlas.value;
      this.fftU.uFftOn.value = this.fft.uniforms.uFftOn.value;
      this.fftU.uFftScales.value.copy(this.fft.uniforms.uFftScales.value);
      this.fftU.uFftWeights.value.copy(this.fft.uniforms.uFftWeights.value);
    } else {
      this.fftU.uFftAtlas.value = this.fftFallback!;
      this.fftU.uFftOn.value = 0;
    }
  }

  private async ensureTierModules(tier: QualityTier, registerPrep: (entries: PreparationEntry[]) => void): Promise<void> {
    if (tier === "low" || this.disposed) return;
    const sig = this.ctxRef?.signal;
    if (!this.upperTierLoad) {
      this.upperTierLoad = (async () => {
        const [projMod, ribMod, fftMod, ssrMod, sprayMod] = await abortable(
          Promise.all([
            this.projectedGrid ? Promise.resolve(null) : import("./projected-grid"),
            this.wakeRibbons ? Promise.resolve(null) : import("./wake-ribbons"),
            !this.fft && this.fftEnabled ? import("./fft/fft-system") : Promise.resolve(null),
            !this.hizSsr && this.mirrorEnabled ? import("./hiz-ssr") : Promise.resolve(null),
            !this.spray && this.sprayEnabled ? import("./spray-system") : Promise.resolve(null),
          ]),
          sig,
        );
        if (this.disposed) return;
        if (projMod && !this.projectedGrid) {
          this.projectedGrid = new projMod.ProjectedGrid();
          Object.assign(this.material.uniforms, this.projectedGrid.uniforms);
        }
        if (ribMod && !this.wakeRibbons) {
          this.wakeRibbons = new ribMod.WakeRibbons();
          Object.assign(this.material.uniforms, this.wakeRibbons.uniforms);
          registerPrep(this.wakeRibbons.preparationEntries());
        }
        if (fftMod && !this.fft) {
          this.fft = new fftMod.FftWaveSystem();
          registerPrep(this.fft.preparationEntries());
          this.syncFftUniforms();
        }
        if (ssrMod && !this.hizSsr) {
          this.hizSsr = new ssrMod.HiZSSR();
          registerPrep(this.hizSsr.preparationEntries());
        }
        if (sprayMod && !this.spray && this.sceneCapture) {
          this.spray = new sprayMod.SpraySystem({ capture: this.sceneCapture.uniforms });
          this.spray.setTier(this.tier);
          this.spray.setReefAnchors(this.reefAnchors);
          this.spray.setEnabled(this.sprayEnabled);
          this.ctxRef?.scene.add(this.spray.mesh);
          registerPrep(this.spray.preparationEntries());
        }
      })();
    }
    await this.upperTierLoad;
    if (tier === "high" && this.planarEnabled && !this.planarMirror && !this.disposed) {
      if (!this.planarLoad) {
        this.planarLoad = (async () => {
          const planarMod = await abortable(import("./planar-mirror"), sig);
          if (this.disposed || this.planarMirror) return;
          this.planarMirror = new planarMod.PlanarMirror();
          this.material.uniforms.uPlanarVP = this.planarMirror.uniforms.uPlanarVP;
        })();
      }
      await this.planarLoad;
    }
  }

  private syncFeatures(): void {
    const key = this.material.customProgramCacheKey();
    if (key !== this.featureKey) { this.featureKey = key; this.material.needsUpdate = true; }
  }

  private texel(x: number, z: number): number {
    const u = (x - this.bx0) / this.bw, v = (z - this.bz0) / this.bh;
    if (u < 0 || u > 1 || v < 0 || v > 1) return -1;
    const n = this.sdfSize;
    return Math.min(n - 1, Math.floor(v * n)) * n + Math.min(n - 1, Math.floor(u * n));
  }

  /**
   * Builds the full RGBA8 mipmap chain on CPU and assigns it directly to `this.sdfTex.mipmaps`
   * (`generateMipmaps = false`) so the GPU `textureLod(uSdf, ..., 2.0)` and CPU buoyancy `evalShoalAt`
   * read the exact same quantized RGBA8 mip-2 bytes across all WebGL2 drivers (Vulkan, Metal, D3D11).
   */
  private buildSdfMipmaps(): void {
    const n = this.sdfSize;
    const mipmaps: Array<{ data: Uint8Array; width: number; height: number }> = [
      { data: this.sdfData, width: n, height: n },
    ];
    let prev = this.sdfData;
    let pw = n;
    let ph = n;
    while (pw > 1 || ph > 1) {
      const w = Math.max(1, pw >> 1);
      const h = Math.max(1, ph >> 1);
      const dst = new Uint8Array(w * h * 4);
      for (let y = 0; y < h; y++) {
        const y0 = Math.min(ph - 1, y << 1);
        const y1 = Math.min(ph - 1, y0 + 1);
        const r0 = y0 * pw;
        const r1 = y1 * pw;
        for (let x = 0; x < w; x++) {
          const x0 = Math.min(pw - 1, x << 1);
          const x1 = Math.min(pw - 1, x0 + 1);
          const i00 = (r0 + x0) << 2;
          const i10 = (r0 + x1) << 2;
          const i01 = (r1 + x0) << 2;
          const i11 = (r1 + x1) << 2;
          const o = (y * w + x) << 2;
          dst[o] = (prev[i00] + prev[i10] + prev[i01] + prev[i11] + 2) >> 2;
          dst[o + 1] = (prev[i00 + 1] + prev[i10 + 1] + prev[i01 + 1] + prev[i11 + 1] + 2) >> 2;
          dst[o + 2] = (prev[i00 + 2] + prev[i10 + 2] + prev[i01 + 2] + prev[i11 + 2] + 2) >> 2;
          dst[o + 3] = (prev[i00 + 3] + prev[i10 + 3] + prev[i01 + 3] + prev[i11 + 3] + 2) >> 2;
        }
      }
      mipmaps.push({ data: dst, width: w, height: h });
      prev = dst;
      pw = w;
      ph = h;
    }
    this.sdfTex.mipmaps = mipmaps as unknown as THREE.DataTexture["mipmaps"];
    this.sdfTex.generateMipmaps = false;
    const mip2 = mipmaps[Math.min(2, mipmaps.length - 1)]!;
    this.coastMip2Size = mip2.width;
    this.coastMip2Data = mip2.data;
  }

  private sampleCoastLinear(u: number, v: number): number {
    const n = this.sdfSize;
    const sx = Math.max(0, Math.min(n - 1, Math.max(0, Math.min(1, u)) * n - 0.5));
    const sz = Math.max(0, Math.min(n - 1, Math.max(0, Math.min(1, v)) * n - 0.5));
    const x0 = Math.floor(sx), z0 = Math.floor(sz);
    const x1 = Math.min(n - 1, x0 + 1), z1 = Math.min(n - 1, z0 + 1);
    const tx = sx - x0, tz = sz - z0;
    const r0 = z0 * n, r1 = z1 * n;
    const top = this.coastR[r0 + x0] + (this.coastR[r0 + x1] - this.coastR[r0 + x0]) * tx;
    const bot = this.coastR[r1 + x0] + (this.coastR[r1 + x1] - this.coastR[r1 + x0]) * tx;
    return (top + (bot - top) * tz) / 255;
  }

  private sampleDepthLinear(u: number, v: number): number {
    const n = this.sdfSize;
    const sx = Math.max(0, Math.min(n - 1, Math.max(0, Math.min(1, u)) * n - 0.5));
    const sz = Math.max(0, Math.min(n - 1, Math.max(0, Math.min(1, v)) * n - 0.5));
    const x0 = Math.floor(sx), z0 = Math.floor(sz);
    const x1 = Math.min(n - 1, x0 + 1), z1 = Math.min(n - 1, z0 + 1);
    const tx = sx - x0, tz = sz - z0;
    const d = this.sdfData;
    const r0 = z0 * n, r1 = z1 * n;
    const g00 = d[(r0 + x0) * 4 + 1], g10 = d[(r0 + x1) * 4 + 1];
    const g01 = d[(r1 + x0) * 4 + 1], g11 = d[(r1 + x1) * 4 + 1];
    const top = g00 + (g10 - g00) * tx;
    const bot = g01 + (g11 - g01) * tx;
    return (top + (bot - top) * tz) / 255;
  }

  private sampleCoastMip2(u: number, v: number): number {
    const m = this.coastMip2Size;
    const sx = Math.max(0, Math.min(m - 1, Math.max(0, Math.min(1, u)) * m - 0.5));
    const sz = Math.max(0, Math.min(m - 1, Math.max(0, Math.min(1, v)) * m - 0.5));
    const x0 = Math.floor(sx), z0 = Math.floor(sz);
    const x1 = Math.min(m - 1, x0 + 1), z1 = Math.min(m - 1, z0 + 1);
    const tx = sx - x0, tz = sz - z0;
    const mip = this.coastMip2Data;
    const r0 = z0 * m, r1 = z1 * m;
    const v00 = mip[(r0 + x0) << 2], v10 = mip[(r0 + x1) << 2];
    const v01 = mip[(r1 + x0) << 2], v11 = mip[(r1 + x1) << 2];
    const top = v00 + (v10 - v00) * tx;
    const bot = v01 + (v11 - v01) * tx;
    return (top + (bot - top) * tz) / 255;
  }

  private evalShoalAt(x: number, z: number, out: [number, number, number]): number {
    const u = (x - this.bx0) / this.bw, v = (z - this.bz0) / this.bh;
    if (u < 0 || u > 1 || v < 0 || v > 1) {
      out[0] = x; out[1] = z; out[2] = 0;
      return 200;
    }
    const k = sdfMainlandFade(x, z, this.scx, this.scz);
    const r = this.sampleCoastLinear(u, v);
    const coast = ((k > 0 ? r + (1 - r) * k : r) - 0.5) * SDF_COAST_RANGE;
    if (coast < 56) {
      const g = this.sampleDepthLinear(u, v);
      const depth = (k > 0 ? g + (1 - g) * k : g) * 40;
      const eS = 0.004;
      const gx = this.sampleCoastMip2(u + eS, v) - this.sampleCoastMip2(u - eS, v);
      const gz = this.sampleCoastMip2(u, v + eS) - this.sampleCoastMip2(u, v - eS);
      const gl = Math.hypot(gx, gz);
      const gFade = THREE.MathUtils.smoothstep(gl, 0.002, 0.008);
      const snx = gl > 1e-4 ? (gx / gl) * gFade : 0;
      const snz = gl > 1e-4 ? (gz / gl) * gFade : 0;
      shoalCoordsCpu(x, z, depth, coast, snx, snz, out);
    } else {
      out[0] = x; out[1] = z; out[2] = 0;
    }
    return coast;
  }

  private coastAt(x: number, z: number): number {
    const i = this.texel(x, z);
    if (i < 0) return 200;
    const c = coastOf(this.coastR[i]), k = sdfMainlandFade(x, z, this.scx, this.scz);
    return k > 0 ? c + (SDF_COAST_RANGE / 2 - c) * k : c;
  }

  private dampAt(x: number, z: number): number {
    const i = this.texel(x, z);
    if (i < 0) return 1;
    const k = sdfMainlandFade(x, z, this.scx, this.scz);
    if (!(k > 0)) return DAMP_BY_BYTE[this.coastR[i]];
    const c = coastOf(this.coastR[i]);
    return dampOf(c + (SDF_COAST_RANGE / 2 - c) * k);
  }

  private seedDebugMovers(layout: HarbourLayout): void {
    const bay = layout.island?.bay as Array<[number, number]> | undefined;
    let cx = 0, cz = 0;
    if (Array.isArray(bay) && bay.length) { for (const p of bay) { cx += p[0]; cz += p[1]; } cx /= bay.length; cz /= bay.length; }
    this.debugMovers = [
      { cx, cz, r: 60, w: 0.05, ph: 0, hw: 2.2 },
      { cx: cx + 30, cz: cz - 40, r: 35, w: -0.09, ph: 2, hw: 1.4 },
      { cx: cx - 40, cz: cz + 20, r: 80, w: 0.035, ph: 4, hw: 3.0 },
      { cx: cx + 10, cz: cz + 50, r: 0, w: 0, ph: 0, hw: 2.0 },
    ];
  }

  private rebuildFromGround(ground: HeightField): void {
    if (!this.layout) return;
    const n = this.sdfSize;
    const input = seaSdfInputFromLayout(this.layout, this.bounds, n);
    const data = buildSeaSdf(input, landMaskFromHeights(input, ground, this.layout.deckY ?? 1.2));
    const tex = this.sdfTex as THREE.DataTexture;
    (tex.image.data as Uint8Array).set(data);
    this.sdfData = data;
    for (let i = 0; i < n * n; i++) this.coastR[i] = data[i * 4];
    this.buildSdfMipmaps();
    tex.needsUpdate = true;
    this.sdfVersion++;
  }

  private buildReefSprayAnchors(layout: HarbourLayout): Array<[number, number, number, number]> {
    const lines: Array<{ pts: Array<[number, number]>; closed: boolean }> = [];
    const isl = layout.island;
    if (isl?.breakwater?.length) lines.push({ pts: isl.breakwater as Array<[number, number]>, closed: false });
    const shoals = layout.zones?.shoals?.polygon as Array<[number, number]> | undefined;
    if (shoals?.length) lines.push({ pts: shoals, closed: true });
    const out: Array<[number, number, number, number]> = [];
    const STEP = 10;
    for (const { pts, closed } of lines) {
      const segs = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segs; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1e-3) continue;
        const nx = -(bz - az) / len, nz = (bx - ax) / len;
        for (let s = 0; s < len; s += STEP) {
          const x = ax + (bx - ax) * (s / len), z = az + (bz - az) * (s / len);
          const cp = this.coastAt(x + nx * 6, z + nz * 6), cm = this.coastAt(x - nx * 6, z - nz * 6);
          const sgn = cp >= cm ? 1 : -1;
          if (Math.max(cp, cm) < 1.5) continue;
          out.push([x + nx * sgn * 1.5, z + nz * sgn * 1.5, nx * sgn, nz * sgn]);
        }
      }
    }
    return out;
  }

  update(frame: FrameState, ctx: EngineContext): void {
    this.lastDt = frame.delta;
    this.collars.beginFrame();
    this.wakeRibbons?.beginFrame();
    this.spray?.beginFrame();
    this.syncFeatures();

    const fogAmt = THREE.MathUtils.smoothstep(ctx.services.get("readings")?.fog ?? 0, 0, 1);
    const precipAmt = Math.max(ctx.uniforms.uPrecip.value.x, ctx.uniforms.uPrecip.value.y);
    this.planarMirror?.setConditions(fogAmt, precipAmt);
    this.hizSsr?.setConditions(fogAmt, precipAmt);
    // H12: compute High PlanarMirror frustum before FleetSystem.update poses vessels
    this.cachedMirrorFrustum = this.reflectMode === 2 && this.planarMirror?.enabled && ctx.camera
      ? this.planarMirror.updateFrustum(ctx.camera, ctx.rig?.target)
      : null;

    if (this.awaitGround || this.seabedAwaitingGround) {
      const ground = ctx.services.get("ground");
      if (ground?.heights) {
        if (this.awaitGround) {
          this.awaitGround = false;
          this.rebuildFromGround(ground);
        }
        if (this.seabedAwaitingGround) {
          this.seabedAwaitingGround = false;
          this.seabed?.rebuild(this.sdfData, this.sdfSize, ground);
        }
      }
    }
    this.clock ??= new MotionClock(ensureMotionService(ctx));
    this.time = this.seaTime.value = this.clock.step(frame.delta);
    ensureGustService(ctx).tick(ctx, frame);
    this.seaU.value.lerp(this.seaGoal, 1 - Math.exp(-frame.delta * 0.4));
    runupUniforms.uRunup.value.set(this.seaU.value.x, this.time);

    const ws = this.material.uniforms.uWeatherSea.value as THREE.Vector4;
    let wdx = ws.z, wdz = ws.w;
    const wl = Math.hypot(wdx, wdz);
    if (wl > 1e-4) { wdx /= wl; wdz /= wl; this.wake.lee.set(wdx, wdz); }
    else { wdx = 0.8; wdz = -0.6; }
    this.lastWindDir[0] = wdx;
    this.lastWindDir[1] = wdz;

    // 3-cascade WebGL2 FFT + 64^2 CPU buoyancy mirror (High & Medium only)
    const storm = THREE.MathUtils.smoothstep(this.seaU.value.x, 0.3, 0.85);
    if (this.fft && !this.lite && ctx.renderer) {
      const windSpeed = 4.5 + ws.y * 12.5 + storm * 6.0;
      this.fft.update(ctx.renderer, this.time, windSpeed, wdx, wdz, this.seaU.value.x, this.seaU.value.y);
      this.fftUpdated = true;
      this.syncFftUniforms();
      this.wake.bindFft(this.fft.uniforms.uFftAtlas.value, this.fft.uniforms.uFftScales.value, 1, this.seaU.value.x, storm);
    } else {
      this.wake.bindFft(null, null, 0, this.seaU.value.x, storm);
    }

    // Update camera-centered Projected Grid corners for this frame
    if (this.projectedGrid && !this.lite && ctx.camera && ctx.rig?.target) {
      const horizonDist = (this.material.uniforms.uHorizonDist.value as number) || 2500;
      this.projectedGrid.update(ctx.camera, ctx.rig.target, horizonDist);
    }

    for (let i = 0; i < this.debugMovers.length; i++) {
      const m = this.debugMovers[i]!;
      const a = m.ph + this.time * m.w;
      const x = m.cx + Math.cos(a) * m.r, z = m.cz + Math.sin(a) * m.r;
      const vx = -Math.sin(a) * m.r * m.w, vz = Math.cos(a) * m.r * m.w;
      this.wake.stamp(x, z, vx, vz, m.hw, 1, undefined, m.ph);
      const spd = Math.hypot(vx, vz);
      if (spd > 0.25 && ctx.rig?.target) {
        this.wakeRibbons?.pushMoving(10000 + i, x, z, vx, vz, m.hw, m.hw * 3.1, 1, ctx.rig.target.x, ctx.rig.target.z);
      }
      const fx = spd > 1e-3 ? vx / spd : 0, fz = spd > 1e-3 ? vz / spd : 1;
      this.collars.push(x, z, fx, fz, m.hw * 6.2, m.hw * 2, spd, m.r > 50 ? 1 : 0, this.time * 3.1416 + m.ph * 2.1);
    }

    const sc = this.material.uniforms.uSceneCenter.value as THREE.Vector2, sr = this.material.uniforms.uSceneRadius.value as number;
    updateAerial(sc.x, sc.y, sr * 0.62, sr * 1.2, ctx.uniforms.uNight.value);
    this.wake.update(ctx.renderer, frame.delta);
    const u = this.material.uniforms;
    u.uWake.value = this.wake.texture;
    u.uWakeRgba.value = this.wake.wakeMode === "rgba16f" ? 1 : 0;
    if (!this.wakeRibbons?.active) u.uWakeLive.value = this.wake.live;

    if (this.caustics && this.tier === "high" && ctx.rig?.target) {
      const sunUp = THREE.MathUtils.clamp(ctx.uniforms.uSunDir.value.y * 3, 0, 1) * (1 - ctx.uniforms.uNight.value);
      this.caustics.render(ctx.renderer, ctx.rig.target.x, ctx.rig.target.z, sunUp);
    }
    this.hourLight(ctx);
  }

  private hourLight(ctx: EngineContext): void {
    const tod = ctx.timeOfDay, u = this.material.uniforms;
    if (!tod) return;
    u.uBloomT.value = tod.bloomThreshold;
    const s = (this.hourTod ??= new TimeOfDay());
    s.keyframes = tod.keyframes; s.season = tod.season;
    s.hour = 12; s.apply(this.noonU);
    s.hour = tod.hour; s.apply(this.hourU);
    seaHour(this.hourU, this.noonU, u.uSeaHour.value as THREE.Vector4, u.uSeaLow.value as THREE.Vector2);
  }

  dispose(ctx: EngineContext): void {
    this.disposed = true;
    this.unsubQuality?.();
    this.unsubQuality = null;
    for (const unreg of this.unregPrep) unreg();
    this.unregPrep.length = 0;
    this.cachedMirrorFrustum = null;
    this.planarMirror?.dispose();
    this.planarMirror = null;
    this.hizSsr?.dispose();
    this.hizSsr = null;
    this.fft?.dispose();
    this.fft = null;
    this.fftUpdated = false;
    this.wakeRibbons?.dispose();
    this.wakeRibbons = null;
    this.sceneCapture?.dispose();
    this.sceneCapture = null;
    if (this.spray) {
      ctx.scene.remove(this.spray.mesh);
      this.spray.dispose();
      this.spray = null;
    }
    if (this.seabed) {
      ctx.scene.remove(this.seabed.mesh);
      this.seabed.dispose();
      this.seabed = null;
    }
    this.caustics?.dispose();
    this.caustics = null;
    this.causticFallback?.dispose();
    this.causticFallback = null;
    this.mirrorFallback?.dispose();
    this.mirrorFallback = null;
    this.fftFallback?.dispose();
    this.fftFallback = null;
    if (this.collars) {
      ctx.scene.remove(this.collars.mesh);
      this.collars.dispose();
    }
    if (this.mesh) {
      this.mesh.onBeforeRender = () => {};
      ctx.scene.remove(this.mesh);
    }
    this.staticGeo?.dispose();
    this.projectedGrid?.dispose();
    this.projectedGrid = null;
    this.material?.dispose();
    this.wake?.dispose();
    this.sdfTex?.dispose();
    this.zoneTex?.dispose();
    this.dynPoolFallback?.dispose();
    this.dynPoolFallback = null;
    this.fx?.release();
    this.fx = null;
    ctx.services.delete("ocean");
    ctx.services.delete("wake");
    ctx.services.delete("wakeCollars");
    ctx.services.delete("wakeRibbons");
    ctx.services.delete("spray");
  }
}
