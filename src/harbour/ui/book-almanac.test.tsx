// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DayBook } from "./DayBook";
import { DecorativeCalendar, CALENDAR_NOTE } from "./DecorativeCalendar";
import type { DayBookEntry, EventsService } from "../model/event-hub";
import type { SeasonService } from "../season/season-system";
import { StoreContext } from "./hooks";
import { panelFixture } from "./__fixtures__/store";
import { TRUTH_NOW } from "../__fixtures__/projection";

let f: ReturnType<typeof panelFixture>;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(TRUTH_NOW); f = panelFixture(); });
afterEach(() => { cleanup(); f.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });
const entry = (id: number, dev = false): DayBookEntry => ({ id: `${id}`, kind: "grade", atMs: Date.UTC(2026, 10, 9, 0, 1) + id, firstSeenMs: Date.UTC(2026, 10, 8, 23, 59), endpoint: "safetyGrades", coinId: null, symbol: null, field: "grade", from: "B", to: "A", text: `Entry ${id}`, staged: false, dev });
function events(initial: DayBookEntry[]) {
  let book = initial;
  const listeners = new Set<() => void>();
  const service = { version: 0, current: null, onMoment: () => () => {}, get book() { return book; }, arrivedAtMs: Date.UTC(2026, 10, 8, 12), droppedCount: 1, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; } } satisfies EventsService;
  f.ctx.services.set("events", service);
  return { publish: (next: DayBookEntry[]) => { book = next; for (const fn of listeners) fn(); } };
}
const mount = (child: React.ReactNode) => render(<StoreContext.Provider value={f.store}>{child}</StoreContext.Provider>);

describe("Day book evidence and announcements", () => {
  it("paginates 200 retained entries and exposes UTC dates, source, from/to and unstaged status", () => {
    events(Array.from({ length: 200 }, (_, i) => entry(200 - i))); mount(<DayBook />);
    expect(screen.getAllByRole("listitem")).toHaveLength(40);
    fireEvent.click(screen.getByText("Show earlier entries")); expect(screen.getAllByRole("listitem")).toHaveLength(80);
    for (let i = 0; i < 3; i++) fireEvent.click(screen.getByText("Show earlier entries"));
    expect(screen.getAllByRole("listitem")).toHaveLength(200);
    expect(screen.getByText("Showing 200 of 200 retained entries; 1 earlier entries discarded.")).toBeTruthy();
    const row = screen.getAllByRole("listitem")[0]; fireEvent.click(within(row).getByText("Observation details"));
    expect(row.textContent).toContain("First observed 2026-11-08 23:59:00 UTC; confirmed 2026-11-09 00:01:00 UTC.");
    expect(row.textContent).toContain("Source: Safety grades. grade: B → A. Recorded without a ceremony.");
  });
  it("announces only newly observed real entries while mounted, without replacing a focused summary", () => {
    const initial = Array.from({ length: 40 }, (_, i) => entry(40 - i)), ev = events(initial), ui = mount(<DayBook />);
    const live = document.querySelector('[aria-live="polite"]')!;
    expect(live.textContent).toBe("");
    const summary = screen.getAllByText("Observation details")[39]; act(() => summary.focus());
    act(() => ev.publish([entry(41), ...initial]));
    expect(live.textContent).toBe("1 new entries."); expect(document.activeElement).toBe(summary);
    const version = live.firstChild;
    act(() => ev.publish([entry(41), ...initial])); expect(live.firstChild).toBe(version);
    act(() => ev.publish([entry(42, true), entry(41), ...initial])); expect(live.firstChild).toBe(version);
    expect(screen.getAllByRole("listitem")).toHaveLength(41);
    ui.unmount(); mount(<DayBook />); expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe("");
  });
  it("keeps a focused entry even if it falls outside the retained cap", () => {
    const initial = Array.from({ length: 200 }, (_, i) => entry(200 - i)), ev = events(initial); mount(<DayBook />);
    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByText("Show earlier entries"));
    const summary = screen.getAllByText("Observation details")[199]; act(() => summary.focus());
    act(() => ev.publish([entry(201), ...initial.slice(0, 199)]));
    expect(summary.isConnected).toBe(true); expect(document.activeElement).toBe(summary);
  });
});

describe("decorative calendar", () => {
  it.each([false, true])("uses the season service's hemisphere (%s), without market readings", (southern) => {
    f.ctx.services.set("season", { season: southern ? "spring" : "autumn", southern, dayLengthHours: 10.75, overridden: false } as SeasonService);
    mount(<DecorativeCalendar />); fireEvent.click(screen.getByText("Decorative calendar"));
    expect(screen.getByText(CALENDAR_NOTE)).toBeTruthy(); expect(screen.getByText("10 h 45 min")).toBeTruthy();
    expect(screen.getByText(southern ? "Spring" : "Autumn")).toBeTruthy(); expect(screen.getByText(/Painted meteor period/)).toBeTruthy();
    expect(screen.queryByText(/PSI|Supply:|bps/)).toBeNull();
  });
  it("updates the calendar after midnight while open", () => {
    f.ctx.services.set("season", { season: "autumn", southern: false, dayLengthHours: 10, overridden: false } as SeasonService);
    vi.setSystemTime(new Date(2026, 10, 8, 23, 59)); mount(<DecorativeCalendar />);
    expect(screen.getByText(/8 November 2026/)).toBeTruthy();
    act(() => vi.advanceTimersByTime(120_000)); expect(screen.getByText(/9 November 2026/)).toBeTruthy();
  });
});

it("does not announce new entries during the panel's closing presence", () => {
  const ev = events([]), ui = mount(<DayBook open={false} />);
  act(() => ev.publish([entry(1)])); expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe("");
  ui.rerender(<StoreContext.Provider value={f.store}><DayBook /></StoreContext.Provider>);
  expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe("");
  act(() => ev.publish([entry(2), entry(1)])); expect(document.querySelector('[aria-live="polite"]')!.textContent).toBe("1 new entries.");
});
