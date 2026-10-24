/**
 * The postcard (12-M10): a framed print of the harbour as it is now — deckle paper margin, a hairline
 * brass frame, and a two-line caption: "PharosVille · date · hour · Pharos Stability Index N, Band" and a
 * freshness line that says so when the readings are stale (fog = stale holds on paper too). Captured at
 * display resolution (never an upscaled render). Pure caption logic here (unit-tested); the canvas
 * composition is browser-only.
 */
import type { HarbourModel } from "../model/types";
import { truthState } from "./bits";
import { age, titleCase } from "./format";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");

/** `hour`: the scene's local hour (decimal), the time the picture shows. */
export function postcardCaption(model: HarbourModel | null, hour: number, nowMs: number): { title: string; fresh: string; stale: boolean; file: string } {
  const d = new Date(nowMs);
  const mins = Math.floor((((hour % 24) + 24) % 24) * 60 + 1e-6);
  const h = Math.floor(mins / 60) % 24, m = mins % 60;
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  const psi = model?.readings.psi;
  const index = psi?.lit && psi.score != null
    ? `Pharos Stability Index ${Math.round(psi.score)}${psi.band ? `, ${titleCase(psi.band)}` : ""}`
    : "Pharos Stability Index: no reading";
  const title = `PharosVille · ${date} · ${pad(h)}:${pad(m)} · ${index}`;
  const t = truthState(model);
  const sc = model?.truth.stablecoins;
  let fresh: string;
  if (!model || !model.hasFleet) fresh = "No harbour data had arrived: an empty harbour, not a calm one.";
  else if (t.state === "stale" || psi?.stale) fresh = `Stale readings: last updated ${age(sc?.ageSec)} ago. The harbour was holding still.`;
  else {
    const asOf = new Date(nowMs - (sc?.ageSec ?? 0) * 1000);
    fresh = `Readings as of ${pad(asOf.getUTCHours())}:${pad(asOf.getUTCMinutes())} UTC`;
  }
  const file = `pharosville-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(h)}${pad(m)}.png`;
  return { title, fresh, stale: t.state !== "current" || !!psi?.stale, file };
}

/** A soft, irregular paper edge: the deckle of hand-made paper (seeded, so every card is the same paper). */
function deckle(ctx: CanvasRenderingContext2D, w: number, h: number, amp: number): void {
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const step = Math.max(3, amp * 1.5);
  ctx.beginPath();
  ctx.moveTo(amp * rnd(), amp * rnd());
  for (let x = 0; x < w; x += step) ctx.lineTo(x, amp * rnd());
  for (let y = 0; y < h; y += step) ctx.lineTo(w - amp * rnd(), y);
  for (let x = w; x > 0; x -= step) ctx.lineTo(x, h - amp * rnd());
  for (let y = h; y > 0; y -= step) ctx.lineTo(amp * rnd(), y);
  ctx.closePath();
}

/** Compose the print around a captured frame. */
export async function composePostcard(frame: HTMLCanvasElement, cap: { title: string; fresh: string; stale: boolean }): Promise<HTMLCanvasElement> {
  const w = frame.width, h = frame.height;
  const m = Math.round(Math.max(24, w * 0.035));
  const k = Math.max(1, w / 1600);
  const titlePx = Math.round(Math.max(15, 22 * k)), freshPx = Math.round(Math.max(12, 16 * k));
  const foot = Math.round(m * 0.9 + titlePx * 1.5 + freshPx * 1.6);
  const out = document.createElement("canvas");
  out.width = w + m * 2; out.height = h + m + foot;
  const c = out.getContext("2d")!;
  // paper (deckle edge on a transparent ground)
  deckle(c, out.width, out.height, Math.max(2, 3 * k));
  c.fillStyle = "#f3ead5";
  c.fill();
  const g = c.createRadialGradient(out.width / 2, out.height * 0.45, 0, out.width / 2, out.height * 0.45, out.width * 0.7);
  g.addColorStop(0, "rgba(255,252,240,0.5)"); g.addColorStop(1, "rgba(150,118,64,0.12)");
  c.fillStyle = g;
  c.fill();
  c.drawImage(frame, m, m);
  // hairline brass frame, standing just off the picture
  const off = Math.round(5 * k);
  c.strokeStyle = "#a68242"; c.lineWidth = Math.max(1, k);
  c.strokeRect(m - off + 0.5, m - off + 0.5, w + off * 2 - 1, h + off * 2 - 1);
  // caption, in the wordmark serif
  const serif = '"Harbour Garamond", "EB Garamond", "Iowan Old Style", Palatino, Georgia, serif';
  try { await document.fonts?.load(`${titlePx}px "Harbour Garamond"`); } catch { /* the fallback serif will do */ }
  c.textAlign = "center"; c.textBaseline = "alphabetic";
  c.fillStyle = "#23201a";
  c.font = `${titlePx}px ${serif}`;
  const ty = m + h + off + Math.round(m * 0.55) + titlePx;
  c.fillText(cap.title, out.width / 2, ty, w);
  c.fillStyle = cap.stale ? "#8a4b22" : "#5c5446";
  c.font = `italic ${freshPx}px ${serif}`;
  c.fillText(cap.fresh, out.width / 2, ty + Math.round(freshPx * 1.5), w);
  return out;
}
