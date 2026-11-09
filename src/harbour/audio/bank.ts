import { SYNTHS, makeRng, type Clip, type ClipKind } from "./dsp";

/**
 * The clip bank: a few seeded variants of every one-shot (waves, laps, reef breaks, crackle, press strokes),
 * synthesised in small slices off the critical path and slowly REPLACED while the sound plays, so no wave is
 * ever heard twice in the same form (no loop to spot).
 */

/**
 * Synthesis rate per kind: each just above twice its highest content (the source node resamples on play).
 * Dark kinds (the reef, the far roll, the bell buoy) go lower still. With the MONO kinds and the variant
 * counts below, the eager bank holds ~7.6 MB of PCM (was ~18 MB); the lazy weather/season kinds add only what
 * the scene asks for.
 */
const RATE: Record<ClipKind, number> = {
  shore: 20000, lap: 16000, reef: 8000, crackle: 16000, press: 16000, halyard: 24000, bell: 12000, gull: 16000, creak: 16000,
  drizzle: 24000, rain: 24000, drip: 24000, thunder: 24000, rumble: 8000, bird: 24000, cricket: 24000, cicada: 24000, rustle: 24000, crunch: 24000,
  mallet: 12000, adze: 16000, saw: 16000, owl: 8000, nightjar: 8000, tolling: 8000,
  unroll: 16000, latch: 16000, flick: 16000,
  conch: 8000, gun: 8000, swish: 12000, flap: 8000,
};
const PLAN: Record<ClipKind, number> = {
  shore: 4, lap: 6, reef: 3, crackle: 3, press: 2, halyard: 4, bell: 2, gull: 5, creak: 3,
  drizzle: 2, rain: 3, drip: 4, thunder: 2, rumble: 3, bird: 6, cricket: 3, cicada: 3, rustle: 4, crunch: 3,
  mallet: 3, adze: 3, saw: 2, owl: 3, nightjar: 2, tolling: 2,
  unroll: 2, latch: 2, flick: 2,
  conch: 2, gun: 1, swish: 3, flap: 2,
};
/**
 * Stored as ONE channel ((L + R) / 2, so the PCM stays below full scale; the player gains a mono clip by √2,
 * which puts it at the stereo clip's level through the lane's panner): kinds that are a single
 * placed source anyway, whose stereo width comes from the pan lane they are played into, not the clip.
 */
const MONO = new Set<ClipKind>(["lap", "reef", "crackle", "press", "halyard", "bell", "gull", "creak", "drip", "rumble", "bird", "crunch", "mallet", "adze", "saw", "owl", "nightjar", "tolling", "unroll", "latch", "flick", "conch", "gun", "swish", "flap"]);
/**
 * Weather and season kinds are LAZY: synthesised only once the scene asks for them (want()), so a calm
 * summer noon never spends a millisecond or a megabyte on thunder or snow.
 */
const LAZY = new Set<ClipKind>(["drizzle", "rain", "drip", "thunder", "rumble", "bird", "cricket", "cicada", "rustle", "crunch", "mallet", "adze", "saw", "owl", "nightjar", "tolling", "conch", "gun", "swish", "flap"]);
/** the first of each kind comes first, so the scene is audible within a few hundred ms: a lap (small, quick) first of all */
const FIRST: ClipKind[] = ["lap", "shore", "reef", "shore", "lap", "halyard", "gull", "creak", "bell", "crackle", "press"];
const REFRESH: ClipKind[] = ["shore", "lap", "reef", "shore", "gull", "lap", "halyard", "creak"];

const ACTIVE_SECONDS = 30;
const RETAIN_SECONDS = 120;
const COPY_SAMPLES = 6144;

/** Conversion and native copies share the same pump budget as synthesis. */
function* render(ac: BaseAudioContext, kind: ClipKind, seed: number): Generator<void, AudioBuffer> {
  const c: Clip = yield* SYNTHS[kind](seed, RATE[kind]);
  const mono = MONO.has(kind), buf = ac.createBuffer(mono ? 1 : 2, c.L.length, c.sr);
  yield;
  for (let i = 0; i < c.L.length; i += COPY_SAMPLES) {
    const end = Math.min(c.L.length, i + COPY_SAMPLES);
    if (mono) {
      const m = new Float32Array(end - i);
      for (let j = i; j < end; j++) m[j - i] = (c.L[j] + c.R[j]) * 0.5;
      buf.copyToChannel(m, 0, i);
    } else {
      buf.copyToChannel(c.L.subarray(i, end) as Float32Array<ArrayBuffer>, 0, i);
      buf.copyToChannel(c.R.subarray(i, end) as Float32Array<ArrayBuffer>, 1, i);
    }
    yield;
  }
  return buf;
}

interface Job { kind: ClipKind; slot: number; gen: Generator<void, AudioBuffer> }

export class ClipBank {
  private readonly clips = Object.fromEntries(Object.keys(PLAN).map((k) => [k, []])) as unknown as Record<ClipKind, AudioBuffer[]>;
  private readonly last = Object.fromEntries(Object.keys(PLAN).map((k) => [k, -1])) as Record<ClipKind, number>;
  private readonly queue: Array<{ kind: ClipKind; slot: number }> = [];
  private job: Job | null = null;
  private seed: number;
  private refreshN = 0;
  private readonly wanted = new Map<ClipKind, number>();

  constructor(private readonly ac: BaseAudioContext, seed: number) {
    this.seed = seed >>> 0;
    const filled = Object.fromEntries(Object.keys(PLAN).map((k) => [k, 0])) as Record<ClipKind, number>;
    for (const k of FIRST) this.queue.push({ kind: k, slot: filled[k]++ });
    for (const k of Object.keys(PLAN) as ClipKind[]) if (!LAZY.has(k)) while (filled[k] < PLAN[k]) this.queue.push({ kind: k, slot: filled[k]++ });
  }

  /** Ask for a lazy kind: queues its variants the first time (true), no-op after. */
  want(kind: ClipKind): boolean {
    if (!LAZY.has(kind)) return false;
    const wanted = this.wanted.has(kind);
    this.wanted.set(kind, this.ac.currentTime);
    if (wanted) return false;
    for (let i = 0; i < PLAN[kind]; i++) this.queue.push({ kind, slot: i });
    return true;
  }

  get pending(): boolean { return !!this.job || this.queue.length > 0; }

  /** A variant of this kind (never the one just played), or null while none is ready. */
  pick(kind: ClipKind, rnd: () => number): AudioBuffer | null {
    const list = this.clips[kind];
    if (!list.length) return null;
    let i = Math.floor(rnd() * list.length);
    if (list.length > 1 && i === this.last[kind]) i = (i + 1) % list.length;
    this.last[kind] = i;
    return list[i];
  }

  /** Queue one replacement variant (call every ~20 s while playing). */
  refresh(): void {
    const now = this.ac.currentTime;
    for (const [kind, at] of this.wanted) {
      if (now - at < RETAIN_SECONDS) continue;
      this.wanted.delete(kind);
      this.clips[kind].length = 0;
      this.last[kind] = -1;
      for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].kind === kind) this.queue.splice(i, 1);
      if (this.job?.kind === kind) this.job = null;
    }
    if (this.pending) return;
    const active = [...this.wanted].filter(([, at]) => now - at < ACTIVE_SECONDS).map(([kind]) => kind);
    const pool = [...REFRESH, ...active];
    const kind = pool[this.refreshN++ % pool.length];
    this.queue.push({ kind, slot: Math.floor(makeRng(this.seed + this.refreshN)() * PLAN[kind]) });
  }

  /** Synthesise for up to `budgetMs`; returns true while work remains. */
  work(budgetMs: number): boolean {
    const t0 = performance.now();
    while (performance.now() - t0 < budgetMs) {
      if (!this.job) {
        const next = this.queue.shift();
        if (!next) return false;
        this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
        this.job = { ...next, gen: render(this.ac, next.kind, this.seed) };
      }
      const s = this.job.gen.next();
      if (s.done) {
        this.clips[this.job.kind][this.job.slot] = s.value;
        // keep the list dense even if slots fill out of order
        this.clips[this.job.kind] = this.clips[this.job.kind].filter(Boolean);
        this.job = null;
      }
    }
    return this.pending;
  }

  /** Bytes of PCM held now (tests, diagnostics). */
  get bytes(): number {
    let b = 0;
    for (const list of Object.values(this.clips)) for (const c of list) b += c.length * c.numberOfChannels * 4;
    return b;
  }

  /** Everything at once (offline rendering, tests). */
  buildAll(): void { while (this.work(1e9)) { /* drain */ } }

  /** Drop cached PCM and any partially synthesised clip after playback is torn down. */
  dispose(): void {
    this.job = null;
    this.queue.length = 0;
    this.wanted.clear();
    for (const kind of Object.keys(PLAN) as ClipKind[]) this.clips[kind].length = 0;
  }
}
