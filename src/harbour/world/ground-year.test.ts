import { describe, expect, it } from "vitest";
import { dayOfYear, northernDay } from "../season/calendar";
import { DRY_SEASON, drySeasonAt, grassSlopeOf, SLOPE_TAP_M, SPRING_TURF, SPRING_TURF_GLSL, STRAW, STRAW_GLSL } from "./ground-year";
import { GLSL_SEASON } from "./shaders/season";

/** uSeasonPhase as the season system writes it: (northern-equivalent day - 1) / 365. */
const phaseOf = (month: number, day = 15, southern = false) => (northernDay(dayOfYear(2026, month, day), southern) - 1) / 365;

describe("E17 Mediterranean ground year (calendar only)", () => {
  it("is straw from June to October and green from the first rains through the spring", () => {
    for (const m of [6, 7, 8, 9, 10]) expect(drySeasonAt(phaseOf(m))).toBe(1);
    for (const m of [12, 1, 2, 3, 4, 5]) expect(drySeasonAt(phaseOf(m))).toBe(0);
    expect(drySeasonAt(phaseOf(6, 1))).toBeGreaterThan(0.3);        // the turn round 1 June
    expect(drySeasonAt(phaseOf(10, 31))).toBeLessThan(0.85);        // the first rains, late October...
    expect(drySeasonAt(phaseOf(11, 15))).toBeLessThan(0.35);        // ...green the turf through November
    expect(drySeasonAt(phaseOf(11, 30))).toBe(0);
  });

  it("turns over a fortnight, never in a step", () => {
    let last = drySeasonAt(0);
    for (let d = 1; d <= 365; d++) {
      const k = drySeasonAt((d - 1) / 365);
      expect(Math.abs(k - last)).toBeLessThan(0.12);
      last = k;
    }
  });

  it("follows the visitor's hemisphere like every other season colour (a southern July is green)", () => {
    expect(drySeasonAt(phaseOf(7, 15, true))).toBe(0);
    expect(drySeasonAt(phaseOf(1, 15, true))).toBe(1);
  });

  it("is the shader's own law: the grass branch reads the same constants", () => {
    expect(GLSL_SEASON).toContain("hbDrySeason()");
    expect(GLSL_SEASON).toContain(`smoothstep(${DRY_SEASON.start[0].toFixed(4)}, ${DRY_SEASON.start[1].toFixed(4)}, uSeasonPhase)`);
    expect(GLSL_SEASON).toContain(STRAW_GLSL);
    expect(GLSL_SEASON).toContain(SPRING_TURF_GLSL);
    expect(STRAW_GLSL).toBe(`vec3(${STRAW.map((c) => c.toFixed(4)).join(", ")})`);
    expect(SPRING_TURF[1]).toBeGreaterThan(SPRING_TURF[0]);        // still greener than it is red
  });
});

describe("E16 continuous terrain dryness", () => {
  // a smooth knoll, then the same knoll as the island mesh holds it: triangles on a 5 m grid (piecewise linear)
  const knoll = (x: number, z: number) => 24 * Math.exp(-(x * x + z * z) / (2 * 30 * 30));   // ~0.5 m/m flanks
  const G = 5;
  const meshHeight = (x: number, z: number) => {
    const i = Math.floor(x / G), j = Math.floor(z / G), u = x / G - i, v = z / G - j;
    const h00 = knoll(i * G, j * G), h10 = knoll((i + 1) * G, j * G), h01 = knoll(i * G, (j + 1) * G), h11 = knoll((i + 1) * G, (j + 1) * G);
    return u + v <= 1 ? h00 + (h10 - h00) * u + (h01 - h00) * v : h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  };
  const facetSteep = (x: number, z: number) => {           // the old law: the triangle's own normal (dFdx x dFdy)
    const e = 1e-3, dx = (meshHeight(x + e, z) - meshHeight(x, z)) / e, dz = (meshHeight(x, z + e) - meshHeight(x, z)) / e;
    return 1 - 1 / Math.hypot(dx, 1, dz);
  };
  const tapSteep = (x: number, z: number) => grassSlopeOf(meshHeight(x + SLOPE_TAP_M, z), meshHeight(x - SLOPE_TAP_M, z),
    meshHeight(x, z + SLOPE_TAP_M), meshHeight(x, z - SLOPE_TAP_M)).steep;

  it("reads level ground as flat and a south-falling face as south", () => {
    expect(grassSlopeOf(3, 3, 3, 3)).toEqual({ steep: 0, south: 0 });
    const s = grassSlopeOf(0, 0, -0.3 * SLOPE_TAP_M, 0.3 * SLOPE_TAP_M);      // falls 0.3 m per m toward +z (south)
    expect(s.south).toBeCloseTo(1, 6);
    expect(s.steep).toBeCloseTo(1 - 1 / Math.hypot(0.3, 1), 6);
    expect(grassSlopeOf(0, 0, 0.3 * SLOPE_TAP_M, -0.3 * SLOPE_TAP_M).south).toBe(0);   // a north face never dries as south
  });

  it("is continuous across the triangulation where the facet normal stepped", () => {
    let tapJump = 0, facetJump = 0;
    let lastTap = tapSteep(-60, 7.3), lastFacet = facetSteep(-60, 7.3);
    for (let x = -60; x <= 60; x += 0.05) {                 // a walk across 24 cells and their diagonals
      const t = tapSteep(x, 7.3), f = facetSteep(x, 7.3);
      tapJump = Math.max(tapJump, Math.abs(t - lastTap));
      facetJump = Math.max(facetJump, Math.abs(f - lastFacet));
      lastTap = t; lastFacet = f;
    }
    expect(facetJump).toBeGreaterThan(0.01);                // the mosaic: a step at every triangle edge
    expect(tapJump).toBeLessThan(facetJump / 10);
  });

  it("keeps the knoll's slope (the old law's mean) without its facets", () => {
    for (const x of [-30, -12, 0, 18, 33]) expect(Math.abs(tapSteep(x, 9) - (1 - 1 / Math.hypot(...grad(x, 9), 1)))).toBeLessThan(0.012);
    function grad(x: number, z: number): [number, number] {
      const e = 1e-3;
      return [(knoll(x + e, z) - knoll(x - e, z)) / (2 * e), (knoll(x, z + e) - knoll(x, z - e)) / (2 * e)];
    }
  });

  it("asks the shader for no derivatives and no new taps", () => {
    const fn = GLSL_SEASON.slice(GLSL_SEASON.indexOf("void hbGrassTerrain"), GLSL_SEASON.indexOf("vec3 hbCrop"));
    expect(fn).not.toMatch(/dFd[xy]/);
    expect(fn.match(/hbHeight\(/g)).toHaveLength(4);
  });
});
