import type { BoardSlot } from "./boards";

/**
 * The civic quarter's sign-writing (2D canvas, into the board atlas): the Registry's frieze, house flag and grade
 * board, the storm station's weather board, and the Harbourmaster's movers flags. Painted sign-board style: serif
 * capitals, gilt on dark grounds, so it belongs to the crafted-miniature world rather than to the UI.
 */

const SERIF = "Georgia, 'Times New Roman', serif";

function fit(ctx: CanvasRenderingContext2D, text: string, weight: string, size: number, maxW: number, min = 10): number {
  let s = size;
  ctx.font = `${weight} ${s}px ${SERIF}`;
  while (s > min && ctx.measureText(text).width > maxW) { s -= 1; ctx.font = `${weight} ${s}px ${SERIF}`; }
  return s;
}

/** Letter-spaced capitals centred on cx. */
function spaced(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, track: number): void {
  const chars = [...text];
  const w = chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + track * (chars.length - 1);
  let x = cx - w / 2;
  ctx.textAlign = "left";
  for (const c of chars) { ctx.fillText(c, x, y); x += ctx.measureText(c).width + track; }
}

/** The frieze over the portico: incised capitals on the marble entablature. */
export function paintFrieze(ctx: CanvasRenderingContext2D, s: BoardSlot): void {
  ctx.fillStyle = "#EDE6D8";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = "#3A3128";
  ctx.textBaseline = "middle";
  fit(ctx, "REGISTER  OF  SHIPPING", "600", Math.round(s.h * 0.72), s.w * 0.8);
  spaced(ctx, "REGISTER OF SHIPPING", s.x + s.w / 2, s.y + s.h * 0.54, s.h * 0.28);
}

/** An anchor glyph (stock, shank, ring, arms and flukes) centred at (cx, cy), height h. */
function anchor(ctx: CanvasRenderingContext2D, cx: number, cy: number, h: number, col: string): void {
  const r = h * 0.42;
  ctx.save();
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineCap = "round"; ctx.lineWidth = h * 0.075;
  ctx.beginPath(); ctx.moveTo(cx, cy - h * 0.36); ctx.lineTo(cx, cy + h * 0.44); ctx.stroke();                 // shank
  ctx.beginPath(); ctx.moveTo(cx - h * 0.24, cy - h * 0.26); ctx.lineTo(cx + h * 0.24, cy - h * 0.26); ctx.stroke(); // stock
  ctx.lineWidth = h * 0.05;
  ctx.beginPath(); ctx.arc(cx, cy - h * 0.43, h * 0.07, 0, Math.PI * 2); ctx.stroke();                       // ring
  ctx.lineWidth = h * 0.075;
  ctx.beginPath(); ctx.arc(cx, cy + h * 0.44 - r, r, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke();           // arms
  for (const sgn of [-1, 1]) {                                                                                 // flukes
    const a = Math.PI / 2 - sgn * Math.PI * 0.32, tx = cx + Math.cos(a) * r, ty = cy + h * 0.44 - r + Math.sin(a) * r;
    ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx + sgn * h * 0.1, ty - h * 0.16); ctx.lineTo(tx - sgn * h * 0.06, ty - h * 0.02); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

/** The Registry's house flag: a deep-blue ensign, a gilt anchor over an open ledger. */
export function paintRegisterFlag(ctx: CanvasRenderingContext2D, s: BoardSlot): void {
  ctx.fillStyle = "#1D3767";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = "#E1B649";
  ctx.fillRect(s.x, s.y + s.h * 0.08, s.w, s.h * 0.035);
  ctx.fillRect(s.x, s.y + s.h * 0.885, s.w, s.h * 0.035);
  const cx = s.x + s.w * 0.55, cy = s.y + s.h * 0.5, bw = s.h * 0.62;
  // the open ledger behind the anchor
  ctx.fillStyle = "#F2E8CF";
  ctx.beginPath();
  ctx.moveTo(cx, cy + s.h * 0.2); ctx.lineTo(cx - bw / 2, cy + s.h * 0.12); ctx.lineTo(cx - bw / 2, cy - s.h * 0.16); ctx.lineTo(cx, cy - s.h * 0.1);
  ctx.lineTo(cx + bw / 2, cy - s.h * 0.16); ctx.lineTo(cx + bw / 2, cy + s.h * 0.12); ctx.closePath(); ctx.fill();
  anchor(ctx, cx, cy, s.h * 0.62, "#E1B649");
}

export const GRADE_ORDER = ["A", "B", "C", "D", "F"] as const;
const GRADE_COL: Record<string, string> = { A: "#2E7D4F", B: "#2F78A6", C: "#C99A2A", D: "#D06A26", F: "#AE2F28" };

/** The grade board: a painted shield per safety grade, its count under it, the unrated in a footnote. */
export function paintGradeBoard(ctx: CanvasRenderingContext2D, s: BoardSlot, tally: ReadonlyMap<string, number> | null): void {
  ctx.fillStyle = "#1B3A33";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = "#C99A3E"; ctx.lineWidth = 6;
  ctx.strokeRect(s.x + 10, s.y + 10, s.w - 20, s.h - 20);
  ctx.fillStyle = "#E8C46A"; ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(s.h * 0.085)}px ${SERIF}`;
  spaced(ctx, "SAFETY GRADES", s.x + s.w / 2, s.y + s.h * 0.12, s.h * 0.025);
  const n = GRADE_ORDER.length, cw = (s.w - 60) / n;
  GRADE_ORDER.forEach((g, i) => {
    const cx = s.x + 30 + cw * (i + 0.5), top = s.y + s.h * 0.22, sw = cw * 0.66, sh = s.h * 0.5;
    // a heater shield
    ctx.beginPath();
    ctx.moveTo(cx - sw / 2, top); ctx.lineTo(cx + sw / 2, top); ctx.lineTo(cx + sw / 2, top + sh * 0.5);
    ctx.quadraticCurveTo(cx + sw / 2, top + sh * 0.86, cx, top + sh);
    ctx.quadraticCurveTo(cx - sw / 2, top + sh * 0.86, cx - sw / 2, top + sh * 0.5);
    ctx.closePath();
    ctx.fillStyle = GRADE_COL[g]; ctx.fill();
    ctx.lineWidth = 5; ctx.strokeStyle = "#E1B649"; ctx.stroke();
    ctx.fillStyle = "#FBF6EA"; ctx.textAlign = "center";
    ctx.font = `700 ${Math.round(sh * 0.56)}px ${SERIF}`;
    ctx.fillText(g, cx, top + sh * 0.44);
    const count = tally ? String(tally.get(g) ?? 0) : "—";
    ctx.fillStyle = "#F3EBD6";
    ctx.font = `600 ${Math.round(s.h * 0.15)}px ${SERIF}`;
    ctx.fillText(count, cx, s.y + s.h * 0.85);
  });
  if (tally?.get("—")) {
    ctx.fillStyle = "#B9C2B8"; ctx.textAlign = "right";
    ctx.font = `italic ${Math.round(s.h * 0.055)}px ${SERIF}`;
    ctx.fillText(`unrated ${tally.get("—")}`, s.x + s.w - 26, s.y + s.h * 0.12);
  }
}

/** DEWS level (0 Calm … 4 Danger) → the band written on the weather board. */
export const DEWS_WORD = ["CALM", "WATCH", "ALERT", "WARNING", "DANGER"] as const;
const DEWS_CHALK = ["#F4F1E8", "#F2D35A", "#F2A23A", "#F27A3A", "#FF5A48"];

/** The storm-signal station's weather board: a slate chalked with the stress band and what its mast is flying. */
export function paintWeatherBoard(ctx: CanvasRenderingContext2D, s: BoardSlot, level: number | null): void {
  ctx.fillStyle = "#23292B";
  ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.strokeStyle = "rgba(240,236,226,0.35)"; ctx.lineWidth = 3;
  ctx.strokeRect(s.x + 10, s.y + 10, s.w - 20, s.h - 20);
  ctx.fillStyle = "#D9D5CB"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `italic ${Math.round(s.h * 0.15)}px ${SERIF}`;
  ctx.fillText("stress signals", s.x + s.w / 2, s.y + s.h * 0.2);
  const word = level == null ? "NO READING" : DEWS_WORD[Math.max(0, Math.min(4, level))];
  ctx.fillStyle = level == null ? "#A9A59C" : DEWS_CHALK[Math.max(0, Math.min(4, level))];
  fit(ctx, word, "700", Math.round(s.h * 0.4), s.w * 0.86);
  spaced(ctx, word, s.x + s.w / 2, s.y + s.h * 0.55, s.h * 0.03);
  ctx.fillStyle = "#C9C5BB";
  ctx.font = `italic ${Math.round(s.h * 0.12)}px ${SERIF}`;
  // the shapes from the top (readings/storm-cones.ts SHAPES): cone, cone, drum, drum
  const cones = Math.min(2, level ?? 0), drums = Math.max(0, Math.min(2, (level ?? 0) - 2));
  const shapes = `${cones} ${cones === 1 ? "cone" : "cones"}${drums ? ` · ${drums} ${drums === 1 ? "drum" : "drums"}` : ""}`;
  const sub = level == null ? "no reading · nothing hoisted" : level === 0 ? "no signal on the mast" : `${shapes}${level >= 4 ? " · red pennant" : " on the mast"}`;
  ctx.fillText(sub, s.x + s.w / 2, s.y + s.h * 0.84);
}

/**
 * A chain's crest flag copied out of the crest atlas (crests.png, rect [u0, v0, u1, v1] with v = 0 at the image
 * bottom), with a coloured hoist stripe: green for the day's top gainer, red for the top loser.
 */
export function paintCrestFlag(ctx: CanvasRenderingContext2D, s: BoardSlot, img: HTMLImageElement, rect: readonly number[], hoist: string): void {
  const W = img.naturalWidth, H = img.naturalHeight;
  const sx = rect[0] * W, sy = (1 - rect[3]) * H, sw = (rect[2] - rect[0]) * W, sh = (rect[3] - rect[1]) * H;
  const band = Math.round(s.w * 0.1);
  ctx.drawImage(img, sx, sy, sw, sh, s.x + band, s.y, s.w - band, s.h);
  ctx.fillStyle = hoist;
  ctx.fillRect(s.x, s.y, band, s.h);
}
