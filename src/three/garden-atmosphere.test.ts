import { Color, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { gardenSkyDayFromParts } from "../systems/sky-almanac";
import { gardenSunPose } from "./garden-sun";
import {
  GARDEN_ATMOSPHERE, GARDEN_ATMOSPHERE_GLSL,
  gardenAtmosphereMean, gardenAtmosphereOpticalLength,
  gardenAtmosphereRayleighPhase, gardenAtmosphereMiePhase,
  writeGardenAtmosphereCoefficients, writeGardenAtmosphereSource,
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

  it("agrees with the vector shader eye-leg and source expressions without output transforms", () => {
    const mean = scalarShader("gardenAtmosphereMean");
    const opticalLength = scalarShader("gardenAtmosphereOpticalLength");
    writeGardenAtmosphereCoefficients(r, m, 1);
    const dir = new Vector3(0.6, 0.15, -0.7).normalize();
    const source = writeGardenAtmosphereSource(new Color(), dir, sun, r, m);
    const sky = writeGardenAtmosphereSky(new Color(), dir, sun, r, m);
    const t = transmittance(300);
    for (const [channel, index] of [["r", 0], ["g", 1], ["b", 2]] as const) {
      const betaR = r.getComponent(index);
      const betaM = m.getComponent(index);
      expect(t[channel]).toBeCloseTo(Math.exp(-300 * (betaR * mean(15, 0, 420) + betaM * mean(15, 0, 62.5))), 12);
      const extinction = Math.exp(-(betaR * 420 + betaM * 62.5) * opticalLength(dir.y));
      expect(sky[channel]).toBeCloseTo(source[channel] * (1 - extinction), 12);
    }
    expect(GARDEN_ATMOSPHERE_GLSL).not.toMatch(/sampler|tonemapping|colorspace|cloud|pow\([^;]*vec3/);
    expect(GARDEN_ATMOSPHERE_GLSL).toContain("radiance * solarT");
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
