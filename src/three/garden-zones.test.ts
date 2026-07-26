// @vitest-environment jsdom
import { Color, InstancedMesh, Matrix4, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { DEWS_AREA_LABEL_COLORS, HARBOR_PALETTE, LEDGER_INK_HEX } from "../systems/palette";
import type { AreaNode, DewsAreaBand } from "../systems/world-types";
import { SEA_REGION_ID, seaRegionAtTile } from "../systems/garden-sea-regions";
import { ZONE_BASE_RADIUS } from "../systems/garden-zone-radii";
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
    expect(zone.buoys.length).toBeGreaterThanOrEqual(3);
    expect(zone.buoys.length).toBeLessThanOrEqual(8);
    // W2.8: buoys mark the REAL region boundary now. They used to ride an
    // ellipse that had nothing to do with where the region actually was.
    for (const buoy of zone.buoys) {
      const tile = {
        x: Math.round(buoy.worldX / Math.SQRT2),
        y: Math.round(buoy.worldZ / Math.SQRT2),
      };
      expect(seaRegionAtTile(tile.x, tile.y)).toBe(SEA_REGION_ID.watch);
      const neighbours = [
        seaRegionAtTile(tile.x + 1, tile.y),
        seaRegionAtTile(tile.x - 1, tile.y),
        seaRegionAtTile(tile.x, tile.y + 1),
        seaRegionAtTile(tile.x, tile.y - 1),
      ];
      expect(neighbours.some((id) => id !== SEA_REGION_ID.watch)).toBe(true);
    }
  });

  it("drops the dashed ellipse perimeter entirely", () => {
    // Two contradictory outlines for one body of water is worse than none:
    // the region field draws the footprint and W2.6 draws its edge.
    const zone = createZone(area("DANGER"));
    expect(zone.perimeter.positions).toHaveLength(0);
    expect(zone.perimeter.colors).toHaveLength(0);
  });

  it("maps count to radius monotonically on per-band bases (zones-v2)", () => {
    const radiusOf = (band: DewsAreaBand, count: number) => (
      createZone(area(band, count)).tint.radiusX / 1.25
    );
    // Zones-v2 mapping: per-band base + min(2, √max(1,count)·0.3). N1: the
    // per-band bases are authored against the 56-tile design space and scale
    // with the map (WATCH 48 → 96); the √count term is a population nudge in
    // world units and stays unscaled.
    const base = (band: DewsAreaBand) => ZONE_BASE_RADIUS[band]!;
    expect(radiusOf("WATCH", 1)).toBeCloseTo(base("WATCH") + 0.3, 5);
    expect(radiusOf("WATCH", 4)).toBeGreaterThan(radiusOf("WATCH", 1));
    expect(radiusOf("WATCH", 9)).toBeGreaterThan(radiusOf("WATCH", 4));
    expect(radiusOf("WATCH", 30)).toBeCloseTo(base("WATCH") + Math.sqrt(30) * 0.3, 5);
    // The √count term caps at +2 so big populations cannot disturb the layout.
    expect(radiusOf("CALM", 45)).toBeCloseTo(base("CALM") + 2, 5);
    expect(radiusOf("CALM", 74)).toBeCloseTo(radiusOf("CALM", 45), 5);
    expect(radiusOf("DANGER", 11)).toBeCloseTo(base("DANGER") + Math.sqrt(11) * 0.3, 5);
  });

  it("orders realized radii Watch > Ledger > Alert > Calm > Warning > Danger", () => {
    // The operator overlay's composition contract: one dominant Watch sea
    // containing the Calm harbor ring, Ledger's large NW arc, and the
    // Alert>Warning>Danger escalation tightening into the NE corner.
    const radiusOf = (band: DewsAreaBand, count: number) => (
      createZone(area(band, count)).tint.radiusX
    );
    const { band: _band, ...ledgerArea } = area("WATCH", 1);
    const ledger = createZone({ ...ledgerArea, riskPlacement: "ledger-mooring" });
    expect(radiusOf("WATCH", 24)).toBeGreaterThan(ledger.tint.radiusX);
    expect(ledger.tint.radiusX).toBeGreaterThan(radiusOf("ALERT", 10));
    expect(radiusOf("ALERT", 10)).toBeGreaterThan(radiusOf("CALM", 74));
    expect(radiusOf("CALM", 74)).toBeGreaterThan(radiusOf("WARNING", 1));
    expect(radiusOf("WARNING", 1)).toBeGreaterThan(radiusOf("DANGER", 11));
  });

  it("uses a sparse landmark-buoy budget that still follows circumference", () => {
    const watch = createZone(area("WATCH"));
    const danger = createZone(area("DANGER"));
    expect(watch.buoys.length).toBeGreaterThan(danger.buoys.length);
    expect(danger.buoys.length).toBeGreaterThanOrEqual(3);
    expect(watch.buoys.length).toBeLessThanOrEqual(8);
  });

  it("harmonizes band colors into the garden palette but leaves ledger ink alone", () => {
    const calm = createZone(area("CALM"));
    const danger = createZone(area("DANGER"));
    // Z3: the water tint is never a literal copy of the DEWS accent.
    expect(calm.tint.color.getHex()).not.toBe(new Color(DEWS_AREA_LABEL_COLORS.CALM).getHex());
    // S1: the tint is the theme bridge's WATER colour for the terrain, so
    // danger is ink and calm is cyan-blue — not "danger is warm". What has to
    // hold is the value ramp (danger is the darkest water in the world) and
    // that both sit on the cool side, inside a water gamut.
    const luma = (color: Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
    expect(luma(danger.tint.color)).toBeLessThan(luma(calm.tint.color) * 0.5);
    expect(danger.tint.color.b).toBeGreaterThan(danger.tint.color.r);
    expect(calm.tint.color.b).toBeGreaterThan(calm.tint.color.r);
    const { band: _band, ...ledgerArea } = area("WATCH");
    const ledger = createZone({ ...ledgerArea, riskPlacement: "ledger-mooring" });
    // W2.7: every band's tint is now pulled toward deep sea so it reads as
    // WATER rather than an overlay. Ledger keeps its unharmonized ink hue as
    // its base — the check is that it starts from ink, not that it stays
    // pure ink after the water pull.
    const ink = new Color(LEDGER_INK_HEX);
    const deepSea = new Color(HARBOR_PALETTE.deep_sea_2);
    const distanceTo = (from: Color, to: Color) => Math.hypot(
      from.r - to.r,
      from.g - to.g,
      from.b - to.b,
    );
    // R5: every band is now pulled hard toward a mid-BLUE sea anchor so it
    // stays inside a water gamut, which deliberately brings the bands closer
    // to each other in hue than to their raw DEWS accents. What must survive
    // is that each band remains DISTINGUISHABLE from its neighbours...
    expect(distanceTo(ledger.tint.color, calm.tint.color)).toBeGreaterThan(0.05);
    // ...and that it has moved out of the raw accent and toward the sea.
    expect(distanceTo(ledger.tint.color, deepSea)).toBeLessThan(distanceTo(ink, deepSea));
  });

  it("brands danger stronger and darkens its tint into a brooding patch", () => {
    const danger = createZone(area("DANGER"));
    const calm = createZone(area("CALM"));
    expect(danger.tint.strength).toBeGreaterThan(calm.tint.strength);
    // W2.7: the 0.04-0.25 ceiling existed because six ellipses STACKED. A
    // partition does not stack, so a region tints at a strength that reads.
    // S1 raised the ceiling again with the switch to water colours; it still
    // has to be a tint on water and not a replacement for it.
    expect(danger.tint.strength).toBeLessThanOrEqual(0.6);
    expect(danger.tint.regionId).toBe(5);
    expect(calm.tint.regionId).toBe(1);
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

    updateZoneBuoys(field, 0, false, "full");
    const a = read();
    updateZoneBuoys(field, 1, false, "full");
    const b = read();
    expect(a).not.toBeCloseTo(b, 5);

    updateZoneBuoys(field, 0, true, "full");
    const frozen0 = read();
    updateZoneBuoys(field, 1, true, "full");
    const frozen1 = read();
    expect(frozen0).toBeCloseTo(frozen1, 6);
  });

  it("bobs buoys on the swell at balanced tier and above, frozen to rest otherwise", () => {
    const zones = [createZone(area("WATCH"))];
    const field = createZoneField(zones);
    const readY = () => {
      const matrix = new Matrix4();
      field.buoyBodies.getMatrixAt(0, matrix);
      return matrix.elements[13]!;
    };

    updateZoneBuoys(field, 2.4, false, "balanced");
    const bobA = readY();
    updateZoneBuoys(field, 5.1, false, "balanced");
    const bobB = readY();
    expect(bobA).not.toBeCloseTo(bobB, 5);
    expect(Math.abs(bobA)).toBeLessThanOrEqual(0.22 + 1e-6);

    // Constrained tier and reduced motion both settle back to the rest pose.
    updateZoneBuoys(field, 7.7, false, "constrained");
    expect(readY()).toBe(0);
    updateZoneBuoys(field, 2.4, false, "full");
    expect(readY()).not.toBe(0);
    updateZoneBuoys(field, 2.4, true, "full");
    expect(readY()).toBe(0);
  });

  it("isolates analyze-mode buoys to the focused risk area", () => {
    const watch = createZone(area("WATCH"));
    const danger = createZone(area("DANGER"));
    const field = createZoneField([watch, danger]);
    updateZoneBuoys(field, 0, true, "full", watch.area.detailId);

    const matrix = new Matrix4();
    const hasScale = () => [0, 1, 2, 4, 5, 6, 8, 9, 10]
      .some((offset) => Math.abs(matrix.elements[offset]!) > 1e-8);
    const visibleByArea = field.buoyAreaDetailIds.map((detailId, index) => {
      field.buoyBodies.getMatrixAt(index, matrix);
      return { detailId, visible: hasScale() };
    });
    expect(visibleByArea.filter(({ visible }) => visible).every(
      ({ detailId }) => detailId === watch.area.detailId,
    ), JSON.stringify(visibleByArea)).toBe(true);
    expect(visibleByArea.some(
      ({ detailId, visible }) => detailId === danger.area.detailId && !visible,
    )).toBe(true);

    updateZoneBuoys(field, 0, true, "full", null);
    expect(field.visibleAreaDetailId).toBeNull();
    for (let index = 0; index < field.buoyBodies.count; index += 1) {
      field.buoyBodies.getMatrixAt(index, matrix);
      expect(hasScale()).toBe(true);
    }
  });
});

describe("danger squall", () => {
  it("confines denser rain to the zone ellipse without a full-zone flash plane", () => {
    const weather = createDangerWeather(area("DANGER"));
    const rainPoints = weather.streaks.geometry.getAttribute("position").count;
    expect(rainPoints).toBe(56 * 2);
    expect(weather.root.getObjectByName("danger-flicker")).toBeUndefined();
  });

  it("moves rain gently and freezes it under reduced motion", () => {
    const weather = createDangerWeather(area("DANGER"));
    updateDangerWeather(weather, 1, false, true);
    const movingY = weather.streaks.position.y;
    updateDangerWeather(weather, 2, false, true);
    expect(weather.streaks.position.y).not.toBe(movingY);
    updateDangerWeather(weather, 3, true, true);
    expect(weather.streaks.position.y).toBe(0);
  });
});
