import * as THREE from "three";
import type { WorldUniforms } from "../engine/uniforms";
import type { LoadedPlot } from "./assemble";
import { pieceCentres, toWorld } from "./assemble";
import { Glints, glowMaterial, Smoke } from "./fx";
import type { WorkerSlot } from "./workers";

/**
 * THE MINT (D19). Everything that moves scales with `level` (civic flows: mint activity, swollen when the
 * 24 h net is positive):
 *   chimneys  smoke rate + density (coal smoke, darker than the town's wood smoke)
 *   furnaces  the glow of the mouths and coal beds, flickering
 *   presses   the stamping tempo (6 … 60 strikes a minute), each strike a gold glint on the die
 *   wheel     the waterwheel's speed
 *   workers   how many hands bustle round the yard loop
 * Banked (stale / no reading): the furnaces fall to embers, the presses and the wheel stop, the chimneys go quiet.
 */

const PRESS_DROP = 0.3, PRESS_TURN = 0.7;
export const MINT_WORKERS = 12;

interface Press { node: THREE.Object3D; base: THREE.Vector3; phase: number; glint: number; last: number }

export class MintWorks {
  readonly smoke: Smoke;
  readonly glints: Glints;
  readonly glow: THREE.IUniform<number> = { value: 0.5 };
  readonly group = new THREE.Group();
  /** World positions of the furnace mouths (for lights). */
  readonly furnaces: THREE.Vector3[] = [];
  /** A working lamp over each press (for lights). */
  readonly pressLamps: THREE.Vector3[] = [];
  private readonly presses: Press[] = [];
  private readonly wheel: THREE.Object3D | null;
  private readonly path: THREE.Vector3[] = [];
  private readonly pathLen: number[] = [];
  private total = 0;
  private level = 0;
  private primed = false;
  private t = 0;
  private walkT = 0;
  private readonly glowMat: THREE.MeshStandardMaterial;
  private heading = 0;
  private readonly under = new THREE.Color();
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly p: LoadedPlot, noise: THREE.Texture) {
    const { root, nodes, spec } = p;
    this.heading = p.plot.rotationY;
    // chimneys: emitters a little above each mouth
    const chimneys = spec.nodes.filter((n) => /^chimney_\d+$/.test(n.name)).map((n) => toWorld(root, [n.origin[0], n.origin[1] + 0.6, n.origin[2]]));
    this.smoke = new Smoke(chimneys, 16, noise, 29);
    this.smoke.mesh.name = "mint-smoke";

    // furnace glow: its own level (a furnace burns by day too)
    this.glowMat = glowMaterial(this.glow, "#FF7A2A", "#2A1A12");
    const fg = nodes.get("furnace_glow") as THREE.Mesh | undefined;
    if (fg?.isMesh) {
      fg.material = this.glowMat;
      fg.castShadow = false;
      // one light per few mouths (the lights service pools them on the floor)
      const c = pieceCentres(fg);
      for (let i = 0; i < c.length; i += Math.max(1, Math.round(c.length / 4))) this.furnaces.push(c[i]);
    }

    // presses + a glint on each die (just in front of the press, at the bench)
    const glintAt: THREE.Vector3[] = [];
    for (let i = 0; ; i++) {
      const node = nodes.get(`press_${i}`);
      if (!node) break;
      this.presses.push({ node, base: node.position.clone(), phase: i * 0.37, glint: 0, last: 0 });
      // the flash shows in the press's arch: at the arcade opening in front of the press (the die itself sits deep inside)
      glintAt.push(toWorld(root, [node.position.x + 2.2, node.position.y - 2.6, 20.5]));
      this.pressLamps.push(toWorld(root, [node.position.x + 1.6, node.position.y - 0.4, node.position.z + 1.2]));
    }
    this.glints = new Glints(glintAt);
    this.glints.mesh.name = "mint-glints";
    this.wheel = nodes.get("wheel") ?? null;

    // the workers' loop (closed polyline in the plot frame)
    const pts = spec.nodes.find((n) => n.name === "worker_path")?.points_gltf ?? [];
    for (let i = 0; i + 2 < pts.length; i += 3) this.path.push(toWorld(root, [pts[i], pts[i + 1], pts[i + 2]]));
    for (let i = 0; i < this.path.length; i++) {
      this.pathLen.push(this.total);
      if (i + 1 < this.path.length) this.total += this.path[i].distanceTo(this.path[i + 1]);
    }
    this.group.name = "mint-fx";
    this.group.add(this.smoke.mesh, this.glints.mesh);
  }

  /** `level` 0..~1.4 (0 = banked). */
  update(dt: number, level: number, banked: boolean, moving: boolean, windTo: readonly [number, number], wind: number, u: WorldUniforms): void {
    // ease, so a new reading swells or calms the works over a few seconds
    // (the first reading lands at once: the works are already running when the harbour opens)
    this.level = this.primed ? this.level + (level - this.level) * (1 - Math.exp(-dt / 2.5)) : level;
    this.primed ||= level > 0 || banked;
    const L = this.level;
    if (moving) this.t += dt;
    const night = u.uNight.value;

    // furnaces: banked → a dull ember glow
    const fl = moving ? 1 + 0.12 * Math.sin(this.t * 7.1) + 0.07 * Math.sin(this.t * 12.7 + 1.1) + 0.05 * Math.sin(this.t * 3.3) : 1;
    this.glow.value = (banked ? 0.25 : 0.6 + 2.6 * L) * (0.7 + 1.1 * night) * fl;

    // chimneys
    const s = Math.min(L, 1.4);
    this.smoke.update(moving ? dt : 0, {
      rate: 0.05 + 0.08 * s, rise: 12 + 20 * s, size0: 2.0 + 0.8 * s, size1: 7 + 8 * s, drift: 26 + 16 * s,
      opacity: banked ? 0 : 0.2 + 0.42 * Math.min(1, s), darkness: 0.5 + 0.22 * Math.min(1, s),
      under: this.under.setRGB(1.0, 0.45, 0.15).multiplyScalar(0.12 * night * Math.min(1, s)),
    }, windTo, wind, u);

    // presses: tempo 0.1 … 1 Hz; banked = still, raised
    const hz = banked ? 0 : 0.1 + 0.85 * Math.min(1, L);
    this.presses.forEach((p, i) => {
      if (moving && hz > 0) p.phase += dt * hz * (0.92 + 0.08 * i);
      const f = p.phase - Math.floor(p.phase);
      // slow wind-up (screw turns back, ram lifts), then a sharp strike at f ≈ 0.85
      const strike = f < 0.8 ? 1 - THREE.MathUtils.smoothstep(f, 0.0, 0.8) : THREE.MathUtils.smoothstep(f, 0.8, 0.86);
      p.node.position.y = p.base.y - PRESS_DROP * strike * (hz > 0 ? 1 : 0);
      p.node.rotation.y = PRESS_TURN * (strike * 2 - 1) * (hz > 0 ? 1 : 0);
      const struck = Math.floor(p.phase + 0.14);
      if (struck !== p.last) { p.last = struck; if (hz > 0) p.glint = 1; }
      p.glint = Math.max(0, p.glint - dt * 2.2);
      this.glints.set(i, p.glint * p.glint);
    });
    this.glints.commit(1.8 + 0.8 * night, 4 + 10 * night);

    // waterwheel: the race runs whatever the works do, but the wheel is only engaged when the mint works
    if (this.wheel && moving) this.wheel.rotation.z -= dt * (banked ? 0 : 0.18 + 0.9 * Math.min(1.3, L));
  }

  /** Fill worker slots: hands walking the yard loop, the busier the more. */
  workers(out: WorkerSlot[], dt: number, moving: boolean): void {
    const n = out.length;
    if (moving) this.walkT += dt;
    const busy = Math.round(n * Math.min(1, 0.15 + 0.85 * this.level));
    const tmp = this.tmp;
    for (let i = 0; i < n; i++) {
      const w = out[i];
      w.visible = this.total > 0 && i < busy;
      if (!w.visible) continue;
      // half walk the loop, half work at the bench in front of the presses
      if (i % 3 === 2 && this.presses[i % this.presses.length]) {
        const pr = this.presses[(i / 3 | 0) % this.presses.length];
        toWorld(this.p.root, [pr.base.x + ((i * 0.7) % 1.6) - 0.8, 0.3, pr.base.z + 2.2], tmp);
        w.x = tmp.x; w.y = tmp.y; w.z = tmp.z; w.h = this.heading + Math.PI; w.gait = 0; w.hammer = 1; w.tempo = 0.25 + 0.7 * Math.min(1, this.level);
        continue;
      }
      const speed = 1.1 + 0.5 * Math.min(1, this.level);
      let d = ((this.walkT * speed + (i / n) * this.total) % this.total + this.total) % this.total;
      let k = 0;
      while (k + 1 < this.pathLen.length && this.pathLen[k + 1] <= d) k++;
      const a = this.path[k], b = this.path[Math.min(k + 1, this.path.length - 1)];
      const seg = Math.max(1e-3, a.distanceTo(b));
      d -= this.pathLen[k];
      tmp.copy(a).lerp(b, Math.min(1, d / seg));
      w.x = tmp.x; w.y = tmp.y; w.z = tmp.z; w.h = Math.atan2(b.x - a.x, b.z - a.z); w.gait = 1; w.hammer = 0; w.tempo = 1;
    }
  }

  dispose(): void { this.smoke.dispose(); this.glints.dispose(); this.glowMat.dispose(); }
}
