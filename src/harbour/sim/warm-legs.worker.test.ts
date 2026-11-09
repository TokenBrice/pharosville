import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deferred } from "../engine/deferred";
import { buildSimLayout } from "./layout-graph";
import { legTimes, seedLegTimes } from "./plan";
import { outingSeed, seedOutings } from "./outings";
import { matchingSeeds } from "./seeds";

vi.mock("./layout-graph", () => ({ buildSimLayout: vi.fn(() => ({ slots: [] })) }));
vi.mock("./plan", () => ({ buildPlan: vi.fn(), legTimes: vi.fn(() => [["exact", {}]]), seedLegTimes: vi.fn() }));
vi.mock("./outings", () => ({ outingSeed: vi.fn(() => ({ lanes: [1] })), seedOutings: vi.fn() }));
vi.mock("./seeds", () => ({ matchingSeeds: vi.fn() }));
vi.mock("./plan-paths", () => ({ buildPlanLegPath: vi.fn(), pathKey: vi.fn(), planPathRequests: vi.fn() }));

beforeEach(() => { vi.resetModules(); vi.clearAllMocks(); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function worker(fetcher: ReturnType<typeof vi.fn>) {
  const scope = { onmessage: null as ((event: { data: unknown }) => void) | null, postMessage: vi.fn() };
  vi.stubGlobal("self", scope); vi.stubGlobal("fetch", fetcher);
  await import("./warm-legs.worker");
  return scope;
}

describe("seed request overlap", () => {
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
