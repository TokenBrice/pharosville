// @vitest-environment jsdom
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleClient, stillForLocalHour } from "./client";

const desktopModuleLoaded = vi.hoisted(() => vi.fn());

vi.mock("./pharosville-desktop-data", () => {
  desktopModuleLoaded();
  return { PharosVilleDesktopData: () => <div>world runtime</div> };
});

function setViewport(screenWidth: number, screenHeight: number, width: number, height: number): void {
  Object.defineProperty(window, "screen", {
    configurable: true,
    value: {
      width: screenWidth,
      height: screenHeight,
      orientation: {
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    },
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

describe("PharosVilleClient viewport gate", () => {
  beforeEach(() => {
    desktopModuleLoaded.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it("shows a described seasonal harbor still without importing the world on a small screen", () => {
    setViewport(640, 480, 640, 480);

    render(<PharosVilleClient />);

    const still = stillForLocalHour(new Date());
    expect(screen.getByRole("img", { name: still.alt }).getAttribute("src")).toBe(still.jpeg);
    expect(screen.getByText("PharosVille needs a wider harbor.")).toBeTruthy();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
  });

  it("uses viewport dimensions, not orientation, while keeping the world behind the gate", () => {
    setViewport(2560, 1440, 720, 720);

    render(<PharosVilleClient />);

    expect(screen.getByText("Give the harbor more room.")).toBeTruthy();
    expect(screen.getByRole("img", { name: /^PharosVille (at|by|in) / })).toBeTruthy();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
  });

  it("chooses the still of the visitor's own hour, one per light beat", () => {
    const beats = new Set<string>();
    for (let hour = 0; hour < 24; hour += 0.5) {
      const still = stillForLocalHour(new Date(2026, 8, 26, Math.floor(hour), (hour % 1) * 60));
      // Every still the gate can ask for ships.
      for (const path of [still.jpeg, still.avif]) expect(existsSync(resolve(process.cwd(), `public${path}`))).toBe(true);
      beats.add(still.beat);
    }
    expect([...beats].sort()).toEqual(["blue", "dawn", "day", "golden", "night"]);
    expect(stillForLocalHour(new Date(2026, 8, 26, 13)).beat).toBe("day");
  });
});
