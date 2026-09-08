import { describe, expect, it } from "vitest";
import { Vector3 } from "three";
import { advanceEpistemicHaze, type EpistemicFogSource } from "../systems/epistemic-haze";
import { createGardenSkyBillboards } from "./garden-sky-billboards";

describe("local source fog billboards", () => {
  it("arrives at the affected world centre independently of camera pan and clears on recovery", () => {
    const sky = createGardenSkyBillboards();
    const source: EpistemicFogSource = { id: "quay", feed: "Chains", stale: true, centre: { x: 42, z: 21 }, radius: 10, lastGood: null };
    const edge = advanceEpistemicHaze([source], [], 0);
    sky.setFogBanks(edge, 5, 7);
    const anchors = sky.localMist.mesh.geometry.getAttribute("aAnchor");
    const strength = sky.localMist.mesh.geometry.getAttribute("aStrength");
    expect(anchors.getX(0) + 5).toBe(32);
    expect(strength.getX(0)).toBe(0);
    const arrived = advanceEpistemicHaze([source], edge, 45);
    sky.setFogBanks(arrived, 15, 17);
    const world = new Vector3().fromBufferAttribute(anchors, 0).add(new Vector3(15, 0, 17));
    expect(world.x).toBe(42);
    expect(world.z).toBe(21);
    expect(strength.getX(0)).toBe(1);
    const recovering = advanceEpistemicHaze([{ ...source, stale: false }], arrived, 50);
    sky.setFogBanks(advanceEpistemicHaze([{ ...source, stale: false }], recovering, 95), 15, 17);
    expect(strength.getX(0)).toBe(0);
    sky.dispose();
  });
});
