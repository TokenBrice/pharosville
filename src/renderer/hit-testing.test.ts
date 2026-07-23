import { describe, expect, it } from "vitest";
import {
  hitTargetSnapshotFromTargets,
  hitTest,
  hitTestSpatial,
  type HitTarget,
} from "./hit-testing";

const point = { x: 20, y: 20 };
const targets: HitTarget[] = [
  target("ship", "ship.a", 10),
  target("dock", "dock.a", 20),
];

describe("Three world hit testing", () => {
  it("builds a spatial snapshot with detail lookup", () => {
    const snapshot = hitTargetSnapshotFromTargets(targets);

    expect(snapshot.targetsByDetailId.get("ship.a")).toBe(targets[0]);
    expect(hitTestSpatial(snapshot.spatialIndex, point)?.detailId).toBe("dock.a");
    expect(hitTest(snapshot.targets, point)?.detailId).toBe("dock.a");
  });

  it("keeps analytical areas and focused targets above overlapping scenery", () => {
    const area = target("area", "area.warning", 1);
    expect(hitTest([...targets, area], point)?.detailId).toBe("area.warning");

    expect(hitTest(targets, point, {
      selectedDetailId: "ship.a",
    })?.detailId).toBe("dock.a");
    expect(hitTest([
      target("ship", "ship.a", 20),
      target("dock", "dock.a", 20),
    ], point, {
      selectedDetailId: "ship.a",
    })?.detailId).toBe("ship.a");
  });
});

function target(kind: string, detailId: string, priority: number): HitTarget {
  return {
    detailId,
    id: detailId,
    kind,
    label: detailId,
    priority,
    rect: { height: 40, width: 40, x: 0, y: 0 },
  };
}
