import * as THREE from "three";
import type { EngineContext, PreparationEntry } from "../engine/types";
import type { QualitySettings } from "../engine/quality";
import type { WorldUniforms } from "../engine/uniforms";
import { SeaShadowMask, sunShadowUniforms } from "./sun-shadow";
import { castFadeUniforms, contactShare, FIGURE_SHADOW_DIST, ShadowCasters, type CasterState, type CasterView } from "./shadow-casters";
import { ContactShadows } from "./contact-shadows";

const UP_Y = new THREE.Vector3(0, 1, 0);
const UP_Z = new THREE.Vector3(0, 0, 1);

/**
 * Key light (sun by day, moon by night) with ONE shadow map fitted to what the camera sees, a shadowless
 * fill sun and the world (hemisphere) light — all driven by the shared uniforms (TimeOfDay).
 *
 * Shadow fit: the view frustum's ground footprint (y = 0 and y = top) is clipped to the island bounds,
 * projected into light space, and the ortho box is quantised (extent steps + texel-snapped centre) so
 * panning/zooming never swims the shadow edges.
 *
 * E05 still shadows: the map is a cache. update() (before the casters) fits it and resolves the sea mask of the last
 * map; finalize() (scene.onBeforeRender: after every caster updated, before three renders the map) asks the caster
 * registry (world/shadow-casters.ts) what changed and re-renders only on a fit / sun-drift / tier change, a change of
 * what the map holds, or at the tier cadence while a dynamic caster is in it. A held frame does no shadow or mask work.
 */
export class SunRig {
  readonly key = new THREE.DirectionalLight(0xffffff, 1);
  readonly fill = new THREE.DirectionalLight(0xffffff, 1);
  /** World light at 0.85 × the Blender-equivalent π: the height-field AO only darkens, never adds back the EEVEE bounce. */
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, Math.PI * 0.85);
  readonly group = new THREE.Group();
  /** World-space region the shadow may cover: (minX, minZ, maxX, maxZ) and max structure height. */
  bounds = new THREE.Vector4(-400, -400, 400, 400);
  topY = 36;
  private mapSize: number;
  private quality: QualitySettings | null = null;
  private sinceShadow = 1e9;
  private framesSinceShadow = 1e9;
  private readonly heldSun = new THREE.Vector3(0, 1, 0);
  /** half extent, centre x/y, depth range, sun direction of the last fit */
  private readonly lastFit = new Float64Array(8);
  private readonly lightView = new THREE.Matrix4();
  private readonly lightViewInv = new THREE.Matrix4();
  private readonly ray = new THREE.Ray();
  private readonly pts: THREE.Vector3[] = Array.from({ length: 32 }, () => new THREE.Vector3());
  private readonly tmp = new THREE.Vector3();
  private readonly ndc = new THREE.Vector3();
  /** the sea's resolved shadow (world/sun-shadow.ts); dirty while a requested map render has not been resolved */
  private readonly seaMask = new SeaShadowMask();
  private seaMaskDirty = false;
  private seaMaskValid = false;
  /** E05: what the map holds, and the contact quads far casters hand their shadow over to */
  readonly casters = new ShadowCasters();
  readonly contacts = new ContactShadows();
  /** E05 diagnostics (dev captures): map renders asked vs frames held, and why the last render was asked */
  readonly stats = { renders: 0, holds: 0, live: false, reason: "" };
  private ctx: EngineContext | null = null;
  private scene: THREE.Scene | null = null;
  private sceneBeforeRender: THREE.Object3D["onBeforeRender"] | null = null;
  /** update() → finalize(): a forced (tier) or moved (fit / sun) map, and the tier cadence having elapsed */
  private readonly pending = { force: false, moved: false, cadence: false };
  private finalized = true;
  private wasLive = false;
  private readonly casterState: CasterState = { live: false, changed: false };
  private readonly casterView: { camera: THREE.PerspectiveCamera; viewHeight: number; sun: THREE.Vector3; frustum: THREE.Frustum | null } =
    { camera: new THREE.PerspectiveCamera(), viewHeight: 1, sun: this.heldSun, frustum: null };
  /** The canvas CSS height, read once per resize (P-PERF: read each frame, it forced a style and layout pass mid-frame). */
  private viewH = 0;

  constructor(mapSize = 4096) {
    this.mapSize = mapSize;
    const k = this.key;
    k.castShadow = true;
    k.shadow.mapSize.set(mapSize, mapSize);
    k.shadow.radius = 2.2;
    k.shadow.bias = -0.0004;
    k.shadow.camera.near = 1;
    k.shadow.camera.far = 2000;
    this.fill.castShadow = false;
    this.group.add(k, k.target, this.fill, this.fill.target, this.hemi, this.contacts.mesh);
    this.group.name = "harbour-sun-rig";
  }

  preparationEntry(): PreparationEntry { return this.seaMask.preparationEntry(); }

  /** Follow this scene: census its casters, watch the depth twin's uniforms, and finalize each frame before its render. */
  private attach(scene: THREE.Scene, u: WorldUniforms): void {
    this.detach();
    this.scene = scene;
    this.casters.attach(scene);
    // the kit's shadow twin drops bare crowns by these (world/materials.ts kitDepth): a season step re-renders the map
    this.casters.watch(u.uFoliage); this.casters.watch(u.uSeasonPhase);
    const before = this.sceneBeforeRender = scene.onBeforeRender;
    scene.onBeforeRender = (...args: Parameters<THREE.Object3D["onBeforeRender"]>) => { before.apply(scene, args); this.finalize(); };
  }

  private detach(): void {
    if (this.scene && this.sceneBeforeRender) this.scene.onBeforeRender = this.sceneBeforeRender;
    this.scene = null; this.sceneBeforeRender = null;
    this.casters.detach();
  }

  /**
   * Shadow-map caching: the map is re-rendered only when the fitted light frustum moved (pan/zoom, sun
   * drift beyond ~0.1°), when the quality tier changed, when what it holds changed (finalize), or on the
   * tier's refresh interval while a dynamic caster is in it (boats, figures near the camera). High
   * refreshes every frame then; Medium/Low at 30/15 Hz while the camera is still, and never two frames
   * running on the interval alone (at 15-30 fps the interval would otherwise elapse every frame).
   */
  update(ctx: EngineContext, delta = 0): void {
    const u = ctx.uniforms;
    this.ctx = ctx;
    if (this.scene !== ctx.scene && ctx.scene) this.attach(ctx.scene, u);
    const q = ctx.services.get("quality")?.settings;
    let force = false;
    if (q && q !== this.quality) {
      this.quality = q;
      if (this.key.shadow.mapSize.x !== q.shadowMapSize) {
        this.key.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
        this.key.shadow.map?.dispose();
        (this.key.shadow as { map: THREE.WebGLRenderTarget | null }).map = null;
        this.mapSize = q.shadowMapSize;
        this.seaMaskValid = false;
      }
      force = true;
    }
    this.key.color.copy(u.uSunColor.value);
    this.fill.color.copy(u.uFillColor.value);
    this.hemi.color.copy(u.uHemiSky.value);
    this.hemi.groundColor.copy(u.uHemiGround.value);
    this.fill.position.copy(u.uFillDir.value).multiplyScalar(100);
    this.fill.target.position.set(0, 0, 0);
    // moonlight: softer, lighter shadows
    this.key.shadow.intensity = 1 - 0.3 * u.uNight.value;
    // 02-L6: a low sun's long shadows soften with distance (penumbra by elevation; the tap count is unchanged)
    const elDeg = Math.asin(THREE.MathUtils.clamp(u.uSunDir.value.y, -1, 1)) * THREE.MathUtils.RAD2DEG;
    this.key.shadow.radius = 2.2 + 2.5 * u.uNight.value + 3.0 * (1 - THREE.MathUtils.smoothstep(elDeg, 6, 30)) * (1 - u.uNight.value);
    // hold the shadow sun until it drifted ~0.1° (or a live refresh is due): a running clock must not force a re-render
    const interval = q?.shadowInterval ?? 0;
    this.sinceShadow += delta;
    this.framesSinceShadow++;
    const cadence = this.sinceShadow >= interval && (interval <= 0 || this.framesSinceShadow >= (q?.shadowMinFrames ?? 1));
    if (force || (cadence && this.wasLive) || this.heldSun.angleTo(u.uSunDir.value) > 0.002) this.heldSun.copy(u.uSunDir.value);
    const moved = this.fitShadow(ctx.camera, this.heldSun);
    const sm = ctx.renderer.shadowMap;
    sm.autoUpdate = false;
    // 02-L1: the sea reads the same map through a resolved mask (world/sun-shadow.ts); 4 taps on High, 1 on Medium/Low.
    // three clears needsUpdate once it rendered the map we asked for (last frame): resolve it before asking again
    const ss = sunShadowUniforms, map = this.key.shadow.map?.depthTexture ?? null;
    const consumer = ctx.services.has("ocean") && q?.tier !== "low";
    ss.uKeyShadowP.value.set(0, (this.key.shadow.radius * 0.8) / this.mapSize, q?.tier === "high" ? 4 : 1, this.key.shadow.intensity);
    if (!consumer) {
      this.seaMask.suspend(); this.seaMaskValid = false; this.seaMaskDirty = true;
    } else if (map && this.seaMaskDirty && !sm.needsUpdate) {
      this.seaMaskValid = this.seaMask.resolve(ctx.renderer, map, this.mapSize, this.key.shadow.matrix);
      this.seaMaskDirty = !this.seaMaskValid;
    }
    ss.uKeyShadowP.value.x = consumer && map && this.seaMaskValid ? 1 : 0;
    const p = this.pending;
    p.force ||= force; p.moved ||= moved; p.cadence = cadence;
    this.finalized = false;
    this.contacts.begin(q?.tier !== "low");
  }

  /**
   * E05: after every caster updated, before three renders the map (scene.onBeforeRender, once a frame): gate the
   * figure crowds for the zoom, ask the registry what the map holds, and request a render only when needed.
   */
  finalize(): void {
    const ctx = this.ctx;
    if (this.finalized || !ctx || !this.scene) return;
    this.finalized = true;
    const distance = ctx.rig.distance;
    this.casters.gateFigures(distance, this.scene);
    castFadeUniforms.uHbFigureFade.value = contactShare(distance, FIGURE_SHADOW_DIST);
    const view = this.view(ctx);
    const s = this.casters.check(this.scene, view, this.casterState), p = this.pending;
    const reason = p.force ? "tier" : p.moved ? "fit" : s.changed ? "casters" : s.live && p.cadence ? "live" : "";
    const sm = ctx.renderer.shadowMap;
    if (reason) {
      sm.needsUpdate = true; this.seaMaskDirty = true; this.sinceShadow = 0; this.framesSinceShadow = 0;
      this.casters.drawn(view);
      this.stats.renders++; this.stats.reason = reason;
    } else this.stats.holds++;
    this.stats.live = this.wasLive = s.live;
    p.force = p.moved = false;
    this.contacts.end(ctx.uniforms, this.key.shadow.intensity, this.casters.crowds, castFadeUniforms.uHbFigureFade.value, this.scene);
  }

  /** The canvas may have changed size: its height is read again on the next frame. */
  resize(): void { this.viewH = 0; }

  /** This frame's view of the casters: the camera, its CSS height, the map's sun and its light frustum (fitted). */
  private view(ctx: EngineContext): CasterView {
    const v = this.casterView, k = this.key;
    v.camera = ctx.camera;
    v.viewHeight = this.viewH ||= ctx.renderer.domElement.clientHeight || innerHeight;
    k.updateWorldMatrix(true, false);
    k.target.updateWorldMatrix(true, false);
    k.shadow.updateMatrices(k);
    v.frustum = k.shadow.getFrustum();
    return v;
  }

  /** Fits the shadow camera; returns true when the light frustum changed (the cached map is stale). */
  private fitShadow(camera: THREE.PerspectiveCamera, sunDir: THREE.Vector3): boolean {
    // light basis (looking along -sunDir)
    const up = Math.abs(sunDir.y) > 0.98 ? UP_Z : UP_Y;
    this.lightView.lookAt(this.tmp.set(0, 0, 0), this.ndc.copy(sunDir).negate(), up);
    this.lightViewInv.copy(this.lightView).invert();

    // ground footprint of the view frustum at y = 0 and y = topY
    const b = this.bounds;
    let n = 0;
    const maxDist = camera.far * 0.9;
    for (let sy = -1; sy <= 1; sy++) {
      for (let sx = -1; sx <= 1; sx++) {
        if (sx === 0 && sy === 0) continue;
        this.ndc.set(sx, sy, 0.5).unproject(camera);
        this.ray.origin.copy(camera.position);
        this.ray.direction.copy(this.ndc).sub(camera.position).normalize();
        for (let hi = 0; hi < 2; hi++) {
          const h = hi === 0 ? 0 : this.topY;
          const d = this.ray.direction.y < -1e-4 ? (h - this.ray.origin.y) / this.ray.direction.y : maxDist;
          const p = this.pts[n++].copy(this.ray.direction).multiplyScalar(Math.min(Math.max(d, 0), maxDist)).add(this.ray.origin);
          p.x = THREE.MathUtils.clamp(p.x, b.x, b.z);
          p.z = THREE.MathUtils.clamp(p.z, b.y, b.w);
          p.y = h;
        }
      }
    }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      const p = this.tmp.copy(this.pts[i]).applyMatrix4(this.lightViewInv);
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    // quantise the extent (16 m steps) and snap the centre to whole texels. 02-L6 long-shadow texel guard: each axis
    // keeps its own extent, so a low sun (whose ground footprint is foreshortened along light-space y) spends the
    // map's rows on that short axis instead of on empty square margin: long shadows keep their edge, not stair-steps
    const step = 16;
    const half = Math.ceil(((maxX - minX) * 0.5 + 6) / step) * step;
    const halfY = Math.ceil(((maxY - minY) * 0.5 + 6) / step) * step;
    const texel = (2 * half) / this.mapSize, texelY = (2 * halfY) / this.mapSize;
    const ix = Math.round((minX + maxX) * 0.5 / texel), iy = Math.round((minY + maxY) * 0.5 / texelY);
    const cx = ix * texel, cy = iy * texelY;
    // E05: the map's first column / row as a global texel index, mod 4 (the handover dither's world anchor;
    // mapSize / 2 is a multiple of 4)
    castFadeUniforms.uHbCastPhase.value.set(((ix % 4) + 4) % 4, ((iy % 4) + 4) % 4);

    // depth range: the island box in light space
    let minZ = Infinity, maxZ = -Infinity;
    for (let c = 0; c < 8; c++) {
      const p = this.tmp.set(c & 1 ? b.z : b.x, c & 4 ? this.topY + 6 : -6, c & 2 ? b.w : b.y).applyMatrix4(this.lightViewInv);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const centre = this.tmp.set(cx, cy, maxZ + 20).applyMatrix4(this.lightView);
    const k = this.key;
    k.position.copy(centre);
    k.target.position.copy(centre).sub(sunDir);
    const cam = k.shadow.camera;
    cam.left = -half; cam.right = half; cam.top = halfY; cam.bottom = -halfY;
    cam.near = 1; cam.far = maxZ - minZ + 40;
    cam.updateProjectionMatrix();
    k.shadow.normalBias = Math.max(texel, texelY) * 1.6;
    k.target.updateMatrixWorld();
    const f = this.lastFit;
    const moved = f[0] !== half || f[1] !== cx || f[2] !== cy || Math.abs(f[3] - (maxZ - minZ)) > 1e-3 ||
      f[4] !== sunDir.x || f[5] !== sunDir.y || f[6] !== sunDir.z || f[7] !== halfY;
    f[0] = half; f[1] = cx; f[2] = cy; f[3] = maxZ - minZ; f[4] = sunDir.x; f[5] = sunDir.y; f[6] = sunDir.z; f[7] = halfY;
    return moved;
  }

  dispose(): void {
    this.detach();
    this.casters.dispose();
    this.contacts.dispose();
    this.key.shadow.dispose();
    this.seaMask.dispose();
    this.group.removeFromParent();
  }
}
