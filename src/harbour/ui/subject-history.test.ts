// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { panelFixture } from "./__fixtures__/store";
import { deadSummaries } from "../model/obituary";
import { yardCoins } from "./yard";

const details = vi.hoisted(() => ({ ready: Promise.resolve({}) }));
vi.mock("./details", () => ({ preloadDetails: vi.fn(() => details.ready) }));
const fixtures: ReturnType<typeof panelFixture>[] = [];
const fixture = (tail = "/", current = true) => {
  history.replaceState(null, "", tail);
  const f = panelFixture(1600, 1000, { restore: true, current });
  fixtures.push(f);
  return f;
};
const settle = async (f: ReturnType<typeof panelFixture>) => { f.frame(); await details.ready; await Promise.resolve(); f.frame(); };
const pop = (tail: string) => { history.replaceState(null, "", tail); dispatchEvent(new PopStateEvent("popstate")); };
beforeEach(() => {
  details.ready = Promise.resolve({});
  const reset = panelFixture(); reset.dispose();
});
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
  vi.restoreAllMocks(); vi.useRealTimers(); history.replaceState(null, "", "/");
});

describe("subject restoration and browser history", () => {
  it("normalizes the legacy fragment and lighthouse without pushing, with chart intent", async () => {
    const replace = vi.spyOn(history, "replaceState"), push = vi.spyOn(history, "pushState");
    const f = fixture("/#sel=lighthouse&chart=1");
    expect(location.search).toBe("?sel=place.pharos&chart=1");
    expect(location.hash).toBe("");
    expect(f.store.getSnapshot().selected).toBeNull();
    await settle(f);
    expect(f.store.getSnapshot()).toMatchObject({ selected: { kind: "landmark", id: "pharos" }, chartMode: true });
    expect(replace).toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
  });

  it("waits for current fleet, layout and the details module before selecting with usual framing", async () => {
    let release!: (value: object) => void;
    details.ready = new Promise((resolve) => { release = resolve; });
    const f = fixture("/?sel=ship.usdc-circle", false), layout = f.ctx.services.get("layout")!;
    const fly = vi.spyOn(f.store, "flyTo");
    f.ctx.services.delete("layout"); f.frame();
    f.model.truth.stablecoins.state = "current"; f.model.hasFleet = false; f.frame();
    f.model.hasFleet = true; f.frame();
    expect(f.store.getSnapshot().selected).toBeNull();
    f.ctx.services.set("layout", layout); f.frame();
    expect(f.store.getSnapshot().selected).toBeNull();
    release({}); await settle(f);
    expect(f.store.getSnapshot().selected).toEqual({ kind: "boat", id: "usdc-circle" });
    expect(fly).toHaveBeenCalled();
  });

  it("resolves canonical chain keys to authoritative display identities without guessed slugs", async () => {
    const f = fixture("/?sel=chain.ethereum");
    await settle(f);
    expect(f.store.getSnapshot().selected).toEqual({ kind: "harbour", id: f.model.harbours.find((h) => h.chain === "Ethereum")!.chain });
    f.store.select({ kind: "harbour", id: "Ethereum" });
    expect(location.search).toBe("?sel=chain.ethereum");
  });

  it("resolves yard and wreck identities from their current books", async () => {
    const f = fixture();
    const yard = yardCoins(f.ctx)[0]!, wreck = [...deadSummaries().keys()][0];
    for (const [kind, id] of [["yard", yard.id], ["wreck", wreck]] as const) {
      pop(`/?sel=${kind}.${id}`); await settle(f);
      expect(f.store.getSnapshot().selected).toEqual({ kind, id });
    }
  });

  it("pushes deliberate selections, ledger Read/Locate and close; stepping replaces", () => {
    const f = fixture(), boat = { kind: "boat" as const, id: f.model.boats[0].id };
    const push = vi.spyOn(history, "pushState"), replace = vi.spyOn(history, "replaceState");
    f.store.select(boat); f.store.select(boat);
    expect(push).toHaveBeenCalledTimes(1);
    f.store.select(null); f.store.readLedger(boat); f.store.returnToLedger(); f.store.readLedger(boat, true);
    expect(push).toHaveBeenCalledTimes(5);
    f.store.select({ kind: "landmark", id: "pharos" });
    vi.spyOn(f.store, "hullsInView").mockReturnValue([boat.id]);
    f.store.stepHull(1);
    expect(replace).toHaveBeenCalledOnce(); expect(push).toHaveBeenCalledTimes(6);
    expect(location.search).toBe(`?sel=ship.${boat.id}`);
  });

  it("popstate selects or closes without a push/replace feedback loop", async () => {
    const f = fixture();
    pop("/?sel=place.pharos");
    const push = vi.spyOn(history, "pushState"), replace = vi.spyOn(history, "replaceState");
    await settle(f);
    expect(f.store.getSnapshot().selected).toEqual({ kind: "landmark", id: "pharos" });
    history.replaceState(null, "", "/"); replace.mockClear(); dispatchEvent(new PopStateEvent("popstate"));
    expect(f.store.getSnapshot().selected).toBeNull();
    f.frame(); expect(push).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  });

  it("never writes history for hover, follow, Watch stops/Inspect, Look, guide steps or postcard requests", () => {
    const f = fixture();
    f.store.select({ kind: "landmark", id: "pharos" });
    const push = vi.spyOn(history, "pushState"), replace = vi.spyOn(history, "replaceState");
    const hit = { kind: "boat" as const, id: f.model.boats[0].id };
    f.store.hoverLedger(hit); f.store.setFollow(hit.id); f.store.setFollow(null);
    f.store.startWatch(); f.store.watchNext(); f.store.watchPrevious(); f.store.inspectWatch();
    f.store.look(hit); f.store.startGuide(1); f.store.startGuide(2); f.store.closeGuide(); f.store.requestPostcard();
    expect(push).not.toHaveBeenCalled(); expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ["bogus", "This subject is unavailable in the current harbour."],
    ["", "This subject is unavailable in the current harbour."],
    ["ship.%3Cscript%3E", "This subject is unavailable in the current harbour."],
    ["ship.unknown", "This subject is unavailable in the current harbour."],
    ["chain.unknown", "This subject is unavailable in the current harbour."],
    ["place.unknown", "This subject is unavailable in the current harbour."],
    ["pigeonnier", "This place is no longer in the harbour."],
  ])("keeps %s closed and answers in a transient slip", async (raw, line) => {
    vi.useFakeTimers();
    const f = fixture(`/?sel=${raw}`);
    await settle(f);
    expect(f.store.getSnapshot()).toMatchObject({ selected: null, linkNotice: line });
    expect(location.pathname + location.search + location.hash).toBe("/");
    vi.advanceTimersByTime(3500); expect(f.store.getSnapshot().linkNotice).toBeNull();
  });

  it("keeps an absent subject silent", async () => {
    const f = fixture();
    await settle(f);
    expect(f.store.getSnapshot().selected).toBeNull();
    expect(f.store.getSnapshot().linkNotice).toBeFalsy();
  });

  it("keeps invalid intent through gate teardown and readmission", async () => {
    const f = fixture("/?sel=bogus", false);
    f.dispose(); fixtures.splice(fixtures.indexOf(f), 1);
    const next = fixture(location.pathname + location.search, false);
    next.model.truth.stablecoins.state = "current"; await settle(next);
    expect(next.store.getSnapshot()).toMatchObject({ selected: null, linkNotice: "This subject is unavailable in the current harbour." });
    expect(location.pathname + location.search + location.hash).toBe("/");
  });

  it("closes an invalid popstate subject with a notice and no history writes", async () => {
    const f = fixture("/?sel=place.pharos");
    await settle(f);
    history.replaceState(null, "", "/?sel=bogus");
    const replace = vi.spyOn(history, "replaceState"), push = vi.spyOn(history, "pushState");
    dispatchEvent(new PopStateEvent("popstate")); await settle(f);
    expect(f.store.getSnapshot()).toMatchObject({ selected: null, linkNotice: "This subject is unavailable in the current harbour." });
    expect(replace).not.toHaveBeenCalled(); expect(push).not.toHaveBeenCalled();
    expect(location.search).toBe("?sel=bogus");
  });

  it("keeps unresolved intent through gate teardown and readmission", async () => {
    const f = fixture("/?sel=ship.usdc-circle&chart=1", false);
    f.dispose(); fixtures.splice(fixtures.indexOf(f), 1);
    const next = fixture(location.pathname + location.search, false);
    expect(next.store.getSnapshot().selected).toBeNull();
    next.model.truth.stablecoins.state = "current"; await settle(next);
    expect(next.store.getSnapshot()).toMatchObject({ selected: { kind: "boat", id: "usdc-circle" }, chartMode: true });
    expect(location.search).toBe("?sel=ship.usdc-circle&chart=1");
  });

  it("readmits a selected harbour by its canonical key while keeping its display identity", async () => {
    const f = fixture();
    f.store.select({ kind: "harbour", id: "Ethereum" });
    f.dispose(); fixtures.splice(fixtures.indexOf(f), 1);
    const next = fixture(location.pathname + location.search);
    await settle(next);
    expect(next.store.getSnapshot().selected).toEqual({ kind: "harbour", id: "Ethereum" });
    expect(location.search).toBe("?sel=chain.ethereum");
  });

  it("cancels a pending restore when the visitor deliberately selects something else", async () => {
    const f = fixture("/?sel=ship.usdc-circle", false);
    f.store.select({ kind: "landmark", id: "pharos" });
    f.model.truth.stablecoins.state = "current"; await settle(f);
    expect(f.store.getSnapshot().selected).toEqual({ kind: "landmark", id: "pharos" });
  });

  it("leaves a failed detail load retryable by reload without dropping the link", async () => {
    details.ready = Promise.reject(new Error("chunk unavailable"));
    const f = fixture("/?sel=place.pharos");
    await details.ready.catch(() => {}); await Promise.resolve(); f.frame();
    expect(f.store.getSnapshot()).toMatchObject({ selected: null, linkNotice: "The subject details could not load. Reload to try again." });
    expect(location.search).toBe("?sel=place.pharos");
  });
});
