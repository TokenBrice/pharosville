import { CEMETERY_CENTER, CEMETERY_ISLAND_RADIUS } from "../../systems/world-layout";
import { tileToScreen, type IsoCamera, type ScreenPoint } from "../../systems/projection";
import { drawDiamond } from "../canvas-primitives";
import type { DrawPharosVilleInput } from "../render-types";

const COVE_GLOBAL_SCALE = 0.62;
const COVE_CONTEXT_SCALE = 0.82 * COVE_GLOBAL_SCALE;
const COVE_CONTEXT_SOURCE_CENTER = { x: 22.15, y: 41.7 } as const;

// The cemetery islet is repainted as a shallow lagoon ringed by foam, with a
// small central sandbar carrying the centerpiece flagship wreck. The world
// model still treats these tiles as land (so ships don't sail through them and
// graves can be scattered on them); only the paint changes.
const COVE = {
  // Lagoon water — a lighter shoal version of the surrounding calm-water
  // palette (#27734f) so the cove reads as continuous with the sea, just
  // shallower. Slight green-teal lift suggests shoal sand showing through.
  shallow: "rgba(112, 188, 144, 0.78)",
  shallowInner: "rgba(154, 218, 178, 0.62)",
  shallowDeep: "rgba(58, 142, 100, 0.7)",
  ripple: "rgba(232, 248, 232, 0.38)",
  // Sandbar (limestone-ish, kept warm to contrast the teal lagoon).
  sandBar: "rgba(218, 198, 144, 0.94)",
  sandBarEdge: "rgba(176, 152, 102, 0.86)",
  sandBarWet: "rgba(150, 132, 92, 0.78)",
  // Foam.
  foamLight: "rgba(232, 244, 232, 0.86)",
  foamMid: "rgba(192, 218, 212, 0.66)",
  // Submerged rocks (very dark, just-below-surface).
  rockSubmerged: "rgba(34, 44, 38, 0.86)",
  rockSubmergedEdge: "rgba(86, 90, 78, 0.62)",
  // Wreck wood palette for centerpiece + decorative hulls.
  hullDark: "#2c1f15",
  hullMid: "#5a3f26",
  hullLight: "#8c6638",
  hullPlank: "#b58146",
  hullShadow: "rgba(12, 16, 14, 0.46)",
  outline: "#1b1410",
  rib: "rgba(220, 204, 168, 0.92)",
  ribShadow: "#352618",
  metalHighlight: "#d2aa61",
  sailRag: "rgba(228, 218, 184, 0.72)",
} as const;

const SANDBAR_RADIUS = { x: 2.1, y: 1.3 } as const;

export function drawCemeteryGround({ camera, ctx, world }: DrawPharosVilleInput): void {
  ctx.save();
  // Paint lagoon water over every cemetery-islet tile (the full islet
  // footprint, not just the inner cove ellipse), then carve out a small
  // sandbar at the centre. The world model still treats these tiles as land
  // so ships won't sail through the wreck field.
  for (const tile of world.map.tiles) {
    if (tile.kind !== "land" && tile.kind !== "shore") continue;
    const value = isletValue(tile.x, tile.y);
    if (value > 1.04) continue;
    const sandValue = sandbarValue(tile.x, tile.y);
    const p = tileToScreen(tile, camera);
    if (sandValue < 1) {
      // Sandbar core. Diamond is bumped to 44x22 so it fully obscures the
      // 64x64 limestone PNG underneath (rendered at scale 0.62 ≈ 40px wide).
      const wet = sandValue > 0.62;
      drawDiamond(
        ctx,
        p.x,
        p.y,
        44 * camera.zoom,
        22 * camera.zoom,
        wet ? COVE.sandBarEdge : COVE.sandBar,
      );
      if (!wet) {
        drawDiamond(
          ctx,
          p.x,
          p.y + 1 * camera.zoom,
          24 * camera.zoom,
          11 * camera.zoom,
          COVE.sandBar,
        );
      }
      continue;
    }
    // Lagoon water tile. Diamond oversized for the same reason — the
    // underlying terrain.land/terrain.shore PNG renders ~40px wide.
    const edge = value > 0.78;
    const inner = value < 0.5;
    drawDiamond(
      ctx,
      p.x,
      p.y,
      44 * camera.zoom,
      22 * camera.zoom,
      edge ? COVE.shallowDeep : COVE.shallow,
    );
    if (!edge && inner) {
      drawDiamond(
        ctx,
        p.x,
        p.y + 1 * camera.zoom,
        20 * camera.zoom,
        9 * camera.zoom,
        COVE.shallowInner,
      );
    }
    // Subtle ripple — short horizontal dashes scattered on a stable hash.
    if ((tile.x * 17 + tile.y * 29) % 4 === 0) {
      ctx.fillStyle = COVE.ripple;
      const rx = p.x + ((tile.x % 3) - 1) * 2.5 * camera.zoom;
      const ry = p.y + 1.5 * camera.zoom;
      ctx.fillRect(
        Math.round(rx - 4 * camera.zoom),
        Math.round(ry),
        Math.max(2, Math.round(8 * camera.zoom * COVE_GLOBAL_SCALE)),
        Math.max(1, Math.round(1 * camera.zoom)),
      );
    }
  }

  drawSubmergedRocks(ctx, camera);
  drawDecorativeHulls(ctx, camera);
  drawCenterpieceFlagshipWreck(ctx, camera);
  ctx.restore();
}

function isletValue(x: number, y: number) {
  return ((x - CEMETERY_CENTER.x) / CEMETERY_ISLAND_RADIUS.x) ** 2
    + ((y - CEMETERY_CENTER.y) / CEMETERY_ISLAND_RADIUS.y) ** 2;
}

function sandbarValue(x: number, y: number) {
  return ((x - CEMETERY_CENTER.x) / SANDBAR_RADIUS.x) ** 2
    + ((y - CEMETERY_CENTER.y) / SANDBAR_RADIUS.y) ** 2;
}

function coveContextTile(tile: { x: number; y: number }) {
  return {
    x: CEMETERY_CENTER.x + (tile.x - COVE_CONTEXT_SOURCE_CENTER.x) * COVE_CONTEXT_SCALE,
    y: CEMETERY_CENTER.y + (tile.y - COVE_CONTEXT_SOURCE_CENTER.y) * COVE_CONTEXT_SCALE,
  };
}

function drawSubmergedRocks(ctx: CanvasRenderingContext2D, camera: IsoCamera) {
  // A few rocks just under the lagoon surface — analytical "shoals" between wrecks.
  const rocks = [
    { x: 17.4, y: 38.8, scale: 0.78 },
    { x: 28.6, y: 38.6, scale: 0.7 },
    { x: 27.8, y: 45.6, scale: 0.92 },
    { x: 16.2, y: 45.0, scale: 0.74 },
    { x: 21.8, y: 36.6, scale: 0.55 },
    { x: 23.2, y: 47.8, scale: 0.6 },
  ] as const;
  for (const rock of rocks) {
    const p = tileToScreen(coveContextTile(rock), camera);
    drawSubmergedRock(ctx, p.x, p.y, camera.zoom * rock.scale * COVE_CONTEXT_SCALE);
  }
}

function drawSubmergedRock(ctx: CanvasRenderingContext2D, x: number, y: number, zoom: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(zoom, zoom);
  ctx.fillStyle = COVE.rockSubmergedEdge;
  ctx.beginPath();
  ctx.ellipse(0, 1, 9, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COVE.rockSubmerged;
  ctx.beginPath();
  ctx.ellipse(-0.4, 0, 7, 2.8, 0, 0, Math.PI * 2);
  ctx.fill();
  // Subtle foam-cap from the rock breaking the surface.
  ctx.strokeStyle = COVE.foamLight;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(0, 1, 9, 3.6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawDecorativeHulls(ctx: CanvasRenderingContext2D, camera: IsoCamera) {
  // A pair of larger half-sunken hulls flanking the centerpiece, suggesting
  // a debris field deeper than the per-grave node count.
  drawHalfSunkenHull(
    ctx,
    tileToScreen(coveContextTile({ x: 16.4, y: 40.0 }), camera),
    camera.zoom * 1.35 * COVE_CONTEXT_SCALE,
    -0.42,
  );
  drawHalfSunkenHull(
    ctx,
    tileToScreen(coveContextTile({ x: 28.4, y: 44.4 }), camera),
    camera.zoom * 1.2 * COVE_CONTEXT_SCALE,
    1.4,
  );
}

function drawHalfSunkenHull(
  ctx: CanvasRenderingContext2D,
  point: ScreenPoint,
  zoom: number,
  rotation: number,
) {
  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(rotation);
  ctx.scale(zoom, zoom);
  // Foam ring around the waterline.
  ctx.fillStyle = COVE.foamLight;
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COVE.foamMid;
  ctx.beginPath();
  ctx.ellipse(0, 1.5, 14, 3.6, 0, 0, Math.PI * 2);
  ctx.fill();
  // Hull silhouette (only top half visible above water).
  ctx.fillStyle = COVE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-13, 1);
  ctx.quadraticCurveTo(-12, -3, -7, -4);
  ctx.lineTo(7, -4);
  ctx.quadraticCurveTo(12, -3, 13, 1);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.6;
  ctx.stroke();
  // Deck.
  ctx.fillStyle = COVE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-11, 0.4);
  ctx.quadraticCurveTo(-10, -2.4, -6, -3);
  ctx.lineTo(6, -3);
  ctx.quadraticCurveTo(10, -2.4, 11, 0.4);
  ctx.closePath();
  ctx.fill();
  // Plank lines.
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.45;
  for (let i = -8; i <= 8; i += 2.4) {
    ctx.beginPath();
    ctx.moveTo(i, -2.6);
    ctx.lineTo(i + 0.3, 0.2);
    ctx.stroke();
  }
  // Snapped mast lying across.
  ctx.fillStyle = COVE.hullPlank;
  ctx.fillRect(-10, -7, 18, 1.2);
  ctx.fillStyle = COVE.outline;
  ctx.fillRect(-10, -7, 18, 0.4);
  ctx.restore();
}

function drawCenterpieceFlagshipWreck(ctx: CanvasRenderingContext2D, camera: IsoCamera) {
  // Large half-sunken flagship anchoring the wreck-cove on the sandbar.
  const center = tileToScreen(CEMETERY_CENTER, camera);
  const zoom = camera.zoom * 1.7;
  ctx.save();
  ctx.translate(center.x, center.y - 2 * camera.zoom);
  ctx.scale(zoom, zoom);
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Foam halo around the centerpiece.
  ctx.fillStyle = COVE.foamLight;
  ctx.beginPath();
  ctx.ellipse(0, 8, 38, 11, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = COVE.foamMid;
  ctx.beginPath();
  ctx.ellipse(0, 8, 32, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // Ground shadow.
  ctx.fillStyle = COVE.hullShadow;
  ctx.beginPath();
  ctx.ellipse(0, 11, 30, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Stern (right) — listing slightly upward.
  ctx.save();
  ctx.translate(14, -1);
  ctx.rotate(-0.16);
  ctx.fillStyle = COVE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-8, 5);
  ctx.lineTo(-7, -7);
  ctx.quadraticCurveTo(-3, -10, 5, -10);
  ctx.quadraticCurveTo(11, -9, 13, -3);
  ctx.lineTo(13, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = COVE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-6, 3);
  ctx.lineTo(-5.4, -6);
  ctx.quadraticCurveTo(-2, -8, 4.6, -8);
  ctx.quadraticCurveTo(9, -7, 11, -2.4);
  ctx.lineTo(11, 3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.45;
  for (let i = -4; i <= 8; i += 2.4) {
    ctx.beginPath();
    ctx.moveTo(i, -7.2);
    ctx.lineTo(i + 0.3, 2.6);
    ctx.stroke();
  }
  ctx.fillStyle = COVE.metalHighlight;
  ctx.beginPath();
  ctx.arc(8.4, -10.4, 1.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(8.4, -9.4);
  ctx.lineTo(8.4, -8.2);
  ctx.stroke();
  ctx.restore();

  // Bow (left) — sunken deeper, only the prow visible.
  ctx.save();
  ctx.translate(-14, 2);
  ctx.rotate(0.08);
  ctx.fillStyle = COVE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-13, 2);
  ctx.quadraticCurveTo(-12, -4, -7, -5);
  ctx.lineTo(0, -5);
  ctx.lineTo(2, 4);
  ctx.lineTo(-11, 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = COVE.hullMid;
  ctx.beginPath();
  ctx.moveTo(-11, 1);
  ctx.quadraticCurveTo(-10.4, -3.4, -6.6, -4);
  ctx.lineTo(-0.4, -4);
  ctx.lineTo(0.6, 1);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = COVE.hullPlank;
  ctx.fillRect(-15, -5, 5, 1.1);
  ctx.fillStyle = COVE.hullDark;
  ctx.fillRect(-15, -4.6, 5, 0.4);
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.45;
  for (let i = -8; i <= 0; i += 2.2) {
    ctx.beginPath();
    ctx.moveTo(i, -3.6);
    ctx.lineTo(i + 0.3, 0.6);
    ctx.stroke();
  }
  ctx.restore();

  // Cracked midship gap with exposed ribs.
  for (const rx of [-3.6, -1.2, 1.2, 3.6]) {
    ctx.strokeStyle = COVE.rib;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(rx, 4);
    ctx.quadraticCurveTo(rx + 0.3, -2, rx - 0.4, -6);
    ctx.stroke();
    ctx.strokeStyle = COVE.ribShadow;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(rx + 0.4, 4);
    ctx.quadraticCurveTo(rx + 0.7, -2, rx, -6);
    ctx.stroke();
  }
  ctx.fillStyle = COVE.hullDark;
  ctx.fillRect(-6, 3.6, 12, 1.4);

  // Snapped main mast lying diagonally.
  ctx.save();
  ctx.rotate(-0.32);
  ctx.fillStyle = COVE.hullPlank;
  ctx.fillRect(-22, -14, 36, 2);
  ctx.fillStyle = COVE.outline;
  ctx.fillRect(-22, -14, 36, 0.6);
  ctx.fillStyle = COVE.hullDark;
  ctx.beginPath();
  ctx.moveTo(-22, -14);
  ctx.lineTo(-24.2, -12.8);
  ctx.lineTo(-22, -11.5);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -14);
  ctx.lineTo(16.4, -12.6);
  ctx.lineTo(14, -11.5);
  ctx.fill();
  ctx.fillStyle = COVE.hullPlank;
  ctx.fillRect(-12, -10, 16, 1.4);
  ctx.fillStyle = COVE.sailRag;
  ctx.beginPath();
  ctx.moveTo(-10, -10);
  ctx.lineTo(-4, -10);
  ctx.lineTo(-3, -6);
  ctx.lineTo(-9, -5);
  ctx.lineTo(-10.5, -8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.45;
  ctx.stroke();
  ctx.restore();

  // Captain's seal — bronze medallion.
  ctx.fillStyle = COVE.metalHighlight;
  ctx.beginPath();
  ctx.arc(0, -0.4, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COVE.outline;
  ctx.lineWidth = 0.45;
  ctx.stroke();

  ctx.restore();
}

export function drawCemeteryContext(_input: DrawPharosVilleInput): void {
  // The cove is now drawn entirely from drawCemeteryGround. Decorative hulls,
  // submerged rocks, and the centerpiece are painted there so they share the
  // sandbar/lagoon paint pass; nothing else needs to render at the context
  // layer. The export is kept for renderer-pass stability.
}

export function drawCemeteryMist({ camera, ctx, motion }: DrawPharosVilleInput): void {
  // Sea-spray drift across the cove surface.
  const drift = motion.reducedMotion ? 0 : Math.sin(motion.timeSeconds * 0.42) * 7 * camera.zoom;
  const bands = [
    { alpha: 0.1, rx: 48, ry: 4.4, tile: { x: 18.9, y: 44.8 } },
    { alpha: 0.08, rx: 60, ry: 4.4, tile: { x: 22.8, y: 45.4 } },
    { alpha: 0.07, rx: 44, ry: 3.6, tile: { x: 26.7, y: 39.2 } },
    { alpha: 0.06, rx: 38, ry: 3.0, tile: { x: 17.25, y: 39.0 } },
  ] as const;

  ctx.save();
  ctx.lineWidth = Math.max(1, 2.4 * camera.zoom);
  for (const band of bands) {
    const p = tileToScreen(coveContextTile(band.tile), camera);
    ctx.strokeStyle = `rgba(214, 226, 218, ${band.alpha})`;
    ctx.beginPath();
    ctx.ellipse(p.x + drift, p.y, band.rx * camera.zoom, band.ry * camera.zoom, -0.08, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}
