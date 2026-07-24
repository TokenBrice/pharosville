// @vitest-environment jsdom
import { Color, InstancedMesh, Mesh } from "three";
import { describe, expect, it } from "vitest";
import type { AreaNode, DewsAreaBand } from "../systems/world-types";
import {
  createDangerWeather,
  createZone,
  createZoneField,
  updateDangerWeather,
  updateZoneBuoys,
} from "./garden-zones";

function area(band: DewsAreaBand, count = 6): AreaNode {
  return {
    band,
    count,
    detailId: `area.dews.${band.toLowerCase()}`,
    id: `area.dews.${band.toLowerCase()}`,
    kind: "area",
    label: `${band} water`,
    tile: { x: 40, y: 6 },
  };
}

describe("createZone", () => {
  it("keeps the ellipse root position/scale contract and drops the filled disc", () => {
    const zone = createZone(area("WATCH"));
    // The root stays an empty positioned+scaled group (selection-cue contract);
    // no filled CircleGeometry disc lives under it anymore.
    expect(zone.root.children).toHaveLength(0);
    expect(zone.root.scale.x).toBeGreaterThan(zone.root.scale.z);
    expect(zone.tint.radiusX).toBeGreaterThan(zone.tint.radiusZ);
    expect(zone.buoys.length).toBeGreaterThanOrEqual(4);
    expect(zone.buoys.length).toBeLessThanOrEqual(6);
    // Buoys ride the ellipse perimeter, not the centre.
    for (const buoy of zone.buoys) {
      const nx = (buoy.worldX - zone.tint.center.x) / zone.tint.radiusX;
      const nz = (buoy.worldZ - zone.tint.center.z) / zone.tint.radiusZ;
      expect(Math.hypot(nx, nz)).toBeCloseTo(1, 1);
    }
  });

  it("brands danger stronger and darkens its tint into a brooding patch", () => {
    const danger = createZone(area("DANGER"));
    const calm = createZone(area("CALM"));
    expect(danger.tint.strength).toBeGreaterThan(calm.tint.strength);
    expect(danger.tint.strength).toBeLessThanOrEqual(0.25);
    expect(danger.buoys.every((buoy) => buoy.danger)).toBe(true);
    expect(calm.buoys.every((buoy) => !buoy.danger)).toBe(true);
  });
});

describe("createZoneField", () => {
  it("merges perimeters and instances every zone's buoys into shared meshes", () => {
    const zones = (["DANGER", "WATCH", "CALM"] as const).map((band) => createZone(area(band)));
    const field = createZoneField(zones);
    expect(field.perimeter).toBeInstanceOf(Mesh);
    expect(field.perimeter.geometry.getAttribute("color")).toBeDefined();
    expect(field.buoyBodies).toBeInstanceOf(InstancedMesh);
    expect(field.buoyLamps).toBeInstanceOf(InstancedMesh);
    const totalBuoys = zones.reduce((sum, zone) => sum + zone.buoys.length, 0);
    expect(field.buoyBodies.count).toBe(totalBuoys);
    // Only the danger zone's lamps blink.
    expect(field.dangerLampIndices).toHaveLength(zones[0]!.buoys.length);
  });

  it("blinks danger lamps only at full tier with motion, and freezes otherwise", () => {
    const zones = [createZone(area("DANGER"))];
    const field = createZoneField(zones);
    const index = field.dangerLampIndices[0]!;
    const read = () => {
      const color = new Color();
      field.buoyLamps.getColorAt(index, color);
      return color.r;
    };

    updateZoneBuoys(field, 0, false, true);
    const a = read();
    updateZoneBuoys(field, 1, false, true);
    const b = read();
    expect(a).not.toBeCloseTo(b, 5);

    updateZoneBuoys(field, 0, true, true);
    const frozen0 = read();
    updateZoneBuoys(field, 1, true, true);
    const frozen1 = read();
    expect(frozen0).toBeCloseTo(frozen1, 6);
  });
});

describe("danger squall", () => {
  it("confines denser rain to the zone ellipse and adds a soft flicker quad", () => {
    const weather = createDangerWeather(area("DANGER"));
    const rainPoints = weather.streaks.geometry.getAttribute("position").count;
    expect(rainPoints).toBe(56 * 2);
    expect(weather.flicker.material.opacity).toBe(0);
  });

  it("ramps the flicker only at full tier and never under reduced motion", () => {
    const weather = createDangerWeather(area("DANGER"));
    // Sweep a full flicker period; a full-tier motion pass must light it at least once.
    let peak = 0;
    for (let t = 0; t < weather.flickerPeriod; t += 0.05) {
      updateDangerWeather(weather, t, false, true);
      peak = Math.max(peak, weather.flicker.material.opacity);
    }
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThanOrEqual(0.16);

    updateDangerWeather(weather, 3, true, true);
    expect(weather.flicker.material.opacity).toBe(0);
    updateDangerWeather(weather, 3, false, false);
    expect(weather.flicker.material.opacity).toBe(0);
  });
});
