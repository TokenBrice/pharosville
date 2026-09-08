// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleClient } from "./client";

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

    expect(screen.getByRole("img", { name: /PharosVille in summer daylight/i }).getAttribute("src"))
      .toContain("/pharosville/stills/garden-noon.jpg");
    expect(screen.getByText("PharosVille needs a wider harbor.")).toBeTruthy();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
  });

  it("uses viewport dimensions, not orientation, while keeping the world behind the gate", () => {
    setViewport(2560, 1440, 720, 720);

    render(<PharosVilleClient />);

    expect(screen.getByText("Give the harbor more room.")).toBeTruthy();
    expect(screen.getByRole("img", { name: /PharosVille in summer daylight/i })).toBeTruthy();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
  });
});
