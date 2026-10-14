import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";
import type { OceanService } from "../ocean/ocean-system";
import { wavesGLSL } from "../ocean/waves";
import { layoutLabel, type LabelSpec } from "./labels";
import type { ChartFont } from "./types";

/**
 * CHART LETTERING ON THE WATER (D18): every sea-zone name set as nautical-chart typography printed on the
 * sea itself. One draw: SDF glyphs + hairline rules, riding the ocean's own Gerstner swell (same clock,
 * same coast damping), softly wavering, occluded by hulls (depth-tested, no depth write), faded by zoom per
 * class and by the coast, dark ink by day and a faint luminous silver at night.
 */
const VERT = /* glsl */ `
uniform float uTime;
uniform vec4 uSea;
uniform sampler2D uSdf;
uniform vec4 uSdfBounds;
uniform float uCamDist;
uniform float uSeaLevel;
attribute vec4 aFade;
attribute float aInk;
attribute float aSlot;
varying vec2 vUv;
varying float vA;
varying float vRule;
varying vec3 vWorld;
varying float vCoast;
${wavesGLSL()}
void main() {
  vec3 p = position;
  vec2 suv = (p.xz - uSdfBounds.xy) / (uSdfBounds.zw - uSdfBounds.xy);
  float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
  float coast = mix(200.0, (textureLod(uSdf, clamp(suv, 0.0, 1.0), 0.0).r - 0.5) * 128.0, inside);
  float damp = smoothstep(0.0, 34.0, coast) * 0.9 + 0.1 * smoothstep(-2.0, 2.0, coast);
  p += gerstnerDisp(p.xz, uTime, uSea.x * damp);
  p.y += uSeaLevel + 0.22;
  float f = smoothstep(aFade.x, aFade.y, uCamDist) * (1.0 - smoothstep(aFade.z, aFade.w, uCamDist));
  // close in, the print steps back so the boats lead
  vA = f * aInk * mix(0.6, 1.0, smoothstep(160.0, 460.0, uCamDist));
  vRule = aSlot < -0.5 ? 1.0 : 0.0;
  vUv = uv;
  vWorld = p;
  vCoast = coast;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uAtlas;
uniform float uTime, uNight, uCamDist;
uniform vec3 uCameraPos;
uniform vec3 uInkDay, uInkNight, uHaloCol;
uniform float uHalo;
varying vec2 vUv;
varying float vA;
varying float vRule;
varying vec3 vWorld;
varying float vCoast;
void main() {
  if (vA < 0.004) discard;
  float a, halo = 0.0;
  if (vRule > 0.5) {
    // hairline rule: soft across, tapering at its ends
    float across = abs(vUv.y - 0.5) * 2.0;
    float w = fwidth(vUv.y) * 2.0 + 1e-4;
    a = 1.0 - smoothstep(1.0 - w, 1.0 + w, across);
    a *= clamp(0.5 / w, 0.25, 1.0);           // thinner than a pixel: fade, don't alias
  } else {
    // the swell wavers the print a little
    vec2 wob = vec2(sin(vWorld.z * 0.37 + uTime * 1.2), sin(vWorld.x * 0.33 - uTime * 1.05)) * 0.0009;
    float d = texture2D(uAtlas, vUv + wob).r;
    float w = max(fwidth(d) * 0.75, 0.012);
    // far away, embolden a touch so the caps stay legible
    float th = 0.45 - 0.07 * smoothstep(450.0, 1000.0, uCamDist);
    a = smoothstep(th - w, th + w, d);
    // a faint wash of paler water around the letters (the print "knocks out" the glitter behind it)
    halo = smoothstep(th - 0.15, th - 0.04, d);
  }
  // fades: the coast (lettering never prints on the beach), the far haze
  a *= smoothstep(1.5, 7.0, vCoast);
  a *= 1.0 - smoothstep(1500.0, 2300.0, length(vWorld.xz - uCameraPos.xz));
  // printed ink, unevenly taken by the water
  float grain = 0.88 + 0.12 * sin(vWorld.x * 0.9 + sin(vWorld.z * 0.7) * 2.0);
  float dens = mix(0.86, 0.2, uNight) * grain;
  vec3 ink = mix(uInkDay, uInkNight, uNight);
  // night: a faint silvery shimmer as if moonlit
  ink *= 1.0 + uNight * 0.18 * sin(uTime * 0.8 + vWorld.x * 0.05 + vWorld.z * 0.04);
  // two passes over the same quads: every halo first, then every letter, so no wash lands on a neighbour's ink
#ifdef HALO_PASS
  if (vRule > 0.5) discard;
  gl_FragColor = vec4(uHaloCol, halo * uHalo * (1.0 - uNight) * vA);
#else
  gl_FragColor = vec4(ink, a * dens * vA);
#endif
}`;

export class ChartLettering {
  /** Halo pass + ink pass (same geometry). */
  readonly mesh = new THREE.Group();
  private readonly mat: THREE.ShaderMaterial;
  private readonly haloMat: THREE.ShaderMaterial;
  readonly camDist = { value: 600 };

  constructor(specs: readonly LabelSpec[], font: ChartFont, atlas: THREE.Texture, u: WorldUniforms, ocean: OceanService | undefined, seaLevel: number) {
    const pos: number[] = [], uv: number[] = [], fade: number[] = [], ink: number[] = [], slot: number[] = [], idx: number[] = [];
    const [AW, AH] = font.atlas;
    for (const spec of specs) {
      for (const q of layoutLabel(spec, font)) {
        const b = pos.length / 3;
        let uvs: Array<[number, number]>;
        if (q.slot < 0) uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
        else {
          const col = q.slot % font.cols, row = Math.floor(q.slot / font.cols);
          const u0 = (col * font.cell) / AW, u1 = ((col + 1) * font.cell) / AW;
          const vTop = 1 - (row * font.cell) / AH, vBot = 1 - ((row + 1) * font.cell) / AH;
          uvs = [[u0, vBot], [u1, vBot], [u1, vTop], [u0, vTop]];
        }
        // tessellated (~3.5 m cells) so the print follows the swell instead of letting crests poke through it
        const [c0, c1, , c3] = q.c;
        const nu = Math.min(14, Math.max(1, Math.ceil(Math.hypot(c1[0] - c0[0], c1[1] - c0[1]) / 3.5)));
        const nv = Math.min(14, Math.max(1, Math.ceil(Math.hypot(c3[0] - c0[0], c3[1] - c0[1]) / 3.5)));
        const lerp2 = (a: [number, number], bb: [number, number], t: number): [number, number] => [a[0] + (bb[0] - a[0]) * t, a[1] + (bb[1] - a[1]) * t];
        for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
          const s = i / nu, t = j / nv;
          const p = lerp2(lerp2(q.c[0], q.c[1], s), lerp2(q.c[3], q.c[2], s), t);
          const w = lerp2(lerp2(uvs[0], uvs[1], s), lerp2(uvs[3], uvs[2], s), t);
          pos.push(p[0], 0, p[1]);
          uv.push(w[0], w[1]);
          fade.push(...spec.fade);
          ink.push(spec.ink);
          slot.push(q.slot);
        }
        for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
          const a = b + j * (nu + 1) + i, c = a + nu + 1;
          idx.push(a, a + 1, c + 1, a, c + 1, c);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("aFade", new THREE.Float32BufferAttribute(fade, 4));
    g.setAttribute("aInk", new THREE.Float32BufferAttribute(ink, 1));
    g.setAttribute("aSlot", new THREE.Float32BufferAttribute(slot, 1));
    g.setIndex(idx);
    g.computeBoundingSphere();

    atlas.colorSpace = THREE.NoColorSpace;
    atlas.minFilter = THREE.LinearMipmapLinearFilter;
    atlas.magFilter = THREE.LinearFilter;
    atlas.anisotropy = 8;
    atlas.needsUpdate = true;
    const sh = ocean?.shared;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG,
      uniforms: {
        uTime: sh?.uTime ?? { value: 0 },
        uSea: sh?.uSea ?? { value: new THREE.Vector4(0, 0, 0, 0) },
        uSdf: sh?.uSdf ?? { value: new THREE.DataTexture(new Uint8Array([255, 0, 255, 255]), 1, 1) },
        uSdfBounds: sh?.uSdfBounds ?? { value: new THREE.Vector4(-1e4, -1e4, 1e4, 1e4) },
        uSeaLevel: { value: seaLevel },
        uCamDist: this.camDist,
        uAtlas: { value: atlas },
        uNight: u.uNight,
        uCameraPos: u.uCameraPos,
        uInkDay: { value: new THREE.Color("#0B2233") },
        uInkNight: { value: new THREE.Color("#A9BBD3") },
        uHaloCol: { value: new THREE.Color("#CFE3DF") },
        uHalo: { value: 0.12 },
      },
      transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide,
    });
    this.haloMat = this.mat.clone();
    this.haloMat.uniforms = this.mat.uniforms;   // same uniform objects
    this.haloMat.defines = { HALO_PASS: 1 };
    const halo = new THREE.Mesh(g, this.haloMat), inkMesh = new THREE.Mesh(g, this.mat);
    // right after the sea (60), before every other transparent
    halo.renderOrder = 61; inkMesh.renderOrder = 62;
    halo.frustumCulled = inkMesh.frustumCulled = false;
    this.mesh.name = "chart-lettering";
    this.mesh.add(halo, inkMesh);
  }

  dispose(): void { (this.mesh.children[0] as THREE.Mesh).geometry.dispose(); this.mat.dispose(); this.haloMat.dispose(); }
}
