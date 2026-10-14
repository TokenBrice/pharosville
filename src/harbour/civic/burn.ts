import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";
import type { LoadedPlot } from "./assemble";
import { toWorld } from "./assemble";
import { Embers, Flames, glowMaterial, Smoke } from "./fx";

/**
 * THE BURN (D19): coins go down the chute into the great fire bowl; the kiln smokes. Fire size, embers, the
 * coin rate and the plume scale with `level` (civic flows: burn activity, swollen when the 24 h net is
 * negative). When the Burn dominates its plume turns dark and climbs; banked (stale / no reading) the bowl
 * falls to a red bed of embers, no coins, no smoke.
 */

const COINS = 10;

export class BurnFurnace {
  readonly group = new THREE.Group();
  readonly flames: Flames;
  readonly embers: Embers;
  readonly smoke: Smoke;
  readonly glow: THREE.IUniform<number> = { value: 0.5 };
  /** The bowl's world position (for the light). */
  readonly bowl: THREE.Vector3;
  private readonly core: THREE.Object3D | null;
  private readonly coreScale = new THREE.Vector3(1, 1, 1);
  private readonly glowMat: THREE.MeshStandardMaterial;
  private readonly coins: THREE.InstancedMesh;
  private readonly chute: [THREE.Vector3, THREE.Vector3];
  private readonly coinT = new Float32Array(COINS).fill(-1);
  private level = 0;
  private primed = false;
  private dom = 0;
  private spawn = 0;
  private readonly m4 = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private readonly under = new THREE.Color();
  private readonly e = new THREE.Euler();
  private t = 0;

  constructor(p: LoadedPlot, noise: THREE.Texture) {
    const { root, nodes, spec } = p;
    const at = (name: string, dy = 0) => {
      const n = spec.nodes.find((x) => x.name === name);
      return n ? toWorld(root, [n.origin[0], n.origin[1] + dy, n.origin[2]]) : null;
    };
    this.bowl = at("fire_core") ?? toWorld(root, [0, 5, 0]);
    this.glowMat = glowMaterial(this.glow, "#FF6A22", "#3A1A10");
    this.core = nodes.get("fire_core") ?? null;
    if (this.core) this.coreScale.copy(this.core.scale);
    for (const name of ["fire_core", "grate_glow"]) {
      const m = nodes.get(name) as THREE.Mesh | undefined;
      if (m?.isMesh) { m.material = this.glowMat; m.castShadow = false; }
    }
    // the flames stand in the bowl, the embers fly from its lip
    this.flames = new Flames(this.bowl.clone().add(new THREE.Vector3(0, 0.6, 0)), noise, 9, 53);
    this.flames.mesh.name = "burn-flames";
    this.embers = new Embers(at("fire_emitter") ?? this.bowl, 90, 61);
    this.embers.points.name = "burn-embers";
    this.smoke = new Smoke([at("smoke_emitter", 0.5) ?? this.bowl.clone().setY(this.bowl.y + 18)], 26, noise, 83);
    this.smoke.mesh.name = "burn-smoke";

    // coins down the chute: little gold discs
    const disc = new THREE.CylinderGeometry(0.32, 0.32, 0.07, 10);
    const gold = new THREE.MeshStandardMaterial({ color: new THREE.Color("#E3B04A"), metalness: 0.85, roughness: 0.3, emissive: new THREE.Color("#7A4A10"), emissiveIntensity: 0.4 });
    gold.name = "hb_civic_coin";
    this.coins = new THREE.InstancedMesh(disc, gold, COINS);
    this.coins.name = "burn-coins";
    this.coins.frustumCulled = false;
    for (let i = 0; i < COINS; i++) this.coins.setMatrixAt(i, this.zero);
    const a = at("coin_chute"), b = at("coin_chute_end");
    this.chute = [a ?? this.bowl.clone(), b ?? this.bowl.clone()];
    this.group.name = "burn-fx";
    this.group.add(this.flames.mesh, this.embers.points, this.smoke.mesh, this.coins);
  }

  /**
   * @param level 0..~1.4 burn work level (0 = banked)
   * @param dominance -1 (the Burn dominates) … +1
   */
  update(dt: number, level: number, dominance: number, banked: boolean, moving: boolean, windTo: readonly [number, number], wind: number,
    u: WorldUniforms, camera: THREE.PerspectiveCamera, viewportH: number): void {
    const k = this.primed ? 1 - Math.exp(-dt / 2.5) : 1;
    this.level += (level - this.level) * k;
    this.dom += (dominance - this.dom) * k;
    this.primed ||= level > 0 || banked;
    const L = this.level, night = u.uNight.value;
    const burnDom = Math.max(0, -this.dom);
    if (moving) this.t += dt;
    const t = this.t;
    const fl = moving ? 1 + 0.1 * Math.sin(t * 8.3) + 0.06 * Math.sin(t * 14.1 + 0.7) : 1;

    // the fire: banked = a low red bed
    const fire = banked ? 0.12 : 0.3 + 0.75 * Math.min(1.4, L);
    this.flames.update(dt, fire, 1.9 + 1.5 * Math.min(1.4, L), night, moving);
    this.embers.update(dt, banked ? 0.08 : 0.25 + 0.8 * Math.min(1.4, L), 1.3 + 0.8 * L, 9 + 14 * L, windTo, wind, camera, viewportH, night, moving);
    this.glow.value = (banked ? 0.35 : 0.8 + 2.2 * Math.min(1.4, L)) * (0.7 + 1.1 * night) * fl;
    if (this.core) {
      // the modelled flame is only the glowing bed under the live flames (the cards carry the fire itself)
      const sy = banked ? 0.12 : 0.18 + 0.12 * Math.min(1.4, L);
      this.core.scale.set(this.coreScale.x, this.coreScale.y * sy * fl, this.coreScale.z);
    }

    // the plume: white-grey at a balanced burn, a dark climbing column when the Burn dominates
    const s = Math.min(1.4, L);
    this.smoke.update(moving ? dt : 0, {
      rate: 0.04 + 0.06 * s, rise: 20 + 22 * s + 20 * burnDom, size0: 3.2 + 1.5 * burnDom, size1: 12 + 10 * s + 9 * burnDom, drift: 34 + 24 * s,
      opacity: banked ? 0 : 0.26 + 0.34 * Math.min(1, s) + 0.18 * burnDom, darkness: 0.3 + 0.6 * burnDom,
      under: this.under.setRGB(1.0, 0.4, 0.12).multiplyScalar(0.1 * night * Math.min(1, s)),
    }, windTo, wind, u);

    // coins: one every 1/rate s while the burn works
    const rate = banked ? 0 : 0.3 + 2.4 * Math.min(1.3, L);
    if (moving && rate > 0) {
      this.spawn += dt * rate;
      while (this.spawn >= 1) {
        this.spawn -= 1;
        const free = this.coinT.findIndex((x) => x < 0);
        if (free >= 0) this.coinT[free] = 0;
      }
    }
    const [a, b] = this.chute;
    for (let i = 0; i < COINS; i++) {
      let ct = this.coinT[i];
      if (ct < 0) { this.coins.setMatrixAt(i, this.zero); continue; }
      if (moving) ct = this.coinT[i] = ct + dt;
      // 1.6 s down the trough, then a 0.5 s fall into the bowl
      if (ct < 1.6) this.v.copy(a).lerp(b, ct / 1.6).setY(a.y + (b.y - a.y) * (ct / 1.6) + 0.12);
      else if (ct < 2.1) { const f = (ct - 1.6) / 0.5; this.v.copy(b).lerp(this.bowl, f); this.v.y = b.y + (this.bowl.y + 0.8 - b.y) * f * f; }
      else { this.coinT[i] = -1; this.coins.setMatrixAt(i, this.zero); continue; }
      this.q.setFromEuler(this.e.set(ct * 9, ct * 3, 0));
      this.coins.setMatrixAt(i, this.m4.compose(this.v, this.q, this.s.set(1, 1, 1)));
    }
    this.coins.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.flames.dispose(); this.embers.dispose(); this.smoke.dispose(); this.glowMat.dispose();
    this.coins.geometry.dispose(); (this.coins.material as THREE.Material).dispose();
  }
}
