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
  uSunColor: THREE.IUniform<THREE.Color>;   // key light colour × intensity (linear, three units = Blender W/m²)
  uAmbient: THREE.IUniform<THREE.Color>;    // hemisphere/fill colour (sky-side radiance, linear)
  uZenith: THREE.IUniform<THREE.Color>;
  uHorizon: THREE.IUniform<THREE.Color>;
  uHaze: THREE.IUniform<THREE.Color>;       // fog / far-sea colour
  uFogDensity: THREE.IUniform<number>;
  uCameraPos: THREE.IUniform<THREE.Vector3>;
  uResolution: THREE.IUniform<THREE.Vector2>;
  uWindowGlow: THREE.IUniform<number>;      // 0…1 how lit windows/lamps are (dusk → night)
  // ---- added by the world shell (style C port); all driven by TimeOfDay keyframes
  uFillDir: THREE.IUniform<THREE.Vector3>;  // direction TO the shadowless fill sun
  uFillColor: THREE.IUniform<THREE.Color>;  // fill colour × intensity
  uHemiSky: THREE.IUniform<THREE.Color>;    // world-light radiance from above (× π = three HemisphereLight intensity 1)
  uHemiGround: THREE.IUniform<THREE.Color>; // world-light radiance from below
  uLamp: THREE.IUniform<number>;            // emission strength of lamp glass (Blender units: noon 0.4 … night 40)
  uLens: THREE.IUniform<number>;            // emission strength of the Pharos lens (noon 3 … night 14)
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
    uFillDir: { value: new THREE.Vector3(-0.5, 0.5, 0.2).normalize() },
    uFillColor: { value: new THREE.Color(0.1, 0.12, 0.16) },
    uHemiSky: { value: new THREE.Color(0.3, 0.38, 0.5) },
    uHemiGround: { value: new THREE.Color(0.2, 0.2, 0.2) },
    uLamp: { value: 0.4 },
    uLens: { value: 5 },
  };
}
