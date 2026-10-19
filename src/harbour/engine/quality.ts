/**
 * Quality tiers. Every tier renders the SAME art (geometry, materials, palette, grade); lower tiers only
 * drop effect cost: pixel ratio, shadow-map size / refresh rate / softness, real point lights, bloom depth,
 * anti-aliasing preset.
 *
 * The governor selects quantized (tier, pixel ratio) rungs with one hysteresis policy. Resolution-only
 * changes publish without shader preparation; effect changes await resident SMAA preset programs.
 */
export type QualityTier = "high" | "medium" | "low";

export interface QualitySettings {
  readonly tier: QualityTier;
  /** Shadow map resolution (square). */
  readonly shadowMapSize: number;
  /** Seconds between shadow-map refreshes while nothing forces one (0 = every frame). */
  readonly shadowInterval: number;
  /** ...and at least this many frames since the last one (a slow frame alone never re-renders the map). */
  readonly shadowMinFrames: number;
  /** Real point lights promoted near the camera at night; all tiers retain sixteen shader slots. */
  readonly pointLights: number;
  /** Bloom mip levels (fewer = cheaper, slightly tighter halo). */
  readonly bloomLevels: number;
  /** SMAA preset name. */
  readonly smaa: "low" | "medium" | "high";
}

export const TIERS: Record<QualityTier, QualitySettings> = {
  high: { tier: "high", shadowMapSize: 4096, shadowInterval: 0, shadowMinFrames: 1, pointLights: 16, bloomLevels: 8, smaa: "high" },
  medium: { tier: "medium", shadowMapSize: 2048, shadowInterval: 1 / 30, shadowMinFrames: 2, pointLights: 8, bloomLevels: 7, smaa: "medium" },
  low: { tier: "low", shadowMapSize: 2048, shadowInterval: 1 / 15, shadowMinFrames: 2, pointLights: 4, bloomLevels: 6, smaa: "low" },
};

export interface QualityRung { readonly tier: QualityTier; readonly dpr: number }

/** Cheapest → richest. The governor only ever moves one rung at a time. */
export const LADDER: readonly QualityRung[] = [
  { tier: "low", dpr: 1 },
  { tier: "low", dpr: 1.25 },
  { tier: "medium", dpr: 1.25 },
  { tier: "medium", dpr: 1.5 },
  { tier: "high", dpr: 1.5 },
  { tier: "high", dpr: 1.75 },
  { tier: "high", dpr: 2 },
];

/**
 * The ladder for this display: pixel ratios clamped to the device's (never render above it, max 2),
 * duplicate rungs removed. A 1× display gets low@1 → medium@1 → high@1.
 */
export function ladderFor(deviceDpr: number): QualityRung[] {
  const cap = Math.min(2, Math.max(1, deviceDpr));
  const out: QualityRung[] = [];
  for (const r of LADDER) {
    const rung = { tier: r.tier, dpr: Math.min(r.dpr, cap) };
    const last = out[out.length - 1];
    if (!last || last.tier !== rung.tier || last.dpr !== rung.dpr) out.push(rung);
  }
  return out;
}

/** Phone and tablet GPUs by WEBGL_debug_renderer_info name (Android ANGLE strings carry the same names). */
const MOBILE_GPU = /adreno|mali|immortalis|powervr|apple gpu|xclipse|maleoon|videocore/;

/**
 * Starting rung from the GPU's name (WEBGL_debug_renderer_info). Integrated GPUs start one tier down and
 * may climb; discrete GPUs start at the top and may fall. Unknown starts at Medium 1.5. Phone and tablet
 * GPUs (by name, or any GPU behind a coarse primary pointer) start at Medium 1.5 whatever their name, and
 * the governor climbs from there if frames allow: they share a battery and a thermal budget with a high-DPR
 * panel (the ladder caps the ratio at 2).
 */
export function initialRungFor(renderer: string, ladder: readonly QualityRung[], coarsePointer = false): number {
  const r = renderer.toLowerCase();
  const top = ladder.length - 1;
  /** richest rung of `tier` whose pixel ratio is ≤ dpr */
  const at = (tier: QualityTier, dpr: number) => {
    let best = -1;
    for (let i = 0; i < ladder.length; i++) if (ladder[i].tier === tier && ladder[i].dpr <= dpr + 1e-3) best = i;
    return best < 0 ? top : best;
  };
  if (/swiftshader|llvmpipe|software|microsoft basic/.test(r)) return 0;
  if (coarsePointer || MOBILE_GPU.test(r)) return at("medium", 1.5);
  if (/nvidia|geforce|quadro|rtx|radeon (rx|pro)|\brx \d/.test(r)) return top;
  if (/apple m\d (max|ultra)/.test(r)) return at("high", 1.5);
  return at("medium", 1.5);   // Apple / Intel / integrated Radeon / mobile / unknown
}

/** `?quality=high|medium|low` pins the tier (gate captures, user override). */
export function parseTier(v: string | null | undefined): QualityTier | null {
  return v === "high" || v === "medium" || v === "low" ? v : null;
}

/** A completed, non-disjoint GPU query, tagged with the state that issued it. */
export interface CompletedGpuSample {
  frame: number;
  state: number;
  rung: number;
  tier: QualityTier;
  dpr: number;
  ms: number;
}

/**
 * 'quality' service: what the renderer is spending, and the switch for it.
 * Listeners fire on any change (tier or pixel ratio), never per frame.
 */
export interface QualityService {
  readonly tier: QualityTier;
  readonly settings: QualitySettings;
  readonly dpr: number;
  /** True while the governor may move the rung. */
  readonly auto: boolean;
  /** p10 of the bounded completed-sample population for the current state (ms), not the latest query. */
  readonly gpuMs: number | null;
  /** Pin a tier ('auto' hands control back to the governor). */
  set(tier: QualityTier | "auto"): void;
  onChange(fn: (s: QualitySettings, dpr: number) => void): () => void;
}
