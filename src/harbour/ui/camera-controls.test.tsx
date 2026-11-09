// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoreContext } from "./hooks";
import { ShipChooser } from "./ShipChooser";
import { HelpSheet } from "./HelpSheet";
import { ensureMotionService } from "./services";
import type { HarbourUIStore } from "./store";
import type { EngineContext } from "../engine/types";

vi.mock("../audio/controller", () => ({ getSoundController: () => ({ mode: "off", subscribe: () => () => {}, cue() {}, toggle() {}, setMode() {} }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows at most five named ships and offers selection, Cancel and native Escape", () => {
  const set = vi.fn(), select = vi.fn();
  const store = { set, select, boat: (id: string) => ({ symbol: id.toUpperCase(), name: `Coin ${id}` }) } as unknown as HarbourUIStore;
  render(<StoreContext.Provider value={store}><ShipChooser choices={Array.from({ length: 8 }, (_, i) => ({ kind: "boat", id: `${i}` }))} /></StoreContext.Provider>);
  const dialog = screen.getByRole("dialog", { name: "Choose a ship" });
  expect(screen.getAllByRole("button")).toHaveLength(6);
  fireEvent.click(screen.getByRole("button", { name: "0 · Coin 0" }));
  expect(select).toHaveBeenCalledWith({ kind: "boat", id: "0" });
  fireEvent.click(screen.getByRole("button", { name: "Cancel" })); expect(set).toHaveBeenLastCalledWith({ shipChoices: [] });
  fireEvent(dialog, new Event("cancel", { cancelable: true })); expect(set).toHaveBeenLastCalledWith({ shipChoices: [] });
});

it("offers Still world in Help and controls with the exact continued-readings copy, respecting OS reduction", () => {
  vi.stubGlobal("matchMedia", () => ({ matches: true, addEventListener() {}, removeEventListener() {} }));
  const ctx = { services: new Map() } as unknown as EngineContext, motion = ensureMotionService(ctx);
  const store = { ctx, motion, getSnapshot: () => ({ selected: null, ledgerOpen: false }), subscribe: () => () => {} } as unknown as HarbourUIStore;
  render(<StoreContext.Provider value={store}><HelpSheet onClose={() => {}} shortcuts={true} setShortcuts={() => {}} /></StoreContext.Provider>);
  const checkbox = screen.getByRole("checkbox", { name: "Still world" });
  expect(screen.getByText("Motion is still. Readings continue to update.")).toBeTruthy();
  fireEvent.click(checkbox); expect(motion.still).toBe(true);
  fireEvent.click(checkbox); expect(motion.still).toBe(false); expect(motion.reduced).toBe(true);
  motion.dispose();
});
