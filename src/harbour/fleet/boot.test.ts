import type { Services } from "../engine/services";
import { describe, expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { FleetSystem } from "./fleet-system";

const harness = vi.hoisted(() => ({ kit: vi.fn(), atlas: { dispose: vi.fn() } }));
vi.mock("./hull-kit", async (original) => ({ ...await original<object>(), loadKit: harness.kit }));
vi.mock("./emblems", () => ({ EmblemAtlas: { load: async () => harness.atlas } }));

describe("required fleet kit", () => {
  it("rejects failed boot and retains the independently loaded atlas for teardown", async () => {
    const failure = new Error("kit bake failed"), log = vi.spyOn(console, "error").mockImplementation(() => {});
    harness.kit.mockRejectedValueOnce(failure);
    const fleet = new FleetSystem();
    const ctx = { services: new Map([["layout", { piers: [] }]]) as unknown as Services } as unknown as EngineContext;
    await expect(fleet.init(ctx)).rejects.toMatchObject({ code: "loading", cause: failure });
    expect((fleet as unknown as { atlas: unknown }).atlas).toBe(harness.atlas);
    log.mockRestore();
  });
});
