// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Guide, guideStopFor } from "./Guide";
import { WatchControls } from "./WatchControls";
import { StoreContext } from "./hooks";
import { panelFixture } from "./__fixtures__/store";
import { TRUTH_NOW } from "../__fixtures__/projection";

let f: ReturnType<typeof panelFixture>;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TRUTH_NOW); f = panelFixture(); });
afterEach(() => { cleanup(); f.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });
const mount = () => render(<StoreContext.Provider value={f.store}><Guide /><WatchControls /></StoreContext.Provider>);

describe("optional five-stop guide", () => {
  it("never starts or flies without a request; replays without storage and restores focus", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    const fly = vi.spyOn(f.store, "flyTo");
    const origin = document.createElement("button"); document.body.append(origin); origin.focus();
    mount(); expect(screen.queryByRole("dialog")).toBeNull(); expect(fly).not.toHaveBeenCalled();
    act(() => f.store.startGuide());
    expect(screen.getByText("The Pharos: market-wide stability")).toBeTruthy();
    for (const title of ["Boats and piers: supply by chain", "The Shoals: off-peg coins", "Weather: early warning", "The Keeper’s Log: freshness"]) {
      fireEvent.click(screen.getByRole("button", { name: "Next" })); expect(screen.getByText(title)).toBeTruthy();
    }
    expect(fly).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Back" })); expect(screen.getByText("Weather: early warning")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Close guide" })); expect(document.activeElement).toBe(origin);
    act(() => f.store.startGuide()); expect(screen.getByText("The Pharos: market-wide stability")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Inspect reading" }));
    expect(fly).toHaveBeenCalledOnce(); expect(f.store.getSnapshot().selected).toEqual({ kind: "landmark", id: "pharos" }); origin.remove();
  });
  it("explains unavailable targets and keeps navigation available", () => {
    vi.mocked(f.store.picking.worldPosition).mockReturnValue(null);
    mount(); act(() => f.store.startGuide(2));
    expect(screen.getByText(/This subject is unavailable/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "Inspect reading" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Next" })); expect(f.store.getSnapshot().guideStop).toBe(3);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull();
  });
});

it("Watch buttons and keys invoke the same store controls", () => {
  const previous = vi.spyOn(f.store, "watchPrevious").mockImplementation(() => {}), next = vi.spyOn(f.store, "watchNext").mockImplementation(() => {}), inspect = vi.spyOn(f.store, "inspectWatch").mockImplementation(() => {});
  mount(); act(() => f.store.set({ watch: { symbol: "X", line: "current reason" } }));
  fireEvent.click(screen.getByRole("button", { name: "Previous" })); fireEvent.keyDown(screen.getByRole("region", { name: "Harbourmaster’s watch" }), { key: "ArrowLeft" });
  fireEvent.click(screen.getByRole("button", { name: "Next" })); fireEvent.keyDown(screen.getByRole("region", { name: "Harbourmaster’s watch" }), { key: "ArrowRight" });
  fireEvent.click(screen.getByRole("button", { name: "Inspect" }));
  expect(previous).toHaveBeenCalledTimes(2); expect(next).toHaveBeenCalledTimes(2); expect(inspect).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Stop watch" })); expect(f.store.getSnapshot().watch).toBeNull();
});

it("links matching panels to the relevant guide stop", () => {
  expect(guideStopFor({ kind: "landmark", id: "pharos" })).toBe(0);
  expect(guideStopFor({ kind: "harbour", id: "Ethereum" })).toBe(1);
  expect(guideStopFor({ kind: "landmark", id: "shoals" })).toBe(2);
  expect(guideStopFor({ kind: "landmark", id: "storm-mast" })).toBe(3);
  expect(guideStopFor({ kind: "landmark", id: "keeperslog" })).toBe(4);
  expect(guideStopFor({ kind: "wreck", id: "dead" })).toBeNull();
});

it("returns keyboard focus to the Watch launcher after Stop", () => {
  const origin = document.createElement("button"); document.body.append(origin); origin.focus();
  mount(); act(() => f.store.set({ watch: { symbol: "X", line: "current reason" } }));
  const stop = screen.getByRole("button", { name: "Stop watch" }); act(() => stop.focus()); fireEvent.click(stop);
  expect(document.activeElement).toBe(origin); origin.remove();
});

it("falls back to the wordmark when the guide launcher has closed", () => {
  const mark = document.createElement("button"); mark.className = "hb-mark-btn"; document.body.append(mark);
  mount(); act(() => f.store.startGuide()); fireEvent.click(screen.getByRole("button", { name: "Close guide" }));
  expect(document.activeElement).toBe(mark); mark.remove();
});

it("discloses every degraded PSI input at the Pharos stop with the shared wording (truth review)", () => {
  const feed = f.store.ctx.services.get("feed")!;
  const current = feed.payloads.stability!.data!.current as { inputDegradation?: { dewsUnavailable?: boolean; depegEventsUnavailable?: boolean } };
  mount(); act(() => f.store.startGuide(0));
  for (const [degradation, missing] of [
    [{ dewsUnavailable: true }, "stress signals"],
    [{ depegEventsUnavailable: true }, "depeg events"],
    [{ dewsUnavailable: true, depegEventsUnavailable: true }, "stress signals and depeg events"],
  ] as const) {
    current.inputDegradation = degradation;
    act(() => f.store.startGuide(1)); act(() => f.store.startGuide(0));
    expect(screen.getByText(`Computed without ${missing}. A horn shutter narrows the beam until those inputs return.`)).toBeTruthy();
  }
  delete current.inputDegradation;
  act(() => f.store.startGuide(1)); act(() => f.store.startGuide(0));
  expect(screen.queryByText(/Computed without/)).toBeNull();
  expect(screen.getByText(/computed without stress signals or depeg events\./)).toBeTruthy();
});

it("Home ends the watch from its own controls (D14)", () => {
  const home = vi.spyOn(f.store, "goHome");
  mount(); act(() => f.store.set({ watch: { symbol: "X", line: "current reason" } }));
  const next = screen.getByRole("button", { name: "Next" }); act(() => next.focus());
  fireEvent.keyDown(next, { key: "Home" });
  expect(home).toHaveBeenCalledOnce();
  expect(f.store.getSnapshot().watch).toBeNull();
});
