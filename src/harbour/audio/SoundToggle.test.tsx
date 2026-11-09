// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SoundToggle } from "./SoundToggle";
import { BY_EAR } from "./legend";

const harness = vi.hoisted(() => {
  const snapshot = { selected: null, ledgerOpen: false };
  return {
    store: { motion: { reduced: false, still: false, subscribe: () => () => undefined, setStill: vi.fn() }, ctx: {}, subscribe: () => () => undefined, getSnapshot: () => snapshot },
    ctl: { snapshot: { mode: "off", status: "off" }, retry: vi.fn(), subscribe: () => () => undefined, toggle: vi.fn(), setMode: vi.fn(), cue: vi.fn() },
  };
});
vi.mock("../ui/hooks", () => ({ useStore: () => harness.store }));
vi.mock("./controller", () => ({ getSoundController: () => harness.ctl }));

afterEach(() => { cleanup(); harness.ctl.snapshot = { mode: "off", status: "off" }; vi.clearAllMocks(); });

it("shows the exact By ear contract on demand without starting sound or changing its preference", () => {
  expect(BY_EAR).toBe("Surf follows sea state: the share of supply off peg. Wind, rain and thunder follow early-warning stress. The foghorn means stale data. The Pharos breath follows the beam’s reach and falls silent when its reading is unavailable or stale. Mint and Burn sounds follow their displayed activity and stop when banked. Other harbour sounds and music are decorative.");
  render(<SoundToggle />);
  expect(screen.queryByText(BY_EAR)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Sound options" }));
  const help = screen.getByRole("menuitem", { name: "How to read the sounds" });
  expect(help.getAttribute("aria-expanded")).toBe("false");
  fireEvent.click(help);
  expect(screen.getByText(BY_EAR)).toBeTruthy();
  expect(help.getAttribute("aria-expanded")).toBe("true");
  expect(help.getAttribute("aria-describedby")).toBe(screen.getByText(BY_EAR).id);
  expect(harness.ctl.toggle).not.toHaveBeenCalled();
  expect(harness.ctl.setMode).not.toHaveBeenCalled();
  fireEvent.click(help);
  expect(screen.queryByText(BY_EAR)).toBeNull();
});

it("includes the reading entry in menu keyboard navigation and restores caret focus on Escape", () => {
  render(<SoundToggle />);
  const caret = screen.getByRole("button", { name: "Sound options" });
  fireEvent.keyDown(caret, { key: "ArrowDown" });
  const off = screen.getByRole("menuitemradio", { name: "Sound off" });
  const help = screen.getByRole("menuitem", { name: "How to read the sounds" });
  expect(document.activeElement).toBe(off);
  fireEvent.keyDown(off, { key: "ArrowUp" });
  expect(document.activeElement).toBe(help);
  fireEvent.keyDown(help, { key: "ArrowDown" });
  expect(document.activeElement).toBe(off);
  fireEvent.keyDown(off, { key: "End" });
  expect(document.activeElement).toBe(help);
  fireEvent.click(help);
  fireEvent.keyDown(help, { key: "Escape" });
  expect(screen.queryByRole("menu")).toBeNull();
  expect(document.activeElement).toBe(caret);
});

it.each([["paused", "Resume sound"], ["unavailable", "Try sound again"]])("keeps the preference selected while %s and exposes a keyboard retry", (status, label) => {
  harness.ctl.snapshot = { mode: "music", status };
  render(<SoundToggle />);
  const sound = screen.getByRole("button", { name: "Sound", pressed: true });
  expect(sound.getAttribute("data-status")).toBe(status);
  expect(screen.getByRole("status").textContent).toBe(status === "paused" ? "Sound paused" : "Sound unavailable");
  fireEvent.click(screen.getByRole("button", { name: "Sound options" }));
  const selected = screen.getByRole("menuitemradio", { name: "Ambient sound and music" });
  expect(selected.getAttribute("aria-checked")).toBe("true");
  fireEvent.keyDown(selected, { key: "Home" });
  const retry = screen.getByRole("menuitem", { name: label });
  expect(document.activeElement).toBe(retry);
  fireEvent.click(retry);
  expect(harness.ctl.retry).toHaveBeenCalledOnce();
  expect(harness.ctl.toggle).not.toHaveBeenCalled();
});
