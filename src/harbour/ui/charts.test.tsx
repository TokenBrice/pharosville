// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { endpointProjector, type ProjectionJson } from "../../../functions/api/_project";
import { FlowBars, flowObservations, psiChange, psiObservations, PSI_COMPARISON_UNAVAILABLE, Sparkline, TideBars, utcObservation } from "./charts";
import type { FlowHour } from "./flow-copy";

afterEach(cleanup);
const day = Date.UTC(2026, 10, 7) / 1000;
const row = (date: number, score: number, methodologyVersion = "v1") => ({ date, score, methodologyVersion });
const hour = (hourTs: number, netUsd: number | null = 0, valuation: FlowHour["valuation"] = "complete"): FlowHour => ({ hourTs, netUsd, mintUsd: 20, burnUsd: 10, valuation });

describe("dated PSI observations", () => {
  it("validates before the tail, keeps the last duplicate and matches projection", () => {
    const history = [...Array.from({ length: 35 }, (_, i) => row(day + i * 86400, i)), row(day + 34 * 86400, 99), row(9e15, 1), row(-1, 1), row(NaN, 1), row(day, NaN)];
    const normalized = psiObservations(history);
    const projected = endpointProjector("stability")({ current: {}, history } as unknown as ProjectionJson) as unknown as { history: typeof history };
    expect(normalized).toEqual(projected.history);
    expect(normalized).toHaveLength(30);
    expect(normalized[0].date).toBe(day + 5 * 86400);
    expect(normalized.at(-1)?.score).toBe(99);
  });

  it("spaces sparse dots by UTC time and ends with one hollow live mark, without interpolation", () => {
    const observations = [row(day, 0), row(day + 86400, 5), row(day + 4 * 86400, 9)];
    const { container } = render(<Sparkline observations={observations} now={12} nowAt={day + 5 * 86400} />);
    expect(container.querySelector("path")).toBeNull();
    const xs = [...container.querySelectorAll(".hb-chart-observation")].map((c) => Number(c.getAttribute("cx")));
    expect((xs[2] - xs[1]) / (xs[1] - xs[0])).toBeCloseTo(3);
    const mark = container.querySelector(".hb-chart-now")!;
    expect(mark.getAttribute("fill")).toBe("none");
    expect(mark.querySelector("title")?.textContent).toContain("Now · 12.0");
    expect(screen.getByText("3 observations from 2026-11-07 00:00:00 to 2026-11-11 00:00:00 (UTC).")).toBeTruthy();
    const summary = screen.getByText("View values");
    expect(summary.closest("details")?.open).toBe(false);
    fireEvent.click(summary);
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(5);
  });

  it("selects dated observations with native keyboard/touch controls without a world callback", () => {
    render(<Sparkline observations={[row(day, 0), row(day + 3600, 1)]} />);
    const previous = screen.getByRole("button", { name: "Previous observation" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next observation" }) as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    next.focus();
    fireEvent.keyDown(next, { key: "Enter" });
    fireEvent.click(next); // Native button activation (keyboard or touch) uses the same handler.
    expect(screen.getByRole("status").textContent).toBe("2026-11-07 01:00:00 UTC · 1.0");
    expect(next.disabled).toBe(true);
    fireEvent.click(previous);
    expect(screen.getByRole("status").textContent).toBe("2026-11-07 00:00:00 UTC · 0.0");
  });

  it("retains single and stale dated observations, but never invents dates", () => {
    const ui = render(<Sparkline observations={[row(day, 0)]} now={null} />);
    expect(document.querySelectorAll(".hb-chart-observation")).toHaveLength(1);
    expect((screen.getByRole("button", { name: "Next observation" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector(".hb-chart-now")).toBeNull();
    ui.rerender(<Sparkline observations={[row(NaN, 0)]} now={12} nowAt={null} />);
    expect(screen.getByText("No dated observations available.")).toBeTruthy();
    expect(utcObservation(day)).toBe("2026-11-07 00:00:00");
  });

  it("requires known compatible methodology for signed point changes", () => {
    expect(psiChange([row(day, 1), row(day + 86400, 3)])).toBe("+2.0 points.");
    expect(psiChange([row(day, 3), row(day + 86400, 1)])).toBe("−2.0 points.");
    expect(psiChange([row(day, 1), row(day + 86400, 3, "v2")])).toBe(PSI_COMPARISON_UNAVAILABLE);
    expect(psiChange([{ date: day, score: 1 }, { date: day + 1, score: 2 }])).toBe(PSI_COMPARISON_UNAVAILABLE);
  });
});

describe("hourly observations", () => {
  it("sorts and deduplicates timestamps, leaves missing hours empty, and preserves zero/withheld valuation", () => {
    const hourly = [hour(day + 2 * 3600, null, "partial"), hour(day), hour(day, 5), hour(NaN)];
    const rows = flowObservations(hourly);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.date === day)?.hour?.netUsd).toBe(5);
    expect(rows.find((r) => r.date === day + 3600)?.hour).toBeNull();
    render(<TideBars hourly={hourly} />);
    expect(screen.getByText(/2 of 24 hourly observations\./)).toBeTruthy();
    expect(document.querySelectorAll(".hb-chart-positive")).toHaveLength(1);
    fireEvent.click(screen.getByText("View values"));
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByText("partial")).toBeTruthy();
    expect(within(table).getAllByText("Missing hourly observation.")).toHaveLength(1);
  });

  it("uses actual bounds and positions for a short sparse series, labels lower bounds on gross amounts", () => {
    render(<FlowBars hourly={[hour(day, 0), hour(day + 3 * 3600, null, "partial")]} side="mint" />);
    expect(screen.getByText("2026-11-07 00:00:00 to 2026-11-07 03:00:00 (UTC). 2 of 24 hourly observations.")).toBeTruthy();
    const bars = [...document.querySelectorAll(".hb-chart-positive")];
    expect(Number(bars[1].getAttribute("x")) - Number(bars[0].getAttribute("x"))).toBeCloseTo(3 * 75);
    fireEvent.click(screen.getByText("View values"));
    expect(within(screen.getByRole("table")).getByText("At least $20 minted.")).toBeTruthy();
  });
});
