import { describe, expect, it } from "vitest";
import font from "../../../public/harbour/chart-lettering.json";
import layout from "../data/layout.json";
import { fitLabel, labelSpecs, layoutLabel, lineWidth, readableAngle } from "./labels";
import type { ChartFont, SeaZone } from "./types";

const F = font as unknown as ChartFont;
const zones = (layout as unknown as { seaZones: SeaZone[] }).seaZones;

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
    const fit = fitLabel(spec, z, F, []);
    expect(Math.hypot(fit.anchor[0] - spec.anchor[0], fit.anchor[1] - spec.anchor[1])).toBeLessThan(200);
  });
});
