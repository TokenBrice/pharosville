import { describe, expect, it } from "vitest";
import {
  RISK_SURFACE_SIGNATURES,
  SEA_REGION_CHARACTER,
  SEA_REGION_DISTANCE_FULL_SCALE_TILES,
  SEA_REGION_ID,
  SEA_REGION_ORDER,
  buildSeaRegionField,
  gardenSeaRegionCoverage,
  seaRegionAtTile,
} from "./garden-sea-regions";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, terrainKindAt } from "./world-layout";
import { RISK_WATER_AREAS, WRECK_SHOAL_AREA } from "./risk-water-areas";

describe("sea region field", () => {
  it("mirrors the terrain field the simulation obeys, tile for tile", () => {
    // The entire point of D5: display and data cannot drift, because they are
    // the same field. Any smoothing is presentation-only.
    for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
      for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
        const kind = terrainKindAt(x, y);
        const id = seaRegionAtTile(x, y);
        if (kind === "calm-water") expect(id).toBe(SEA_REGION_ID.calm);
        if (kind === "watch-water") expect(id).toBe(SEA_REGION_ID.watch);
        if (kind === "alert-water") expect(id).toBe(SEA_REGION_ID.alert);
        if (kind === "warning-water") expect(id).toBe(SEA_REGION_ID.warning);
        if (kind === "storm-water") expect(id).toBe(SEA_REGION_ID.danger);
        if (kind === "ledger-water") expect(id).toBe(SEA_REGION_ID.ledger);
        if (kind === "rim") expect(id).toBe(SEA_REGION_ID.none);
        if (kind === "grass" || kind === "rock") expect(id).toBe(SEA_REGION_ID.none);
      }
    }
  });

  it("covers the vast majority of the sea with named regions", () => {
    // RIM FIELD REVISION 1: the rebalanced asymmetric shore measures 75.92% named-water coverage.
    const coverage = gardenSeaRegionCoverage();
    expect(coverage.waterTiles).toBeGreaterThan(2_000);
    // D2 (operator, 2026-07-25): the neutral water stays deliberately UNNAMED.
    //
    // 0.85 assumed every tile should belong to a named band — which is what
    // made Calm the fallback and 43% of the sea. The composition now reserves
    // ~24% as open approach, because named waters only read as bodies when
    // there is unclaimed sea between them. That is composition, not an
    // attribution gap; see docs/pharosville/VISUAL_INVARIANTS.md.
    expect(coverage.namedShare).toBeGreaterThan(0.72);
    for (const region of ["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"] as const) {
      expect(coverage.byRegion[region]).toBeGreaterThan(0);
    }
  });

  it("is deterministic", () => {
    const first = buildSeaRegionField(64);
    const second = buildSeaRegionField(64);
    expect(Array.from(first.data)).toEqual(Array.from(second.data));
  });

  it("writes a boundary distance that is zero at edges and rises inside", () => {
    const field = buildSeaRegionField(128);
    let zeroes = 0;
    let interior = 0;
    for (let index = 0; index < field.size * field.size; index += 1) {
      const distance = field.data[index * 4 + 1]!;
      if (distance === 0) zeroes += 1;
      if (distance > 200) interior += 1;
    }
    // Both a real boundary set and real region interiors must exist — a field
    // that is all boundary or all interior would render as mush.
    expect(zeroes).toBeGreaterThan(0);
    expect(interior).toBeGreaterThan(0);
  });

  it("writes a real shore distance where the interface promised one", () => {
    // T3.2 (2026-09-07): this channel has been documented as "B = shore
    // distance" since W2 and written as literal zero, which is why the water
    // shader hand-authored an ellipse-and-sine bathymetry for a coastline the
    // terrain already knows. It is now the chamfer distance to the nearest
    // land texel, normalised over SEA_REGION_SHORE_FULL_SCALE_TILES.
    const size = 128;
    const field = buildSeaRegionField(size);
    const shoreAt = (px: number, py: number) => field.data[(py * size + px) * 4 + 2]!;
    expect(shoreAt(0, 0)).toBe(255);
    const idAt = (px: number, py: number) => field.data[(py * size + px) * 4]!;

    let land = 0;
    let water = 0;
    let saturated = 0;
    for (let py = 0; py < size; py += 1) {
      for (let px = 0; px < size; px += 1) {
        const shore = shoreAt(px, py);
        if (idAt(px, py) === SEA_REGION_ID.none) {
          // Land is the seed of the transform, so it is exactly zero.
          expect(shore).toBe(0);
          land += 1;
          continue;
        }
        water += 1;
        expect(shore).toBeGreaterThan(0);
        if (shore === 255) saturated += 1;
      }
    }
    expect(land).toBeGreaterThan(0);
    expect(water).toBeGreaterThan(0);
    // Measured at bake: ~24% of the sea is 24+ tiles from any coast. The ramp
    // has to be mostly UNSATURATED or it would carry no depth information at
    // all, and mostly non-zero or the scale would be too coarse to shade with.
    expect(saturated / water).toBeGreaterThan(0.1);
    expect(saturated / water).toBeLessThan(0.45);
    // Note the map corners are NOT land: (0, 0) is open sea well outside the
    // rim, so it saturates rather than reading zero.
  });

  it("orders static signature coverage and passive value without forcing agitation", () => {
    const bands = ["calm", "watch", "alert", "warning", "danger"] as const;
    expect(bands.map((body) => RISK_SURFACE_SIGNATURES[body].coverageCap))
      .toEqual([0, 0.03, 0.05, 0.07, 0.1]);
    for (let index = 1; index < bands.length; index += 1) {
      const previous = RISK_SURFACE_SIGNATURES[bands[index - 1]!];
      const current = RISK_SURFACE_SIGNATURES[bands[index]!];
      expect(current.value).toBeGreaterThan(previous.value);
      // The fully unresolved pair integrates core and shoulder analytically.
      const mean = (signature: typeof current) => signature.coverageCap
        * (signature.length[0] + signature.length[1]) / (6 * signature.length[1]);
      if (index > 1) {
        expect(mean(current)).toBeGreaterThan(mean(previous));
        expect(mean(current) * current.value).toBeGreaterThan(mean(previous) * previous.value);
      }
    }
  });

  it("keeps every region id addressable by the shader's uniform arrays", () => {
    expect(SEA_REGION_ORDER).toHaveLength(9);
    for (const [name, id] of Object.entries(SEA_REGION_ID)) {
      expect(SEA_REGION_ORDER[id]).toBe(name);
      expect(SEA_REGION_CHARACTER[name as keyof typeof SEA_REGION_ID]).toBeDefined();
    }
  });

  it("gives every named body a directional character with hue as a quiet second voice", () => {
    const bodies = ["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"] as const;
    for (const body of bodies) {
      const character = SEA_REGION_CHARACTER[body];
      // K7: surface state is primary; the dye never paints a plate.
      expect(character.tintStrength).toBeGreaterThanOrEqual(0.15);
      expect(character.tintStrength).toBeLessThanOrEqual(0.3);
      expect(character.probeRoughness).toBeGreaterThanOrEqual(0.06);
      expect(character.probeRoughness).toBeLessThanOrEqual(0.22);
      expect(Number.isFinite(character.flowBearing)).toBe(true);
      expect(character.flowHold).toBeGreaterThanOrEqual(0);
      expect(character.flowHold).toBeLessThanOrEqual(1);
      expect(character.swell).toBeLessThanOrEqual(0.4);
      expect(character.chop).toBeLessThanOrEqual(1);
      expect(character.normalDetail).toBeLessThanOrEqual(0.6);
      expect(character).not.toHaveProperty("crossedNormal");
    }
    expect(SEA_REGION_CHARACTER.warning.shallowShelf).toBeGreaterThan(0.8);
    expect(SEA_REGION_CHARACTER.wreck.swell).toBeLessThan(SEA_REGION_CHARACTER.calm.swell);
    expect(SEA_REGION_CHARACTER.ledger.swell).toBeLessThan(SEA_REGION_CHARACTER.watch.swell);
  });

  it("keeps every named body pair statically distinct without hue or motion", () => {
    const entries = Object.entries(RISK_SURFACE_SIGNATURES);
    const grammar = (signature: (typeof entries)[number][1]) => JSON.stringify([
      signature.kind, signature.pitch, signature.length, signature.grouping,
      signature.gap, signature.bearing, signature.coverageCap, signature.value,
    ]);
    for (let left = 0; left < entries.length; left += 1) {
      for (let right = left + 1; right < entries.length; right += 1) {
        expect(grammar(entries[left]![1]), `${entries[left]![0]} / ${entries[right]![0]}`)
          .not.toBe(grammar(entries[right]![1]));
      }
    }
  });

  it("holds the authored five-band grammar and non-ordinal Ledger and Wreck", () => {
    expect(RISK_SURFACE_SIGNATURES.calm.kind).toBe("mirror");
    for (const [body, pitch, length, grouping, gap] of [
      ["watch", 12, [18, 30], 1, 0],
      ["alert", 10, [8, 14], 2, 3],
      ["warning", 8, [3, 6], 3, 2],
      ["danger", 6, [3, 5], 4, 1.5],
    ] as const) {
      expect(RISK_SURFACE_SIGNATURES[body]).toMatchObject({ pitch, length, grouping, gap });
    }
    expect(RISK_SURFACE_SIGNATURES.warning.bearing).toBeCloseTo(
      SEA_REGION_CHARACTER.warning.flowBearing + Math.PI / 9,
    );
    expect(RISK_SURFACE_SIGNATURES.ledger).toMatchObject({ bearing: 0, grouping: 1, pitch: 24 });
    expect(RISK_SURFACE_SIGNATURES.wreck).toMatchObject({ kind: "silt", grouping: 0 });
  });

  it("shares canonical human names and freezes every signature including length ranges", () => {
    const placements = {
      calm: "safe-harbor", watch: "breakwater-edge", alert: "harbor-mouth-watch",
      warning: "outer-rough-water", danger: "storm-shelf", ledger: "ledger-mooring",
    } as const;
    expect(Object.isFrozen(RISK_SURFACE_SIGNATURES)).toBe(true);
    for (const [body, signature] of Object.entries(RISK_SURFACE_SIGNATURES)) {
      expect(Object.isFrozen(signature)).toBe(true);
      expect(Object.isFrozen(signature.length)).toBe(true);
      expect(signature.label).toBe(body === "wreck" ? WRECK_SHOAL_AREA.label
        : RISK_WATER_AREAS[placements[body as keyof typeof placements]].label);
    }
  });

  it("expresses every named boundary bank as a few-tile treatment", () => {
    expect(SEA_REGION_DISTANCE_FULL_SCALE_TILES).toBeGreaterThan(6);
    for (const body of ["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"] as const) {
      expect(SEA_REGION_CHARACTER[body].boundaryWidthTiles, body).toBeGreaterThanOrEqual(2.5);
      expect(SEA_REGION_CHARACTER[body].boundaryWidthTiles, body).toBeLessThanOrEqual(4);
    }
    expect(SEA_REGION_CHARACTER.open.boundaryWidthTiles).toBe(0);
  });
});
