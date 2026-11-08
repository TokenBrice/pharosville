// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { HarbourUI } from "./App";
import { StoreContext } from "./hooks";
import { accessFixture } from "./access-test-support";
import { readShortcuts, saveShortcuts, SHORTCUTS_KEY } from "./shortcuts";

let f: ReturnType<typeof accessFixture>;
beforeEach(() => { localStorage.clear(); history.replaceState({}, "", "/?intro=0"); });
afterEach(() => { cleanup(); f?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function setup() { f = accessFixture(); return render(<StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider>); }
it("leaves consumed/composite/editable navigation alone and always releases held arrows", async () => {
  setup(); const pan = vi.spyOn(f.store, "keyPan"), home = vi.spyOn(f.store, "goHome");
  const consumed = new KeyboardEvent("keydown", { key: "Home", cancelable: true }); consumed.preventDefault(); window.dispatchEvent(consumed);
  expect(home).not.toHaveBeenCalled();
  fireEvent.keyDown(window, { key: "ArrowUp" }); expect(pan).toHaveBeenLastCalledWith("up", true);
  const input = document.createElement("input"); document.body.append(input); input.focus();
  fireEvent.keyDown(input, { key: "Home" }); expect(home).not.toHaveBeenCalled();
  fireEvent.keyUp(input, { key: "ArrowUp" }); expect(pan).toHaveBeenLastCalledWith("up", false); input.remove();
  fireEvent.click(screen.getByRole("button", { name: "Sound options" }));
  const menuItem = screen.getByRole("menuitemradio", { name: "Sound off" });
  pan.mockClear(); fireEvent.keyDown(menuItem, { key: "ArrowDown" }); fireEvent.keyDown(menuItem, { key: "Home" });
  expect(pan).not.toHaveBeenCalled(); expect(home).not.toHaveBeenCalled();
  fireEvent.keyDown(menuItem, { key: "Escape" });
  fireEvent.keyDown(window, { key: "?" });
  fireEvent.click(screen.getByRole("checkbox", { name: "Character shortcuts" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  fireEvent.keyDown(window, { key: "/" }); fireEvent.keyDown(window, { key: "h" }); fireEvent.keyDown(window, { key: "?" });
  expect(f.store.getSnapshot().searchOpen).toBe(false); expect(home).not.toHaveBeenCalled();
  expect(screen.queryByRole("dialog", { name: "Help and controls" })).toBeNull();
  expect(localStorage.getItem(SHORTCUTS_KEY)).toBe("false");
  fireEvent.click(screen.getByRole("button", { name: /Help and controls/ }));
  expect(screen.getByRole("checkbox", { name: "Character shortcuts" }).getAttribute("checked")).toBeNull();
  await act(async () => {});
});
it("reloads the preference and falls back safely when storage is denied", () => {
  saveShortcuts(false); expect(readShortcuts()).toBe(false);
  setup(); fireEvent.keyDown(window, { key: "+" }); expect(f.store.ctx.rig.pendingDistance).toBe(300);
  const dialog = document.createElement("dialog"); document.body.append(dialog); dialog.showModal();
  const home = vi.spyOn(f.store, "goHome"); fireEvent.keyDown(window, { key: "Home" }); expect(home).not.toHaveBeenCalled(); dialog.remove();
  vi.stubGlobal("localStorage", { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } });
  expect(readShortcuts()).toBe(true); expect(() => saveShortcuts(false)).not.toThrow();
});
