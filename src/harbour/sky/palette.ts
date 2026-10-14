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
  { hour: 0,    glow: "#6C82C0", glowK: 0.55, cloudLight: "#8A9BC4", cloudMid: "#43528A", cloudShade: "#1E2850", cloudRim: "#D3DEFF", rimK: 1.0, mount: "#1A2443", mountLit: "#33446E", snow: 0.25, stars: 1, sun: 0, moon: 1 },
  { hour: 5.0,  glow: "#6C82C0", glowK: 0.5,  cloudLight: "#8A9BC4", cloudMid: "#43528A", cloudShade: "#1E2850", cloudRim: "#D3DEFF", rimK: 1.0, mount: "#1C2646", mountLit: "#33446E", snow: 0.25, stars: 0.85, sun: 0, moon: 0.9 },
  { hour: 6.2,  glow: "#FFB59A", glowK: 0.9,  cloudLight: "#FFD5C2", cloudMid: "#C99AA8", cloudShade: "#5E5F8A", cloudRim: "#FFC3A0", rimK: 0.9, mount: "#4A4E74", mountLit: "#A88A9A", snow: 0.5, stars: 0.15, sun: 0.8, moon: 0.3 },
  { hour: 7.5,  glow: "#FFE2C0", glowK: 0.45, cloudLight: "#FFF6EA", cloudMid: "#E2E4EE", cloudShade: "#9AA6C2", cloudRim: "#FFF0DD", rimK: 0.5, mount: "#7E92B0", mountLit: "#B2BCCC", snow: 0.8, stars: 0, sun: 1, moon: 0 },
  { hour: 12,   glow: "#FFFFFF", glowK: 0.25, cloudLight: "#FFFFFF", cloudMid: "#E6ECF4", cloudShade: "#A2B3CC", cloudRim: "#FFFFFF", rimK: 0.4, mount: "#8FA8C2", mountLit: "#B9C9D8", snow: 1, stars: 0, sun: 1, moon: 0 },
  { hour: 16.5, glow: "#FFE8C8", glowK: 0.35, cloudLight: "#FFF6E8", cloudMid: "#E8E4E8", cloudShade: "#9EA6C4", cloudRim: "#FFE9C8", rimK: 0.55, mount: "#8796B4", mountLit: "#C2BCC0", snow: 0.8, stars: 0, sun: 1, moon: 0 },
  { hour: 18.6, glow: "#FFD39A", glowK: 1.0,  cloudLight: "#FFDCB0", cloudMid: "#E8A493", cloudShade: "#77719C", cloudRim: "#FFAA62", rimK: 1.0, mount: "#7F7F9E", mountLit: "#C9A089", snow: 0.4, stars: 0, sun: 1, moon: 0 },
  { hour: 19.6, glow: "#F09A7A", glowK: 0.8,  cloudLight: "#E8A6A0", cloudMid: "#8E6F92", cloudShade: "#3C3F6E", cloudRim: "#FFB08A", rimK: 0.8, mount: "#3E4068", mountLit: "#7A6280", snow: 0.3, stars: 0.3, sun: 0.4, moon: 0.6 },
  { hour: 20.8, glow: "#6C82C0", glowK: 0.55, cloudLight: "#8A9BC4", cloudMid: "#43528A", cloudShade: "#1E2850", cloudRim: "#D3DEFF", rimK: 1.0, mount: "#1A2443", mountLit: "#33446E", snow: 0.25, stars: 1, sun: 0, moon: 1 },
  { hour: 24,   glow: "#6C82C0", glowK: 0.55, cloudLight: "#8A9BC4", cloudMid: "#43528A", cloudShade: "#1E2850", cloudRim: "#D3DEFF", rimK: 1.0, mount: "#1A2443", mountLit: "#33446E", snow: 0.25, stars: 1, sun: 0, moon: 1 },
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
