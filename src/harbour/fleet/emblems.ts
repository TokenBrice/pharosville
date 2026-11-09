import * as THREE from "three";
import type { AssetStore } from "../engine/assets";
import { abortable, transport } from "../engine/transport";
import type { PreparationService } from "../engine/types";
import { runtimeLogoPath } from "../../lib/logos";
import { isAbort } from "../engine/failure";

/**
 * Sail-emblem atlas: decoded logos and generated monograms share one canvas and mip chain.
 * Runtime slots are 96 px; two 256 px inspection tiles restore the full mark at close range.
 * Logical logo/letter slots, filtering and UV orientation stay shared by sails, covers and flags.
 *
 * `load` reads only the slot map. Until `loadLogos` completes, logo slots show a plain brand-colour
 * roundel (a monogram if neither image loads). Installed monograms repaint only when their inputs change.
 * E04 (O5-I6): a coin without a logo carries sail lettering, not a brand-colour disc: its slot (from `letterSlot` on)
 * holds the letters alone as an alpha mask, inked by the shaders from the cloth they are printed on.
 */
export const EMBLEMS_JSON = "/harbour/emblems.json";
export const EMBLEMS_IMG = "/harbour/emblems.avif";
export const EMBLEMS_IMG_FALLBACK = "/harbour/emblems.webp";

interface AtlasMeta { slot: number; cols: number; width: number; height: number; ids: Record<string, number> }

export interface EmblemCoin { id: string; symbol: string; brandColor: string; logo?: string | null }
export const EMBLEM_SLOT_PX = 96, HERO_TILE_PX = 256;

export class EmblemAtlas {
  texture: THREE.CanvasTexture;
  readonly uniform: THREE.IUniform<THREE.Texture>;
  readonly heroUniform: THREE.IUniform<THREE.Texture> = { value: new THREE.Texture() };
  readonly heroSlots = { value: new THREE.Vector2(-1, -1) };
  private heroAbort: AbortController | null = null;
  private heroKey = "";
  private logoTask: Promise<void> | null = null;
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

  private constructor(private readonly meta: AtlasMeta, private readonly extraSlots: number, private readonly signal?: AbortSignal) {
    const rowsLogos = logoRows(meta);
    this.logoSlots = rowsLogos * meta.cols;
    this.capacity = Math.max(1, Math.min(meta.cols, rowsLogos + Math.ceil(extraSlots / meta.cols) + 1)) * meta.cols;
    this.rows = 1; // no unused logo backing store / upload before the first fleet install
    this.canvas = document.createElement("canvas");
    this.canvas.width = meta.cols * EMBLEM_SLOT_PX;
    this.canvas.height = this.rows * EMBLEM_SLOT_PX;
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
    this.uniform = { value: t };
  }

  /** The slot map only (small); the logo image comes later through loadLogos. */
  static async load(assets: AssetStore, extraSlots: number): Promise<EmblemAtlas> {
    let meta: AtlasMeta = { slot: 128, cols: 32, width: 4096, height: 128, ids: {} };
    try {
      meta = await assets.json<AtlasMeta>(EMBLEMS_JSON);
    } catch (e) { if (isAbort(e) || assets.signal?.aborted) throw e; console.warn("[harbour] fleet: emblem atlas unavailable, monograms only", e); }
    assets.signal?.throwIfAborted();
    return new EmblemAtlas(meta, extraSlots, assets.signal);
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
  async loadLogos(preparation?: PreparationService): Promise<void> {
    if (!this.logoTask) this.logoTask = this.decodeLogos(preparation);
    return this.logoTask;
  }

  private async decodeLogos(preparation?: PreparationService): Promise<void> {
    if (this.logos !== "wait" || this.disposed || this.signal?.aborted) return;
    this.logos = "loading";
    let img: ImageBitmap | null = null;
    for (const url of [EMBLEMS_IMG, EMBLEMS_IMG_FALLBACK]) {
      try {
        img = await transport(this.signal, async (signal) => {
          const ri = await fetch(url, { signal });
          if (!ri.ok || !(ri.headers.get("content-type") ?? "").includes("image")) return null;
          const blob = await ri.blob();
          signal.throwIfAborted();
          return abortable(createImageBitmap(blob, { premultiplyAlpha: "none" }), signal, (image) => image.close());
        }, (image) => image?.close());
      } catch (e) { if (isAbort(e) || this.signal?.aborted) return; console.warn(`[harbour] fleet: emblem logos unavailable from ${url}`, e); }
      if (img) break;
    }
    this.logos = "done";
    if (this.disposed || this.signal?.aborted) { img?.close(); return; }
    if (img && preparation) {
      try {
        if (await this.stageLogos(img, preparation)) { img.close(); return; }
      } catch (error) {
        if (isAbort(error) || this.signal?.aborted) { img.close(); return; }
        console.warn("[harbour] fleet: staged emblem logos failed, painting them in place", error);
      }
      if (this.disposed || this.signal?.aborted) { img.close(); return; }
    }
    if (img) {
      this.batching = true;
      const rows = logoRows(this.meta);
      if (this.rows < rows + 1) this.grow(rows + 1);
      this.g.clearRect(0, 0, this.canvas.width, rows * EMBLEM_SLOT_PX);
      this.g.drawImage(img, 0, 0, this.meta.width, this.meta.height, 0, 0, this.canvas.width, rows * EMBLEM_SLOT_PX);
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
    if (preparation && !this.disposed) await preparation.stageTexture(this.texture, { signal: this.signal });
  }

  /**
   * The logos into a detached copy of the atlas, one tile row per preparation slice (a canvas rasterises what a
   * task drew when the task ends: one row keeps that small), then a staged upload one tile row per slice too (the
   * whole canvas was one 54 ms texSubImage2D at CPU ×4) and one swap. The live atlas keeps its roundels until the
   * swap, and no frame uploads the whole canvas. Same pixels as one full-size draw: each 128 px source row lands on
   * its own 96 px row (the 0.75 bilinear taps never leave a row).
   */
  private async stageLogos(img: ImageBitmap, preparation: PreparationService): Promise<boolean> {
    const rows = logoRows(this.meta), signal = this.signal;
    const fork = new EmblemAtlas(this.meta, this.extraSlots, signal);
    let committed = false;
    try {
      fork.grow(Math.max(this.rows, rows + 1));
      const srcRow = this.meta.height / rows;
      // monogram rows first, copied as they are; then each logo row over the fork's clear canvas
      for (let row = rows; row < this.rows; row++) {
        await preparation.submit(() => {
          const y = row * EMBLEM_SLOT_PX;
          fork.g.drawImage(this.canvas, 0, y, this.canvas.width, EMBLEM_SLOT_PX, 0, y, fork.canvas.width, EMBLEM_SLOT_PX);
        }, { signal });
      }
      for (let row = 0; row < rows; row++) {
        await preparation.submit(() => {
          fork.g.drawImage(img, 0, row * srcRow, this.meta.width, srcRow, 0, row * EMBLEM_SLOT_PX, fork.canvas.width, EMBLEM_SLOT_PX);
        }, { signal });
      }
      fork.texture.needsUpdate = true;
      await preparation.stageTextureRows(fork.texture, EMBLEM_SLOT_PX, { signal });
      if (this.disposed || signal?.aborted) return false;
      const old = this.texture, canvas = this.canvas;
      this.texture = fork.texture; this.uniform.value = fork.texture;
      this.canvas = fork.canvas; this.g = fork.g; this.rows = fork.rows; this.grid.copy(fork.grid);
      this.painted = true; this.logoLoaded = true;
      committed = true;
      old.dispose(); canvas.width = canvas.height = 0;
      fork.heroUniform.value.dispose();
      return true;
    } finally { if (!committed) fork.dispose(); }
  }

  /** The first monogram slot: marks from here on are lettering (an alpha mask), not printed logos. */
  get letterSlot(): number { return this.logoSlots; }

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
        if (logo) this.drawRoundel(hit, c, this.logos === "done"); else this.drawLetters(hit, c);
        this.invalidate();
      }
      return hit;
    }
    if (this.nextFree >= this.capacity) return -1;
    const s = this.nextFree++;
    if (s >= this.rows * this.meta.cols) this.grow(Math.floor(s / this.meta.cols) + 2);
    this.drawLetters(s, c);
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
    canvas.height = rows * EMBLEM_SLOT_PX;
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
    const S = EMBLEM_SLOT_PX, g = this.g;
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

  /**
   * E04 (O5-I6): a monogram as sail lettering: the letters alone, white on a clear tile (an alpha mask), a little
   * larger than they sat on the old disc. Shaders ink them from the cloth: cream on dark cloth, a deep shade of it on
   * light. The symbol is the coin's identity; the brand colour stays on her cloth and flag.
   */
  private drawLetters(slot: number, c: EmblemCoin, g = this.g, S = EMBLEM_SLOT_PX, x0 = (slot % this.meta.cols) * S, y0 = Math.floor(slot / this.meta.cols) * S): void {
    this.painted = true;
    const letters = monogram(c.symbol || c.id);
    const size = letters.length <= 1 ? 0.56 : letters.length === 2 ? 0.46 : letters.length === 3 ? 0.35 : 0.28;
    g.save();
    g.clearRect(x0, y0, S, S);
    g.fillStyle = "#FFFFFF";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `700 ${Math.round(S * size)}px Georgia, "Times New Roman", serif`;
    g.fillText(letters, x0 + S / 2, y0 + S / 2 + S * 0.025, S * 0.78);
    g.restore();
  }

  /** Detached atlas delta: row copies/paint/upload finish before its single publication. */
  async prepareCoins(coins: readonly EmblemCoin[], preparation?: PreparationService, signal?: AbortSignal): Promise<{ slots: Map<string, number>; commit(): void; dispose(): void }> {
    if (this.logoTask) await abortable(this.logoTask, signal);
    signal?.throwIfAborted();
    const fork = new EmblemAtlas(this.meta, this.extraSlots, this.signal), slots = new Map<string, number>();
    let committed = false;
    const dispose = () => { if (!committed) fork.dispose(); };
    try {
      fork.slots.clear(); for (const [id, slot] of this.slots) fork.slots.set(id, slot);
      for (const [slot, coin] of this.roundels) fork.roundels.set(slot, coin);
      fork.nextFree = this.nextFree; fork.logos = this.logos; fork.logoLoaded = this.logoLoaded;
      fork.begin(coins);
      if (fork.rows < this.rows) fork.grow(this.rows);
      let row = 0, cursor = 0;
      const slice = (deadline: number) => {
        signal?.throwIfAborted();
        do {
          if (row < this.rows) {
            const y = row++ * EMBLEM_SLOT_PX;
            fork.g.drawImage(this.canvas, 0, y, this.canvas.width, EMBLEM_SLOT_PX, 0, y, this.canvas.width, EMBLEM_SLOT_PX);
            fork.painted = this.painted;
          } else if (cursor < coins.length) {
            const coin = coins[cursor++]; slots.set(coin.id, fork.slotFor(coin));
          }
        } while ((row < this.rows || cursor < coins.length) && performance.now() < deadline);
      };
      while (row < this.rows || cursor < coins.length) {
        if (preparation) await preparation.submit(slice, { signal }); else slice(Infinity);
      }
      fork.end();
      if (preparation) await preparation.stageTexture(fork.texture, { signal });
      signal?.throwIfAborted();
      return { slots, dispose, commit: () => {
        signal?.throwIfAborted();
        if (this.disposed) throw new DOMException("Atlas disposed", "AbortError");
        const old = this.texture, canvas = this.canvas;
        this.texture = fork.texture; this.uniform.value = fork.texture;
        this.canvas = fork.canvas; this.g = fork.g; this.rows = fork.rows; this.grid.copy(fork.grid);
        this.slots.clear(); for (const [id, slot] of fork.slots) this.slots.set(id, slot);
        this.roundels.clear(); for (const [slot, coin] of fork.roundels) this.roundels.set(slot, coin);
        this.nextFree = fork.nextFree; this.painted = fork.painted;
        committed = true; old.dispose(); canvas.width = canvas.height = 0;
        fork.heroUniform.value.dispose();
      } };
    } catch (error) { dispose(); throw error; }
  }

  /** Two inspection tiles cover hover and selection/search; stale decodes never replace current identity. */
  async setHeroes(coins: readonly EmblemCoin[], preparation?: PreparationService): Promise<void> {
    const active = coins.filter((coin, i) => coins.findIndex((other) => other.id === coin.id) === i).slice(0, 2);
    const key = active.map((coin) => `${coin.id}:${coin.symbol}:${coin.brandColor}:${coin.logo ?? ""}`).join("|");
    if (key === this.heroKey || this.disposed) return;
    this.heroKey = key; this.heroAbort?.abort();
    const controller = this.heroAbort = new AbortController();
    const signal = this.signal ? AbortSignal.any([this.signal, controller.signal]) : controller.signal;
    if (!active.length) { this.heroSlots.value.set(-1, -1); this.heroUniform.value.dispose(); this.heroUniform.value = new THREE.Texture(); return; }
    const canvas = document.createElement("canvas");
    canvas.width = HERO_TILE_PX * 2; canvas.height = HERO_TILE_PX;
    const g = canvas.getContext("2d")!, texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace; texture.premultiplyAlpha = true; texture.anisotropy = 4;
    const slots = new THREE.Vector2(-1, -1);
    try {
      for (let i = 0; i < active.length; i++) {
        const coin = active[i], slot = this.slots.get(coin.id) ?? -1, x = i * HERO_TILE_PX;
        if (slot < 0) continue;
        slots.setComponent(i, slot);
        let image: ImageBitmap | null = null;
        if (coin.logo?.startsWith("/logos/")) {
          try {
            image = await transport(signal, async (lifetime) => {
              const response = await fetch(runtimeLogoPath(coin.logo!), { signal: lifetime });
              if (!response.ok) return null;
              return abortable(createImageBitmap(await response.blob(), { premultiplyAlpha: "none" }), lifetime, (bitmap) => bitmap.close());
            }, (bitmap) => bitmap?.close());
          } catch (error) { if (signal.aborted) throw error; }
        }
        signal.throwIfAborted();
        if (image) {
          try {
            const S = HERO_TILE_PX, cx = x + S / 2, cy = S / 2;
            g.beginPath(); g.arc(cx, cy, S * (62.6 / 128), 0, Math.PI * 2); g.fillStyle = "#BDB2A0"; g.fill();
            g.beginPath(); g.arc(cx, cy, S * (59.6 / 128), 0, Math.PI * 2); g.fillStyle = "#FFFFFF"; g.fill();
            g.save(); g.beginPath(); g.arc(cx, cy, S * (52 / 128), 0, Math.PI * 2); g.clip();
            const scale = S * (104 / 128) / Math.max(image.width, image.height);
            g.drawImage(image, cx - image.width * scale / 2, cy - image.height * scale / 2, image.width * scale, image.height * scale);
            g.restore();
          } finally { image.close(); }
        } else if (slot >= this.logoSlots) this.drawLetters(slot, coin, g, HERO_TILE_PX, x, 0);
        else g.drawImage(this.canvas, (slot % this.meta.cols) * EMBLEM_SLOT_PX, Math.floor(slot / this.meta.cols) * EMBLEM_SLOT_PX, EMBLEM_SLOT_PX, EMBLEM_SLOT_PX, x, 0, HERO_TILE_PX, HERO_TILE_PX);
      }
      if (preparation) await preparation.stageTexture(texture, { signal });
      signal.throwIfAborted();
      const old = this.heroUniform.value;
      this.heroUniform.value = texture; this.heroSlots.value.copy(slots); old.dispose();
      const oldCanvas = old.image as HTMLCanvasElement | undefined;
      if (oldCanvas?.getContext) oldCanvas.width = oldCanvas.height = 0;
    } catch (error) { texture.dispose(); canvas.width = canvas.height = 0; if (!isAbort(error)) throw error; }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.heroAbort?.abort();
    this.heroUniform.value.dispose();
    this.texture.dispose();
    this.canvas.width = this.canvas.height = 0;
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
