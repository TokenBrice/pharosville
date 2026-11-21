import * as THREE from "three";

/**
 * Sky-only art direction by hour (style C "Northern Light" palette, sRGB hex). The base gradient,
 * haze and key light come from the engine's TimeOfDay (WorldUniforms) so sky, sea and land share one
 * horizon; this table adds what only the sky needs: glow, painted clouds, shakkei hills, stars, discs.
 */
export interface SkyKey {
  hour: number;
  glow: string; glowK: number;
  cloudLight: string; cloudMid: string; cloudShade: string; cloudRim: string; rimK: number;
  mount: string; mountLit: string; snow: number;
  stars: number; sun: number; moon: number;
}

export const SKY_KEYS: SkyKey[] = [
  { hour: 0,    glow: "#4F669E", glowK: 0.45, cloudLight: "#344566", cloudMid: "#202E4A", cloudShade: "#121B2E", cloudRim: "#8BA6D8", rimK: 0.72, mount: "#101830", mountLit: "#1E2D50", snow: 0.2, stars: 1, sun: 0, moon: 1 },
  { hour: 5.0,  glow: "#4F669E", glowK: 0.42, cloudLight: "#344566", cloudMid: "#202E4A", cloudShade: "#121B2E", cloudRim: "#8BA6D8", rimK: 0.72, mount: "#121A34", mountLit: "#202F52", snow: 0.2, stars: 0.85, sun: 0, moon: 0.9 },
  { hour: 6.2,  glow: "#FFB392", glowK: 0.95, cloudLight: "#FFE0CC", cloudMid: "#CF9AA8", cloudShade: "#546090", cloudRim: "#FFC496", rimK: 0.95, mount: "#484E7E", mountLit: "#A08094", snow: 0.45, stars: 0.15, sun: 0.8, moon: 0.3 },
  // E03a: a silver morning and noon keep a quieter sun glow (.45 → .15, .25 → .15): the haze beside the hero stays
  // below the Pharos' lit face while the back-lit morning key leaves it a rim; dawn, golden and night keep theirs
  { hour: 7.5,  glow: "#FFE2C0", glowK: 0.15, cloudLight: "#FFF9F0", cloudMid: "#DFE5F0", cloudShade: "#8CA0C4", cloudRim: "#FFF2DF", rimK: 0.55, mount: "#5C78A4", mountLit: "#8EA6C6", snow: 0.75, stars: 0, sun: 1, moon: 0 },
  { hour: 12,   glow: "#FFFFFF", glowK: 0.15, cloudLight: "#FFFDF8", cloudMid: "#E2EBF6", cloudShade: "#8CA6CA", cloudRim: "#FFFFFF", rimK: 0.48, mount: "#5A76A6", mountLit: "#90A8C8", snow: 0.9, stars: 0, sun: 1, moon: 0 },
  { hour: 16.5, glow: "#FFE5C0", glowK: 0.40, cloudLight: "#FFF6E6", cloudMid: "#E6E2EA", cloudShade: "#8E9EC2", cloudRim: "#FFE6BE", rimK: 0.62, mount: "#60749E", mountLit: "#A4A2B4", snow: 0.75, stars: 0, sun: 1, moon: 0 },
  { hour: 18.6, glow: "#FFD090", glowK: 1.05, cloudLight: "#FFE4BA", cloudMid: "#E6A08E", cloudShade: "#686C9E", cloudRim: "#FFB464", rimK: 1.08, mount: "#5B5D8A", mountLit: "#B28680", snow: 0.35, stars: 0, sun: 1, moon: 0 },
  { hour: 19.6, glow: "#F49876", glowK: 0.85, cloudLight: "#EDA89E", cloudMid: "#8A6D96", cloudShade: "#343B6E", cloudRim: "#FFAE82", rimK: 0.88, mount: "#343A68", mountLit: "#725E80", snow: 0.25, stars: 0.3, sun: 0.4, moon: 0.6 },
  { hour: 20.8, glow: "#4F669E", glowK: 0.45, cloudLight: "#344566", cloudMid: "#202E4A", cloudShade: "#121B2E", cloudRim: "#8BA6D8", rimK: 0.72, mount: "#101830", mountLit: "#1E2D50", snow: 0.2, stars: 1, sun: 0, moon: 1 },
  { hour: 24,   glow: "#4F669E", glowK: 0.45, cloudLight: "#344566", cloudMid: "#202E4A", cloudShade: "#121B2E", cloudRim: "#8BA6D8", rimK: 0.72, mount: "#101830", mountLit: "#1E2D50", snow: 0.2, stars: 1, sun: 0, moon: 1 },
];

export interface SkyPaletteUniforms {
  uGlowCol: THREE.IUniform<THREE.Color>;
  uCloudLight: THREE.IUniform<THREE.Color>;
  uCloudMid: THREE.IUniform<THREE.Color>;
  uCloudShade: THREE.IUniform<THREE.Color>;
  uCloudRim: THREE.IUniform<THREE.Color>;
  uMount: THREE.IUniform<THREE.Color>;
  uMountLit: THREE.IUniform<THREE.Color>;
  /** x glowK, y rimK, z snow, w stars */
  uSkyK: THREE.IUniform<THREE.Vector4>;
  /** x sun disc, y moon disc */
  uDiscK: THREE.IUniform<THREE.Vector2>;
}

export function createSkyPaletteUniforms(): SkyPaletteUniforms {
  return {
    uGlowCol: { value: new THREE.Color() }, uCloudLight: { value: new THREE.Color() }, uCloudMid: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() }, uCloudRim: { value: new THREE.Color() }, uMount: { value: new THREE.Color() },
    uMountLit: { value: new THREE.Color() }, uSkyK: { value: new THREE.Vector4() }, uDiscK: { value: new THREE.Vector2() },
  };
}

const ca = new THREE.Color(), cb = new THREE.Color();
export function applySkyPalette(hour: number, u: SkyPaletteUniforms): void {
  const k = SKY_KEYS;
  let i = 0;
  while (i < k.length - 2 && k[i + 1].hour <= hour) i++;
  const a = k[i], b = k[i + 1];
  const f = THREE.MathUtils.smoothstep(hour, a.hour, b.hour);
  const mix = (out: THREE.Color, x: string, y: string) => out.copy(ca.set(x)).lerp(cb.set(y), f);
  const lerp = THREE.MathUtils.lerp;
  mix(u.uGlowCol.value, a.glow, b.glow);
  mix(u.uCloudLight.value, a.cloudLight, b.cloudLight);
  mix(u.uCloudMid.value, a.cloudMid, b.cloudMid);
  mix(u.uCloudShade.value, a.cloudShade, b.cloudShade);
  mix(u.uCloudRim.value, a.cloudRim, b.cloudRim);
  mix(u.uMount.value, a.mount, b.mount);
  mix(u.uMountLit.value, a.mountLit, b.mountLit);
  u.uSkyK.value.set(lerp(a.glowK, b.glowK, f), lerp(a.rimK, b.rimK, f), lerp(a.snow, b.snow, f), lerp(a.stars, b.stars, f));
  u.uDiscK.value.set(lerp(a.sun, b.sun, f), lerp(a.moon, b.moon, f));
}
