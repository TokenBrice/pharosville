// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoreContext } from "./hooks";
import { Search } from "./Search";
import { accessFixture } from "./access-test-support";

let fixture: ReturnType<typeof accessFixture>;
afterEach(() => { cleanup(); fixture?.dispose(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function setup() {
  fixture = accessFixture();
  fixture.model = { ...fixture.model, boats: fixture.model.boats.map((boat) => ({ ...boat, symbol: "ACCESS", name: "Access test coin" })) };
  fixture.store.set({ searchOpen: true, model: fixture.model });
  const close = vi.fn(), select = vi.spyOn(fixture.store, "select").mockImplementation(() => {});
  render(<StoreContext.Provider value={fixture.store}><Search onClose={close} /></StoreContext.Provider>);
  return { input: screen.getByRole("combobox"), close, select };
}
it("keeps empty arrows valid, clamps replaced results, and selects on click or Enter only", () => {
  const { input, select } = setup();
  fireEvent.keyDown(input, { key: "ArrowDown" });
  expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  expect(screen.getByRole("status").textContent).toBe("No matches.");
  fireEvent.change(input, { target: { value: "access" } });
  expect(screen.getByRole("status").textContent).toBe("1 matches.");
  const option = screen.getByRole("option");
  fireEvent.mouseDown(option); fireEvent.mouseUp(document.body);
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(option); expect(select).toHaveBeenCalledOnce();
  fireEvent.keyDown(input, { key: "ArrowDown" }); fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledTimes(2);
  act(() => fixture.store.set({ model: { ...fixture.model, boats: [] } }));
  expect(input.hasAttribute("aria-activedescendant")).toBe(false);
  fireEvent.keyDown(input, { key: "ArrowUp" }); fireEvent.keyDown(input, { key: "Enter" });
  expect(select).toHaveBeenCalledTimes(2);
});
it("offers Close and Escape, and follows visual viewport offsets without changing admission", () => {
  const viewport = Object.assign(new EventTarget(), { offsetLeft: 20, offsetTop: 120, width: 600, height: 300 });
  vi.stubGlobal("visualViewport", viewport);
  const { input, close } = setup();
  const dialog = screen.getByRole("dialog");
  expect(dialog.style.left).toBe("320px"); expect(dialog.style.top).toBe("132px"); expect(dialog.style.maxHeight).toBe("276px");
  act(() => { viewport.height = 220; viewport.dispatchEvent(new Event("resize")); });
  expect(dialog.style.maxHeight).toBe("196px");
  fireEvent.click(screen.getByRole("button", { name: "Close search" }));
  fireEvent.keyDown(input, { key: "Escape" }); expect(close).toHaveBeenCalledTimes(2);
});
