import * as THREE from "three";
import { mergeStaticMeshes } from "../engine/static-merge";
import type { EngineContext, FrameState, WorldSystem } from "../engine/types";
import type { HarbourLayout } from "../layout/types";
import { acquireFxTextures, type FxTextures } from "../ocean/textures";
import { PharosFire } from "../beam/fire";
import { getBeamUniforms, type BeamUniforms } from "../beam/uniforms";
import type { GroundService } from "./ground";
import { getHarbourMaterials } from "./materials";

export const LIGHTHOUSE_URL = "/harbour/lighthouse.glb";

/**
 * THE PHAROS OF ALEXANDRIA (D15/D16): the three-tier tower (scripts/harbour/blender/pharos), the beacon fire
 * in its tholos and the polished bronze mirror that throws the beam.
 *
 * 'lighthouse' service for the beam owner and the UI.
 * Heading convention = layout headings: the beam points along (sin h, 0, cos h). The mirror node is turned
 * so its +Z (the beam) points along that world heading whatever the tower's own rotation.
 */
export interface LighthouseService {
  /** Tower foot (world). */
  readonly position: THREE.Vector3;
  /** Fire / mirror centre: the beam origin (world). */
  readonly lanternPosition: THREE.Vector3;
  /** Current beam heading, radians. */
  sweepAngle(): number;
  /** Seconds per full revolution (PSI rhythm). */
  readonly period: number;
  readonly lit: boolean;
  /** The fire's flicker (≈0.75..1.2): the beam and the mirror breathe with it. */
  readonly flicker?: number;
  setSweep(seconds: number): void;
  setLit(lit: boolean): void;
  /** 0..1 lantern level, for a fade instead of a cut (readings binder). */
  setLitLevel?(v: number): void;
  /** Reduced motion: hold the beam at a fixed heading (radians); null resumes the sweep. */
  hold?(heading: number | null): void;
  /** Lantern glow colour (PSI 3-step lamp). */
  setLampColor?(c: THREE.ColorRepresentation): void;
}

/** layout.pharos (P6 shared contract), when the island has placed the islet. */
interface PharosPlacement { position: [number, number, number]; rotationY: number }
interface LifeLike { readonly wind: number; readonly windTo: readonly [number, number] }
interface MotionLike { readonly reduced: boolean }

/** The steady lamp (PSI 3-step 0); amber / red are tints relative to it. */
const STEADY_LAMP = new THREE.Color(1.0, 0.86, 0.62);

export class LighthouseSystem implements WorldSystem {
  readonly name = "lighthouse";
  private root: THREE.Object3D | null = null;
  private mirror: THREE.Object3D | null = null;
  private phase = 0;
  private period = 12;
  private level = 1;
  private readonly lampCol = STEADY_LAMP.clone();
  private held: number | null = null;
  private fire: PharosFire | null = null;
  private fx: FxTextures | null = null;
  private readonly light = new THREE.PointLight(0xff9a40, 0, 120, 1.15);
  /** Firelight thrown up onto the crowning statue (the dome hides it from the fire; the plume carries it). */
  private readonly upLight = new THREE.PointLight(0xff9a40, 0, 26, 2);
  private readonly statueAt = new THREE.Vector3();
  private ember: THREE.MeshBasicMaterial | null = null;
  private mirrorMat: THREE.MeshStandardMaterial | null = null;
  private readonly position = new THREE.Vector3();
  private readonly lantern = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private bu: BeamUniforms | null = null;

  async init(ctx: EngineContext): Promise<void> {
    // the fire's light joins the scene before the first frame, so no material recompiles when the tower lands
    this.light.castShadow = false;
    this.light.name = "pharos-fire-light";
    this.upLight.castShadow = false;
    this.upLight.name = "pharos-statue-light";
    ctx.scene.add(this.light, this.upLight);
    // deterministic start phase from the wall clock, so every viewer sees the same sweep
    this.phase = ((Date.now() / 1000) % this.period) / this.period;
    ctx.services.set("lighthouse", this.service());

    const layout = ctx.services.get("layout") as (HarbourLayout & { pharos?: PharosPlacement }) | undefined;
    const ground = ctx.services.get("ground") as GroundService | undefined;
    const gltf = await ctx.assets.gltf(LIGHTHOUSE_URL);
    const root = gltf.scene;
    getHarbourMaterials(ctx).apply(root);

    const lm = layout?.landmarks.find((l) => l.id === "pharos");
    const place = layout?.pharos;
    const [x, ly, z] = place?.position ?? lm?.position ?? [0, 0, 0];
    // the layout's height is authored ground level; the height field is only a fallback
    const y = place || lm ? ly : (ground?.heightAt(x, z) ?? 0);
    root.position.set(x, y, z);
    root.rotation.y = place?.rotationY ?? lm?.headingRad ?? 0;
    root.name = "harbour-lighthouse";
    ctx.scene.add(root);
    root.updateMatrixWorld(true);
    this.root = root;
    this.position.set(x, y, z);
    this.bu = getBeamUniforms(ctx);
    this.bu.uPharosAxis.value.set(x, y, z, 0);

    const node = (n: string) => root.getObjectByName(n);
    this.mirror = node("mirror") ?? null;
    const at = (n: string, fallbackY: number) => {
      const o = node(n);
      return o ? o.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(x, y + fallbackY, z);
    };
    this.lantern.copy(at("lantern", 88));
    this.statueAt.copy(at("smoke_emitter", 96));

    // ember bed + polished mirror: own materials (the port leaves unknown names alone)
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const name = mesh.material.name;
      if (name.startsWith("hb_fire")) {
        this.ember ??= new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 1.6, 0.4), fog: false });
        mesh.material = this.ember;
        mesh.castShadow = false;
      } else if (name.startsWith("hb_mirror")) {
        this.mirrorMat ??= new THREE.MeshStandardMaterial({
          color: new THREE.Color("#D9A35A"), metalness: 0.85, roughness: 0.22, emissive: new THREE.Color(1, 0.6, 0.25), emissiveIntensity: 0,
        });
        this.mirrorMat.name = "hb_pharos_mirror";
        mesh.material = this.mirrorMat;
        mesh.castShadow = false;
      }
    });

    // the tower and its crowning statue never move (the mirror does): one draw, one shadow draw
    const still = ["tower", "statue"].map(node).filter((o): o is THREE.Mesh => !!(o as THREE.Mesh | undefined)?.isMesh);
    if (still.length === 2 && still[0].parent === still[1].parent && still[0].parent) mergeStaticMeshes(still, still[0].parent, "pharos");

    this.fx = acquireFxTextures(ctx);
    this.fire = new PharosFire(at("fire_emitter", 87.5), at("smoke_emitter", 96), this.lantern, this.fx.noise, this.light);
    ctx.scene.add(this.fire.group);
  }

  private service(): LighthouseService {
    const sys = { get: () => this };
    return {
      position: this.position,
      lanternPosition: this.lantern,
      sweepAngle: () => sys.get().phase * Math.PI * 2,
      get period() { return sys.get().period; },
      get lit() { return sys.get().level > 0.5; },
      get flicker() { return sys.get().fire?.flicker ?? 1; },
      setSweep: (s: number) => { if (Number.isFinite(s) && s > 0.5) sys.get().period = s; },
      setLit: (lit: boolean) => { sys.get().level = lit ? 1 : 0; },
      setLitLevel: (v: number) => { sys.get().level = THREE.MathUtils.clamp(v, 0, 1); },
      hold: (heading: number | null) => { sys.get().held = heading; },
      setLampColor: (c: THREE.ColorRepresentation) => { sys.get().lampCol.set(c); },
    };
  }

  update(frame: FrameState, ctx: EngineContext): void {
    this.phase = this.held != null ? (((this.held / (Math.PI * 2)) % 1) + 1) % 1 : (this.phase + frame.delta / this.period) % 1;
    const h = this.phase * Math.PI * 2;
    if (!this.root) return;
    // the mirror throws the beam along world heading h (its node sits under the tower's own rotation)
    if (this.mirror) this.mirror.rotation.y = h - this.root.rotation.y;

    const life = ctx.services.get("life") as LifeLike | undefined;
    const reduced = (ctx.services.get("motion") as MotionLike | undefined)?.reduced ?? false;
    const night = ctx.uniforms.uNight.value;
    // arrival kindling (camera lane, via the beam service): the fire grows to its true level
    const intro = (ctx.services.get("beam") as { introScale?: number } | undefined)?.introScale ?? 1;
    const level = this.level * intro;
    if (this.fire) {
      const vh = ctx.renderer.domElement.height || 1000;
      this.fire.update(frame.delta, { level, lamp: this.lampCol, windTo: life?.windTo ?? [0.84, -0.54], wind: life?.wind ?? 0.35, reduced }, ctx.uniforms, ctx.camera, vh);
    }
    const fl = this.fire?.flicker ?? 1;
    const tint = this.tmp.set(this.lampCol.r / STEADY_LAMP.r, this.lampCol.g / STEADY_LAMP.g, this.lampCol.b / STEADY_LAMP.b);
    // the statue's uplight stands on the viewer's side of the dome, so the gilding always catches the fire
    {
      const cam = ctx.camera.position;
      const dx = cam.x - this.statueAt.x, dz = cam.z - this.statueAt.z, l = Math.hypot(dx, dz) || 1;
      this.upLight.position.set(this.statueAt.x + (dx / l) * 5.5, this.statueAt.y + 0.5, this.statueAt.z + (dz / l) * 5.5);
      this.upLight.color.setRGB(1.0, 0.58 * tint.y, 0.24 * tint.z);
      this.upLight.intensity = level * fl * 60 * night;
    }
    if (this.ember) this.ember.color.setRGB(3 * tint.x, 0.85 * tint.y, 0.14 * tint.z).multiplyScalar(level * fl * (0.6 + 0.6 * night));
    // 05-P5 firelight down the tower, triton and Helios flares (kit shader, beam-light-glsl.ts hbPharosFire)
    if (this.bu) {
      this.bu.uPharosFire.value.set(1.0 * tint.x, 0.6 * tint.y, 0.26 * tint.z, THREE.MathUtils.smoothstep(night, 0.15, 0.8));
      const k = level * fl;
      this.bu.uPharosFire.value.x *= k; this.bu.uPharosFire.value.y *= k; this.bu.uPharosFire.value.z *= k;
    }

    // the mirror: it glows with the fire it gathers, and flashes when it swings to face the viewer (the
    // day read of the rhythm: a sun glint once per revolution)
    if (this.mirrorMat) {
      const cam = ctx.camera.position;
      const tx = cam.x - this.lantern.x, tz = cam.z - this.lantern.z;
      const l = Math.hypot(tx, tz) || 1;
      const facing = Math.max(0, (Math.sin(h) * tx + Math.cos(h) * tz) / l);
      const glint = Math.pow(facing, 24);
      this.mirrorMat.emissive.setRGB(1.0, 0.45 * tint.y, 0.14 * tint.z);
      // polished bronze catching the fire (warm, flickering), not a lit white disc
      this.mirrorMat.emissiveIntensity = level * (fl * fl * (0.15 + 0.5 * night) + glint * (6 + 6 * (1 - night)));
    }
  }

  dispose(ctx: EngineContext): void {
    if (this.root) ctx.scene.remove(this.root);
    if (this.fire) { ctx.scene.remove(this.fire.group); this.fire.dispose(); }
    ctx.scene.remove(this.light, this.upLight);
    this.light.dispose();
    this.upLight.dispose();
    this.ember?.dispose();
    this.mirrorMat?.dispose();
    this.fx?.release();
    ctx.services.delete("lighthouse");
  }
}
