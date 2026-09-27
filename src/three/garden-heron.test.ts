import { describe, expect, it } from "vitest";
import {
  createGardenHeron,
  createGardenHeronGeometry,
  GARDEN_HERON_ARRIVAL_SECONDS,
  GARDEN_HERON_DEPARTURE_SECONDS,
  GARDEN_HERON_STAND_FROM_HOUR,
  gardenHeronWingbeat,
} from "./garden-heron";

const DAY = 20_000 * 86_400;
const at = (hour: number) => ({ clockSeconds: DAY + hour * 3600, hour });

function frame(hour: number, reducedMotion = false) {
  return { clockSeconds: at(hour).clockSeconds, reducedMotion, visible: true, wallClockHour: hour };
}

describe("W5.2 the heron", () => {
  it("is one low-poly two-pose mesh inside the 200–400 triangle budget", () => {
    const geometry = createGardenHeronGeometry();
    const triangles = geometry.getAttribute("position").count / 3;
    expect(triangles).toBeGreaterThanOrEqual(200);
    expect(triangles).toBeLessThanOrEqual(400);
    for (const name of ["aStand", "aStandNormal", "aBone", "aWing", "aNeck", "color"]) {
      expect(geometry.getAttribute(name)?.count).toBe(geometry.getAttribute("position").count);
    }
    geometry.dispose();
  });

  it("arrives in the morning, stands, departs at golden, and is absent by night", () => {
    const heron = createGardenHeron();
    const arrives = heron.ritual("heron-arrives");
    const departs = heron.ritual("heron-departs");

    heron.update(frame(8.5));
    expect(heron.state()).toBe("absent");

    arrives.start(at(8.5).clockSeconds);
    expect(arrives.update(at(8.5).clockSeconds + 1, 1)).toBe(false);
    heron.update({ ...frame(8.5), clockSeconds: at(8.5).clockSeconds + 5 });
    expect(heron.state()).toBe("arriving");
    expect(heron.mesh.material).toBeDefined();
    expect(arrives.update(at(8.5).clockSeconds + GARDEN_HERON_ARRIVAL_SECONDS, 1)).toBe(true);
    heron.update(frame(9));
    expect(heron.state()).toBe("standing");

    departs.start(at(18.3).clockSeconds);
    heron.update({ ...frame(18.3), clockSeconds: at(18.3).clockSeconds + 3 });
    expect(heron.state()).toBe("departing");
    expect(departs.update(at(18.3).clockSeconds + GARDEN_HERON_DEPARTURE_SECONDS, 1)).toBe(true);
    heron.update(frame(18.4));
    expect(heron.state()).toBe("absent");
    heron.update(frame(22));
    expect(heron.state()).toBe("absent");
    heron.dispose();
  });

  it("is simply standing at midday when no arrival flew, and never flies twice", () => {
    const heron = createGardenHeron();
    heron.update(frame(GARDEN_HERON_STAND_FROM_HOUR + 1));
    expect(heron.state()).toBe("standing");
    const arrives = heron.ritual("heron-arrives");
    arrives.start(at(12).clockSeconds);
    // Already there: the ritual resolves at once rather than popping her away.
    expect(arrives.update(at(12).clockSeconds, 0)).toBe(true);
    heron.update(frame(12));
    expect(heron.state()).toBe("standing");
    heron.dispose();
  });

  it("stands still under reduced motion and never shows a flight", () => {
    const heron = createGardenHeron();
    heron.update(frame(12, true));
    expect(heron.state()).toBe("standing");
    const position = heron.mesh.parent!.position.clone();
    heron.update(frame(13, true));
    expect(heron.mesh.parent!.position.toArray()).toEqual(position.toArray());
    heron.update(frame(23, true));
    expect(heron.root.visible).toBe(false);
    heron.dispose();
  });

  it("registers both rituals and releases them on dispose", () => {
    const registered = new Map<string, unknown>();
    const heron = createGardenHeron({
      registerRitual: (kind, handler) => {
        registered.set(kind, handler);
        return () => registered.delete(kind);
      },
    });
    expect([...registered.keys()].toSorted()).toEqual(["heron-arrives", "heron-departs"]);
    heron.dispose();
    expect(registered.size).toBe(0);
  });

  it("beats slow and deep, then glides on bowed wings", () => {
    const strokes = [0, 0.275, 0.55, 0.825].map((age) => gardenHeronWingbeat(age)[0]);
    expect(Math.max(...strokes) - Math.min(...strokes)).toBeGreaterThan(0.8);
    const [glideInner] = gardenHeronWingbeat(3 * 1.1 + 1);
    expect(glideInner).toBeLessThan(0);
    expect(glideInner).toBeGreaterThan(-0.2);
  });
});
