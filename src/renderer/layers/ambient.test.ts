import { describe, expect, it } from "vitest";
import type { PharosVilleWorld } from "../../systems/world-types";
import {
  BIRDS,
  birdAnchorTile,
  dispatchGapForThreat,
  sampleBird,
  type BirdConfig,
} from "./ambient";

function makeWorld(): PharosVilleWorld {
  return {
    lighthouse: { tile: { x: 18, y: 28 } },
    pigeonnier: { tile: { x: 50, y: 50 } },
    areas: [],
    docks: [],
    ships: [],
    graves: [],
    map: { width: 56, height: 56, tiles: [], waterRatio: 0.86 },
    effects: [],
    detailIndex: {},
    entityById: {},
    legends: [],
    visualCues: [],
    routeMode: "world",
    freshness: {},
    generatedAt: 0,
  } as unknown as PharosVilleWorld;
}

describe("ambient birds", () => {
  it("includes both lighthouse gulls and pigeonnier residents", () => {
    const lighthouseOrbits = BIRDS.filter(
      (bird) => bird.route.kind === "orbit" && bird.route.anchor === "lighthouse",
    );
    const pigeonnierOrbits = BIRDS.filter(
      (bird) => bird.route.kind === "orbit" && bird.route.anchor === "pigeonnier",
    );
    expect(lighthouseOrbits.length).toBeGreaterThanOrEqual(9);
    expect(pigeonnierOrbits.length).toBeGreaterThanOrEqual(2);
    expect(BIRDS.some((bird) => bird.route.kind === "shuttle")).toBe(true);
    expect(BIRDS.some((bird) => bird.route.kind === "dispatch")).toBe(true);
  });

  it("orbits are deterministic given time + phase", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.6,
      phase: 0,
      route: { kind: "orbit", anchor: "pigeonnier", anchorX: 0, anchorY: 0, radiusX: 2, radiusY: 1, speed: 1 },
    };
    const a = sampleBird(bird, 0, world, 1, 0);
    expect(a.tile.x).toBeCloseTo(50 + 2);
    expect(a.tile.y).toBeCloseTo(50);
    expect(a.visible).toBe(true);
    const b = sampleBird(bird, Math.PI / 2, world, 1, 0);
    expect(b.tile.x).toBeCloseTo(50, 5);
    expect(b.tile.y).toBeCloseTo(50 + 1, 5);
  });

  it("shuttle hits both endpoints across one cycle", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.66,
      phase: 0,
      route: { kind: "shuttle", from: "pigeonnier", to: "lighthouse", basePeriod: 10, arcLift: 4 },
    };
    // At cycle progress 0 (t=0): at pigeonnier.
    const start = sampleBird(bird, 0, world, 1, 0);
    expect(start.tile.x).toBeCloseTo(50);
    expect(start.tile.y).toBeCloseTo(50);
    // At cycle progress 0.5 (t=5s of a 10s period): at lighthouse, lift = 0.
    const mid = sampleBird(bird, 5, world, 1, 0);
    expect(mid.tile.x).toBeCloseTo(18);
    expect(mid.tile.y).toBeCloseTo(28);
    // At cycle progress 0.25 (t=2.5s): outbound midpoint with arc lift.
    const outQuarter = sampleBird(bird, 2.5, world, 1, 0);
    expect(outQuarter.tile.x).toBeCloseTo((50 + 18) / 2);
    // y should be lifted (smaller than the linear midpoint).
    const linearY = (50 + 28) / 2;
    expect(outQuarter.tile.y).toBeLessThan(linearY);
  });

  it("shuttle period shortens under wind/threat scaling", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.66,
      phase: 0,
      route: { kind: "shuttle", from: "pigeonnier", to: "lighthouse", basePeriod: 10, arcLift: 4 },
    };
    // With windScale=2, period collapses to 5s — t=2.5s now lands at lighthouse.
    const fast = sampleBird(bird, 2.5, world, 2, 0);
    expect(fast.tile.x).toBeCloseTo(18);
    expect(fast.tile.y).toBeCloseTo(28);
  });

  it("dispatch is invisible during the gap and visible during flight", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "pigeon",
      scale: 0.6,
      phase: 0,
      route: { kind: "dispatch", origin: "pigeonnier", destination: { x: 65, y: 60 }, flightDuration: 6, baseGapSeconds: 45, arcLift: 3 },
    };
    // CALM: gap = 45s, total cycle = 51s. t=5 is well inside the gap.
    expect(sampleBird(bird, 5, world, 1, 0).visible).toBe(false);
    // At t=46 (gap+1) we're 1s into the 6s flight.
    const launching = sampleBird(bird, 46, world, 1, 0);
    expect(launching.visible).toBe(true);
    // Tile is between origin and destination, with vertical lift.
    expect(launching.tile.x).toBeGreaterThan(50);
    expect(launching.tile.x).toBeLessThan(65);
  });

  it("dispatch cadence accelerates with threat level", () => {
    expect(dispatchGapForThreat(45, 0)).toBeCloseTo(45);
    expect(dispatchGapForThreat(45, 1)).toBeLessThan(45);
    expect(dispatchGapForThreat(45, 4)).toBeLessThan(dispatchGapForThreat(45, 3));
    expect(dispatchGapForThreat(45, 4)).toBeLessThan(10);
  });

  it("birdAnchorTile maps anchors to the correct world entity", () => {
    const world = makeWorld();
    expect(birdAnchorTile("lighthouse", world)).toEqual({ x: 18, y: 28 });
    expect(birdAnchorTile("pigeonnier", world)).toEqual({ x: 50, y: 50 });
  });

  it("reduced-motion freezes orbits at the phase-0 angle", () => {
    const world = makeWorld();
    const bird: BirdConfig = {
      species: "gull",
      scale: 1,
      phase: 0.5,
      route: { kind: "orbit", anchor: "lighthouse", anchorX: 0, anchorY: 0, radiusX: 4, radiusY: 1, speed: 0.2 },
    };
    // With time=0 (the reduced-motion contract in drawBirds), only the phase
    // contributes to the orbit angle — sample is deterministic.
    const a = sampleBird(bird, 0, world, 1, 0);
    expect(a.tile.x).toBeCloseTo(18 + 4 * Math.cos(0.5));
    expect(a.tile.y).toBeCloseTo(28 + 1 * Math.sin(0.5));
  });
});
