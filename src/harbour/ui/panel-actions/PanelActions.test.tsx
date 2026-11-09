// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StoreContext } from "../hooks";
import { panelFixture } from "../__fixtures__/store";
import { PanelActions, PanelOutbound } from "./PanelActions";
import { Slip } from "../Slip";

const fixtures: ReturnType<typeof panelFixture>[] = [];
afterEach(() => { cleanup(); for (const f of fixtures.splice(0)) f.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const mount = (kind: "boat" | "harbour" | "landmark" = "boat") => {
  const f = panelFixture(); fixtures.push(f);
  f.store.select({ kind, id: kind === "boat" ? "usdc-circle" : kind === "harbour" ? "Ethereum" : "pharos" }, { fly: false });
  render(<StoreContext.Provider value={f.store}><PanelActions /><PanelOutbound /><Slip /></StoreContext.Provider>);
  return f;
};

it("copies the canonical subject/chart URL, excluding view, time and diagnostics", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const f = mount();
  history.replaceState(null, "", "/?sel=ship.usdc-circle&t=22&cam=bad&quality=low&dev=1");
  act(() => f.store.set({ chartMode: true }));
  const button = screen.getByRole("button", { name: "Copy link" });
  // drawn by harbour-ui.css: the pair beside Close, 32 px, 44 px under any coarse pointer (the family touch rule)
  expect(button.className).toBe("hb-copy"); expect(button.getAttribute("style")).toBeNull();
  await act(async () => { fireEvent.click(button); });
  expect(writeText).toHaveBeenCalledWith("https://pharosville.pharos.watch/?sel=ship.usdc-circle&chart=1");
  expect(screen.getByRole("status").textContent).toBe("Link copied. Opens latest readings.");
  act(() => f.store.select({ kind: "landmark", id: "pharos" }));
  expect(screen.queryByText("Link copied. Opens latest readings.")).toBeNull();
});

it.each(["missing", "rejected"])("offers a selectable read-only URL when clipboard is %s", async (mode) => {
  vi.stubGlobal("navigator", mode === "missing" ? {} : { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("denied")) } });
  mount("harbour");
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Copy link" })); });
  const field = screen.getByRole("textbox", { name: "Copy this link:" }) as HTMLInputElement;
  expect(field.readOnly).toBe(true);
  expect(field.value).toBe("https://pharosville.pharos.watch/?sel=chain.ethereum");
  field.focus();
  expect(field.selectionStart).toBe(0); expect(field.selectionEnd).toBe(field.value.length);
});

it.each([
  ["boat", "Stablecoins on Pharos analytics", "stablecoins"],
  ["harbour", "Chains on Pharos analytics", "chains"],
] as const)("links %s panels to the honest analytics directory", (kind, label, path) => {
  mount(kind);
  const link = screen.getByRole("link", { name: new RegExp(`^${label}.*opens in a new tab`) });
  expect(link.getAttribute("href")).toBe(`https://pharos.watch/${path}/`);
  expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  expect(link.getAttribute("target")).toBe("_blank");
});

it("keeps place panels free of unrelated outbound links and renders link notices politely", () => {
  const f = mount("landmark");
  expect(screen.queryByRole("link")).toBeNull();
  act(() => f.store.set({ linkNotice: "This subject is unavailable in the current harbour." }));
  expect(screen.getByText("This subject is unavailable in the current harbour.").getAttribute("role")).toBe("status");
});
