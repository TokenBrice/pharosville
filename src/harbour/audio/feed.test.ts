import type { ServiceMap, Services } from "../engine/services";
import { describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { SEA_STATES } from "../ocean/waves";
import { NEUTRAL_SEA, type Ambience } from "./ambience";
import { Feeder } from "./feed";

function world() {
  const services = new Map<string, unknown>() as Services;
  const ctx = {
    services,
    rig: { distance: 100, target: { x: 0, y: 0, z: 0 }, camera: { position: { x: 0, y: 10, z: 10 }, matrixWorld: { elements: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] } } },
    uniforms: { uNight: { value: 0 } }, timeOfDay: { hour: 12, clockHour: 12 },
  } as unknown as EngineContext;
  services.set("layout", { camera: { minDistance: 90, maxDistance: 1150 }, civic: [{ kind: "mint", position: [0, 0, 0] }] } as unknown as ServiceMap["layout"]);
  const set = vi.fn();
  const feeder = new Feeder(ctx, { set } as unknown as Ambience);
  return { services, feeder, set };
}

describe("sound feed: independent sea and weather truth", () => {
  it.each(SEA_STATES)("passes the eased sea vector for amplitude $amp at every DEWS band", (state) => {
    const { services, feeder, set } = world();
    services.set("model", { readings: { seaState: { step: SEA_STATES.indexOf(state) } }, truth: { stablecoins: { state: "current" } } } as unknown as ServiceMap["model"]);
    // Deliberately between targets: the sound must read the eased uniform, not reconstruct a step.
    const eased = { x: state.amp * 0.9, y: state.chop, z: state.caps * 0.8, w: state.bands };
    services.set("ocean", { shared: { uSea: { value: eased } } } as unknown as ServiceMap["ocean"]);
    for (let level = 0; level <= 4; level++) {
      services.set("weather", { state: { level, wind: level / 4 }, precip: { rain: level / 4 } } as unknown as ServiceMap["weather"]);
      const inputs = feeder.feed(0);
      expect(inputs).toMatchObject({ sea: Object.values(eased), seaAvailable: true, storm: level / 4, wind: level / 4, rain: level / 4 });
      expect(set).toHaveBeenLastCalledWith(inputs);
    }
    eased.x = 0.37;
    expect(feeder.feed(0).sea?.[0]).toBe(0.37);
    feeder.dispose();
  });

  it("neutralises stale, unavailable, missing and invalid sea inputs, then recovers", () => {
    const { services, feeder } = world();
    const model = { readings: { seaState: { step: 3 as number | null, stale: false } }, truth: { stablecoins: { state: "current" } } };
    const sea = { x: 0.85, y: 1, z: 1, w: 1.35 };
    services.set("model", model as unknown as ServiceMap["model"]);
    services.set("ocean", { shared: { uSea: { value: sea } } } as unknown as ServiceMap["ocean"]);
    expect(feeder.feed(0).seaAvailable).toBe(true);
    for (const state of ["stale", "unavailable"]) {
      model.truth.stablecoins.state = state;
      expect(feeder.feed(0)).toMatchObject({ seaAvailable: false, sea: NEUTRAL_SEA });
    }
    model.truth.stablecoins.state = "current";
    model.readings.seaState.stale = true;
    expect(feeder.feed(0)).toMatchObject({ seaAvailable: false, sea: NEUTRAL_SEA });
    model.readings.seaState.stale = false;
    model.readings.seaState.step = null;
    expect(feeder.feed(0).seaAvailable).toBe(false);
    model.readings.seaState.step = 3;
    sea.x = Number.NaN;
    expect(feeder.feed(0)).toMatchObject({ seaAvailable: false, sea: NEUTRAL_SEA });
    sea.x = 0.85;
    expect(feeder.feed(0).seaAvailable).toBe(true);
    services.delete("ocean");
    expect(feeder.feed(0).seaAvailable).toBe(false);
    services.set("ocean", { shared: { uSea: { value: sea } } } as unknown as ServiceMap["ocean"]);
    services.delete("model");
    expect(feeder.feed(0).seaAvailable).toBe(false);
    feeder.dispose();
  });
});

describe("sound feed: Mint availability", () => {
  it.each([
    ["fresh idle", { banked: false, mintRate: 0 }, true, 0],
    ["fresh active", { banked: false, mintRate: 0.7 }, true, 0.7],
    ["banked", { banked: true, mintRate: 0.7 }, false, 0.7],
    ["missing rate", { banked: false }, false, 0],
    ["invalid rate", { banked: false, mintRate: Number.NaN }, false, 0],
    ["missing service", undefined, false, 0],
  ])("%s", (_label, civic, mintAvailable, mintRate) => {
    const { services, feeder } = world();
    services.set("civic", civic as unknown as ServiceMap["civic"]);
    expect(feeder.feed(0)).toMatchObject({ mintAvailable, mintRate });
    feeder.dispose();
  });

  it("clears availability when the civic service or Mint disappears and restores it on return", () => {
    const { services, feeder } = world();
    const civic = { banked: false, mintRate: 0 };
    services.set("civic", civic as unknown as ServiceMap["civic"]);
    expect(feeder.feed(0).mintAvailable).toBe(true);
    services.delete("civic");
    expect(feeder.feed(0)).toMatchObject({ mintAvailable: false, mintRate: 0 });
    services.set("civic", civic as unknown as ServiceMap["civic"]);
    services.set("layout", { camera: { minDistance: 90, maxDistance: 1150 } } as unknown as ServiceMap["layout"]);
    expect(feeder.feed(0)).toMatchObject({ mintAvailable: false, mint: 0 });
    feeder.dispose();
  });
});
