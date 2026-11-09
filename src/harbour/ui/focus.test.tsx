// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import { HarbourUI } from "./App";
import { StoreContext } from "./hooks";
import { accessFixture } from "./access-test-support";

let f: ReturnType<typeof accessFixture>;
beforeEach(() => { localStorage.clear(); history.replaceState({}, "", "/?intro=0"); });
afterEach(() => { cleanup(); f?.dispose(); });
it("returns each layer to its opener, handles disconnected search openers and exposes a skip path", async () => {
  f = accessFixture(); render(<main><StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider></main>);
  const ledger = screen.getByRole("button", { name: "Ledger and legend" }); ledger.focus(); fireEvent.click(ledger);
  await screen.findByRole("heading", { name: "What you are looking at" });
  await waitFor(() => expect(document.activeElement?.id).toBe("hb-ledger-title"));
  fireEvent.keyDown(document.activeElement!, { key: "/" });
  const input = await screen.findByRole("combobox");
  await waitFor(() => expect(document.activeElement).toBe(input));
  fireEvent.click(screen.getByRole("button", { name: "Close search" })); expect(document.activeElement?.id).toBe("hb-ledger-title");
  fireEvent.keyDown(window, { key: "Escape" }); expect(document.activeElement).toBe(ledger);
  fireEvent.click(screen.getByRole("link", { name: "Skip to harbour readings" }));
  expect(f.store.getSnapshot().ledgerOpen).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Back to harbour controls" }));
  await act(async () => { await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))); });
  expect(f.store.getSnapshot()).toMatchObject({ ledgerOpen: false, searchOpen: false, selected: null });
  expect(document.activeElement === screen.getByRole("button", { name: /PharosVille —/ })).toBe(true);
});

