/* @vitest-environment jsdom */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mountOverlayHarness } from "../tests/harness/overlay";
import { createReplay } from "../tests/helpers/scenario";
import fixture from "../tests/fixtures/scenarios/current.json";
let harness: Awaited<ReturnType<typeof mountOverlayHarness>> | undefined;
afterEach(async () => { await act(async () => harness?.dispose()); harness = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("mounts actual overlay components through StoreContext with keyboard close/focus", async () => {
  const replay = createReplay(fixture);
  vi.stubGlobal("fetch", replay.fetch); vi.spyOn(Date, "now").mockImplementation(replay.now);
  document.body.innerHTML = '<main><h1>Overlay contract</h1><div id="overlay"></div></main>';
  await act(async () => { harness = await mountOverlayHarness(document.getElementById("overlay")!); });
  const searchButton = screen.getByRole("button", { name: "Search (/)" }); searchButton.focus();
  fireEvent.keyDown(searchButton, { key: "/" });
  await waitFor(() => expect(screen.getByRole("combobox")).toBe(document.activeElement));
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "USDC" } });
  expect(screen.getAllByRole("option")[0]!.textContent).toContain("USDC");
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
  await waitFor(() => expect(document.getElementById("hb-panel-title")?.textContent).toBe("USDC"));
  fireEvent.keyDown(window, { key: "Escape" });
  await waitFor(() => expect(document.activeElement).toBe(searchButton));
  fireEvent.keyDown(searchButton, { key: "l" });
  await waitFor(() => expect(screen.getAllByRole("tab")).toHaveLength(5));
  fireEvent.click(screen.getByRole("tab", { name: /Coins/ }));
  expect(screen.getByRole("table").textContent).toContain("USDC");
  fireEvent.keyDown(window, { key: "Escape" });
  await act(async () => { harness!.recovery(true); });
  expect(screen.getByRole("status").textContent).toContain("could not load");
  expect(screen.getByRole("link", { name: "Open Pharos analytics" })).toBeTruthy();
});
