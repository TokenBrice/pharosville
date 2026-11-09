import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";
import { AERIAL_GLSL, AERIAL_VERT_GLSL, aerialUniforms } from "../world/aerial";
import type { EmblemAtlas } from "./emblems";
import { PRINT_FULL_PX, PRINT_INK_SAT, PRINT_SOFT_PX } from "./shaders/print";

/**
 * House flags: the coin's colours flown by every hull at rest (docked, moored, at anchor), so a furled fleet
 * still reads coin by coin. One instanced draw. Each flag is a cloth in the coin's BRAND colour with its emblem
 * (atlas slot: the logo on its white roundel) near the hoist, on both faces, streaming downwind (the weather's
 * wind: flutter and droop follow its strength), turned a little toward the viewer so it reads, lit with the scene.
 * Styles: a swallowtail BURGEE at the masthead (every hull) · a big rectangular HOUSE FLAG (the titans) · the
 * red-and-white chequered DISTRESS flag (aground on the Shoals: flown above her own colours, never instead). When a
 * flag is only a few pixels across (the overview) the roundel melts away and the brand field remains: a dot of the
 * coin's colour over its hull.
 * E04 (O5-I5/I1/I6; ruling V3): her colours fly in the harbour's air and pigment: the field arrives at the
 * earth-pigment chroma (the caller passes the capped colour) and takes the distance air at 0.6 × its cap; the device
 * is printed on cream canvas by the print law (contrast by its size on screen), a monogram as lettering. The hovered,
 * selected or searched hull (add's `hi`) flies her full colours, unhazed. The distress flag is a signal: exempt.
 */
export const FLAG_BURGEE = 0, FLAG_HOUSE = 1, FLAG_DISTRESS = 2;
/** 06-F7c a titan's vexillum: a long tapering masthead streamer in her colours, above the house flag (decorative). */
export const FLAG_STREAMER = 5;
/** E04: added to a flag's style when its hull is highlighted (hover / selection / search): full colours, no air. */
const FLAG_HI = 8;
/** Share of the distance air a burgee takes (ruling V3: 0.6 × the cap). */
export const FLAG_AIR = 0.6;
const f2 = (x: number) => x.toFixed(2);

const VERT = /* glsl */ `
attribute float aSlot;
attribute float aPhase;
attribute vec4 aBrand;
uniform float uTime;
uniform float uWind;
varying vec2 vUv;
varying float vSlot;
varying vec4 vBrand;
varying float vShade;
${AERIAL_VERT_GLSL}
void main() {
  vUv = uv;
  vSlot = aSlot;
  vBrand = aBrand;
  vec3 p = position;
  float fly = uv.x;                       // 0 at the hoist … 1 at the fly
  float w = clamp(uWind, 0.0, 1.4);
  float ph = uTime * (4.0 + 4.5 * w) + aPhase;
  if (aBrand.w - ${f2(FLAG_HI)} * step(${f2(FLAG_HI - 0.5)}, aBrand.w) > 4.5) {
    // streamer: a narrow ribbon tapering to a point, a slower wave running down its length
    p.y *= 0.12 * (1.0 - 0.9 * fly);
    p.z += sin(ph * 0.8 + fly * 8.0) * (0.006 + 0.012 * w) * fly;
  }
  p.z += sin(ph + fly * 5.0) * (0.03 + 0.08 * w) * fly;
  p.y += sin(ph * 0.7 + fly * 3.0) * 0.02 * fly;
  // light airs: the fly droops toward the staff
  p.y -= fly * fly * 0.28 * (1.0 - smoothstep(0.12, 0.55, w));
  vShade = 0.86 + 0.14 * cos(ph + fly * 5.0);
  hbAerialVert((modelMatrix * instanceMatrix * vec4(p, 1.0)).xyz);
  gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
}`;

const FRAG = /* glsl */ `
uniform sampler2D uEmblems;
uniform sampler2D uHeroEmblems;
uniform vec2 uHeroSlots;
uniform vec4 uEmblemGrid;
uniform vec3 uLight;
uniform vec3 uHorizon;
uniform vec2 uFleetScreen;
uniform float uEmblemLetters;
varying vec2 vUv;
varying float vSlot;
varying vec4 vBrand;
varying float vShade;
const vec3 CLOTH = vec3(0.93, 0.91, 0.86);
${AERIAL_GLSL}
void main() {
  float hi = step(${f2(FLAG_HI - 0.5)}, vBrand.w);
  float style = vBrand.w - ${f2(FLAG_HI)} * hi;
  float x = vUv.x, ym = (vUv.y - 0.5) * 0.72;     // flag metres (a unit fly, 0.72 hoist)
  float ax = fwidth(x) + 1e-4;
  float edge = min(min(x, 1.0 - x), 0.36 - abs(ym));
  float cx = 0.5, R = 0.3;
  if (style < 0.5) {
    // swallowtail burgee: tapering to the fly, a notch cut into it
    float hh = 0.36 * (1.0 - 0.32 * x);
    float notch = 1.0 - 0.3 * (1.0 - abs(ym) / hh);
    if (abs(ym) > hh || x > notch) discard;
    edge = min(min(x, hh - abs(ym)), (notch - x) * 0.7);
    cx = 0.34; R = 0.25;
  }
  vec3 c;
  vec3 brand = vBrand.rgb;
  if (style > 4.5) {
    // streamer: the brand ribbon with a cream heading (too thin for a hem or a roundel)
    float lumS = dot(brand, vec3(0.2126, 0.7152, 0.0722));
    c = mix(mix(vec3(lumS), brand, 0.9) * 0.92, CLOTH * 0.9, 1.0 - smoothstep(0.03 - ax, 0.03 + ax, x));
    c *= uLight * vShade;
    hbAerial(c, vec3(0.0), max(${f2(1 - FLAG_AIR)}, hi));
    gl_FragColor = vec4(c, 1.0);
    return;
  }
  float lum = dot(brand, vec3(0.2126, 0.7152, 0.0722));
  if (style > 1.5) {
    // distress: a red-and-white chequered signal flag
    vec2 k = floor(vec2(x * 4.0, vUv.y * 3.0));
    c = mod(k.x + k.y, 2.0) < 0.5 ? vec3(0.62, 0.07, 0.05) : CLOTH;
  } else {
    // the brand field, a touch muted (dyed bunting, not plastic); a pale heading at the hoist
    c = mix(vec3(lum), brand, 0.9) * 0.92;
    if (style > 0.5) {
      // house flag: a cream border band round the field
      float band = 1.0 - smoothstep(0.05 - ax, 0.05 + ax, edge);
      c = mix(c, CLOTH, band * 0.85);
    }
    c = mix(c, CLOTH * 0.9, 1.0 - smoothstep(0.035 - ax, 0.035 + ax, x));
    // the emblem roundel, while it is big enough on screen to be one (a few px: the brand dot remains)
    float show = 1.0 - smoothstep(1.0 / 26.0, 1.0 / 12.0, ax);
    // E04 (O5-F1): the interpolated slot lands at 320 ± ε; round it before mod / floor (-1 = no emblem stays -1)
    float slot = floor(vSlot + 0.5);
    if (slot >= 0.0 && show > 0.0) {
      vec2 d = vec2(x - cx, ym);
      vec2 e = vec2(gl_FrontFacing ? d.x : -d.x, -d.y) * (0.465 / R) + 0.5;  // the slot's disc (r 0.465) on R
      if (e.x >= 0.0 && e.x <= 1.0 && e.y >= 0.0 && e.y <= 1.0) {
        vec2 cell = vec2(mod(slot, uEmblemGrid.x), floor(slot / uEmblemGrid.x));
        vec2 uv = vec2((cell.x + e.x) * uEmblemGrid.z, 1.0 - (cell.y + e.y) * uEmblemGrid.w);
        vec4 t;
        if (slot == uHeroSlots.x || slot == uHeroSlots.y) {
          float tile = slot == uHeroSlots.x ? 0.0 : 1.0;
          t = texture2D(uHeroEmblems, vec2((tile + e.x) * 0.5, 1.0 - e.y));
        } else t = texture2D(uEmblems, uv);     // premultiplied
        // E04 print law (the roundel's diameter, 2R flag units, in CSS px)
        float k = max(smoothstep(${f2(PRINT_SOFT_PX)}, ${f2(PRINT_FULL_PX)}, 2.0 * R / (ax * max(uFleetScreen.y, 0.25))), hi);
        vec3 ink = t.rgb / max(t.a, 1e-4), ground = CLOTH * 0.78;
        float paper = 0.0;
        if (slot >= uEmblemLetters) {
          // a monogram: lettering inked from the field
          ink = mix(c * 0.12, CLOTH * 0.9, 1.0 - smoothstep(0.22, 0.26, dot(c, vec3(0.2126, 0.7152, 0.0722))));
        } else {
          // a logo: on cream canvas (paper when highlighted), earth-pigment ink
          float lo = min(ink.r, min(ink.g, ink.b)), mx = max(ink.r, max(ink.g, ink.b));
          paper = smoothstep(0.72, 0.88, lo) * (1.0 - smoothstep(0.06, 0.16, mx - lo));
          float sat = (mx - lo) / max(mx + lo, 1e-3);
          ink = max(mix(vec3(dot(ink, vec3(0.2126, 0.7152, 0.0722))), ink, mix(min(1.0, ${f2(PRINT_INK_SAT)} / max(sat, 1e-3)), 1.0, hi)), vec3(0.0));
          ground = mix(ground, vec3(0.94), hi);
        }
        vec3 soft = c * 1.15;
        vec3 inkSoft = max(ink + 0.5 * (dot(soft, vec3(0.2126, 0.7152, 0.0722)) - dot(ink, vec3(0.2126, 0.7152, 0.0722))), vec3(0.0));
        c = mix(c, mix(mix(inkSoft, ink, k), mix(soft, ground, k), paper), t.a * show);
      }
    }
  }
  // a thin darker hem so the cloth reads against sky and water
  c *= mix(0.6, 1.0, smoothstep(0.0, 0.03 + ax, edge));
  c *= uLight * vShade;
  // E04: the harbour's air (distress and highlight exempt)
  hbAerial(c, vec3(0.0), style > 1.5 ? 1.0 : max(${f2(1 - FLAG_AIR)}, hi));
  gl_FragColor = vec4(c, 1.0);
}`;

export class HouseFlags {
  readonly mesh: THREE.InstancedMesh;
  private readonly slotAttr: THREE.InstancedBufferAttribute;
  private readonly phaseAttr: THREE.InstancedBufferAttribute;
  private readonly brandAttr: THREE.InstancedBufferAttribute;
  private readonly mat: THREE.ShaderMaterial;
  private n = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler(0, 0, 0, "YXZ");
  private readonly s = new THREE.Vector3();
  private readonly p = new THREE.Vector3();

  /** `screen`: the fleet's (CSS viewport height px, effective DPR), for the print law. */
  constructor(u: WorldUniforms, atlas: EmblemAtlas, max = 1024, screen: THREE.IUniform<THREE.Vector2> = { value: new THREE.Vector2(1000, 1) }) {
    // a unit flag in its own xy plane, hoist on the local origin, flying along +x
    const g = new THREE.PlaneGeometry(1, 0.72, 10, 3);
    g.translate(0.5, -0.36, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: u.uTime, uWind: { value: 0.35 }, uEmblems: atlas.uniform ?? { value: atlas.texture }, uHeroEmblems: atlas.heroUniform ?? { value: atlas.texture }, uHeroSlots: atlas.heroSlots ?? { value: new THREE.Vector2(-1, -1) }, uEmblemGrid: { value: atlas.grid },
        uLight: { value: new THREE.Color(1, 1, 1) },
        // E04: the print law, lettering and the harbour's air (the shared aerial uniforms; off until the ocean binds them)
        uFleetScreen: screen, uEmblemLetters: { value: atlas.letterSlot ?? 1e9 },
        ...aerialUniforms, uAerialDensity: u.uFogDensity ?? { value: 0 }, uAerialHaze: u.uHaze ?? { value: new THREE.Color() },
        uHorizon: u.uHorizon ?? { value: new THREE.Color() },
      },
      vertexShader: VERT, fragmentShader: FRAG, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.name = "harbour-house-flags";
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.slotAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.phaseAttr = new THREE.InstancedBufferAttribute(new Float32Array(max), 1).setUsage(THREE.DynamicDrawUsage);
    this.brandAttr = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute("aSlot", this.slotAttr);
    g.setAttribute("aPhase", this.phaseAttr);
    g.setAttribute("aBrand", this.brandAttr);
  }

  begin(): void { this.n = 0; }

  /**
   * A flag hoisted at (x,y,z), `size` m on the fly, streaming toward `downwind` (heading convention:
   * along (sin, cos)), turned up to `face` radians toward `toCam` (heading of the camera from the flag).
   * `brand` is linear; `style` FLAG_BURGEE | FLAG_HOUSE | FLAG_DISTRESS; `hi`: her hull is hovered, selected or searched.
   */
  add(x: number, y: number, z: number, size: number, downwind: number, toCam: number, slot: number, phase: number, brand: THREE.Color, style: number, hi = false): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    // the flag's +x is its fly: yaw it so the fly points downwind, then ease the face toward the viewer
    let yaw = downwind - Math.PI / 2;
    const side = Math.sin(toCam - downwind); // viewer off the flag's side (>0: one face, <0: the other)
    yaw += 0.35 * Math.sign(side) * (1 - Math.abs(side));
    this.e.set(0, yaw, 0, "YXZ");
    this.q.setFromEuler(this.e);
    this.m.compose(this.p.set(x, y, z), this.q, this.s.set(size, size, size));
    this.mesh.setMatrixAt(this.n, this.m);
    this.slotAttr.setX(this.n, slot);
    this.phaseAttr.setX(this.n, phase);
    this.brandAttr.setXYZW(this.n, brand.r, brand.g, brand.b, style + (hi ? FLAG_HI : 0));
    this.n++;
  }

  end(light: THREE.Color, wind: number): void {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    if (!this.n) return;
    this.mesh.instanceMatrix.clearUpdateRanges(); this.mesh.instanceMatrix.addUpdateRange(0, this.n * 16); this.mesh.instanceMatrix.needsUpdate = true;
    for (const a of [this.slotAttr, this.phaseAttr]) { a.clearUpdateRanges(); a.addUpdateRange(0, this.n); a.needsUpdate = true; }
    this.brandAttr.clearUpdateRanges(); this.brandAttr.addUpdateRange(0, this.n * 4); this.brandAttr.needsUpdate = true;
    (this.mat.uniforms.uLight.value as THREE.Color).copy(light);
    this.mat.uniforms.uWind.value = wind;
  }

  dispose(): void { this.mesh.geometry.dispose(); this.mat.dispose(); }
}
