import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../engine/deferred";
import { buildSimLayout } from "./layout-graph";
import { buildPlan, legTimes, seedLegTimes, type BoatPlan } from "./plan";
import { planPathRequests, reservePlanHolds } from "./plan-paths";
import { outingSeed, seedOutings } from "./outings";
import { matchingSeeds } from "./seeds";

vi.mock("./layout-graph", () => ({ buildSimLayout: vi.fn(() => ({ slots: [] })) }));
vi.mock("./plan", () => ({ buildPlan: vi.fn(), legTimes: vi.fn(() => [["exact", {}]]), seedLegTimes: vi.fn() }));
vi.mock("./outings", () => ({ outingSeed: vi.fn(() => ({ lanes: [1] })), seedOutings: vi.fn() }));
vi.mock("./seeds", () => ({ matchingSeeds: vi.fn() }));
vi.mock("./plan-paths", () => ({ buildPlanLegPath: vi.fn(), pathKey: vi.fn(), planPathRequests: vi.fn(), pathBuffers: vi.fn(() => new Set()), reservePlanHolds: vi.fn(() => []) }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function worker(fetcher: ReturnType<typeof vi.fn>) {
  const scope = { onmessage: null as ((event: { data: unknown }) => void) | null, postMessage: vi.fn() };
  vi.stubGlobal("self", scope); vi.stubGlobal("fetch", fetcher);
  await import("./warm-legs.worker");
  return scope;
}

describe("seed request overlap", () => {
  it("retains circuit reservations for late rejected paths after transferring the initial plan", async () => {
    const scope = await worker(vi.fn().mockResolvedValue(Response.json({ legs: [], outings: {} })));
    vi.mocked(matchingSeeds).mockResolvedValue(true);
    scope.onmessage!({ data: { type: "warm", layout: { piers: [] }, coast: null } });
    await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledOnce());
    const boat = { id: "boat", kind: "circuit", segStart: Float64Array.of(0), segEnd: Float64Array.of(100), segKind: Uint8Array.of(1), segSlot: Int32Array.of(0), segFrom: Int32Array.of(0), segLoop: Uint8Array.of(0) } as BoatPlan;
    vi.mocked(buildPlan).mockReturnValue({ key: "fleet", boats: [boat], stats: {} } as ReturnType<typeof buildPlan>);
    vi.mocked(planPathRequests).mockReturnValue({ now: [], soon: [] });
    scope.postMessage.mockImplementation((message, transfer) => structuredClone(message, { transfer }));
    scope.onmessage!({ data: { type: "prepare", id: 1, model: { planKey: "fleet", boats: [{ state: "circuit" }] }, nowMs: 0, knownPlainPaths: [] } });
    await vi.waitFor(() => expect(boat.segKind.byteLength).toBe(0));
    scope.onmessage!({ data: { type: "paths", id: 2, planRevision: 1, layoutKey: "fleet", legs: [] } });
    await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledTimes(3));
    const retained = vi.mocked(reservePlanHolds).mock.calls.at(-1)![1] as BoatPlan[];
    expect(retained[0].segKind).toEqual(Uint8Array.of(1));
    expect(scope.postMessage.mock.calls.at(-1)![0]).toMatchObject({ id: 2, holds: [] });
  });

  it.each([true, false])("fetches before any coast message, retaining seed match=%s behavior", async (matches) => {
    const response = deferred<Response>(), fetcher = vi.fn(() => response.promise);
    const scope = await worker(fetcher);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(buildSimLayout).not.toHaveBeenCalled();
    const seeds = { legs: [["seed", {}]], outings: { lanes: [] } };
    response.resolve(Response.json(seeds));
    await Promise.resolve();
    expect(scope.postMessage).not.toHaveBeenCalled();
    const layout = { piers: [] };
    vi.mocked(matchingSeeds).mockResolvedValue(matches);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    scope.onmessage!({ data: { type: "warm", layout, coast: null } });
    await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledOnce());
    expect(matchingSeeds).toHaveBeenCalledWith(seeds, layout, null);
    if (matches) {
      expect(seedLegTimes).toHaveBeenCalledWith(expect.anything(), seeds.legs);
      expect(seedOutings).toHaveBeenCalledWith(expect.anything(), seeds.outings);
      expect(legTimes).not.toHaveBeenCalled(); expect(outingSeed).not.toHaveBeenCalled();
      expect(scope.postMessage).toHaveBeenCalledWith(seeds);
    } else {
      expect(seedLegTimes).not.toHaveBeenCalled(); expect(seedOutings).not.toHaveBeenCalled();
      expect(scope.postMessage).toHaveBeenCalledWith({ legs: [["exact", {}]], outings: { lanes: null } });
    }
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("owns an early transport rejection until the warm job can report it", async () => {
    const scope = await worker(vi.fn().mockRejectedValue(new Error("seed transfer failed")));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(scope.postMessage).not.toHaveBeenCalled();
    scope.onmessage!({ data: { type: "warm", layout: { piers: [] }, coast: null } });
    await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledWith({ error: "seed transfer failed" }));
  });

  it("reports a failed HTTP seed response without applying partial seeds", async () => {
    const scope = await worker(vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    scope.onmessage!({ data: { type: "warm", layout: { piers: [] }, coast: null } });
    await vi.waitFor(() => expect(scope.postMessage).toHaveBeenCalledWith({ error: "Simulation seeds HTTP 503" }));
    expect(seedLegTimes).not.toHaveBeenCalled(); expect(seedOutings).not.toHaveBeenCalled();
  });
});
