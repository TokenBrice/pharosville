// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HarbourUI } from "./App";
import { ACTIONS, performAction } from "./KeyList";
import { StoreContext } from "./hooks";
import { accessFixture } from "./access-test-support";

let f: ReturnType<typeof accessFixture>;
beforeEach(() => { localStorage.clear(); history.replaceState({}, "", "/?intro=0"); });
afterEach(() => { cleanup(); f?.dispose(); vi.restoreAllMocks(); });
it("reuses actions for keys and touch controls, including 80px pans and contextual Follow", async () => {
  f = accessFixture();
  const home = vi.spyOn(f.store, "goHome").mockImplementation(() => {}), watch = vi.spyOn(f.store, "toggleWatch").mockImplementation(() => {});
  const step = vi.spyOn(f.store, "stepHull").mockImplementation(() => {}), follow = vi.spyOn(f.store, "toggleFollow").mockImplementation(() => {});
  const zoom = vi.spyOn(f.store, "keyZoom").mockImplementation(() => {}), pan = vi.spyOn(f.store.ctx.rig, "dragToWorld");
  const postcard = vi.spyOn(f.store, "requestPostcard").mockImplementation(() => {});
  render(<StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider>);
  const opener = screen.getByRole("button", { name: /Help and controls/ }); opener.focus(); fireEvent.click(opener);
  const sheet = screen.getByRole("dialog", { name: "Help and controls" });
  expect(document.activeElement).toBe(within(sheet).getByRole("heading"));
  expect(within(sheet).queryByRole("button", { name: /^Follow ship/ })).toBeNull();
  fireEvent.click(within(sheet).getByText("Explore further"));
  for (const name of ["Postcard", "Previous ship", "Next ship"]) fireEvent.click(within(sheet).getByRole("button", { name: new RegExp(`^${name}`) }));
  expect(postcard).toHaveBeenCalledOnce(); expect(step.mock.calls).toEqual([[-1], [1]]);
  fireEvent.click(within(sheet).getByText("View controls"));
  for (const dir of ["up", "down", "left", "right"] as const) fireEvent.click(within(sheet).getByRole("button", { name: new RegExp(`^${ACTIONS[dir].label}`) }));
  expect(pan.mock.calls.map(([x, y]) => [x, y])).toEqual([[0, 80], [0, -80], [80, 0], [-80, 0]]);
  fireEvent.click(within(sheet).getByRole("button", { name: /^Zoom in/ })); fireEvent.click(within(sheet).getByRole("button", { name: /^Zoom out/ }));
  expect(zoom.mock.calls).toEqual([[1], [-1]]);
  act(() => f.store.set({ selected: { kind: "boat", id: f.model.boats[0]!.id } }));
  fireEvent.click(within(sheet).getByRole("button", { name: /^Follow ship/ })); expect(follow).toHaveBeenCalledOnce();
  fireEvent.click(within(sheet).getByRole("button", { name: "Close" })); expect(document.activeElement).toBe(opener);
  fireEvent.keyDown(window, { key: "h" }); expect(home).toHaveBeenCalledOnce();
  performAction(f.store, "watch"); expect(watch).toHaveBeenCalledOnce();
  await act(async () => {});
});

it("starts the watch from the help sheet's essentials on touch, and the sheet steps aside for its first stop", async () => {
  f = accessFixture();
  const watch = vi.spyOn(f.store, "toggleWatch").mockImplementation(() => {});
  render(<StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider>);
  const opener = screen.getByRole("button", { name: /Help and controls/ }); opener.focus(); fireEvent.click(opener);
  const sheet = screen.getByRole("dialog", { name: "Help and controls" });
  // with the essentials, not behind "Explore further": one tap from the open strip on a touch screen
  const start = within(sheet).getByRole("button", { name: /^Start watch/ });
  expect(start.closest("details")).toBeNull();
  fireEvent.click(start);
  expect(watch).toHaveBeenCalledOnce();
  expect(screen.queryByRole("dialog", { name: "Help and controls" })).toBeNull();
  expect(document.activeElement).toBe(opener);
  // while a watch runs the same button stops it, and the sheet stays
  act(() => f.store.set({ watch: { symbol: "USDC", line: "biggest supply change in 24 h (+$1.2B)" } }));
  fireEvent.click(opener);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Help and controls" })).getByRole("button", { name: /^Stop watch/ }));
  expect(watch).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("dialog", { name: "Help and controls" })).toBeTruthy();
  await act(async () => {});
});
