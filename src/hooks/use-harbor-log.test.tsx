// @vitest-environment jsdom
import { StrictMode } from "react";
import { act, render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { denseQuietArtInput, quietNormalInput, SCENARIOS, T } from "../__fixtures__/data-contract-scenarios";
import { AccessibilityLedger } from "../components/accessibility-ledger";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type { PharosVilleInputs } from "../systems/pharosville-world/pipeline-types";
import type { PharosVilleWorld } from "../systems/world-types";
import {
  HARBOR_LOG_HOLD_MS, HARBOR_LOG_SESSION_LIMIT, HARBOR_LOG_SPOKEN_LIMIT, useHarborLog,
} from "./use-harbor-log";

function stressInput(band: "CALM" | "WATCH" | "DANGER", sampleAt = T): PharosVilleInputs {
  const input = quietNormalInput();
  input.generatedAt = sampleAt * 1_000;
  input.stress!.signals["usdc-circle"] = {
    ...input.stress!.signals["usdc-circle"]!,
    band, score: band === "DANGER" ? 95 : band === "WATCH" ? 31 : 8, computedAt: sampleAt,
  };
  return input;
}

function logAt(world: PharosVilleWorld) {
  return renderHook((props: { world: PharosVilleWorld }) => useHarborLog(props), {
    initialProps: { world },
    wrapper: StrictMode,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("useHarborLog", () => {
  it("recurring accepted risk entries remain distinct but duplicate refresh stays silent", () => {
    vi.useFakeTimers();
    const { result, rerender } = logAt(buildPharosVilleWorld(stressInput("CALM")));
    for (const [index, band] of (["WATCH", "CALM", "WATCH"] as const).entries()) {
      rerender({ world: buildPharosVilleWorld(stressInput(band, T + index + 1)) });
    }
    expect(result.current.entries).toHaveLength(3);
    const watchEntries = result.current.entries.filter((entry) =>
      entry.fromLabel === "Calm Anchorage" && entry.toLabel === "Watch Breakwater");
    expect(watchEntries).toHaveLength(2);
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(3);
    const occurrenceIds = result.current.entries.map((entry) => entry.id);
    rerender({ world: buildPharosVilleWorld(stressInput("WATCH", T + 3)) });
    expect(result.current.entries.map((entry) => entry.id)).toEqual(occurrenceIds);
    for (let step = 0; step < 3; step += 1) act(() => vi.advanceTimersByTime(HARBOR_LOG_HOLD_MS));
    expect(result.current.current).toBeNull();
    rerender({ world: buildPharosVilleWorld(stressInput("WATCH", T + 4)) });
    expect(result.current.current).toBeNull();
    expect(result.current.entries.map((entry) => entry.id)).toEqual(occurrenceIds);
  });

  it("quality edges interpolate without market recovery events", () => {
    const { result, rerender } = logAt(buildPharosVilleWorld(stressInput("DANGER")));
    const held = stressInput("DANGER");
    held.freshness!.stress = { ...held.freshness!.stress, state: "stale", reason: "Refresh failed" };
    rerender({ world: buildPharosVilleWorld(held) });
    rerender({ world: buildPharosVilleWorld(stressInput("DANGER", T + 1)) });
    expect(result.current.entries).toEqual([]);
    rerender({ world: buildPharosVilleWorld(stressInput("WATCH", T + 2)) });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      fromLabel: "Danger Strait", toLabel: "Watch Breakwater", observedAt: (T + 2) * 1_000,
    });
  });

  it("keeps the accepted row time when unrelated publications are newer", () => {
    const { result, rerender } = logAt(buildPharosVilleWorld(stressInput("CALM")));
    const changed = stressInput("WATCH", T + 1);
    changed.generatedAt = (T + 120) * 1_000;
    changed.freshness!.stability = {
      ...changed.freshness!.stability, observedAt: (T + 100) * 1_000, publishedAt: (T + 120) * 1_000,
    };
    const world = buildPharosVilleWorld(changed);
    rerender({ world });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].observedAt).toBe((T + 1) * 1_000);
    expect(result.current.entries[0].observedAt).not.toBe(world.generatedAt);
    const publishedAgain = { ...changed, generatedAt: (T + 180) * 1_000 };
    rerender({ world: buildPharosVilleWorld(publishedAgain) });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0].observedAt).toBe((T + 1) * 1_000);
    const { container } = render(<AccessibilityLedger world={world} harborLogEntries={result.current.entries} />);
    expect(container.querySelector('ol[aria-label="Risk-band changes this session"] time')?.getAttribute("datetime"))
      .toBe("2023-11-14T22:13:21.000Z");
  });

  it("uses the decisive peg row, including an unknown observation time", () => {
    const { result, rerender } = logAt(buildPharosVilleWorld(stressInput("CALM")));
    const changed = stressInput("CALM", T + 60);
    const peg = changed.pegSummary!.coins.find((coin) => coin.id === "usdc-circle")!;
    peg.currentDeviationBps = -600;
    peg.priceObservedAt = T + 1;
    rerender({ world: buildPharosVilleWorld(changed) });
    expect(result.current.entries[0].observedAt).toBe((T + 1) * 1_000);
    const calmer = stressInput("CALM", T + 61);
    rerender({ world: buildPharosVilleWorld(calmer) });
    const unknown = stressInput("CALM", T + 62);
    const unknownPeg = unknown.pegSummary!.coins.find((coin) => coin.id === "usdc-circle")!;
    unknownPeg.currentDeviationBps = -600;
    unknownPeg.priceObservedAtMode = "local_fetch";
    unknownPeg.priceObservedAt = null;
    rerender({ world: buildPharosVilleWorld(unknown) });
    expect(result.current.entries).toHaveLength(3);
    expect(result.current.entries[0].observedAt).toBeNull();
  });

  it("silently resets the comparison baseline on a methodology switch", () => {
    const { result, rerender } = logAt(buildPharosVilleWorld(stressInput("CALM")));
    const changedMethod = stressInput("WATCH", T + 1);
    changedMethod.stress!.signals["usdc-circle"]!.methodologyVersion = "fixture-next";
    rerender({ world: buildPharosVilleWorld(changedMethod) });
    expect(result.current.entries).toEqual([]);
    const comparable = stressInput("DANGER", T + 2);
    comparable.stress!.signals["usdc-circle"]!.methodologyVersion = "fixture-next";
    rerender({ world: buildPharosVilleWorld(comparable) });
    expect(result.current.entries).toHaveLength(1);
    expect(result.current.entries[0]).toMatchObject({
      fromLabel: "Watch Breakwater", toLabel: "Danger Strait",
    });
  });

  it.each(["partial", "unknown", "unavailable"] as const)(
    "does not accept a %s risk reading as the next comparison baseline",
    (quality) => {
      const { result, rerender } = logAt(buildPharosVilleWorld(stressInput("DANGER")));
      const qualified = stressInput("CALM", T + 1);
      const row = qualified.stress!.signals["usdc-circle"]!;
      row.signals = quality === "unknown" ? {}
        : quality === "unavailable" ? { peg: { available: false, value: 0 } }
          : { peg: { available: false, value: 0 }, supply: { available: true, value: 0 } };
      rerender({ world: buildPharosVilleWorld(qualified) });
      expect(result.current.entries).toEqual([]);
      rerender({ world: buildPharosVilleWorld(stressInput("WATCH", T + 2)) });
      expect(result.current.entries).toHaveLength(1);
      expect(result.current.entries[0].fromLabel).toBe("Danger Strait");
    },
  );

  it("tracks the consort's own category without narrating shared formation changes", () => {
    const input = structuredClone(SCENARIOS.calmConsortBaseline);
    for (const row of Object.values(input.stress!.signals)) row.signals = { peg: { available: true, value: 0 } };
    const initial = buildPharosVilleWorld(input);
    const { result, rerender } = logAt(initial);
    const flagshipChanged = structuredClone(input);
    flagshipChanged.stress!.signals["usds-sky"] = {
      ...flagshipChanged.stress!.signals["usds-sky"]!, band: "DANGER", score: 95, computedAt: T + 1,
    };
    const shared = buildPharosVilleWorld(flagshipChanged);
    rerender({ world: shared });
    expect(result.current.entries.map((entry) => entry.detailId)).toEqual(["ship.usds-sky"]);
    const ownChanged = structuredClone(flagshipChanged);
    ownChanged.stress!.signals["susds-sky"] = {
      ...ownChanged.stress!.signals["susds-sky"]!, band: "WATCH", score: 31, computedAt: T + 2,
    };
    const own = buildPharosVilleWorld(ownChanged);
    rerender({ world: own });
    expect(own.ships.find((ship) => ship.id === "susds-sky")!.riskPlacement)
      .toBe(shared.ships.find((ship) => ship.id === "susds-sky")!.riskPlacement);
    expect(result.current.entries).toHaveLength(2);
    expect(result.current.entries[0]).toMatchObject({
      detailId: "ship.susds-sky", fromLabel: "Ledger Mooring", toLabel: "Watch Breakwater",
      observedAt: (T + 2) * 1_000,
    });
  });

  it("speaks one phrase at a time and sends overflow to the ledger only", () => {
    vi.useFakeTimers();
    const input = denseQuietArtInput();
    input.stablecoins!.peggedAssets = input.stablecoins!.peggedAssets.slice(0, 6);
    const baseline = buildPharosVilleWorld(input);
    const { result, rerender } = logAt(baseline);
    const changed = structuredClone(input);
    for (const ship of baseline.ships) Object.assign(changed.stress!.signals[ship.id]!, {
      band: "WATCH", score: 31, computedAt: T + 1,
    });
    rerender({ world: buildPharosVilleWorld(changed) });
    expect(result.current.entries).toHaveLength(6);
    const spokenIds: string[] = [];
    for (let step = 0; step < 6; step += 1) {
      if (result.current.current) spokenIds.push(result.current.current.id);
      act(() => vi.advanceTimersByTime(HARBOR_LOG_HOLD_MS));
    }
    expect(new Set(spokenIds).size).toBe(HARBOR_LOG_SPOKEN_LIMIT);
    expect(result.current.current).toBeNull();
    const silentIds = result.current.entries.filter((entry) => !spokenIds.includes(entry.id)).map((entry) => entry.id);
    expect(silentIds).toHaveLength(2);
    rerender({ world: buildPharosVilleWorld(changed) });
    expect(result.current.current).toBeNull();
    expect(result.current.entries).toHaveLength(6);
  });

  it("bounds session history while retaining the newest recurring occurrences", () => {
    vi.useFakeTimers();
    const { result, rerender } = logAt(buildPharosVilleWorld(stressInput("CALM")));
    let firstId = "";
    for (let step = 1; step <= HARBOR_LOG_SESSION_LIMIT + 1; step += 1) {
      rerender({ world: buildPharosVilleWorld(stressInput(step % 2 ? "WATCH" : "CALM", T + step)) });
      if (step === 1) firstId = result.current.entries[0].id;
      act(() => vi.advanceTimersByTime(HARBOR_LOG_HOLD_MS));
    }
    expect(result.current.entries).toHaveLength(HARBOR_LOG_SESSION_LIMIT);
    expect(result.current.entries.some((entry) => entry.id === firstId)).toBe(false);
    expect(new Set(result.current.entries.map((entry) => entry.id)).size).toBe(HARBOR_LOG_SESSION_LIMIT);
    expect(result.current.entries[0].observedAt).toBe((T + HARBOR_LOG_SESSION_LIMIT + 1) * 1_000);
  });
});
