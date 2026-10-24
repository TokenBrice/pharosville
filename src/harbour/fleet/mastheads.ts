import type * as THREE from "three";

/**
 * 'mastheads' service (09-L6, for the life layer's gulls): the world position of each hull's masthead while she
 * lies at rest, by pose index (ids in pose order). NaN = no perch: under way, rig struck far away, wrecked, or a titan
 * (her big house flag must stay clear). Written by the fleet each frame; decorative, carries no data.
 */
export interface MastheadService {
  /** pose ids, in the same order as `xyz` */
  readonly ids: readonly string[];
  /** x, y, z per hull (NaN = none) */
  readonly xyz: Float32Array;
}

export class Mastheads implements MastheadService {
  ids: readonly string[] = [];
  xyz = new Float32Array(0);

  begin(ids: readonly string[], n: number): void {
    this.ids = ids;
    if (this.xyz.length !== n * 3) this.xyz = new Float32Array(n * 3);
    this.xyz.fill(NaN);
  }

  set(i: number, p: THREE.Vector3): void {
    if (i * 3 + 2 >= this.xyz.length) return;
    this.xyz[i * 3] = p.x; this.xyz[i * 3 + 1] = p.y; this.xyz[i * 3 + 2] = p.z;
  }
}
