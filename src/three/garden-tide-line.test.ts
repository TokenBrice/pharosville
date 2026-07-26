import { InstancedMesh } from "three";
import { describe, expect, it } from "vitest";
import { buildSupplyTide, UNAVAILABLE_SUPPLY_TIDE, type SupplyTide } from "../systems/supply-tide";
import {
  createGardenTideLine,
  sampleTideLine,
  TIDE_DATUM_RISE,
  tideStrandlineRise,
} from "./garden-tide-line";

const flood = (): SupplyTide => ({ change7dPct: 1, offset: 0.7, state: "flood" });
const ebb = (): SupplyTide => ({ change7dPct: -1, offset: -0.7, state: "ebb" });
const slack = (): SupplyTide => ({ change7dPct: 0, offset: 0, state: "slack" });

describe("tideStrandlineRise", () => {
  it("puts slack water exactly on the datum notch", () => {
    // The datum is the reference the whole cue is read against, so a flat week
    // has to land on it precisely rather than near it.
    expect(tideStrandlineRise(slack())).toBeCloseTo(TIDE_DATUM_RISE, 10);
  });

  it("bares wet stone above the datum when supply fell, and hides it when supply rose", () => {
    // This is the direction contract. If these two ever land on the same side of
    // the datum the cue is asserting one thing and meaning another.
    expect(tideStrandlineRise(ebb())).toBeGreaterThan(TIDE_DATUM_RISE);
    expect(tideStrandlineRise(flood())).toBeLessThan(TIDE_DATUM_RISE);
  });

  it("never runs the strandline below the waterline or past the plate", () => {
    for (const offset of [-1, -0.5, 0, 0.5, 1]) {
      const rise = tideStrandlineRise({ change7dPct: 0, offset, state: "flood" });
      expect(rise).toBeGreaterThanOrEqual(0);
      expect(rise).toBeLessThanOrEqual(TIDE_DATUM_RISE * 2);
    }
  });
});

describe("sampleTideLine", () => {
  it("cuts a hard edge at the strandline — the line is the whole read", () => {
    const tide = ebb();
    const strandline = tideStrandlineRise(tide);
    expect(sampleTideLine(strandline - 0.01, tide).wet).toBeGreaterThan(0.6);
    expect(sampleTideLine(strandline + 0.01, tide).wet).toBe(0);
  });

  it("marks the datum at a fixed height whichever way the tide is running", () => {
    for (const tide of [flood(), ebb(), slack()]) {
      expect(sampleTideLine(TIDE_DATUM_RISE, tide).datum).toBe(1);
      expect(sampleTideLine(TIDE_DATUM_RISE + 0.2, tide).datum).toBe(0);
    }
  });

  it("leaves stone bare, notch and all, when there is no tide to report", () => {
    // A missing payload must not render as any real tide state.
    expect(sampleTideLine(TIDE_DATUM_RISE, UNAVAILABLE_SUPPLY_TIDE)).toEqual({ datum: 0, wet: 0 });
    expect(sampleTideLine(0.1, UNAVAILABLE_SUPPLY_TIDE).wet).toBe(0);
  });

  it("leaves everything at or below still water alone", () => {
    // The sea already colours what it covers; darkening it again would muddy the
    // waterline the band is measured from.
    expect(sampleTideLine(0, ebb())).toEqual({ datum: 0, wet: 0 });
    expect(sampleTideLine(-0.5, ebb())).toEqual({ datum: 0, wet: 0 });
  });

  it("agrees with the built tide for a real week", () => {
    const live = buildSupplyTide({
      chains: [],
      globalTotalUsd: 1,
      chainAttributedTotalUsd: 1,
      unattributedTotalUsd: 0,
      globalChange24hPct: 0,
      globalChange7dPct: 0.000187,
      globalChange30dPct: 0,
      updatedAt: 0,
      healthMethodologyVersion: "test",
    });
    // A +0.019% week is a rising tide, so the strandline sits below the datum —
    // but only just, which is the honest picture of a nearly flat week.
    expect(live.state).toBe("flood");
    expect(tideStrandlineRise(live)).toBeLessThan(TIDE_DATUM_RISE);
    expect(tideStrandlineRise(live)).toBeGreaterThan(TIDE_DATUM_RISE * 0.85);
  });
});

describe("createGardenTideLine", () => {
  const specs = [
    { detailId: "dock.ethereum", width: 6, x: 10, y: -1.45, yaw: 0, z: -4 },
    { detailId: "dock.tron", width: 4, x: -8, y: -1.45, yaw: Math.PI / 3, z: 2 },
  ];

  it("draws every quay's band in one instanced call", () => {
    const line = createGardenTideLine(specs, ebb());
    const meshes = line.root.children.filter((child) => child instanceof InstancedMesh);

    expect(meshes).toHaveLength(1);
    expect((meshes[0] as InstancedMesh).count).toBe(2);
    expect(line.count).toBe(2);
    line.dispose();
  });

  it("builds the named group but nothing else when the tide is unavailable", () => {
    // The overview LOD scan resolves props by name, so the group has to exist
    // even on a day with no chains payload.
    const line = createGardenTideLine(specs, UNAVAILABLE_SUPPLY_TIDE);

    expect(line.root.name).toBe("dock-tide-line");
    expect(line.count).toBe(0);
    expect(line.root.children).toHaveLength(0);
  });

  it("paints a flood and an ebb differently", () => {
    // Same geometry shape, different band — if these matched, the plate would be
    // ignoring the tide entirely.
    const read = (tide: SupplyTide) => {
      const line = createGardenTideLine(specs, tide);
      const mesh = line.root.children[0] as InstancedMesh;
      const colors = Array.from(mesh.geometry.getAttribute("color").array as Float32Array);
      line.dispose();
      return colors;
    };

    expect(read(flood())).not.toEqual(read(ebb()));
  });
});
