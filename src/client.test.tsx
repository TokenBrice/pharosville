// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleClient, stillForLocalHour } from "./client";
import { ArrivalShell } from "./components/arrival-shell";
import { DesktopOnlyFallback } from "./desktop-only-fallback";

const desktopModuleLoaded = vi.hoisted(() => vi.fn());
const publication = { edition: "garden-observatory", revision: "a".repeat(64) };
const publicationFetch = vi.fn();

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
    publicationFetch.mockReset().mockResolvedValue({ ok: true, json: async () => publication });
    vi.stubGlobal("fetch", publicationFetch);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it.each([[390, 844], [844, 390]])("welcomes a small %s×%s screen without importing the world", async (width, height) => {
    setViewport(width, height, width, height);
    render(<PharosVilleClient />);
    const still = stillForLocalHour(new Date());
    const image = await screen.findByRole("img", { name: still.alt });
    expect(image.getAttribute("src")).toBe(`${still.jpeg}?v=${publication.revision}`);
    expect(screen.getByRole("heading", { name: "PharosVille" })).toBeTruthy();
    expect(screen.getByText("Illustration, not live readings")).toBeTruthy();
    expect(screen.getByText(/no live readings are embedded here/)).toBeTruthy();
    expect(screen.getByText(/missing evidence is not calm/)).toBeTruthy();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
    expect(publicationFetch).toHaveBeenCalledWith("/pharosville/stills/garden-social.json", expect.any(Object));
    expect(publicationFetch).toHaveBeenCalledTimes(1);
    const sources = image.closest("picture")?.querySelectorAll("source");
    expect(sources?.[0]?.getAttribute("srcset")).toContain("-portrait.avif");
    expect(sources?.[1]?.getAttribute("srcset")).toContain("-portrait.jpg");
    expect(sources?.[0]?.getAttribute("media")).toBe("(max-aspect-ratio: 1/1)");
  });

  it("uses viewport dimensions, not orientation, while keeping the world behind the gate", async () => {
    setViewport(2560, 1440, 720, 720);
    render(<PharosVilleClient />);
    expect(screen.getByText(/Your device can show the interactive garden/)).toBeTruthy();
    expect(await screen.findByRole("img", { name: /^PharosVille garden / })).toBeTruthy();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
  });

  it.each([
    [899, 720, 899, 720], [720, 899, 720, 899],
    [1199, 640, 1199, 640], [640, 1199, 640, 1199],
    [900, 720, 900, 719], [720, 900, 719, 900],
    [1200, 640, 1200, 639], [640, 1200, 639, 1200],
  ])("blocks the sorted screen/window boundary %s×%s / %s×%s before world import", async (sw, sh, width, height) => {
    setViewport(sw, sh, width, height);
    render(<PharosVilleClient />);
    expect(screen.queryByText("world runtime")).toBeNull();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Pharos analytics" })).toBeTruthy();
    expect((await screen.findByRole("img")).getAttribute("alt")).toContain("Illustration, not live readings.");
  });

  it("chooses the still of the visitor's own hour, one per light beat", () => {
    const beats = new Set<string>();
    for (let hour = 0; hour < 24; hour += 0.5) {
      const still = stillForLocalHour(new Date(2026, 8, 26, Math.floor(hour), (hour % 1) * 60));
      expect(still.jpeg).toBe(`/pharosville/stills/garden-${still.beat}.jpg`);
      expect(still.avif).toBe(`/pharosville/stills/garden-${still.beat}.avif`);
      expect(stillForLocalHour(new Date(2026, 8, 26, Math.floor(hour)), true).jpeg).toContain("-portrait.jpg");
      beats.add(still.beat);
    }
    expect([...beats].sort()).toEqual(["blue", "dawn", "day", "golden", "night"]);
    expect(stillForLocalHour(new Date(2026, 8, 26, 13)).beat).toBe("day");
  });

  it("does not substitute old harbour assets when garden publication is absent", async () => {
    publicationFetch.mockResolvedValue({ ok: false });
    setViewport(390, 844, 390, 844);
    render(<PharosVilleClient />);
    await waitFor(() => expect(publicationFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "PharosVille" })).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Pharos analytics" }).querySelectorAll("a")).toHaveLength(5);
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
  });

  it("removes a failed illustration and leaves the complete useful DOM", async () => {
    setViewport(390, 844, 390, 844);
    render(<PharosVilleClient />);
    fireEvent.error(await screen.findByRole("img"));
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByRole("heading", { name: "PharosVille" })).toBeTruthy();
    expect(screen.getByText(/Size uses a compressed supply scale/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Pharos analytics" })).toBeTruthy();
    expect(desktopModuleLoaded).not.toHaveBeenCalled();
  });

  it("ships both encodings and crops whenever a garden publication exists", () => {
    const manifest = resolve(process.cwd(), "public/pharosville/stills/garden-social.json");
    if (!existsSync(manifest)) return; // Publication is explicitly orchestrator-owned.
    const value = JSON.parse(readFileSync(manifest, "utf8")) as { edition: string; outputs: { path: string; bytes: number }[] };
    expect(value.edition).toBe("garden-observatory");
    expect(value.outputs.filter((item) => item.path.startsWith("pharosville/stills/"))).toHaveLength(20);
    for (const item of value.outputs) {
      expect(existsSync(resolve(process.cwd(), "public", item.path))).toBe(true);
      if (item.path.startsWith("pharosville/stills/")) expect(item.bytes).toBeLessThanOrEqual(90_000);
    }
  });

  it.each([[900, 720], [720, 900], [1200, 640], [640, 1200]])("admits the sorted gate %s×%s without a desktop still", async (width, height) => {
    setViewport(width, height, width, height);
    render(<PharosVilleClient />);
    expect(screen.queryByRole("img")).toBeNull();
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
    expect(publicationFetch).not.toHaveBeenCalled();
  });

  it("unmounts at shrink and remounts at the exact boundary without orientation admission", async () => {
    setViewport(2560, 1440, 900, 720);
    render(<PharosVilleClient />);
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
    setViewport(2560, 1440, 899, 720);
    fireEvent(window, new Event("resize"));
    expect(screen.queryByText("world runtime")).toBeNull();
    expect(screen.getByText(/Your device can show the interactive garden/)).toBeTruthy();
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

  it("keeps the no-JS, loading and small-screen guide descriptions identical", () => {
    const html = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    const shell = new DOMParser().parseFromString(html, "text/html");
    const descriptions = (root: ParentNode, selector: string) =>
      [...root.querySelectorAll(selector)].map((node) => node.textContent);
    const noJsCopy = descriptions(shell, "#root .pv-arrival-shell__guide dd");
    const arrival = render(<ArrivalShell stage="Loading the world data module." />);
    const smallScreen = render(<DesktopOnlyFallback />);

    expect(noJsCopy).toHaveLength(3);
    expect(descriptions(arrival.container, ".pv-arrival-shell__guide dd")).toEqual(noJsCopy);
    expect(descriptions(smallScreen.container, ".pharosville-narrow__guide dd")).toEqual(noJsCopy);
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
