import { SphericalHarmonics3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DAY_CYCLE_LIGHT_PRESETS, dayCycleBeats, dayCyclePhase } from "./garden-day-cycle";
import {
  gardenEnvironmentIntensityForBeats,
  GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS,
  GARDEN_ENVIRONMENT_MIN_BAKE_SECONDS,
  GARDEN_ENVIRONMENT_SH_DEADLINE_SECONDS,
  advanceGardenEnvironmentDrift,
  gardenEnvironmentDriftTaus,
  gardenEnvironmentIntensityForSwap,
  gardenEnvironmentPhaseKey,
  resolveGardenEnvironmentStormBand,
  shouldBakeGardenEnvironment,
  writeGardenEnvironmentProbeSH,
  resolveGardenEnvironmentRadianceBand,
} from "./garden-environment";

const DAY_INTENSITY = gardenEnvironmentIntensityForBeats(dayCycleBeats(12));
const RADIANCE = {
  date: 2461318, clarity: 1, cloudCover: 0.05, sunDir: new Vector3(0.4, 0.6, -0.5).normalize(),
  moonDir: new Vector3(0.6, 0.3, -0.4).normalize(), moonIllumination: 0.6,
};

/**
 * The bake itself needs a live WebGL2 context, so what is testable here is the
 * CACHE KEY — which is also the part that decides whether the probe is rebuilt
 * a handful of times an hour or once a frame. `world-renderer.test.ts` asserts
 * the renderer honours it.
 */
describe("gardenEnvironmentPhaseKey", () => {
  it("tracks midday solar direction/date and displayed accepted clarity, even during a flat phase", () => {
    const phase = dayCyclePhase(12);
    const noon = gardenEnvironmentPhaseKey(phase, 0, RADIANCE);
    expect(gardenEnvironmentPhaseKey(phase, 0, { ...RADIANCE, sunDir: new Vector3(-0.4, 0.6, -0.5).normalize() })).not.toBe(noon);
    expect(gardenEnvironmentPhaseKey(phase, 0, { ...RADIANCE, date: RADIANCE.date + 1 })).not.toBe(noon);
    expect(gardenEnvironmentPhaseKey(phase, 0, { ...RADIANCE, clarity: -1 })).not.toBe(noon);
    expect(gardenEnvironmentPhaseKey(phase, 0, { ...RADIANCE, sunDir: RADIANCE.sunDir.clone().addScalar(0.0001) })).toBe(noon);
  });

  it("distinguishes closed low cloud from overcast even when signed aerosol clarity is equally saturated", () => {
    for (const hour of [0, 12]) {
      const phase = dayCyclePhase(hour);
      const crisis = { ...RADIANCE, clarity: -1, cloudCover: 0.74 };
      const meltdown = { ...RADIANCE, clarity: -1, cloudCover: 0.9 };
      expect(gardenEnvironmentPhaseKey(phase, 0, crisis)).not.toBe(gardenEnvironmentPhaseKey(phase, 0, meltdown));
      expect(gardenEnvironmentPhaseKey(phase, 0, { ...crisis, cloudCover: 0.7401 })).toBe(gardenEnvironmentPhaseKey(phase, 0, crisis));
    }
  });

  it("resolves the first sparse ready cirrus field from a pre-asset probe", () => {
    const empty = { ...RADIANCE, cloudCover: 0 };
    const readyBand = resolveGardenEnvironmentRadianceBand(0, 0.05, 20);
    expect(readyBand).toBe(1);
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(12), 0, empty)).not.toBe(
      gardenEnvironmentPhaseKey(dayCyclePhase(12), 0, { ...RADIANCE, cloudCover: readyBand / 20 }),
    );
    expect(resolveGardenEnvironmentRadianceBand(readyBand, 0.0501, 20)).toBe(readyBand);
  });

  it("keys night lunar lighting, without baking for the invisible solar bearing", () => {
    const night = dayCyclePhase(0);
    const key = gardenEnvironmentPhaseKey(night, 0, RADIANCE);
    expect(gardenEnvironmentPhaseKey(night, 0, { ...RADIANCE, moonIllumination: 0 })).not.toBe(key);
    expect(gardenEnvironmentPhaseKey(night, 0, { ...RADIANCE, moonDir: new Vector3(-0.6, 0.3, -0.4).normalize() })).not.toBe(key);
    expect(gardenEnvironmentPhaseKey(night, 0, { ...RADIANCE, sunDir: new Vector3(1, 0, 0) })).toBe(key);
  });

  it("hysteretically holds direction/clarity/lunar bins at rounding edges but accepts material changes", () => {
    let band = resolveGardenEnvironmentRadianceBand(null, 0.49, 10);
    expect(band).toBe(5);
    for (const value of [0.549, 0.551, 0.549, 0.551]) {
      band = resolveGardenEnvironmentRadianceBand(band, value, 10);
      expect(band).toBe(5);
    }
    expect(resolveGardenEnvironmentRadianceBand(band, 0.57, 10)).toBe(6);
    expect(resolveGardenEnvironmentRadianceBand(6, 0.53, 10)).toBe(5);
    expect(resolveGardenEnvironmentRadianceBand(null, Number.NaN, 12)).toBe(0);
  });

  it("separates the three states the environment exists to tell apart", () => {
    const keys = [dayCyclePhase(12), dayCyclePhase(18), dayCyclePhase(23)]
      .map((phase) => gardenEnvironmentPhaseKey(phase, 0, RADIANCE));
    expect(new Set(keys).size).toBe(3);
  });

  it("bounds phase quantization when the control sweeps a day with fixed radiance inputs", () => {
    const keys = new Set<string>();
    for (let hour = 0; hour < 24; hour += 0.01) {
      keys.add(gardenEnvironmentPhaseKey(dayCyclePhase(hour), 0, RADIANCE));
    }
    expect(keys.size).toBeLessThanOrEqual(48);
  });

  it("rebakes through the evening ramp, so the ember horizon reaches the metal", () => {
    const keys = new Set<string>();
    for (let hour = 16.5; hour <= 21.25; hour += 0.1) {
      keys.add(gardenEnvironmentPhaseKey(dayCyclePhase(hour), 0, RADIANCE));
    }
    // The steepest part of the cycle. One key here would mean the dusk sky
    // never reached the bronze it is supposed to light.
    expect(keys.size).toBeGreaterThan(10);
  });

  it("clamps rather than throwing on an out-of-range phase", () => {
    expect(gardenEnvironmentPhaseKey({ daylight: 2, dusk: -1, night: 0 }, 0, RADIANCE)).toMatch(/^10:0:0:/);
    // The storm term (Phase 2) joins the key, coarsely quantised and clamped.
    expect(gardenEnvironmentPhaseKey({ daylight: 2, dusk: -1, night: 0 }, 7, RADIANCE)).toMatch(/^10:0:4:/);
  });

  it("scales reflection strength with the five illumination beats", () => {
    const beat = (name: "dawn" | "day" | "golden" | "blue" | "night") => ({
      dawn: 0, day: 0, golden: 0, blue: 0, night: 0, [name]: 1,
    });
    // Reflection energy ranks with illumination: day, golden, dawn, blue, night.
    const ranked = (["day", "golden", "dawn", "blue", "night"] as const)
      .map((name) => gardenEnvironmentIntensityForBeats(beat(name)));
    for (let index = 1; index < ranked.length; index += 1) expect(ranked[index]).toBeLessThan(ranked[index - 1]!);
    expect(ranked.at(-1)).toBeGreaterThan(0);
    // A crossfade blends the two beats' strengths, never overshooting either.
    expect(gardenEnvironmentIntensityForBeats({ dawn: 0.5, day: 0.5, golden: 0, blue: 0, night: 0 }))
      .toBeCloseTo((gardenEnvironmentIntensityForBeats(beat("dawn")) + ranked[0]!) / 2);
  });

  it("keeps the moon-independent night environment continuous with blue-hour diffuse", () => {
    const blue = gardenEnvironmentIntensityForBeats({ dawn: 0, day: 0, golden: 0, blue: 1, night: 0 });
    const night = gardenEnvironmentIntensityForBeats({ dawn: 0, day: 0, golden: 0, blue: 0, night: 1 });
    expect(night).toBeGreaterThan(0);
    expect(night).toBeLessThan(blue);
    for (const weight of [0, 0.25, 0.5, 0.75, 1]) {
      expect(gardenEnvironmentIntensityForBeats({
        dawn: 0, day: 0, golden: 0, blue: 1 - weight, night: weight,
      })).toBeCloseTo(blue * (1 - weight) + night * weight, 12);
    }
  });

  it("does not rebake across a steady storm's breathing boundary", () => {
    let band: number | null = null;
    const visited: number[] = [];
    for (let seconds = 0; seconds <= 1_000; seconds += 0.5) {
      const stormLevel = 0.875 * (
        1 + 0.05 * Math.sin((Math.PI * 2 * seconds) / 167 + 0.6)
      );
      const next = resolveGardenEnvironmentStormBand(band, stormLevel);
      if (next !== band) visited.push(next);
      band = next;
    }

    expect(visited).toEqual([4]);
  });

  it("moves hysteretic storm bands on material risk-state changes", () => {
    let band = resolveGardenEnvironmentStormBand(null, 0.1);
    expect(band).toBe(0);
    band = resolveGardenEnvironmentStormBand(band, 0.2);
    expect(band).toBe(1);
    band = resolveGardenEnvironmentStormBand(band, 0.7);
    expect(band).toBe(3);
    band = resolveGardenEnvironmentStormBand(band, 0.2);
    expect(band).toBe(1);
  });
});

/**
 * W1.5. The bake is still the same bake; what is new is WHICH frame pays for it
 * and what the ambient does in between. Both are pure functions here, because
 * both are the parts that would otherwise only be checkable by watching a dawn.
 */
describe("garden environment bake cadence", () => {
  const steady = {
    bakePending: false,
    hasProbe: true,
    keyChanged: true,
    lowLoad: true,
    reducedMotion: false,
    secondsSinceBake: 60,
    wantedSeconds: 0,
  };

  it("bakes the first probe of a session immediately, whatever the frame costs", () => {
    // There is no probe, so every metal in the world is currently reflecting
    // nothing at all. Waiting for a quiet frame here would ship the flat dark
    // bronze this module exists to fix, for as long as the wait lasted.
    expect(shouldBakeGardenEnvironment({
      ...steady,
      hasProbe: false,
      lowLoad: false,
      secondsSinceBake: 0,
    })).toBe(true);
  });

  it("bakes the reduced-motion still frame immediately — there is no later frame", () => {
    expect(shouldBakeGardenEnvironment({
      ...steady,
      lowLoad: false,
      reducedMotion: true,
      secondsSinceBake: 0,
    })).toBe(true);
  });

  it("never bakes for a key the live probe already holds", () => {
    expect(shouldBakeGardenEnvironment({ ...steady, keyChanged: false })).toBe(false);
    expect(shouldBakeGardenEnvironment({
      ...steady,
      keyChanged: false,
      hasProbe: false,
    })).toBe(false);
  });

  it("waits for a quiet frame, and stops waiting before anyone could notice", () => {
    const loaded = { ...steady, lowLoad: false };
    expect(shouldBakeGardenEnvironment(loaded)).toBe(false);
    expect(shouldBakeGardenEnvironment({
      ...loaded,
      wantedSeconds: GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS,
    })).toBe(true);
  });

  it("does not start a second bake while one is held for its harmonic", () => {
    expect(shouldBakeGardenEnvironment({ ...steady, bakePending: true })).toBe(false);
    // Not even at the defer deadline: the deadline releases the HELD bake, and
    // stacking a second one behind it would leak the first's render target.
    expect(shouldBakeGardenEnvironment({
      ...steady,
      bakePending: true,
      lowLoad: false,
      wantedSeconds: GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS * 4,
    })).toBe(false);
  });

  it("costs a handful of bakes for a time-control drag across a whole day", () => {
    // The key alone bounds the drag to 41 bakes (see above) because that is how
    // many distinct keys a day holds — it cannot tell a two-second sweep from a
    // two-hour one. The real-time floor can: at 120 fps the same sweep is a few
    // bakes, and because the wanted key is always the latest, it still lands on
    // the right sky.
    //
    // The load gate is OPEN throughout: a time-control drag is not camera
    // intent, so the frames are ordinary healthy ones and it is the floor, not
    // the gate, doing the bounding.
    const frameSeconds = 1 / 120;
    let secondsSinceBake = 60;
    let wantedSeconds = 0;
    let bakes = 0;
    // Two seconds of dragging, which is a brisk sweep of the whole control.
    for (let frame = 0; frame < 240; frame += 1) {
      secondsSinceBake += frameSeconds;
      wantedSeconds += frameSeconds;
      if (shouldBakeGardenEnvironment({
        ...steady,
        secondsSinceBake,
        wantedSeconds,
      })) {
        bakes += 1;
        secondsSinceBake = 0;
        wantedSeconds = 0;
      }
    }
    expect(bakes).toBeGreaterThan(0);
    expect(bakes).toBeLessThanOrEqual(3);
  });

  it("keeps the harmonic deadline shorter than the wait for a quiet frame", () => {
    // A held bake must not be able to outlive the cadence that produced it, or
    // a loaded machine could stack a deferred bake behind an undelivered one.
    expect(GARDEN_ENVIRONMENT_SH_DEADLINE_SECONDS)
      .toBeLessThan(GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS);
    expect(GARDEN_ENVIRONMENT_MIN_BAKE_SECONDS)
      .toBeLessThan(GARDEN_ENVIRONMENT_MAX_DEFER_SECONDS);
  });
});

describe("garden environment ambient drift", () => {
  const taus = gardenEnvironmentDriftTaus();

  it("settles monotonically and reaches an exact rest", () => {
    let drift = 1;
    let previous = drift;
    let frames = 0;
    while (drift > 0 && frames < 2_000) {
      drift = advanceGardenEnvironmentDrift(drift, 1 / 120, taus.sh);
      expect(drift).toBeLessThan(previous);
      previous = drift;
      frames += 1;
    }
    // Exactly zero, not asymptotically near it: "at rest" has to be a state the
    // probe can actually be IN, because that is the state whose energy budget
    // is claimed to be unchanged.
    expect(drift).toBe(0);
    const settleSeconds = frames / 120;
    expect(settleSeconds).toBeGreaterThan(2);
    expect(settleSeconds).toBeLessThan(8);
  });

  it("lands the specular dip well before the diffuse walk finishes", () => {
    // The dip modulates the WHOLE environment term, so a slow one would be its
    // own artefact — metals visibly dulling — traded for the small step it is
    // meant to soften.
    expect(taus.swap).toBeLessThan(taus.sh / 2);
  });

  it("draws the still frame settled rather than part-way through an ease", () => {
    expect(advanceGardenEnvironmentDrift(1, 1 / 120, taus.sh, true)).toBe(0);
    expect(advanceGardenEnvironmentDrift(1, 0, taus.swap, true)).toBe(0);
  });

  it("holds still for a caller with no clock instead of jumping", () => {
    expect(advanceGardenEnvironmentDrift(1, 0, taus.sh)).toBe(1);
    expect(advanceGardenEnvironmentDrift(1, Number.NaN, taus.sh)).toBe(1);
  });

  it("dips each beat only at the swap without erasing its reflections", () => {
    for (const hour of [6, 12, 17.25, 19, 23]) {
      const base = gardenEnvironmentIntensityForBeats(dayCycleBeats(hour));
      expect(gardenEnvironmentIntensityForSwap(0, base)).toBe(base);
      const dipped = gardenEnvironmentIntensityForSwap(1, base);
      expect(dipped).toBeLessThan(base);
      expect(dipped).toBeGreaterThan(base * 0.6);
      for (const drift of [-1, 0.25, 0.5, 2]) {
        const intensity = gardenEnvironmentIntensityForSwap(drift, base);
        expect(intensity).toBeLessThanOrEqual(base);
        expect(intensity).toBeGreaterThanOrEqual(dipped);
      }
    }
  });
});

describe("garden environment light probe", () => {
  function harmonic(scale: number): SphericalHarmonics3 {
    const sh = new SphericalHarmonics3();
    for (let index = 0; index < 9; index += 1) {
      sh.coefficients[index]!.set(scale * (index + 1), scale * (index + 2), scale * (index + 3));
    }
    return sh;
  }

  /** What a material actually sees: the probe plus the environment's own half. */
  function totalAmbient(
    probe: SphericalHarmonics3,
    baked: SphericalHarmonics3,
    environmentIntensity: number,
  ): Vector3[] {
    return probe.coefficients.map((coefficient, index) => coefficient
      .clone()
      .addScaledVector(baked.coefficients[index]!, environmentIntensity));
  }

  it("contributes no extra energy at rest in any illumination beat", () => {
    const baked = harmonic(0.37);
    const probe = new SphericalHarmonics3();
    for (const hour of [6, 12, 17.25, 19, 23]) {
      const base = gardenEnvironmentIntensityForBeats(dayCycleBeats(hour));
      writeGardenEnvironmentProbeSH(probe, baked, baked, 0, base, base);
      for (const coefficient of probe.coefficients) {
        expect(coefficient.x).toBe(0);
        expect(coefficient.y).toBe(0);
        expect(coefficient.z).toBe(0);
      }
    }
  });

  it("cancels the swap exactly, so the diffuse crosses without a step", () => {
    // The frame of the swap: the environment has already jumped to the new sky,
    // and what a surface receives must still be the OLD one.
    const previous = harmonic(1);
    const baked = harmonic(2.5);
    const probe = new SphericalHarmonics3();
    const intensity = gardenEnvironmentIntensityForSwap(1, DAY_INTENSITY);
    writeGardenEnvironmentProbeSH(probe, previous, baked, 1, intensity, DAY_INTENSITY);

    const total = totalAmbient(probe, baked, intensity);
    total.forEach((received, index) => {
      const wanted = previous.coefficients[index]!
        .clone()
        .multiplyScalar(DAY_INTENSITY);
      expect(received.x).toBeCloseTo(wanted.x, 12);
      expect(received.y).toBeCloseTo(wanted.y, 12);
      expect(received.z).toBeCloseTo(wanted.z, 12);
    });
  });

  it("walks between the two skies without ever exceeding either", () => {
    // No phase double-brightens, at any point of the transition, including
    // through the specular dip: the sum is a plain interpolation of the two
    // endpoints and nothing else.
    const previous = harmonic(1);
    const baked = harmonic(2.5);
    const probe = new SphericalHarmonics3();
    for (const drift of [1, 0.75, 0.5, 0.25, 0]) {
      const intensity = gardenEnvironmentIntensityForSwap(drift, DAY_INTENSITY);
      writeGardenEnvironmentProbeSH(probe, previous, baked, drift, intensity, DAY_INTENSITY);
      const total = totalAmbient(probe, baked, intensity);
      total.forEach((received, index) => {
        const from = previous.coefficients[index]!.x * DAY_INTENSITY;
        const to = baked.coefficients[index]!.x * DAY_INTENSITY;
        expect(received.x).toBeCloseTo(to + (from - to) * drift, 12);
        expect(received.x).toBeGreaterThanOrEqual(Math.min(from, to) - 1e-9);
        expect(received.x).toBeLessThanOrEqual(Math.max(from, to) + 1e-9);
      });
    }
  });

  it("writes in place, so the frame loop allocates nothing", () => {
    const probe = new SphericalHarmonics3();
    const vectors = probe.coefficients.map((coefficient) => coefficient);
    writeGardenEnvironmentProbeSH(probe, harmonic(1), harmonic(2), 0.5, 0.5, DAY_INTENSITY);
    probe.coefficients.forEach((coefficient, index) => {
      expect(coefficient).toBe(vectors[index]);
    });
  });

  it("stays subordinate to analytic fill throughout the light score", () => {
    for (let minute = 0; minute < 1440; minute += 1) {
      const beats = dayCycleBeats(minute / 60);
      let analyticFill = 0;
      for (const name of Object.keys(beats) as (keyof typeof beats)[]) {
        const preset = DAY_CYCLE_LIGHT_PRESETS[name];
        analyticFill += beats[name] * (preset.hemiIntensity + preset.ambientIntensity);
      }
      expect(gardenEnvironmentIntensityForBeats(beats)).toBeLessThan(analyticFill);
    }
  });
});
