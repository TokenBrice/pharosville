import { isShipMapVisible, shipWaterPathKey, type ShipWaterPath } from "../../systems/motion";
import { tileToScreen, type IsoCamera, type ScreenPoint } from "../../systems/projection";
import type { PharosVilleWorld } from "../../systems/world-types";
import { drawDiamond } from "../canvas-primitives";
import { dockDrawPoint } from "../geometry";
import type { HitTarget } from "../hit-testing";
import type { DrawPharosVilleInput, PharosVilleCanvasMotion } from "../render-types";

const docksByChainCache = new WeakMap<PharosVilleWorld, Map<string, PharosVilleWorld["docks"][number]>>();
const renderedDockShipsByChainCache = new WeakMap<PharosVilleWorld, Map<string, PharosVilleWorld["ships"][number][]>>();
// Per-(world, chainId) cache of the chain-ship list pre-sorted by descending
// market cap. The selected-dock relationship pass runs every frame while a
// dock is selected; the static rank is identical across frames and only
// depends on world identity + chainId, so we precompute it once per world.
const renderedDockShipsByChainSortedCache = new WeakMap<PharosVilleWorld, Map<string, readonly PharosVilleWorld["ships"][number][]>>();

export function drawSelection(input: DrawPharosVilleInput): number {
  const { ctx, hoveredTarget, selectedTarget } = input;
  let drawableCount = 0;
  if (hasSelectedRelationships(selectedTarget)) {
    drawSelectedRelationships(input, selectedTarget);
    drawableCount += 1;
  }
  if (hoveredTarget) {
    drawSelectionRing(ctx, hoveredTarget, "rgba(128, 214, 206, 0.85)");
    drawableCount += 1;
  }
  if (selectedTarget) {
    drawSelectionRing(ctx, selectedTarget, "rgba(255, 204, 98, 0.95)");
    drawableCount += 1;
  }
  return drawableCount;
}

export function selectionDrawableCount(input: {
  hoveredTarget: HitTarget | null;
  selectedTarget: HitTarget | null;
}): number {
  return (hasSelectedRelationships(input.selectedTarget) ? 1 : 0)
    + (input.hoveredTarget ? 1 : 0)
    + (input.selectedTarget ? 1 : 0);
}

function hasSelectedRelationships(target: HitTarget | null): target is HitTarget {
  return target?.kind === "ship" || target?.kind === "dock";
}

function drawSelectedRelationships(input: DrawPharosVilleInput, target: HitTarget) {
  if (target.kind === "ship") {
    const selectedShip = input.world.entityById[target.detailId];
    if (selectedShip?.kind === "ship") {
      drawSelectedShipRelationships(input, selectedShip);
    }
  } else if (target.kind === "dock") {
    const selectedDock = input.world.entityById[target.detailId];
    if (selectedDock?.kind === "dock") {
      drawSelectedDockRelationships(input, selectedDock);
    }
  }
}

function drawSelectedShipRelationships(
  { camera, ctx, motion, shipMotionSamples, world }: DrawPharosVilleInput,
  ship: PharosVilleWorld["ships"][number],
) {
  const sample = shipMotionSamples?.get(ship.id) ?? null;
  const currentPoint = tileToScreen(sample?.tile ?? ship.tile, camera);
  const riskPoint = tileToScreen(ship.riskTile, camera);
  const homeDock = ship.homeDockChainId
    ? dockForChain(world, ship.homeDockChainId)
    : null;
  const homePoint = homeDock ? dockDrawPoint(homeDock, camera, world.map.width) : null;
  const route = motion.plan.shipRoutes.get(ship.id) ?? null;
  const homeStop = homeDock && route
    ? route.dockStops.find((stop) => stop.dockId === homeDock.id) ?? null
    : null;
  const homePath = route && homeStop
    ? route.waterPaths.get(shipWaterPathKey(route.riskTile, homeStop.mooringTile))
    : null;
  const pulse = relationshipPulse(motion);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([7 * camera.zoom, 6 * camera.zoom]);
  if (homePath) {
    drawRelationshipWaterPath(ctx, homePath, camera, "rgba(255, 224, 160, 0.38)");
  } else if (route?.openWaterPatrol) {
    drawRelationshipWaterPath(ctx, route.openWaterPatrol.outbound, camera, "rgba(255, 224, 160, 0.34)");
    drawRelationshipWaterPath(ctx, route.openWaterPatrol.inbound, camera, "rgba(255, 224, 160, 0.24)");
  } else if (homePoint) {
    drawRelationshipLine(ctx, currentPoint, homePoint, camera.zoom, "rgba(255, 224, 160, 0.42)");
  }
  drawRelationshipLine(ctx, currentPoint, riskPoint, camera.zoom, "rgba(229, 106, 71, 0.36)");
  ctx.setLineDash([]);

  if (homePoint) {
    drawRelationshipMarker(ctx, homePoint.x, homePoint.y - 9 * camera.zoom, camera.zoom, "home", "#ffe0a0", pulse);
  }
  drawRelationshipMarker(ctx, riskPoint.x, riskPoint.y - 2 * camera.zoom, camera.zoom, "risk", "#e56a47", pulse);
  drawRelationshipMarker(ctx, currentPoint.x, currentPoint.y + 8 * camera.zoom, camera.zoom, "current", "#80d6ce", pulse);
  ctx.restore();
}

function drawSelectedDockRelationships(
  { camera, ctx, motion, shipMotionSamples, world }: DrawPharosVilleInput,
  dock: PharosVilleWorld["docks"][number],
) {
  const chainShips = renderedShipsByChainSortedByMarketCap(world, dock.chainId);
  const visibleShips: PharosVilleWorld["ships"][number][] = [];
  for (let i = 0; i < chainShips.length && visibleShips.length < 10; i += 1) {
    const ship = chainShips[i]!;
    if (isShipMapVisible(ship, shipMotionSamples?.get(ship.id))) visibleShips.push(ship);
  }
  if (visibleShips.length === 0) return;

  const dockPoint = dockDrawPoint(dock, camera, world.map.width);
  const pulse = relationshipPulse(motion);
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([4 * camera.zoom, 7 * camera.zoom]);
  for (const ship of visibleShips) {
    const shipPoint = tileToScreen(shipMotionSamples?.get(ship.id)?.tile ?? ship.tile, camera);
    drawRelationshipLine(ctx, dockPoint, shipPoint, camera.zoom, "rgba(128, 214, 206, 0.28)");
    drawRelationshipMarker(ctx, shipPoint.x, shipPoint.y + 8 * camera.zoom, camera.zoom * 0.78, "ship", "#80d6ce", pulse);
  }
  ctx.setLineDash([]);
  drawRelationshipMarker(ctx, dockPoint.x, dockPoint.y - 9 * camera.zoom, camera.zoom, "home", "#ffe0a0", pulse);
  ctx.restore();
}

function dockForChain(
  world: PharosVilleWorld,
  chainId: string,
): PharosVilleWorld["docks"][number] | null {
  let docksByChain = docksByChainCache.get(world);
  if (!docksByChain) {
    docksByChain = new Map<string, PharosVilleWorld["docks"][number]>();
    for (const dock of world.docks) {
      if (docksByChain.has(dock.chainId)) continue;
      docksByChain.set(dock.chainId, dock);
    }
    docksByChainCache.set(world, docksByChain);
  }
  return docksByChain.get(chainId) ?? null;
}

function renderedShipsByChain(world: PharosVilleWorld, chainId: string): readonly PharosVilleWorld["ships"][number][] {
  let shipsByChain = renderedDockShipsByChainCache.get(world);
  if (!shipsByChain) {
    shipsByChain = new Map<string, PharosVilleWorld["ships"][number][]>();
    for (const ship of world.ships) {
      for (const presence of ship.chainPresence) {
        if (!presence.hasRenderedDock) continue;
        const existing = shipsByChain.get(presence.chainId);
        if (existing) {
          existing.push(ship);
          continue;
        }
        shipsByChain.set(presence.chainId, [ship]);
      }
    }
    renderedDockShipsByChainCache.set(world, shipsByChain);
  }
  return shipsByChain.get(chainId) ?? [];
}

function renderedShipsByChainSortedByMarketCap(
  world: PharosVilleWorld,
  chainId: string,
): readonly PharosVilleWorld["ships"][number][] {
  let sortedByChain = renderedDockShipsByChainSortedCache.get(world);
  if (!sortedByChain) {
    sortedByChain = new Map<string, readonly PharosVilleWorld["ships"][number][]>();
    renderedDockShipsByChainSortedCache.set(world, sortedByChain);
  }
  const cached = sortedByChain.get(chainId);
  if (cached) return cached;
  const sorted = renderedShipsByChain(world, chainId)
    .toSorted((a, b) => b.marketCapUsd - a.marketCapUsd);
  sortedByChain.set(chainId, sorted);
  return sorted;
}

function relationshipPulse(motion: PharosVilleCanvasMotion) {
  if (motion.reducedMotion) return 1;
  return 0.84 + Math.sin(motion.timeSeconds * 2.2) * 0.16;
}

function drawRelationshipWaterPath(
  ctx: CanvasRenderingContext2D,
  path: ShipWaterPath,
  camera: IsoCamera,
  color: string,
) {
  if (path.points.length < 2) return;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 1.6 * camera.zoom);
  ctx.beginPath();
  path.points.forEach((point, index) => {
    const screen = tileToScreen(point, camera);
    if (index === 0) ctx.moveTo(screen.x, screen.y);
    else ctx.lineTo(screen.x, screen.y);
  });
  ctx.stroke();
}

function drawRelationshipLine(
  ctx: CanvasRenderingContext2D,
  from: ScreenPoint,
  to: ScreenPoint,
  zoom: number,
  color: string,
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 1.45 * zoom);
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
}

function drawRelationshipMarker(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  zoom: number,
  kind: "current" | "home" | "risk" | "ship",
  color: string,
  pulse: number,
) {
  const radius = (kind === "ship" ? 5 : kind === "current" ? 7 : 8) * zoom;
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, 1.5 * zoom);
  ctx.beginPath();
  ctx.arc(x, y, radius * pulse, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.92;
  ctx.fillStyle = color;
  if (kind === "risk") {
    drawDiamond(ctx, x, y, radius * 1.3, radius * 1.3, color);
  } else if (kind === "home") {
    ctx.fillRect(
      Math.round(x - radius * 0.55),
      Math.round(y - radius * 0.55),
      Math.round(radius * 1.1),
      Math.round(radius * 1.1),
    );
  } else {
    ctx.beginPath();
    ctx.arc(x, y, radius * 0.44, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawSelectionRing(ctx: CanvasRenderingContext2D, target: HitTarget, color: string) {
  const cx = target.rect.x + target.rect.width / 2;
  const bottom = target.rect.y + target.rect.height;
  const width = Math.max(28, Math.min(target.rect.width * 0.82, target.kind === "lighthouse" ? 118 : 76));
  const height = Math.max(12, Math.min(target.rect.height * 0.22, target.kind === "lighthouse" ? 28 : 22));

  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1.5, target.kind === "area" ? 1.4 : 2);

  if (target.kind === "area") {
    drawLabelBrackets(ctx, target, color);
    ctx.restore();
    return;
  }

  ctx.globalAlpha = target.kind === "lighthouse" ? 0.94 : 0.86;
  ctx.beginPath();
  ctx.ellipse(cx, bottom - height * 0.55, width / 2, height / 2, -0.08, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.34;
  ctx.strokeStyle = color;
  drawDiamondStroke(ctx, cx, bottom - height * 0.56, width * 0.54, height * 0.7);
  ctx.restore();
}

function drawLabelBrackets(ctx: CanvasRenderingContext2D, target: HitTarget, color: string) {
  const { rect } = target;
  const inset = 4;
  const length = Math.min(16, rect.width * 0.16);
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.86;
  ctx.beginPath();
  ctx.moveTo(rect.x + inset, rect.y + length);
  ctx.lineTo(rect.x + inset, rect.y + inset);
  ctx.lineTo(rect.x + inset + length, rect.y + inset);
  ctx.moveTo(rect.x + rect.width - inset - length, rect.y + inset);
  ctx.lineTo(rect.x + rect.width - inset, rect.y + inset);
  ctx.lineTo(rect.x + rect.width - inset, rect.y + length);
  ctx.moveTo(rect.x + inset, rect.y + rect.height - length);
  ctx.lineTo(rect.x + inset, rect.y + rect.height - inset);
  ctx.lineTo(rect.x + inset + length, rect.y + rect.height - inset);
  ctx.moveTo(rect.x + rect.width - inset - length, rect.y + rect.height - inset);
  ctx.lineTo(rect.x + rect.width - inset, rect.y + rect.height - inset);
  ctx.lineTo(rect.x + rect.width - inset, rect.y + rect.height - length);
  ctx.stroke();
}

function drawDiamondStroke(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.beginPath();
  ctx.moveTo(x, y - height / 2);
  ctx.lineTo(x + width / 2, y);
  ctx.lineTo(x, y + height / 2);
  ctx.lineTo(x - width / 2, y);
  ctx.closePath();
  ctx.stroke();
}
