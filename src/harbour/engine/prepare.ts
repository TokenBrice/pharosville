import * as THREE from "three";
import type { EngineContext, PreparationEntry, PreparationService } from "./types";
import { getHarbourMaterials } from "../world/materials";
import { deferred } from "./deferred";
import { graphicsValidity } from "./graphics";
import { PreparationQueue, type PreparationPriority, type SubmissionOptions } from "./preparation-queue";
import { assertShaderReady, installShaderFailureHook } from "./shader-failure";

const aborted = () => new DOMException("Preparation superseded", "AbortError");
export const isPreparationAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";
type Restore = () => void;
export interface PreparedPrograms { readonly sources: ReadonlySet<THREE.Material>; readonly status: "complete" | "timed-out"; dispose(): void }
interface PreparedProgram { isReady(): boolean; getUniforms(): unknown; getAttributes(): unknown }

/** A cancelled consumer stops waiting without cancelling a shared warm-up. */
export function preparationConsumer<T>(pending: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return pending;
  if (signal.aborted) return Promise.reject(aborted());
  return new Promise<T>((resolve, reject) => {
    const cancel = () => { signal.removeEventListener("abort", cancel); reject(aborted()); };
    signal.addEventListener("abort", cancel, { once: true });
    void pending.then(resolve, reject).finally(() => signal.removeEventListener("abort", cancel));
  });
}

/**
 * ShaderMaterial.copy deep-clones uniforms (and drops render-target textures). Clone its other state
 * through a read-only source view instead, then share uniforms: preparation never writes their values.
 * Keeping the real subclass preserves postprocessing's define setters without mutating the live source.
 */
export function preparationMaterial<T extends THREE.Material>(source: T): T {
  let material: T;
  if (source instanceof THREE.ShaderMaterial) {
    const copySource = Object.create(source) as T & THREE.ShaderMaterial;
    copySource.uniforms = {};
    copySource.uniformsGroups = [];
    const shader = copySource.clone() as T & THREE.ShaderMaterial;
    shader.uniforms = source.uniforms;
    shader.uniformsGroups = source.uniformsGroups;
    material = shader;
  } else material = source.clone();
  material.onBeforeCompile = source.onBeforeCompile;
  const key = source.customProgramCacheKey();
  material.customProgramCacheKey = () => key;
  return material;
}

/** Mirrors r186's PCF getDepthMaterial parameters, not its private material cache. */
export function preparationDepth(object: THREE.Mesh, source: THREE.Material): THREE.Material {
  const depth = object.customDepthMaterial ? preparationMaterial(object.customDepthMaterial) : new THREE.MeshDepthMaterial();
  const colour = source as THREE.MeshStandardMaterial;
  const material = depth as THREE.MeshDepthMaterial;
  material.visible = source.visible;
  material.side = source.shadowSide ?? (source.side === THREE.FrontSide ? THREE.BackSide : source.side === THREE.BackSide ? THREE.FrontSide : THREE.DoubleSide);
  material.wireframe = colour.wireframe;
  material.map = colour.map;
  material.alphaMap = colour.alphaMap;
  material.alphaTest = source.alphaToCoverage ? 0.5 : source.alphaTest;
  material.clipShadows = source.clipShadows;
  material.clippingPlanes = source.clippingPlanes;
  material.clipIntersection = source.clipIntersection;
  material.displacementMap = colour.displacementMap;
  material.displacementScale = colour.displacementScale;
  material.displacementBias = colour.displacementBias;
  return depth;
}

/** Shared bounded submissions and owned programs; compiler polling never sees live material state. */
export class ProgramPreparation implements PreparationService {
  private readonly entries = new Set<PreparationEntry>();
  private readonly held = new Map<THREE.Object3D, PreparedPrograms>();
  private readonly uploads = new WeakMap<THREE.Texture, number>();
  readonly queue = new PreparationQueue();
  private readonly pendingUploads = new WeakMap<THREE.Texture, Promise<void>>();
  private readonly uninstallShaderFailure: () => void;
  private readonly active = new Set<AbortController>();
  private epoch = 0;
  private seasonRequest = 0;
  private disposed = false;
  private timeoutWarned = false;
  private current: PreparedPrograms | undefined;
  constructor(private readonly ctx: EngineContext) { this.uninstallShaderFailure = installShaderFailureHook(ctx.renderer); }

  get generation(): number { return this.epoch; }
  get stats() { return this.queue.stats; }

  submit<T>(work: (deadline: number) => T, options: SubmissionOptions = {}): Promise<T> {
    return this.queue.submit(work, { signal: this.ctx.signal, ...options });
  }

  register(entry: PreparationEntry): () => void {
    this.entries.add(entry); this.invalidate();
    return () => { this.entries.delete(entry); this.held.get(entry.root)?.dispose(); this.held.delete(entry.root); this.invalidate(); };
  }

  /** Cancellation also covers queued submissions and compiler polling ownership. */
  invalidate(): void {
    this.epoch++;
    for (const controller of this.active) controller.abort();
  }

  async stageTexture(texture: THREE.Texture, options: SubmissionOptions = {}): Promise<void> {
    if (texture.isRenderTargetTexture || !texture.image || this.uploads.get(texture) === texture.version) return;
    const pending = this.pendingUploads.get(texture);
    if (pending) {
      try { await preparationConsumer(pending, options.signal); }
      catch (error) { if (!isPreparationAbort(error) || options.signal?.aborted || this.disposed) throw error; }
      return this.stageTexture(texture, options);
    }
    const upload = this.submit(() => {
      if (this.uploads.get(texture) === texture.version) return;
      this.ctx.renderer.initTexture(texture);
      this.uploads.set(texture, texture.version);
    }, options);
    this.pendingUploads.set(texture, upload);
    try { await upload; } finally { if (this.pendingUploads.get(texture) === upload) this.pendingUploads.delete(texture); }
  }

  /**
   * A canvas texture uploaded in bands of `rows` canvas rows, one band per submission: a whole large canvas is one
   * indivisible texSubImage2D (B17's 3072×2400 logo atlas: 54 ms at CPU ×4). The storage is allocated first with no
   * pixels (three's `dataReady`); each band is copied 1:1 onto a band-sized canvas and uploaded at its (flipped)
   * offset with the same unpack state, and the last band generates the mip chain. Same texels as stageTexture.
   */
  async stageTextureRows(texture: THREE.Texture, rows: number, options: SubmissionOptions = {}): Promise<void> {
    const image = texture.image as HTMLCanvasElement | undefined;
    if (texture.isRenderTargetTexture || !image || this.uploads.get(texture) === texture.version) return;
    if (this.pendingUploads.has(texture) || !(rows > 0 && rows < image.height)) return this.stageTexture(texture, options);
    const renderer = this.ctx.renderer, gl = renderer.getContext(), { width, height } = image;
    const canvas = document.createElement("canvas");
    canvas.width = width; canvas.height = rows;
    const g = canvas.getContext("2d")!, band = new THREE.CanvasTexture(canvas), at = new THREE.Vector2();
    const version = texture.version, mips = texture.generateMipmaps;
    // uploadTexture's colour-space unpack for this texture (copyTextureToTexture leaves it as last set)
    const working = THREE.ColorManagement.getPrimaries(THREE.ColorManagement.workingColorSpace);
    const conversion = texture.colorSpace === THREE.NoColorSpace || THREE.ColorManagement.getPrimaries(texture.colorSpace) === working ? gl.NONE : gl.BROWSER_DEFAULT_WEBGL;
    const upload = (async () => {
      await this.submit(() => {
        texture.source.dataReady = false;
        try { renderer.initTexture(texture); } finally { texture.source.dataReady = true; }
      }, options);
      for (let y = 0; y < height; y += rows) {
        await this.submit(() => {
          const h = Math.min(rows, height - y);
          if (canvas.height !== h) canvas.height = h;
          g.clearRect(0, 0, width, h);
          g.drawImage(image, 0, y, width, h, 0, 0, width, h);
          renderer.state.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, conversion);
          texture.generateMipmaps = mips && y + h >= height;
          try { renderer.copyTextureToTexture(band, texture, null, at.set(0, texture.flipY ? height - y - h : y)); }
          finally { texture.generateMipmaps = mips; }
        }, options);
      }
      this.uploads.set(texture, version);
    })();
    this.pendingUploads.set(texture, upload);
    try { await upload; } finally {
      if (this.pendingUploads.get(texture) === upload) this.pendingUploads.delete(texture);
      canvas.width = canvas.height = 0;
    }
  }

  stageTextures(root: THREE.Object3D): void {
    const textures = new Set<THREE.Texture>();
    root.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      for (const m of Array.isArray(material) ? material : material ? [material] : []) {
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
        if (m instanceof THREE.ShaderMaterial) for (const uniform of Object.values(m.uniforms)) {
          if (uniform.value instanceof THREE.Texture) textures.add(uniform.value);
        }
      }
    });
    void Promise.all([...textures].map((texture) => this.stageTexture(texture))).catch((error: unknown) => {
      if (!isPreparationAbort(error)) console.error("[harbour] texture preparation failed", error);
    });
  }

  async prepareGroup(root: THREE.Object3D): Promise<void> {
    this.invalidate();
    // Resize/season supersession retries detached additions against the new current state.
    while (!this.disposed) {
      const epoch = this.epoch;
      try {
        const batch = await this.prepare([{ root, camera: this.ctx.camera, target: () => this.ctx.composer.inputBuffer, scene: this.ctx.scene }]);
        if (epoch !== this.epoch) { batch.dispose(); continue; }
        this.held.get(root)?.dispose();
        const sources = new Set<THREE.Material>();
        root.traverse((object) => {
          const material = (object as THREE.Mesh).material;
          for (const source of Array.isArray(material) ? material : material ? [material] : []) sources.add(source);
        });
        const release = () => {
          batch.dispose();
          for (const source of sources) source.removeEventListener("dispose", release);
          this.held.delete(root);
        };
        for (const source of sources) source.addEventListener("dispose", release);
        this.held.set(root, { sources: batch.sources, status: batch.status, dispose: release });
        return;
      } catch (error) { if (!isPreparationAbort(error) || this.disposed || epoch === this.epoch) throw error; }
    }
    throw aborted();
  }

  async prepareSeason(scope: () => Restore, commit: () => void): Promise<void> {
    const request = ++this.seasonRequest;
    this.invalidate();
    while (!this.disposed && request === this.seasonRequest) {
      const epoch = this.epoch;
      try {
        const batch = await this.prepareWorld(scope);
        if (this.disposed || epoch !== this.epoch || request !== this.seasonRequest) { batch.dispose(); continue; }
        commit(); this.adopt(batch); this.invalidate();
        return;
      } catch (error) { if (!isPreparationAbort(error) || this.disposed || epoch === this.epoch) throw error; }
    }
    throw aborted();
  }

  async prepareWorld(scope?: () => Restore, extra: readonly PreparationEntry[] = [], signal?: AbortSignal, priority: PreparationPriority = "visible"): Promise<PreparedPrograms> {
    if (this.disposed) throw aborted();
    return this.prepare([
      { root: this.ctx.scene, camera: this.ctx.camera, target: () => this.ctx.composer.inputBuffer, scene: this.ctx.scene },
      ...this.entries, ...extra,
    ], scope, signal, priority);
  }

  adopt(batch: PreparedPrograms): void {
    this.current?.dispose(); this.current = batch;
    // A world preparation now owns all attached late material variants too.
    for (const old of this.held.values()) {
      let covered = true;
      for (const source of old.sources) if (!batch.sources.has(source)) { covered = false; break; }
      if (covered) old.dispose();
    }
  }

  async prepare(entries: readonly PreparationEntry[], scope?: () => Restore, signal?: AbortSignal, priority: PreparationPriority = "visible"): Promise<PreparedPrograms> {
    const controller = new AbortController();
    const epoch = this.epoch;
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted || this.disposed) controller.abort();
    this.active.add(controller);
    const materials: THREE.Material[] = [];
    // Matches the colour/depth format of r186's PCF map, including during boot before a live map exists.
    const shadowTarget = new THREE.WebGLRenderTarget(1, 1);
    shadowTarget.depthTexture = new THREE.DepthTexture(1, 1, THREE.UnsignedIntType);
    shadowTarget.depthTexture.compareFunction = THREE.LessEqualCompare;
    const pending: Promise<unknown>[] = [];
    const observedSources = new Set<THREE.Material>();
    const batch: PreparedPrograms & { status: PreparedPrograms["status"] } = { sources: observedSources, status: "complete", dispose: () => {
      for (const material of materials) material.dispose(); materials.length = 0; shadowTarget.dispose();
    } };
    let timedOut = false;
    const timeout = window.setTimeout(() => { timedOut = true; cancel(); }, 30000);
    const onAbort = () => { if (!timedOut) batch.dispose(); };
    controller.signal.addEventListener("abort", onAbort, { once: true });
    try {
      for (const entry of entries) {
        getHarbourMaterials(this.ctx).prepareSeasonDepth(entry.root);
        const objects: THREE.Mesh[] = [];
        entry.root.traverse((object) => { if ((object as THREE.Mesh).material) objects.push(object as THREE.Mesh); });
        this.stageTextures(entry.root);
        for (const object of objects) {
          const sources = Array.isArray(object.material) ? object.material : [object.material];
          for (const source of sources) {
            if (!observedSources.has(source)) { observedSources.add(source); source.addEventListener("dispose", cancel); }
            if (object.castShadow && object.customDepthMaterial && !observedSources.has(object.customDepthMaterial)) {
              observedSources.add(object.customDepthMaterial); object.customDepthMaterial.addEventListener("dispose", cancel);
            }
            for (const shadow of object.castShadow ? [false, true] : [false]) {
              await this.submit(() => {
                const { renderer } = this.ctx;
                const target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), mip = renderer.getActiveMipmapLevel();
                const live = object.material, children = object.children;
                let restore: Restore | undefined;
                let material: THREE.Material | undefined;
                try {
                  restore = scope?.();
                  material = shadow ? preparationDepth(object, source) : preparationMaterial(source);
                  materials.push(material);
                  object.material = material;
                  object.children = [];
                  renderer.setRenderTarget(shadow ? shadowTarget : entry.target());
                  const compile = () => {
                    if (renderer.extensions.has("KHR_parallel_shader_compile")) pending.push(renderer.compileAsync(object, entry.camera, entry.scene));
                    else renderer.compile(object, entry.camera, entry.scene);
                  };
                  const graphics = graphicsValidity(this.ctx);
                  if (graphics) graphics.checkPreparation(compile); else compile();
                } finally {
                  object.material = live; object.children = children;
                  restore?.();
                  renderer.setRenderTarget(target, face, mip);
                }
                assertShaderReady(renderer);
              }, { signal: controller.signal, priority });
            }
          }
        }
      }
      // Issue all bounded batches before waiting: KHR linking overlaps later submissions and boot I/O.
      const cancelled = deferred<never>();
      const stopWaiting = () => cancelled.reject(aborted());
      controller.signal.addEventListener("abort", stopWaiting, { once: true });
      try {
        if (controller.signal.aborted) throw aborted();
        // compileAsync has its own polling timers. Do not let an unresolved driver completion promise
        // bypass our deadline or hold a disposed/superseded group hostage.
        await Promise.race([Promise.all(pending), cancelled.promise]);
      } finally { controller.signal.removeEventListener("abort", stopWaiting); }
      const { renderer } = this.ctx;
      for (const material of materials) {
        // Reflect only owned programs. Without KHR one indivisible driver call can exceed the allowance.
        const properties = renderer.properties.get(material) as { programs?: Map<unknown, PreparedProgram> };
        for (const program of properties.programs?.values() ?? []) {
          if (renderer.extensions.has("KHR_parallel_shader_compile")) {
            let ready = await this.submit(() => program.isReady(), { signal: controller.signal, priority });
            while (!ready) ready = await this.submit(() => program.isReady(), { signal: controller.signal, priority, nextFrame: true });
          }
          await this.submit(() => {
            const reflect = () => { program.getUniforms(); program.getAttributes(); };
            const graphics = graphicsValidity(this.ctx);
            if (graphics) graphics.checkPreparation(reflect); else reflect();
            assertShaderReady(renderer);
          }, { signal: controller.signal, priority });
        }
      }
      if (controller.signal.aborted) throw aborted();
      assertShaderReady(renderer);
      graphicsValidity(this.ctx)?.assertValid();
      return batch;
    } catch (error) {
      try { assertShaderReady(this.ctx.renderer); graphicsValidity(this.ctx)?.assertValid(); } catch (failure) { batch.dispose(); throw failure; }
      if (timedOut && !this.disposed && !signal?.aborted && epoch === this.epoch) {
        // Preparation is an optimization, never permission to erase scenery. Keep submitted program
        // references alive for the first real draw; it may synchronously finish the remaining work.
        if (!this.timeoutWarned) {
          this.timeoutWarned = true;
          console.warn("[harbour] shader preparation timed out; showing scenery with possible first-use compilation", error);
        }
        batch.status = "timed-out";
        return batch;
      }
      batch.dispose();
      throw error;
    }
    finally {
      clearTimeout(timeout); this.active.delete(controller);
      signal?.removeEventListener("abort", cancel);
      for (const source of observedSources) source.removeEventListener("dispose", cancel);
      controller.signal.removeEventListener("abort", onAbort);
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.invalidate();
    this.queue.dispose(); this.uninstallShaderFailure();
    this.current?.dispose();
    for (const batch of this.held.values()) batch.dispose();
    this.held.clear(); this.entries.clear();
  }
}
