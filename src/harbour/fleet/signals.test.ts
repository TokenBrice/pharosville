import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Bunting, LAUNCH_DRESS_MS } from "./bunting";
import { MastSignals, MIN_PX, mastSignalSize, signalParts } from "./storm-cones-mast";
import type { StormFlag } from "../model/types";

const mat = new THREE.MeshBasicMaterial();
const flag = (id: string, shape: StormFlag["shape"]): StormFlag => ({ id, symbol: id, band: "ALERT", score: 80, shape });

describe("DA-04 masthead storm signals", () => {
  it("speaks the station's vocabulary: cone Alert, drum Warning, cone over drum Danger", () => {
    expect(signalParts("cone")).toEqual(["cone"]);
    expect(signalParts("drum")).toEqual(["drum"]);
    expect(signalParts("cone+drum")).toEqual(["cone", "drum"]);
  });

  it("sizes the shape to the hull, within readable bounds", () => {
    expect(mastSignalSize(5)).toBeGreaterThanOrEqual(0.9);
    expect(mastSignalSize(32)).toBeLessThanOrEqual(2.8);
  });

  it("never drops below MIN_PX on screen far away, within a share of the hull", () => {
    expect(mastSignalSize(20, 100)).toBeCloseTo(mastSignalSize(20), 5);          // near: the hull's own size
    expect(mastSignalSize(20, 2) * 2).toBeCloseTo(MIN_PX, 5);                   // far: MIN_PX px tall
    expect(mastSignalSize(6, 0.5)).toBeLessThanOrEqual(6 * 0.45 + 1e-9);         // never taller than 0.45 × LOA
  });

  it("is simply there on the first reading, hoists later ones, strikes cleared ones", () => {
    const s = new MastSignals(mat);
    s.sync([flag("a", "cone")], 0.016, false);
    expect(s.lift("a", 20)).toBeGreaterThan(0);
    s.sync([flag("a", "cone"), flag("b", "drum")], 0.016, false);
    expect(s.lift("b", 20)).toBeLessThan(s.lift("a", 20));
    for (let i = 0; i < 300; i++) s.sync([flag("b", "drum")], 0.016, false);
    expect(s.lift("a", 20)).toBe(0);
    expect(s.lift("b", 20)).toBeGreaterThan(0);
  });

  it("reduced motion: at once", () => {
    const s = new MastSignals(mat);
    s.sync([], 0.016, true);
    s.sync([flag("a", "cone+drum")], 0.016, true);
    expect(s.lift("a", 20)).toBeCloseTo(mastSignalSize(20) * 1.12 * 2, 5);
  });
});

describe("DA-07 bunting", () => {
  it("dresses maidens and a launch until her first berth or the time limit", () => {
    const b = new Bunting(mat);
    b.sync(["m"], 0, 0.016, false, new THREE.Vector3());
    expect(b.isDressed("m")).toBe(true);
    b.launch("x", 1000);
    b.sync(["m"], 1000, 0.016, false, new THREE.Vector3());
    expect(b.isDressed("x")).toBe(true);
    b.berthed("x");
    b.sync(["m"], 2000, 0.016, false, new THREE.Vector3());
    expect(b.isDressed("x")).toBe(false);
    b.launch("y", 0);
    b.sync(["m"], LAUNCH_DRESS_MS + 1, 0.016, false, new THREE.Vector3());
    expect(b.isDressed("y")).toBe(false);
    expect(b.isDressed("m")).toBe(true);
  });
});
