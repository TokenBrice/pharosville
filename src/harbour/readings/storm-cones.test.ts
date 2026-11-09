import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { KINDS, type LightsService } from "../lights/lights-service";
import { StormCones } from "./storm-cones";

describe("D11 the storm signal's lanterns", () => {
  it("glow as analytical lights: their state shows at once, never held back by the lamp round or the arrival beat", () => {
    const kinds: string[] = [];
    const lights: LightsService = { add: (kind) => kinds.push(kind) - 1, setOn: () => undefined, remove: () => undefined, setPosition: () => undefined };
    const rig = { slots: [[0, 12, 0], [0, 9, 0], [0, 6, 0], [0, 3, 0]] as const, foot: [0, 1, 0] as const, masthead: [0, 14, 0] as const };
    const kit = new THREE.MeshStandardMaterial(), lantern = new THREE.MeshStandardMaterial();
    const cones = new StormCones(new THREE.Group(), rig, kit, lantern, lights);
    expect(kinds).toEqual(["signal", "signal", "signal", "signal"]);
    expect(KINDS.signal.analytic).toBe(true);
    cones.dispose(); kit.dispose(); lantern.dispose();
  });
});
