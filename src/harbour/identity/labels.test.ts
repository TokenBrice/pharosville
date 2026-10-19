import { describe, expect, it } from "vitest";
import font from "../../../public/harbour/chart-lettering.json";
import layout from "../data/layout.json";
import { fitLabel, footprintsOverlap, labelFootprint, labelSpecs, layoutLabel, lineWidth, placeLabels, rankPlacements, readableAngle, type FitObstacle, type LabelSpec, type PlaceView } from "./labels";
import type { ChartFont, SeaZone, SeaZoneKind } from "./types";

const F = font as unknown as ChartFont;
const zones = (layout as unknown as { seaZones: SeaZone[] }).seaZones;

const square = (cx: number, cz: number, h: number): Array<[number, number]> => [[cx - h, cz - h], [cx + h, cz - h], [cx + h, cz + h], [cx - h, cz + h]];
const zone = (id: string, name: string, kind: SeaZoneKind, polygon: Array<[number, number]>, anchor: [number, number]): SeaZone =>
  ({ id, name, kind, polygon, labelAnchor: anchor, labelAngle: Math.PI / 4 });

describe("chart lettering", () => {
  it("letters the sea features only, never the harbours", () => {
    const specs = labelSpecs(zones);
    expect(specs.length).toBe(zones.filter((z) => z.kind !== "harbour").length);
    expect(specs.some((s) => s.lines.some((l) => /ETHEREUM|TRON/.test(l.text)))).toBe(false);
    const shoals = specs.find((s) => s.id === "shoals")!;
    expect(shoals.lines.map((l) => l.text)).toEqual(["THE", "SHOALS"]);
    expect(shoals.lines.every((l) => l.face === "italic")).toBe(true);
  });

  it("sets one glyph quad per letter plus flanking rules", () => {
    const spec = labelSpecs(zones).find((s) => s.id === "shoals")!;
    const q = layoutLabel(spec, F);
    expect(q.filter((x) => x.slot >= 0).length).toBe("THESHOALS".length);
    expect(q.some((x) => x.slot < 0)).toBe(true);
    expect(lineWidth("SHOALS", "italic", 10, 0.3, F)).toBeGreaterThan(40);
  });

  it("keeps names near level to the default camera and inside their water", () => {
    expect(readableAngle(Math.PI / 4 + 1)).toBeCloseTo(Math.PI / 4 + 0.35);
    const spec = labelSpecs(zones).find((s) => s.id === "the-roads")!;
    const z = zones.find((x) => x.id === "the-roads")!;
    const fit = fitLabel(spec, z, F);
    expect(Math.hypot(fit.anchor[0] - spec.anchor[0], fit.anchor[1] - spec.anchor[1])).toBeLessThan(200);
  });
});

describe("chart lettering: collision solver", () => {
  it("the footprint holds every glyph's ink", () => {
    for (const spec of labelSpecs(zones)) {
      const foot = labelFootprint(spec, F);
      for (const q of layoutLabel(spec, F)) {
        if (q.slot < 0) continue;
        // ink centre of the glyph cell
        const cx = (q.c[0][0] + q.c[1][0] + q.c[2][0] + q.c[3][0]) / 4, cz = (q.c[0][1] + q.c[1][1] + q.c[2][1] + q.c[3][1]) / 4;
        const dot: Array<[number, number]> = [[cx - 0.1, cz - 0.1], [cx + 0.1, cz - 0.1], [cx + 0.1, cz + 0.1], [cx - 0.1, cz + 0.1]];
        expect(footprintsOverlap(foot, [dot])).toBe(true);
      }
    }
  });

  it("two names wanting the same water are set apart", () => {
    const zs = [
      zone("a", "The Roads", "roads", square(0, 0, 400), [0, 0]),
      zone("b", "The Western Reach", "open", square(0, 0, 400), [0, 0]),
    ];
    const specs = labelSpecs(zs);
    expect(footprintsOverlap(labelFootprint(specs[0], F), labelFootprint(specs[1], F))).toBe(true);
    const out = placeLabels(specs, zs, F);
    expect(out.map((s) => s.id)).toEqual(["a", "b"]);
    expect(footprintsOverlap(labelFootprint(out[0], F), labelFootprint(out[1], F))).toBe(false);
    // the more important name keeps its best water; the other one moves
    expect(out[0].anchor).toEqual(fitLabel(specs[0], zs[0], F).anchor);
  });

  it("hides the lesser name when there is no room for both", () => {
    const tight = square(0, 0, 70);
    const zs = [zone("a", "Wreck Cove", "wreckCove", tight, [0, 0]), zone("b", "The Outer Passage", "open", tight, [0, 0])];
    // everything beyond the tight water is land
    const coastAt = (x: number, z: number) => 70 - Math.max(Math.abs(x), Math.abs(z)) + 24;
    const out = placeLabels(labelSpecs(zs), zs, F, { coastAt });
    expect(out.map((s) => s.id)).toEqual(["a"]);
  });

  it("keeps names off water hidden behind land in a view", () => {
    const zs = [zone("a", "The Shoals", "shoals", square(0, 0, 400), [0, -40])];
    // the eye looks toward -z; a high bank across z in [-20, 0] hides the water just behind it
    const bank = (_x: number, z: number) => (z > -20 && z < 0 ? 120 : -5);
    const view: PlaceView = { eye: [0, 400, 600], want: { zone: "whole" }, project: (x, _y, z) => [x / 500, -z / 500] };
    const hiddenInk = (s: LabelSpec) => layoutLabel(s, F).filter((q) => q.slot >= 0 && q.c.reduce((m, c) => m + c[1], 0) / 4 < -20).length;
    const [free] = placeLabels(labelSpecs(zs), zs, F, { views: [view] });
    const [seen] = placeLabels(labelSpecs(zs), zs, F, { heightAt: bank, views: [view] });
    expect(hiddenInk(free)).toBeGreaterThan(0);
    expect(hiddenInk(seen)).toBe(0);
  });

  it("prints beside a crowd of anchored hulls rather than over it", () => {
    const zs = [zone("a", "The Shoals", "shoals", square(0, 0, 400), [0, 0])];
    const crowd: FitObstacle[] = [];
    for (let x = -80; x <= 80; x += 8) for (let z = -60; z <= 60; z += 8) crowd.push({ a: [x, z], b: [x, z], halfWidth: 3 });
    const [a] = placeLabels(labelSpecs(zs), zs, F, { crowd });
    const over = layoutLabel(a, F).filter((q) => q.slot >= 0 && q.c.every(([x, z]) => Math.abs(x) < 80 && Math.abs(z) < 60)).length;
    expect(over).toBe(0);
  });

  it("the real chart: no two names overlap, and none is lost", () => {
    const piers = (layout as unknown as { piers: Array<{ segments: Array<{ a: [number, number]; b: [number, number]; width: number }> }> }).piers;
    const obstacles: FitObstacle[] = piers.flatMap((p) => p.segments.map((g) => ({ a: g.a, b: g.b, halfWidth: g.width / 2 })));
    const specs = labelSpecs(zones);
    const out = placeLabels(specs, zones, F, { obstacles });
    expect(out.length).toBe(specs.length);
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      expect(footprintsOverlap(labelFootprint(out[i], F), labelFootprint(out[j], F)), `${out[i].id} × ${out[j].id}`).toBe(false);
    }
  });

  it("preserves the recorded pre-cache chart placements, scores and tie order exactly", () => {
    const obstacles = layout.piers.flatMap((p) => p.segments.map((g): FitObstacle => ({
      a: [g.a[0], g.a[1]], b: [g.b[0], g.b[1]], halfWidth: g.width / 2,
    })));
    const specs = labelSpecs(zones);
    const out = placeLabels(specs, zones, F, { obstacles });
    expect(out.map((s) => ({ id: s.id, anchor: s.anchor, angle: s.angle, caps: s.lines.map((l) => l.cap) }))).toEqual([
      { id: "shoals", anchor: [-349.4988816784387, -43.651957838681305], angle: 0.7854, caps: [7.5, 15] },
      { id: "far-ports", anchor: [3.54, -420.73], angle: 0.7854, caps: [9, 18] },
      { id: "wreck-cove", anchor: [-216.3751899236537, 188.09474254529215], angle: 0.7854, caps: [14] },
      { id: "the-roads", anchor: [-133.930925075738, -269.6909941652011], angle: 0.7854, caps: [9.5, 19] },
      { id: "outer-passage", anchor: [-283.4089288596718, -339.9788488613461], angle: 0.7854, caps: [11, 22] },
      { id: "western-reach", anchor: [-487.9, 176.78], angle: 0.7854, caps: [8.36, 16.72] },
      { id: "southern-sea", anchor: [269.2689288596718, 269.2688488613461], angle: 0.7854, caps: [11, 22] },
    ]);
    const shoals = specs.find((s) => s.id === "shoals")!;
    const ranked = rankPlacements(shoals, zones.find((z) => z.id === shoals.id)!, F, { obstacles });
    const first = Array.from({ length: 4 }, () => ranked.next().value!);
    expect(first.map((c) => ({ anchor: c.spec.anchor, score: c.score, fit: c.fit }))).toEqual([
      { anchor: [-349.4988816784387, -43.651957838681305], score: 0.9538092334894448, fit: 0.967854505683529 },
      { anchor: [-334.4603798473074, -58.690514909415704], score: 0.9455031108779878, fit: 0.9585031108779878 },
      { anchor: [-349.4988816784387, -43.651957838681305], score: 0.9301338781821323, fit: 0.9861791503762166 },
      { anchor: [-334.4603798473074, -58.690514909415704], score: 0.9164471356804664, fit: 0.9714471356804665 },
    ]);
  });
});
