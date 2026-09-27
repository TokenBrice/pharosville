/**
 * W7.2 (sound-1) "one wind, heard": the procedural bed. Every layer is the one
 * noise buffer through filters, driven by the world's own clocks — the 9 s
 * breath (`gardenBreathAt`), the 600 s gust and its travel across the frame
 * (`gardenGustAtWorldPosition`), the sea state, the pose's height over the
 * water and the beacon pass. No second oscillator, nothing rhythmic or
 * melodic: the only periodicity is the breath the water already shows.
 */
import { GARDEN_BREATH_PHASE, GARDEN_BREATH_SECONDS, gardenBreathAt } from "../../systems/weather";
import { hash01, smoothstep } from "./dsp";
import { claimVoice, foldToMono, NOISE_BURST_CREST, panPeakCompensation, startNoiseLoop, type AudioGraph, type FilterStage } from "./graph";
import { AUDIO_MASTER, dbToGain, stemLevelDb, type AudioStemName } from "./mix";

/** Everything the bed reads for one tick; rewritten in place by the engine. */
export interface BedFrame {
  /** Context time these values land at. */
  at: number;
  /** Breath clock at `at`: the render clock, or the audio clock under Still. */
  breathTime: number;
  still: boolean;
  /** Sea-state ladder 0 (calm) … 1 (storm). */
  sea: number;
  /** 1 at the rest seat by the water, 0 over the whole-map chart. */
  near: number;
  beaconPresence: number;
  beamFacing: number;
  windSpeed: number;
  gustLeft: number;
  gustRight: number;
}

/** The stem's intended level this tick (dB), recorded for the stem table. */
export type StemTargetSink = (stem: AudioStemName, db: number) => void;

interface Layer {
  gain: GainNode;
  filters: BiquadFilterNode[];
  stages: FilterStage[];
  pan: StereoPannerNode | null;
}

const BREATH_SAMPLES = 72;
/** Breath shape over one cycle, for power normalisation. */
const breathShape = Array.from({ length: BREATH_SAMPLES }, (_, index) => gardenBreathAt((index / BREATH_SAMPLES) * GARDEN_BREATH_SECONDS));
/** mean(b⁴): the wash envelope is b², so its power averages this. */
const washPowerMean = breathShape.reduce((sum, b) => sum + b ** 4, 0) / BREATH_SAMPLES;
/** Wakes crest: where `gardenBreathAt(t, wakes)` peaks, t = 9k − this. */
const LAP_CREST_OFFSET_SECONDS = GARDEN_BREATH_SECONDS * (0.2 + GARDEN_BREATH_PHASE.wakes - 0.4);
const LN_REST_EYE = Math.log(24);
const LN_CHART_EYE = Math.log(170);

export interface GardenBed {
  update: (frame: BedFrame, targets: StemTargetSink | null) => void;
  resetEvents: () => void;
}

export function createGardenBed(graph: AudioGraph): GardenBed {
  const { ctx, stems } = graph;
  const seaSource = startNoiseLoop(graph, 0, 0.97);
  const shoreSource = startNoiseLoop(graph, 2.7, 1.03);
  const windSource = startNoiseLoop(graph, 5.1, 1);

  const layer = (source: AudioNode, stem: AudioStemName, stages: FilterStage[], panned: boolean): Layer => {
    let node: AudioNode = source;
    const filters = stages.map((stage) => {
      const filter = ctx.createBiquadFilter();
      filter.type = stage.type;
      filter.frequency.value = stage.frequency;
      filter.Q.value = stage.q;
      node.connect(filter);
      node = filter;
      return filter;
    });
    const gain = ctx.createGain();
    gain.gain.value = 0;
    node.connect(gain);
    const pan = panned ? ctx.createStereoPanner() : null;
    (pan ? gain.connect(pan) : gain).connect(stems[stem]);
    return { gain, filters, stages, pan };
  };
  // Lowpass/highpass Q is resonance in dB in Web Audio: −3 dB is Butterworth.
  const sea = layer(seaSource, "sea", [
    { type: "lowpass", frequency: 600, q: -3 },
    { type: "lowpass", frequency: 600, q: -3 },
  ], false);
  const wash = layer(shoreSource, "wash", [{ type: "bandpass", frequency: 1200, q: 0.5 }], false);
  const air = layer(shoreSource, "air", [{ type: "bandpass", frequency: 4200, q: 0.7 }], false);
  const wind = layer(windSource, "wind", [{ type: "bandpass", frequency: 400, q: 0.8 }], true);
  const whistle = layer(windSource, "whistle", [{ type: "bandpass", frequency: 700, q: 9 }], true);

  let primed = false;
  let nextLapCycle = Number.NaN;

  const drive = (target: Layer, at: number, gainValue: number, frequency: number | null, pan: number | null) => {
    if (frequency !== null) {
      for (let index = 0; index < target.filters.length; index += 1) {
        target.stages[index]!.frequency = frequency;
        if (primed) target.filters[index]!.frequency.linearRampToValueAtTime(frequency, at);
        else target.filters[index]!.frequency.setValueAtTime(frequency, at);
      }
    }
    const safeGain = Number.isFinite(gainValue) ? gainValue : 0;
    if (primed) target.gain.gain.linearRampToValueAtTime(safeGain, at);
    else target.gain.gain.setValueAtTime(safeGain, at);
    if (target.pan && pan !== null) {
      if (primed) target.pan.pan.linearRampToValueAtTime(pan, at);
      else target.pan.pan.setValueAtTime(pan, at);
    }
  };

  const scheduleLaps = (frame: BedFrame, lapDb: number, targets: StemTargetSink | null) => {
    const horizon = frame.breathTime + 1;
    const firstCycle = Math.ceil((frame.breathTime + LAP_CREST_OFFSET_SECONDS) / GARDEN_BREATH_SECONDS);
    const crestOf = (cycle: number) => cycle * GARDEN_BREATH_SECONDS - LAP_CREST_OFFSET_SECONDS;
    // No backlog after a pause, and no stall if the clock steps backwards.
    if (!Number.isFinite(nextLapCycle) || nextLapCycle < firstCycle - 1 || crestOf(nextLapCycle) > horizon + 20) {
      nextLapCycle = firstCycle;
    }
    for (; crestOf(nextLapCycle) <= horizon; nextLapCycle += 1) {
      const cycle = nextLapCycle;
      if (hash01(cycle * 3 + 2) < 0.3 || lapDb === Number.NEGATIVE_INFINITY) continue;
      const onset = crestOf(cycle) + (hash01(cycle * 3 + 1) * 2 - 1) * 0.6;
      const when = frame.at + (onset - frame.breathTime);
      if (when < ctx.currentTime) continue;
      const peakDb = lapDb + 20 * Math.log10(0.6 + 0.4 * hash01(cycle * 3 + 3));
      if (playLap(graph, when, peakDb, cycle)) targets?.("lap", peakDb);
    }
  };

  return {
    resetEvents() {
      nextLapCycle = Number.NaN;
    },
    update(frame, targets) {
      const { at, breathTime, sea: seaState, near } = frame;
      // Sea body: the water breath opens the lowpass and lifts the level; every
      // breath carries its own seeded height, and a "set" of two bigger waves
      // arrives about every six. Per-cycle heights cross-fade in the trough.
      const b = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.water);
      const cyclePosition = breathTime / GARDEN_BREATH_SECONDS + 0.2 + GARDEN_BREATH_PHASE.water;
      const cycle = Math.floor(cyclePosition);
      const blend = smoothstep(0.85, 1, cyclePosition - cycle);
      const heightDb = cycleHeightDb(cycle) + (cycleHeightDb(cycle + 1) - cycleHeightDb(cycle)) * blend;
      const depthDb = frame.still
        ? AUDIO_MASTER.breathDepthDb.still
        : AUDIO_MASTER.breathDepthDb.calm + (AUDIO_MASTER.breathDepthDb.storm - AUDIO_MASTER.breathDepthDb.calm) * seaState;
      let modulationPower = 0;
      for (const shape of breathShape) modulationPower += dbToGain(depthDb * (2 * shape - 1)) ** 2;
      const modulationRms = Math.sqrt(modulationPower / BREATH_SAMPLES);
      // Over the chart the near shore falls away: the open sea is wider, lower and hushed.
      const seaDb = stemLevelDb("sea", seaState) - 3 * (1 - near) + heightDb;
      const seaCutoff = (380 + 520 * b * (0.6 + 0.4 * seaState)) * (1 - 0.2 * frame.beaconPresence) * (1 - 0.15 * (1 - near));
      sea.stages[0]!.frequency = seaCutoff;
      sea.stages[1]!.frequency = seaCutoff;
      drive(sea, at, dbToGain(seaDb + depthDb * (2 * b - 1)) / modulationRms / graph.noisePassRms(sea.stages), seaCutoff, null);
      targets?.("sea", seaDb);

      // Wash: the same breath a tenth of a cycle later, hissing at the crest.
      const washBreath = gardenBreathAt(breathTime, GARDEN_BREATH_PHASE.water + 0.1);
      const washDb = stemLevelDb("wash", seaState) + 20 * Math.log10(0.3 + 0.7 * near) + heightDb;
      drive(wash, at, dbToGain(washDb) * (washBreath * washBreath) / Math.sqrt(washPowerMean) / graph.noisePassRms(wash.stages), null, null);
      targets?.("wash", washDb);

      // Wind: the one wind's speed sets its colour and level; the gust lifts it
      // and its front crosses the stereo field from the upwind side, as the flags do.
      const gust = 0.5 * (frame.gustLeft + frame.gustRight);
      const windX = Math.min(1, Math.max(0, (frame.windSpeed - 0.29) / 0.6));
      const windDb = stemLevelDb("wind", windX) + AUDIO_MASTER.gustBoostDb * gust;
      const windPan = Math.max(-0.7, Math.min(0.7, ((frame.gustRight - frame.gustLeft) / Math.max(0.05, frame.gustLeft + frame.gustRight)) * 1.4));
      wind.stages[0]!.frequency = 250 + 850 * frame.windSpeed + 200 * gust;
      drive(wind, at, dbToGain(windDb) / graph.noisePassRms(wind.stages), wind.stages[0]!.frequency, windPan);
      targets?.("wind", windDb);

      const whistleX = smoothstep(0.65, 0.95, frame.windSpeed);
      const whistleDb = stemLevelDb("whistle", whistleX) + 0.5 * AUDIO_MASTER.gustBoostDb * gust;
      whistle.stages[0]!.frequency = 620 + 260 * whistleX + 60 * gust;
      drive(whistle, at, dbToGain(whistleDb) / graph.noisePassRms(whistle.stages), whistle.stages[0]!.frequency, windPan);
      targets?.("whistle", whistleDb);

      // Night air under the beacon: each time the beam turns toward the eye the
      // air brightens a hair — the PSI-set sweep tempo, heard.
      const airDb = frame.beaconPresence > 0.01
        ? stemLevelDb("air", seaState) + 20 * Math.log10(frame.beaconPresence) + AUDIO_MASTER.beaconPassDb * smoothstep(0.8, 0.98, frame.beamFacing)
        : Number.NEGATIVE_INFINITY;
      drive(air, at, dbToGain(airDb) / graph.noisePassRms(air.stages), null, null);
      targets?.("air", airDb);

      scheduleLaps(frame, near > 0.02 ? stemLevelDb("lap", seaState) + 20 * Math.log10(near) : Number.NEGATIVE_INFINITY, targets);
      primed = true;
    },
  };
}

/** 1 at the rest seat (eye ≈ 17 u over the water), 0 over the whole-map chart. */
export function nearDetailForEyeHeight(eyeHeight: number): number {
  return 1 - smoothstep(LN_REST_EYE, LN_CHART_EYE, Math.log(Math.max(1, eyeHeight)));
}

function cycleHeightDb(cycle: number): number {
  const spread = (hash01(cycle) * 2 - 1) * AUDIO_MASTER.breathSpreadDb;
  const group = Math.floor(cycle / 6);
  const setStart = Math.floor(hash01(group + 7919) * 5);
  const inSet = cycle - group * 6 - setStart;
  return spread + (inSet === 0 || inSet === 1 ? AUDIO_MASTER.setBoostDb : 0);
}

/**
 * Stone lap: a small bubble (a sine whose pitch rises as it closes) over a
 * band of noise, 60–180 ms, placed on the stones around the seat.
 */
function playLap(graph: AudioGraph, when: number, peakDb: number, seed: number): boolean {
  const { ctx } = graph;
  const duration = 0.06 + 0.12 * hash01(seed * 7 + 1);
  if (!claimVoice(graph, when, when + duration + 0.2)) return false;
  const bubble = ctx.createOscillator();
  const panValue = (hash01(seed * 7 + 4) * 2 - 1) * 0.35;
  const peak = dbToGain(peakDb) * panPeakCompensation(panValue);
  const pitch = 700 + 900 * hash01(seed * 7 + 2);
  bubble.frequency.setValueAtTime(pitch, when);
  bubble.frequency.exponentialRampToValueAtTime(pitch * 1.35, when + duration);
  const bubbleGain = ctx.createGain();
  bubbleGain.gain.setValueAtTime(0, when);
  bubbleGain.gain.linearRampToValueAtTime(peak * 0.9, when + 0.004);
  bubbleGain.gain.setTargetAtTime(0, when + 0.004, duration / 4);

  const splash = ctx.createBufferSource();
  splash.buffer = graph.noise;
  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 700 + 1500 * hash01(seed * 7 + 3);
  band.Q.value = 2.2;
  foldToMono(band);
  const splashGain = ctx.createGain();
  const splashPeak = (peak * 0.25 * Math.SQRT2) / (NOISE_BURST_CREST * graph.noisePassRms([{ type: "bandpass", frequency: band.frequency.value, q: 2.2 }]));
  splashGain.gain.setValueAtTime(0, when);
  splashGain.gain.linearRampToValueAtTime(splashPeak, when + 0.008);
  splashGain.gain.setTargetAtTime(0, when + 0.008, duration / 3);

  const pan = ctx.createStereoPanner();
  pan.pan.value = panValue;
  bubble.connect(bubbleGain).connect(pan);
  splash.connect(band).connect(splashGain).connect(pan);
  pan.connect(graph.stems.lap);
  bubble.start(when);
  bubble.stop(when + duration + 0.2);
  splash.start(when, hash01(seed * 7 + 5) * 7);
  splash.stop(when + duration + 0.2);
  return true;
}
