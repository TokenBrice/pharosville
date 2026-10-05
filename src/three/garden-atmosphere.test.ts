import { Color, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { gardenSkyDayFromParts } from "../systems/sky-almanac";
import { gardenSunPose } from "./garden-sun";
import {
  GARDEN_ATMOSPHERE, GARDEN_ATMOSPHERE_GLSL,
  gardenAtmosphereMean, gardenAtmosphereOpticalLength,
  gardenAtmosphereRayleighPhase, gardenAtmosphereMiePhase,
  gardenAtmosphereScatteringIntegral,
  writeGardenAtmosphereCoefficients,
  writeGardenAtmosphereTransmittance, writeGardenAtmosphereSky,
} from "./garden-atmosphere";

// Execute the production scalar GLSL expressions as JS (no copied formula).
// GPU shader compilation/precision is separately covered by real-GPU captures.
function scalarShader(name: string): (...args: number[]) => number {
  const match = GARDEN_ATMOSPHERE_GLSL.match(new RegExp(`float ${name}\\(([^)]*)\\) \\{([\\s\\S]*?)\\n\\}`))!;
  const args = match[1]!.replace(/float /g, "");
  const body = match[2]!.replace(/float /g, "let ");
  return new Function(...args.split(",").map((arg) => arg.trim()),
    "const {max, min, exp, abs, acos, pow} = Math; const clamp = (x,a,b) => max(a,min(b,x));" + body) as (...args: number[]) => number;
}

const sun = new Vector3(0.4, 0.6, -0.5).normalize();
const r = new Vector3();
const m = new Vector3();

function transmittance(distance: number, clarity = 1, hc = 15, hp = 0): Color {
  writeGardenAtmosphereCoefficients(r, m, clarity);
  return writeGardenAtmosphereTransmittance(new Color(), r, m, distance, hc, hp);
}

const luma = (c: Color) => c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;

describe("shared analytic daylight transport", () => {
  it("agrees with the actual scalar shader functions across phase and optical-length domains", () => {
    const mean = scalarShader("gardenAtmosphereMean");
    const length = scalarShader("gardenAtmosphereOpticalLength");
    const rp = scalarShader("gardenAtmosphereRayleighPhase");
    const mp = scalarShader("gardenAtmosphereMiePhase");
    for (const y of [-1, -0.001, 0, 0.001, 0.05, 0.4, 1]) {
      expect(length(y)).toBeCloseTo(gardenAtmosphereOpticalLength(y), 10);
      expect(rp(y)).toBeCloseTo(gardenAtmosphereRayleighPhase(y), 12);
      expect(mp(y)).toBeCloseTo(gardenAtmosphereMiePhase(y), 12);
    }
    for (const scale of [62.5, 420]) for (const a of [0, 15, 180]) for (const b of [0, a, a + 0.0001, 420]) {
      expect(mean(a, b, scale)).toBeCloseTo(gardenAtmosphereMean(a, b, scale), 12);
    }
  });

  it("integrates altitude-dependent sunlight with a finite equal-depth limit and scalar shader parity", () => {
    const integral = scalarShader("gardenAtmosphereScatteringIntegral");
    for (const eye of [0, 0.05, 0.25, 1, 10, 40]) for (const solar of [0, eye, eye + 0.0001, 1, 10, 40]) {
      const actual = gardenAtmosphereScatteringIntegral(eye, solar);
      expect(integral(eye, solar)).toBeCloseTo(actual, 12);
      let reference = 0;
      const steps = 8192;
      for (let index = 0; index < steps; index++) {
        const column = (index + 0.5) / steps;
        reference += eye * Math.exp(-eye * (1 - column) - solar * column) / steps;
      }
      expect(actual).toBeCloseTo(reference, 5);
      expect(Number.isFinite(actual) && actual >= 0).toBe(true);
    }
  });

  it("retains more short-wave light aloft than at the low-sun horizon instead of tinting every height crimson", () => {
    const lowSun = new Vector3(Math.sqrt(1 - 0.03 ** 2), 0.03, 0);
    for (const clarity of [-1, 0, 1]) {
      writeGardenAtmosphereCoefficients(r, m, clarity);
      const horizon = writeGardenAtmosphereSky(new Color(), new Vector3(-1, 0, 0), lowSun, r, m);
      const zenith = writeGardenAtmosphereSky(new Color(), new Vector3(0, 1, 0), lowSun, r, m);
      const depth = r.z * 420 + m.z * 62.5;
      const oldBlue = GARDEN_ATMOSPHERE.radiance
        * (r.z * gardenAtmosphereRayleighPhase(lowSun.y) + m.z * gardenAtmosphereMiePhase(lowSun.y)) / (r.z + m.z)
        * Math.exp(-depth * gardenAtmosphereOpticalLength(lowSun.y)) * (1 - Math.exp(-depth));
      expect(zenith.b).toBeGreaterThan(oldBlue);
      expect(zenith.b / zenith.r).toBeGreaterThan(horizon.b / horizon.r);
    }
  });

  it("bounds the low-sun forward lobe by solar-disc radiance without changing its hue or high-sun energy", () => {
    for (const clarity of [-1, 0, 1]) {
      writeGardenAtmosphereCoefficients(r, m, clarity);
      const sun = new Vector3(Math.sqrt(1 - 0.03 ** 2), 0.03, 0);
      const actual = writeGardenAtmosphereSky(new Color(), sun, sun, r, m);
      const expected = new Color();
      const length = gardenAtmosphereOpticalLength(sun.y);
      for (const [channel, index] of [["r", 0], ["g", 1], ["b", 2]] as const) {
        const betaR = r.getComponent(index);
        const betaM = m.getComponent(index);
        const depth = betaR * 420 + betaM * 62.5;
        expected[channel] = GARDEN_ATMOSPHERE.radiance
          * (betaR * gardenAtmosphereRayleighPhase(1) + betaM * gardenAtmosphereMiePhase(1)) / (betaR + betaM)
          * gardenAtmosphereScatteringIntegral(depth * length, depth * length);
      }
      const peak = Math.max(expected.r, expected.g, expected.b);
      expect(peak).toBeGreaterThan(GARDEN_ATMOSPHERE.radiance);
      expected.multiplyScalar(GARDEN_ATMOSPHERE.sunDiscRadiance / peak);
      for (const channel of ["r", "g", "b"] as const) expect(actual[channel]).toBeCloseTo(expected[channel], 10);
      expect(Math.max(actual.r, actual.g, actual.b)).toBeLessThanOrEqual(GARDEN_ATMOSPHERE.sunDiscRadiance + 1e-12);
      sun.set(0.8, 0.6, 0);
      const high = writeGardenAtmosphereSky(new Color(), sun, sun, r, m);
      expect(Math.max(high.r, high.g, high.b)).toBeGreaterThan(GARDEN_ATMOSPHERE.radiance);
    }
    for (const sunY of [0.081, 0.1, 0.2, 0.3, 0.449]) {
      const sun = new Vector3(Math.sqrt(1 - sunY ** 2), sunY, 0);
      const t = (sunY - 0.08) / 0.37;
      const low = 1 - t * t * (3 - 2 * t);
      const ceiling = GARDEN_ATMOSPHERE.radiance
        + (GARDEN_ATMOSPHERE.sunDiscRadiance - GARDEN_ATMOSPHERE.radiance) * low;
      for (const clarity of [-1, 0, 1]) {
        writeGardenAtmosphereCoefficients(r, m, clarity);
        const actual = writeGardenAtmosphereSky(new Color(), sun, sun, r, m);
        expect(Math.max(actual.r, actual.g, actual.b)).toBeLessThanOrEqual(ceiling + 1e-12);
      }
    }
    expect(GARDEN_ATMOSPHERE_GLSL).toContain("sky *= ceiling / peak");
  });

  it("keeps Rayleigh and sharpened forward aerosol phases energy normalized", () => {
    for (const phase of [gardenAtmosphereRayleighPhase, gardenAtmosphereMiePhase]) {
      let integral = 0;
      const steps = 16000;
      for (let index = 0; index <= steps; index += 1) {
        const mu = -1 + 2 * index / steps;
        integral += phase(mu) * (index === 0 || index === steps ? 0.5 : 1);
      }
      expect(integral * 2 / steps * 2 * Math.PI).toBeCloseTo(1, 2);
    }
  });

  it("keeps the solar-side noon horizon neutral or cool throughout both hemispheres and PSI aerosol levels", () => {
    const solar = new Color();
    const direction = new Vector3();
    const pose = gardenSunPose(12);
    for (const southern of [false, true]) for (let month = 1; month <= 12; month++) {
      const day = gardenSkyDayFromParts({
        year: 2026, month, day: 21, utcOffsetHours: 0, dstHours: 0,
        latitude: { latitudeRad: (southern ? -35 : 35) * Math.PI / 180, southern },
      });
      gardenSunPose(day.solarNoonHour, pose, day);
      direction.set(pose.direction.x, 0, pose.direction.z);
      direction.divideScalar(Math.max(direction.length(), 1e-6));
      for (const clarity of [-1, 0, 1]) {
        writeGardenAtmosphereCoefficients(r, m, clarity);
        writeGardenAtmosphereSky(solar, direction, pose.direction, r, m);
        expect(solar.b).toBeGreaterThanOrEqual(solar.r);
      }
    }
  });

  it("retains the accepted high-sun eye-leg expression without output transforms", () => {
    const mean = scalarShader("gardenAtmosphereMean");
    const opticalLength = scalarShader("gardenAtmosphereOpticalLength");
    writeGardenAtmosphereCoefficients(r, m, 1);
    const dir = new Vector3(0.6, 0.15, -0.7).normalize();
    const sky = writeGardenAtmosphereSky(new Color(), dir, sun, r, m);
    const t = transmittance(300);
    for (const [channel, index] of [["r", 0], ["g", 1], ["b", 2]] as const) {
      const betaR = r.getComponent(index);
      const betaM = m.getComponent(index);
      const source = GARDEN_ATMOSPHERE.radiance
        * (betaR * gardenAtmosphereRayleighPhase(dir.dot(sun)) + betaM * gardenAtmosphereMiePhase(dir.dot(sun)))
        / (betaR + betaM);
      expect(t[channel]).toBeCloseTo(Math.exp(-300 * (betaR * mean(15, 0, 420) + betaM * mean(15, 0, 62.5))), 12);
      const extinction = Math.exp(-(betaR * 420 + betaM * 62.5) * opticalLength(dir.y));
      expect(sky[channel]).toBeCloseTo(source * (1 - extinction), 12);
    }
    expect(GARDEN_ATMOSPHERE_GLSL).not.toMatch(/sampler|tonemapping|colorspace|cloud|pow\([^;]*vec3/);
    expect(GARDEN_ATMOSPHERE_GLSL).toContain("gardenAtmosphereScatteringIntegral(eyeDepth.b, solarDepth.b)");
    expect(GARDEN_ATMOSPHERE_GLSL).toContain("max(r + m, vec3(1e-8))");
  });

  it("keeps clear noon near/mid air, with monotonically greater distance and aerosol recession", () => {
    expect(luma(transmittance(140))).toBeGreaterThanOrEqual(0.9);
    expect(luma(transmittance(300))).toBeGreaterThanOrEqual(0.8);
    expect(luma(transmittance(2000))).toBeLessThan(0.6);
    for (const clarity of [-1, 0, 1]) {
      expect(luma(transmittance(300, clarity))).toBeGreaterThan(luma(transmittance(600, clarity)));
    }
    expect(luma(transmittance(300, 1))).toBeGreaterThan(luma(transmittance(300, 0)));
    expect(luma(transmittance(300, 0))).toBeGreaterThan(luma(transmittance(300, -1)));
  });

  it("has reciprocal finite transport, exact identity at zero distance and finite grazing phases", () => {
    expect(transmittance(0).toArray()).toEqual([1, 1, 1]);
    expect(transmittance(300, 0, 15, 180).toArray()).toEqual(transmittance(300, 0, 180, 15).toArray());
    for (const y of [-1, 0, 1]) {
      const value = writeGardenAtmosphereSky(new Color(), new Vector3(Math.sqrt(Math.max(0, 1 - y * y)), y, 0), sun, r, m);
      for (const channel of value.toArray()) expect(Number.isFinite(channel) && channel >= 0).toBe(true);
    }
    expect(gardenAtmosphereMiePhase(1)).toBeGreaterThan(gardenAtmosphereMiePhase(-1));
    expect(GARDEN_ATMOSPHERE.mieClear).toBeLessThan(GARDEN_ATMOSPHERE.mieVeiled);
  });
});
