// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleClient, stillForLocalHour } from "./client";
import { ArrivalShell } from "./components/arrival-shell";

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

  it.each([
    [899, 720, 899, 720], [720, 899, 720, 899],
    [1199, 640, 1199, 640], [640, 1199, 640, 1199],
    [900, 720, 900, 719], [720, 900, 719, 900],
    [1200, 640, 1200, 639], [640, 1200, 639, 1200],
  ])("blocks the sorted screen/window boundary %s×%s / %s×%s before world import", (sw, sh, width, height) => {
    setViewport(sw, sh, width, height);
    render(<PharosVilleClient />);
    expect(screen.queryByText("world runtime")).toBeNull();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Pharos analytics" })).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("alt")).toContain("Illustration, not live readings.");
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

  it.each([[900, 720], [720, 900], [1200, 640], [640, 1200]])("admits the sorted gate %s×%s without a desktop still", async (width, height) => {
    setViewport(width, height, width, height);
    render(<PharosVilleClient />);
    expect(screen.queryByRole("img")).toBeNull();
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
  });

  it("unmounts at shrink and remounts at the exact boundary without orientation admission", async () => {
    setViewport(2560, 1440, 900, 720);
    render(<PharosVilleClient />);
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
    setViewport(2560, 1440, 899, 720);
    fireEvent(window, new Event("resize"));
    expect(screen.queryByText("world runtime")).toBeNull();
    expect(screen.getByText("Give the harbor more room.")).toBeTruthy();
    setViewport(2560, 1440, 720, 900);
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
  });
});

describe("first-byte and React arrival shell", () => {
  afterEach(cleanup);

  it("keeps identity, a generic guide and useful links without executing a module", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const shell = new DOMParser().parseFromString(html, "text/html");
    expect(shell.querySelector("#root h1")?.textContent).toBe("PharosVille");
    expect([...shell.querySelectorAll("#root dt")].map((node) => node.textContent)).toEqual(["Lighthouse", "Water", "Sails"]);
    expect(shell.querySelector("#root [role=status]")?.textContent).toBe("Waiting for the application module.");
    expect(shell.querySelectorAll("#root nav a")).toHaveLength(2);
    expect(shell.querySelector("#root img, #root canvas")).toBeNull();
    expect(shell.querySelector("#root")?.textContent).not.toMatch(/PSI \d|loading \d|% complete/i);
    expect(shell.querySelector('link[href="/arrival-shell.css"]')).not.toBeNull();
  });

  it("replaces the same meaningful shell with the observed loading stage, never anonymous progress", () => {
    render(<ArrivalShell stage="Preparing the renderer and shaders." />);
    expect(screen.getByRole("heading", { name: "PharosVille" })).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Preparing the renderer and shaders.");
    expect(screen.getByRole("link", { name: "Open Pharos analytics" }).getAttribute("href")).toBe("https://pharos.watch/");
    expect(screen.getByText(/Size uses a compressed supply scale/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("retains the branded guide and links when the lazy data module rejects", async () => {
    vi.resetModules();
    vi.doMock("./pharosville-desktop-data", () => { throw new Error("test module transfer failure"); });
    try {
      // Exercise a fresh lazy module boundary after installing the rejecting
      // import mock; a static import would retain the already resolved module.
      const { PharosVilleClient: ColdClient } = await import("./client");
      setViewport(2560, 1440, 1200, 640);
      render(<ColdClient />);
      expect(screen.getByRole("heading", { name: "PharosVille" })).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("Loading the world data module.");
      await waitFor(() => expect(screen.getByRole("status").textContent).toContain("The world module could not load."));
      expect(screen.getByRole("link", { name: "Open Pharos analytics" })).toBeTruthy();
      expect(screen.getByText(/missing evidence is not calm/)).toBeTruthy();
      expect(screen.queryByText("world runtime")).toBeNull();
    } finally {
      vi.doUnmock("./pharosville-desktop-data");
    }
  });
});
