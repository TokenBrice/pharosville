import { Group, Mesh } from "three";
import { describe, expect, it } from "vitest";
import { SIGNAL_MAST_MAX_PENNANTS } from "../systems/world-types";
import { createGardenSignalMast } from "./garden-signal-mast";

function pennants(root: Group): Group[] {
  const found: Group[] = [];
  for (let index = 0; index < SIGNAL_MAST_MAX_PENNANTS; index += 1) {
    const pennant = root.getObjectByName(`signal-mast-pennant-${index}`);
    if (pennant instanceof Group) found.push(pennant);
  }
  return found;
}

describe("garden signal mast (3a)", () => {
  it("builds the whole hoist once and flies none of it by default", () => {
    const mast = createGardenSignalMast();

    expect(mast.root.getObjectByName("signal-mast-pole")).toBeInstanceOf(Mesh);
    expect(mast.root.getObjectByName("signal-mast-yard")).toBeInstanceOf(Mesh);
    expect(pennants(mast.root)).toHaveLength(SIGNAL_MAST_MAX_PENNANTS);
    expect(pennants(mast.root).every((pennant) => !pennant.visible)).toBe(true);
    expect(mast.root.getObjectByName("signal-mast-storm-cone")?.visible).toBe(false);

    mast.dispose();
  });

  it("flies one pennant per active depeg and caps the hoist", () => {
    const mast = createGardenSignalMast();

    mast.setState({ pennantCount: 3, stormCone: false });
    expect(pennants(mast.root).map((pennant) => pennant.visible))
      .toEqual([true, true, true, false, false]);

    // The world model already clamps, but a hoist that could be asked for more
    // cloth than it owns is a crash waiting on a bad afternoon.
    mast.setState({ pennantCount: 40, stormCone: false });
    expect(pennants(mast.root).every((pennant) => pennant.visible)).toBe(true);

    mast.setState({ pennantCount: 0, stormCone: false });
    expect(pennants(mast.root).some((pennant) => pennant.visible)).toBe(false);

    mast.dispose();
  });

  it("hoists the storm cone independently of the pennant count", () => {
    const mast = createGardenSignalMast();
    const cone = mast.root.getObjectByName("signal-mast-storm-cone");

    // One coin far enough off peg is a storm even though the hoist is short.
    mast.setState({ pennantCount: 1, stormCone: true });
    expect(cone?.visible).toBe(true);

    mast.setState({ pennantCount: 5, stormCone: false });
    expect(cone?.visible).toBe(false);

    mast.dispose();
  });

  it("holds a deterministic time-zero pose under reduced motion", () => {
    const mast = createGardenSignalMast();
    mast.setState({ pennantCount: 5, stormCone: true });

    mast.update({ reducedMotion: true, timeSeconds: 0, visible: true });
    const atZero = pennants(mast.root).map((pennant) => pennant.rotation.y);

    mast.update({ reducedMotion: true, timeSeconds: 812.5, visible: true });
    expect(pennants(mast.root).map((pennant) => pennant.rotation.y)).toEqual(atZero);

    // And the moving hoist passes through exactly that pose at t=0, so the
    // static frame is the animation's own, not a second authored one.
    mast.update({ reducedMotion: false, timeSeconds: 0, visible: true });
    expect(pennants(mast.root).map((pennant) => pennant.rotation.y)).toEqual(atZero);

    mast.dispose();
  });

  it("lifts the cloth gently and raggedly when motion is allowed", () => {
    const mast = createGardenSignalMast();
    mast.setState({ pennantCount: SIGNAL_MAST_MAX_PENNANTS, stormCone: false });

    mast.update({ reducedMotion: false, timeSeconds: 3.4, visible: true });
    const angles = pennants(mast.root).map((pennant) => pennant.rotation.y);

    // Restrained: nothing on the hoist swings past the authored amplitude.
    expect(angles.every((angle) => Math.abs(angle) <= 0.07 + 1e-6)).toBe(true);
    // Ragged: five pennants on one halyard must not move as one board.
    expect(new Set(angles.map((angle) => angle.toFixed(4))).size).toBeGreaterThan(1);

    mast.dispose();
  });

  it("hides the whole mast when the tier sheds it", () => {
    const mast = createGardenSignalMast();

    mast.update({ reducedMotion: false, timeSeconds: 1, visible: false });
    expect(mast.root.visible).toBe(false);

    mast.update({ reducedMotion: false, timeSeconds: 1, visible: true });
    expect(mast.root.visible).toBe(true);

    mast.dispose();
  });
});
