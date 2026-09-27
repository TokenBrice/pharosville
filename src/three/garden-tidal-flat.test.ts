import { Mesh } from "three";
import { describe, expect, it } from "vitest";
import { gardenInletDistance } from "../systems/garden-inlet";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { SEA_REGION_ID, seaRegionAtTile } from "../systems/garden-sea-regions";
import { TILE_SCALE } from "../systems/projection";
import { UNAVAILABLE_SUPPLY_TIDE, type SupplyTide } from "../systems/supply-tide";
import {
  createGardenTidalFlat,
  TIDAL_FLAT_EASE_SECONDS,
  TIDAL_FLAT_RANGE,
  tidalFlatHeight,
  tidalFlatWaterlineAcross,
} from "./garden-tidal-flat";

const flood: SupplyTide = { change7dPct: 2, offset: 1, state: "flood" };
const ebb: SupplyTide = { change7dPct: -2, offset: -1, state: "ebb" };

function bareVertexCount(tide: SupplyTide): number {
  const flat = createGardenTidalFlat(tide);
  flat.update({ lastVisitOffset: null, reducedMotion: true, timeSeconds: 0 });
  const sand = flat.root.getObjectByName("garden-tidal-flat-sand") as Mesh;
  const positions = sand.geometry.getAttribute("position");
  let bare = 0;
  for (let index = 0; index < positions.count; index += 1) {
    if (positions.getY(index) + flat.root.position.y > GARDEN_WATER_Y) bare += 1;
  }
  flat.dispose();
  return bare;
}

describe("garden tidal flat", () => {
  it("bares more of the flat the further supply fell", () => {
    const slack: SupplyTide = { change7dPct: 0, offset: 0, state: "slack" };
    const flooded = bareVertexCount(flood);
    const held = bareVertexCount(slack);
    const bared = bareVertexCount(ebb);
    expect(flooded).toBeLessThan(held);
    expect(held).toBeLessThan(bared);
    // A full-scale week moves the waterline several units across the view.
    expect(tidalFlatWaterlineAcross(-1) - tidalFlatWaterlineAcross(1)).toBeGreaterThan(8);
  });

  it("can only ever lie bare outside the empty inlet and every named risk water", () => {
    const flat = createGardenTidalFlat(ebb);
    const sand = flat.root.getObjectByName("garden-tidal-flat-sand") as Mesh;
    const positions = sand.geometry.getAttribute("position");
    let checked = 0;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      // Anything that can surface at the lowest ebb.
      if (tidalFlatHeight(x, z) <= -TIDAL_FLAT_RANGE) continue;
      checked += 1;
      const tileX = x / TILE_SCALE;
      const tileY = z / TILE_SCALE;
      expect(gardenInletDistance(tileX, tileY)).toBeGreaterThan(12);
      const region = seaRegionAtTile(Math.floor(tileX), Math.floor(tileY));
      expect([SEA_REGION_ID.none, SEA_REGION_ID.open]).toContain(region);
    }
    expect(checked).toBeGreaterThan(100);
    flat.dispose();
  });

  it("says 'no data' with no tide-stone and the water at the datum", () => {
    const missing = createGardenTidalFlat(UNAVAILABLE_SUPPLY_TIDE);
    missing.update({ lastVisitOffset: -0.8, reducedMotion: true, timeSeconds: 0 });
    expect(missing.root.getObjectByName("garden-tidal-flat-tide-stone")).toBeUndefined();
    expect(missing.displayedOffset()).toBe(0);
    expect(missing.wrackVisible()).toBe(false);

    const measured = createGardenTidalFlat({ change7dPct: 0, offset: 0, state: "slack" });
    expect(measured.root.getObjectByName("garden-tidal-flat-tide-stone")).toBeDefined();
    missing.dispose();
    measured.dispose();
  });

  it("draws the last visit's wrack line only when the tide has moved since", () => {
    const flat = createGardenTidalFlat({ change7dPct: 0.5, offset: 0.5, state: "flood" });
    flat.update({ lastVisitOffset: null, reducedMotion: true, timeSeconds: 0 });
    expect(flat.wrackVisible()).toBe(false);
    flat.update({ lastVisitOffset: 0.4, reducedMotion: true, timeSeconds: 0 });
    expect(flat.wrackVisible()).toBe(false);
    flat.update({ lastVisitOffset: -0.6, reducedMotion: true, timeSeconds: 0 });
    expect(flat.wrackVisible()).toBe(true);
    flat.dispose();
  });

  it("eases a changed reading out over minutes, and reduced motion shows the reading at once", () => {
    // A rebuilt flat (a data refresh) starts where the water was shown.
    const first = createGardenTidalFlat(ebb);
    first.update({ lastVisitOffset: null, reducedMotion: true, timeSeconds: 0 });
    expect(first.displayedOffset()).toBe(-1);
    first.dispose();

    const next = createGardenTidalFlat(flood);
    next.update({ lastVisitOffset: null, reducedMotion: false, timeSeconds: 20 });
    let seconds = 20;
    for (let frame = 0; frame < 60; frame += 1) {
      seconds += 1;
      next.update({ lastVisitOffset: null, reducedMotion: false, timeSeconds: seconds });
    }
    const afterOneMinute = next.displayedOffset();
    expect(afterOneMinute).toBeGreaterThan(-1);
    expect(afterOneMinute).toBeLessThan(-0.5);
    for (let frame = 0; frame < TIDAL_FLAT_EASE_SECONDS * 3; frame += 1) {
      seconds += 1;
      next.update({ lastVisitOffset: null, reducedMotion: false, timeSeconds: seconds });
    }
    expect(next.displayedOffset()).toBeGreaterThan(0.9);

    next.update({ lastVisitOffset: null, reducedMotion: true, timeSeconds: 0 });
    expect(next.displayedOffset()).toBe(1);

    // The load's first real reading snaps: a flat that stood only seconds
    // (the loading world) is not a tide anyone watched go out.
    const loading = createGardenTidalFlat(ebb);
    loading.update({ lastVisitOffset: null, reducedMotion: false, timeSeconds: 100 });
    loading.update({ lastVisitOffset: null, reducedMotion: false, timeSeconds: 101 });
    loading.dispose();
    const live = createGardenTidalFlat(flood);
    live.update({ lastVisitOffset: null, reducedMotion: false, timeSeconds: 102 });
    expect(live.displayedOffset()).toBe(1);
    live.dispose();
    expect(next.root.position.y).toBeCloseTo(GARDEN_WATER_Y - TIDAL_FLAT_RANGE);
    next.dispose();
  });
});
