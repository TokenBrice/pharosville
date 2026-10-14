import * as THREE from "three";

/**
 * Every painted surface of the civic quarter in ONE canvas atlas and ONE draw: the shipyard's name boards, the
 * Registry's frieze, grade board and house flag, the storm station's weather board and the Harbourmaster's movers
 * flags. Owners allocate a slot, paint it (2D canvas, sRGB) and place it in the world as an upright board or as a
 * flag flying from its hoist (flags flutter in the vertex shader). Hidden items drop out of the next rebuild.
 */

export interface BoardSlot { x: number; y: number; w: number; h: number }

/** An upright rectangle: centre, unit right / up (as the viewer reads it), size (m). `flag`: flutters (u = 0 at the hoist). */
export interface BoardPlace { centre: THREE.Vector3; right: THREE.Vector3; up: THREE.Vector3; w: number; h: number; flag?: boolean }

interface Item { slot: BoardSlot; at: BoardPlace; visible: boolean }

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
  private readonly uT = { value: 0 };
  private readonly uWind = { value: 0.35 };

  constructor(readonly size = 2048) {
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
    this.texture.needsUpdate = true;
  }

  /** The texture changed outside paint() (an image arrived). */
  touch(): void { this.texture.needsUpdate = true; }

  place(key: string, slot: BoardSlot, at: BoardPlace, visible = true): void {
    this.items.set(key, { slot, at, visible });
    this.dirty = true;
  }

  move(key: string, at: BoardPlace): void {
    const it = this.items.get(key);
    if (it) { it.at = at; this.dirty = true; }
  }

  show(key: string, visible: boolean): void {
    const it = this.items.get(key);
    if (it && it.visible !== visible) { it.visible = visible; this.dirty = true; }
  }

  update(dt: number, moving: boolean, night: number, wind: number): void {
    if (moving) this.uT.value += dt;
    this.uWind.value = wind;
    this.material.emissiveIntensity = 0.03 + 0.15 * night;
    if (this.dirty) this.rebuild();
  }

  private rebuild(): void {
    this.dirty = false;
    const P: number[] = [], N: number[] = [], UV: number[] = [], F: number[] = [], I: number[] = [];
    const S = this.size, n = new THREE.Vector3(), p = new THREE.Vector3();
    for (const { slot, at, visible } of this.items.values()) {
      if (!visible) continue;
      n.crossVectors(at.right, at.up).normalize();
      const nu = at.flag ? FLAG_SEG : 1, base = P.length / 3;
      for (let j = 0; j <= 1; j++) {
        for (let i = 0; i <= nu; i++) {
          const u = i / nu;
          p.copy(at.centre).addScaledVector(at.right, (u - 0.5) * at.w).addScaledVector(at.up, (j - 0.5) * at.h);
          P.push(p.x, p.y, p.z); N.push(n.x, n.y, n.z);
          // canvas y runs down; the texture is flipped on upload (v = 0 at the canvas bottom)
          UV.push((slot.x + u * slot.w) / S, 1 - (slot.y + (1 - j) * slot.h) / S);
          F.push(at.flag ? u : 0);
        }
      }
      for (let i = 0; i < nu; i++) {
        const a = base + i, b = a + 1, c = a + nu + 1, d = c + 1;
        I.push(a, b, d, a, d, c);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(UV, 2));
    g.setAttribute("aFly", new THREE.Float32BufferAttribute(F, 1));
    g.setIndex(I);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.mesh.visible = I.length > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.texture.dispose();
  }
}
