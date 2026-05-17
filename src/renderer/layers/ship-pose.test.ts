import { describe, expect, it } from "vitest";
import type { ShipMotionSample, ShipMotionState } from "../../systems/motion";
import { seaStateForSources } from "../../systems/sea-state";
import { resolveShipPose, shipPosePersonalityBias, type ShipPose } from "./ship-pose";

describe("ship pose", () => {
  it("returns zeroed pose values for reduced motion", () => {
    expect(resolveShipPose({
      phase: 0.7,
      reducedMotion: true,
      sample: sample({ state: "sailing", wakeIntensity: 0.8, zone: "danger" }),
      shipId: "usdc-circle",
      timeSeconds: 42,
      visualSizeTier: "titan",
      zoom: 1.5,
    })).toEqual({
      bobPixels: 0,
      bowWake: 0,
      lanternAlpha: 0,
      mooringTension: 0,
      rollRadians: 0,
      sailFlutter: 0,
      sternChurn: 0,
    });
  });

  it("makes titan transit stronger than moored pose and moored stronger than risk drift", () => {
    const input = {
      phase: 1.1,
      reducedMotion: false,
      shipId: "usdt-tether",
      timeSeconds: 17.5,
      visualSizeTier: "titan" as const,
      zoom: 1.4,
    };
    const transit = resolveShipPose({ ...input, sample: sample({ state: "sailing", wakeIntensity: 0.68, zone: "warning" }) });
    const moored = resolveShipPose({ ...input, sample: sample({ state: "moored", wakeIntensity: 0.05, zone: "warning" }) });
    const riskDrift = resolveShipPose({ ...input, sample: sample({ state: "risk-drift", wakeIntensity: 0.08, zone: "warning" }) });

    expect(motionStrength(transit)).toBeGreaterThan(motionStrength(moored));
    expect(motionStrength(moored)).toBeGreaterThan(motionStrength(riskDrift));
  });

  it("only exposes bow wake during titan transit states", () => {
    for (const state of ["departing", "sailing", "arriving"] as const) {
      expect(resolveShipPose({
        phase: 0.2,
        reducedMotion: false,
        sample: sample({ state, wakeIntensity: 0.55 }),
        shipId: `usdc-circle-${state}`,
        timeSeconds: 9,
        visualSizeTier: "titan",
        zoom: 1,
      }).bowWake).toBeGreaterThan(0);
    }

    for (const state of ["idle", "moored", "risk-drift"] as const) {
      expect(resolveShipPose({
        phase: 0.2,
        reducedMotion: false,
        sample: sample({ state, wakeIntensity: 0.55 }),
        shipId: `usdc-circle-${state}`,
        timeSeconds: 9,
        visualSizeTier: "titan",
        zoom: 1,
      }).bowWake).toBe(0);
    }
  });

  it("only exposes mooring tension while titan ships are moored", () => {
    const base = {
      phase: 0.4,
      reducedMotion: false,
      shipId: "usds-sky",
      timeSeconds: 21,
      visualSizeTier: "titan" as const,
      zoom: 1.2,
    };

    expect(resolveShipPose({ ...base, sample: sample({ state: "moored" }) }).mooringTension).toBeGreaterThan(0);
    expect(resolveShipPose({ ...base, sample: sample({ state: "sailing" }) }).mooringTension).toBe(0);
    expect(resolveShipPose({ ...base, sample: sample({ state: "risk-drift" }) }).mooringTension).toBe(0);
  });

  it("returns the same pose for repeated deterministic inputs", () => {
    const input = {
      phase: 2.4,
      reducedMotion: false,
      sample: sample({ state: "arriving", wakeIntensity: 0.42, zone: "alert" }),
      shipId: "usdc-circle",
      timeSeconds: 88.125,
      visualSizeTier: "titan" as const,
      zoom: 1.75,
    };

    expect(resolveShipPose(input)).toEqual(resolveShipPose(input));
  });

  it("uses sea-state swell as a roughness multiplier for titan pose", () => {
    const base = {
      phase: 0,
      reducedMotion: false,
      sample: sample({ state: "sailing", wakeIntensity: 0.4, zone: "danger" }),
      shipId: "usdc-circle",
      timeSeconds: 1.2,
      visualSizeTier: "titan" as const,
      zoom: 1,
    };
    const calmSea = seaStateForSources({
      areas: [{ band: "CALM", count: 1 }],
      lighthouse: { psiBand: "STEADY", score: 12, unavailable: false },
      wallClockHour: 12,
    });
    const stormSea = seaStateForSources({
      areas: [{ band: "DANGER", count: 1 }],
      lighthouse: { psiBand: "DANGER", score: 90, unavailable: false },
      wallClockHour: 23,
    });

    const calmPose = resolveShipPose({ ...base, seaState: calmSea });
    const stormPose = resolveShipPose({ ...base, seaState: stormSea });

    expect(stormPose.bowWake).toBeGreaterThan(calmPose.bowWake);
    expect(stormPose.sternChurn).toBeGreaterThan(calmPose.sternChurn);
  });

  it("keeps per-ship personality bias deterministic and within tuned ranges", () => {
    const usdc = shipPosePersonalityBias("usdc-circle");
    const usdt = shipPosePersonalityBias("usdt-tether");

    expect(shipPosePersonalityBias("usdc-circle")).toEqual(usdc);
    expect(usdc.rollAmplitudeBias).toBeGreaterThanOrEqual(0.8);
    expect(usdc.rollAmplitudeBias).toBeLessThanOrEqual(1.2);
    expect(usdc.bobAmplitudeBias).toBeGreaterThanOrEqual(0.85);
    expect(usdc.bobAmplitudeBias).toBeLessThanOrEqual(1.15);
    expect(usdc.lanternRateBias).toBeGreaterThanOrEqual(0.75);
    expect(usdc.lanternRateBias).toBeLessThanOrEqual(1.25);
    expect(usdc).not.toEqual(usdt);
  });

  it("uses the stable bob personality for non-titan ships", () => {
    const bias = shipPosePersonalityBias("dai-maker");
    const pose = resolveShipPose({
      phase: 0.4,
      reducedMotion: false,
      sample: sample({ state: "sailing", wakeIntensity: 0.8, zone: "danger" }),
      shipId: "dai-maker",
      timeSeconds: 1.1,
      sizeTier: "major",
      zoom: 2,
    });

    expect(pose.bobPixels).toBeCloseTo(Math.sin(1.1 * 0.7 + 0.4) * 2 * 2 * bias.bobAmplitudeBias, 6);
  });

  it("keeps non-titan ships compatible with the existing tiny bob", () => {
    const pose = resolveShipPose({
      phase: 0.4,
      reducedMotion: false,
      sample: sample({ state: "sailing", wakeIntensity: 0.8, zone: "danger" }),
      shipId: "dai-maker",
      timeSeconds: 1.1,
      sizeTier: "major",
      zoom: 2,
    });

    expect(Math.abs(pose.bobPixels)).toBeLessThanOrEqual(Math.ceil(2 * 2 * 1.15));
    expect(pose).toMatchObject({
      bowWake: 0,
      lanternAlpha: 0,
      mooringTension: 0,
      rollRadians: 0,
      sailFlutter: 0,
      sternChurn: 0,
    });
  });
});

function sample(overrides: Partial<ShipMotionSample> & { state: ShipMotionState }): ShipMotionSample {
  const { state, ...rest } = overrides;
  return {
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: { x: 0.72, y: -0.28 },
    shipId: "sample-ship",
    state,
    tile: { x: 10, y: 20 },
    wakeIntensity: 0.4,
    zone: "watch",
    ...rest,
  };
}

function motionStrength(pose: ShipPose): number {
  return Math.abs(pose.rollRadians) * 100
    + Math.abs(pose.bobPixels)
    + pose.sailFlutter
    + pose.bowWake
    + pose.sternChurn
    + pose.lanternAlpha;
}
