import * as THREE from "three";
import type { EngineContext, PreparationEntry, PreparationService } from "./types";
import { getHarbourMaterials } from "../world/materials";
import { deferred } from "./deferred";

const aborted = () => new DOMException("Preparation superseded", "AbortError");
export const isPreparationAbort = (error: unknown): boolean => error instanceof DOMException && error.name === "AbortError";
type Restore = () => void;
export interface PreparedPrograms { readonly sources: ReadonlySet<THREE.Material>; dispose(): void }
interface PreparedProgram { isReady(): boolean; getUniforms(): unknown; getAttributes(): unknown }

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

/** Bounded idle submission batches, one pending state, no live-material async polling. */
export class ProgramPreparation implements PreparationService {
  private readonly entries = new Set<PreparationEntry>();
  private readonly held = new Map<THREE.Object3D, PreparedPrograms>();
  private readonly uploads = new WeakMap<THREE.Texture, number>();
  private readonly waits = new Set<() => void>();
  private readonly active = new Set<AbortController>();
  private epoch = 0;
  private seasonRequest = 0;
  private disposed = false;
  private timeoutWarned = false;
  private current: PreparedPrograms | undefined;
  constructor(private readonly ctx: EngineContext) {}

  register(entry: PreparationEntry): () => void {
    this.entries.add(entry);
    return () => { this.entries.delete(entry); this.held.get(entry.root)?.dispose(); this.held.delete(entry.root); };
  }

  /** Cancellation also covers idle callbacks and compiler polling ownership. */
  invalidate(): void {
    this.epoch++;
    for (const controller of this.active) controller.abort();
  }

  private idle(signal?: AbortSignal): Promise<number> {
    if (this.disposed || signal?.aborted) return Promise.reject(aborted());
    const { promise, resolve, reject } = deferred<number>();
    const native = typeof requestIdleCallback === "function";
    const clean = () => { this.waits.delete(cancel); signal?.removeEventListener("abort", cancel); };
    const cancel = () => {
      if (native) cancelIdleCallback(id); else clearTimeout(id);
      clean(); reject(aborted());
    };
    const done = (deadline?: IdleDeadline) => {
      clean();
      if (this.disposed || signal?.aborted) reject(aborted());
      // Under a saturated uncapped render loop, idle callbacks arrive via their timeout with zero
      // timeRemaining(). A zero budget would submit/reflect just one material per callback, eventually
      // exhausting the entire preparation deadline. Reserve the same bounded slice as the timer path.
      else resolve(performance.now() + (deadline?.didTimeout ? 4 : Math.min(4, deadline?.timeRemaining() ?? 4)));
    };
    this.waits.add(cancel);
    signal?.addEventListener("abort", cancel, { once: true });
    const id = native ? requestIdleCallback(done, { timeout: 16 }) : window.setTimeout(done, 0);
    return promise;
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
    void (async () => {
      for (const texture of textures) {
        if (texture.isRenderTargetTexture || !texture.image || this.uploads.get(texture) === texture.version) continue;
        await this.idle();
        if (this.uploads.get(texture) === texture.version) continue;
        this.ctx.renderer.initTexture(texture);
        this.uploads.set(texture, texture.version);
      }
    })().catch((error: unknown) => { if (!isPreparationAbort(error)) console.error("[harbour] texture preparation failed", error); });
  }

  async prepareGroup(root: THREE.Object3D): Promise<void> {
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
        this.held.set(root, { sources: batch.sources, dispose: release });
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

  async prepareWorld(scope?: () => Restore): Promise<PreparedPrograms> {
    if (this.disposed) throw aborted();
    return this.prepare([
      { root: this.ctx.scene, camera: this.ctx.camera, target: () => this.ctx.composer.inputBuffer, scene: this.ctx.scene },
      ...this.entries,
    ], scope);
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

  async prepare(entries: readonly PreparationEntry[], scope?: () => Restore, signal?: AbortSignal): Promise<PreparedPrograms> {
    const controller = new AbortController();
    const epoch = this.epoch;
    const cancel = () => controller.abort();
    signal?.addEventListener("abort", cancel, { once: true });
    if (signal?.aborted || this.disposed) controller.abort();
    this.active.add(controller);
    const materials: THREE.Material[] = [];
    const pending: Promise<unknown>[] = [];
    let deadline = 0;
    const observedSources = new Set<THREE.Material>();
    const batch = { sources: observedSources, dispose: () => { for (const material of materials) material.dispose(); materials.length = 0; } };
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
            for (const shadow of object.castShadow ? [false, true] : [false]) {
              if (performance.now() >= deadline) deadline = await this.idle(controller.signal);
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
                renderer.setRenderTarget(entry.target());
                if (renderer.extensions.has("KHR_parallel_shader_compile")) pending.push(renderer.compileAsync(object, entry.camera, entry.scene));
                else renderer.compile(object, entry.camera, entry.scene);
              } finally {
                object.material = live; object.children = children;
                restore?.();
                renderer.setRenderTarget(target, face, mip);
              }
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
        if (performance.now() >= deadline) deadline = await this.idle(controller.signal);
        if (controller.signal.aborted) throw aborted();
        // Reflect only owned programs. Without KHR this can block; readiness is not a timing guarantee.
        const properties = renderer.properties.get(material) as { programs?: Map<unknown, PreparedProgram> };
        for (const program of properties.programs?.values() ?? []) {
          if (renderer.extensions.has("KHR_parallel_shader_compile")) while (!program.isReady()) deadline = await this.idle(controller.signal);
          if (controller.signal.aborted) throw aborted();
          program.getUniforms(); program.getAttributes();
        }
      }
      if (controller.signal.aborted) throw aborted();
      return batch;
    } catch (error) {
      if (timedOut && !this.disposed && !signal?.aborted && epoch === this.epoch) {
        // Preparation is an optimization, never permission to erase scenery. Keep submitted program
        // references alive for the first real draw; it may synchronously finish the remaining work.
        if (!this.timeoutWarned) {
          this.timeoutWarned = true;
          console.warn("[harbour] shader preparation timed out; showing scenery with possible first-use compilation", error);
        }
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
    for (const cancel of [...this.waits]) cancel();
    this.current?.dispose();
    for (const batch of this.held.values()) batch.dispose();
    this.held.clear(); this.entries.clear();
  }
}
