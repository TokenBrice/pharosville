import { describe, expect, it } from "vitest";
import {
  computeSquadBoundingEllipse,
  computeSquadPennantPath,
} from "./maker-squad-chrome";

describe("maker-squad-chrome", () => {
  it("returns null pennant path when fewer than 2 squad members are visible", () => {
    expect(computeSquadPennantPath([])).toBeNull();
    expect(
      computeSquadPennantPath([{ id: "usds-sky", mastTop: { x: 0, y: 0 } }]),
    ).toBeNull();
  });

  it("orders the pennant path stUSDS -> sUSDS -> USDS -> sDAI -> DAI (vanguard-first)", () => {
    const path = computeSquadPennantPath([
      { id: "dai-makerdao", mastTop: { x: -3, y: 2 } },
      { id: "usds-sky", mastTop: { x: 0, y: 0 } },
      { id: "stusds-sky", mastTop: { x: 0, y: -3 } },
      { id: "sdai-sky", mastTop: { x: -3, y: -2 } },
      { id: "susds-sky", mastTop: { x: 3, y: -2 } },
    ]);
    expect(path).not.toBeNull();
    expect(path).toHaveLength(5);
    expect(path![0]).toEqual({ x: 0, y: -3 });
    expect(path![2]).toEqual({ x: 0, y: 0 });
    expect(path![4]).toEqual({ x: -3, y: 2 });
  });

  it("preserves vanguard-first order even when only a subset of squad members is visible", () => {
    const path = computeSquadPennantPath([
      { id: "dai-makerdao", mastTop: { x: -10, y: 5 } },
      { id: "usds-sky", mastTop: { x: 0, y: 0 } },
    ]);
    expect(path).toEqual([
      { x: 0, y: 0 },
      { x: -10, y: 5 },
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
