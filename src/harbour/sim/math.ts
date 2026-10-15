/**
 * Math.hypot(x, z), bit for bit, without the builtin's cost (a variadic call that allocates on every
 * use): V8 scales by the larger magnitude and sums the squares in order, and one of the two scaled terms
 * is exactly 1, so √(1 + r²)·max with r = min / max rounds identically. Plain √(x² + z²) would differ in
 * the last ulp now and then, and the plan (a chain of threshold and tie-break decisions) amplifies one
 * ulp into a different harbour. 0, ±∞ and NaN go to the builtin.
 */
export function hypot(x: number, z: number): number {
  let a = Math.abs(x), b = Math.abs(z);
  if (a < b) { const t = a; a = b; b = t; }
  if (!(a > 0 && a < Infinity) || b !== b) return Math.hypot(x, z);
  const r = b / a;
  return Math.sqrt(1 + r * r) * a;
}
