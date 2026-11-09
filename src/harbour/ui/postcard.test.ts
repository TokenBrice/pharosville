// @vitest-environment jsdom
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { canonicalSubjectUrl } from "@shared/lib/selection-link";
import { buildHarbourModel } from "../model/build";
import type { HarbourPayloads } from "../model/types";
import { projectedFixtures, TRUTH_NOW, upstreamFixtures } from "../__fixtures__/projection";
import { TimeOfDay } from "../engine/time-of-day";
import { createWorldUniforms } from "../engine/uniforms";
import { composePostcard, postcardCaption, postcardReceipt } from "./postcard";
import { readingSentence } from "./source-state";

const NOW = Date.UTC(2026, 9, 24, 17, 10, 9);
const COMPLETE = { status: "complete", revision: 7, displayed: 1, expected: 1 } as const;
function model(input = upstreamFixtures()) {
  const payloads = Object.fromEntries(Object.entries(projectedFixtures(input)).map(([key, data]) => [key,
    { data, meta: (data as { _meta?: unknown })._meta, fetchedAtMs: TRUTH_NOW },
  ])) as HarbourPayloads;
  return buildHarbourModel(payloads, TRUTH_NOW);
}
const receipt = (m = model()) => postcardReceipt(m, 17, NOW, COMPLETE, null, false);
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("postcard receipt", () => {
  it("labels clock time separately from seasonal lighting and names the file by capture UTC", () => {
    const clock = new TimeOfDay();
    clock.season = { sunrise: 7, sunset: 17, noonElevation: 40, sunTint: new THREE.Color(1, 1, 1), saturation: 1, skyPale: 0 }; clock.setHour(17);
    clock.update(NOW, 0, createWorldUniforms());
    expect(clock.hour).not.toBe(clock.clockHour);
    const cap = postcardCaption(postcardReceipt(model(), clock.clockHour, NOW, COMPLETE, null, false));
    expect(cap.lines.slice(0, 3)).toEqual([
      "Picture captured 2026-10-24 17:10:09 UTC.", "Decorative scene time: 17:00 local.",
      "Pharos Stability Index: 91, Bedrock.",
    ]);
    expect(cap.file).toBe("pharosville-2026-10-24-171009.png");
  });

  it("keeps all seven independent source states, mixed timestamps, unknown ages and coverage", () => {
    const m = model();
    m.truth.stability = { state: "stale", ageSec: 7200, sourceUpdatedAtMs: TRUTH_NOW - 7200000, serverStatus: null };
    m.truth.stress = { state: "unavailable", ageSec: null, reason: "unverified-source", serverStatus: null };
    m.truth.mintBurn = { state: "stale", ageSec: null, serverStatus: null };
    m.boats[0]!.pegDeviationBps = null;
    const r = receipt(m), cap = postcardCaption(r);
    expect(Object.keys(r.sources)).toHaveLength(7);
    for (const [key, source] of Object.entries(r.sources)) {
      expect(source.sentence).toBe(readingSentence(m, key as keyof typeof r.sources));
      expect(cap.text).toContain(source.sentence);
    }
    expect(cap.text).toContain("Supply: current. Updated 2026-11-08 11:59:00 UTC.");
    expect(cap.text).toContain("PSI: stale. Last observed 2026-11-08 10:00:00 UTC.");
    expect(cap.text).toContain("Stress readings: unavailable. Source freshness is unverified.");
    expect(cap.text).toContain("Flow readings: stale. Source freshness is unverified.");
    expect(cap.text).toContain("Peg readings: unavailable.");
    expect(cap.stale).toBe(true);
  });

  it.each([
    [true, false, "stress signals"], [false, true, "depeg events"], [true, true, "stress signals and depeg events"],
  ])("keeps the installed PSI qualification %s/%s", (dewsUnavailable, depegEventsUnavailable, missing) => {
    const input = upstreamFixtures();
    (input.stability.current as Record<string, unknown>).inputDegradation = { dewsUnavailable, depegEventsUnavailable };
    const m = model(input), r = receipt(m);
    (m.readings.psi.inputDegradation as { dewsUnavailable: boolean }).dewsUnavailable = false;
    expect(postcardCaption(r).text).toContain(`Computed without ${missing}. A horn shutter narrows the beam until those inputs return.`);
    expect(r.psi?.qualified).toBe(true);
    expect(Object.isFrozen(r.psi?.inputDegradation)).toBe(true);
  });

  it("does not invent a PSI or source time when data is absent", () => {
    const cap = postcardCaption(postcardReceipt(null, 0, NOW, COMPLETE, null, false));
    expect(cap.lines[2]).toBe("PSI: unavailable.");
    expect(cap.text).not.toContain("Updated");
    expect(cap.text).not.toContain("Computed without");
    expect(cap.text).toContain("Source: https://pharosville.pharos.watch/ — this link opens current readings.");
  });

  it.each([
    ["partial", "2 of 3 boats displayed. This view is incomplete."],
    ["pending", "The fleet’s readings are still arriving; boats are not shown yet."],
    ["failed", "The fleet could not be prepared. Readings remain available in Pharos analytics."],
  ] as const)("keeps %s completeness and freezes the fleet revision and all evidence", (status, sentence) => {
    const m = model(), display = { status, revision: 42, displayed: 2, expected: 3 };
    const r = postcardReceipt(m, 12, NOW, display, null, false);
    m.truth.stablecoins.state = "unavailable"; m.readings.psi.score = 0; display.revision = 43;
    expect(r.fleetRevision).toBe(42); expect(r.modelBuiltAtMs).toBe(m.builtAtMs);
    expect(r.sources.stablecoins.state).toBe("current"); expect(r.psi?.score).toBe(91);
    expect(postcardCaption(r).text).toContain(sentence);
    expect(Object.isFrozen(r)).toBe(true); expect(Object.isFrozen(r.sources.stability)).toBe(true);
  });

  it("uses the canonical subject codec and drops malformed subject IDs and capture pins", () => {
    const r = postcardReceipt(model(), 12, NOW, COMPLETE, { kind: "boat", id: "usdc-circle" }, true);
    expect(r.sourceUrl).toBe(canonicalSubjectUrl({ kind: "ship", id: "usdc-circle" }, true));
    expect(postcardCaption(r).text).toContain(`Source: ${r.sourceUrl} — this link opens current readings.`);
    expect(postcardReceipt(model(), 12, NOW, COMPLETE, { kind: "harbour", id: "Ethereum" }, false).sourceUrl).toBe(canonicalSubjectUrl({ kind: "chain", id: "ethereum" }));
    expect(postcardReceipt(model(), 12, NOW, COMPLETE, { kind: "boat", id: "bad&hour=3" }, false).sourceUrl).toBe(canonicalSubjectUrl(null));
    expect(receipt().sourceUrl).not.toContain("hour");
  });

  it.each([[1600, 1000], [834 * 2, 1112 * 2], [720, 600]])("wraps every printed receipt line at drawing resolution %s×%s and expands the paper", async (width, height) => {
    const text = vi.fn();
    const context = { beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, drawImage: vi.fn(), strokeRect() {},
      createRadialGradient: () => ({ addColorStop() {} }), measureText: (line: string) => ({ width: line.length * 14 }), fillText: text,
    } as unknown as CanvasRenderingContext2D;
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context);
    const frame = document.createElement("canvas"); frame.width = width; frame.height = height;
    const cap = postcardCaption(postcardReceipt(model(), 12, NOW, COMPLETE, { kind: "boat", id: "a".repeat(120) }, false));
    const out = await composePostcard(frame, cap);
    const printed = text.mock.calls.map(([line]) => line as string);
    expect(printed.length).toBeGreaterThan(cap.lines.length + 1);
    expect(printed.every((line) => context.measureText(line).width <= width)).toBe(true);
    expect(printed.join("").replace(/\s/g, "")).toBe(cap.text.replace(/\s/g, ""));
    const lastY = text.mock.calls.at(-1)![2] as number;
    expect(lastY).toBeLessThan(out.height - 20);
    expect(out.height).toBeGreaterThan(height + 300);
    expect(context.drawImage).toHaveBeenCalledWith(frame, expect.any(Number), expect.any(Number));
  });
});
