/**
 * W0.4: the one switch that turns instrumentation chrome back on.
 *
 * `?debug=1` is the project's existing debug flag — `scripts/pharosville/preview.mjs`
 * appends it to every URL it opens — so the perf lane keeps its on-screen frame
 * readout while the shipped world stays free of it. Accepted in the query string
 * or hash because either may already carry the world's own state.
 */
export function isDebugChromeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return readUrlFlag("debug") === "1";
}

// Cached at module scope: PROD vs dev never changes inside a session, and
// hostname doesn't change for a SPA. The lazy initialiser keeps SSR / module
// load safe by deferring the window read until first call. Evaluating once
// (not on every effect-rebind tick) makes the per-frame guard cost trivial.
let cachedVisualDebugAllowed: boolean | null = null;

/**
 * Whether the world may publish `window.__pharosVilleDebug` and honour the
 * preview harness seams (`still=1`, `d=`, `__pharosVilleKnockout`): any dev
 * build, or a production build served from localhost (the preview harness).
 */
export function isVisualDebugAllowed(): boolean {
  if (cachedVisualDebugAllowed === null) {
    cachedVisualDebugAllowed = !import.meta.env.PROD
      || (typeof window !== "undefined"
        && (window.location.hostname === "localhost"
          || window.location.hostname === "127.0.0.1"));
  }
  return cachedVisualDebugAllowed;
}

/**
 * W0.2 `still=1` (with `debug=1`): the camera never breathes and attract /
 * postcard moves never start, so a motion sheet sees only the world moving.
 * Cached per query/hash pair: the flag is read from RAF callbacks.
 */
let stillCameraSearch: string | null = null;
let stillCameraHash: string | null = null;
let stillCameraCached = false;
export function isStillCameraRequested(): boolean {
  if (typeof window === "undefined" || !isVisualDebugAllowed()) return false;
  const { hash, search } = window.location;
  if (search !== stillCameraSearch || hash !== stillCameraHash) {
    stillCameraSearch = search;
    stillCameraHash = hash;
    stillCameraCached = readUrlFlag("debug") === "1" && readUrlFlag("still") === "1";
  }
  return stillCameraCached;
}

export type PharosVilleKnockoutPass = "ao" | "bloom" | "smaa" | "rays" | "reflection" | "grade" | "keyline" | "water-lanes";

/**
 * W0.1 knockout seam: `window.__pharosVilleKnockout` is installed by the
 * preview harness before navigation (`addInitScript`) and names passes to
 * skip so their cost can be measured by difference. Never honoured in a
 * shipped (non-debug) session.
 */
export function isKnockedOut(pass: PharosVilleKnockoutPass): boolean {
  if (typeof window === "undefined" || !isVisualDebugAllowed()) return false;
  const knockout = (window as typeof window & { __pharosVilleKnockout?: unknown }).__pharosVilleKnockout;
  return Array.isArray(knockout) && knockout.includes(pass);
}

export interface DebugDirectorAdmission {
  id: string;
  kind: string;
  priority: number;
  /** `Date.now()` when the director admitted the beat. */
  admittedAtWallMs: number;
  startSeconds: number;
  endSeconds: number;
  /** The beat's subject (a scored ritual's id). */
  subject?: string;
  /** W5.1 ritual rows: the local clock the ritual began at, `HH:MM:SS`. */
  clock?: string;
  /** W5.1 ritual rows: the director clock (sim time, epoch seconds). */
  simSeconds?: number;
  /** W5.1 ritual rows: started by `forceRitual`, outside the score. */
  forced?: boolean;
}

const DEBUG_DIRECTOR_LOG_CAP = 200;

/**
 * W0.2 director event log (`__pharosVilleDebug.directorLog`): every beat the
 * garden director admits, oldest first, capped at 200. Module-level so beats
 * admitted before the debug object is published (the arrival) are kept.
 * Mutated in place; the published debug object holds this same array.
 */
const directorAdmissions: DebugDirectorAdmission[] = [];
export const debugDirectorLog: readonly DebugDirectorAdmission[] = directorAdmissions;

export function recordDebugDirectorAdmission(beat: {
  id: string;
  kind: string;
  priority: number;
  startSeconds: number;
  durationSeconds: number;
  subject?: string;
}): void {
  if (!isVisualDebugAllowed()) return;
  pushDirectorRow({
    id: beat.id,
    kind: beat.kind,
    priority: beat.priority,
    admittedAtWallMs: Date.now(),
    startSeconds: beat.startSeconds,
    endSeconds: beat.startSeconds + beat.durationSeconds,
    ...(beat.subject === undefined ? {} : { subject: beat.subject }),
  });
}

/** W5.1: one row per ritual start (scored or forced), beside the admissions. */
export function recordDebugRitual(event: {
  id: string;
  kind: string;
  clockHour: number;
  forced: boolean;
  directorSeconds: number;
}): void {
  if (!isVisualDebugAllowed()) return;
  const totalSeconds = Math.floor((((event.clockHour % 24) + 24) % 24) * 3600);
  const clock = [Math.floor(totalSeconds / 3600), Math.floor(totalSeconds / 60) % 60, totalSeconds % 60]
    .map((part) => String(part).padStart(2, "0")).join(":");
  pushDirectorRow({
    id: event.id,
    kind: event.kind,
    priority: 30,
    admittedAtWallMs: Date.now(),
    startSeconds: event.directorSeconds,
    endSeconds: event.directorSeconds,
    clock,
    simSeconds: event.directorSeconds,
    forced: event.forced,
  });
}

function pushDirectorRow(row: DebugDirectorAdmission): void {
  const log = directorAdmissions;
  log.push(row);
  if (log.length > DEBUG_DIRECTOR_LOG_CAP) log.splice(0, log.length - DEBUG_DIRECTOR_LOG_CAP);
}

const CALENDAR_DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * W0.3 `d=YYYY-MM-DD` (hash or query, debug only): the calendar day the world
 * uses for season, almanac and any other date-driven choice, alongside `t=`
 * for the hour. Returns the UTC midnight of that day in epoch ms, or `null`
 * when no valid pin is present.
 */
export function debugCalendarDayMs(): number | null {
  if (typeof window === "undefined" || !isVisualDebugAllowed()) return null;
  const raw = readUrlFlag("d");
  if (!raw) return null;
  const match = CALENDAR_DAY_PATTERN.exec(raw);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const ms = Date.UTC(year, month, day);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month || check.getUTCDate() !== day) return null;
  return ms;
}

/**
 * X3 `sky=BAND` (hash or query, debug only): draw the sky's cloud cover and air
 * as if PSI read that band, e.g. `#t=12.25&sky=CRISIS`, so captures can
 * compare covers on live data. The DOM keeps the real reading. Cached per
 * query/hash pair: the flag is read from the frame loop.
 */
let skyBandSearch: string | null = null;
let skyBandHash: string | null = null;
let skyBandCached: string | null = null;
export function debugSkyBand(): string | null {
  if (typeof window === "undefined" || !isVisualDebugAllowed()) return null;
  const { hash, search } = window.location;
  if (search !== skyBandSearch || hash !== skyBandHash) {
    skyBandSearch = search;
    skyBandHash = hash;
    skyBandCached = readUrlFlag("sky")?.toUpperCase() ?? null;
  }
  return skyBandCached;
}

function readUrlFlag(key: string): string | null {
  const fromSearch = new URLSearchParams(window.location.search).get(key);
  if (fromSearch !== null) return fromSearch;
  const rawHash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  return new URLSearchParams(rawHash.startsWith("?") ? rawHash.slice(1) : rawHash).get(key);
}
