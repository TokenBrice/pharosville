// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HarbourUI } from "./App";
import { DetailFallback } from "./DetailFallback";
import { OverlayFailure } from "./OverlayFailure";
import { StoreContext } from "./hooks";
import { accessFixture } from "./access-test-support";
import { publishPresentation } from "./presentation";

let f: ReturnType<typeof accessFixture>;
beforeEach(() => { localStorage.clear(); history.replaceState({}, "", "/?intro=0"); });
afterEach(() => { cleanup(); f?.dispose(); vi.restoreAllMocks(); });
async function scan() {
  // jsdom cannot calculate rendered contrast; the browser DOM lane owns that rule and native Tab.
  const results = await axe.run(document.body, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
}
it("scans real search, every ledger tab, coin/landmark panels, sound and help states", async () => {
  f = accessFixture();
  render(<main><StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider></main>);
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  const input = await screen.findByRole("combobox"); fireEvent.change(input, { target: { value: "usdc" } }); await scan();
  fireEvent.keyDown(input, { key: "Enter" }); await screen.findByRole("heading", { name: "USDC" }); await scan();
  act(() => f.store.select({ kind: "landmark", id: "pharos" }, { fly: false }));
  await screen.findByRole("heading", { name: "The Pharos" }); await scan();
  act(() => { f.store.select(null); f.store.set({ ledgerOpen: true }); });
  await screen.findByRole("heading", { name: "What you are looking at" });
  for (const tab of screen.getAllByRole("tab")) { fireEvent.click(tab); await scan(); }
  act(() => f.store.set({ ledgerOpen: false }));
  fireEvent.click(screen.getByRole("button", { name: "Sound options" })); await scan();
  fireEvent.keyDown(screen.getByRole("menuitemradio", { name: "Sound off" }), { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: /Help and controls/ })); await scan();
  fireEvent.click(screen.getByText("Explore further")); fireEvent.click(screen.getByText("View controls")); await scan();
});
it("scans pending, unavailable and partial recovery copy plus inspectable loading/failure controls", async () => {
  f = accessFixture();
  const ui = render(<main><StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider></main>);
  for (const status of ["pending", "failed", "partial", "complete"] as const) {
    act(() => publishPresentation(f.store.ctx, { status, revision: 1, displayed: status === "partial" ? 0 : 1, expected: 1 })); await scan();
  }
  ui.unmount();
  act(() => f.store.set({ selected: { kind: "landmark", id: "pharos" }, searchOpen: true, ledgerOpen: true }));
  const loading = render(<main><StoreContext.Provider value={f.store}><DetailFallback closeLedger={() => {}} closeSearch={() => {}} closePanel={() => {}} /></StoreContext.Provider></main>);
  await scan(); loading.unmount();
  for (const scope of ["details", "controls"] as const) {
    const failure = render(<main><OverlayFailure scope={scope} attempts={1} retry={() => {}} close={() => {}} /></main>);
    await scan(); expect(screen.getByRole("button", { name: "Reload page" })).toBeTruthy(); failure.unmount();
  }
});
