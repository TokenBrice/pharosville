import { beforeAll, describe, expect, it } from "vitest";
import { RUNTIME_CEMETERY_ENTRIES } from "@shared/lib/cemetery-runtime";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { buildPharosVilleWorld } from "./pharosville-world";
import { followShotCamera, selectionShot, type SelectionShotSubject } from "./camera";
import { createGardenFleetFootprint, writeGardenFleetFootprint } from "./garden-fleet-footprint";
import { gardenRepresentativeRestHeading, gardenShipSelectionRadius, resolveGardenEntityDisplayTile, selectGardenObservatorySlice } from "./garden-observatory-slice";
import { cameraView, cameraViewAngles, TILE_SCALE, type CameraView, type TilePoint } from "./projection";
import type { PharosVilleWorld, ShipNode } from "./world-types";


describe("panel-aware selection tableaux", () => {
  const viewport = { x: 1200, y: 640 };
  let world: PharosVilleWorld;
  let ship: ShipNode;
  let tile: TilePoint;
  let subject: SelectionShotSubject & { kind: "ship" };

  beforeAll(() => {
    world = buildPharosVilleWorld(makePharosVilleWorldInput({
      cemeteryEntries: RUNTIME_CEMETERY_ENTRIES.filter((entry) => entry.peakMcap != null).slice(0, 1),
    }));
    const usdc = world.ships.find((entry) => entry.id === "usdc-circle");
    if (!usdc) throw new Error("Tableau fixture must admit usdc-circle");
    ship = usdc;
    const slice = selectGardenObservatorySlice(world, ship.detailId);
    const displayTile = resolveGardenEntityDisplayTile({ entity: ship, slice });
    if (!displayTile) throw new Error("Tableau fixture USDC must have a final display tile");
    tile = displayTile;
    subject = {
      kind: "ship", ship, tile, selectionRadius: gardenShipSelectionRadius(ship),
      headingRad: -(gardenRepresentativeRestHeading(world, ship.id) ?? 0),
    };
  });

  it("scores the complete bounded set deterministically, rather than stopping at the first clear yaw", () => {
    const first = selectionShot(subject, viewport);
    const second = selectionShot(subject, viewport);
    expect(first.report.candidates).toBe(72);
    expect(second).toEqual(first);
    expect(first.report.skyShare).toBeLessThanOrEqual(0.35);
    expect(Number.isFinite(first.report.score)).toBe(true);
  });

  it.each([
    { left: 790, top: 24, right: 1172, bottom: 340 },
    { left: 790, top: 24, right: 1172, bottom: 616 },
    { left: 28, top: 24, right: 410, bottom: 616 },
  ])("excludes the measured collapsed/expanded sheet plus 24px: %j", (panelRect) => {
    const result = selectionShot({ ...subject, panelRect }, viewport);
    const rect = result.report.subjectRect;
    expect(result.report.panelClear).toBe(true);
    expect(rect.right <= panelRect.left - 24 || rect.left >= panelRect.right + 24
      || rect.bottom <= panelRect.top - 24 || rect.top >= panelRect.bottom + 24).toBe(true);
  });

  it("measures identity span with the same S6 projected sail envelope as fleet LOD", () => {
    const result = selectionShot(subject, viewport);
    const footprint = writeGardenFleetFootprint(createGardenFleetFootprint(), ship, tile,
      subject.kind === "ship" ? subject.headingRad! : 0, result.camera, viewport);
    expect(result.report.identitySpanPx).toBeCloseTo(Math.min(
      footprint.identitySail.maxX - footprint.identitySail.minX, footprint.sailHeightCssPx), 6);
    expect(result.report.subjectRect.left).toBeCloseTo(footprint.minX, 6);
    expect(result.report.subjectRect.right).toBeCloseTo(footprint.maxX, 6);
  });

  it("retains an already valid current shot without another candidate search", () => {
    const framed = selectionShot(subject, viewport);
    const retained = selectionShot(subject, viewport, { currentCamera: framed.camera, pathClear: () => true });
    expect(retained.report.retained).toBe(true);
    expect(retained.report.candidates).toBe(0);
    expect(retained.camera).toBe(framed.camera);
  });

  it("rejects blocked routes before composition and admits elevated three-quarter views", () => {
    const pathClear = (view: CameraView) => cameraViewAngles(view).pitch >= 0.5;
    const result = selectionShot(subject, viewport, { pathClear });
    expect(result.report.pathClear).toBe(true);
    expect(cameraViewAngles(cameraView(result.camera, viewport, { breath: false })).pitch).toBeGreaterThanOrEqual(0.5);
    expect(result.report.eyeClear).toBe(true);
  });

  it("reports unavoidable panel loss honestly rather than hiding facts or fabricating clearance", () => {
    const result = selectionShot({ ...subject, panelRect: { left: 0, top: 0, right: viewport.x, bottom: viewport.y } }, viewport);
    expect(result.report.panelClear).toBe(false);
    expect(Number.isFinite(result.report.score)).toBe(true);
    expect(result.report.candidates).toBe(72);
  });

  it("accounts for neighbouring hulls and shoreline/tower context without requiring a landmark", () => {
    const result = selectionShot({ ...subject, obstacles: [{ tile: { x: tile.x + 4, y: tile.y + 4 }, selectionRadius: 2 }] }, viewport);
    expect(Number.isFinite(result.report.neighbourGapPx)).toBe(true);
    expect(result.report.contextVisible).toBeGreaterThanOrEqual(0);
    expect(result.report.contextVisible).toBeLessThanOrEqual(2);
  });

  it("translates a moving tableau to the final displayed tile without another search", () => {
    const movingTile = { x: tile.x + 1, y: tile.y + 1 };
    const framed = selectionShot({ ...subject, tile: movingTile, heading: { x: 0.2, y: 0.1 } }, viewport);
    const landedTile = { x: tile.x + 2, y: tile.y + 2 };
    const followed = followShotCamera(framed.camera, landedTile, viewport, world.map)!;
    expect(followed.shot!.subject!.world.x).toBe(landedTile.x * TILE_SCALE);
    expect(followed.shot!.subject!.world.z).toBe(landedTile.y * TILE_SCALE);
    expect(followed.shot!.subject!.anchor).toEqual(framed.report.anchor);
    const followedAngles = cameraViewAngles(followed.shot!.view);
    const framedAngles = cameraViewAngles(framed.camera.shot!.view);
    expect(followedAngles.distance).toBeCloseTo(framedAngles.distance, 10);
    expect(followedAngles.yaw).toBeCloseTo(framedAngles.yaw, 10);
    expect(followedAngles.pitch).toBeCloseTo(framedAngles.pitch, 10);
    const bounded = followShotCamera(framed.camera, { x: -10, y: world.map.height + 10 }, viewport, world.map)!;
    expect(bounded.shot!.subject!.world.x).toBe(0);
    expect(bounded.shot!.subject!.world.z).toBe((world.map.height - 1) * TILE_SCALE);
  });

  it("frames the smallest admitted hull and an edge berth using their own projected identities", () => {
    const smallest = world.ships.reduce((a, b) => a.visual.scale < b.visual.scale ? a : b);
    const edge = world.ships.reduce((a, b) => Math.min(a.tile.x, a.tile.y, world.map.width - 1 - a.tile.x, world.map.height - 1 - a.tile.y)
      < Math.min(b.tile.x, b.tile.y, world.map.width - 1 - b.tile.x, world.map.height - 1 - b.tile.y) ? a : b);
    for (const entity of [smallest, edge]) {
      const displayTile = resolveGardenEntityDisplayTile({ entity, slice: selectGardenObservatorySlice(world, entity.detailId) })!;
      const framed = selectionShot({ kind: "ship", ship: entity, tile: displayTile,
        selectionRadius: gardenShipSelectionRadius(entity),
        headingRad: -(gardenRepresentativeRestHeading(world, entity.id) ?? 0),
        panelRect: { left: 790, top: 24, right: 1172, bottom: 616 } }, viewport);
      expect(framed.report.identitySpanPx).toBeGreaterThan(0);
      expect(framed.report.panelClear).toBe(true);
      expect(Number.isFinite(framed.report.score)).toBe(true);
    }
  });

  it.each(["dock", "grave"] as const)("keeps %s subject framing finite with an expanded record", (kind) => {
    let localSubject: SelectionShotSubject;
    if (kind === "dock") {
      const dock = world.docks[0];
      if (!dock) throw new Error("Tableau fixture must include a dock");
      localSubject = { kind, dock };
    } else {
      const grave = world.graves[0];
      if (!grave) throw new Error("Tableau fixture must include a grave");
      localSubject = { kind, tile: grave.tile };
    }
    const result = selectionShot({ ...localSubject, panelRect: { left: 790, top: 24, right: 1172, bottom: 616 } }, viewport);
    expect(result.report.candidates).toBe(72);
    expect(Number.isFinite(result.report.score)).toBe(true);
    expect(Number.isFinite(result.report.identitySpanPx)).toBe(true);
  });
});
