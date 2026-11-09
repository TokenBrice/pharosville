import * as THREE from "three";

/**
 * E05 still shadows (O2-F3/I1, O7-F2/I9): the registry SunRig (world/sun.ts) consults once every caster has updated
 * and before the frame renders, so the one key-light map is re-rendered only when what it holds changed, and the
 * near-only casters hand their shadow over to cheap contact quads (world/contact-shadows.ts) instead of popping.
 *
 * What the map holds:
 *  - DYNAMIC casters (`dynamic`, `figures`): posed in a shader or moved every frame — the fleet's BatchedMesh, the
 *    townsfolk, the civic workers. While any of them is in the map (castShadow and visible in the scene) the map keeps
 *    its tier cadence; one entering or leaving the map re-renders it at once.
 *  - every other castShadow mesh is CENSUSED: a scene audit (every AUDIT_FRAMES frames, and at once after a direct
 *    scene addition / removal or an `invalidate`) lists it, and each frame its shadow-relevant state (world matrix,
 *    visibility up the tree, geometry with its position / index versions and draw range, instance count and matrix
 *    version, depth material and its version) is compared with the state the map was DRAWN with. Any change but a
 *    move is stale at once; a move is stale once its shadow may have shifted STALE_PX on screen (shadowShift, at the
 *    caster's camera distance; outside the light frustum it is not in the map). A stale first change or settle
 *    re-renders the map now; an ongoing mover re-renders it at the tier cadence. Unknown caster activity therefore
 *    fails to a live refresh, never to a frozen shadow (office works rising, a launch rewriting the shipyard's index,
 *    the wreath placed, storm cones hoisted and swinging, the yard's cranes on their rails), while sub-pixel easing
 *    (the tide float settling) never re-renders it.
 *  - WATCHED uniforms (`watch`): depth-shader inputs that are not geometry (the kit twin's leaf fall: uFoliage,
 *    uSeasonPhase); a change re-renders the map once.
 * The kit's sway never reaches the shadow twin (world/sway.ts): trees stay still in the map by contract.
 *
 * Handover (Shadow decision): the fleet (existing 640 / 520 / 360 m limits by tier) and the figures (FIGURE_SHADOW_DIST
 * on every tier) cast real depth shadows near; between FADE_FROM× and 1× their limit their depth contribution
 * thins with a world-anchored ordered dither (castFadeGlsl: whole shadow-map texels, so PCF turns it into a real
 * fade and nothing crawls) while their contact quads strengthen; beyond the limit they leave the map. Decorative.
 */

/** The share of a family's limit at which the handover to contact quads starts. */
export const FADE_FROM = 0.85;
/** Figures (townsfolk, civic workers) cast real shadows only nearer than this (m); beyond, foot blobs. */
export const FIGURE_SHADOW_DIST = 320;
/** Frames between scene audits (a direct scene addition, a removal or an invalidation audits at once). */
export const AUDIT_FRAMES = 30;

/** The contact share (0 = all depth shadow … 1 = all contact quad) at camera distance `d` for a caster limit. */
export function contactShare(d: number, limit: number): number {
  return THREE.MathUtils.smoothstep(d, FADE_FROM * limit, limit);
}

/**
 * Module-level uniforms shared by every handover depth twin (one engine per page, like sunShadowUniforms):
 * the fleet's and the figures' fade (0 = full caster … 1 = gone) and the shadow map's world-anchored texel phase.
 */
export const castFadeUniforms = {
  uHbFleetFade: { value: 0 } as THREE.IUniform<number>,
  uHbFigureFade: { value: 0 } as THREE.IUniform<number>,
  /** (global texel index of the map's first column, of its first row) mod 4, from SunRig's texel-snapped fit */
  uHbCastPhase: { value: new THREE.Vector2() } as THREE.IUniform<THREE.Vector2>,
};

/**
 * Depth-twin fragment code for one fade uniform: an ordered 4×4 dither on whole shadow-map texels. The texel grid is
 * world-anchored (SunRig snaps the fit's centre to whole texels and publishes its phase), every layer along a light
 * ray drops together (the coverage is exactly 1 − fade), and a still view keeps a still pattern. Runs only inside
 * the handover band (a uniform branch); `discard` is the only cost.
 */
export function castFadeGlsl(uniform: "uHbFleetFade" | "uHbFigureFade"): { pars: string; discard: string } {
  return {
    pars: `uniform float ${uniform};\nuniform vec2 uHbCastPhase;`,
    discard: `if (${uniform} > 0.0) {
    vec2 hbCell = mod(floor(gl_FragCoord.xy) + uHbCastPhase, 4.0);
    vec2 hbHalf = floor(hbCell * 0.5);
    float hbB2 = fract(hbCell.x * 0.5 + hbCell.y * hbCell.y * 0.75), hbB2h = fract(hbHalf.x * 0.5 + hbHalf.y * hbHalf.y * 0.75);
    if (hbB2 + hbB2h * 0.25 + 0.03125 < ${uniform}) discard;
  }`,
  };
}

/** Floats per census signature (see `sign`); the geometry and depth material are compared by identity. */
const SIG = 23;
/** A censused caster's shadow is stale once it may have shifted this far on screen (CSS px) since the map was drawn. */
export const STALE_PX = 0.5;

interface Entry {
  readonly object: THREE.Object3D;
  dynamic: boolean;
  /** in the map at the last check: in this scene, visible up the tree, castShadow */
  inMap: boolean;
  /** changing at the last check (an ongoing mover refreshes at the tier cadence, a first change or a settle at once) */
  moving: boolean;
  seen: boolean;
  /** the last check's state, and the state the map was last drawn with */
  readonly sig: Float64Array;
  readonly drawn: Float64Array;
  geometry: unknown;
  material: unknown;
  drawnGeometry: unknown;
  drawnMaterial: unknown;
  drawnInFrustum: boolean;
}

interface Figures { mesh: THREE.InstancedMesh; height: number }

interface Watched { uniform: THREE.IUniform; last: number[] }

/** What the map needs this frame. */
export interface CasterState {
  /** a dynamic caster is in the map, or a censused one moved visibly while moving: refresh at the tier cadence */
  live: boolean;
  /** something the map holds changed (membership, a static caster, a watched uniform, a mover's start / settle): now */
  changed: boolean;
}

/** How the frame sees the casters: the camera (and its CSS px height), the map's sun and its light frustum. */
export interface CasterView {
  readonly camera: THREE.PerspectiveCamera;
  readonly viewHeight: number;
  readonly sun: THREE.Vector3;
  readonly frustum: THREE.Frustum | null;
}

const scratch = new Float64Array(SIG);
const centre = new THREE.Vector3();
const sphere = new THREE.Sphere();

/** The material three's shadow pass derives its depth program from. */
function depthSource(mesh: THREE.Mesh): THREE.Material | undefined {
  return mesh.customDepthMaterial ?? (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
}

/** The shadow-relevant state of a censused caster (bar its geometry / depth material identity: see `check`). */
function sign(object: THREE.Object3D, out: Float64Array): void {
  out.set(object.matrixWorld.elements);
  const mesh = object as THREE.Mesh, g = mesh.geometry as THREE.BufferGeometry | undefined;
  out[16] = g?.index?.version ?? -1;
  out[17] = (g?.attributes.position as THREE.BufferAttribute | undefined)?.version ?? -1;
  out[18] = g?.drawRange.start ?? 0;
  out[19] = g?.drawRange.count ?? 0;
  const inst = object as THREE.InstancedMesh;
  out[20] = inst.isInstancedMesh ? inst.count : -1;
  out[21] = inst.isInstancedMesh ? inst.instanceMatrix.version : -1;
  out[22] = depthSource(mesh)?.version ?? -1;
}

function same(a: Float64Array, b: Float64Array, from = 0): boolean {
  for (let i = from; i < SIG; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** The object's bounding sphere in its own frame (computed once per geometry, as three does). */
function localSphere(object: THREE.Object3D): THREE.Sphere | null {
  const g = (object as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
  if (!g) return null;
  if (!g.boundingSphere) g.computeBoundingSphere();
  return g.boundingSphere;
}

/**
 * Bound on how far (m, on the ground) any point of a caster's local bounding sphere — and so its shadow — moved
 * between two world matrices: |Δt + ΔR·c| + ‖ΔR‖_F·r, a rise or fall stretched by the sun's cot(elevation).
 */
export function shadowShift(a: ArrayLike<number>, b: ArrayLike<number>, c: THREE.Vector3, r: number, cotSun: number): number {
  let f = 0;
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) { const d = b[col * 4 + row] - a[col * 4 + row]; f += d * d; }
  const dx = (b[0] - a[0]) * c.x + (b[4] - a[4]) * c.y + (b[8] - a[8]) * c.z + (b[12] - a[12]);
  const dy = (b[1] - a[1]) * c.x + (b[5] - a[5]) * c.y + (b[9] - a[9]) * c.z + (b[13] - a[13]);
  const dz = (b[2] - a[2]) * c.x + (b[6] - a[6]) * c.y + (b[10] - a[10]) * c.z + (b[14] - a[14]);
  return Math.hypot(dx, dz) + Math.abs(dy) * cotSun + Math.sqrt(f) * r * (1 + cotSun);
}

/** In `scene`, visible up the tree and casting: what three's shadow pass would render (bar its frustum). */
function inMapOf(object: THREE.Object3D, scene: THREE.Object3D): boolean {
  if (!object.castShadow) return false;
  for (let o: THREE.Object3D | null = object; o; o = o.parent) {
    if (!o.visible) return false;
    if (o === scene) return true;
  }
  return false;
}

function valuesOf(value: unknown, out: number[]): number[] {
  out.length = 0;
  if (typeof value === "number") out.push(value);
  else if (value && typeof (value as { toArray?: unknown }).toArray === "function") (value as { toArray(a: number[]): number[] }).toArray(out);
  return out;
}

export class ShadowCasters {
  private readonly entries = new Map<THREE.Object3D, Entry>();
  private readonly dynamics = new Set<THREE.Object3D>();
  private readonly figureSets = new Set<Figures>();
  private readonly watched: Watched[] = [];
  private readonly tmp: number[] = [];
  private auditIn = 0;
  private forced = true;
  private scene: THREE.Scene | null = null;
  private readonly onMembership = () => { this.auditIn = 0; };

  /** Follow direct scene additions and removals (systems add their roots to the scene). */
  attach(scene: THREE.Scene): void {
    this.detach();
    this.scene = scene;
    scene.addEventListener("childadded", this.onMembership);
    scene.addEventListener("childremoved", this.onMembership);
    this.auditIn = 0;
  }

  detach(): void {
    this.scene?.removeEventListener("childadded", this.onMembership);
    this.scene?.removeEventListener("childremoved", this.onMembership);
    this.scene = null;
  }

  /** A caster posed in a shader or moved every frame: while in the map, the map keeps its tier cadence. */
  dynamic(object: THREE.Object3D): () => void {
    this.dynamics.add(object);
    const e = this.entries.get(object);
    if (e) e.dynamic = true;
    this.auditIn = 0;
    return () => {
      this.dynamics.delete(object);
      const entry = this.entries.get(object);
      if (entry) { this.entries.delete(object); if (entry.inMap) this.forced = true; }
    };
  }

  /**
   * A figure crowd (instanced, one figure per instance, feet at the instance origin, `height` m tall at scale 1): a
   * dynamic caster nearer than FIGURE_SHADOW_DIST, foot blobs beyond (ContactShadows reads the instance matrices).
   * Its castShadow is gated here once it is shown (a deferred crowd is prepared, castShadow on, before it shows).
   */
  figures(mesh: THREE.InstancedMesh, height: number): () => void {
    const set = { mesh, height };
    this.figureSets.add(set);
    const undo = this.dynamic(mesh);
    return () => { this.figureSets.delete(set); undo(); };
  }

  /** Registered figure crowds (contact quads read their instances). */
  get crowds(): ReadonlySet<Figures> { return this.figureSets; }

  /** A depth-shader input that is not geometry: a change re-renders the map once. */
  watch(uniform: THREE.IUniform): void {
    if (!this.watched.some((w) => w.uniform === uniform)) this.watched.push({ uniform, last: [...valuesOf(uniform.value, this.tmp)] });
  }

  /** The owner knows its casters changed: re-render once, and audit the scene now. */
  invalidate(): void { this.forced = true; this.auditIn = 0; }

  /** Gate the figure crowds' castShadow for the camera distance (shown crowds only; see `figures`). */
  gateFigures(distance: number, scene: THREE.Object3D): void {
    for (const { mesh } of this.figureSets) {
      let shown = true;
      for (let o: THREE.Object3D | null = mesh; o && o !== scene; o = o.parent) if (!o.visible) { shown = false; break; }
      if (shown) mesh.castShadow = distance < FIGURE_SHADOW_DIST;
    }
  }

  /** Inside the light's frustum (or no frustum known): its shadow can be in the map. */
  private inFrustum(object: THREE.Object3D, m: ArrayLike<number>, frustum: THREE.Frustum | null): boolean {
    if (!frustum || !object.frustumCulled) return true;
    const local = localSphere(object);
    if (!local) return true;
    sphere.center.copy(local.center).applyMatrix4(object.matrixWorld);
    sphere.radius = local.radius * Math.max(Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10]));
    return frustum.intersectsSphere(sphere);
  }

  /** After every caster updated, before the render (world matrices current): what the map needs this frame. */
  check(scene: THREE.Scene, view: CasterView, out: CasterState): CasterState {
    let changed = this.forced, live = false;
    this.forced = false;
    if (--this.auditIn <= 0) {
      this.auditIn = AUDIT_FRAMES;
      if (this.audit(scene)) changed = true;
    }
    const cam = view.camera, sunY = THREE.MathUtils.clamp(view.sun.y, 1e-3, 1);
    const cotSun = Math.min(8, Math.sqrt(1 - sunY * sunY) / sunY);
    // metres per CSS px at 1 m from the camera
    const mPerPx = (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)) / Math.max(1, view.viewHeight);
    for (const e of this.entries.values()) {
      const inMap = inMapOf(e.object, scene);
      if (inMap !== e.inMap) {
        e.inMap = inMap; e.moving = false; changed = true;
        if (inMap && e.dynamic) live = true;
        if (inMap && !e.dynamic) { sign(e.object, e.sig); e.geometry = (e.object as THREE.Mesh).geometry; e.material = depthSource(e.object as THREE.Mesh); }
        continue;
      }
      if (!inMap) continue;
      if (e.dynamic || ((e.object as THREE.BatchedMesh).isBatchedMesh)) { live = true; continue; }   // an unregistered batch: assume it moves
      const object = e.object as THREE.Mesh;
      sign(object, scratch);
      const geometry = object.geometry, material = depthSource(object);
      const changing = !same(scratch, e.sig) || geometry !== e.geometry || material !== e.material;
      e.sig.set(scratch); e.geometry = geometry; e.material = material;
      let stale = !same(scratch, e.drawn, 16) || geometry !== e.drawnGeometry || material !== e.drawnMaterial;
      if (!stale && !same(scratch, e.drawn)) {
        // moved: stale once its shadow may have shifted STALE_PX on screen (sub-pixel easing never re-renders)
        if (e.drawnInFrustum || this.inFrustum(object, scratch, view.frustum)) {
          const local = localSphere(object);
          if (local) centre.copy(local.center); else centre.set(0, 0, 0);
          const r = local?.radius ?? 0;
          const wx = scratch[0] * centre.x + scratch[4] * centre.y + scratch[8] * centre.z + scratch[12];
          const wy = scratch[1] * centre.x + scratch[5] * centre.y + scratch[9] * centre.z + scratch[13];
          const wz = scratch[2] * centre.x + scratch[6] * centre.y + scratch[10] * centre.z + scratch[14];
          const dist = Math.max(1, Math.hypot(wx - cam.position.x, wy - cam.position.y, wz - cam.position.z));
          stale = shadowShift(e.drawn, scratch, centre, r, cotSun) > STALE_PX * mPerPx * dist;
        }
      }
      if (stale) { if (changing && e.moving) live = true; else changed = true; }
      e.moving = changing;
    }
    for (const w of this.watched) {
      const now = valuesOf(w.uniform.value, this.tmp);
      let equal = now.length === w.last.length;
      for (let i = 0; equal && i < now.length; i++) equal = now[i] === w.last[i];
      if (!equal) { w.last = [...now]; changed = true; }
    }
    out.live = live; out.changed = changed;
    return out;
  }

  /** The map is drawn this frame: remember what every censused caster in it looks like now. */
  drawn(view: CasterView): void {
    for (const e of this.entries.values()) {
      if (!e.inMap || e.dynamic) continue;
      const object = e.object as THREE.Mesh;
      sign(object, e.drawn);
      e.drawnGeometry = object.geometry; e.drawnMaterial = depthSource(object);
      e.drawnInFrustum = this.inFrustum(object, e.drawn, view.frustum);
    }
  }

  /** Census: every castShadow mesh in the scene (shown or not) and every dynamic caster; true if one in the map left. */
  private audit(scene: THREE.Scene): boolean {
    for (const e of this.entries.values()) e.seen = false;
    scene.traverse((o) => {
      if (!(o as THREE.Mesh).isMesh && !(o as THREE.Line).isLine && !(o as THREE.Points).isPoints) return;
      const dynamic = this.dynamics.has(o);
      if (!o.castShadow && !dynamic) return;
      let e = this.entries.get(o);
      if (!e) {
        e = { object: o, dynamic, inMap: false, moving: false, seen: true, sig: new Float64Array(SIG), drawn: new Float64Array(SIG),
          geometry: null, material: null, drawnGeometry: null, drawnMaterial: null, drawnInFrustum: true };
        this.entries.set(o, e);
      }
      e.seen = true;
    });
    let left = false;
    for (const [o, e] of this.entries) {
      if (e.seen || this.dynamics.has(o)) continue;
      if (e.inMap) left = true;
      this.entries.delete(o);
    }
    return left;
  }

  /** Census size (dev diagnostics). */
  get size(): number { return this.entries.size; }

  dispose(): void {
    this.detach();
    this.entries.clear(); this.dynamics.clear(); this.figureSets.clear(); this.watched.length = 0;
  }
}
