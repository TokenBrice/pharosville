import * as THREE from "three";
import { getBeamUniforms } from "../beam/uniforms";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { SkyService, SkyShared } from "../sky/sky-system";
import { cloudShadowUniforms } from "../sky/cloud-shadow";
import { OCEAN_FRAG, OCEAN_VERT, SEA_PALETTE } from "./ocean-material";
import { buildSeaSdf, defaultSeaBounds, landMaskFromHeights, SDF_COAST_RANGE, seaSdfInputFromLayout, type Bounds4, type HeightField } from "./sea-sdf";
import { acquireFxTextures, type FxTextures } from "./textures";
import { WakeField, type WakeService } from "./wake";
import { hullSwell, SEA_STATES, waveHeight } from "./waves";
import { ensureMotionService, MotionClock } from "../ui/services";
import { buildZoneMask, type SeaZoneLike } from "./zone-mask";
import { loadSdfImage } from "./sdf-image";
import { getHarbourMaterials } from "../world/materials";

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
  setSeaState(state: SeaState): void;
  readonly seaState: SeaState;
  /** Sea surface height (m) at world (x, z) now, for bobbing hulls. */
  heightAt(x: number, z: number): number;
  /**
   * heightAt at a hull's centre (x, z), bow / stern ± (bx, bz) and port / starboard ± (px, pz) into out[0..4],
   * in one call. `cache` (waves.ts hullSwellCache, one per hull): for a hull at rest, 10 trig instead of 25.
   */
  hullHeights(x: number, z: number, bx: number, bz: number, px: number, pz: number, out: Float64Array, cache: Float64Array | null): void;
  /** P6 (identity): the sea's own clock, swell scale and SDF, so overlays on the water (chart lettering) ride the same swell. */
  /** P6 (identity): signed coast distance (m) at world (x, z) from the sea SDF; > 0 is open water. */
  coastAt(x: number, z: number): number;
  readonly shared: { uTime: THREE.IUniform<number>; uSea: THREE.IUniform<THREE.Vector4>; uSdf: THREE.IUniform<THREE.Texture>; uSdfBounds: THREE.IUniform<THREE.Vector4> };
}

const GRID_N = 256;
const FAR_EXTENT = 7000;

const coastOf = (r: number) => (r / 255 - 0.5) * SDF_COAST_RANGE;
const DAMP_BY_BYTE = Float64Array.from({ length: 256 }, (_, r) => {
  const coast = coastOf(r);
  return THREE.MathUtils.smoothstep(coast, 0, 34) * 0.9 + 0.1 * THREE.MathUtils.smoothstep(coast, -2, 2);
});

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

async function loadSdf(ctx: EngineContext, url: string): Promise<{ tex: THREE.Texture; coast: Uint8Array; size: number } | null> {
  const img = await loadSdfImage(ctx, url);
  if (!img) return null;
  // the channels are data (lossless WebP, alpha 1): no colour-space conversion, no premultiplication
  const tex = new THREE.DataTexture(img.data, img.width, img.height, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.premultiplyAlpha = false;
  return { tex, coast: img.coast, size: img.width };
}

export class OceanSystem implements WorldSystem {
  readonly name = "ocean";
  private mesh!: THREE.Mesh;
  private material!: THREE.ShaderMaterial;
  private wake!: WakeField;
  private sdfTex!: THREE.Texture;
  private coastR!: Uint8Array;
  private sdfSize = 1024;
  private bounds!: Bounds4;
  /** The SDF bounds as plain numbers (coastAt / dampAt run ~3k times a frame: no tuple unpacking there). */
  private bx0 = 0;
  private bz0 = 0;
  private bw = 1;
  private bh = 1;
  private fx!: FxTextures;
  private state: SeaState = 1;
  private readonly seaU = { value: new THREE.Vector4(SEA_STATES[1].amp, SEA_STATES[1].chop, SEA_STATES[1].caps, SEA_STATES[1].bands) };
  private readonly seaGoal = new THREE.Vector4().copy(this.seaU.value);
  /** The sea's clock (swell, detail normals, foam): eases to a stop under reduced motion (MotionClock). */
  private time = 0;
  private readonly seaTime = { value: 0 };
  private clock: MotionClock | null = null;
  private layout: HarbourLayout | null = null;
  private awaitGround = false;
  private zoneTex: THREE.DataTexture | null = null;
  private debugMovers: Array<{ cx: number; cz: number; r: number; w: number; ph: number; hw: number }> = [];

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    if (!layout) throw new Error("[harbour/ocean] needs the 'layout' service");
    this.bounds = (layout.sea?.bounds as Bounds4 | undefined) ?? defaultSeaBounds(layout);
    this.bx0 = this.bounds[0]; this.bz0 = this.bounds[1];
    this.bw = this.bounds[2] - this.bounds[0]; this.bh = this.bounds[3] - this.bounds[1];
    this.fx = acquireFxTextures(ctx);

    // sea SDF: the baked PNG when it exists, else generated now from the layout (same encoding)
    const loaded = await loadSdf(ctx, layout.sea?.sdf ?? "/harbour/sea-sdf.webp");
    if (loaded) {
      this.sdfTex = loaded.tex; this.coastR = loaded.coast; this.sdfSize = loaded.size;
    } else {
      // fallback: layout polygons now; rebuilt from the island's rendered height field once 'ground' exists
      this.layout = layout;
      this.awaitGround = true;
      const n = 1024;
      const data = buildSeaSdf(seaSdfInputFromLayout(layout, this.bounds, n));
      this.sdfTex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
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
    this.wake = new WakeField(this.bounds, wakeRes, wakeRes);

    const sky = ctx.services.get("sky") as SkyService | undefined;
    const skyShared: SkyShared | Record<string, THREE.IUniform> = sky?.shared ?? {
      uSkyBand: { value: null }, uSkyBandRange: { value: new THREE.Vector4(-48, 48, -1.5, 14) }, uFwdAz: { value: 0 },
      uHorizonDist: { value: 2500 }, uHorizonDepr: { value: 0.4 }, uGlintDir: { value: new THREE.Vector3(0, 0.6, -0.8) },
      uGlintCol: { value: new THREE.Color(0, 0, 0) }, uWeatherSea: { value: new THREE.Vector4(0.4, 0.3, 0.8, -0.6) },
    };
    const W = ctx.uniforms;
    const col = (h: string) => ({ value: new THREE.Color(h) });
    this.material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      uniforms: {
        uTime: this.seaTime, uNight: W.uNight, uCameraPos: W.uCameraPos, uSunDir: W.uSunDir, uSunColor: W.uSunColor,
        uAmbient: W.uAmbient, uZenith: W.uZenith,
        uSea: this.seaU,
        uSdfBounds: { value: new THREE.Vector4(...this.bounds) },
        uSdf: { value: this.sdfTex },
        // P6 D18 sea-zone cues (identity agent): R shoals, G far ports, B harbour waters, A the roads
        uZones: { value: (this.zoneTex = buildZoneMask((layout as { seaZones?: SeaZoneLike[] }).seaZones, this.bounds)) },
        uWake: { value: this.wake.texture }, uWakeLive: { value: this.wake.live },
        uWakeBounds: { value: new THREE.Vector4(...this.bounds) },
        uNoise: { value: this.fx.noise }, uRipple: { value: this.fx.ripple },
        uAbyss: col(SEA_PALETTE.abyss), uDeep: col(SEA_PALETTE.deep), uMid: col(SEA_PALETTE.mid), uShallow: col(SEA_PALETTE.shallow),
        uShoal: col(SEA_PALETTE.shoal), uSunlitShoal: col(SEA_PALETTE.sunlitShoal), uFoamCol: col(SEA_PALETTE.foam), uFoamNight: col(SEA_PALETTE.foamNight),
        ...skyShared,
        ...getBeamUniforms(ctx),
        ...cloudShadowUniforms,
        uDebug: { value: 0 },
        // the lights system's top-down pool RT, read back along the view ray as the town's reflection
        uPoolTex: getHarbourMaterials(ctx).pool.uPoolTex, uPoolBounds: getHarbourMaterials(ctx).pool.uPoolBounds,
        uWindowGlow: W.uWindowGlow,
        // the weather director: rain rings / melting snowflakes on the water
        uPrecip: W.uPrecip,
        uSceneCenter: { value: new THREE.Vector2((layout.bounds.min[0] + layout.bounds.max[0]) / 2, (layout.bounds.min[2] + layout.bounds.max[2]) / 2) },
        uSceneRadius: { value: Math.hypot(layout.bounds.max[0] - layout.bounds.min[0], layout.bounds.max[2] - layout.bounds.min[2]) / 2 },
      },
      fog: false,
    });
    this.mesh = new THREE.Mesh(oceanGeometry(this.bounds), this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 60;               // after land (0) and the sky card (50): hidden water is rejected early
    this.mesh.name = "ocean";
    ctx.scene.add(this.mesh);

    const q = new URLSearchParams(location.search);
    const dbg = q.get("debugWake");
    if (dbg) {
      this.material.uniforms.uDebug.value = dbg === "2" ? 2 : dbg === "view" ? 1 : 0;
      this.seedDebugMovers(layout);
    }
    if (q.has("debugSea")) this.material.uniforms.uDebug.value = Number(q.get("debugSea"));
    if (q.has("sea")) this.setSeaState(Number(q.get("sea")) as SeaState);
    this.seaU.value.copy(this.seaGoal);

    const getState = () => this.state;
    const svc: OceanService = {
      setSeaState: (s) => this.setSeaState(s),
      get seaState() { return getState(); },
      heightAt: (x, z) => waveHeight(x, z, this.time, this.seaU.value.x) * this.dampAt(x, z),
      hullHeights: (x, z, bx, bz, px, pz, out, cache) => {
        hullSwell(x, z, bx, bz, px, pz, this.time, this.seaU.value.x, out, cache);
        out[0] *= this.dampAt(x, z);
        out[1] *= this.dampAt(x + bx, z + bz); out[2] *= this.dampAt(x - bx, z - bz);
        out[3] *= this.dampAt(x + px, z + pz); out[4] *= this.dampAt(x - px, z - pz);
      },
      coastAt: (x, z) => this.coastAt(x, z),
      shared: { uTime: this.seaTime, uSea: this.seaU, uSdf: this.material.uniforms.uSdf, uSdfBounds: this.material.uniforms.uSdfBounds },
    };
    ctx.services.set("ocean", svc);
    ctx.services.set("wake", this.wake satisfies WakeService);
  }

  setSeaState(s: SeaState): void {
    const st = Math.max(0, Math.min(3, Math.round(s))) as SeaState;
    this.state = st;
    const p = SEA_STATES[st];
    this.seaGoal.set(p.amp, p.chop, p.caps, p.bands);
  }

  /** Texel of the coast SDF under (x, z), or -1 off the SDF. */
  private texel(x: number, z: number): number {
    const u = (x - this.bx0) / this.bw, v = (z - this.bz0) / this.bh;
    if (u < 0 || u > 1 || v < 0 || v > 1) return -1;
    const n = this.sdfSize;
    return Math.min(n - 1, Math.floor(v * n)) * n + Math.min(n - 1, Math.floor(u * n));
  }

  private coastAt(x: number, z: number): number {
    const i = this.texel(x, z);
    return i < 0 ? 200 : coastOf(this.coastR[i]);
  }

  /** Swell damping toward the coast: a function of the SDF byte alone, so a 256-entry table (same values). */
  private dampAt(x: number, z: number): number {
    const i = this.texel(x, z);
    return i < 0 ? 1 : DAMP_BY_BYTE[this.coastR[i]];
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
    for (let i = 0; i < n * n; i++) this.coastR[i] = data[i * 4];
  }

  update(frame: FrameState, ctx: EngineContext): void {
    if (this.awaitGround) {
      const ground = ctx.services.get("ground") as HeightField | undefined;
      if (ground?.heights) { this.awaitGround = false; this.rebuildFromGround(ground); }
    }
    this.clock ??= new MotionClock(ensureMotionService(ctx));
    this.time = this.seaTime.value = this.clock.step(frame.delta);
    this.seaU.value.lerp(this.seaGoal, 1 - Math.exp(-frame.delta * 0.4));
    for (const m of this.debugMovers) {
      const a = m.ph + this.time * m.w;
      const x = m.cx + Math.cos(a) * m.r, z = m.cz + Math.sin(a) * m.r;
      const vx = -Math.sin(a) * m.r * m.w, vz = Math.cos(a) * m.r * m.w;
      this.wake.stamp(x, z, vx, vz, m.hw, 1);
    }
    this.wake.update(ctx.renderer, frame.delta);
    const u = this.material.uniforms;
    u.uWake.value = this.wake.texture;
    u.uWakeLive.value = this.wake.live;
  }

  dispose(ctx: EngineContext): void {
    ctx.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.wake.dispose();
    this.sdfTex.dispose();
    this.zoneTex?.dispose();
    this.fx.release();
    ctx.services.delete("ocean");
    ctx.services.delete("wake");
  }
}
