import { isShipMapVisible } from "../systems/motion";
import type { PharosVilleWorld } from "../systems/world-types";
import { createRenderFrameCache, type RenderFrameCache } from "./frame-cache";
import { drawAtmosphere, drawBirds, drawDecorativeLights } from "./layers/ambient";
import { drawDockBody, drawDockOverlay, isBackgroundedHarborDock, type DockRenderState } from "./layers/docks";
import { drawGraveBody, drawGraveOverlay, drawGraveUnderlay, type GraveRenderState } from "./layers/graves";
import { sceneryDrawables } from "./layers/scenery";
import { drawShipBody, drawShipOverlay, drawShipWake, type ShipRenderState } from "./layers/ships";
import { drawEntityLayer } from "./layers/entity-pass";
import { drawCemeteryContext, drawCemeteryGround, drawCemeteryMist } from "./layers/cemetery";
import { drawEthereumHarborExtensions, drawHarborDistrictGround } from "./layers/harbor-district";
import { drawTerrain } from "./layers/terrain";
import { drawEthereumHarborSigns, drawWaterAreaLabels } from "./layers/water-labels";
import { drawLighthouseBody, drawLighthouseHeadland, drawLighthouseOverlay, drawLighthouseSurf, lighthouseOverlayScreenBounds } from "./layers/lighthouse";
import { drawSelection } from "./layers/selection";
import { drawCoastalWaterDetails } from "./layers/shoreline";
import { drawSky } from "./layers/sky";
import type { DrawPharosVilleInput, PharosVilleRenderMetrics } from "./render-types";

export type { DrawPharosVilleInput, PharosVilleCanvasMotion, PharosVilleRenderMetrics } from "./render-types";

interface WorldCanvasFrame {
  cache: RenderFrameCache;
  dockRenderStates: Map<string, DockRenderState>;
  graveRenderStates: Map<string, GraveRenderState>;
  shipRenderStates: Map<string, ShipRenderState>;
}

export function drawPharosVille(input: DrawPharosVilleInput): PharosVilleRenderMetrics {
  const { ctx } = input;
  const frame = createWorldCanvasFrame(input);
  ctx.imageSmoothingEnabled = false;
  drawSky(input);

  const visibleTileCount = drawTerrain(input);
  drawCoastalWaterDetails(input);
  drawAtmosphere(input);
  drawHarborDistrictGround(input);
  drawBackgroundedHarborDocks(input, frame);
  drawEthereumHarborExtensions(input);
  drawLighthouseSurf(input);
  drawCemeteryGround(input);
  drawLighthouseHeadland(input);
  drawCemeteryContext(input);
  const entityMetrics = drawEntityPass(input, frame);
  drawWaterAreaLabels(input);
  drawEthereumHarborSigns(input);
  drawDecorativeLights(input);
  drawCemeteryMist(input);
  drawBirds(input);
  const selectionDrawableCount = drawSelection(input);
  const drawableCounts = {
    ...entityMetrics.drawableCounts,
    selection: selectionDrawableCount,
  };
  return {
    drawableCount: entityMetrics.drawableCount + selectionDrawableCount,
    drawableCounts,
    movingShipCount: Array.from(input.shipMotionSamples?.values() ?? [])
      .filter((sample) => sample.state !== "idle" && sample.state !== "risk-drift" && sample.state !== "moored").length,
    visibleShipCount: visibleShipsForFrame(input).length,
    visibleTileCount,
  };
}

function createWorldCanvasFrame(input: DrawPharosVilleInput): WorldCanvasFrame {
  return {
    cache: createRenderFrameCache(input),
    dockRenderStates: new Map(),
    graveRenderStates: new Map(),
    shipRenderStates: new Map(),
  };
}

function drawBackgroundedHarborDocks(input: DrawPharosVilleInput, frame: WorldCanvasFrame) {
  for (const dock of input.world.docks) {
    if (isBackgroundedHarborDock(dock)) drawDockBody(input, frame, dock);
  }
}

function drawEntityPass(input: DrawPharosVilleInput, frame: WorldCanvasFrame): Pick<PharosVilleRenderMetrics, "drawableCount" | "drawableCounts"> {
  return drawEntityLayer(
    input,
    frame.cache,
    sceneryDrawables(input),
    {
      drawDockBody: (dock) => drawDockBody(input, frame, dock),
      drawDockOverlay: (dock) => drawDockOverlay(input, frame, dock),
      drawGraveBody: (grave) => drawGraveBody(input, frame, grave),
      drawGraveOverlay: (grave) => drawGraveOverlay(input, frame, grave),
      drawGraveUnderlay: (grave) => drawGraveUnderlay(input, frame, grave),
      drawLighthouseBody: () => drawLighthouseBody(input),
      drawLighthouseOverlay: () => drawLighthouseOverlay(input),
      drawShipBody: (ship) => drawShipBody(input, frame, ship),
      drawShipOverlay: (ship) => drawShipOverlay(input, frame, ship),
      drawShipWake: (ship) => drawShipWake(input, frame, ship),
      isBackgroundedHarborDock,
      lighthouseOverlayScreenBounds: (selectionRect) => lighthouseOverlayScreenBounds(input, selectionRect),
      visibleShips: visibleShipsForFrame(input),
    },
  );
}

function visibleShipsForFrame(input: DrawPharosVilleInput): PharosVilleWorld["ships"] {
  return input.world.ships.filter((ship) => isShipMapVisible(ship, input.shipMotionSamples?.get(ship.id)));
}
