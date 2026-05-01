// Squad chrome: a continuous golden bunting that links visible squad hulls
// plus a thin secondary halo that signals "this hull is part of a squad".
// Both anchor on world-space mast-tops supplied by the caller, so the
// streamer follows hull bob/roll without needing a screen-space dashed
// fallback. Pennant order is supplied per squad so each squad gets its own
// streamer.

export interface SquadAnchor {
  id: string;
  // Mast-top in screen space, including hull pose (bob, roll). Caller must
  // supply the world-space-bobbed position so the pennant follows wake motion.
  mastTop: { x: number; y: number };
}

export function computeSquadPennantPath(
  anchors: readonly SquadAnchor[],
  order: readonly string[],
): { x: number; y: number }[] | null {
  if (anchors.length < 2) return null;
  const byId = new Map(anchors.map((anchor) => [anchor.id, anchor.mastTop]));
  const ordered = order
    .map((id) => byId.get(id))
    .filter((point): point is { x: number; y: number } => Boolean(point));
  return ordered.length >= 2 ? ordered : null;
}

export function computeSquadBoundingEllipse(anchors: readonly SquadAnchor[]) {
  if (anchors.length === 0) return null;
  const xs = anchors.map((anchor) => anchor.mastTop.x);
  const ys = anchors.map((anchor) => anchor.mastTop.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 + 16 },
    radiusX: Math.max(40, (maxX - minX) / 2 + 36),
    radiusY: Math.max(28, (maxY - minY) / 2 + 24),
  };
}

// Catenary-sagged bunting between adjacent mast tops. Sag depth scales with
// segment length so longer gaps droop more (reads as a physical streamer).
export function drawSquadPennant(
  ctx: CanvasRenderingContext2D,
  path: readonly { x: number; y: number }[],
) {
  if (path.length < 2) return;
  ctx.save();
  ctx.strokeStyle = "rgba(232, 187, 96, 0.78)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(path[0]!.x, path[0]!.y);
  for (let i = 1; i < path.length; i += 1) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2 + Math.hypot(b.x - a.x, b.y - a.y) * 0.1;
    ctx.quadraticCurveTo(midX, midY, b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
}

// Drawn AFTER hulls; thinner and lower-alpha than the per-ship selected ring
// so the halo reads as squad context, not as the primary selection signal.
export function drawSquadSelectionHalo(
  ctx: CanvasRenderingContext2D,
  ellipse: NonNullable<ReturnType<typeof computeSquadBoundingEllipse>>,
) {
  ctx.save();
  ctx.strokeStyle = "rgba(232, 187, 96, 0.42)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(
    ellipse.center.x,
    ellipse.center.y,
    ellipse.radiusX,
    ellipse.radiusY,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();
}
