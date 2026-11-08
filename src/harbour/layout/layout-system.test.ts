import { describe, expect, it } from "vitest";
import { PerspectiveCamera } from "three";
import { CameraRig } from "../engine/camera-rig";
import { devCamera } from "./layout-system";

describe("development camera URL", () => {
  const rig = new CameraRig(new PerspectiveCamera());
  it("ignores every production cam override", () => expect(devCamera("1,2,3,400,26", rig, false)).toBeNull());
  it.each(["", "1,2,3", "1,,3,400", "1,2,3,0", "1,2,3,-1", "1,2,3,NaN", "1,2,3,Infinity", "1,2,3,400,4", "1,2,3,400,86", "1,2,3,400,26,5"])("rejects malformed/unsafe %s", (raw) => expect(devCamera(raw, rig, true)).toBeNull());
  it("accepts exactly four/five finite values, bounding pan/distance and pitch endpoints", () => {
    expect(devCamera("1,2,3,400", rig, true)).toEqual([1, 2, 3, 400]);
    expect(devCamera("999999,2,-999999,999999,5", rig, true)).toEqual([600, 2, -600, 900, 5]);
    expect(devCamera("1,2,3,1,85", rig, true)).toEqual([1, 2, 3, 90, 85]);
  });
});
