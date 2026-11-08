import type * as THREE from "three";
import { patternIdOf } from "./materials";

/**
 * E03a hero value lock (O10 M1): the Pharos' limewash and marble print LIMEWASH × the authored stone, so its sunlit
 * face holds the top value plane by day. The albedo lives in the kit contract's COLOR_0 rgb (materials.ts), so the
 * stone faces are scaled there: pattern plain (marble trim) and ashlar (coursed limestone). Bronze, gilt, paving,
 * timber and tiles keep their colour, and the pattern ids (alpha) are untouched. No new material, program or pass.
 * Applied at load until the Pharos export bakes it into its palette (E18, an Opus asset pass under D4).
 */
export const LIMEWASH = 1.06;
const STONE = new Set([0, 2]);

/** Scales the stone faces' COLOR_0 rgb by `k` (capped at 1); returns the vertices changed. */
export function limewash(geometry: THREE.BufferGeometry, k = LIMEWASH): number {
  const c = geometry.getAttribute("color") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!c || c.itemSize < 4) return 0;
  let n = 0;
  for (let i = 0; i < c.count; i++) {
    if (!STONE.has(patternIdOf(c.getW(i)))) continue;
    c.setXYZ(i, Math.min(1, c.getX(i) * k), Math.min(1, c.getY(i) * k), Math.min(1, c.getZ(i) * k));
    n++;
  }
  if (n) c.needsUpdate = true;
  return n;
}
