// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reportFixture } from "../../__fixtures__/report";
import { StoreContext } from "../hooks";
import type { HarbourUIStore, UIState } from "../store";
import { HarbourReports, ReportSentences } from "./HarbourReports";
import { harbourReport } from "./report";
import { browserObservation, READING_KEY, returnDigest, serializeObservation } from "./digest";

const now = Date.UTC(2026, 10, 8, 12);
function harness(f = reportFixture()) {
  let state = { model: f.model } as UIState;
  const listeners = new Set<() => void>();
  const services = new Map<string, unknown>([["feed", { payloads: f.payloads }]]);
  const store = { ctx: { services }, getSnapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; } } as unknown as HarbourUIStore;
  return { store, update: (patch: Partial<UIState>) => { state = { ...state, ...patch }; for (const fn of listeners) fn(); } };
}
let recorder: typeof import("./recorder");
beforeEach(async () => {
  localStorage.clear(); vi.spyOn(Date, "now").mockReturnValue(now);
  vi.resetModules();
  recorder = await import("./recorder");
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("expandable dated evidence", () => {
  it("every report and digest sentence expands to all of its own underlying values and source times", () => {
    const f = reportFixture();
    const current = browserObservation(f.model, f.payloads, now)!;
    const prior = { ...structuredClone(current), savedAt: now - 86400e3 };
    const sentences = [...harbourReport(f.model, f.payloads, 1, now), ...harbourReport(f.model, f.payloads, 7, now), ...returnDigest(prior, current)];
    const { container } = render(<ReportSentences sentences={sentences} />);
    const details = [...container.querySelectorAll("details")];
    expect(details).toHaveLength(sentences.length);
    details.forEach((detail, i) => {
      expect(detail.open).toBe(false);
      const summary = within(detail).getByText(sentences[i].text, { selector: "summary" });
      fireEvent.click(summary);
      expect(detail.open).toBe(true);
      expect(detail.querySelectorAll("tbody th")).toHaveLength(sentences[i].inputs.length);
      expect([...detail.querySelectorAll("td")].map((el) => el.textContent)).toEqual(sentences[i].inputs.map(([, value]) => value));
      expect(detail.textContent).toContain("2026-11-08 11:59:00 UTC");
    });
  });

  it("opens the report on demand, switches periods and forgets the saved browser reading", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const f = reportFixture(), h = harness(f);
    const old = reportFixture(() => {}, now - 86400e3);
    localStorage.setItem(READING_KEY, serializeObservation(browserObservation(old.model, old.payloads, old.nowMs)!));
    render(<StoreContext.Provider value={h.store}><HarbourReports /></StoreContext.Provider>);
    expect(screen.getByText("Since your last reading")).toBeTruthy();
    expect(screen.getByText("Compared with this browser's reading at 2026-11-07 12:00:00 UTC.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "24-hour comparison" })).toBeNull();
    fireEvent.click(screen.getByText("Harbour report"));
    await waitFor(() => expect(screen.getByRole("button", { name: "24-hour comparison" })).toBeTruthy());
    expect(screen.getByText("Reported USD supply value changed by $0 across 2 comparable coins.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Seven-day comparison" }));
    expect(screen.getByText("Reported USD supply value changed by +$3.00M across 2 comparable coins.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Seven-day comparison" }).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Forget saved reading" }));
    expect(localStorage.getItem(READING_KEY)).toBeNull();
    expect(screen.getByText("Comparison unavailable.")).toBeTruthy();
    expect(screen.queryByText(/^Compared with this browser/)).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("admitted idle recorder", () => {
  it("does not save the loading world, waits for current comparable installed sources and writes once at idle", () => {
    const f = reportFixture(), h = harness(f);
    h.update({ model: null });
    const jobs: IdleRequestCallback[] = [];
    vi.stubGlobal("requestIdleCallback", vi.fn((fn: IdleRequestCallback) => { jobs.push(fn); return jobs.length; }));
    vi.stubGlobal("cancelIdleCallback", vi.fn());
    const write = vi.spyOn(localStorage, "setItem");
    const stop = recorder.recordReading(h.store);
    expect(jobs).toHaveLength(0);
    h.update({ model: f.model });
    expect(jobs).toHaveLength(1);
    expect(write).not.toHaveBeenCalled();
    f.model.truth.stability.state = "stale";
    jobs.shift()!({} as IdleDeadline);
    expect(write).not.toHaveBeenCalled();
    f.model.truth.stability.state = "current";
    h.update({ model: { ...f.model } });
    expect(jobs).toHaveLength(1);
    expect(browserObservation(h.store.getSnapshot().model, f.payloads, Date.now())).not.toBeNull();
    expect(recorder.readingSession().canSave()).toBe(true);
    jobs.shift()!({} as IdleDeadline);
    expect(recorder.readingSession().getSnapshot().unavailable).toBe(false);
    expect(write).toHaveBeenCalledTimes(1);
    h.update({ model: { ...f.model } });
    expect(jobs).toHaveLength(0);
    stop();
    // React's effect replay cannot replace this visit's already-frozen baseline or write a second time.
    recorder.recordReading(h.store)();
    expect(write).toHaveBeenCalledTimes(1);
    // Crossing the size gate creates a fresh store within the same page visit.
    recorder.recordReading(harness().store)();
    expect(write).toHaveBeenCalledTimes(1);
    expect(recorder.readingSession().getSnapshot().prior).toBeNull();
  });

  it("cancels unmounted work and a pending idle job cannot restore a forgotten record", () => {
    const h = harness(), jobs: IdleRequestCallback[] = [], cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", (fn: IdleRequestCallback) => { jobs.push(fn); return 1; });
    vi.stubGlobal("cancelIdleCallback", cancel);
    const stop = recorder.recordReading(h.store);
    act(() => recorder.readingSession().forget());
    jobs[0]({} as IdleDeadline);
    expect(localStorage.getItem(READING_KEY)).toBeNull();
    stop();
    expect(cancel).toHaveBeenCalledWith(1);
  });

  it("uses the cancellable deferred fallback when idle callbacks are unavailable", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const h = harness(), stop = recorder.recordReading(h.store);
    expect(localStorage.getItem(READING_KEY)).toBeNull();
    vi.runOnlyPendingTimers();
    expect(localStorage.getItem(READING_KEY)).not.toBeNull();
    stop();
  });
});
