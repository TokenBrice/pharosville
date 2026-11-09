// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleClient } from "./client";
import { ArrivalShell, HARBOUR_GUIDE } from "./components/arrival-shell";
import { DesktopOnlyFallback, SCREEN_REASON, SmallScreenWelcome, WELCOME_DETAILS, WINDOW_REASON } from "./desktop-only-fallback";
import { FALLBACK_LINKS } from "./fallback-links";

const harbourModuleLoaded = vi.hoisted(() => vi.fn());
const worldFetch = vi.fn();

vi.mock("./harbour/app/harbour-app", () => {
  harbourModuleLoaded();
  return { HarbourApp: () => <div>world runtime</div> };
});

function setViewport(screenWidth: number, screenHeight: number, width: number, height: number): void {
  Object.defineProperty(window, "screen", {
    configurable: true,
    value: {
      width: screenWidth,
      height: screenHeight,
      orientation: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
    },
  });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

function addPoster(): HTMLElement {
  const poster = document.createElement("div");
  poster.id = "pv-poster";
  document.body.appendChild(poster);
  return poster;
}

describe("PharosVilleClient viewport gate", () => {
  beforeEach(() => {
    harbourModuleLoaded.mockClear();
    worldFetch.mockReset();
    vi.stubGlobal("fetch", worldFetch);
  });

  afterEach(() => {
    cleanup();
    document.getElementById("pv-poster")?.remove();
    document.documentElement.removeAttribute("data-pv-live");
    vi.unstubAllGlobals();
  });

  it.each([[390, 844], [844, 390]])("welcomes a small %s×%s screen without importing the world or fetching", (width, height) => {
    setViewport(width, height, width, height);
    render(<PharosVilleClient />);
    expect(screen.getByRole("heading", { name: "PharosVille" })).toBeTruthy();
    expect(screen.getByText("Illustration, not live readings")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("alt")).toContain("Illustration, not live readings.");
    expect(screen.getByText(/no live readings are embedded here/)).toBeTruthy();
    expect(screen.getByText(/open a larger screen/)).toBeTruthy();
    // S08-F6: the reason and the action come before the illustration
    const reason = screen.getByText(SCREEN_REASON);
    expect(reason.compareDocumentPosition(screen.getByRole("img")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Pharos analytics" }).getAttribute("href")).toBe("https://pharos.watch/");
    expect(harbourModuleLoaded).not.toHaveBeenCalled();
    expect(worldFetch).not.toHaveBeenCalled();
  });

  it("drops the full-window poster when the gate blocks", () => {
    const poster = addPoster();
    setViewport(390, 844, 390, 844);
    render(<PharosVilleClient />);
    expect(poster.isConnected).toBe(false);
  });

  it("uses viewport dimensions, not orientation, while keeping the world behind the gate", () => {
    setViewport(2560, 1440, 720, 560);
    render(<PharosVilleClient />);
    expect(screen.getByText(WINDOW_REASON)).toBeTruthy();
    expect(screen.queryByText(/open a larger screen/)).toBeNull();
    expect(harbourModuleLoaded).not.toHaveBeenCalled();
  });

  it.each([
    [719, 600, 719, 600], [600, 719, 600, 719],
    [1200, 599, 1200, 599], [599, 1200, 599, 1200],
    [720, 600, 720, 599], [600, 720, 599, 720],
    [412, 915, 412, 915], [915, 412, 915, 412],
  ])("blocks the sorted screen/window boundary %s×%s / %s×%s before world import", (sw, sh, width, height) => {
    setViewport(sw, sh, width, height);
    render(<PharosVilleClient />);
    expect(screen.queryByText("world runtime")).toBeNull();
    expect(harbourModuleLoaded).not.toHaveBeenCalled();
    expect(worldFetch).not.toHaveBeenCalled();
    expect(screen.getByRole("navigation", { name: "Pharos analytics" }).querySelectorAll("a")).toHaveLength(5);
  });

  it.each([
    [720, 600, 720, 600], [600, 720, 600, 720],
    [900, 720, 900, 720], [1200, 640, 1200, 640],
    [832, 750, 832, 680], [750, 832, 750, 760],
    [744, 1133, 744, 1000], [1133, 744, 1133, 670],
  ])("admits the sorted gate %s×%s / %s×%s and keeps the poster for the crossfade", async (sw, sh, width, height) => {
    const poster = addPoster();
    setViewport(sw, sh, width, height);
    render(<PharosVilleClient />);
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
    expect(poster.isConnected).toBe(true);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("unmounts at shrink and remounts at the exact boundary without orientation admission", async () => {
    setViewport(2560, 1440, 720, 600);
    render(<PharosVilleClient />);
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
    setViewport(2560, 1440, 719, 600);
    fireEvent(window, new Event("resize"));
    expect(screen.queryByText("world runtime")).toBeNull();
    expect(screen.getByText(WINDOW_REASON)).toBeTruthy();
    setViewport(2560, 1440, 600, 720);
    fireEvent(window, new Event("resize"));
    await waitFor(() => expect(screen.getByText("world runtime")).toBeTruthy());
  });
});

describe("first-paint poster and arrival shell", () => {
  afterEach(cleanup);
  const html = () => new DOMParser().parseFromString(readFileSync(resolve(process.cwd(), "index.html"), "utf8"), "text/html");

  it("keeps identity, the guide and useful links without executing a module", () => {
    const shell = html();
    expect(shell.title).toBe("PharosVille: a living stablecoin harbour");
    expect(shell.querySelector("#root h1")?.textContent).toBe("PharosVille");
    expect([...shell.querySelectorAll("#root dt")].map((node) => node.textContent)).toEqual(HARBOUR_GUIDE.map((row) => row.term));
    // D20: without JavaScript the card is finished; only admission (main.tsx) writes "Raising the harbour."
    expect(shell.querySelector("#root [role=status]")?.textContent).toBe("");
    expect(readFileSync(resolve(process.cwd(), "index.html"), "utf8")).not.toContain("Raising the harbour.");
    expect(shell.querySelectorAll("#root nav a")).toHaveLength(2);
    expect(shell.querySelector("#root img, #root canvas")).toBeNull();
    expect(shell.querySelector('link[href="/arrival-shell.css"]')).not.toBeNull();
    expect(shell.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe("https://pharosville.pharos.watch/");
    expect(shell.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe("https://pharosville.pharos.watch/og-card.png");
  });

  it("paints a poster outside the React root, an illustration with no live numbers and no inline script", () => {
    const shell = html();
    const poster = shell.querySelector("body > #pv-poster");
    expect(poster?.getAttribute("aria-hidden")).toBe("true");
    const sources = [...(poster?.querySelectorAll("source, img") ?? [])].map((node) => node.getAttribute("srcset") ?? node.getAttribute("src"));
    expect(sources.join(" ")).toMatch(/\/harbour\/poster-1600\.avif/);
    expect(sources.join(" ")).toMatch(/\/harbour\/poster-1600\.webp/);
    // The CSP (public/_headers) pins no script hash: the shell must stay script-free apart from the module entry.
    expect([...shell.querySelectorAll("script")].map((node) => node.getAttribute("src"))).toEqual(["/src/main.tsx"]);
    expect(readFileSync(resolve(process.cwd(), "public/_headers"), "utf8")).not.toMatch(/sha256-/);
    expect(shell.body.textContent).not.toMatch(/PSI \d|\$\d|\d+(?:\.\d+)?\s*%/);
  });

  it("keeps the no-JS, loading and small-screen guide descriptions identical", () => {
    const descriptions = (root: ParentNode, selector: string) => [...root.querySelectorAll(selector)].map((node) => node.textContent);
    const noJsCopy = descriptions(html(), "#root .pv-arrival__guide dd");
    const arrival = render(<ArrivalShell stage="Raising the harbour." />);
    const smallScreen = render(<DesktopOnlyFallback />);
    expect(noJsCopy).toHaveLength(3);
    expect(descriptions(arrival.container, ".pv-arrival__guide dd")).toEqual(noJsCopy);
    expect(descriptions(smallScreen.container, ".pharosville-narrow__guide dd")).toEqual(noJsCopy);
    expect(descriptions(html(), "#pv-welcome .pharosville-narrow__guide dd")).toEqual(noJsCopy);
  });

  // D20: the welcome is first-byte HTML (finished without JavaScript), the same words as the React welcome.
  it("serves the finished welcome in the first byte, with the same copy as the React welcome", () => {
    const shell = html();
    const page = shell.getElementById("pv-welcome")!;
    expect(page.tagName).toBe("DIV");
    expect(page.closest("#root")).toBeNull();
    const words = (root: ParentNode, branch: "screen" | "window") => [...root.querySelectorAll(
      ".pharosville-narrow__mark, .pharosville-narrow__promise, .pharosville-narrow__reason, .pharosville-narrow__actions a, figcaption, .pharosville-narrow__inner > p:not([class]), dt, dd, summary, .pharosville-narrow__more p, nav a, .pharosville-narrow__size",
    )].filter((node) => !node.closest(`[data-pv-branch="${branch === "screen" ? "window" : "screen"}"]`))
      .map((node) => [node.textContent!.trim(), node.getAttribute("href")]);
    const forBranch = (branch: "screen" | "window") => {
      const copy = page.cloneNode(true) as HTMLElement;
      copy.querySelectorAll(`[data-pv-branch="${branch === "screen" ? "window" : "screen"}"]`).forEach((node) => node.remove());
      return copy;
    };
    expect(words(forBranch("screen"), "screen")).toEqual(words(render(<SmallScreenWelcome windowCanFit={false} />).container, "screen"));
    cleanup();
    expect(words(forBranch("window"), "window")).toEqual(words(render(<SmallScreenWelcome windowCanFit />).container, "window"));
    expect(page.querySelector('[data-pv-branch="screen"].pharosville-narrow__reason')?.textContent).toBe(SCREEN_REASON);
    expect(page.querySelector('[data-pv-branch="window"].pharosville-narrow__reason')?.textContent).toBe(WINDOW_REASON);
    // the reason and the action precede the illustration; the handoff stays inert until the welcome's module wires it
    expect(page.querySelector(".pharosville-narrow__gate + .pharosville-gate__illustration")).not.toBeNull();
    expect(page.querySelector<HTMLButtonElement>("[data-pv-copy]")?.hidden).toBe(true);
    expect(page.querySelector<HTMLButtonElement>("[data-pv-copy]")?.textContent).toBe("Copy harbour link");
    expect(page.querySelector("[data-pv-copy-status]")?.getAttribute("role")).toBe("status");
    // the illustration stays honest by day and by night, and loads only where the welcome shows
    const still = page.querySelector("img")!;
    expect(still.getAttribute("loading")).toBe("lazy");
    expect(still.getAttribute("alt")).toMatch(/Illustration, not live readings\.$/);
    expect(still.getAttribute("data-pv-night-alt")).toMatch(/Illustration, not live readings\.$/);
    expect(page.querySelectorAll("[data-pv-night]")).toHaveLength(3);
    // d-links' edge hook stays one empty, hidden element
    expect(page.querySelectorAll("#pv-shared-subject")).toHaveLength(1);
    expect(page.querySelector("#pv-shared-subject")?.hasAttribute("hidden")).toBe(true);
    expect(page.querySelectorAll("details")).toHaveLength(2);
    expect(page.querySelector("#pv-welcome nav, nav")?.querySelectorAll("a")).toHaveLength(5);
  });

  it("names the stability index one way across the welcome surfaces (Q15)", () => {
    const text = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
    expect(FALLBACK_LINKS[0]).toEqual({ href: "https://pharos.watch/stability-index/", label: "Pharos Stability Index — market-wide stability" });
    expect(text).toContain("Pharos Stability Index — market-wide stability");
    expect(text).not.toMatch(/fleet-wide health score|Peg Stability Index/);
  });

  it("teaches the welcome's details in the harbour's own approved words", () => {
    const approved = ["src/harbour/ui/Ledger.tsx", "src/harbour/ui/facts.ts"].map((file) => readFileSync(resolve(process.cwd(), file), "utf8")).join("\n");
    const sentences = WELCOME_DETAILS.flatMap((detail) => detail.text.flatMap((text) => text.split(/(?<=\.) /)));
    expect(sentences.length).toBeGreaterThan(5);
    for (const sentence of sentences) expect(approved, sentence).toContain(sentence);
  });

  it("retains the guide and links when the lazy harbour module rejects", async () => {
    vi.resetModules();
    vi.doMock("./harbour/app/harbour-app", () => { throw new Error("test module transfer failure"); });
    try {
      const { PharosVilleClient: FreshClient } = await import("./client");
      setViewport(1440, 900, 1440, 900);
      render(<FreshClient />);
      await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/could not load/));
      expect(screen.getByRole("link", { name: "Open Pharos analytics" }).getAttribute("href")).toBe("https://pharos.watch/");
    } finally {
      vi.doUnmock("./harbour/app/harbour-app");
      vi.resetModules();
    }
  });
});
