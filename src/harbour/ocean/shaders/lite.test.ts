import { describe, expect, it } from "vitest";
import { OCEAN_FRAG } from "../ocean-material";
import { OCEAN_SURFACE } from "./surface";
import { OCEAN_REFLECTION } from "./reflection";
import { OCEAN_FOAM } from "./foam-wake";

describe("B09 Lite water & Phase 2 sampler/FFT split", () => {
  it("keeps the shared wave phase evaluation, two uRipple scales on HB_LITE, and swaps uRipple for uFftAtlas on Full", () => {
    expect(OCEAN_SURFACE.match(/gerstnerSums\(xzw, t, gS, crestH\)/g)).toHaveLength(1);
    expect(OCEAN_SURFACE).toContain("gerstnerNormalOf(gS, ampShade * groups)");
    expect(OCEAN_REFLECTION).toContain("gerstnerNormalOf(gS, amp * groups)");
    const from = OCEAN_SURFACE.indexOf("#ifdef HB_LITE\n  vec4 r1 =");
    const to = OCEAN_SURFACE.indexOf("vec2 dn = dnWave + dnFine;");
    const normalBlock = OCEAN_SURFACE.slice(from, to);
    const [low, full] = normalBlock.split("#else");
    expect(low.match(/texture2D\(uRipple/g)).toHaveLength(2);
    expect(low).toContain("xz * 0.043");
    expect(low).toContain("(rot * rot * xz) * 0.0093");
    expect(full).toContain("textureGrad(uFftAtlas");
    expect(full).not.toContain("uRipple");
  });

  it("uses the adjacent reflection taps 1/2 at twice the six-tap weights, so no copy floats out in the basin", () => {
    expect(OCEAN_REFLECTION).toContain("#ifdef HB_LITE\n    for (int tap = 0; tap < 2; tap++)");
    expect(OCEAN_REFLECTION).toContain("int i = 1 + tap;");
    expect(OCEAN_REFLECTION).toContain("float weight = tap == 0 ? 1.84 : 1.68;");
    expect(OCEAN_REFLECTION).toContain("for (int i = 0; i < 6; i++)");
    expect(OCEAN_REFLECTION).toContain("* ok * weight;");
    const six = (i: number) => 1 - 0.08 * i;
    expect(1.84).toBeCloseTo(2 * six(1), 12);
    expect(1.68).toBeCloseTo(2 * six(2), 12);
  });

  it("skips only fully faded detail taps with explicit gradients, keeping Lite dispersion-free and derivative-safe", () => {
    expect(OCEAN_SURFACE.indexOf("vec2 dx = dFdx(xz), dy = dFdy(xz);")).toBeLessThan(OCEAN_SURFACE.indexOf("if (cGain"));
    expect(OCEAN_SURFACE).toContain("if (cGain > 0.0 && cs > 0.0)");
    expect(OCEAN_FOAM).toContain("if (laceFar < 1.0)");
    expect(OCEAN_FOAM).toContain("\n  }\n  float lace = mix(hbNet(lA, lB, 0.05), 0.3, laceFar);");
    const causBlock = OCEAN_SURFACE.slice(OCEAN_SURFACE.indexOf("if (cGain"), OCEAN_SURFACE.indexOf("causReef = cGain"));
    expect(causBlock).not.toMatch(/fwidth|dFdx|dFdy|texture2D/);
    const laceBlock = OCEAN_FOAM.slice(OCEAN_FOAM.indexOf("if (laceFar"), OCEAN_FOAM.indexOf("float lace ="));
    expect(laceBlock.match(/textureGrad\(/g)).toHaveLength(2);
    expect(laceBlock).not.toMatch(/fwidth|dFdx|dFdy|texture2D/);
  });

  it("guards W1/Phase 2 high-frequency sea effects behind HB_LITE and preserves S-2 dynamic pool + horizon seam fixes", () => {
    expect(OCEAN_SURFACE).toContain("shoreN = hbShoreNormal(uSdf, suv, coast, inside);");
    expect(OCEAN_SURFACE).toContain("textureLod(sdfTex, clamp(suv + vec2(eS, 0.0), 0.0, 1.0), 2.0)");
    expect(OCEAN_SURFACE).toContain("if (uRibbonsOn > 0.5 && (abs(kelH) > 0.004 || live.r > 0.01))");
    expect(OCEAN_REFLECTION).toContain("if (uDynPool.x > 0.01)");
    expect(OCEAN_REFLECTION).toContain("textureLod(uDynPoolTex, clamp(duv, 0.0, 1.0), 0.0)");
    expect(OCEAN_REFLECTION).toContain("1.0 - 0.55 * hullOcc");
    expect(OCEAN_REFLECTION).toContain("1.0 - 0.70 * hullOcc");
    expect(OCEAN_REFLECTION).toContain("1.0 - 0.65 * hullOcc");
    expect(OCEAN_FRAG).toContain("vec3 hazeC = band(thV, -0.05, 0.0);");
    expect(OCEAN_REFLECTION).toContain("glint *= 1.0 - smoothstep(uHorizonDist * 0.80, uHorizonDist * 0.96, fwdD);");
    expect(OCEAN_FRAG).toContain("gl_FragColor = vec4(col, 1.0);");
  });

  it("retains the analytical foam bands, Shoals and PSI reach equations in both variants", () => {
    expect(OCEAN_FOAM).toContain("float bands = uSea.w;");
    expect(OCEAN_FOAM).toContain("* uSea.z * smoothstep(25.0, 90.0, coast)");
    expect(OCEAN_SURFACE).toContain("reefK * (0.62 - 0.25 * uNight)");
    expect(OCEAN_REFLECTION).toContain("exp(-along / (uBeamShape.x * 0.55))");
    expect(OCEAN_FRAG).toContain("float sunSh = hbSeaSunShadow(vec3(xz.x, 0.0, xz.y));");
  });
});
