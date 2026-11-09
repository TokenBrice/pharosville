// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Postcard } from "./Postcard";
import { StoreContext } from "./hooks";
import { accessFixture } from "./access-test-support";
import { composePostcard, postcardCaption, postcardReceipt, type PostcardFrame } from "./postcard";
import { HarbourUI } from "./App";
import type { RenderedFleetState } from "../engine/types";
import type { HarbourFeed } from "../data/fetch";
import { TRUTH_NOW } from "../__fixtures__/projection";

vi.mock("./postcard", async (original) => ({ ...await original<typeof import("./postcard")>(), composePostcard: vi.fn() }));
let f: ReturnType<typeof accessFixture>;
beforeEach(() => {
  history.replaceState(null, "", "/?intro=0");
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:postcard"); static revokeObjectURL = vi.fn(); });
  vi.mocked(composePostcard).mockResolvedValue({ toBlob: (cb: BlobCallback) => cb(new Blob(["png"])) } as HTMLCanvasElement);
});
afterEach(() => { cleanup(); f?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }); });
async function scanDialog() {
  const results = await axe.run(screen.getByRole("dialog"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(results.violations).toEqual([]);
}
function captured(): PostcardFrame {
  return { frame: document.createElement("canvas"), receipt: postcardReceipt(f.model, 17, TRUTH_NOW,
    { status: "complete", revision: 7, displayed: 1, expected: 1 }, null, false) };
}
function setup() {
  f = accessFixture();
  const capture = vi.spyOn(f.store, "captureFrame").mockResolvedValue(captured());
  render(<StoreContext.Provider value={f.store}><button onClick={() => f.store.requestPostcard()}>Take postcard</button><Postcard /></StoreContext.Provider>);
  const opener = screen.getByRole("button", { name: "Take postcard" }); opener.focus();
  return { opener, capture };
}
it("opens a native modal immediately, blocks duplicates, focuses Save and revokes URLs on close/unmount", async () => {
  const { opener, capture } = setup();
  let resolve!: (frame: PostcardFrame) => void;
  capture.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(opener);
  expect(screen.getByRole("status").textContent).toBe("Creating postcard…");
  expect((screen.getByRole("dialog") as HTMLDialogElement).open).toBe(true); await scanDialog();
  act(() => f.store.requestPostcard()); expect(capture).toHaveBeenCalledOnce();
  await act(async () => resolve(captured()));
  const save = screen.getByRole("link", { name: "Save" }); expect(document.activeElement).toBe(save); await scanDialog();
  fireEvent(screen.getByRole("dialog"), new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(opener);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:postcard");
  fireEvent.click(opener); await screen.findByRole("link", { name: "Save" });
  cleanup(); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
});
it("announces capture/encoding failure, supports Try again, and ignores closed or unmounted late results", async () => {
  const { opener, capture } = setup(); capture.mockRejectedValueOnce(new Error("capture failed"));
  fireEvent.click(opener); await screen.findByRole("alert");
  expect(screen.getByRole("alert").textContent).toBe("The postcard could not be created."); await scanDialog();
  vi.mocked(composePostcard).mockResolvedValueOnce({ toBlob: (cb: BlobCallback) => cb(null) } as HTMLCanvasElement);
  fireEvent.click(screen.getByRole("button", { name: "Try again" })); await screen.findByRole("alert");
  expect(URL.createObjectURL).not.toHaveBeenCalled();
  let resolve!: (frame: PostcardFrame) => void;
  capture.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => resolve(captured()));
  expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
  capture.mockReturnValueOnce(new Promise((done) => { resolve = done; })); fireEvent.click(opener); cleanup();
  await act(async () => resolve(captured()));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});


/** A composer-completed callback, without creating a renderer or a browser. */
function completedFrames() {
  let listener: ((state: RenderedFleetState) => void) | null = null;
  const unsubscribe = vi.fn(() => { listener = null; });
  f.store.engine.onRendered = vi.fn((callback) => { listener = callback; return unsubscribe; });
  Object.assign(f.store.ctx.timeOfDay, { clockHour: 17, hour: 19.85 });
  f.store.ctx.services.set("readiness", { revision: 7, boats: 1, prepared: true });
  return { unsubscribe, render: () => listener?.({ revision: 7, boats: 1, drawn: 1 }) };
}

it("rejects native canvas failures instead of leaving postcard creation pending", async () => {
  f = accessFixture(); vi.useFakeTimers();
  const frames = completedFrames();
  try {
    const failure = expect(f.store.captureFrame()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(320); frames.render(); await failure;
    expect(frames.unsubscribe).toHaveBeenCalledOnce();
    expect(f.store.getSnapshot().capturing).toBe(false);
  } finally { vi.useRealTimers(); }
});

it("copies pixels and immutable evidence from the completed revision, even with a newer feed and model during capture", async () => {
  f = accessFixture(); vi.useFakeTimers();
  const frames = completedFrames();
  const oldScore = f.model.readings.psi.score;
  f.payloads.stability!.data!.current!.inputDegradation = { dewsUnavailable: true, depegEventsUnavailable: true };
  f.store.ctx.services.set("feed", { payloads: f.payloads } as HarbourFeed);
  const selected = { kind: "boat", id: f.model.boats[0]!.id } as const;
  f.store.set({ selected });
  const drawImage = vi.fn(() => {
    f.model.truth.stablecoins.state = "unavailable";
    f.model.readings.psi.score = 2;
    f.store.ctx.timeOfDay.clockHour = 21;
    f.store.set({ selected: null });
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
  try {
    const result = f.store.captureFrame();
    await vi.advanceTimersByTimeAsync(320);
    expect(drawImage).not.toHaveBeenCalled();
    frames.render();
    const { frame, receipt } = await result;
    expect(frame.width).toBe(f.canvas.width); expect(frame.height).toBe(f.canvas.height);
    expect(drawImage).toHaveBeenCalledWith(f.canvas, 0, 0);
    expect(receipt.fleetRevision).toBe(7); expect(receipt.modelBuiltAtMs).toBe(f.model.builtAtMs);
    expect(receipt.sources.stablecoins.state).toBe("current"); expect(receipt.psi?.score).toBe(oldScore);
    expect(receipt.psi?.inputDegradation).toEqual({ dewsUnavailable: false, depegEventsUnavailable: false });
    expect(postcardCaption(receipt).text).not.toContain("Computed without");
    expect(receipt.clockHour).toBe(17); expect(receipt.sourceUrl).toContain(`sel=ship.${selected.id}`);
    expect(frames.unsubscribe).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

it.each(["timeout", "abort"])("releases the completed-render listener on %s", async (failure) => {
  f = accessFixture(); vi.useFakeTimers();
  const frames = completedFrames(), controller = new AbortController();
  Object.assign(f.store.ctx, { signal: controller.signal });
  try {
    const result = expect(f.store.captureFrame()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(320);
    if (failure === "abort") controller.abort();
    else await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(frames.unsubscribe).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    expect(f.store.getSnapshot().capturing).toBe(false);
  } finally { vi.useRealTimers(); }
});

it("uses the captured receipt after feed changes during capture and composition, in both PNG and selectable DOM text", async () => {
  const { opener, capture } = setup();
  const result = captured(), cap = postcardCaption(result.receipt);
  let finishCapture!: (frame: PostcardFrame) => void, finishPrint!: (print: HTMLCanvasElement) => void;
  capture.mockReturnValueOnce(new Promise((resolve) => { finishCapture = resolve; }));
  vi.mocked(composePostcard).mockReturnValueOnce(new Promise((resolve) => { finishPrint = resolve; }));
  fireEvent.click(opener);
  f.model.readings.psi.score = 1; f.model.truth.stablecoins.state = "stale";
  Object.assign(f.store.ctx.timeOfDay, { clockHour: 3 }); f.store.set({ model: null });
  await act(async () => finishCapture(result));
  expect(composePostcard).toHaveBeenLastCalledWith(result.frame, cap);
  await act(async () => finishPrint({ toBlob: (cb: BlobCallback) => cb(new Blob(["png"])) } as HTMLCanvasElement));
  expect(screen.getByText((_, el) => el?.tagName === "P" && el.textContent === cap.text)).toBeTruthy();
  expect(screen.getByRole("link", { name: "Save" }).getAttribute("download")).toBe(cap.file);
});

it("copies the exact printed caption and supplies a selected fallback when clipboard access is absent or rejected", async () => {
  const { opener } = setup();
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  fireEvent.click(opener); await screen.findByRole("link", { name: "Save" });
  const cap = vi.mocked(composePostcard).mock.calls.at(-1)![1];
  fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
  await screen.findByText("Caption copied."); expect(writeText).toHaveBeenCalledWith(cap.text);
  writeText.mockRejectedValueOnce(new Error("denied"));
  fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
  let fallback = await screen.findByRole("textbox", { name: "Copy this caption:" }) as HTMLTextAreaElement;
  expect(fallback.value).toBe(cap.text); expect(document.activeElement).toBe(fallback);
  expect(fallback.selectionStart).toBe(0); expect(fallback.selectionEnd).toBe(cap.text.length); await scanDialog();
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
  fireEvent.click(opener); await screen.findByRole("link", { name: "Save" });
  fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
  fallback = await screen.findByRole("textbox", { name: "Copy this caption:" }) as HTMLTextAreaElement;
  expect(fallback.value).toBe(cap.text);
  expect(screen.queryByRole("button", { name: "Share" })).toBeNull();
});

it("ignores late clipboard and composition results after close or teardown", async () => {
  const { opener } = setup();
  let finishCopy!: () => void;
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: () => new Promise<void>((resolve) => { finishCopy = resolve; }) } });
  fireEvent.click(opener); await screen.findByRole("link", { name: "Save" });
  fireEvent.click(screen.getByRole("button", { name: "Copy caption" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => finishCopy()); expect(screen.queryByText("Caption copied.")).toBeNull();
  let finish!: (canvas: HTMLCanvasElement) => void;
  vi.mocked(composePostcard).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
  fireEvent.click(opener); await act(async () => {}); cleanup();
  await act(async () => finish({ toBlob: (cb: BlobCallback) => cb(new Blob(["png"])) } as HTMLCanvasElement));
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
});

it("opens the postcard by touch from the existing help sheet and returns focus to its launcher", async () => {
  f = accessFixture();
  vi.spyOn(f.store, "captureFrame").mockResolvedValue(captured());
  render(<StoreContext.Provider value={f.store}><HarbourUI /></StoreContext.Provider>);
  fireEvent.click(screen.getByRole("button", { name: /Help and controls/ }));
  const sheet = screen.getByRole("dialog", { name: "Help and controls" });
  fireEvent.click(within(sheet).getByText("Explore further"));
  const launch = within(sheet).getByRole("button", { name: /^Postcard/ }); launch.focus();
  fireEvent.pointerUp(launch, { pointerType: "touch" }); fireEvent.click(launch);
  await screen.findByRole("link", { name: "Save" });
  expect((screen.getByRole("dialog", { name: "Postcard" }) as HTMLDialogElement).open).toBe(true);
  fireEvent.click(within(screen.getByRole("dialog", { name: "Postcard" })).getByRole("button", { name: "Close" }));
  expect(document.activeElement).toBe(launch);
});
