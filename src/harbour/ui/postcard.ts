/** A display-resolution print and its immutable reading receipt. */
import { resolveChainId } from "@shared/lib/chains";
import { canonicalSubjectUrl, pickToSubject } from "@shared/lib/selection-link";
import type { EndpointKey, EndpointTruth, HarbourModel, PsiReading } from "../model/types";
import { presentationCopy, type PresentationStatus } from "./presentation";
import { readingSentence, sourceTruth, READING_NAMES } from "./source-state";
import type { PickHit } from "./services";
import { truthCopy } from "./truth-copy";
import { titleCase } from "./format";

export interface PostcardReceipt {
  readonly capturedAtMs: number;
  readonly clockHour: number;
  readonly modelBuiltAtMs: number | null;
  readonly fleetRevision: number;
  readonly sources: Readonly<Record<EndpointKey, Readonly<EndpointTruth & { sentence: string }>>>;
  readonly psi: Readonly<Pick<PsiReading, "score" | "band" | "qualified" | "inputDegradation">> | null;
  readonly presentation: Readonly<PresentationStatus>;
  readonly sourceUrl: string;
}
export interface PostcardFrame { frame: HTMLCanvasElement; receipt: PostcardReceipt }

/** Called synchronously with the completed render: retain no mutable model or feed references. */
export function postcardReceipt(model: HarbourModel | null, clockHour: number, capturedAtMs: number,
  presentation: PresentationStatus, selected: PickHit | null, chart: boolean): PostcardReceipt {
  const subject = selected ? pickToSubject(selected) : null;
  if (subject?.kind === "chain") subject.id = resolveChainId(subject.id) ?? subject.id;
  const psi = model?.readings.psi;
  const sources = Object.fromEntries((Object.keys(READING_NAMES) as EndpointKey[]).map((key) => [key,
    Object.freeze({ ...sourceTruth(model, key), sentence: readingSentence(model, key) }),
  ])) as PostcardReceipt["sources"];
  return Object.freeze({ capturedAtMs, clockHour, modelBuiltAtMs: model?.builtAtMs ?? null,
    fleetRevision: presentation.revision, sources: Object.freeze(sources),
    psi: psi ? Object.freeze({ score: psi.score, band: psi.band, qualified: psi.qualified,
      ...(psi.inputDegradation ? { inputDegradation: Object.freeze({ ...psi.inputDegradation }) } : {}) }) : null,
    presentation: Object.freeze({ ...presentation }), sourceUrl: canonicalSubjectUrl(subject, !!subject && chart) });
}

const pad = (n: number) => String(n).padStart(2, "0");
export function postcardCaption(receipt: PostcardReceipt) {
  const d = new Date(receipt.capturedAtMs);
  const mins = Math.floor((((receipt.clockHour % 24) + 24) % 24) * 60 + 1e-6);
  const psi = receipt.psi;
  const lines = [
    `Picture captured ${d.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC")}.`,
    `Decorative scene time: ${pad(Math.floor(mins / 60) % 24)}:${pad(mins % 60)} local.`,
    psi?.score != null && Number.isFinite(psi.score) && psi.band
      ? `Pharos Stability Index: ${Math.round(psi.score)}, ${titleCase(psi.band)}.` : "PSI: unavailable.",
    ...Object.values(receipt.sources).map((source) => source.sentence),
    truthCopy({ kind: "psi-qualification", ...psi?.inputDegradation }),
    presentationCopy(receipt.presentation),
    `Source: ${receipt.sourceUrl} — this link opens current readings.`,
  ].filter(Boolean);
  const title = "PharosVille";
  const file = `pharosville-${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}.png`;
  return { title, lines, text: [title, ...lines].join("\n"),
    stale: Object.values(receipt.sources).some((source) => source.state !== "current"), file };
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

/**
 * The print's inks and serif: the overlay's chart tokens (harbour-ui.css), read as the card is composed, so the
 * print and the chrome share one palette and one family (EB Garamond, declared once in arrival-shell.css).
 */
function printInks() {
  const s = getComputedStyle(document.querySelector(".hb-ui") ?? document.documentElement);
  const v = (name: string) => s.getPropertyValue(name).trim();
  return { paper: v("--paper"), sheenHi: v("--sheen-hi"), sheenLo: v("--sheen-lo"), rule: v("--rule"), ink: v("--ink"), note: v("--ink-3"), stale: v("--stale-ink"), serif: v("--serif") };
}

/** Wrap words, splitting a long canonical URL only when it cannot fit a line. */
function wrap(c: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (c.measureText(next).width <= width) { line = next; continue; }
    if (line) lines.push(line);
    line = "";
    for (const char of word) {
      if (line && c.measureText(line + char).width > width) { lines.push(line); line = ""; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Compose the print around a captured frame; fonts never cause a later reading to be sampled. */
export async function composePostcard(frame: HTMLCanvasElement, cap: ReturnType<typeof postcardCaption>): Promise<HTMLCanvasElement> {
  const w = frame.width, h = frame.height;
  const m = Math.round(Math.max(24, w * 0.035));
  const k = Math.max(1, w / 1600);
  const titlePx = Math.round(Math.max(15, 22 * k)), freshPx = Math.round(Math.max(12, 16 * k));
  const ink = printInks();
  try { await Promise.all([document.fonts?.load(`${titlePx}px ${ink.serif}`), document.fonts?.load(`italic ${freshPx}px ${ink.serif}`)]); } catch { /* the fallback serif will do */ }
  const out = document.createElement("canvas");
  const c = out.getContext("2d")!;
  c.font = `italic ${freshPx}px ${ink.serif}`;
  const lines = cap.lines.flatMap((line) => wrap(c, line, w));
  const off = Math.round(5 * k), lineHeight = Math.round(freshPx * 1.5);
  const ty = m + h + off + Math.round(m * 0.55) + titlePx;
  out.width = w + m * 2; out.height = ty + lines.length * lineHeight + m;
  // paper (deckle edge on a transparent ground)
  deckle(c, out.width, out.height, Math.max(2, 3 * k));
  c.fillStyle = ink.paper;
  c.fill();
  const g = c.createRadialGradient(out.width / 2, out.height * 0.45, 0, out.width / 2, out.height * 0.45, out.width * 0.7);
  g.addColorStop(0, ink.sheenHi); g.addColorStop(1, ink.sheenLo);
  c.fillStyle = g;
  c.fill();
  c.drawImage(frame, m, m);
  c.strokeStyle = ink.rule; c.lineWidth = Math.max(1, k);
  c.strokeRect(m - off + 0.5, m - off + 0.5, w + off * 2 - 1, h + off * 2 - 1);
  c.textAlign = "center"; c.textBaseline = "alphabetic";
  c.fillStyle = ink.ink;
  c.font = `${titlePx}px ${ink.serif}`;
  c.fillText(cap.title, out.width / 2, ty);
  c.fillStyle = cap.stale ? ink.stale : ink.note;
  c.font = `italic ${freshPx}px ${ink.serif}`;
  lines.forEach((line, i) => c.fillText(line, out.width / 2, ty + (i + 1) * lineHeight));
  return out;
}
