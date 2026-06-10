import { describe, expect, it } from "vitest";
import { buildRecordingCanvasContext } from "../__test-utils__/canvas-context-builder";
import {
  drawRiskZoneHullWeathering,
  hullWeatheringLevelForZone,
} from "./ships";

describe("hullWeatheringLevelForZone", () => {
  it("buckets the six risk zones into three weathering levels", () => {
    expect(hullWeatheringLevelForZone("calm")).toBe(0);
    expect(hullWeatheringLevelForZone("watch")).toBe(0);
    expect(hullWeatheringLevelForZone("alert")).toBe(0);
    expect(hullWeatheringLevelForZone("ledger")).toBe(0);
    expect(hullWeatheringLevelForZone("warning")).toBe(1);
    expect(hullWeatheringLevelForZone("danger")).toBe(2);
    expect(hullWeatheringLevelForZone(undefined)).toBe(0);
  });
});

describe("drawRiskZoneHullWeathering", () => {
  function weatheringCalls(level: 0 | 1 | 2, shipId = "weathered-ship") {
    const recording = buildRecordingCanvasContext();
    drawRiskZoneHullWeathering({
      anchorY: 68,
      canvasHeight: 80,
      canvasWidth: 104,
      ctx: recording.ctx,
      level,
      shipId,
    });
    return recording;
  }

  it("paints nothing for clean hulls", () => {
    const recording = weatheringCalls(0);
    expect(recording.calls.length).toBe(0);
  });

  it("clips wear to sprite pixels and scales streaks with severity", () => {
    const warning = weatheringCalls(1);
    expect(warning.setStyles["globalCompositeOperation"]).toBe("source-atop");
    expect(warning.callsTo("fillRect").length).toBe(1);
    expect(warning.callsTo("stroke").length).toBe(2);
    // save/restore pair guards the composite-op change.
    expect(warning.callsTo("save").length).toBe(1);
    expect(warning.callsTo("restore").length).toBe(1);

    const danger = weatheringCalls(2);
    expect(danger.callsTo("stroke").length).toBe(4);
  });

  it("is deterministic per ship id", () => {
    const first = weatheringCalls(2, "stable-ship");
    const second = weatheringCalls(2, "stable-ship");
    expect(first.calls).toEqual(second.calls);
    const other = weatheringCalls(2, "other-ship");
    expect(first.calls).not.toEqual(other.calls);
  });
});
