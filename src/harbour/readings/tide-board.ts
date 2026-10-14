import * as THREE from "three";
import type { FlowsReading } from "../model/types";

/**
 * THE CUSTOMS HOUSE TIDE BOARD: 24 closed hours of net mint (sea-green, above the brass line) and net
 * burn (rust, below), painted on a weathered chart-paper face mounted on island.glb's 'tide_board'
 * (UV u = local hour 0..24, v down). A record, not live traffic (research/04 §7): it is a clock face
 * read left→right, the brass cursor stands at the current hour, and bars fade toward the paper the
 * further they sit behind it. A partial-valuation hour (netUsd null) is a hollow ring on the line,
 * never a zero. The scale is symmetric, the largest |net| of the window rounded up to $50M steps, with
 * faint chart rules, heights on a signed-sqrt scale (boardHeight); the board is pure shape, the numbers
 * live in the panel.
 *
 * Painted for distance: it is read at ~120 px wide from the heart view, so every mark is bold
 * (thin lines would vanish in the mips), the bars carry a dark ink outline, the paper is light so the
 * board reads as a lit notice among the dark arcade, and the header carries a carved tide glyph
 * (a wave over up/down chevrons) instead of a word.
 */
export const MINT_HEX = "#1E9C74";
export const BURN_HEX = "#C2522A";
const MINT_STALE = "#7F978C", BURN_STALE = "#9C8577";
const W = 1536, Hh = 528;
const SCALE_STEP_USD = 50e6;
/** Plot area (fractions of the board height): a header strip carries the glyph above it. */
const PLOT_TOP = 0.25, PLOT_BOT = 0.95;
const INK = "#2A2620";
const PAPER = "#E9DEC2";

/** Symmetric board scale: max |net| rounded up to SCALE_STEP_USD, at least one step. */
export function boardScaleUsd(flows: Pick<FlowsReading, "hourly">): number {
  let m = 0;
  for (const h of flows.hourly) if (h.netUsd != null) m = Math.max(m, Math.abs(h.netUsd));
  return Math.max(SCALE_STEP_USD, Math.ceil(m / SCALE_STEP_USD) * SCALE_STEP_USD);
}

/**
 * Painted bar height −1..1 for a net flow: signed square root of the share of the scale, so a quiet
 * hour still stands visibly off the line beside a big one (order and sign are kept; the panel has
 * the numbers).
 */
export function boardHeight(netUsd: number, scaleUsd: number): number {
  const x = Math.min(1, Math.abs(netUsd) / scaleUsd);
  return netUsd < 0 ? -Math.sqrt(x) : Math.sqrt(x);
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
    this.bg = paintPaper();
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.flipY = false;             // glTF UVs: v = 0 is the top of the board
    this.texture.anisotropy = anisotropy;
    this.texture.generateMipmaps = true;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.material = new THREE.MeshStandardMaterial({
      map: this.texture, emissiveMap: this.texture, emissive: new THREE.Color(1, 0.93, 0.8), emissiveIntensity: 0,
      roughness: 0.82, metalness: 0, side: THREE.DoubleSide,
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
        this.target[s] = h.netUsd == null ? Number.NaN : boardHeight(h.netUsd, scale);
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
  update(dt: number, lampGlow: number, night: number): void {
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
    // a touch of self-light by day keeps the paper reading in the arcade's shade; after dark the
    // board is lamplit (warm), legible but well under the windows
    this.material.emissiveIntensity = 0.16 * (1 - night) + 0.02 + 0.05 * lampGlow;
    if (this.dirty) { this.paint(); this.dirty = false; }
  }

  private paint(): void {
    const g = this.g;
    g.globalAlpha = 1;
    g.drawImage(this.bg, 0, 0);
    this.texture.needsUpdate = true;
    const slotW = W / 24;
    const top = Hh * PLOT_TOP, bot = Hh * PLOT_BOT;
    const base = (top + bot) / 2;
    const half = (bot - top) / 2 - 10;
    const st = this.staleS;
    // stale: the paper yellows and the inks fade
    if (st > 0.01) { g.fillStyle = `rgba(150,128,84,${0.22 * st})`; g.fillRect(0, 0, W, Hh); }
    const dim = 1 - 0.5 * st;

    // chart rules: half and full scale (dashed ink), the six-hour watches as bold ticks on the line
    g.fillStyle = `rgba(42,38,32,${0.16 * dim})`;
    for (const f of [-1, -0.5, 0.5, 1]) {
      const y = Math.round(base - f * half);
      for (let x = slotW * 0.3; x < W - slotW * 0.3; x += 28) g.fillRect(x, y - 2, 16, 4);
    }
    // current-hour column: a warm wash behind the newest hour (the clock face's "now")
    if (this.nowSlot >= 0 && this.available) {
      g.fillStyle = `rgba(214,160,64,${0.18 * dim})`;
      g.fillRect(this.nowSlot * slotW, top - 6, slotW * (this.nowFrac + 0.02), bot - top + 12);
    }

    if (!this.available) {
      // unknown: a dashed ink line, no bars, the cursor stowed — never a calm zero
      g.fillStyle = `rgba(42,38,32,${0.6 * dim})`;
      for (let x = slotW * 0.3; x < W - slotW * 0.3; x += 56) g.fillRect(x, base - 5, 30, 10);
      return;
    }

    for (let s = 0; s < 24; s++) {
      const age = this.age[s];
      if (age < 0) continue;
      const v = this.shown[s];
      const x = s * slotW;
      const recency = 1 - age / 24;
      // older hours fade toward the paper (alpha over a light face), the newest stand in full ink
      const a = (0.42 + 0.58 * recency * recency) * dim;
      if (Number.isNaN(v)) {
        g.globalAlpha = a;
        g.strokeStyle = INK; g.lineWidth = 9;
        g.beginPath(); g.arc(x + slotW / 2, base, slotW * 0.22, 0, Math.PI * 2); g.stroke();
        g.globalAlpha = 1;
        continue;
      }
      const h = v * half;
      if (Math.abs(h) < 1) continue;
      const bx = x + slotW * 0.1, bw = slotW * 0.8;
      const up = h > 0;
      const y0 = up ? base - h : base, bh = Math.abs(h);
      g.globalAlpha = a;
      // ink outline (reads at distance), then the painted body and a light cap on the outer end
      g.fillStyle = INK;
      g.fillRect(bx - 5, y0 - (up ? 5 : 0), bw + 10, bh + 5);
      g.fillStyle = st > 0.5 ? (up ? MINT_STALE : BURN_STALE) : up ? MINT_HEX : BURN_HEX;
      g.fillRect(bx, y0, bw, bh);
      g.fillStyle = up ? "rgba(190,250,222,0.85)" : "rgba(255,206,170,0.8)";
      const capH = Math.min(14, bh * 0.3);
      g.fillRect(bx, up ? y0 : y0 + bh - capH, bw, capH);
      // a darker shade down one side: painted bars, not flat UI
      g.fillStyle = "rgba(0,0,0,0.16)";
      g.fillRect(bx + bw * 0.7, y0, bw * 0.3, bh);
      g.globalAlpha = 1;
    }

    // the brass baseline: a bold rule with a dark keel and a bright top edge
    const lx0 = slotW * 0.12, lx1 = W - slotW * 0.12;
    g.fillStyle = `rgba(74,52,20,${dim})`;
    g.fillRect(lx0, base - 10, lx1 - lx0, 20);
    g.fillStyle = brass(dim);
    g.fillRect(lx0, base - 7, lx1 - lx0, 13);
    g.fillStyle = `rgba(255,236,170,${0.85 * dim})`;
    g.fillRect(lx0, base - 7, lx1 - lx0, 4);
    // the six-hour watches: brass studs on the line
    for (let hh = 0; hh <= 24; hh += 6) {
      const cx = Math.min(lx1 - 10, Math.max(lx0 + 10, hh * slotW));
      stud(g, cx, base, 15, dim);
    }

    // brass cursor at the current hour (the board is a clock: the oldest bar sits just right of it)
    if (this.nowSlot >= 0) {
      const cx = Math.round((this.nowSlot + this.nowFrac) * slotW);
      g.fillStyle = `rgba(60,40,14,${dim})`;
      g.fillRect(cx - 9, top - 14, 18, bot - top + 24);
      g.fillStyle = brass(dim);
      g.fillRect(cx - 6, top - 14, 12, bot - top + 24);
      g.fillStyle = `rgba(255,236,170,${0.8 * dim})`;
      g.fillRect(cx - 6, top - 14, 4, bot - top + 24);
      // pointers top and bottom
      g.fillStyle = brass(dim);
      g.strokeStyle = `rgba(60,40,14,${dim})`; g.lineWidth = 5;
      for (const [y, d] of [[top - 16, 1], [bot + 12, -1]] as const) {
        g.beginPath(); g.moveTo(cx - 26, y - d * 18); g.lineTo(cx + 26, y - d * 18); g.lineTo(cx, y + d * 10); g.closePath();
        g.fill(); g.stroke();
      }
    }
  }

  dispose(): void { this.texture.dispose(); this.material.dispose(); }
}

function brass(a: number): string { return `rgba(206,158,64,${a})`; }

function stud(g: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  g.fillStyle = `rgba(60,40,14,${a})`;
  g.beginPath(); g.arc(x, y, r + 4, 0, Math.PI * 2); g.fill();
  const grd = g.createRadialGradient(x - r * 0.35, y - r * 0.35, 1, x, y, r);
  grd.addColorStop(0, `rgba(255,238,180,${a})`);
  grd.addColorStop(1, `rgba(176,124,40,${a})`);
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}

/** The static face: weathered chart paper, a painted header strip and the carved tide glyph. */
function paintPaper(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = W; c.height = Hh;
  const g = c.getContext("2d")!;
  let seed = 1337;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, W, Hh);
  // paper tooth and foxing: soft warm stains, a few darker spots
  for (let i = 0; i < 220; i++) {
    const x = rnd() * W, y = rnd() * Hh, r = 24 + rnd() * 140;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    const warm = rnd() < 0.5;
    grd.addColorStop(0, warm ? `rgba(176,140,82,${0.03 + rnd() * 0.05})` : `rgba(255,252,236,${0.04 + rnd() * 0.06})`);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 60; i++) {
    const x = rnd() * W, y = rnd() * Hh, r = 2 + rnd() * 6;
    g.fillStyle = `rgba(120,86,44,${0.08 + rnd() * 0.12})`;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  // faint blue-grey chart grid: one rule per hour, the plot's quarter lines
  const slotW = W / 24;
  g.fillStyle = "rgba(70,96,110,0.10)";
  for (let h = 1; h < 24; h++) g.fillRect(Math.round(h * slotW) - 1.5, Hh * PLOT_TOP, 3, Hh * (PLOT_BOT - PLOT_TOP));
  // header strip: painted harbour green with a cream pin-line, the glyph carved into a brass roundel
  const hb = Hh * (PLOT_TOP - 0.05);
  g.fillStyle = "#264A40";
  g.fillRect(0, 0, W, hb);
  g.fillStyle = "rgba(233,222,194,0.75)";
  g.fillRect(0, hb - 10, W, 4);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(0, hb - 6, W, 6);
  // a little brushed texture on the strip
  for (let i = 0; i < 400; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd() * 0.035})`;
    g.fillRect(rnd() * W, rnd() * (hb - 12), 30 + rnd() * 120, 2);
  }
  // chevron rows flanking the roundel: rising (mint) to the left, falling (rust) to the right
  const cy = hb / 2 - 4;
  for (let i = 0; i < 3; i++) {
    chevron(g, W / 2 - 170 - i * 80, cy, 28, 1, "rgba(120,214,176,0.9)");
    chevron(g, W / 2 + 170 + i * 80, cy, 28, -1, "rgba(232,140,98,0.9)");
  }
  glyph(g, W / 2, cy + 6, hb * 0.6);
  // weathering: darker, warmer edges and corners; a few scuffs
  const v = g.createRadialGradient(W / 2, Hh * 0.55, Hh * 0.35, W / 2, Hh * 0.55, W * 0.6);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(90,62,30,0.35)");
  g.fillStyle = v;
  g.fillRect(0, 0, W, Hh);
  g.strokeStyle = "rgba(60,44,26,0.55)"; g.lineWidth = 14;
  g.strokeRect(7, 7, W - 14, Hh - 14);
  for (let i = 0; i < 30; i++) {
    g.strokeStyle = `rgba(255,250,230,${0.06 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 2;
    const x = rnd() * W, y = Hh * PLOT_TOP + rnd() * Hh * 0.7;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + 20 + rnd() * 60, y + (rnd() - 0.5) * 12); g.stroke();
  }
  return c;
}

function chevron(g: CanvasRenderingContext2D, x: number, y: number, s: number, dir: 1 | -1, col: string): void {
  g.strokeStyle = col; g.lineWidth = 9; g.lineCap = "round"; g.lineJoin = "round";
  g.beginPath(); g.moveTo(x - s, y + dir * s * 0.5); g.lineTo(x, y - dir * s * 0.5); g.lineTo(x + s, y + dir * s * 0.5); g.stroke();
}

/** The carved title glyph: a brass roundel with two cresting waves (the tide). */
function glyph(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.fillStyle = "#3A2A12";
  g.beginPath(); g.arc(x, y, r + 6, 0, Math.PI * 2); g.fill();
  const grd = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 2, x, y, r);
  grd.addColorStop(0, "#F6DC94");
  grd.addColorStop(1, "#A8762C");
  g.fillStyle = grd;
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  // carved lines: dark groove with a light lower lip
  const carve = (draw: () => void) => {
    g.lineCap = "round"; g.lineJoin = "round";
    g.save(); g.translate(0, 2.5); g.strokeStyle = "rgba(255,240,190,0.7)"; g.lineWidth = 8; draw(); g.restore();
    g.strokeStyle = "#3A2A12"; g.lineWidth = 8; draw();
  };
  const s = r * 0.66;
  for (const dy of [-0.3, 0.32]) {
    carve(() => {
      const yy = y + dy * s;
      g.beginPath();
      g.moveTo(x - s, yy + s * 0.12);
      g.bezierCurveTo(x - s * 0.6, yy - s * 0.38, x - s * 0.15, yy - s * 0.38, x, yy + s * 0.08);
      g.bezierCurveTo(x + s * 0.15, yy + s * 0.42, x + s * 0.6, yy + s * 0.42, x + s, yy - s * 0.1);
      g.stroke();
    });
  }
}
