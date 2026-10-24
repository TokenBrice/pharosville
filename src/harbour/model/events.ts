/**
 * F-EVENTS: the harbour's event detector (PLAN Wave 0, report 10 EV-00). Pure: no renderer, no clock reads
 * (the caller passes the time), unit-tested in events.test.ts.
 *
 * The honesty bar (CHANGELOG v0.20.0):
 *   - only ACCEPTED market readings count: an endpoint's poll is read only when it is a new payload (a new
 *     fetch time) and that endpoint is `current`. A stale, failed or unavailable endpoint says nothing.
 *   - freshness, coverage and methodology changes are SILENT: an endpoint's first accepted reading (first load,
 *     or the first after it was unavailable) is the baseline; a reading that appears or disappears (a coin
 *     without a peg reading, a DEWS signal that drops out) is a coverage change; a new methodology version
 *     re-baselines that endpoint (or that coin's row) without an event.
 *   - D-4 hysteresis: a state change is CONFIRMED only once it has held for `confirmPolls` (2) consecutive accepted
 *     polls of its endpoint. This gates the Day book and staging only; the sim still reacts to the first poll.
 *     Exception: a big flow hour is a closed hour's final record, not a state that can flicker, so it is
 *     reported on the poll that first carries it.
 *
 * Events and their fields (endpoint · field · threshold):
 *   depeg       pegSummary   coins[id].activeDepeg false → true          (coins with a numeric deviation only)
 *   recovery    pegSummary   coins[id].activeDepeg true → false
 *   launch      stablecoins  a new live id in peggedAssets
 *   death       stablecoins  a coin's state turns "wrecked" (the dead list, a deploy)
 *   psi-band    stability    current.band changes
 *   dews-band   stress       the supply-weighted DEWS band (readings.weather.band) changes
 *   flow-hour   mintBurn     latest closed hour mint or burn ≥ FLOW_HOUR_MIN_USD AND ≥ FLOW_HOUR_MEAN_X × that
 *                            side's mean over the window's hours, valuation "complete"
 *   hull-class  stablecoins  hullClassFor(supply) crosses a decade
 *   grade       safetyGrades the grade's letter changes (A-/A/A+ are one letter; NR is no grade)
 */
import { money, titleCase } from "../ui/format";
import type { EndpointKey, HarbourModel, HarbourPayloads, HullClass } from "./types";

export type EventKind = "depeg" | "recovery" | "launch" | "death" | "psi-band" | "dews-band" | "flow-hour" | "hull-class" | "grade";

/** Consecutive accepted polls a state change must hold for before it is confirmed (D-4). */
export const CONFIRM_POLLS = 2;
/** Big flow hour: the latest closed hour's mint or burn volume, at least this many USD … */
export const FLOW_HOUR_MIN_USD = 100e6;
/** … and at least this multiple of that side's mean hourly volume over the window. */
export const FLOW_HOUR_MEAN_X = 3;

export interface HarbourEvent {
  /** Unique within a session: kind, coin and confirmation time. */
  id: string;
  kind: EventKind;
  /** Wall-clock ms the change was confirmed (the Day book's time). */
  atMs: number;
  /** Wall-clock ms the new state was first observed (one poll earlier under D-4). */
  firstSeenMs: number;
  endpoint: EndpointKey;
  coinId: string | null;
  symbol: string | null;
  /** The field that changed, in words ("peg deviation", "PSI band"…). */
  field: string;
  /** Old and new value, as shown ("412 bps", "Steady"); null when there is no old value (a launch). */
  from: string | null;
  to: string | null;
  /** The sentence the Day book prints ("USDX left the Shoals"). */
  text: string;
  /** Dev-injected (`?moment=`), never a real reading. */
  dev?: boolean;
}

// ------------------------------------------------------------------ snapshot: what one model build observed

export interface CoinObs {
  symbol: string;
  supply: number;
  hullClass: HullClass;
  wrecked: boolean;
  /** Peg reading (null = no row or no numeric deviation: a coverage gap, never "at peg"). */
  peg: { depeg: boolean; bps: number; method: string | null } | null;
  /** Grade letter (A…F), null when unrated / NR. */
  grade: string | null;
  /** DEWS row methodology (per coin), for silent re-baselining. */
  dewsMethod: string | null;
}

export interface EndpointObs {
  /** Fetch time of the payload behind this build (a new value = a new poll). */
  poll: number | null;
  current: boolean;
  /** Methodology version the endpoint reported, when it reports one. */
  method: string | null;
}

export interface EventSnapshot {
  atMs: number;
  endpoints: Record<EndpointKey, EndpointObs>;
  coins: Map<string, CoinObs>;
  psi: { band: string; score: number | null } | null;
  dews: { band: string; level: number | null } | null;
  /** The latest closed hour in the mint/burn window, with each side's window mean. */
  flowHour: { hourTs: number; mintUsd: number; burnUsd: number; complete: boolean; meanMintUsd: number; meanBurnUsd: number } | null;
}

type Loose = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const methodOf = (data: unknown, key: EndpointKey): string | null => {
  const d = data as Loose | null | undefined;
  if (!d) return null;
  const env = d.methodology as Loose | undefined;
  if (key === "stability") return str((d.current as Loose | null | undefined)?.methodologyVersion) ?? str(env?.version);
  return str(d.methodologyVersion) ?? str(env?.version);
};
const gradeLetter = (g: string | null): string | null => {
  const l = g?.trim().charAt(0).toUpperCase() ?? "";
  return /^[A-F]$/.test(l) ? l : null;
};

/** What one model build observed, for the detector. `payloads` supply poll times, methodology and valuation. */
export function eventSnapshot(model: HarbourModel, payloads: HarbourPayloads, atMs: number): EventSnapshot {
  const endpoints = {} as Record<EndpointKey, EndpointObs>;
  for (const key of Object.keys(model.truth) as EndpointKey[]) {
    const snap = payloads[key];
    endpoints[key] = { poll: snap?.fetchedAtMs ?? null, current: model.truth[key].state === "current" && snap?.data != null, method: methodOf(snap?.data, key) };
  }
  const pegRows = new Map(((payloads.pegSummary?.data?.coins ?? []) as unknown as Loose[]).map((c) => [String(c.id), c]));
  const stressRows = (payloads.stress?.data?.signals ?? {}) as unknown as Record<string, Loose>;
  const coins = new Map<string, CoinObs>();
  for (const b of model.boats) {
    const pr = pegRows.get(b.id);
    coins.set(b.id, {
      symbol: b.symbol,
      supply: b.supply,
      hullClass: b.hullClass,
      wrecked: b.state === "wrecked",
      peg: b.nullPeg || b.pegDeviationBps == null ? null : { depeg: b.activeDepeg, bps: b.pegDeviationBps, method: str(pr?.methodologyVersion) },
      grade: gradeLetter(b.grade),
      dewsMethod: str(stressRows[b.id]?.methodologyVersion),
    });
  }
  const r = model.readings;
  let flowHour: EventSnapshot["flowHour"] = null;
  const hourly = payloads.mintBurn?.data?.hourly ?? [];
  if (hourly.length) {
    const sorted = [...hourly].sort((a, b) => a.hourTs - b.hourTs).slice(-24);
    const last = sorted[sorted.length - 1];
    const n = sorted.length;
    flowHour = {
      hourTs: last.hourTs,
      mintUsd: last.mintVolumeUsd,
      burnUsd: last.burnVolumeUsd,
      complete: last.valuation === "complete" && last.netFlowUsd != null,
      meanMintUsd: sorted.reduce((s, h) => s + (h.mintVolumeUsd || 0), 0) / n,
      meanBurnUsd: sorted.reduce((s, h) => s + (h.burnVolumeUsd || 0), 0) / n,
    };
  }
  return {
    atMs,
    endpoints,
    coins,
    psi: r.psi.band ? { band: r.psi.band, score: r.psi.score } : null,
    dews: r.weather.band ? { band: r.weather.band, level: r.weather.level } : null,
    flowHour,
  };
}

// ------------------------------------------------------------------ variables: one observed state each

/** One state variable as observed by one poll. `aux` is a number shown beside it (bps, supply, score). */
interface Obs { value: string; aux: number | null; method: string | null }

/** Variable families. `absent` = the implied confirmed value of a variable never seen (launch: not on the register). */
const FAMILY: Record<string, { endpoint: EndpointKey; absent?: string }> = {
  peg: { endpoint: "pegSummary" },
  live: { endpoint: "stablecoins", absent: "0" },
  wreck: { endpoint: "stablecoins" },
  class: { endpoint: "stablecoins" },
  grade: { endpoint: "safetyGrades" },
  psi: { endpoint: "stability" },
  dews: { endpoint: "stress" },
};

function varsOf(s: EventSnapshot, endpoint: EndpointKey): Map<string, Obs> {
  const out = new Map<string, Obs>();
  if (endpoint === "stablecoins") {
    for (const [id, c] of s.coins) {
      out.set(`wreck:${id}`, { value: c.wrecked ? "1" : "0", aux: null, method: null });
      if (c.wrecked) continue;
      out.set(`live:${id}`, { value: "1", aux: c.supply, method: null });
      out.set(`class:${id}`, { value: c.hullClass, aux: c.supply, method: null });
    }
  } else if (endpoint === "pegSummary") {
    for (const [id, c] of s.coins) if (!c.wrecked && c.peg) out.set(`peg:${id}`, { value: c.peg.depeg ? "1" : "0", aux: c.peg.bps, method: c.peg.method });
  } else if (endpoint === "safetyGrades") {
    for (const [id, c] of s.coins) if (!c.wrecked && c.grade) out.set(`grade:${id}`, { value: c.grade, aux: null, method: null });
  } else if (endpoint === "stability") {
    if (s.psi) out.set("psi", { value: s.psi.band, aux: s.psi.score, method: null });
  } else if (endpoint === "stress") {
    if (s.dews) out.set("dews", { value: s.dews.band, aux: s.dews.level, method: null });
  }
  return out;
}

// ------------------------------------------------------------------ state + the step

interface VarState {
  confirmed: string;
  /** Latest aux observed while in the confirmed state (the "old" figure of the next change). */
  aux: number | null;
  method: string | null;
  pending: string | null;
  pendingCount: number;
  pendingSinceMs: number;
}
interface EndpointState { poll: number | null; method: string | null; vars: Map<string, VarState> }

export interface EventState {
  endpoints: Partial<Record<EndpointKey, EndpointState>>;
  /** The latest closed flow hour already judged (each hour is judged once). */
  flowHourTs: number | null;
}

export interface DetectOptions { confirmPolls?: number | undefined }

const VAR_ENDPOINTS: EndpointKey[] = ["stablecoins", "pegSummary", "safetyGrades", "stability", "stress"];

/**
 * One step of the detector: the previous state (null = nothing observed yet, the first load) and the next build's
 * snapshot → the new state and the events CONFIRMED by this step. Pure: `prev` is never mutated.
 */
export function detectEvents(prev: EventState | null, next: EventSnapshot, opts: DetectOptions = {}): { state: EventState; events: HarbourEvent[] } {
  const need = Math.max(1, opts.confirmPolls ?? CONFIRM_POLLS);
  const state: EventState = { endpoints: { ...(prev?.endpoints ?? {}) }, flowHourTs: prev?.flowHourTs ?? null };
  const events: HarbourEvent[] = [];
  for (const key of VAR_ENDPOINTS) {
    const obs = next.endpoints[key];
    const was = state.endpoints[key];
    // only a new, current payload is an accepted reading; a rebuild without a new poll says nothing
    if (!obs || obs.poll == null || (was && was.poll === obs.poll)) continue;
    if (!obs.current) {
      // a new poll that is not accepted (stale) breaks every run in progress, and confirms nothing
      if (was) state.endpoints[key] = { ...was, poll: obs.poll, vars: new Map([...was.vars].map(([k, v]) => [k, { ...v, pending: null, pendingCount: 0 }])) };
      continue;
    }
    const vars = varsOf(next, key);
    if (!was || was.method !== obs.method) {
      // baseline: first accepted reading, or a new methodology — silent
      const fresh = new Map<string, VarState>();
      for (const [k, o] of vars) fresh.set(k, settled(o));
      state.endpoints[key] = { poll: obs.poll, method: obs.method, vars: fresh };
      continue;
    }
    const out = new Map<string, VarState>();
    for (const [k, o] of vars) {
      const fam = FAMILY[k.split(":")[0]];
      let v = was.vars.get(k);
      if (!v) {
        if (fam.absent == null) { out.set(k, settled(o)); continue; } // coverage: a reading that appears
        v = { confirmed: fam.absent, aux: null, method: o.method, pending: null, pendingCount: 0, pendingSinceMs: 0 };
      }
      if (v.method !== o.method) { out.set(k, settled(o)); continue; } // that row's methodology changed: silent
      if (o.value === v.confirmed) { out.set(k, { ...v, aux: o.aux, pending: null, pendingCount: 0 }); continue; }
      const count = v.pending === o.value ? v.pendingCount + 1 : 1;
      const since = v.pending === o.value ? v.pendingSinceMs : next.atMs;
      if (count >= need) {
        const ev = eventFor(k, v, o, next, since);
        if (ev) events.push(ev);
        out.set(k, settled(o));
      } else {
        out.set(k, { ...v, pending: o.value, pendingCount: count, pendingSinceMs: since });
      }
    }
    // a variable this poll did not observe (a coverage gap) keeps its confirmed state, but its run is broken
    for (const [k, v] of was.vars) if (!vars.has(k)) out.set(k, { ...v, pending: null, pendingCount: 0 });
    state.endpoints[key] = { poll: obs.poll, method: obs.method, vars: out };
  }
  // flow hour: judged once per new closed hour, on a current mint/burn reading; the first one seen is the baseline
  const mb = next.endpoints.mintBurn, fh = next.flowHour;
  if (mb?.current && fh) {
    if (state.flowHourTs != null && fh.hourTs > state.flowHourTs) {
      const ev = flowHourEvent(fh, next.atMs);
      if (ev) events.push(ev);
    }
    if (state.flowHourTs == null || fh.hourTs > state.flowHourTs) state.flowHourTs = fh.hourTs;
  }
  return { state, events };
}

const settled = (o: Obs): VarState => ({ confirmed: o.value, aux: o.aux, method: o.method, pending: null, pendingCount: 0, pendingSinceMs: 0 });

const absBps = (v: number | null) => (v == null ? "—" : `${Math.abs(Math.round(v))}`);

function eventFor(k: string, v: VarState, o: Obs, s: EventSnapshot, since: number): HarbourEvent | null {
  const [fam, id = null] = k.split(":");
  const coin = id ? s.coins.get(id) ?? null : null;
  const sym = coin?.symbol ?? id;
  const base = { atMs: s.atMs, firstSeenMs: since, coinId: id, symbol: id ? sym : null };
  const mk = (kind: EventKind, endpoint: EndpointKey, field: string, from: string | null, to: string | null, text: string): HarbourEvent =>
    ({ id: `${kind}:${id ?? ""}:${s.atMs}`, kind, endpoint, field, from, to, text, ...base });
  switch (fam) {
    case "peg":
      return o.value === "1"
        ? mk("depeg", "pegSummary", "peg deviation", absBps(v.aux), `${absBps(o.aux)} bps`, `${sym} ran onto the Shoals`)
        : mk("recovery", "pegSummary", "peg deviation", absBps(v.aux), `${absBps(o.aux)} bps`, `${sym} left the Shoals`);
    case "live":
      return o.value === "1" ? mk("launch", "stablecoins", "supply", null, money(o.aux), `${sym} launched`) : null;
    case "wreck":
      return o.value === "1" ? mk("death", "stablecoins", "register", "live", "dead", `${sym} was towed to Wreck Cove`) : null;
    case "class": {
      const grew = HULL_ORDER.indexOf(o.value) < HULL_ORDER.indexOf(v.confirmed);
      return mk("hull-class", "stablecoins", "hull class", hullName(v.confirmed), `${hullName(o.value)} · ${money(o.aux)}`,
        `${sym} ${grew ? "grew" : "shrank"} to a ${hullName(o.value)}`);
    }
    case "grade":
      return mk("grade", "safetyGrades", "safety grade", v.confirmed, o.value, `${sym} regraded`);
    case "psi":
      return mk("psi-band", "stability", "PSI band", titleCase(v.confirmed), `${titleCase(o.value)}${o.aux != null ? ` · ${o.aux.toFixed(1)}` : ""}`, "The Pharos changed its rhythm");
    case "dews":
      return mk("dews-band", "stress", "weather", titleCase(v.confirmed), titleCase(o.value), "The weather turned");
    default:
      return null;
  }
}

const HULL_ORDER = ["flagship", "large", "medium", "small", "boat", "skiff"];
/** Hull class in words: "flagship", "medium hull" (the class ladder, not the silhouette name: two classes share one). */
const hullName = (c: string) => (c === "flagship" ? "flagship" : `${c} hull`);

/** The flow-hour threshold, alone (unit-tested at its edges). */
export function isBigFlowHour(volumeUsd: number, meanUsd: number, complete: boolean): boolean {
  return complete && volumeUsd >= FLOW_HOUR_MIN_USD && volumeUsd >= FLOW_HOUR_MEAN_X * meanUsd;
}

function flowHourEvent(fh: NonNullable<EventSnapshot["flowHour"]>, atMs: number): HarbourEvent | null {
  const mint = isBigFlowHour(fh.mintUsd, fh.meanMintUsd, fh.complete);
  const burn = isBigFlowHour(fh.burnUsd, fh.meanBurnUsd, fh.complete);
  if (!mint && !burn) return null;
  // both: the larger multiple speaks
  const side = mint && burn ? (fh.mintUsd / Math.max(1, fh.meanMintUsd) >= fh.burnUsd / Math.max(1, fh.meanBurnUsd) ? "mint" : "burn") : mint ? "mint" : "burn";
  const vol = side === "mint" ? fh.mintUsd : fh.burnUsd, mean = side === "mint" ? fh.meanMintUsd : fh.meanBurnUsd;
  return {
    id: `flow-hour:${fh.hourTs}:${atMs}`, kind: "flow-hour", atMs, firstSeenMs: atMs, endpoint: "mintBurn", coinId: null, symbol: null,
    field: side === "mint" ? "minted in an hour" : "burned in an hour",
    from: `${money(mean)} mean`, to: `${money(vol)} (${(vol / Math.max(1, mean)).toFixed(1)}×)`,
    text: side === "mint" ? "A big hour at the Mint" : "A big hour at the Burn",
  };
}

/**
 * The Day book's line: time · coin · field · old → new, e.g. "14:20 USDX left the Shoals · 412 → 18 bps".
 * `time` is the caller's local "HH:MM" for `e.atMs`.
 */
export function dayBookLine(e: HarbourEvent, time: string): string {
  const change = e.from != null ? `${e.from} → ${e.to ?? "—"}` : e.to ?? "";
  return `${time} ${e.text}${change ? ` · ${change}` : ""}`;
}
