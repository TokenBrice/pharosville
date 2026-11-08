// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Postcard } from "./Postcard";
import { StoreContext } from "./hooks";
import { accessFixture } from "./access-test-support";
import { composePostcard } from "./postcard";

vi.mock("./postcard", () => ({ postcardCaption: () => ({ title: "PharosVille", fresh: "Dated readings", file: "card.png" }), composePostcard: vi.fn() }));
let f: ReturnType<typeof accessFixture>;
beforeEach(() => {
  vi.stubGlobal("URL", class extends URL { static createObjectURL = vi.fn(() => "blob:postcard"); static revokeObjectURL = vi.fn(); });
  vi.mocked(composePostcard).mockResolvedValue({ toBlob: (cb: BlobCallback) => cb(new Blob(["png"])) } as HTMLCanvasElement);
});
afterEach(() => { cleanup(); f?.dispose(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function scanDialog() {
  const results = await axe.run(screen.getByRole("dialog"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] }, rules: { "color-contrast": { enabled: false } } });
  expect(results.violations).toEqual([]);
}
function setup() {
  f = accessFixture();
  const capture = vi.spyOn(f.store, "captureFrame").mockResolvedValue(document.createElement("canvas"));
  render(<StoreContext.Provider value={f.store}><button onClick={() => f.store.requestPostcard()}>Take postcard</button><Postcard /></StoreContext.Provider>);
  const opener = screen.getByRole("button", { name: "Take postcard" }); opener.focus();
  return { opener, capture };
}
it("opens a native modal immediately, blocks duplicates, focuses Save and revokes URLs on close/unmount", async () => {
  const { opener, capture } = setup();
  let resolve!: (frame: HTMLCanvasElement) => void;
  capture.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(opener);
  expect(screen.getByRole("status").textContent).toBe("Creating postcard…");
  expect((screen.getByRole("dialog") as HTMLDialogElement).open).toBe(true); await scanDialog();
  act(() => f.store.requestPostcard()); expect(capture).toHaveBeenCalledOnce();
  await act(async () => resolve(document.createElement("canvas")));
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
  let resolve!: (frame: HTMLCanvasElement) => void;
  capture.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  await act(async () => resolve(document.createElement("canvas")));
  expect(URL.createObjectURL).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
  capture.mockReturnValueOnce(new Promise((done) => { resolve = done; })); fireEvent.click(opener); cleanup();
  await act(async () => resolve(document.createElement("canvas")));
  expect(URL.createObjectURL).not.toHaveBeenCalled();
});


it("rejects native canvas failures instead of leaving postcard creation pending", async () => {
  f = accessFixture(); vi.useFakeTimers();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { callback(0); return 1; });
  try {
    const failure = expect(f.store.captureFrame()).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(320); await failure;
    expect(f.store.getSnapshot().capturing).toBe(false);
  } finally { vi.useRealTimers(); }
});
