import type { ScreenPoint } from "../systems/projection";

export function firstPointer(points: ReadonlyMap<number, ScreenPoint>): { pointerId: number; point: ScreenPoint } | null {
  const next = points.entries().next();
  if (next.done) return null;
  return { pointerId: next.value[0], point: next.value[1] };
}

export function pinchSnapshot(
  points: ReadonlyMap<number, ScreenPoint>,
  preferredIds?: readonly [number, number],
): { distance: number; midpoint: ScreenPoint; pointerIds: [number, number] } | null {
  let pointerIds: [number, number] | null = null;
  if (preferredIds && points.has(preferredIds[0]) && points.has(preferredIds[1])) {
    pointerIds = [preferredIds[0], preferredIds[1]];
  } else {
    const ids = Array.from(points.keys()).slice(0, 2);
    if (ids.length === 2) pointerIds = [ids[0], ids[1]];
  }
  if (!pointerIds) return null;
  const first = points.get(pointerIds[0]);
  const second = points.get(pointerIds[1]);
  if (!first || !second) return null;
  return {
    distance: Math.hypot(second.x - first.x, second.y - first.y),
    midpoint: {
      x: (first.x + second.x) / 2,
      y: (first.y + second.y) / 2,
    },
    pointerIds,
  };
}
