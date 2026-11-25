import { ensureGustService } from "../weather/gust";
import * as THREE from "three";
import { getBeamUniforms } from "../beam/uniforms";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { SkyShared } from "../sky/sky-system";
import { cloudShadowUniforms } from "../sky/cloud-shadow";
import { sunShadowUniforms } from "../world/sun-shadow";
import { OCEAN_FRAG, OCEAN_VERT, SEA_PALETTE } from "./ocean-material";
import { buildSeaSdf, defaultSeaBounds, landMaskFromHeights, SDF_COAST_RANGE, sdfMainlandFade, seaSdfInputFromLayout, type Bounds4, type HeightField } from "./sea-sdf";
import { acquireFxTextures, type FxTextures } from "./textures";
import { WakeField, type WakeService } from "./wake";
import { updateAerial } from "../world/aerial";
import { runupUniforms } from "../world/runup";
import { hullSwell, POINT_DAMP_AT, pointSwell, SEA_STATES, waveHeight } from "./waves";
import { ensureMotionService, MotionClock } from "../ui/services";
import { buildZoneMask, type SeaZoneLike } from "./zone-mask";
import { loadSdfImage } from "./sdf-image";
import { getHarbourMaterials } from "../world/materials";
import { lampWaveUniforms } from "../lights/lamp-wave";
import { TimeOfDay } from "../engine/time-of-day";
import { createWorldUniforms } from "../engine/uniforms";
import { seaHour } from "./sea-tone";
import { extraEnabled } from "../engine/extras";
import { MirrorPass, OCEAN_FRAG_MIRROR } from "./mirror-pass";
import { SceneCapture } from "./scene-capture";
import type { Seabed } from "./seabed";
import type { CausticsPass } from "./caustics-pass";
import type { WakeCollars } from "./wake-collars";
import type { WakeCollarService } from "../engine/services";
import type { QualityTier } from "../engine/quality";
import { abortable } from "../engine/transport";
import { MAX_NIGHT_GLINTS } from "../lights/dyn-pool";

/**
 * OCEAN: one large sea plane (fine grid over the sea bounds, a stretched far ring beyond), an unlit
 * depth-tint ramp from the sea SDF, a glossy dielectric reflecting the painted sky band, Gerstner swell,
 * ripple normals with cat's paws, crisp coast/structure foam, hull contact rings, Kelvin wakes, the
 * sun/moon glitter path, the lighthouse beam's sweeping glint and a haze that meets the sky backdrop.
 *
 * Services: 'wake' (WakeService) and 'ocean' (OceanService).
 */
export type SeaState = 0 | 1 | 2 | 3;

export interface OceanService {
  preparationScope(lite: boolean): () => void;
  setSeaState(state: SeaState): void;
  readonly seaState: SeaState;
  /**
   * Sea surface height (m) at world (x, z) now, for bobbing hulls. `point` (waves.ts pointSwellCache, one per fixed point
   * such as a buoy) keeps its phases and coast damping: no trig per frame (waves.ts pointSwell), the same height to rounding.
   */
  heightAt(x: number, z: number, point?: Float64Array): number;
  /**
   * heightAt at a hull's centre (x, z), bow / stern ± (bx, bz) and port / starboard ± (px, pz) into out[0..4],
   * in one call. `cache` (waves.ts hullSwellCache, one per hull): for a hull at rest, no trig instead of 25.
   */
  hullHeights(x: number, z: number, bx: number, bz: number, px: number, pz: number, out: Float64Array, cache: Float64Array | null): void;
  /** P6 (identity): the sea's own clock, swell scale and SDF, so overlays on the water (chart lettering) ride the same swell. */
  /** P6 (identity): signed coast distance (m) at world (x, z) from the sea SDF; > 0 is open water. */
  coastAt(x: number, z: number): number;
  /** Swell coastal damping factor (0..1) at world (x, z), matching OCEAN_VERT and hullHeights. */
  dampAt(x: number, z: number): number;
  /** S-2: bind the live High-only dynamic night light pool RT and its target-centered bounds (null restores the 1×1 black fallback with intensity 0). */
  bindDynPool?(tex: THREE.Texture | null, intensity: number, bounds?: Bounds4): void;
  /** Bind up to 16 hero nocturnal waterfront/pierhead/brazier/riding glint lights (pos+reach, rgb+prominence). */
  bindNightGlints?(posArr: readonly THREE.Vector4[], colArr: readonly THREE.Vector4[], count: number): void;
  readonly shared: { uTime: THREE.IUniform<number>; uSea: THREE.IUniform<THREE.Vector4>; uSdf: THREE.IUniform<THREE.Texture>; uSdfBounds: THREE.IUniform<THREE.Vector4> };
}

export { MAX_NIGHT_GLINTS };

const GRID_N = 256;
const FAR_EXTENT = 7000;

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

async function loadSdf(ctx: EngineContext, url: string): Promise<{ tex: THREE.Texture; data: Uint8Array; coast: Uint8Array; size: number } | null> {
  const img = await loadSdfImage(ctx, url);
  if (!img) return null;
  // the channels are data (lossless WebP, alpha 1): no colour-space conversion, no premultiplication
  const tex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = false;
  return { tex, data: img.data, coast: img.coast, size: img.width };
}

export class OceanSystem implements WorldSystem {
  readonly name = "ocean";
  private mesh!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private wake!: WakeField;
  private unsubQuality: (() => void) | null = null;
  private lite = false;
  private tier: QualityTier = "medium";
  private featureKey = "";
  private sdfTex!: THREE.Texture;
  private sdfData!: Uint8Array;
  private coastR!: Uint8Array;
  private sdfSize = 1024;
  private bounds!: Bounds4;
  /** The SDF bounds as plain numbers (coastAt / dampAt run ~3k times a frame: no tuple unpacking there). */
  private bx0 = 0;
  private bz0 = 0;
  private bw = 1;
  private bh = 1;
  /** The layout-bounds centre (uSceneCenter): the SDF's mainland fade is about it (E02). */
  private scx = 0;
  private scz = 0;
  private fx: FxTextures | null = null;
  private state: SeaState = 1;
  private readonly seaU = { value: new THREE.Vector4(SEA_STATES[1].amp, SEA_STATES[1].chop, SEA_STATES[1].caps, SEA_STATES[1].bands) };
  private readonly seaGoal = new THREE.Vector4().copy(this.seaU.value);
  /** The sea's clock (swell, detail normals, foam): eases to a stop under reduced motion (MotionClock). */
  private time = 0;
  /** Bumped whenever the CPU coast (coastR) changes: a fixed point's kept coast damping (heightAt) is re-taken. */
  private sdfVersion = 0;
  private readonly seaTime = { value: 0 };
  private clock: MotionClock | null = null;
  private layout: HarbourLayout | null = null;
  private awaitGround = false;
  private seabedAwaitingGround = false;
  private zoneTex: THREE.DataTexture | null = null;
  private dynPoolFallback: THREE.DataTexture | null = null;
  private causticFallback: THREE.DataTexture | null = null;
  private debugMovers: Array<{ cx: number; cz: number; r: number; w: number; ph: number; hw: number }> = [];
  /** E11: a private time-of-day evaluation (keys + season only: no weather, no moon phase) at this hour and at noon. */
  private hourTod: TimeOfDay | null = null;
  private readonly hourU = createWorldUniforms();
  private readonly noonU = createWorldUniforms();
  /** E35 the harbour mirror (High only; on by the v1.8.0 art director, `&extras=-mirror` turns it off): the SSR pass at composer index 1. */
  private mirror: MirrorPass | null = null;
  /** §6.2.2 High-only 1-draw instanced hull waterline collars (`wakeCollars` service, D-7). */
  private collars!: WakeCollars;
  /** Phase 1: zero-lag WebGL2 opaque scene color+depth capture (`&extras=-refract` disables). */
  private refractEnabled = false;
  private captureHalfRes = true;
  private inPreparation = false;
  private sceneCapture: SceneCapture | null = null;
  private seabed: Seabed | null = null;
  private caustics: CausticsPass | null = null;
  private readonly unregCausticsPrep: Array<() => void> = [];

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout");
    if (!layout) throw new Error("[harbour/ocean] needs the 'layout' service");
    this.bounds = (layout.sea?.bounds as Bounds4 | undefined) ?? defaultSeaBounds(layout);
    this.bx0 = this.bounds[0]; this.bz0 = this.bounds[1];
    this.scx = (layout.bounds.min[0] + layout.bounds.max[0]) / 2; this.scz = (layout.bounds.min[2] + layout.bounds.max[2]) / 2;
    this.bw = this.bounds[2] - this.bounds[0]; this.bh = this.bounds[3] - this.bounds[1];
    this.refractEnabled = extraEnabled("refract");
    const { WakeCollars } = await abortable(import("./wake-collars"), ctx.signal);
    const [seabedMod, causticsMod] = this.refractEnabled
      ? await abortable(Promise.all([import("./seabed"), import("./caustics-pass")]), ctx.signal)
      : [null, null];
    ctx.signal?.throwIfAborted();
    const fx = await acquireFxTextures(ctx);
    if (ctx.signal?.aborted) { fx.release(); ctx.signal.throwIfAborted(); }
    this.fx = fx;

    // sea SDF: the baked PNG when it exists, else generated now from the layout (same encoding)
    const loaded = await loadSdf(ctx, layout.sea?.sdf ?? "/harbour/sea-sdf.webp");
    if (ctx.signal?.aborted) { this.fx.release(); this.fx = null; ctx.signal.throwIfAborted(); }
    if (loaded) {
      this.sdfTex = loaded.tex; this.sdfData = loaded.data; this.coastR = loaded.coast; this.sdfSize = loaded.size;
    } else {
      // fallback: layout polygons now; rebuilt from the island's rendered height field once 'ground' exists
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
    this.sdfTex.generateMipmaps = true;
    this.sdfTex.wrapS = this.sdfTex.wrapT = THREE.ClampToEdgeWrapping;
    this.sdfTex.flipY = false;
    this.sdfTex.needsUpdate = true;

    const wakeRes = Math.min(2048, THREE.MathUtils.ceilPowerOfTwo(Math.ceil(Math.max(this.bounds[2] - this.bounds[0], this.bounds[3] - this.bounds[1]) / 0.55)));
    const initialWakeRes = ctx.services.get("quality")?.tier === "low" ? Math.min(1024, wakeRes) : wakeRes;
    this.wake = new WakeField(this.bounds, initialWakeRes, initialWakeRes);

    const sky = ctx.services.get("sky");
    const skyShared: SkyShared | Record<string, THREE.IUniform> = sky?.shared ?? {
      uSkyBand: { value: null }, uSkyBandRange: { value: new THREE.Vector4(-48, 48, -1.5, 14) }, uFwdAz: { value: 0 },
      uHorizonDist: { value: 2500 }, uHorizonDepr: { value: 0.4 }, uGlintDir: { value: new THREE.Vector3(0, 0.6, -0.8) },
      uGlintCol: { value: new THREE.Color(0, 0, 0) }, uWeatherSea: { value: new THREE.Vector4(0.4, 0.3, 0.8, -0.6) },
    };
    const W = ctx.uniforms;
    const col = (h: string) => ({ value: new THREE.Color(h) });
    // before the first render (a depth pass added to a running composer re-creates its buffers), right after the
    // RenderPass and ahead of the stale fog (PostChain.seal keeps it there)
    if (extraEnabled("mirror")) { this.mirror = new MirrorPass(ctx.camera); ctx.composer.addPass(this.mirror, 1); }

    const uSdf = { value: this.sdfTex };
    const uSdfBounds = { value: new THREE.Vector4(...this.bounds) };
    const uZones = { value: (this.zoneTex = buildZoneMask((layout as { seaZones?: SeaZoneLike[] }).seaZones, this.bounds)) };
    const uNoise = { value: fx.noise };
    const uSceneCenter = { value: new THREE.Vector2(this.scx, this.scz) };

    this.sceneCapture = new SceneCapture();
    if (this.refractEnabled && causticsMod && seabedMod) {
      this.caustics = new causticsMod.CausticsPass({
        uTime: this.seaTime,
        uSea: this.seaU,
        uSdf,
        uSdfBounds,
        uSceneCenter,
        uSunDir: W.uSunDir,
      });
      const prep = ctx.services.get("preparation");
      if (prep) {
        for (const entry of this.caustics.preparationEntries()) {
          this.unregCausticsPrep.push(prep.register(entry));
        }
      }
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

    this.material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      uniforms: {
        uTime: this.seaTime, uNight: W.uNight, uCameraPos: W.uCameraPos, uSunDir: W.uSunDir, uSunColor: W.uSunColor,
        uAmbient: W.uAmbient, uZenith: W.uZenith,
        uSea: this.seaU,
        uSdfBounds,
        uSdf,
        // P6 D18 sea-zone cues (identity agent): R shoals, G far ports, B harbour waters, A the roads
        uZones,
        uWake: { value: this.wake.texture }, uWakeLive: { value: this.wake.live },
        uWakeBounds: { value: new THREE.Vector4(...this.bounds) },
        uNoise, uRipple: { value: fx.ripple },
        uAbyss: col(SEA_PALETTE.abyss), uDeep: col(SEA_PALETTE.deep), uMid: col(SEA_PALETTE.mid), uShallow: col(SEA_PALETTE.shallow),
        uShoal: col(SEA_PALETTE.shoal), uSunlitShoal: col(SEA_PALETTE.sunlitShoal), uFoamCol: col(SEA_PALETTE.foam), uFoamNight: col(SEA_PALETTE.foamNight),
        ...skyShared,
        ...getBeamUniforms(ctx),
        ...cloudShadowUniforms,
        ...sunShadowUniforms,
        uFoliage: W.uFoliage,
        uDebug: { value: 0 },
        uGust: ensureGustService(ctx).uniform,
        // the lights system's top-down pool RT, read back along the view ray as the town's reflection
        uPoolTex: getHarbourMaterials(ctx).pool.uPoolTex, uPoolBounds: getHarbourMaterials(ctx).pool.uPoolBounds,
        // S-2 seam: dynamic boat/Titan night water pools (1x1 black fallback until LightsSystem binds the real RT)
        uDynPoolTex: { value: (this.dynPoolFallback = Object.assign(new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1), { needsUpdate: true })) },
        uDynPool: { value: new THREE.Vector4(0, 0, 0, 0) },
        uDynPoolBounds: { value: new THREE.Vector4(...this.bounds) },
        uNightGlintPos: { value: Array.from({ length: MAX_NIGHT_GLINTS }, () => new THREE.Vector4()) },
        uNightGlintCol: { value: Array.from({ length: MAX_NIGHT_GLINTS }, () => new THREE.Vector4()) },
        uNightGlintCount: { value: 0 },
        uWindowGlow: W.uWindowGlow,
        uLampArrive: lampWaveUniforms.uLampArrive,
        // the weather director: rain rings / melting snowflakes on the water
        uPrecip: W.uPrecip,
        uSceneCenter,
        uSceneRadius: { value: Math.hypot(layout.bounds.max[0] - layout.bounds.min[0], layout.bounds.max[2] - layout.bounds.min[2]) / 2 },
        // E11 the hour on the water / E13 the bloom ceiling for glints (sea-tone.ts; set every frame below)
        uSeaHour: { value: new THREE.Vector4(1, 1, 1, 1) }, uSeaLow: { value: new THREE.Vector2(1, 0) }, uBloomT: { value: 1.5 },
        ...this.sceneCapture.uniforms,
        ...causticUniforms,
        ...this.mirror?.uniforms,
      },
      transparent: true,
      depthWrite: true,
      depthTest: true,
      blending: THREE.NoBlending,
      fog: false,
      // the calendar is set before anything compiles (season system first): summer nights' glow only when it can show
      defines: W.uFoliage.value.y > 0.001 ? { HB_BIOLUM: "" } : {},
    });
    // the mirror's ocean (mirror-pass.ts) is one program for Medium and High (a uniform turns it on): no compile on a switch
    const features = () => Object.freeze({ biolum: W.uFoliage.value.y > 0.001, lite: this.lite, mirror: this.mirror !== null && !this.lite });
    this.material.customProgramCacheKey = () => { const f = features(); return `hb_ocean_${Number(f.biolum)}_${Number(f.lite)}${f.mirror ? "_m" : ""}`; };
    this.material.onBeforeCompile = (shader) => {
      const f = features();
      if (f.mirror) shader.fragmentShader = OCEAN_FRAG_MIRROR;
      shader.defines = { ...shader.defines };
      delete shader.defines.HB_BIOLUM; delete shader.defines.HB_LITE;
      if (f.biolum) shader.defines.HB_BIOLUM = "";
      if (f.lite) shader.defines.HB_LITE = "";
    };
    // PERF: the Low tier's lighter sea (sea-tone.ts HB_LITE); High-only WakeCollars, CausticsPass & MirrorPass (D-7)
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
    });
    const quality = ctx.services.get("quality");
    if (quality) {
      const applyQuality = (
        tier: QualityTier,
        settings?: { captureHalfRes?: boolean; oceanCaustics?: "lightspace" | "hessian" | "voronoi" },
        dpr = quality.dpr ?? 1,
      ) => {
        const high = tier === "high";
        this.tier = tier;
        this.lite = tier === "low";
        this.captureHalfRes = settings?.captureHalfRes ?? !high;
        const causticMode: 0 | 1 | 2 = settings?.oceanCaustics
          ? (settings.oceanCaustics === "lightspace" ? 2 : settings.oceanCaustics === "hessian" ? 1 : 0)
          : (high ? 2 : tier === "medium" ? 1 : 0);
        this.mirror?.setActive(high, tier === "low");
        this.collars.setActive(high);
        this.caustics?.setActive(causticMode === 2);
        this.caustics?.setMode(causticMode);
        const refractActive = this.refractEnabled && dpr >= 0.8;
        this.seabed?.setVisible(refractActive);
        if (!refractActive) this.sceneCapture?.release();
        this.syncFeatures();
      };
      applyQuality(quality.tier, quality.settings, quality.dpr);
      this.unsubQuality = quality.onChange((q) => {
        applyQuality(q.tier, q, quality.dpr);
        this.wake.resize(ctx.renderer, q.tier === "low" ? Math.min(1024, wakeRes) : wakeRes, () => {
          this.material.uniforms.uWake.value = this.wake.texture;
          this.material.uniforms.uWakeLive.value = this.wake.live;
        });
      });
    } else {
      this.tier = "medium";
      this.captureHalfRes = true;
      this.caustics?.setActive(false);
      this.caustics?.setMode(1);
      this.seabed?.setVisible(this.refractEnabled);
    }
    this.mesh = new THREE.Mesh(oceanGeometry(this.bounds), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10;              // first transparent draw: strictly after all opaques and before overlays (-1..90)
    this.mesh.name = "ocean";
    this.mesh.onBeforeRender = (renderer, _scene, camera) => {
      const capture = this.sceneCapture;
      if (!capture) return;
      const source = ctx.composer?.inputBuffer;
      const dpr = ctx.services.get("quality")?.dpr ?? 1;
      if (
        this.refractEnabled &&
        source &&
        camera === ctx.camera &&
        renderer.getRenderTarget() === source &&
        !this.inPreparation &&
        dpr >= 0.8
      ) {
        capture.capture(renderer, source, ctx.camera, this.captureHalfRes, !this.lite);
      } else {
        if (dpr < 0.8) capture.release();
        else capture.uniforms.uCapReady.value = 0;
      }
    };
    ctx.scene.add(this.mesh, this.collars.mesh);
    if (this.seabed) ctx.scene.add(this.seabed.mesh);

    const q = new URLSearchParams(location.search);
    const dbg = q.get("debugWake");
    if (dbg) {
      this.material.uniforms.uDebug.value = dbg === "2" ? 2 : dbg === "view" ? 1 : 0;
      this.seedDebugMovers(layout);
    }
    if (q.has("debugSea")) this.material.uniforms.uDebug.value = Number(q.get("debugSea"));
    if (q.has("sea")) this.setSeaState(Number(q.get("sea")) as SeaState);
    // the V14 strength A/B (25–35 %)
    if (this.mirror && q.has("mirrorK")) this.mirror.strength = THREE.MathUtils.clamp(Number(q.get("mirrorK")) || 0, 0, 1);
    // V15 A/B: 0 keeps the quay-side lift at the quays (the default moves it while the mirror runs)
    if (this.mirror && q.has("v15")) this.mirror.setQuayLift(q.get("v15") === "0" ? 0 : 1);
    this.seaU.value.copy(this.seaGoal);

    const getState = () => this.state;
    const svc: OceanService = {
      preparationScope: (lite) => {
        const previous = this.lite;
        const prevPrep = this.inPreparation;
        this.lite = lite;
        this.inPreparation = true;
        return () => { this.lite = previous; this.inPreparation = prevPrep; };
      },
      setSeaState: (s) => this.setSeaState(s),
      get seaState() { return getState(); },
      heightAt: (x, z, point) => {
        if (!point) return waveHeight(x, z, this.time, this.seaU.value.x) * this.dampAt(x, z);
        const D = POINT_DAMP_AT; // checked before pointSwell re-keys the point
        if (!(point[0] === x && point[1] === z && point[D] === this.sdfVersion)) { point[D] = this.sdfVersion; point[D + 1] = this.dampAt(x, z); }
        return pointSwell(x, z, this.time, this.seaU.value.x, point) * point[D + 1];
      },
      hullHeights: (x, z, bx, bz, px, pz, out, cache) => {
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
      shared: { uTime: this.seaTime, uSea: this.seaU, uSdf: this.material.uniforms.uSdf, uSdfBounds: this.material.uniforms.uSdfBounds },
    };
    ctx.services.set("ocean", svc);
    ctx.services.set("wake", this.wake satisfies WakeService);
    ctx.services.set("wakeCollars", this.collars satisfies WakeCollarService);
  }

  setSeaState(s: SeaState): void {
    const st = Math.max(0, Math.min(3, Math.round(s))) as SeaState;
    this.state = st;
    const p = SEA_STATES[st];
    this.seaGoal.set(p.amp, p.chop, p.caps, p.bands);
  }

  private syncFeatures(): void {
    const key = this.material.customProgramCacheKey();
    if (key !== this.featureKey) { this.featureKey = key; this.material.needsUpdate = true; }
  }

  /** Texel of the coast SDF under (x, z), or -1 off the SDF. */
  private texel(x: number, z: number): number {
    const u = (x - this.bx0) / this.bw, v = (z - this.bz0) / this.bh;
    if (u < 0 || u > 1 || v < 0 || v > 1) return -1;
    const n = this.sdfSize;
    return Math.min(n - 1, Math.floor(v * n)) * n + Math.min(n - 1, Math.floor(u * n));
  }

  /** The SDF coast at (x, z), the retired mainland faded to open water like the shaders (E02, sea-sdf.ts). */
  private coastAt(x: number, z: number): number {
    const i = this.texel(x, z);
    if (i < 0) return 200;
    const c = coastOf(this.coastR[i]), k = sdfMainlandFade(x, z, this.scx, this.scz);
    return k > 0 ? c + (SDF_COAST_RANGE / 2 - c) * k : c;
  }

  /** Swell damping toward the coast: a function of the SDF byte alone (a 256-entry table) within the island's coasts. */
  private dampAt(x: number, z: number): number {
    const i = this.texel(x, z);
    if (i < 0) return 1;
    const k = sdfMainlandFade(x, z, this.scx, this.scz);
    if (!(k > 0)) return DAMP_BY_BYTE[this.coastR[i]];
    const c = coastOf(this.coastR[i]); // coastAt(x, z), from the texel and fade already taken
    return dampOf(c + (SDF_COAST_RANGE / 2 - c) * k);
  }

  private seedDebugMovers(layout: HarbourLayout): void {
    // ?debugWake=1: a few dummy hulls circling in open water of the bay to exercise the wake service
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

  /** Fallback SDF from the real meshes (island 'ground' height field), so foam hugs what is drawn. */
  private rebuildFromGround(ground: HeightField): void {
    if (!this.layout) return;
    const n = this.sdfSize;
    const input = seaSdfInputFromLayout(this.layout, this.bounds, n);
    const data = buildSeaSdf(input, landMaskFromHeights(input, ground, this.layout.deckY ?? 1.2));
    const tex = this.sdfTex as THREE.DataTexture;
    (tex.image.data as Uint8Array).set(data);
    tex.needsUpdate = true;
    this.sdfData = data;
    for (let i = 0; i < n * n; i++) this.coastR[i] = data[i * 4];
    this.sdfVersion++;
  }

  update(frame: FrameState, ctx: EngineContext): void {
    this.collars.beginFrame();
    this.syncFeatures();
    this.mirror?.setConditions(
      THREE.MathUtils.smoothstep(ctx.services.get("readings")?.fog ?? 0, 0, 1),
      Math.max(ctx.uniforms.uPrecip.value.x, ctx.uniforms.uPrecip.value.y),
    );
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
    for (const m of this.debugMovers) {
      const a = m.ph + this.time * m.w;
      const x = m.cx + Math.cos(a) * m.r, z = m.cz + Math.sin(a) * m.r;
      const vx = -Math.sin(a) * m.r * m.w, vz = Math.cos(a) * m.r * m.w;
      this.wake.stamp(x, z, vx, vz, m.hw, 1, undefined, m.ph);
      const spd = Math.hypot(vx, vz);
      const fx = spd > 1e-3 ? vx / spd : 0, fz = spd > 1e-3 ? vz / spd : 1;
      this.collars.push(x, z, fx, fz, m.hw * 6.2, m.hw * 2, spd, m.r > 50 ? 1 : 0, this.time * 3.1416 + m.ph * 2.1);
    }
    // aerial distance tint (decorative): zero inside the harbour radius, full ramp a little past the scene's edge
    const sc = this.material.uniforms.uSceneCenter.value as THREE.Vector2, sr = this.material.uniforms.uSceneRadius.value as number;
    updateAerial(sc.x, sc.y, sr * 0.62, sr * 1.2, ctx.uniforms.uNight.value);
    const ws = this.material.uniforms.uWeatherSea.value as THREE.Vector4;
    if (ws.z * ws.z + ws.w * ws.w > 1e-6) this.wake.lee.set(ws.z, ws.w).normalize();
    this.wake.update(ctx.renderer, frame.delta);
    const u = this.material.uniforms;
    u.uWake.value = this.wake.texture;
    u.uWakeLive.value = this.wake.live;
    if (this.caustics && this.tier === "high" && ctx.rig?.target) {
      const sunUp = THREE.MathUtils.clamp(ctx.uniforms.uSunDir.value.y * 3, 0, 1) * (1 - ctx.uniforms.uNight.value);
      this.caustics.render(ctx.renderer, ctx.rig.target.x, ctx.rig.target.z, sunUp);
    }
    this.hourLight(ctx);
  }

  /**
   * E11: the hour's light on the sea body relative to this day's noon, from the time-of-day keys and the season alone
   * (a private evaluation: the sky's storm gloom and the moon's phase stay out, so storms keep their own grading).
   * E13: the bloom threshold the glints stay under.
   */
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
    this.unsubQuality?.();
    this.unsubQuality = null;
    for (const unreg of this.unregCausticsPrep) unreg();
    this.unregCausticsPrep.length = 0;
    if (this.mirror) { ctx.composer?.removePass(this.mirror); this.mirror.dispose(); this.mirror = null; }
    this.sceneCapture?.dispose();
    this.sceneCapture = null;
    if (this.seabed) {
      ctx.scene.remove(this.seabed.mesh);
      this.seabed.dispose();
      this.seabed = null;
    }
    this.caustics?.dispose();
    this.caustics = null;
    this.causticFallback?.dispose();
    this.causticFallback = null;
    if (this.collars) {
      ctx.scene.remove(this.collars.mesh);
      this.collars.dispose();
    }
    if (this.mesh) {
      this.mesh.onBeforeRender = () => {};
      ctx.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
    }
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
  }
}
