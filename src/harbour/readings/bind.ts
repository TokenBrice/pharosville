/**
 * READINGS → WORLD: the pure half of the data-visual binder. Turns a HarbourModel (plus the raw
 * chains payload for the tide gauge) into the targets the world services are driven toward.
 * No renderer, no clock reads: everything here is unit-tested.
 *
 * Grammar (research/04 §3, PLAN D11 — meaning lives in the world):
 *   PSI band   → the Pharos rhythm (PSI_SWEEP_DURATION), 3-step lamp colour, unlit when unknown
 *   PSI score  → beam reach + brightness, continuous (91 and 97 must look different)
 *   off-peg    → sea state, 4 declared steps of the supply-weighted share
 *   DEWS       → the weather (src/harbour/weather: cloud, wind, rain/snow, lightning; no random weather) and the Storm-signal Station's mast: one shape per
 *                step of the SAME supply-weighted band (0 Calm … 4 Danger: cone, cone, drum, drum) plus a red
 *                pennant at Danger, so the mast and the sky always tell one story; the ALERT+ coins live in the panel
 *   7d supply  → the tide gauge, signed-sqrt against TIDE_FULL_SCALE_PCT
 *   mint/burn  → the Mint and the Burn (src/harbour/civic, D19; the tide board is gone)
 *   freshness  → sea fog, ONLY when /api/stablecoins is stale or unavailable
 */
import type {
  ConditionBand, DewsBand, EndpointKey, EndpointTruth, FlowsReading, HarbourModel,
} from "../model/types";
import { PSI_SWEEP_DURATION } from "@shared/lib/psi-colors";

/** Weekly fleet supply change (percent) that stands the tide gauge at full excursion. */
export const TIDE_FULL_SCALE_PCT = 2;
/** Below this the week is slack water: the gauge rests on its datum (producer rounding, not a tide). */
export const TIDE_SLACK_PCT = 0.01;
/** Storm signal shapes on the station mast: one per DEWS step above Calm (Danger = 4, plus the pennant). */
export const MAX_CONES = 4;
/** Score that maps to zero / full beam reach. Reach is (score - lo)/(hi - lo), eased to spread the top. */
export const REACH_SCORE_LO = 30;
export const REACH_SCORE_HI = 100;

export type LampStep = 0 | 1 | 2;
export type SeaStep = 0 | 1 | 2 | 3;

/** Per-landmark freshness for the UI. "unknown" = no payload (never drawn as calm). */
export type LandmarkState = "current" | "stale" | "unknown";
export type LandmarkId = "pharos" | "shoals" | "storm-mast" | "customs-house" | "tide-gauge" | "harbour" | "registry";
export interface LandmarkReading { state: LandmarkState; ageSec: number | null; endpoint: EndpointKey }

/** Which endpoint each landmark reads. 'harbour' (the fleet + the fog) is /api/stablecoins. */
export const LANDMARK_ENDPOINT: Record<LandmarkId, EndpointKey> = {
  pharos: "stability",
  shoals: "pegSummary",
  "storm-mast": "stress",
  "customs-house": "mintBurn",
  "tide-gauge": "chains",
  harbour: "stablecoins",
  registry: "safetyGrades",
};

export interface TideReading {
  /** Signed weekly supply change in PERCENT, or null when unknown. */
  pct: number | null;
  /** -1..1 excursion from the datum after signed-sqrt compression (0 when slack or unknown). */
  level: number;
}

export interface AlertCoin { id: string; symbol: string; band: DewsBand; score: number | null; supply: number }

export interface WorldTargets {
  /** `qualified` (DA-09): lit but computed without early-warning inputs → the horn shutter narrows the beam. */
  psi: { lit: boolean; sweepSec: number; reach: number; lamp: LampStep; band: ConditionBand | null; score: number | null; qualified?: boolean };
  /** null = unknown: the sea is left as it is (never painted calm on purpose). */
  sea: SeaStep | null;
  /** The DEWS weather the director (src/harbour/weather) eases toward; `level` is the continuous supply-weighted 0..4. */
  weather: { cloud: number; wind: number; band: DewsBand | null; level: number } | null;
  /** Hoisted cones = the supply-weighted DEWS level 0..4; null = no stress reading. */
  cones: number | null;
  /** The red pennant at the masthead: weather band DANGER. */
  pennant: boolean;
  /** Individual coins at Alert or worse (for the panel; the mast shows the weighted band). */
  alerts: AlertCoin[];
  tide: TideReading;
  flows: FlowsReading;
  /** Sea fog wanted: /api/stablecoins stale, or unavailable after the feed has tried. */
  fog: boolean;
  landmarks: Record<LandmarkId, LandmarkReading>;
}

/** Beam reach 0..1 from the PSI score: monotonic, eased so the BEDROCK range (80–100) spreads out. */
export function reachForScore(score: number): number {
  const x = Math.min(1, Math.max(0, (score - REACH_SCORE_LO) / (REACH_SCORE_HI - REACH_SCORE_LO)));
  return Math.pow(x, 2.2);
}

export function lampStepForBand(band: ConditionBand): LampStep {
  return band === "BEDROCK" || band === "STEADY" ? 0 : band === "TREMOR" || band === "FRACTURE" ? 1 : 2;
}

export function seaStepForShare(share: number): SeaStep {
  return share < 0.005 ? 0 : share < 0.02 ? 1 : share < 0.1 ? 2 : 3;
}

const DEWS_LEVEL: Record<DewsBand, number> = { CALM: 0, WATCH: 1, ALERT: 2, WARNING: 3, DANGER: 4 };
/** Same law as model/readings.ts weatherReading (kept in step; used for the dev override only). */
export function weatherForLevel(level: number): { cloud: number; wind: number } {
  return { cloud: Math.min(1, 0.15 + level * 0.22), wind: Math.min(1, 0.2 + level * 0.2) };
}

/** `globalChange7dPct` is a FRACTION despite its name (see src/systems/supply-tide.ts). */
export function tideFromFraction(fraction: number | null | undefined): TideReading {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return { pct: null, level: 0 };
  return tideFromPct(fraction * 100);
}

export function tideFromPct(pct: number): TideReading {
  if (Math.abs(pct) < TIDE_SLACK_PCT) return { pct, level: 0 };
  const m = Math.min(1, Math.sqrt(Math.abs(pct) / TIDE_FULL_SCALE_PCT));
  return { pct, level: pct < 0 ? -m : m };
}

/** Gauge height of a percentage on the same compressed scale (for the painted graduations). */
export function tideLevelForPct(pct: number): number {
  const m = Math.min(1, Math.sqrt(Math.abs(pct) / TIDE_FULL_SCALE_PCT));
  return pct < 0 ? -m : m;
}

/** Mast signal for a weather band: cones = the band's level, pennant at Danger. */
export function mastForBand(band: DewsBand | null): { cones: number | null; pennant: boolean } {
  return band == null ? { cones: null, pennant: false } : { cones: Math.min(MAX_CONES, DEWS_LEVEL[band]), pennant: band === "DANGER" };
}

/** Live coins at ALERT or worse, worst score first. */
export function alertCoins(model: Pick<HarbourModel, "boats">): AlertCoin[] {
  const out: AlertCoin[] = [];
  for (const b of model.boats) {
    if (b.state === "wrecked" || b.dews == null || DEWS_LEVEL[b.dews] < DEWS_LEVEL.ALERT) continue;
    out.push({ id: b.id, symbol: b.symbol, band: b.dews, score: b.dewsScore, supply: b.supply });
  }
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || b.supply - a.supply);
}

export function landmarkState(t: EndpointTruth): LandmarkState {
  return t.state === "current" ? "current" : t.state === "stale" ? "stale" : "unknown";
}

export interface DeriveInput {
  model: HarbourModel;
  /** /api/chains globalChange7dPct (a fraction), when the payload is present. */
  chainsChange7d: number | null | undefined;
  /** True once the feed has attempted /api/stablecoins (before that the harbour is SYNCING, not foggy). */
  stablecoinsAttempted: boolean;
}

export function deriveTargets({ model, chainsChange7d, stablecoinsAttempted }: DeriveInput): WorldTargets {
  const r = model.readings;
  const p = r.psi;
  const lit = p.lit && p.band != null && p.score != null;
  const landmarks = {} as Record<LandmarkId, LandmarkReading>;
  for (const id of Object.keys(LANDMARK_ENDPOINT) as LandmarkId[]) {
    const key = LANDMARK_ENDPOINT[id];
    const t = model.truth[key];
    landmarks[id] = { state: landmarkState(t), ageSec: t.ageSec, endpoint: key };
  }
  const coins = model.truth.stablecoins;
  const weatherKnown = r.weather.cloudCover != null && r.weather.wind != null;
  const mast = mastForBand(weatherKnown ? r.weather.band : null);
  return {
    psi: {
      lit,
      sweepSec: lit && p.band ? PSI_SWEEP_DURATION[p.band] : PSI_SWEEP_DURATION.BEDROCK,
      reach: lit && p.score != null ? reachForScore(p.score) : 0,
      lamp: lit && p.band ? lampStepForBand(p.band) : 0,
      band: lit ? p.band : null,
      score: lit ? p.score : null,
      qualified: lit && p.qualified === true,
    },
    sea: r.seaState.step,
    weather: weatherKnown && r.weather.cloudCover != null && r.weather.wind != null
      ? { cloud: r.weather.cloudCover, wind: r.weather.wind, band: r.weather.band, level: r.weather.level ?? (r.weather.band ? DEWS_LEVEL[r.weather.band] : 0) }
      : null,
    cones: mast.cones,
    pennant: mast.pennant,
    alerts: alertCoins(model),
    tide: model.truth.chains.state === "unavailable" ? { pct: null, level: 0 } : tideFromFraction(chainsChange7d),
    flows: r.flows,
    fog: coins.state === "stale" || (coins.state === "unavailable" && stablecoinsAttempted),
    landmarks,
  };
}

// ------------------------------------------------------------------ dev overrides

/**
 * Dev-only reading overrides (never in production builds; the caller gates on import.meta.env.DEV):
 *   ?psi=TREMOR|none  ?psiScore=55  ?offpeg=0.06  ?dews=ALERT (alias ?weather=ALERT)  ?cones=3 (5 = four + pennant)  ?tide=-0.8 (percent)
 *   ?stale=1 (fleet stale → fog)  ?stale=mintBurn,chains (those landmarks stale)
 *   ?psiQualified=1|0 (DA-09: PSI computed without early-warning data → horn shutter)
 */
export const DEV_OVERRIDE_KEYS = ["psi", "psiScore", "offpeg", "dews", "weather", "cones", "tide", "stale", "psiQualified"] as const;

export function applyDevOverrides(t: WorldTargets, q: URLSearchParams): WorldTargets {
  const out: WorldTargets = { ...t, psi: { ...t.psi }, landmarks: { ...t.landmarks }, flows: { ...t.flows } };
  const psi = q.get("psi");
  if (psi) {
    const band = psi.toUpperCase();
    if (band === "NONE" || band === "NULL") {
      out.psi = { lit: false, sweepSec: PSI_SWEEP_DURATION.BEDROCK, reach: 0, lamp: 0, band: null, score: null, qualified: false };
    } else if (band in PSI_SWEEP_DURATION) {
      const b = band as ConditionBand;
      out.psi = { ...out.psi, lit: true, band: b, sweepSec: PSI_SWEEP_DURATION[b], lamp: lampStepForBand(b), score: out.psi.score ?? 91 };
      out.psi.reach = reachForScore(out.psi.score ?? 91);
    }
  }
  const score = Number(q.get("psiScore"));
  if (q.has("psiScore") && Number.isFinite(score) && out.psi.lit) { out.psi.score = score; out.psi.reach = reachForScore(score); }
  if (q.has("psiQualified")) out.psi.qualified = out.psi.lit && q.get("psiQualified") !== "0";
  const off = Number(q.get("offpeg"));
  if (q.has("offpeg") && Number.isFinite(off)) out.sea = seaStepForShare(off);
  const dews = (q.get("dews") ?? q.get("weather") ?? "").toUpperCase();
  if (dews in DEWS_LEVEL) {
    const lvl = DEWS_LEVEL[dews as DewsBand];
    out.weather = { ...weatherForLevel(lvl), band: dews as DewsBand, level: lvl };
    const mast = mastForBand(dews as DewsBand);
    out.cones = mast.cones;
    out.pennant = mast.pennant;
  }
  const cones = Number(q.get("cones"));
  if (q.has("cones") && Number.isFinite(cones)) {
    out.cones = Math.max(0, Math.min(MAX_CONES, Math.round(cones)));
    out.pennant = cones > MAX_CONES;
  }
  const tide = Number(q.get("tide"));
  if (q.has("tide") && Number.isFinite(tide)) out.tide = tideFromPct(tide);
  const stale = q.get("stale");
  if (stale) {
    const keys = stale === "1" ? ["stablecoins"] : stale.split(",");
    for (const id of Object.keys(out.landmarks) as LandmarkId[]) {
      if (keys.includes(out.landmarks[id].endpoint)) out.landmarks[id] = { ...out.landmarks[id], state: "stale" };
    }
    if (keys.includes("stablecoins")) out.fog = true;
    if (keys.includes("mintBurn")) out.flows.stale = true;
  }
  return out;
}
