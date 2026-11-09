import * as THREE from "three";
import type { PreparationService } from "../engine/types";
import { isAbort } from "../engine/failure";

/**
 * Every painted surface of the civic quarter in ONE canvas atlas and ONE draw: the shipyard's name boards, the
 * Registry's frieze, grade board and house flag, the storm station's weather board and the Harbourmaster's movers
 * flags. Owners allocate a slot, paint it (2D canvas, sRGB) and place it in the world as an upright board or as a
 * flag flying from its hoist (flags flutter in the vertex shader). Hidden items drop out of the next rebuild.
 */

export interface BoardSlot { x: number; y: number; w: number; h: number }

/** An upright rectangle: centre, unit right / up (as the viewer reads it), size (m). `flag`: flutters (u = 0 at the hoist). */
export interface BoardPlace { centre: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; w: number; h: number; flag?: boolean }

interface Item { slot: BoardSlot; at: BoardPlace; visible: boolean; base: number; dirty: boolean }

const FLAG_SEG = 10;

/** A flag flying from `hoist` (its top inner corner) downwind along the unit horizontal `to`. */
export function flagPlace(hoist: THREE.Vector3, to: readonly [number, number], w: number, h: number): BoardPlace {
  const right = new THREE.Vector3(to[0], 0, to[1]).normalize(), up = new THREE.Vector3(0, 1, 0);
  return { centre: hoist.clone().addScaledVector(right, w / 2).addScaledVector(up, -h / 2), right, up, w, h, flag: true };
}

/** A board on a wall facing the unit `normal`: the viewer's right is up × normal. */
export function wallPlace(centre: THREE.Vector3, normal: THREE.Vector3, w: number, h: number): BoardPlace {
  const up = new THREE.Vector3(0, 1, 0);
  return { centre: centre.clone(), right: new THREE.Vector3().crossVectors(up, normal).normalize(), up, w, h };
}

export class CivicBoards {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D | null;
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshStandardMaterial;
  readonly mesh: THREE.Mesh;
  private readonly items = new Map<string, Item>();
  private sx = 0;
  private sy = 0;
  private row = 0;
  private dirty = false;
  private topologyDirty = false;
  private visibilityDirty = false;
  private readonly paints = new Set<BoardSlot>();
  private upload: Promise<void> | null = null;
  private initialized = false;
  private disposed = false;
  private readonly tile = document.createElement("canvas");
  private readonly source = new THREE.Texture(this.tile);
  private readonly uT = { value: 0 };
  private readonly uWind = { value: 0.35 };

  constructor(readonly size = 2048, private readonly renderer?: THREE.WebGLRenderer, private readonly preparation?: PreparationService, private readonly signal?: AbortSignal) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = this.canvas.height = size;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({
      map: this.texture, emissiveMap: this.texture, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0.05,
      roughness: 0.72, side: THREE.DoubleSide, alphaTest: 0.5,
    });
    m.name = "hb_civic_boards";
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uBoardT = this.uT;
      shader.uniforms.uBoardWind = this.uWind;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aFly;\nuniform float uBoardT;\nuniform float uBoardWind;")
        .replace("#include <begin_vertex>", `#include <begin_vertex>
  float hbW = clamp(uBoardWind, 0.0, 1.0);
  float hbPh = uBoardT * (3.0 + 3.0 * hbW) + position.x * 0.07 + position.z * 0.05;
  transformed += objectNormal * aFly * (0.16 + 0.22 * hbW) * (sin(hbPh - aFly * 5.5) + 0.4 * sin(hbPh * 1.7 - aFly * 10.0));
  transformed.y -= aFly * aFly * (1.0 - smoothstep(0.1, 0.6, hbW)) * 0.35;`);
    };
    m.customProgramCacheKey = () => "hb_civic_boards";
    this.material = m;
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), m);
    this.mesh.name = "civic-boards";
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
  }

  /** Shelf-pack a w×h px slot (null when the atlas is full). */
  alloc(w: number, h: number): BoardSlot | null {
    const pad = 4;
    if (this.sx + w + pad > this.size) { this.sx = 0; this.sy += this.row + pad; this.row = 0; }
    if (this.sy + h > this.size || w > this.size) return null;
    const s = { x: this.sx, y: this.sy, w, h };
    this.sx += w + pad;
    this.row = Math.max(this.row, h);
    return s;
  }

  /** Clear a slot and paint it; the texture re-uploads on the next update. */
  paint(slot: BoardSlot, fn: (ctx: CanvasRenderingContext2D, s: BoardSlot) => void): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.save();
    ctx.clearRect(slot.x, slot.y, slot.w, slot.h);
    ctx.beginPath(); ctx.rect(slot.x, slot.y, slot.w, slot.h); ctx.clip();
    fn(ctx, slot);
    ctx.restore();
    this.touch(slot);
  }

  /** The texture changed outside paint() (an image arrived). */
  touch(slot: BoardSlot): void {
    if (this.disposed) return;
    this.paints.add(slot);
    void this.stage().catch((error: unknown) => { if (!isAbort(error)) console.error("[harbour] board upload failed", error); });
  }

  /** Paint completions share one scheduled batch; later paints copy only their canvas rectangles. */
  async stage(): Promise<void> {
    if (this.upload) return this.upload;
    const run = async () => {
      while (this.paints.size && !this.disposed) {
        const flush = (deadline: number) => {
          this.signal?.throwIfAborted();
          if (this.disposed) return;
          if (!this.renderer) { this.paints.clear(); this.texture.needsUpdate = true; return; }
          if (!this.initialized) {
            this.texture.needsUpdate = true;
            this.renderer.initTexture(this.texture);
            this.initialized = true; this.paints.clear(); return;
          }
          const g = this.tile.getContext("2d")!;
          for (const s of this.paints) {
            this.tile.width = s.w; this.tile.height = s.h;
            g.drawImage(this.canvas, s.x, s.y, s.w, s.h, 0, 0, s.w, s.h);
            // A fresh CPU source keeps Three on its subimage path; never initialize/upload the source.
            this.renderer.copyTextureToTexture(this.source, this.texture, null, new THREE.Vector2(s.x, this.size - s.y - s.h));
            this.paints.delete(s);
            if (performance.now() >= deadline) break;
          }
        };
        if (this.preparation) await this.preparation.submit(flush, { signal: this.signal });
        else { await Promise.resolve(); flush(Infinity); }
      }
    };
    this.upload = run();
    try { await this.upload; } finally { this.upload = null; }
  }

  place(key: string, slot: BoardSlot, at: BoardPlace, visible = true): void {
    this.items.set(key, { slot, at, visible, base: 0, dirty: true });
    this.topologyDirty = this.visibilityDirty = true;
    this.dirty = true;
  }

  move(key: string, at: BoardPlace): void {
    const it = this.items.get(key);
    if (it) { this.topologyDirty ||= !!it.at.flag !== !!at.flag; it.at = at; it.dirty = true; this.dirty = true; }
  }

  show(key: string, visible: boolean): void {
    const it = this.items.get(key);
    if (it && it.visible !== visible) { it.visible = visible; this.visibilityDirty = true; this.dirty = true; }
  }

  update(dt: number, moving: boolean, night: number, wind: number): void {
    if (moving) this.uT.value += dt;
    this.uWind.value = wind;
    this.material.emissiveIntensity = 0.03 + 0.15 * night;
    if (this.dirty) this.rebuild();
  }

  private rebuild(): void {
    this.dirty = false;
    const g = this.mesh.geometry;
    if (this.topologyDirty) {
      let vertices = 0, indices = 0;
      for (const it of this.items.values()) {
        it.base = vertices; it.dirty = true;
        const nu = it.at.flag ? FLAG_SEG : 1;
        vertices += (nu + 1) * 2; indices += nu * 6;
      }
      for (const [name, size] of [["position", 3], ["normal", 3], ["uv", 2], ["aFly", 1]] as const) {
        g.setAttribute(name, new THREE.BufferAttribute(new Float32Array(vertices * size), size).setUsage(THREE.DynamicDrawUsage));
      }
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1).setUsage(THREE.DynamicDrawUsage));
      this.visibilityDirty = true;
    }
    const n = new THREE.Vector3(), p = new THREE.Vector3();
    for (const it of this.items.values()) {
      if (!it.dirty) continue;
      it.dirty = false;
      const { slot, at, base } = it, nu = at.flag ? FLAG_SEG : 1, count = (nu + 1) * 2;
      n.crossVectors(at.right, at.up).normalize();
      for (let j = 0; j <= 1; j++) for (let i = 0; i <= nu; i++) {
        const u = i / nu, k = base + j * (nu + 1) + i;
        p.copy(at.centre).addScaledVector(at.right, (u - 0.5) * at.w).addScaledVector(at.up, (j - 0.5) * at.h);
        (g.attributes.position as THREE.BufferAttribute).setXYZ(k, p.x, p.y, p.z);
        (g.attributes.normal as THREE.BufferAttribute).setXYZ(k, n.x, n.y, n.z);
        if (this.topologyDirty) {
          (g.attributes.uv as THREE.BufferAttribute).setXY(k, (slot.x + u * slot.w) / this.size, 1 - (slot.y + (1 - j) * slot.h) / this.size);
          (g.attributes.aFly as THREE.BufferAttribute).setX(k, at.flag ? u : 0);
        }
      }
      for (const name of this.topologyDirty ? ["position", "normal", "uv", "aFly"] : ["position", "normal"]) {
        const a = g.attributes[name] as THREE.BufferAttribute;
        if (!a.updateRanges.some((r) => r.start === base * a.itemSize && r.count === count * a.itemSize)) a.addUpdateRange(base * a.itemSize, count * a.itemSize);
        a.needsUpdate = true;
      }
    }
    if (this.visibilityDirty) {
      let k = 0;
      for (const { at, base, visible } of this.items.values()) {
        if (!visible) continue;
        const nu = at.flag ? FLAG_SEG : 1;
        for (let i = 0; i < nu; i++) {
          const a = base + i, b = a + 1, c = a + nu + 1, d = c + 1;
          for (const v of [a, b, d, a, d, c]) g.index!.setX(k++, v);
        }
      }
      g.index!.needsUpdate = true;
      g.setDrawRange(0, k);
      this.mesh.visible = k > 0;
    }
    this.topologyDirty = this.visibilityDirty = false;
  }

  dispose(): void {
    this.disposed = true; this.paints.clear(); this.source.dispose();
    this.tile.width = this.tile.height = 0;
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
