import type { ServiceMap, Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import { buildHarbourModel } from "../model/build";
import type { HarbourModel } from "../model/types";
import { makePayloads, T0_MS } from "../sim/test-fixtures";
import type { CivicBoards } from "./boards";
import { CivicSystem } from "./civic-system";

const frame = { delta: 0.016, elapsed: 0, nowMs: T0_MS } as FrameState;
const context = (model: HarbourModel) => ({ services: new Map([["model", model]]) as Services }) as unknown as EngineContext;
afterEach(() => vi.unstubAllGlobals());
function civic() { vi.stubGlobal("location", { search: "" }); return new CivicSystem(); }

describe("civic source truth transitions", () => {
  it.each(["stale", "unknown"] as const)("banks %s flows without discarding the retained records", (state) => {
    const system = civic();
    const payloads = makePayloads();
    system.update(frame, context(buildHarbourModel(payloads, T0_MS, { dead: [] })));
    expect(system["flows"].banked).toBe(false);
    payloads.mintBurn = { ...payloads.mintBurn!, meta: state === "unknown" ? null : { ...payloads.mintBurn!.meta!, status: "stale" } };
    const model = buildHarbourModel(payloads, T0_MS, { dead: [] });
    system.update(frame, context(model));
    expect(system["flows"]).toMatchObject({ banked: true, dominance: 0, mint: { activity: 0 }, burn: { activity: 0 } });
    expect(model.readings.flows.hourly).toHaveLength(24);
  });
  it("neutralizes the grade board when its source ages, even if grades do not change", () => {
    const system = civic(), paint = vi.fn();
    system["boards"] = { paint } as unknown as CivicBoards;
    system["grades"] = {} as NonNullable<CivicSystem["grades"]>;
    const payloads = makePayloads();
    system.update(frame, context(buildHarbourModel(payloads, T0_MS, { dead: [] })));
    system["paintGrades"]();
    const currentKey = system["gradeKey"];
    payloads.safetyGrades = { ...payloads.safetyGrades!, meta: { ...payloads.safetyGrades!.meta!, status: "stale" } };
    system.update(frame, context(buildHarbourModel(payloads, T0_MS, { dead: [] })));
    system["paintGrades"]();
    expect(paint).toHaveBeenCalledTimes(2);
    expect(system["gradeKey"]).not.toBe(currentKey);
    expect(system["gradeKey"]).toBe("current:stale:none");
  });
  it("lowers movers when chain evidence stops being current, with identical retained rows", () => {
    const system = civic(), place = vi.fn(), paint = vi.fn();
    system["boards"] = { place, paint } as unknown as CivicBoards;
    const up = {}, down = {};
    system["movers"] = { up, down, hoist: { up: new THREE.Vector3(), down: new THREE.Vector3() }, size: [1, 1] } as NonNullable<CivicSystem["movers"]>;
    system["crests"] = { img: {} as HTMLImageElement, chains: { ethereum: { flag: [0, 0, 1, 1] } } };
    const payloads = makePayloads();
    const ctx = context(buildHarbourModel(payloads, T0_MS, { dead: [] }));
    const rows = [{ name: "Ethereum", id: "ethereum", change24hPct: 0.1 }];
    ctx.services.set("feed", { payloads: { chains: { data: { chains: rows } } } } as unknown as ServiceMap["feed"]);
    system.update(frame, ctx); system["paintMovers"](ctx, [0, 0]);
    const currentKey = system["moversKey"];
    payloads.chains = { ...payloads.chains!, meta: null };
    ctx.services.set("model", buildHarbourModel(payloads, T0_MS, { dead: [] }));
    system.update(frame, ctx); system["paintMovers"](ctx, [0, 0]);
    expect(system["moversKey"]).not.toBe(currentKey);
    expect(place.mock.calls.slice(-2).every((call) => call[3] === false)).toBe(true);
  });
});
