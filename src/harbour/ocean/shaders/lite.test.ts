import { describe, expect, it } from "vitest";
import { OCEAN_FRAG } from "../ocean-material";
import { OCEAN_SURFACE } from "./surface";
import { OCEAN_REFLECTION } from "./reflection";
import { OCEAN_FOAM } from "./foam-wake";

describe("B09 Lite water", () => {
  it("keeps the shared wave phase evaluation and replaces four ripple layers with two scales", () => {
    expect(OCEAN_SURFACE.match(/gerstnerSums\(xzw, t, gS, crestH\)/g)).toHaveLength(1);
    expect(OCEAN_SURFACE).toContain("gerstnerNormalOf(gS, ampShade * groups)");
    expect(OCEAN_REFLECTION).toContain("gerstnerNormalOf(gS, amp * groups)");
    const from = OCEAN_SURFACE.indexOf("vec4 r1 ="), to = OCEAN_SURFACE.indexOf("float shoreCalm");
    const ripple = OCEAN_SURFACE.slice(from, to), [low, full] = ripple.split("#else");
    expect(low.match(/texture2D\(uRipple/g)).toHaveLength(2);
    expect(low).toContain("xz * 0.043");
    expect(low).toContain("(rot * rot * xz) * 0.0093");
    expect(full.match(/texture2D\(uRipple/g)).toHaveLength(3); // plus r1 before the conditional
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

  it("skips only fully faded detail taps with explicit gradients, evaluating net derivatives outside the branch", () => {
    expect(OCEAN_SURFACE.indexOf("vec2 dx = dFdx(xz), dy = dFdy(xz);")).toBeLessThan(OCEAN_SURFACE.indexOf("if (cGain"));
    expect(OCEAN_SURFACE).toContain("if (cGain > 0.0 && cs > 0.0)");
    expect(OCEAN_SURFACE).toContain("\n    }\n    float caus = hbNet(cA, cB, 0.06) * cs");
    expect(OCEAN_FOAM).toContain("if (laceFar < 1.0)");
    expect(OCEAN_FOAM).toContain("\n  }\n  float lace = mix(hbNet(lA, lB, 0.05), 0.3, laceFar);");
    for (const block of [OCEAN_SURFACE.slice(OCEAN_SURFACE.indexOf("if (cGain"), OCEAN_SURFACE.indexOf("float caus =")),
      OCEAN_FOAM.slice(OCEAN_FOAM.indexOf("if (laceFar"), OCEAN_FOAM.indexOf("float lace ="))]) {
      expect(block.match(/textureGrad\(/g)).toHaveLength(2);
      expect(block).not.toMatch(/fwidth|dFdx|dFdy|texture2D/);
    }
  });

  it("retains the analytical foam bands, Shoals and PSI reach equations in both variants", () => {
    expect(OCEAN_FOAM).toContain("float bands = uSea.w;");
    expect(OCEAN_FOAM).toContain("* uSea.z * smoothstep(25.0, 90.0, coast)");
    expect(OCEAN_SURFACE).toContain("reefK * (0.62 - 0.25 * uNight)");
    expect(OCEAN_REFLECTION).toContain("exp(-along / (uBeamShape.x * 0.55))");
    expect(OCEAN_FRAG).toContain("float sunSh = hbSeaSunShadow(vec3(xz.x, 0.0, xz.y));");
  });
});
