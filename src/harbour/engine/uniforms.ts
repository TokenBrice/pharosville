import * as THREE from "three";

/**
 * Shared uniforms injected into every custom material (ShaderMaterial uniforms or onBeforeCompile).
 * TimeOfDay owns the lighting values; the Engine owns uTime/uCameraPos/uResolution.
 * Pass the SAME object references into materials so updates propagate without per-material work.
 */
export interface WorldUniforms {
  uTime: THREE.IUniform<number>;
  uNight: THREE.IUniform<number>;          // 0 day … 1 full night
  uSunDir: THREE.IUniform<THREE.Vector3>;   // direction TO the sun (or moon at night), normalized
  uSunColor: THREE.IUniform<THREE.Color>;   // key light colour × intensity
  uAmbient: THREE.IUniform<THREE.Color>;    // hemisphere/fill colour
  uZenith: THREE.IUniform<THREE.Color>;
  uHorizon: THREE.IUniform<THREE.Color>;
  uHaze: THREE.IUniform<THREE.Color>;       // fog / far-sea colour
  uFogDensity: THREE.IUniform<number>;
  uCameraPos: THREE.IUniform<THREE.Vector3>;
  uResolution: THREE.IUniform<THREE.Vector2>;
  uWindowGlow: THREE.IUniform<number>;      // 0…1 how lit windows/lamps are (dusk → night)
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uTime: { value: 0 },
    uNight: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.4, 0.5, 0.3).normalize() },
    uSunColor: { value: new THREE.Color(1, 0.95, 0.85) },
    uAmbient: { value: new THREE.Color(0.35, 0.4, 0.5) },
    uZenith: { value: new THREE.Color("#4a78b0") },
    uHorizon: { value: new THREE.Color("#cfd9e0") },
    uHaze: { value: new THREE.Color("#b8c6cf") },
    uFogDensity: { value: 0.0009 },
    uCameraPos: { value: new THREE.Vector3() },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uWindowGlow: { value: 0 },
  };
}
