/**
 * The harbour's OPT-IN ambient sound (D13): off by default, started only from the visitor's own toggle.
 * Everything is synthesised with WebAudio (no samples to download):
 *
 *   - distant surf (slow irregular swells) and lapping water against the quays and hulls;
 *   - wind, scaled by the weather (DEWS via the sky/life services), with gusts;
 *   - gulls (glide-pitched "kee-ow" calls and laughing runs), fewer at night;
 *   - rigging creaks and halyard taps near the harbour, quickening with the wind;
 *   - a distant bell buoy at the harbour mouth;
 *   - the foghorn, ONLY while the data is stale (the readings' fog), never otherwise.
 *
 * Volume follows the zoom: close in, the harbour detail (lapping, creaks, taps, gulls) comes up; far out,
 * the surf and the wind carry the scene. Gentle throughout: the master sits well below full scale.
 *
 * Pure WebAudio + a small inputs record; no three.js and no engine imports, so the module stays lazy.
 */

export interface AmbienceInputs {
  /** 0 = closest zoom … 1 = farthest */
  zoom: number;
  /** wind 0..1 (DEWS) */
  wind: number;
  /** stale-data fog 0..1 */
  fog: number;
  /** 0 day … 1 night */
  night: number;
}

const MASTER = 0.7;

function noiseBuffer(ac: BaseAudioContext, seconds: number, color: "white" | "pink" | "brown"): AudioBuffer {
  const n = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, n, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === "white") d[i] = w * 0.5;
      else if (color === "pink") {
        b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.2;
      }
    }
    // crossfade the loop seam
    const f = Math.min(2048, n >> 3);
    for (let i = 0; i < f; i++) { const t = i / f; d[n - f + i] = d[n - f + i] * (1 - t) + d[i] * t; }
  }
  return buf;
}

export class Ambience {
  private readonly out: GainNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private readonly white: AudioBuffer;
  private readonly inputs: AmbienceInputs = { zoom: 0.5, wind: 0.35, fog: 0, night: 0 };
  // continuous beds
  private readonly surfGain: GainNode;
  private readonly surfSwell: GainNode;
  private readonly lapGain: GainNode;
  private readonly lapBus: GainNode;
  private readonly windGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly whistle: GainNode;
  // event buses
  private readonly harbourBus: GainNode;    // creaks, taps (near)
  private readonly gullBus: GainNode;
  private readonly bellBus: GainNode;
  private readonly hornBus: GainNode;
  private readonly echo: DelayNode;
  private timer = 0;
  private next = { wave: 0, lap: 0, gull: 0, creak: 0, tap: 0, bell: 0, horn: 0, gust: 0 };
  private disposed = false;

  constructor(readonly ac: AudioContext) {
    const now = ac.currentTime;
    this.comp = ac.createDynamicsCompressor();
    this.comp.threshold.value = -20; this.comp.ratio.value = 3; this.comp.attack.value = 0.02; this.comp.release.value = 0.4;
    this.out = ac.createGain();
    this.out.gain.setValueAtTime(0, now);
    this.out.gain.linearRampToValueAtTime(MASTER, now + 2.5);     // a slow fade in, never a jolt
    this.out.connect(this.comp).connect(ac.destination);

    // a short, damp slap-back echo for the distant events (bell, horn, gulls): the harbour walls
    this.echo = ac.createDelay(1);
    this.echo.delayTime.value = 0.31;
    const fb = ac.createGain(); fb.gain.value = 0.28;
    const damp = ac.createBiquadFilter(); damp.type = "lowpass"; damp.frequency.value = 1800;
    this.echo.connect(damp).connect(fb).connect(this.echo);
    const echoOut = ac.createGain(); echoOut.gain.value = 0.5;
    damp.connect(echoOut).connect(this.out);

    this.white = noiseBuffer(ac, 4, "white");
    const pink = noiseBuffer(ac, 5, "pink");
    const brown = noiseBuffer(ac, 6, "brown");

    // ---- surf: brown noise, low-passed, swelling
    this.surfGain = ac.createGain(); this.surfGain.gain.value = 0;
    this.surfSwell = ac.createGain(); this.surfSwell.gain.value = 0.7;
    const surfLp = ac.createBiquadFilter(); surfLp.type = "lowpass"; surfLp.frequency.value = 520; surfLp.Q.value = 0.3;
    this.loop(brown, surfLp);
    surfLp.connect(this.surfSwell).connect(this.surfGain).connect(this.out);

    // ---- lapping: pink noise through two bands, gated by little slaps (scheduled)
    this.lapBus = ac.createGain(); this.lapBus.gain.value = 0;
    this.lapGain = ac.createGain(); this.lapGain.gain.value = 0;
    const lapBp = ac.createBiquadFilter(); lapBp.type = "bandpass"; lapBp.frequency.value = 820; lapBp.Q.value = 0.9;
    const lapLow = ac.createBiquadFilter(); lapLow.type = "bandpass"; lapLow.frequency.value = 320; lapLow.Q.value = 2.2;
    this.loop(pink, lapBp); this.loop(pink, lapLow, 1.3);
    lapBp.connect(this.lapBus); lapLow.connect(this.lapBus);
    this.lapBus.connect(this.lapGain).connect(this.out);

    // ---- wind: white noise, a wandering band, plus a faint whistle in a blow
    this.windGain = ac.createGain(); this.windGain.gain.value = 0;
    this.windFilter = ac.createBiquadFilter(); this.windFilter.type = "bandpass"; this.windFilter.frequency.value = 520; this.windFilter.Q.value = 0.7;
    this.loop(this.white, this.windFilter);
    this.windFilter.connect(this.windGain).connect(this.out);
    this.whistle = ac.createGain(); this.whistle.gain.value = 0;
    const wh = ac.createBiquadFilter(); wh.type = "bandpass"; wh.frequency.value = 1350; wh.Q.value = 14;
    this.loop(this.white, wh, 2.1);
    wh.connect(this.whistle).connect(this.out);

    this.harbourBus = ac.createGain(); this.harbourBus.gain.value = 0; this.harbourBus.connect(this.out);
    this.gullBus = ac.createGain(); this.gullBus.gain.value = 0; this.gullBus.connect(this.out); this.gullBus.connect(this.echo);
    this.bellBus = ac.createGain(); this.bellBus.gain.value = 0.19; this.bellBus.connect(this.out); this.bellBus.connect(this.echo);
    this.hornBus = ac.createGain(); this.hornBus.gain.value = 0.32; this.hornBus.connect(this.out); this.hornBus.connect(this.echo);

    const t = now + 0.5;
    this.next = { wave: t, lap: t, gull: t + 2 + Math.random() * 4, creak: t + 3, tap: t + 1.5, bell: t + 5 + Math.random() * 6, horn: t + 3, gust: t };
    this.timer = window.setInterval(() => this.tick(), 120);
  }

  private loop(buf: AudioBuffer, to: AudioNode, rate = 1): void {
    const s = this.ac.createBufferSource();
    s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    s.loopStart = 0; s.loopEnd = buf.duration;
    s.connect(to);
    s.start(this.ac.currentTime, Math.random() * buf.duration);
    this.sources.push(s);
  }

  set(i: Partial<AmbienceInputs>): void { Object.assign(this.inputs, i); }

  /** Scheduler: levels follow the inputs; events are queued a little ahead of the audio clock. */
  private tick(): void {
    if (this.disposed) return;
    const ac = this.ac, now = ac.currentTime, ahead = now + 0.25;
    const { zoom, wind, fog, night } = this.inputs;
    const near = Math.max(0, Math.min(1, 1 - zoom));
    const tc = 0.8;
    this.surfGain.gain.setTargetAtTime(0.12 + 0.1 * zoom + 0.06 * wind, now, tc);
    this.lapGain.gain.setTargetAtTime(0.35 + 2.4 * near * near, now, tc);
    this.windGain.gain.setTargetAtTime((0.1 + 1.2 * wind * wind) * (0.65 + 0.35 * zoom), now, tc);
    this.whistle.gain.setTargetAtTime(wind > 0.55 ? (wind - 0.55) * 0.25 : 0, now, tc);
    this.harbourBus.gain.setTargetAtTime(0.12 + 1.6 * near * near, now, tc);
    this.gullBus.gain.setTargetAtTime((0.2 + 0.5 * near) * (1 - 0.8 * night), now, tc);

    const N = this.next;
    // surf swells: irregular rise and fall on top of the bed
    if (N.wave < ahead) {
      const at = Math.max(N.wave, now), lvl = 0.4 + Math.random() * 0.8, rise = 1.4 + Math.random() * 1.4;
      const g = this.surfSwell.gain;
      g.setTargetAtTime(0.7 + lvl, at, rise / 3);
      g.setTargetAtTime(0.55, at + rise, 1.6);
      N.wave = at + 4.5 + Math.random() * 5 - wind * 2;
    }
    // lapping: little slaps, quicker in a breeze
    if (N.lap < ahead) {
      const at = Math.max(N.lap, now), g = this.lapBus.gain, peak = 0.4 + Math.random() * 0.6;
      g.setTargetAtTime(peak, at, 0.03);
      g.setTargetAtTime(0.08, at + 0.09 + Math.random() * 0.12, 0.18);
      N.lap = at + 0.35 + Math.random() * (1.4 - wind * 0.6);
    }
    // gusts: the wind band wanders and swells
    if (N.gust < ahead) {
      const at = Math.max(N.gust, now);
      this.windFilter.frequency.setTargetAtTime(300 + Math.random() * 700 + wind * 400, at, 1.2);
      N.gust = at + 1.5 + Math.random() * 3;
    }
    if (N.gull < ahead) {
      const at = Math.max(N.gull, now);
      if (Math.random() < 1 - 0.75 * night) this.gull(at);
      N.gull = at + 3.5 + Math.random() * 9 + night * 10;
    }
    if (N.creak < ahead) {
      const at = Math.max(N.creak, now);
      this.creak(at);
      N.creak = at + 2.5 + Math.random() * 6 - wind * 1.5;
    }
    if (N.tap < ahead) {
      const at = Math.max(N.tap, now);
      const n = 1 + Math.floor(Math.random() * (2 + wind * 4));
      for (let k = 0; k < n; k++) this.tap(at + k * (0.16 + Math.random() * 0.12));
      N.tap = at + 1.2 + Math.random() * (5 - wind * 3.5);
    }
    if (N.bell < ahead) {
      const at = Math.max(N.bell, now);
      this.bell(at);
      if (Math.random() < 0.35) this.bell(at + 0.9 + Math.random() * 0.5, 0.6);
      N.bell = at + 8 + Math.random() * 14;
    }
    // the foghorn: stale data only
    if (fog > 0.5 && N.horn < ahead) {
      const at = Math.max(N.horn, now);
      this.horn(at);
      N.horn = at + 26 + Math.random() * 6;
    } else if (fog <= 0.5) N.horn = Math.max(N.horn, now + 2);
  }

  private env(at: number, attack: number, hold: number, release: number, peak: number): GainNode {
    const g = this.ac.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + attack);
    g.gain.setValueAtTime(peak, at + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + hold + release);
    return g;
  }

  private pan(v: number): StereoPannerNode {
    const p = this.ac.createStereoPanner(); p.pan.value = v; return p;
  }

  /** A gull: one to four glide-pitched calls ("kee-ow"), sometimes a laughing run. */
  private gull(at: number): void {
    const ac = this.ac;
    const p = this.pan(Math.random() * 1.6 - 0.8);
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2800 + Math.random() * 2400;
    lp.connect(p).connect(this.gullBus);
    const laugh = Math.random() < 0.3;
    const calls = laugh ? 4 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
    const base = 1250 + Math.random() * 500;
    for (let k = 0; k < calls; k++) {
      const t = at + k * (laugh ? 0.17 : 0.42 + Math.random() * 0.2);
      const dur = laugh ? 0.12 : 0.3 + Math.random() * 0.15;
      const o = ac.createOscillator(); o.type = "sawtooth";
      const f = o.frequency;
      f.setValueAtTime(base * 1.1, t);
      f.linearRampToValueAtTime(base * (laugh ? 1.35 : 1.75), t + dur * 0.3);
      f.exponentialRampToValueAtTime(base * (laugh ? 0.95 : 0.8), t + dur);
      // a rasp: fast vibrato
      const v = ac.createOscillator(); v.frequency.value = 28 + Math.random() * 12;
      const vg = ac.createGain(); vg.gain.value = base * 0.035;
      v.connect(vg).connect(f);
      const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = base * 1.6; bp.Q.value = 2.5;
      const g = this.env(t, 0.025, dur * 0.4, dur * 0.6, 0.6);
      o.connect(bp).connect(g).connect(lp);
      o.start(t); v.start(t); o.stop(t + dur + 0.05); v.stop(t + dur + 0.05);
    }
  }

  /** Rigging / mooring-line creak: a stick-slip rasp through a narrow, sliding band. */
  private creak(at: number): void {
    const ac = this.ac;
    const dur = 0.35 + Math.random() * 0.6;
    const o = ac.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(70 + Math.random() * 60, at);
    o.frequency.linearRampToValueAtTime(90 + Math.random() * 80, at + dur);
    const bp = ac.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 9;
    bp.frequency.setValueAtTime(500 + Math.random() * 300, at);
    bp.frequency.linearRampToValueAtTime(700 + Math.random() * 500, at + dur);
    // stick-slip: an amplitude flutter
    const am = ac.createGain(); am.gain.value = 0.5;
    const flutter = ac.createOscillator(); flutter.type = "square"; flutter.frequency.value = 18 + Math.random() * 20;
    const fg = ac.createGain(); fg.gain.value = 0.5;
    flutter.connect(fg).connect(am.gain);
    const g = this.env(at, 0.08, dur * 0.5, dur * 0.5, 0.9);
    o.connect(bp).connect(am).connect(g).connect(this.pan(Math.random() * 1.2 - 0.6)).connect(this.harbourBus);
    o.start(at); flutter.start(at); o.stop(at + dur + 0.2); flutter.stop(at + dur + 0.2);
  }

  /** A halyard tapping a mast: a short metallic tink. */
  private tap(at: number): void {
    const ac = this.ac;
    const f = 1700 + Math.random() * 1600;
    const o = ac.createOscillator(); o.type = "sine"; o.frequency.value = f;
    const o2 = ac.createOscillator(); o2.type = "sine"; o2.frequency.value = f * 2.71;
    const g = this.env(at, 0.002, 0.004, 0.09 + Math.random() * 0.08, 0.25);
    const g2 = this.env(at, 0.002, 0.002, 0.04, 0.1);
    const n = ac.createBufferSource(); n.buffer = this.white;
    const nb = ac.createBiquadFilter(); nb.type = "bandpass"; nb.frequency.value = f; nb.Q.value = 6;
    const ng = this.env(at, 0.001, 0.003, 0.025, 0.35);
    const p = this.pan(Math.random() * 1.4 - 0.7);
    p.connect(this.harbourBus);
    o.connect(g).connect(p); o2.connect(g2).connect(p); n.connect(nb).connect(ng).connect(p);
    o.start(at); o2.start(at); n.start(at, Math.random() * 3);
    o.stop(at + 0.25); o2.stop(at + 0.1); n.stop(at + 0.05);
  }

  /** The bell buoy at the harbour mouth: inharmonic partials, a long decay, far away. */
  private bell(at: number, level = 1): void {
    const ac = this.ac;
    const f0 = 392;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
    lp.connect(this.pan(-0.35)).connect(this.bellBus);
    const partials: Array<[number, number, number]> = [[0.5, 0.35, 5.5], [1, 1, 4.2], [1.19, 0.4, 3.2], [1.5, 0.3, 2.5], [2.0, 0.45, 2.2], [2.74, 0.25, 1.4], [3.76, 0.12, 0.9]];
    for (const [r, a, d] of partials) {
      const o = ac.createOscillator(); o.frequency.value = f0 * r * (1 + (Math.random() - 0.5) * 0.004);
      const g = ac.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(a * 0.5 * level, at + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, at + d);
      o.connect(g).connect(lp);
      o.start(at); o.stop(at + d + 0.05);
    }
  }

  /** The foghorn (diaphone): a low two-tone blast that drops in pitch at its end. Stale data only. */
  private horn(at: number): void {
    const ac = this.ac;
    const dur = 2.6;
    const lp = ac.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 520; lp.Q.value = 0.8;
    const g = this.env(at, 0.45, dur - 0.45, 1.4, 0.8);
    lp.connect(g).connect(this.pan(-0.5)).connect(this.hornBus);
    for (const [f, a] of [[98, 0.6], [147, 0.35], [196, 0.12]] as const) {
      const o = ac.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(f, at);
      o.frequency.setValueAtTime(f, at + dur - 0.4);
      o.frequency.exponentialRampToValueAtTime(f * 0.82, at + dur + 0.6);
      const og = ac.createGain(); og.gain.value = a;
      o.connect(og).connect(lp);
      o.start(at); o.stop(at + dur + 1.5);
    }
  }

  /** Fade out, then release everything. */
  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    clearInterval(this.timer);
    const now = this.ac.currentTime;
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + 0.5);
    await new Promise((r) => setTimeout(r, 560));
    for (const s of this.sources) { try { s.stop(); } catch { /* already stopped */ } }
    this.out.disconnect();
    await this.ac.close().catch(() => undefined);
  }
}
