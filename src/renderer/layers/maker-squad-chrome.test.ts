import { describe, expect, it } from "vitest";
import { MAKER_SQUAD, SKY_SQUAD } from "../../systems/maker-squad";
import {
  computeSquadBoundingEllipse,
  computeSquadPennantPath,
} from "./maker-squad-chrome";

describe("maker-squad-chrome", () => {
  it("returns null pennant path when fewer than 2 squad members are visible", () => {
    expect(computeSquadPennantPath([], SKY_SQUAD.displayOrder)).toBeNull();
    expect(
      computeSquadPennantPath(
        [{ id: "usds-sky", mastTop: { x: 0, y: 0 } }],
        SKY_SQUAD.displayOrder,
      ),
    ).toBeNull();
  });

  it("orders the Sky pennant flagship -> vanguard -> savings cutter using the squad's displayOrder", () => {
    // Sky display order: usds-sky, stusds-sky, susds-sky.
    const path = computeSquadPennantPath(
      [
        { id: "susds-sky", mastTop: { x: 3, y: -2 } },
        { id: "stusds-sky", mastTop: { x: 0, y: -3 } },
        { id: "usds-sky", mastTop: { x: 0, y: 0 } },
      ],
      SKY_SQUAD.displayOrder,
    );
    expect(path).not.toBeNull();
    expect(path).toHaveLength(3);
    expect(path![0]).toEqual({ x: 0, y: 0 });   // flagship USDS first
    expect(path![1]).toEqual({ x: 0, y: -3 });  // stUSDS vanguard
    expect(path![2]).toEqual({ x: 3, y: -2 });  // sUSDS savings cutter
  });

  it("orders the Maker pennant flagship -> sDAI", () => {
    // Maker display order: dai-makerdao, sdai-sky.
    const path = computeSquadPennantPath(
      [
        { id: "sdai-sky", mastTop: { x: -2, y: -2 } },
        { id: "dai-makerdao", mastTop: { x: 0, y: 0 } },
      ],
      MAKER_SQUAD.displayOrder,
    );
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: -2, y: -2 },
    ]);
  });

  it("ignores anchors that are not in the supplied squad order", () => {
    // Cross-squad anchors (DAI fed into Sky pennant) must not appear.
    const path = computeSquadPennantPath(
      [
        { id: "dai-makerdao", mastTop: { x: -10, y: 5 } },
        { id: "usds-sky", mastTop: { x: 0, y: 0 } },
        { id: "stusds-sky", mastTop: { x: 0, y: -3 } },
      ],
      SKY_SQUAD.displayOrder,
    );
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: -3 },
    ]);
  });

  it("computes a bounding ellipse around all visible squad members", () => {
    const ellipse = computeSquadBoundingEllipse([
      { id: "usds-sky", mastTop: { x: 0, y: 0 } },
      { id: "dai-makerdao", mastTop: { x: 30, y: 0 } },
      { id: "stusds-sky", mastTop: { x: 15, y: 20 } },
    ]);
    expect(ellipse!.center.x).toBeCloseTo(15, 1);
    expect(ellipse!.radiusX).toBeGreaterThanOrEqual(15);
    expect(ellipse!.radiusY).toBeGreaterThanOrEqual(10);
  });

  it("returns null bounding ellipse when no anchors are supplied", () => {
    expect(computeSquadBoundingEllipse([])).toBeNull();
  });
});
