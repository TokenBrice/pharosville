import * as THREE from "three";

/**
 * Sail-emblem atlas at runtime: the prebuilt logo atlas (scripts/harbour/build-emblems.mjs →
 * public/harbour/emblems.{webp,json}, every logo on a white roundel) copied into a canvas, plus a
 * generated MONOGRAM roundel (symbol letters on the coin's brand colour) for every boat without a logo,
 * in the free slots after the logos. One CanvasTexture, premultiplied (clean mip edges), sRGB.
 */
export const EMBLEMS_JSON = "/harbour/emblems.json";
export const EMBLEMS_IMG = "/harbour/emblems.webp";

interface AtlasMeta { slot: number; cols: number; width: number; height: number; ids: Record<string, number> }

export interface EmblemCoin { id: string; symbol: string; brandColor: string }

export class EmblemAtlas {
  readonly texture: THREE.CanvasTexture;
  /** (cols, rows, 1/cols, 1/rows) for the shader. */
  readonly grid = new THREE.Vector4(32, 1, 1 / 32, 1);
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly slots = new Map<string, number>();
  private nextFree: number;
  private capacity: number;

  private constructor(private readonly meta: AtlasMeta, private readonly img: ImageBitmap | null, extraSlots: number) {
    const rowsLogos = Math.ceil(Object.keys(meta.ids).length / meta.cols);
    const rows = Math.max(1, Math.min(meta.cols, rowsLogos + Math.ceil(extraSlots / meta.cols) + 1));
    this.capacity = rows * meta.cols;
    this.canvas = document.createElement("canvas");
    this.canvas.width = meta.width;
    this.canvas.height = rows * meta.slot;
    this.g = this.canvas.getContext("2d", { willReadFrequently: false })!;
    if (img) this.g.drawImage(img, 0, 0);
    for (const [id, s] of Object.entries(meta.ids)) this.slots.set(id, s);
    this.nextFree = rowsLogos * meta.cols; // monograms start on a fresh row (logos may be re-built)
    this.nextFree = Math.max(this.nextFree, Object.keys(meta.ids).length);
    this.grid.set(meta.cols, rows, 1 / meta.cols, 1 / rows);
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.premultiplyAlpha = true;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    this.texture = t;
  }

  static async load(extraSlots: number): Promise<EmblemAtlas> {
    let meta: AtlasMeta = { slot: 128, cols: 32, width: 4096, height: 128, ids: {} };
    let img: ImageBitmap | null = null;
    try {
      const r = await fetch(EMBLEMS_JSON);
      if (r.ok && (r.headers.get("content-type") ?? "").includes("json")) meta = await r.json() as AtlasMeta;
      const ri = await fetch(EMBLEMS_IMG);
      if (ri.ok && (ri.headers.get("content-type") ?? "").includes("image")) img = await createImageBitmap(await ri.blob(), { premultiplyAlpha: "none" });
    } catch (e) { console.warn("[harbour] fleet: emblem atlas unavailable, monograms only", e); }
    if (!img) meta.ids = {};
    return new EmblemAtlas(meta, img, extraSlots);
  }

  /** Slot for a coin: its logo, or a monogram drawn on first request. -1 when the atlas is full. */
  slotFor(c: EmblemCoin): number {
    const hit = this.slots.get(c.id);
    if (hit != null) return hit;
    if (this.nextFree >= this.capacity) return -1;
    const s = this.nextFree++;
    this.drawMonogram(s, c);
    this.slots.set(c.id, s);
    this.texture.needsUpdate = true;
    return s;
  }

  private drawMonogram(slot: number, c: EmblemCoin): void {
    const S = this.meta.slot, g = this.g;
    const x0 = (slot % this.meta.cols) * S, y0 = Math.floor(slot / this.meta.cols) * S;
    const cx = x0 + S / 2, cy = y0 + S / 2;
    const brand = new THREE.Color(c.brandColor);
    const hsl = { h: 0, s: 0, l: 0 };
    brand.getHSL(hsl, THREE.SRGBColorSpace);
    // keep monograms in the harbour's register: no neon, no near-black
    const base = new THREE.Color().setHSL(hsl.h, Math.min(hsl.s, 0.62), THREE.MathUtils.clamp(hsl.l, 0.28, 0.6), THREE.SRGBColorSpace);
    const lum = 0.2126 * base.r + 0.7152 * base.g + 0.0722 * base.b; // linear
    const ink = lum > 0.32 ? "#1E2A33" : "#FFFFFF";
    g.save();
    g.clearRect(x0, y0, S, S);
    g.beginPath(); g.arc(cx, cy, S * 0.477, 0, Math.PI * 2); g.fillStyle = "#BDB2A0"; g.fill();
    g.beginPath(); g.arc(cx, cy, S * 0.465, 0, Math.PI * 2); g.fillStyle = "#FFFFFF"; g.fill();
    g.beginPath(); g.arc(cx, cy, S * 0.41, 0, Math.PI * 2); g.fillStyle = `#${base.getHexString(THREE.SRGBColorSpace)}`; g.fill();
    g.beginPath(); g.arc(cx, cy, S * 0.36, 0, Math.PI * 2); g.lineWidth = S * 0.012; g.strokeStyle = ink === "#FFFFFF" ? "rgba(255,255,255,0.55)" : "rgba(30,42,51,0.45)"; g.stroke();
    const letters = monogram(c.symbol || c.id);
    const size = letters.length <= 1 ? 0.5 : letters.length === 2 ? 0.4 : letters.length === 3 ? 0.3 : 0.24;
    g.fillStyle = ink;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${Math.round(S * size)}px Georgia, "Times New Roman", serif`;
    g.fillText(letters, cx, cy + S * 0.025, S * 0.66);
    g.restore();
  }

  dispose(): void { this.texture.dispose(); this.img?.close(); }
}

/** Up to 4 letters of a symbol, dropping a trailing currency suffix ("USD", "EUR") when the rest is ≥ 2 letters. */
export function monogram(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9$€+]/g, "");
  if (!s) return "?";
  const stem = s.replace(/(USD|EUR|USDC|USDT)$/, "");
  const pick = stem.length >= 2 ? stem : s;
  return pick.slice(0, 4);
}
