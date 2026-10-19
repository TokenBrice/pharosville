import * as THREE from "three";
import type { AssetStore } from "../engine/assets";

/**
 * Sail-emblem atlas: decoded logos and generated monograms share one canvas and mip chain.
 * Keep the original canvas decode/upload path and combined dimensions: a separate logo texture
 * changes tiny roundel/flag pixels even when its source artwork and filtering are identical.
 *
 * `load` reads only the slot map. Until `loadLogos` completes, logo slots show a plain brand-colour
 * roundel (a monogram if neither image loads). Installed monograms repaint only when their inputs change.
 */
export const EMBLEMS_JSON = "/harbour/emblems.json";
export const EMBLEMS_IMG = "/harbour/emblems.avif";
export const EMBLEMS_IMG_FALLBACK = "/harbour/emblems.webp";

interface AtlasMeta { slot: number; cols: number; width: number; height: number; ids: Record<string, number> }

export interface EmblemCoin { id: string; symbol: string; brandColor: string }

export class EmblemAtlas {
  readonly texture: THREE.CanvasTexture;
  /** (cols, rows, 1/cols, 1/rows) for the shader. */
  readonly grid = new THREE.Vector4(32, 1, 1 / 32, 1);
  private canvas: HTMLCanvasElement;
  private g: CanvasRenderingContext2D;
  private readonly slots = new Map<string, number>();
  private nextFree: number;
  /** Most slots the atlas may grow to (logos + the monogram allowance); the canvas holds `rows` of them. */
  private readonly capacity: number;
  private readonly logoSlots: number;
  private rows: number;
  /** Last painted roundel inputs, also used to finish pending logos with monograms on failure. */
  private readonly roundels = new Map<number, EmblemCoin>();
  private logos: "wait" | "loading" | "done" = "wait";
  private logoLoaded = false;
  private disposed = false;
  private painted = false;
  private dirty = false;
  private batching = false;

  private constructor(private readonly meta: AtlasMeta, extraSlots: number) {
    const rowsLogos = logoRows(meta);
    this.logoSlots = rowsLogos * meta.cols;
    this.capacity = Math.max(1, Math.min(meta.cols, rowsLogos + Math.ceil(extraSlots / meta.cols) + 1)) * meta.cols;
    this.rows = 1; // no unused logo backing store / upload before the first fleet install
    this.canvas = document.createElement("canvas");
    this.canvas.width = meta.width;
    this.canvas.height = this.rows * meta.slot;
    this.g = this.canvas.getContext("2d", { willReadFrequently: false })!;
    for (const [id, s] of Object.entries(meta.ids)) this.slots.set(id, s);
    this.nextFree = rowsLogos * meta.cols; // monograms start on a fresh row (logos may be re-built)
    this.grid.set(meta.cols, this.rows, 1 / meta.cols, 1 / this.rows);
    const t = new THREE.CanvasTexture(this.canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.premultiplyAlpha = true;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.magFilter = THREE.LinearFilter;
    t.anisotropy = 4;
    this.texture = t;
  }

  /** The slot map only (small); the logo image comes later through loadLogos. */
  static async load(assets: AssetStore, extraSlots: number): Promise<EmblemAtlas> {
    let meta: AtlasMeta = { slot: 128, cols: 32, width: 4096, height: 128, ids: {} };
    try {
      meta = await assets.json<AtlasMeta>(EMBLEMS_JSON);
    } catch (e) { console.warn("[harbour] fleet: emblem atlas unavailable, monograms only", e); }
    return new EmblemAtlas(meta, extraSlots);
  }

  /** Reserve every slot used by this install before drawing (including shared logo slots). */
  begin(coins: readonly EmblemCoin[]): void {
    this.batching = true;
    if (!coins.length) return; // the empty awaiting-data model must not reserve every future logo row
    const missing = new Set<string>();
    let last = -1;
    for (const c of coins) {
      const slot = this.slots.get(c.id);
      if (slot != null) last = Math.max(last, slot);
      else if (slot == null) missing.add(c.id);
    }
    if (missing.size) last = Math.max(last, Math.min(this.capacity, this.nextFree + missing.size) - 1);
    if (last < 0) return;
    // Match the old growth's final size (and mip chain), but allocate it only once.
    const base = logoRows(this.meta) + 1;
    const needed = Math.max(base, Math.ceil((last + 1) / this.meta.cols));
    const rows = base + Math.ceil((needed - base) / 2) * 2;
    if (rows > this.rows) this.grow(rows);
  }

  /** One canvas invalidation for all roundels in an install. */
  end(): void {
    this.batching = false;
    if (this.dirty) { this.texture.needsUpdate = true; this.dirty = false; }
  }

  private invalidate(): void {
    if (this.batching) this.dirty = true;
    else this.texture.needsUpdate = true;
  }

  /** Copy decoded logos into the combined canvas once; finish pending monograms on failure. */
  async loadLogos(): Promise<void> {
    if (this.logos !== "wait") return;
    this.logos = "loading";
    let img: ImageBitmap | null = null;
    for (const url of [EMBLEMS_IMG, EMBLEMS_IMG_FALLBACK]) {
      try {
        const ri = await fetch(url);
        if (ri.ok && (ri.headers.get("content-type") ?? "").includes("image")) img = await createImageBitmap(await ri.blob(), { premultiplyAlpha: "none" });
      } catch (e) { console.warn(`[harbour] fleet: emblem logos unavailable from ${url}`, e); }
      if (img) break;
    }
    this.logos = "done";
    if (this.disposed) { img?.close(); return; }
    if (img) {
      this.batching = true;
      const rows = logoRows(this.meta);
      if (this.rows < rows + 1) this.grow(rows + 1);
      this.g.clearRect(0, 0, this.canvas.width, Math.min(img.height, rows * this.meta.slot));
      this.g.drawImage(img, 0, 0);
      img.close();
      this.painted = true;
      this.logoLoaded = true;
      this.invalidate();
      this.end();
    } else {
      this.batching = true;
      for (const [slot, c] of this.roundels) {
        if (slot < this.logoSlots) { this.drawRoundel(slot, c, true); this.invalidate(); }
      }
      this.end();
    }
  }

  /** Slot for a coin: its logo, or a monogram drawn on first request. -1 when the atlas is full. */
  slotFor(c: EmblemCoin): number {
    const hit = this.slots.get(c.id);
    if (hit != null) {
      const logo = hit < this.logoSlots;
      if (logo && this.logoLoaded) return hit;
      const old = this.roundels.get(hit);
      if (!old || old.symbol !== c.symbol || old.brandColor !== c.brandColor) {
        if (hit >= this.rows * this.meta.cols) this.grow(Math.floor(hit / this.meta.cols) + 2);
        this.roundels.set(hit, { ...c });
        this.drawRoundel(hit, c, !logo || this.logos === "done");
        this.invalidate();
      }
      return hit;
    }
    if (this.nextFree >= this.capacity) return -1;
    const s = this.nextFree++;
    if (s >= this.rows * this.meta.cols) this.grow(Math.floor(s / this.meta.cols) + 2);
    this.drawRoundel(s, c, true);
    this.slots.set(c.id, s);
    this.roundels.set(s, { ...c });
    this.invalidate();
    return s;
  }

  /** A taller canvas (the new row and a spare) with the old rows copied across; the texture re-uploads whole. */
  private grow(want: number): void {
    const rows = Math.min(this.capacity / this.meta.cols, want);
    const canvas = document.createElement("canvas");
    canvas.width = this.canvas.width;
    canvas.height = rows * this.meta.slot;
    const g = canvas.getContext("2d", { willReadFrequently: false })!;
    if (this.painted) g.drawImage(this.canvas, 0, 0); // blank initial reserve needs no full-canvas copy
    this.canvas.width = this.canvas.height = 0; // release the old backing store now
    this.canvas = canvas; this.g = g; this.rows = rows;
    this.grid.set(this.meta.cols, rows, 1 / this.meta.cols, 1 / rows);
    this.texture.dispose(); // the GL texture was allocated at the old size: the next upload allocates afresh
    this.texture.image = canvas;
    this.invalidate();
  }

  /** The coin's brand-colour roundel, lettered with its monogram or (a placeholder) plain. */
  private drawRoundel(slot: number, c: EmblemCoin, lettered: boolean): void {
    this.painted = true;
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
    if (!lettered) { g.restore(); return; }
    const letters = monogram(c.symbol || c.id);
    const size = letters.length <= 1 ? 0.5 : letters.length === 2 ? 0.4 : letters.length === 3 ? 0.3 : 0.24;
    g.fillStyle = ink;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${Math.round(S * size)}px Georgia, "Times New Roman", serif`;
    g.fillText(letters, cx, cy + S * 0.025, S * 0.66);
    g.restore();
  }

  dispose(): void {
    this.disposed = true;
    this.texture.dispose();
  }
}

/** Rows the logo tiles fill (several coin ids may share one logo's slot). */
function logoRows(meta: AtlasMeta): number {
  let top = -1;
  for (const s of Object.values(meta.ids)) top = Math.max(top, s);
  return Math.ceil((top + 1) / meta.cols);
}

/** Up to 4 letters of a symbol, dropping a trailing currency suffix ("USD", "EUR") when the rest is ≥ 2 letters. */
export function monogram(symbol: string): string {
  const s = symbol.toUpperCase().replace(/[^A-Z0-9$€+]/g, "");
  if (!s) return "?";
  const stem = s.replace(/(USD|EUR|USDC|USDT)$/, "");
  const pick = stem.length >= 2 ? stem : s;
  return pick.slice(0, 4);
}
