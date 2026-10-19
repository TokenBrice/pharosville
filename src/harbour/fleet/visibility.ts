import type { BufferGeometry, DirectionalLight, Frustum } from "three";

/**
 * Radius about the kit origin containing every hbFleetPose vertex: furl translates by at most
 * |aFurl|, mirroring preserves length, and rotation about aPivot adds at most 2|aPivot|.
 * Hull rotation preserves this radius. Wind flutter and world-space surge are added per frame.
 */
export function rigRadius(geometry: BufferGeometry): number {
  const p = geometry.getAttribute("position");
  const furl = geometry.getAttribute("aFurl");
  const pivot = geometry.getAttribute("aPivot");
  let radius = 0;
  for (let i = 0; i < p.count; i++) {
    const r = Math.hypot(p.getX(i), p.getY(i), p.getZ(i))
      + (furl ? Math.hypot(furl.getX(i), furl.getY(i), furl.getZ(i)) : 0)
      + (pivot ? 2 * Math.hypot(pivot.getX(i), pivot.getY(i), pivot.getZ(i)) : 0);
    radius = Math.max(radius, r);
  }
  return radius;
}

/**
 * SunRig fits the light before fleet.update, but the renderer normally updates the shadow camera
 * later. Refresh from this frame's light/target, not the preceding render's cached shadow frustum.
 */
export function fleetShadowFrustum(light: DirectionalLight): Frustum {
  light.updateWorldMatrix(true, false);
  light.target.updateWorldMatrix(true, false);
  light.shadow.updateMatrices(light);
  return light.shadow.getFrustum();
}
