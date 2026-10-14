import * as THREE from "three";
import type { FlowsReading } from "../model/types";

/**
 * THE CUSTOMS HOUSE TIDE BOARD: 24 closed hours of net mint (sea-green, above the line) and net
 * burn (rust, below), painted on the slate of island.glb's 'tide_board' (UV u = local hour 0..24,
 * v down). A record, not live traffic (research/04 §7): it is a clock face read left→right, the
 * brass cursor stands at the current hour, and bars age dimmer the further they sit behind it.
 * A partial-valuation hour (netUsd null) is a hollow ring on the line, never a zero.
 * The scale is symmetric, the largest |net| of the window rounded up to $50M steps, with faint chalk
 * rules at half and full scale; the board is pure shape, the numbers live in the panel.
 */
export const MINT_HEX = "#43CC9A";
export const BURN_HEX = "#DE6A3A";
const W = 1536, Hh = 528;
const SCALE_STEP_USD = 50e6;
const PAD_Y = 0.08;

/** Symmetric board scale: max |net| rounded up to SCALE_STEP_USD, at least one step. */
export function boardScaleUsd(flows: Pick<FlowsReading, "hourly">): number {
  let m = 0;
  for (const h of flows.hourly) if (h.netUsd != null) m = Math.max(m, Math.abs(h.netUsd));
  return Math.max(SCALE_STEP_USD, Math.ceil(m / SCALE_STEP_USD) * SCALE_STEP_USD);
}

/** Slot of a closed hour on the board: its local hour of day. */
export function boardSlot(hourTs: number): number {
  return new Date(hourTs * 1000).getHours();
}

export class TideBoard {
  readonly texture: THREE.CanvasTexture;
  readonly material: THREE.MeshStandardMaterial;
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D;
  private readonly bg: HTMLCanvasElement;
  /** Shown / target bar heights (−1..1 of the scale) per hour slot; NaN = gap (null net). */
  private readonly shown = new Float32Array(24);
  private readonly target = new Float32Array(24);
  /** Age rank 0 (newest) … 23 (oldest) per slot, −1 = no bar. */
  private readonly age = new Int8Array(24).fill(-1);
  private nowSlot = -1;
  private nowFrac = 0;
  private stale = 0;
  private staleS = 0;
  private available = false;
  private dirty = true;

  constructor(anisotropy: number) {
    this.canvas = document.createElement("canvas");
    this.canvas.width = W; this.canvas.height = Hh;
    this.g = this.canvas.getContext("2d")!;
    this.bg = this.paintSlate();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;             // glTF UVs: v = 0 is the top of the board
    this.texture.anisotropy = anisotropy;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture, emissiveMap: this.texture, emissive: new THREE.Color(1, 1, 1), emissiveIntensity: 0,
      roughness: 0.9, metalness: 0, side: THREE.DoubleSide,
    });
    this.material.name = "hb_tide_board";
  }

  setFlows(flows: FlowsReading, nowMs: number): void {
    this.available = flows.available && flows.hourly.length > 0;
    this.stale = flows.stale ? 1 : 0;
    this.target.fill(0);
    this.age.fill(-1);
    if (this.available) {
      const scale = boardScaleUsd(flows);
      const n = flows.hourly.length;
      flows.hourly.forEach((h, i) => {
        const s = boardSlot(h.hourTs);
        this.target[s] = h.netUsd == null ? Number.NaN : Math.max(-1, Math.min(1, h.netUsd / scale));
        this.age[s] = n - 1 - i;
      });
    }
    this.setNow(nowMs);
    this.dirty = true;
  }

  setNow(nowMs: number): void {
    const d = new Date(nowMs);
    const slot = d.getHours();
    const frac = d.getMinutes() / 60;
    if (slot !== this.nowSlot || Math.abs(frac - this.nowFrac) > 1 / 30) { this.nowSlot = slot; this.nowFrac = frac; this.dirty = true; }
  }

  /** Eases the bars toward their targets (2–3 s), repainting only while something moves. */
  update(dt: number, lampGlow: number): void {
    const k = 1 - Math.exp(-dt * 1.6);
    for (let i = 0; i < 24; i++) {
      const t = this.target[i], s = this.shown[i];
      if (Number.isNaN(t)) { if (!Number.isNaN(s)) { this.shown[i] = Number.NaN; this.dirty = true; } continue; }
      const from = Number.isNaN(s) ? 0 : s;
      const v = Math.abs(t - from) < 1e-3 ? t : from + (t - from) * k;
      if (v !== s) { this.shown[i] = v; this.dirty = true; }
    }
    const st = this.staleS + (this.stale - this.staleS) * (1 - Math.exp(-dt * 0.8));
    if (Math.abs(st - this.staleS) > 1e-3) { this.staleS = st; this.dirty = true; }
    // luminous paint, lamplit at night: the bars stay legible after dark (the dark slate stays dark)
    this.material.emissiveIntensity = 0.06 + 0.4 * lampGlow;
    if (this.dirty) { this.paint(); this.dirty = false; }
  }

  private paintSlate(): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = W; c.height = Hh;
    const g = c.getContext("2d")!;
    g.fillStyle = "#17201D";
    g.fillRect(0, 0, W, Hh);
    // chalk-dust breakup: deterministic smudges, lighter toward the middle (wiped area)
    let seed = 1337;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 260; i++) {
      const x = rnd() * W, y = rnd() * Hh, r = 20 + rnd() * 120;
      const grd = g.createRadialGradient(x, y, 0, x, y, r);
      grd.addColorStop(0, `rgba(190,205,195,${0.012 + rnd() * 0.02})`);
      grd.addColorStop(1, "rgba(190,205,195,0)");
      g.fillStyle = grd;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const v = g.createRadialGradient(W / 2, Hh / 2, Hh * 0.2, W / 2, Hh / 2, W * 0.62);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.35)");
    g.fillStyle = v;
    g.fillRect(0, 0, W, Hh);
    return c;
  }

  private paint(): void {
    const g = this.g;
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    this.texture.needsUpdate = true;
    const slotW = W / 24;
    const base = Hh / 2;
    const half = Hh * (0.5 - PAD_Y);
    const dim = 1 - 0.55 * this.staleS;
    const chalk = (a: number) => `rgba(232,224,200,${a * dim})`;

    // faint chalk rules at half and full scale, hour ticks every 6 h
    g.fillStyle = chalk(0.10);
    for (const f of [-1, -0.5, 0.5, 1]) g.fillRect(slotW * 0.25, Math.round(base - f * half) - 1, W - slotW * 0.5, 2);
    g.fillStyle = chalk(0.35);
    for (let h = 0; h <= 24; h += 6) g.fillRect(Math.round(h * slotW) - 2, base - 18, 4, 36);
    g.fillStyle = chalk(0.22);
    for (let h = 1; h < 24; h++) if (h % 6) g.fillRect(Math.round(h * slotW) - 1.5, base - 8, 3, 16);

    if (!this.available) {
      // unknown: a dashed line, no bars — never a calm zero
      g.fillStyle = chalk(0.5);
      for (let x = slotW * 0.25; x < W - slotW * 0.25; x += 36) g.fillRect(x, base - 2, 18, 4);
      return;
    }

    for (let s = 0; s < 24; s++) {
      const age = this.age[s];
      if (age < 0) continue;
      const v = this.shown[s];
      const x = s * slotW;
      const recency = 1 - age / 24;
      const a = (0.5 + 0.5 * recency) * dim;
      if (Number.isNaN(v)) {
        g.strokeStyle = chalk(0.6 * a); g.lineWidth = 4;
        g.beginPath(); g.arc(x + slotW / 2, base, slotW * 0.16, 0, Math.PI * 2); g.stroke();
        continue;
      }
      const h = v * half;
      if (Math.abs(h) < 0.5) continue;
      const bx = x + slotW * 0.11, bw = slotW * 0.78;
      const top = h > 0 ? base - h : base, bh = Math.abs(h);
      g.globalAlpha = a;
      g.fillStyle = this.staleS > 0.5 ? (h > 0 ? "#6E8C80" : "#8E7466") : h > 0 ? MINT_HEX : BURN_HEX;
      g.fillRect(bx, top, bw, bh);
      // painted cap on the outer end (catches the light, reads the magnitude)
      g.fillStyle = h > 0 ? "rgba(214,255,236,0.55)" : "rgba(255,220,196,0.45)";
      g.fillRect(bx, h > 0 ? top : top + bh - 6, bw, 6);
      g.globalAlpha = 1;
    }

    // the line
    g.fillStyle = chalk(0.92);
    g.fillRect(slotW * 0.15, base - 2.5, W - slotW * 0.3, 5);

    // brass cursor at the current hour (the board is a clock: the oldest bar sits just right of it)
    if (this.nowSlot >= 0) {
      const cx = Math.round((this.nowSlot + this.nowFrac) * slotW);
      g.fillStyle = `rgba(232,184,92,${0.95 * dim})`;
      g.fillRect(cx - 3, Hh * 0.06, 6, Hh * 0.88);
      g.beginPath();
      g.moveTo(cx - 16, Hh * 0.035); g.lineTo(cx + 16, Hh * 0.035); g.lineTo(cx, Hh * 0.085); g.closePath(); g.fill();
    }
  }

  dispose(): void { this.texture.dispose(); this.material.dispose(); }
}
