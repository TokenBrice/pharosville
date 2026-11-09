// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { endpointProjector, type ProjectionJson } from "../../../functions/api/_project";
import { FlowBars, flowObservations, psiChange, psiRange, psiObservations, PSI_COMPARISON_UNAVAILABLE, Sparkline, TideBars, utcObservation } from "./charts";
import { buildHarbourModel } from "../model/build";
import type { HarbourPayloads } from "../model/types";
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
    // a daily series is labelled by its dates alone (N6); every value is unchanged
    expect(screen.getByText("3 observations from 2026-11-07 to 2026-11-11 (UTC).")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("PSI 9.0 on 2026-11-11 UTC"); // opens on the latest observation
    const summary = screen.getByText("View values");
    expect(summary.closest("details")?.open).toBe(false);
    fireEvent.click(summary);
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(rows.slice(1, 4).map((r) => r.textContent)).toEqual(["2026-11-070.0v1", "2026-11-085.0v1", "2026-11-119.0v1"]);
    expect(rows[4].textContent).toContain("Now · 2026-11-12 00:00:00"); // the live reading keeps its time
  });

  it("selects dated observations with native keyboard/touch controls without a world callback", () => {
    render(<Sparkline observations={[row(day, 0), row(day + 3600, 1)]} />);
    const previous = screen.getByRole("button", { name: "Previous observation" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Next observation" }) as HTMLButtonElement;
    // it opens on the latest observation (an hourly series keeps its times)
    expect(screen.getByRole("status").textContent).toBe("PSI 1.0 on 2026-11-07 01:00:00 UTC");
    expect(next.disabled).toBe(true);
    previous.focus();
    fireEvent.keyDown(previous, { key: "Enter" });
    fireEvent.click(previous); // Native button activation (keyboard or touch) uses the same handler.
    expect(screen.getByRole("status").textContent).toBe("PSI 0.0 on 2026-11-07 00:00:00 UTC");
    expect(previous.disabled).toBe(true);
    fireEvent.click(next);
    expect(screen.getByRole("status").textContent).toBe("PSI 1.0 on 2026-11-07 01:00:00 UTC");
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

  it("uses the same known-methodology requirement for ranges and signed changes", () => {
    expect(psiRange([row(day, 90), row(day + 86400, 40)])).toBe("40.0 – 90.0");
    for (const methodologyVersion of ["v2", null, ""]) {
      const observations = [row(day, 90), { date: day + 86400, score: 40, methodologyVersion }];
      expect(psiRange(observations)).toBe(PSI_COMPARISON_UNAVAILABLE);
      expect(psiChange(observations)).toBe(PSI_COMPARISON_UNAVAILABLE);
    }
  });

  it("requires known compatible methodology for signed point changes", () => {
    expect(psiChange([row(day, 1), row(day + 86400, 3)])).toBe("+2.0 points.");
    expect(psiChange([row(day, 3), row(day + 86400, 1)])).toBe("−2.0 points.");
    expect(psiChange([row(day, 1), row(day + 86400, 3, "v2")])).toBe(PSI_COMPARISON_UNAVAILABLE);
    expect(psiChange([{ date: day, score: 1 }, { date: day + 1, score: 2 }])).toBe(PSI_COMPARISON_UNAVAILABLE);
  });

  it("shows only the selected observation's adjacent dated change across gaps, duplicates and method boundaries", () => {
    render(<Sparkline observations={[row(day, 0), row(day + 86400, 8), row(day + 86400, 2), row(day + 5 * 86400, 12, "v2"), row(day + 6 * 86400, 15, "v2")]} />);
    expect(screen.getByRole("status").textContent).toBe("PSI 15.0 on 2026-11-13 UTC");
    expect(screen.getByText("+3.0 points. Previous observation: 2026-11-12 UTC.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous observation" }));
    expect(screen.getByRole("status").textContent).toBe("PSI 12.0 on 2026-11-12 UTC");
    expect(screen.getByText("Comparison unavailable across methodology versions. Previous observation: 2026-11-08 UTC.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous observation" }));
    expect(screen.getByRole("status").textContent).toBe("PSI 2.0 on 2026-11-08 UTC");
    expect(screen.getByText("+2.0 points. Previous observation: 2026-11-07 UTC.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Previous observation" }));
    expect(screen.queryByText(/Previous observation:/)).toBeNull();
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


describe("truth-review regressions", () => {
  it.each([undefined, "mint", "burn"] as const)("keeps a flow hover safe when a refresh shrinks or replaces the series (%s)", (side) => {
    const chart = (hourly: FlowHour[]) => side ? <FlowBars hourly={hourly} side={side} /> : <TideBars hourly={hourly} />;
    const full = Array.from({ length: 24 }, (_, i) => hour(day + i * 3600, i));
    const ui = render(chart(full));
    fireEvent.mouseEnter(ui.container.querySelectorAll("svg g")[23]);
    expect(ui.container.querySelector(".hb-axis-note")?.textContent).toContain("23:00:00 UTC");
    expect(() => ui.rerender(chart(full.slice(-3)))).not.toThrow();
    expect(ui.container.querySelector(".hb-axis-note")?.textContent).toContain("23:00:00 UTC");
    ui.rerender(chart([hour(day), hour(day + 3600), hour(day + 7200)]));
    expect(ui.container.querySelector(".hb-axis-note")?.textContent).not.toContain("23:00:00 UTC");
    expect(screen.getByText("View values")).toBeTruthy();
    ui.rerender(chart([]));
    expect(screen.getByText("No dated observations available.")).toBeTruthy();
    ui.rerender(chart(full.slice(-3)));
    expect(screen.getByText("View values")).toBeTruthy();
  });

  it.each(["projection", "chart"])("honours a withdrawn duplicate in %s PSI history", (consumer) => {
    const history = [{ date: day, score: 80 }, { date: day, score: null }, { date: day + 86400, score: 90 }];
    const projected = endpointProjector("stability")({ current: {}, history }) as unknown as { history: typeof history };
    const actual = consumer === "projection" ? projected.history : psiObservations(history);
    expect(actual).toEqual([history[2]]);
  });

  it("uses one distinct-hour series for model net/gross totals, plotted bars and values", () => {
    const hourly = Array.from({ length: 24 }, (_, i) => ({ hourTs: day + i * 3600, netFlowUsd: i, mintVolumeUsd: i + 100, burnVolumeUsd: 100, valuation: "complete" as const }));
    const latest = { ...hourly[23], netFlowUsd: 50, mintVolumeUsd: 150 };
    const model = buildHarbourModel({ mintBurn: { data: { hourly: [...hourly, latest] } } } as HarbourPayloads, day * 1000);
    const flows = model.readings.flows;
    expect(flows.hourly).toHaveLength(24);
    expect(flows.hourly[0].hourTs).toBe(day);
    expect(flows.net24hUsd).toBe(303);
    expect(flows.hourly.reduce((sum, h) => sum + h.mintUsd, 0)).toBe(2703);
    expect(flows.hourly.reduce((sum, h) => sum + h.burnUsd, 0)).toBe(2400);
    render(<TideBars hourly={flows.hourly} />);
    expect(screen.getByText(/24 of 24 hourly observations/)).toBeTruthy();
    fireEvent.click(screen.getByText("View values"));
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(25);
    expect(rows[1].textContent).toContain("2026-11-07 00:00:00");
    expect(rows[24].textContent).toContain("+$50 net minted");
  });
});


it("keeps old sparse flow observations outside both totals and the plotted daily window", () => {
  const data = { hourly: [
    { hourTs: day - 24 * 3600, netFlowUsd: 1000, mintVolumeUsd: 1000, burnVolumeUsd: 0, valuation: "complete" },
    { hourTs: day, netFlowUsd: 1, mintVolumeUsd: 1, burnVolumeUsd: 0, valuation: "complete" },
  ] };
  const model = buildHarbourModel({ mintBurn: { data } } as HarbourPayloads, day * 1000);
  expect(model.readings.flows.hourly).toHaveLength(1);
  expect(model.readings.flows.net24hUsd).toBe(1);
  expect(flowObservations(model.readings.flows.hourly).filter((r) => r.hour)).toHaveLength(1);
});
