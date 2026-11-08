import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { createWorldUniforms } from "../engine/uniforms";
import { TimeOfDay } from "../engine/time-of-day";
import { getHarbourMaterials } from "../world/materials";
import { SeasonSystem } from "./season-system";

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("complete calendar shader signature", () => {
  it.each([[5, 15, 5, 24], [4, 1, 4, 20]])("prepares crop/stook changes in both directions (%s/%s)", async (am, ad, bm, bd) => {
    vi.useFakeTimers(); vi.stubGlobal("location", { search: "", hash: "" });
    const a = new Date(2026, am, ad, 12), b = new Date(2026, bm, bd, 12);
    vi.setSystemTime(a);
    const prepareSeason = vi.fn(async (scope: () => () => void, commit: () => void) => {
      const live = mats.kitKey(), restore = scope();
      expect(mats.kitKey()).not.toBe(live); restore();
      expect(mats.kitKey()).toBe(live); commit();
    });
    const ctx = { uniforms: createWorldUniforms(), scene: new THREE.Scene(), services: new Map([ ["preparation", { prepareSeason }] ]), timeOfDay: new TimeOfDay(), renderer: { shadowMap: {} } } as unknown as EngineContext;
    const mats = getHarbourMaterials(ctx), system = new SeasonSystem();
    system.init(ctx);
    const material = mats.kit(), version = material.version;
    const initial = mats.kitKey(), bare = mats.featureIdentity().bare;
    for (const [index, date] of [b, a].entries()) {
      system.update({ elapsed: 0, delta: 61, nowMs: date.getTime() }, ctx);
      await Promise.resolve();
      expect(mats.featureIdentity().bare).toBe(bare);
      expect(prepareSeason).toHaveBeenCalledTimes(index + 1);
      expect(material.version).toBe(version + index + 1);
    }
    expect(mats.kitKey()).toBe(initial);
    system.update({ elapsed: 1, delta: 1, nowMs: a.getTime() }, ctx);
    expect(prepareSeason).toHaveBeenCalledTimes(2);
    system.dispose(ctx); mats.dispose();
  });
});
