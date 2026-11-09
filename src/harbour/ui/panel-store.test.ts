// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { panelFixture } from "./__fixtures__/store";
import { TRUTH_NOW } from "../__fixtures__/projection";

const fixtures: ReturnType<typeof panelFixture>[] = [];
const fixture = () => { const f = panelFixture(); fixtures.push(f); return f; };
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TRUTH_NOW); });
afterEach(() => { for (const f of fixtures.splice(0)) f.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("selection owns layout framing only until camera input", () => {
  it("reframes measured panel/sheet changes across 900px, cuts in still mode, and protects a manual pan", () => {
    const f = fixture(), panel = document.createElement("aside");
    let width = 364, height = 700;
    Object.defineProperties(panel, { offsetWidth: { get: () => width }, offsetHeight: { get: () => height } });
    f.store.measurePanel("panel", panel);
    const fly = vi.spyOn(f.store, "flyTo");
    f.store.select({ kind: "landmark", id: "pharos" }); f.frame();
    fly.mockClear(); width = 834; height = 500; f.resize(834, 1112); f.frame(); expect(fly).toHaveBeenCalledOnce();
    f.store.motion.setStill(true); f.resize(1112, 834); f.frame(); expect(f.rig.gliding).toBe(false);
    f.rig.pan(20, 10); fly.mockClear(); f.resize(1600, 1000); f.frame(); expect(fly).not.toHaveBeenCalled();
  });
  it("reading a record preserves the camera while Locate hides the ledger first", () => {
    const f = fixture(), hit = { kind: "boat" as const, id: f.model.boats[0].id }, fly = vi.spyOn(f.store, "flyTo");
    f.store.updateLedger({ tab: "Coins" }); f.store.set({ ledgerOpen: true });
    f.store.readLedger(hit); expect(fly).not.toHaveBeenCalled(); expect(f.store.getSnapshot().ledgerOpen).toBe(true);
    f.store.returnToLedger(); expect(f.store.getSnapshot().ledger!.views.Coins.row).toBe(hit.id);
    f.store.readLedger(hit, true); expect(fly).toHaveBeenCalledOnce(); expect(f.store.getSnapshot().ledgerOpen).toBe(false);
  });
  it("restores only identifiers after a new current installed model, discarding missing selections", () => {
    const f = fixture(); f.store.updateLedger({ tab: "Coins" }); f.store.updateLedgerView("Coins", { query: "USDC", scroll: 88, row: "gone" });
    f.store.set({ ledgerOpen: true }); f.store.select({ kind: "boat", id: "gone" }, { fly: false }); f.dispose(); fixtures.splice(fixtures.indexOf(f), 1);
    // New runtime starts with an unverified source: no saved selection is shown.
    const next = panelFixture(1600, 1000, { restore: true, current: false }); fixtures.push(next);
    expect(next.store.getSnapshot().selected).toBeNull();
    expect(next.store.getSnapshot().ledger!.views.Coins.query).toBe("USDC");
    next.model.truth.stablecoins.state = "current"; next.frame();
    expect(next.store.getSnapshot()).toMatchObject({ selected: null, ledgerOpen: true });
  });
});

describe("visitor-paced current Watch", () => {
  const ranked = () => {
    const f = fixture(), base = f.model.boats[0];
    f.model.boats = [{ ...base, id: "mover", symbol: "M", supplyPrevDay: base.supply - 2e6 }, { ...base, id: "depeg", symbol: "D", activeDepeg: true, pegDeviationBps: 300, supplyPrevDay: base.supply }];
    f.ctx.services.set("model", { ...f.model }); f.frame(); return f;
  };
  it("holds for 60s under reduced motion and uses Previous/Next/Inspect explicitly", () => {
    const f = ranked(); f.store.motion.setStill(true); f.store.startWatch();
    const at = f.rig.target.clone(); expect(f.store.getSnapshot().watch!.symbol).toBe("M");
    for (let i = 0; i < 60; i++) f.frame(1);
    expect(f.store.getSnapshot().watch!.symbol).toBe("M"); expect(f.rig.target).toEqual(at);
    f.store.watchNext(); expect(f.store.getSnapshot().watch!.symbol).toBe("D");
    f.store.watchPrevious(); expect(f.store.getSnapshot().watch!.symbol).toBe("M");
    f.store.inspectWatch(); expect(f.store.getSnapshot()).toMatchObject({ watch: null, selected: { kind: "boat", id: "mover" } });
  });
  it("keeps the 20s normal dwell and stops unsupported recovered or stale reasons", () => {
    const f = ranked(); f.store.startWatch(); f.rig.stop(); f.frame(19); expect(f.store.getSnapshot().watch!.symbol).toBe("M");
    f.frame(1); expect(f.store.getSnapshot().watch!.symbol).toBe("D");
    f.store.motion.setStill(true); f.model.boats[1].activeDepeg = false; f.ctx.services.set("model", { ...f.model }); f.frame(); f.frame();
    expect(f.store.getSnapshot().watch).toBeNull();
    f.store.startWatch(); f.model.truth.stablecoins.state = "stale"; f.ctx.services.set("model", { ...f.model }); f.frame(); f.frame();
    expect(f.store.getSnapshot()).toMatchObject({ watch: null, announce: "The watch is waiting for current readings." });
  });
});

it("readmission waits for current readiness before restoring a valid selection and camera intent", () => {
  const f = fixture(), hit = { kind: "boat" as const, id: f.model.boats[0].id };
  f.store.select(hit); f.dispose(); fixtures.splice(fixtures.indexOf(f), 1);
  const next = panelFixture(834, 1112, { restore: true, current: false }); fixtures.push(next);
  expect(next.store.getSnapshot().selected).toBeNull();
  const fly = vi.spyOn(next.store, "flyTo"); next.frame(); expect(fly).not.toHaveBeenCalled();
  next.model.truth.stablecoins.state = "current"; next.frame();
  expect(next.store.getSnapshot().selected).toEqual(hit); expect(fly).toHaveBeenCalled();
});

describe("the watch at a landmark, and the moment slip's Look (O7-I4)", () => {
  const stressed = () => {
    const f = fixture(), now = Date.now();
    const fresh = { state: "current" as const, ageSec: 0, sourceUpdatedAtMs: now, serverStatus: null };
    f.model.truth = { ...f.model.truth, stability: { ...fresh }, stablecoins: { ...f.model.truth.stablecoins, ...fresh }, pegSummary: { ...f.model.truth.pegSummary, ...fresh } };
    f.model.readings = { ...f.model.readings, psi: { ...f.model.readings.psi, lit: true, stale: false, score: 61, band: "FRACTURE", lamp: "red" } };
    f.ctx.services.set("model", { ...f.model }); f.frame(); return f;
  };
  it("frames the Pharos as its selection would, holds it still, and inspects its panel", () => {
    const f = stressed(), steer = vi.spyOn(f.rig, "steer");
    f.store.startWatch();
    expect(f.store.getSnapshot().watch).toEqual({ symbol: "The Pharos", line: "PSI 61.0 · Fracture" });
    expect(f.store.getSnapshot().announce).toBe("Watch: The Pharos, PSI 61.0 · Fracture.");
    expect(f.rig.gliding).toBe(true);
    f.rig.stop(); f.frame(1); f.frame(1);
    expect(steer).not.toHaveBeenCalled();
    f.store.inspectWatch();
    expect(f.store.getSnapshot()).toMatchObject({ watch: null, selected: { kind: "landmark", id: "pharos" } });
  });
  it("Look glides only to a subject out of view, and shows its tag either way", () => {
    const f = fixture(), move = vi.spyOn(f.store, "moveTo"), hit = { kind: "boat" as const, id: f.model.boats[0].id };
    f.store.look(hit); // worldPosition is the rig's own target here: in view
    expect(move).not.toHaveBeenCalled();
    expect(f.store.getSnapshot().hover).toEqual(hit);
    vi.mocked(f.store.picking.worldPosition).mockReturnValue([2000, 0, 2000]);
    f.store.look({ kind: "landmark", id: "pharos" });
    expect(move).toHaveBeenCalledOnce();
    expect(f.store.getSnapshot().hover).toEqual({ kind: "landmark", id: "pharos" });
    expect(f.store.getSnapshot().selected).toBeNull();
  });
});
