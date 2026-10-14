import * as THREE from "three";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import type { GroundService } from "./ground";
import { assetExists } from "./island-system";
import { getHarbourMaterials } from "./materials";
import { STYLE_C_GLB } from "./standin";

export const LIGHTHOUSE_URL = "/harbour/lighthouse.glb";

/**
 * 'lighthouse' service for the beam owner (atmosphere agent) and the UI.
 * Heading convention = layout headings: the beam points along (sin h, 0, cos h).
 */
export interface LighthouseService {
  /** Tower foot (world). */
  readonly position: THREE.Vector3;
  /** Centre of the lamp / lens (world). */
  readonly lanternPosition: THREE.Vector3;
  /** Current beam heading, radians. */
  sweepAngle(): number;
  /** Seconds per full revolution (PSI rhythm). */
  readonly period: number;
  readonly lit: boolean;
  setSweep(seconds: number): void;
  setLit(lit: boolean): void;
  /** 0..1 lantern level, for a fade instead of a cut (readings binder). */
  setLitLevel?(v: number): void;
  /** Reduced motion: hold the beam at a fixed heading (radians); null resumes the sweep. */
  hold?(heading: number | null): void;
  /** Lantern glow colour (PSI 3-step lamp). */
  setLampColor?(c: THREE.ColorRepresentation): void;
}

const GLOW_VERT = /* glsl */ `
uniform float uSize;
varying vec2 vQ;
void main() {
  vQ = position.xy * 2.0;
  vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  mv.xy += position.xy * uSize;
  mv.z += 4.0;                       // sit in front of the lantern room so the dome never clips it
  gl_Position = projectionMatrix * mv;
}`;
const GLOW_FRAG = /* glsl */ `
uniform float uLens;
uniform float uLit;
uniform float uFlash;
uniform float uNight;
uniform float uFar;
uniform vec3 uLampCol;
varying vec2 vQ;
void main() {
  float r2 = dot(vQ, vQ);
  float core = exp(-r2 * 140.0) * (1.0 + 3.0 * uFlash);
  float halo = exp(-r2 * 12.0) * (0.06 + 0.4 * uFlash) * uNight;
  float rays = pow(max(0.0, 1.0 - abs(vQ.y) * 26.0), 2.0) * exp(-abs(vQ.x) * 4.0) * uFlash * 0.5;
  // by day only the rhythm flash reads; by night the lamp glows steadily
  vec3 c = uLampCol * (core + halo + rays) * uLit * (0.12 * uLens * (0.15 + 0.85 * uNight) + 0.7 * uFlash) * uFar;
  gl_FragColor = vec4(c, 1.0);
}`;

export class LighthouseSystem implements WorldSystem {
  readonly name = "lighthouse";
  private root: THREE.Object3D | null = null;
  private readonly rotors: THREE.Object3D[] = [];
  private phase = 0;
  private period = 12;
  private readonly lensLit: THREE.IUniform<number> = { value: 1 };
  private readonly flash: THREE.IUniform<number> = { value: 0 };
  private readonly lampCol: THREE.IUniform<THREE.Color> = { value: new THREE.Color(1.0, 0.8, 0.52) };
  private held: number | null = null;
  private glow: THREE.Mesh | null = null;
  private readonly position = new THREE.Vector3();
  private readonly lantern = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();

  async init(ctx: EngineContext): Promise<void> {
    const layout = ctx.services.get("layout") as HarbourLayout | undefined;
    const ground = ctx.services.get("ground") as GroundService | undefined;
    const url = (await assetExists(LIGHTHOUSE_URL)) ? LIGHTHOUSE_URL : `${STYLE_C_GLB}/lighthouse_pharos.glb`;
    const gltf = await ctx.assets.gltf(url);
    const root = gltf.scene;
    getHarbourMaterials(ctx).apply(root, { lensLit: this.lensLit });

    const lm = layout?.landmarks.find((l) => l.id === "pharos");
    const [x, ly, z] = lm?.position ?? [0, 0, 0];
    // the layout's landmark height is authored ground level; the height field is only a fallback
    const y = lm ? ly : (ground?.heightAt(x, z) ?? 0);
    root.position.set(x, y, z);
    root.rotation.y = lm?.headingRad ?? 0;
    root.name = "harbour-lighthouse";
    ctx.scene.add(root);
    root.updateMatrixWorld(true);
    this.root = root;

    root.traverse((o) => {
      const n = o.name.toLowerCase();
      if (/(^|_)lens(frame)?$/.test(n)) this.rotors.push(o);
      if (n.endsWith("_lens")) { (o as THREE.Mesh).castShadow = false; }
    });
    const lamp = root.getObjectByName("pharos_lamp") ?? root.getObjectByName("lamp");
    if (lamp) lamp.getWorldPosition(this.lantern);
    else this.lantern.set(x, y + 28, z);
    this.position.set(x, y, z);

    // lantern glow sprite (bloomed)
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 9 }, uFar: { value: 1 }, uLens: ctx.uniforms.uLens, uLit: this.lensLit, uFlash: this.flash, uNight: ctx.uniforms.uNight, uLampCol: this.lampCol },
      vertexShader: GLOW_VERT, fragmentShader: GLOW_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    });
    this.glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    this.glow.position.copy(this.lantern);
    this.glow.frustumCulled = false;
    this.glow.renderOrder = 12;
    ctx.scene.add(this.glow);

    // deterministic start phase from the wall clock, so every viewer sees the same sweep
    this.phase = ((Date.now() / 1000) % this.period) / this.period;
    ctx.services.set("lighthouse", this.service());
  }

  private service(): LighthouseService {
    const sys = { get: () => this };
    return {
      position: this.position,
      lanternPosition: this.lantern,
      sweepAngle: () => sys.get().phase * Math.PI * 2,
      get period() { return sys.get().period; },
      get lit() { return sys.get().lensLit.value > 0.5; },
      setSweep: (s: number) => { if (Number.isFinite(s) && s > 0.5) sys.get().period = s; },
      setLit: (lit: boolean) => { sys.get().lensLit.value = lit ? 1 : 0; },
      setLitLevel: (v: number) => { sys.get().lensLit.value = THREE.MathUtils.clamp(v, 0, 1); },
      hold: (heading: number | null) => { sys.get().held = heading; },
      setLampColor: (c: THREE.ColorRepresentation) => { sys.get().lampCol.value.set(c); },
    };
  }

  update(frame: FrameState, ctx: EngineContext): void {
    this.phase = this.held != null ? (((this.held / (Math.PI * 2)) % 1) + 1) % 1 : (this.phase + frame.delta / this.period) % 1;
    const h = this.phase * Math.PI * 2;
    for (const r of this.rotors) r.rotation.y = h;
    // flash when either beam panel faces the camera (the daytime rhythm read)
    const cam = ctx.camera.position;
    const tx = cam.x - this.lantern.x, tz = cam.z - this.lantern.z;
    const l = Math.hypot(tx, tz) || 1;
    const d = Math.abs((Math.sin(h) * tx + Math.cos(h) * tz) / l);
    this.flash.value = Math.pow(d, 40) * this.lensLit.value;
    if (this.glow) {
      const dist = this.tmp.copy(this.lantern).distanceTo(cam);
      const u = (this.glow.material as THREE.ShaderMaterial).uniforms;
      u.uSize.value = THREE.MathUtils.clamp(dist * 0.02, 1.5, 14);
      // the halo is a distance read: fade it out as the camera comes close to the lantern
      u.uFar.value = THREE.MathUtils.smoothstep(dist, 40, 160);
    }
  }

  dispose(ctx: EngineContext): void {
    if (this.root) ctx.scene.remove(this.root);
    if (this.glow) { ctx.scene.remove(this.glow); this.glow.geometry.dispose(); (this.glow.material as THREE.Material).dispose(); }
    ctx.services.delete("lighthouse");
  }
}
