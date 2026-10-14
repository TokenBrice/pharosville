/**
 * Greedy label collision culling (ClaudeVille's label rule): labels arrive in priority order; each
 * one is kept only when its padded rect overlaps nothing already kept. Pure.
 */
export interface LabelBox { x: number; y: number; w: number; h: number; visible: boolean }

export function cullLabels(boxes: readonly LabelBox[], pad = 4, viewport?: { w: number; h: number }): boolean[] {
  const kept: LabelBox[] = [];
  return boxes.map((b) => {
    if (!b.visible) return false;
    if (viewport && (b.x < 4 || b.y < 4 || b.x + b.w > viewport.w - 4 || b.y + b.h > viewport.h - 4)) return false;
    for (const k of kept) {
      if (b.x < k.x + k.w + pad && b.x + b.w + pad > k.x && b.y < k.y + k.h + pad && b.y + b.h + pad > k.y) return false;
    }
    kept.push(b);
    return true;
  });
}
