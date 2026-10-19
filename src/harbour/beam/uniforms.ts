import * as THREE from "three";
import type { EngineContext } from "../engine/types";

/**
 * Lighthouse-beam uniforms shared by the beam system (volume, halo) and the ocean (sweeping glint).
 * Get-or-create so the ocean (which inits first) and the beam bind the same objects.
 */
export interface BeamUniforms {
  /** lantern centre, world */
  uBeamPos: THREE.IUniform<THREE.Vector3>;
  /** sweep angle (rad): the single beam points along (cos a, -sin tilt, sin a) */
  uBeamAngle: THREE.IUniform<number>;
  /** lamp colour × beam intensity (night-weighted) */
  uBeamCol: THREE.IUniform<THREE.Color>;
  /** x reach (m), y cone half-angle (rad), z down-tilt (rad), w lantern flare toward the camera (0..) */
  uBeamShape: THREE.IUniform<THREE.Vector4>;
}

const KEY = "beam:uniforms";

export function getBeamUniforms(ctx: EngineContext): BeamUniforms {
  let u = ctx.services.get(KEY) as BeamUniforms | undefined;
  if (!u) {
    u = {
      uBeamPos: { value: new THREE.Vector3(0, -1000, 0) },
      uBeamAngle: { value: 0 },
      uBeamCol: { value: new THREE.Color(0, 0, 0) },
      uBeamShape: { value: new THREE.Vector4(520, 0.07, 0.03, 0) },
    };
    ctx.services.set(KEY, u);
  }
  return u;
}
