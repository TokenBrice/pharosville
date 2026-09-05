import { describe, expect, it } from "vitest";
import {
  GARDEN_FLEET_THINNING_FADE_WIDTH,
  gardenFleetDisplayPresence,
  type GardenFleetThinningShip,
} from "./garden-fleet-thinning";

function ship(
  id: string,
  mooringId: string,
  rankWithinMooring: number,
  mooringSize: number,
  overrides: Partial<GardenFleetThinningShip> = {},
): GardenFleetThinningShip {
  return {
    dominantMooring: mooringId.endsWith(".0"),
    formationFlagship: false,
    id,
    mooringId,
    mooringSize,
    rankWithinMooring,
    riskBand: "calm",
    sizeTier: "local",
    ...overrides,
  };
}

const FLEET: GardenFleetThinningShip[] = [
  ship("dominant-0", "calm.0", 0, 4),
  ship("dominant-1", "calm.0", 1, 4),
  ship("small-representative", "calm.2", 0, 3),
  ship("small-outer", "calm.2", 2, 3),
  ship("large-representative-0", "calm.1", 0, 5),
  ship("large-representative-1", "calm.1", 1, 5),
  ship("large-outer-2", "calm.1", 2, 5),
  ship("large-outer-4", "calm.1", 4, 5),
  ship("warning-dominant", "warning.0", 0, 3, { riskBand: "warning" }),
];

describe("gardenFleetDisplayPresence", () => {
  it("keeps every placed hull visible at and above zoom 0.7", () => {
    const presence = gardenFleetDisplayPresence({ ships: FLEET, zoom: 0.7 });
    expect([...presence.values()]).toEqual(FLEET.map(() => 1));
  });

  it("is deterministic and monotone non-increasing as zoom decreases", () => {
    const zooms = [0.7, 0.62, 0.54, 0.46, 0.38, 0.3];
    const byZoom = zooms.map((zoom) => gardenFleetDisplayPresence({ ships: FLEET, zoom }));
    for (const entry of FLEET) {
      for (let index = 1; index < byZoom.length; index += 1) {
        expect(byZoom[index]!.get(entry.id)).toBeLessThanOrEqual(
          byZoom[index - 1]!.get(entry.id)!,
        );
      }
    }
    const reversed = gardenFleetDisplayPresence({ ships: [...FLEET].reverse(), zoom: 0.46 });
    expect([...reversed].toSorted()).toEqual([...byZoom[3]!].toSorted());
  });

  it("retains the dominant mooring and secondary representatives at whole-map zoom", () => {
    const presence = gardenFleetDisplayPresence({ ships: FLEET, zoom: 0.3 });
    expect(presence.get("dominant-0")).toBe(1);
    expect(presence.get("dominant-1")).toBe(1);
    expect(presence.get("warning-dominant")).toBe(1);
    expect(presence.get("small-representative")).toBe(1);
    expect(presence.get("large-representative-0")).toBe(1);
    expect(presence.get("large-representative-1")).toBe(1);
    expect(presence.get("small-outer")).toBe(0);
    expect(presence.get("large-outer-4")).toBe(0);
  });

  it("never thins hero tiers, attention targets, keyboard focus, or formation flagships", () => {
    const protectedFleet = [
      ship("titan", "calm.2", 5, 6, { sizeTier: "titan" }),
      ship("hero", "calm.2", 4, 6, { sizeTier: "unique" }),
      ship("flagship", "calm.2", 3, 6, { formationFlagship: true }),
      ship("selected", "calm.2", 2, 6),
      ship("hovered", "calm.2", 1, 6),
      ship("focused", "calm.2", 5, 6),
    ];
    const presence = gardenFleetDisplayPresence({
      focusedShipId: "focused",
      hoveredShipId: "hovered",
      selectedShipId: "selected",
      ships: protectedFleet,
      zoom: 0.3,
    });
    expect([...presence.values()]).toEqual(protectedFleet.map(() => 1));
  });

  it("gives each removable hull exactly one 0.05 zoom fade band", () => {
    const firstToYield = FLEET.find((entry) => entry.id === "small-outer")!;
    const atStart = gardenFleetDisplayPresence({ ships: FLEET, zoom: 0.7 });
    const atMiddle = gardenFleetDisplayPresence({
      ships: FLEET,
      zoom: 0.7 - GARDEN_FLEET_THINNING_FADE_WIDTH / 2,
    });
    const atEnd = gardenFleetDisplayPresence({
      ships: FLEET,
      zoom: 0.7 - GARDEN_FLEET_THINNING_FADE_WIDTH,
    });
    expect(atStart.get(firstToYield.id)).toBe(1);
    expect(atMiddle.get("large-outer-4")).toBe(1);
    expect(atMiddle.get(firstToYield.id)).toBeCloseTo(0.5, 12);
    expect(atEnd.get(firstToYield.id)).toBe(0);
  });
});
