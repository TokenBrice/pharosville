// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HarbourUI } from "./App";
import { StoreContext } from "./hooks";
import { accessFixture } from "./access-test-support";

let f: ReturnType<typeof accessFixture>;
afterEach(() => { cleanup(); f?.dispose(); vi.restoreAllMocks(); });

it("waits until an overlapping layer releases its inert opener before returning focus", async () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const width = this.matches(".hb-ledger") ? 700 : 100, height = this.matches(".hb-ledger") ? 550 : 32;
    return { left: 14, top: 14, width, height, right: 14 + width, bottom: 14 + height } as DOMRect;
  });
  f = accessFixture(); render(<StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider>);
  const opener = screen.getByRole("button", { name: "Ledger and legend" }); opener.focus(); fireEvent.click(opener);
  await screen.findByRole("heading", { name: "What you are looking at" });
  await waitFor(() => expect(opener.inert).toBe(true));
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(opener.inert).toBe(false));
  await waitFor(() => expect(document.activeElement).toBe(opener));
});
