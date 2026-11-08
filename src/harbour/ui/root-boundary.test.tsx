// @vitest-environment jsdom
import { act, fireEvent, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Engine } from "../engine/engine";
import { mountHarbourUI } from "./mount";

const harness = vi.hoisted(() => ({ broken: true, created: vi.fn(), disposed: vi.fn() }));
vi.mock("./store", () => ({ HarbourUIStore: class { constructor() { harness.created(); } dispose = harness.disposed; } }));
vi.mock("./App", () => ({ HarbourUI: () => { if (harness.broken) throw new Error("controls render"); return <button>Recovered controls</button>; } }));
vi.mock("../../error-reporter", () => ({ reportClientError: vi.fn() }));
afterEach(() => { document.body.innerHTML = ""; vi.restoreAllMocks(); });

it("retries root controls without adding another store or Engine system and offers reload after another failure", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const host = document.createElement("div"); document.body.append(host);
  let unmount!: () => void;
  await act(async () => { unmount = mountHarbourUI({} as Engine, host); });
  expect(screen.getByRole("heading", { name: "The harbour controls could not load." })).toBeTruthy();
  expect(screen.getByRole("heading").closest(".hb-ui")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Retry controls" }));
  await screen.findByRole("button", { name: "Reload page" });
  harness.broken = false;
  fireEvent.click(screen.getByRole("button", { name: "Retry controls" }));
  await screen.findByRole("button", { name: "Recovered controls" });
  expect(harness.created).toHaveBeenCalledOnce();
  await act(async () => unmount()); expect(harness.disposed).toHaveBeenCalledOnce();
});
