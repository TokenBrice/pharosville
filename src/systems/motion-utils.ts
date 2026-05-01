export function pathKey(from: { x: number; y: number }, to: { x: number; y: number }) {
  return `${from.x}.${from.y}->${to.x}.${to.y}`;
}

export function sameTile(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x === b.x && a.y === b.y;
}

export function smoothstep(value: number) {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

export function smoothstepRange(edge0: number, edge1: number, value: number) {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor;
}

export function normalizeHeading(vector: { x: number; y: number }): { x: number; y: number } {
  const magnitude = Math.hypot(vector.x, vector.y);
  if (magnitude <= 0) return { x: 0, y: 0 };
  return { x: vector.x / magnitude, y: vector.y / magnitude };
}

export function normalizeHeadingInto(x: number, y: number, out: { x: number; y: number }): void {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 0) {
    out.x = 0;
    out.y = 0;
    return;
  }
  out.x = x / magnitude;
  out.y = y / magnitude;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
