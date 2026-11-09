// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CANONICAL_ORIGIN, harbourLink, startWelcome } from "./welcome-handoff";

describe("harbourLink: the canonical origin plus a valid subject only (D18)", () => {
  it.each([
    ["?sel=ship.usdc-circle", "", `${CANONICAL_ORIGIN}?sel=ship.usdc-circle`],
    ["?sel=chain.ethereum&t=22&cam=1,2,3&quality=low&dev=1", "", `${CANONICAL_ORIGIN}?sel=chain.ethereum`],
    ["?sel=place.pharos&chart=1", "", `${CANONICAL_ORIGIN}?sel=place.pharos`],
    ["", "#sel=wreck.terrausd", `${CANONICAL_ORIGIN}?sel=wreck.terrausd`],
    ["?t=22", "#sel=yard.new-coin", `${CANONICAL_ORIGIN}?sel=yard.new-coin`],
  ])("keeps %s %s", (search, hash, link) => expect(harbourLink(search, hash)).toBe(link));

  it.each([
    ["", ""], ["?t=22&view=overview", ""], ["?sel=boat.usdc", ""], ["?sel=ship.USDC", ""], ["?sel=ship.", ""],
    ["?sel=ship.usdc-", ""], ["?sel=ship.<script>", ""], ["?sel=ship.a%20b", ""], [`?sel=ship.${"a".repeat(124)}`, ""],
    ["?sel=javascript:alert(1)", ""], ["?sel=https://evil.example/", ""],
    // the legacy fragment is read only when the query names no subject
    ["?sel=nonsense", "#sel=ship.usdc-circle"],
  ])("sends the homepage for %s %s", (search, hash) => expect(harbourLink(search, hash)).toBe(CANONICAL_ORIGIN));
});

describe("startWelcome", () => {
  let page: HTMLElement;
  beforeEach(() => {
    const html = new DOMParser().parseFromString(readFileSync(resolve("index.html"), "utf8"), "text/html");
    document.body.innerHTML = html.body.innerHTML;
    page = document.getElementById("pv-welcome")!;
    window.history.replaceState(null, "", "/?sel=ship.usdc-circle&t=22");
  });
  afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, "", "/"); });

  const resize = (w: number, h: number) => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
    window.dispatchEvent(new Event("resize"));
  };
  const sides = () => [...page.querySelectorAll(".pharosville-gauge__side")].map((side) => [side.textContent, side.getAttribute("data-met")]);

  it("copies the canonical harbour link and says what it opens", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const stop = startWelcome(page);
    const button = page.querySelector<HTMLButtonElement>("[data-pv-copy]")!;
    expect(button.hidden).toBe(false);
    button.click();
    await vi.waitFor(() => expect(page.querySelector("[data-pv-copy-status]")?.textContent).toBe("Link copied. Opens latest readings."));
    expect(writeText).toHaveBeenCalledWith("https://pharosville.pharos.watch/?sel=ship.usdc-circle");
    stop();
  });

  it.each([
    ["a refused clipboard", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } }],
    ["no clipboard", {}],
  ])("offers the selectable link after %s", async (_name, nav) => {
    vi.stubGlobal("navigator", nav);
    const stop = startWelcome(page);
    page.querySelector<HTMLButtonElement>("[data-pv-copy]")!.click();
    const field = await vi.waitFor(() => {
      const input = page.querySelector<HTMLInputElement>("[data-pv-copy-status] input");
      if (!input) throw new Error("no fallback yet");
      return input;
    });
    expect(field.closest("label")?.textContent).toBe("Copy this link: ");
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe("https://pharosville.pharos.watch/?sel=ship.usdc-circle");
    expect(document.activeElement).toBe(field);
    stop();
  });

  it("measures this window against 720×600, sorted, live on resize, until the gate admits", () => {
    resize(700, 560);
    const stop = startWelcome(page);
    expect(sides()).toEqual([["Long side  700 of 720 px", "false"], ["Short side  560 of 600 px", "false"]]);
    // turning the window round changes nothing: the gauge reads sides, never orientation
    resize(560, 700);
    expect(sides()).toEqual([["Long side  700 of 720 px", "false"], ["Short side  560 of 600 px", "false"]]);
    resize(1280, 590);
    expect(sides()).toEqual([["Long side  1280 of 720 px", "true"], ["Short side  590 of 600 px", "false"]]);
    expect(page.querySelector<HTMLElement>(".pharosville-gauge__bar > span")?.style.getPropertyValue("--pv-fill")).toBe("1");
    stop();
    resize(700, 560);
    expect(sides()[0]![0]).toBe("Long side  1280 of 720 px");
  });
});
