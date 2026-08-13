import { SphericalHarmonics3, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { DAY_CYCLE_LIGHT_PRESETS, dayCyclePhase } from "./garden-day-cycle";
import {
  GARDEN_ENVIRONMENT_INTENSITY,
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
} from "./garden-environment";

/**
 * The bake itself needs a live WebGL2 context, so what is testable here is the
 * CACHE KEY — which is also the part that decides whether the probe is rebuilt
 * a handful of times an hour or once a frame. `world-renderer.test.ts` asserts
 * the renderer honours it.
 */
describe("gardenEnvironmentPhaseKey", () => {
  it("holds one key across the long flat middle of day and of night", () => {
    // The sky does not move between 11:00 and 14:00, and neither should the
    // probe: this is the case that would otherwise bake on every frame of a
    // visitor's whole afternoon.
    const noon = gardenEnvironmentPhaseKey(dayCyclePhase(12));
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(11))).toBe(noon);
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(14))).toBe(noon);

    const midnight = gardenEnvironmentPhaseKey(dayCyclePhase(0));
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(1.5))).toBe(midnight);
    expect(gardenEnvironmentPhaseKey(dayCyclePhase(23))).toBe(midnight);
  });

  it("separates the three states the environment exists to tell apart", () => {
    const keys = [dayCyclePhase(12), dayCyclePhase(18), dayCyclePhase(23)]
      .map(gardenEnvironmentPhaseKey);
    expect(new Set(keys).size).toBe(3);
  });

  it("costs a bounded number of bakes for a whole day, dragged end to end", () => {
    // The worst case is not the wall clock — which crosses a step every ~35
    // minutes — but a visitor sweeping the time control from midnight to
    // midnight, which walks the entire cycle in a few seconds of frames. What
    // bounds that is the number of DISTINCT keys the day contains, because the
    // probe can only bake when the key changes, so the sweep costs the same 41
    // bakes whether it takes two seconds or two hours.
    const keys = new Set<string>();
    for (let hour = 0; hour < 24; hour += 0.01) {
      keys.add(gardenEnvironmentPhaseKey(dayCyclePhase(hour)));
    }
    expect(keys.size).toBe(41);
  });

  it("rebakes through the evening ramp, so the ember horizon reaches the metal", () => {
    const keys = new Set<string>();
    for (let hour = 16.5; hour <= 21.25; hour += 0.1) {
      keys.add(gardenEnvironmentPhaseKey(dayCyclePhase(hour)));
    }
    // The steepest part of the cycle. One key here would mean the dusk sky
    // never reached the bronze it is supposed to light.
    expect(keys.size).toBeGreaterThan(10);
  });

  it("clamps rather than throwing on an out-of-range phase", () => {
    expect(gardenEnvironmentPhaseKey({ daylight: 2, dusk: -1, night: 0 })).toBe("10:0:0");
    // The storm term (Phase 2) joins the key, coarsely quantised and clamped.
    expect(gardenEnvironmentPhaseKey({ daylight: 2, dusk: -1, night: 0 }, 7)).toBe("10:0:4");
  });

  it("keeps the probe inside the strength range measured against the real GPU", () => {
    // The module header carries the measured table. 1.0 is the strongest value
    // that was actually captured and checked for a re-wash, so shipping above it
    // would be claiming a calibration nobody has looked at.
    expect(GARDEN_ENVIRONMENT_INTENSITY).toBeGreaterThan(0);
    expect(GARDEN_ENVIRONMENT_INTENSITY).toBeLessThanOrEqual(1);
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

  it("dips the environment only at the swap, and never past the calibrated strength", () => {
    expect(gardenEnvironmentIntensityForSwap(0)).toBe(GARDEN_ENVIRONMENT_INTENSITY);
    const dipped = gardenEnvironmentIntensityForSwap(1);
    expect(dipped).toBeLessThan(GARDEN_ENVIRONMENT_INTENSITY);
    // A dip, not a cut: the metals keep most of their reflection through it.
    expect(dipped).toBeGreaterThan(GARDEN_ENVIRONMENT_INTENSITY * 0.6);
    for (const drift of [-1, 0.25, 0.5, 2]) {
      const intensity = gardenEnvironmentIntensityForSwap(drift);
      expect(intensity).toBeLessThanOrEqual(GARDEN_ENVIRONMENT_INTENSITY);
      expect(intensity).toBeGreaterThanOrEqual(dipped);
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

  it("contributes nothing at all at rest — which is the whole energy audit", () => {
    // Every steady frame in the world is this one. If the probe is not exactly
    // zero here then W1.5 changed the brightness of every phase, and it was
    // only ever supposed to change what happens BETWEEN them.
    const baked = harmonic(0.37);
    const probe = new SphericalHarmonics3();
    writeGardenEnvironmentProbeSH(probe, baked, baked, 0, GARDEN_ENVIRONMENT_INTENSITY);
    for (const coefficient of probe.coefficients) {
      expect(coefficient.x).toBe(0);
      expect(coefficient.y).toBe(0);
      expect(coefficient.z).toBe(0);
    }
  });

  it("cancels the swap exactly, so the diffuse crosses without a step", () => {
    // The frame of the swap: the environment has already jumped to the new sky,
    // and what a surface receives must still be the OLD one.
    const previous = harmonic(1);
    const baked = harmonic(2.5);
    const probe = new SphericalHarmonics3();
    const intensity = gardenEnvironmentIntensityForSwap(1);
    writeGardenEnvironmentProbeSH(probe, previous, baked, 1, intensity);

    const total = totalAmbient(probe, baked, intensity);
    total.forEach((received, index) => {
      const wanted = previous.coefficients[index]!
        .clone()
        .multiplyScalar(GARDEN_ENVIRONMENT_INTENSITY);
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
      const intensity = gardenEnvironmentIntensityForSwap(drift);
      writeGardenEnvironmentProbeSH(probe, previous, baked, drift, intensity);
      const total = totalAmbient(probe, baked, intensity);
      total.forEach((received, index) => {
        const from = previous.coefficients[index]!.x * GARDEN_ENVIRONMENT_INTENSITY;
        const to = baked.coefficients[index]!.x * GARDEN_ENVIRONMENT_INTENSITY;
        expect(received.x).toBeCloseTo(to + (from - to) * drift, 12);
        expect(received.x).toBeGreaterThanOrEqual(Math.min(from, to) - 1e-9);
        expect(received.x).toBeLessThanOrEqual(Math.max(from, to) + 1e-9);
      });
    }
  });

  it("writes in place, so the frame loop allocates nothing", () => {
    const probe = new SphericalHarmonics3();
    const vectors = probe.coefficients.map((coefficient) => coefficient);
    writeGardenEnvironmentProbeSH(probe, harmonic(1), harmonic(2), 0.5, 0.5);
    probe.coefficients.forEach((coefficient, index) => {
      expect(coefficient).toBe(vectors[index]);
    });
  });

  it("stays a minor term next to the analytic ambient it sits beside", () => {
    // The energy audit's other half. `updateDayCycle` blends the hemisphere and
    // ambient lights off the RAW phase every frame, so they never stepped and
    // are not touched here; what matters is that the probe's strength stays the
    // small correction the measured table calls for rather than growing into a
    // second fill light while nobody was looking.
    for (const preset of Object.values(DAY_CYCLE_LIGHT_PRESETS)) {
      const analyticFill = preset.hemiIntensity + preset.ambientIntensity;
      expect(GARDEN_ENVIRONMENT_INTENSITY).toBeLessThan(analyticFill);
    }
  });
});
