import { Color } from "three";
import { describe, expect, it } from "vitest";
import {
  SEA_REGION_CHARACTER,
  SEA_REGION_DISTANCE_FULL_SCALE_TILES,
  SEA_REGION_ID,
  SEA_REGION_ORDER,
  buildSeaRegionField,
  gardenSeaRegionCoverage,
  seaRegionAtTile,
} from "./garden-sea-regions";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, terrainKindAt } from "./world-layout";

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

  it("escalates water character monotonically with risk", () => {
    // D6: colour is never the only encoding. Roughness must climb and
    // reflectivity must fall as the band worsens, so the sea state is legible
    // without reading hue.
    const bands = ["calm", "watch", "alert", "warning", "danger"] as const;
    for (let index = 1; index < bands.length; index += 1) {
      const previous = SEA_REGION_CHARACTER[bands[index - 1]!];
      const current = SEA_REGION_CHARACTER[bands[index]!];
      expect(current.swell).toBeGreaterThan(previous.swell);
      expect(current.chop).toBeGreaterThan(previous.chop);
      expect(current.foam).toBeGreaterThan(previous.foam);
      expect(current.reflectivity).toBeLessThan(previous.reflectivity);
    }
  });

  it("keeps every region id addressable by the shader's uniform arrays", () => {
    expect(SEA_REGION_ORDER).toHaveLength(9);
    for (const [name, id] of Object.entries(SEA_REGION_ID)) {
      expect(SEA_REGION_ORDER[id]).toBe(name);
      expect(SEA_REGION_CHARACTER[name as keyof typeof SEA_REGION_ID]).toBeDefined();
    }
  });

  it("gives every named body an amplified, directional character", () => {
    const bodies = ["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"] as const;
    for (const body of bodies) {
      const character = SEA_REGION_CHARACTER[body];
      expect(character.tintStrength).toBeGreaterThanOrEqual(0.6);
      expect(character.tintStrength).toBeLessThanOrEqual(0.72);
      expect(Number.isFinite(character.flowBearing)).toBe(true);
      expect(character.flowHold).toBeGreaterThanOrEqual(0);
      expect(character.flowHold).toBeLessThanOrEqual(1);
      expect(character.crossedNormal).toBeGreaterThanOrEqual(0);
      expect(character.crossedNormal).toBeLessThanOrEqual(1);
    }
    expect(SEA_REGION_CHARACTER.calm.normalDetail).toBeLessThan(0.15);
    expect(SEA_REGION_CHARACTER.danger.normalDetail).toBeGreaterThan(1);
    expect(SEA_REGION_CHARACTER.warning.shallowShelf).toBeGreaterThan(0.8);
    expect(SEA_REGION_CHARACTER.wreck.swell).toBeLessThan(SEA_REGION_CHARACTER.calm.swell);
    expect(SEA_REGION_CHARACTER.ledger.swell).toBeLessThan(SEA_REGION_CHARACTER.watch.swell);
  });

  it("keeps every named body pair distinct in hue or physical character", () => {
    // Hue is only one axis: Alert grey-green and Wreck silt may approach one
    // another chromatically, but their current, foam and boundary behavior
    // must stay unmistakably different. This combined distance catches a
    // future pass that collapses either colour OR physical character.
    const bodies = ["calm", "watch", "alert", "warning", "danger", "ledger", "wreck"] as const;
    const hsl = { h: 0, s: 0, l: 0 };
    const vector = (body: typeof bodies[number]) => {
      const character = SEA_REGION_CHARACTER[body];
      new Color(character.tint).getHSL(hsl);
      return [
        hsl.h,
        character.swell / 2.1,
        character.chop / 2.5,
        character.reflectivity / 1.65,
        character.shallowShelf,
        character.boundaryFoam / 0.24,
        character.boundaryBank / 0.22,
      ];
    };
    for (let left = 0; left < bodies.length; left += 1) {
      for (let right = left + 1; right < bodies.length; right += 1) {
        const a = vector(bodies[left]!);
        const b = vector(bodies[right]!);
        const hue = Math.min(Math.abs(a[0]! - b[0]!), 1 - Math.abs(a[0]! - b[0]!)) * 2;
        const distance = Math.hypot(hue, ...a.slice(1).map((value, index) => value - b[index + 1]!));
        expect(distance, `${bodies[left]} / ${bodies[right]}`).toBeGreaterThan(0.4);
      }
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
