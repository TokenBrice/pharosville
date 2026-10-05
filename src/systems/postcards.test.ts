import { describe, expect, it } from "vitest";
import { eyeInsideStation, shotSightBlocked } from "./camera";
import { gardenIslandDisplayTile, gardenTowerWorldAnchors } from "./garden-observatory-slice";
import { GARDEN_POSTCARDS, postcardView, strollGroundHeight, strollWaypoints } from "./postcards";
import { worldToScreen, TILE_SCALE, type IsoCamera, type ScreenPoint } from "./projection";
import { buildPharosVilleMap, isWaterTileKind, LIGHTHOUSE_TILE } from "./world-layout";
import { islandTerrainHeight } from "../three/garden-island";
import { createShotGlide, panStationCamera, sampleShotGlide, strollEyeFloor, STROLL_CLEARANCE_STEP, zoomStationCamera } from "../hooks/camera-intent";
import { groundPointUnder } from "./camera";

const GATES: readonly ScreenPoint[] = [
  { x: 1600, y: 1000 },
  { x: 1200, y: 640 },
  { x: 900, y: 720 },
  { x: 720, y: 900 },
];
const island = gardenIslandDisplayTile(LIGHTHOUSE_TILE);
const ISLAND_ORIGIN = { x: island.x * TILE_SCALE, z: island.y * TILE_SCALE };
/** The island mesh's own terrain (plus a little planting) within its reach. */
const islandGround = (x: number, z: number): number | null => {
  const lx = x - ISLAND_ORIGIN.x;
  const lz = z - ISLAND_ORIGIN.z;
  return Math.hypot(lx, lz) > 30 ? null : islandTerrainHeight(lx, lz) + 0.4;
};
const map = buildPharosVilleMap();
const shotCamera = (card: (typeof GARDEN_POSTCARDS)[number], viewport: ScreenPoint): IsoCamera => (
  { offsetX: 0, offsetY: 0, zoom: 1, shot: { presence: 1, view: postcardView(card, viewport) } }
);

describe("connected inspectable stroll", () => {
  it("holds six distinct places", () => {
    expect(GARDEN_POSTCARDS).toHaveLength(6);
    expect(new Set(GARDEN_POSTCARDS.map((card) => card.id)).size).toBe(6);
  });

  it("composes every subject on its anchor, off centre, at every gate", () => {
    for (const card of GARDEN_POSTCARDS) {
      expect(Math.abs(card.anchor.x - 0.5), card.id).toBeGreaterThanOrEqual(0.1);
      for (const viewport of GATES) {
        const screen = worldToScreen(card.subject, shotCamera(card, viewport), viewport);
        const label = `${card.id} at ${viewport.x}x${viewport.y}`;
        expect(screen.x / viewport.x, label).toBeCloseTo(card.anchor.x, 3);
        expect(screen.y / viewport.y, label).toBeCloseTo(card.anchor.y, 3);
      }
    }
  });

  it("stands every eye clear of the land and the stations", () => {
    for (const card of GARDEN_POSTCARDS) {
      expect(eyeInsideStation(card.eye), card.id).toBe(false);
      const ground = islandGround(card.eye.x, card.eye.z);
      if (ground !== null) {
        // On (or beside) the island: a standing eye, well above the rock.
        expect(card.eye.y - (ground - 0.4), card.id).toBeGreaterThanOrEqual(1.2);
      } else {
        const tile = map.tiles[Math.round(card.eye.z / TILE_SCALE) * map.width + Math.round(card.eye.x / TILE_SCALE)]!;
        expect(isWaterTileKind(tile.kind), card.id).toBe(true);
        expect(card.eye.y, card.id).toBeGreaterThanOrEqual(-1.45 + 1.7);
      }
    }
  });

  it("keeps every subject's sight lines clear of land, tower and stations", () => {
    for (const card of GARDEN_POSTCARDS) {
      for (const probe of card.probes) {
        expect(shotSightBlocked(card.eye, probe, { groundHeight: islandGround, ownStation: card.ownStation }), card.id).toBe(false);
      }
    }
  });

  it("keeps the whole Pharos in frame where it is the subject", () => {
    const tower = gardenTowerWorldAnchors(LIGHTHOUSE_TILE);
    for (const card of GARDEN_POSTCARDS.filter((entry) => entry.subject.x === tower.crown.x || Math.abs(entry.subject.x - tower.crown.x) < 0.01)) {
      for (const viewport of GATES) {
        const camera = shotCamera(card, viewport);
        const crown = worldToScreen(tower.crown, camera, viewport);
        const waterline = worldToScreen({ ...tower.foot, y: -1.45 }, camera, viewport);
        expect(crown.y / viewport.y, card.id).toBeGreaterThan(0.08);
        expect(waterline.y / viewport.y, card.id).toBeLessThan(0.98);
      }
    }
  });

  it("clears production terrain and station massing along every adjacent path in both directions", () => {
    for (const viewport of GATES) for (let index = 0; index < GARDEN_POSTCARDS.length; index += 1) {
      for (const direction of [-1, 1]) {
        const next = (index + direction + GARDEN_POSTCARDS.length) % GARDEN_POSTCARDS.length;
        const glide = createShotGlide({
          from: shotCamera(GARDEN_POSTCARDS[index]!, viewport),
          to: shotCamera(GARDEN_POSTCARDS[next]!, viewport),
          viewport, durationSeconds: 4, holdSeconds: 0,
          waypoints: strollWaypoints(index, next),
        });
        expect(strollWaypoints(index, next).length).toBeGreaterThan(0);
        for (let segment = 1; segment < glide.path.length; segment += 1) {
          const a = glide.path[segment - 1]!.eye, b = glide.path[segment]!.eye;
          const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) / STROLL_CLEARANCE_STEP));
          for (let step = 0; step <= steps; step += 1) {
            const t = step / steps;
            const eye = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
            expect(eye.y + 1e-9, `${index}→${next} segment ${segment}`).toBeGreaterThanOrEqual(strollEyeFloor(eye.x, eye.z));
            expect(eyeInsideStation(eye)).toBe(false);
          }
        }
        for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
          const eye = sampleShotGlide(glide, progress * 4).camera.shot!.view.eye;
          expect(eye.y + 1e-9).toBeGreaterThanOrEqual(strollEyeFloor(eye.x, eye.z));
        }
      }
    }
  });

  it("hands wheel and drag off locally without a one-pixel grabbed-point jump", () => {
    const viewport = { x: 1200, y: 640 };
    const from = { x: 600, y: 600 }, to = { x: 601, y: 600 };
    for (const station of GARDEN_POSTCARDS) {
      const camera = shotCamera(station, viewport);
      const grabbed = groundPointUnder(camera, from, viewport);
      expect(grabbed, station.id).not.toBeNull();
      const panned = panStationCamera(camera, from, to, viewport, station);
      const screen = worldToScreen(grabbed!, panned, viewport);
      expect(Math.hypot(screen.x - to.x, screen.y - to.y), station.id).toBeLessThan(1);
      const zoomed = zoomStationCamera(camera, from, 1.01, viewport, station);
      const zoomScreen = worldToScreen(grabbed!, zoomed, viewport);
      expect(Math.hypot(zoomScreen.x - from.x, zoomScreen.y - from.y), station.id).toBeLessThan(1);
      expect(zoomed.shot?.presence).toBe(1);
      expect(panned.shot?.view.eye.y).toBeGreaterThanOrEqual(strollEyeFloor(panned.shot!.view.eye.x, panned.shot!.view.eye.z));
      expect(strollGroundHeight(station.eye.x, station.eye.z) ?? -1.45).toBeLessThan(station.eye.y);
    }
  });
});
