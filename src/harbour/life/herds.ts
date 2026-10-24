import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import type { HarbourMaterials } from "../world/materials";
import { chainedKitMaterial } from "./figure-kit";
import { rng } from "./walkways";

/**
 * HERDS — declared decorative (time of day, season and weather only; never data). The island's animals in ONE
 * instanced draw: goats grazing the pastures (09-L3), cats on the quay copings (09-L7) and the donkey with its
 * hay cart (08-T5 / 09-L9). The kit is `public/harbour/kit/life_beasts.glb` (scripts/harbour/blender/life/beasts.py):
 * every beast's parts are merged into one geometry; an instance draws only its own kind's parts (the others collapse)
 * and the vertex shader poses legs, heads, tails and wheels about each part's pivot.
 *
 * Goats: 2–3 small flocks that graze (head down, a nibble) and amble a few metres at a time, keeping together; at
 * night they stand close and still. Storms (the DEWS wind) only ever take life away: the flock huddles and some
 * go in. Reduced motion: everyone stands still where they are.
 *
 * Cats (09-L7): a few sit on the quay copings by day, looking about with a flick of the tail, and doze there at
 * night, head down. They go in when it storms.
 *
 * The hay cart (08-T5 / 09-L9): a donkey and its two-wheeled cart, heaped with hay (never crates or amphorae: cargo
 * would read as the Mint / the Burn), plying the west lobe's farm road at a walk with a carter at its head, pausing
 * at each end; by day only (off the road at night and in a storm). The road never joins two chain hamlets.
 */

export const BEASTS_URL = "/harbour/kit/life_beasts.glb";
const KINDS = ["goat", "cat", "donkey"] as const;
export type BeastKind = (typeof KINDS)[number];
const KIND_ID: Record<BeastKind, number> = { goat: 0, cat: 1, donkey: 2 };
const PART_ID: Record<string, number> = { body: 0, head: 1, leg_fl: 2, leg_fr: 3, leg_hl: 4, leg_hr: 5, tail: 6, cart: 7, wheels: 8 };
/** Drawn a little larger than life so they read as animals at harbour zoom (the gulls' licence). */
const SCALE: Record<BeastKind, number> = { goat: 1.2, cat: 1.3, donkey: 1.15 };
const CAT_COATS = ["#C98A4B", "#E9E2D6", "#9A8F84", "#B07A48", "#D8C8B0", "#3A3430"];
const GOAT_COATS = ["#F2EEE6", "#EDE7DA", "#E3DACA", "#C9B79C", "#8A6A4C", "#6B5240"];

/** Merge the kit's parts into one geometry: position, normal, colour, aCoat, aBP (part, kind), aPivot. */
export function beastGeometry(gltf: GLTF): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], col: number[] = [], coat: number[] = [], bp: number[] = [], piv: number[] = [];
  gltf.scene.updateMatrixWorld(true);
  const nm = new THREE.Matrix3(), v = new THREE.Vector3();
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    // GLTFLoader strips the '.' from '<beast>.<part>'
    const kind = KINDS.find((k) => mesh.name.startsWith(k));
    if (!kind) return;
    const part = PART_ID[mesh.name.slice(kind.length).replace(/^[._]/, "")];
    if (part === undefined) return;
    const pivot = (mesh.userData.pivot as number[] | undefined) ?? [0, 0, 0];
    const g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
    const P = g.getAttribute("position"), N = g.getAttribute("normal"), C = g.getAttribute("color");
    nm.getNormalMatrix(mesh.matrixWorld);
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(mesh.matrixWorld); pos.push(v.x, v.y, v.z);
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
      col.push(C.getX(i), C.getY(i), C.getZ(i)); coat.push(C.itemSize > 3 ? C.getW(i) : 1);
      bp.push(part, KIND_ID[kind]); piv.push(pivot[0], pivot[1], pivot[2]);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute("aCoat", new THREE.Float32BufferAttribute(coat, 1));
  geo.setAttribute("aBP", new THREE.Float32BufferAttribute(bp, 2));
  geo.setAttribute("aPivot", new THREE.Float32BufferAttribute(piv, 3));
  return geo;
}

const VERTEX_HEAD = /* glsl */ `
attribute float aCoat;
attribute vec2 aBP;          // part id, beast kind of this vertex
attribute vec3 aPivot;
attribute vec4 aHerd;        // x kind, y phase 0..1, z graze 0..1, w gait 0..1
attribute vec4 aHerdB;       // x asleep 0..1, y wheel angle (rad), z -, w -
attribute vec3 aHdTint;
uniform float uHerdT;
vec3 hdRotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 hdRotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 herdPose(vec3 p, float dir) {
  if (abs(aBP.y - aHerd.x) > 0.5) return dir > 0.5 ? p : vec3(0.0, -50.0, 0.0);   // another kind's part
  float part = aBP.x;
  float gait = aHerd.w, graze = aHerd.z, sleep = aHerdB.x;
  float ph = uHerdT * (aHerd.x > 1.5 ? 4.4 : 6.0) + aHerd.y * 6.2831;
  vec3 piv = aPivot * (1.0 - dir);
  if (part > 1.5 && part < 5.5) {
    // legs in diagonal pairs (walk): front-left with hind-right
    float s = (part < 2.5 || part > 4.5) ? 1.0 : -1.0;
    p = piv + hdRotX(p - piv, 0.42 * gait * sin(ph) * s);
  } else if (part > 0.5 && part < 1.5) {
    // the head: down to graze (with a nibble), up and looking about otherwise; a cat's nods off at night
    float down = graze * 1.0 + 0.07 * graze * sin(uHerdT * 3.3 + aHerd.y * 9.0) + sleep * 0.6 - 0.1 * gait;
    float look = 0.4 * sin(uHerdT * 0.37 + aHerd.y * 13.0) * (1.0 - graze) * (1.0 - sleep);
    p = piv + hdRotY(hdRotX(p - piv, down), look);
  } else if (part > 5.5 && part < 6.5) {
    p = piv + hdRotY(p - piv, 0.45 * sin(uHerdT * 1.4 + aHerd.y * 7.0) * (1.0 - sleep));   // a tail flick
  } else if (part > 7.5) {
    p = piv + hdRotX(p - piv, aHerdB.y);                                                  // cart wheels roll
  }
  if (dir < 0.5) p.y += 0.02 * gait * abs(sin(ph));
  return p;
}
`;
const VERTEX_POSE = /* glsl */ `transformed = herdPose(transformed, 0.0);`;
const NORMAL_POSE = /* glsl */ `objectNormal = normalize(herdPose(objectNormal, 1.0));`;
const COLOR_POSE = /* glsl */ `
  #ifdef USE_COLOR
  vColor.rgb *= mix(vec3(1.0), aHdTint, aCoat);
  #endif
`;

/** Ground tests against the built island (the height field). */
export interface HerdGround {
  heightAt(x: number, z: number): number;
}

function inPoly(x: number, z: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) inside = !inside;
  }
  return inside;
}

interface Beast {
  kind: BeastKind;
  x: number; y: number; z: number; yaw: number;
  /** visibility rank (storms, tier) */
  rank: number;
  // goats
  flock: number;
  /** seconds left in this state */
  t: number;
  tx: number; tz: number;
  graze: number; gait: number;
  walking: boolean;
  r: () => number;
  visible: boolean;
}

export interface CatSeat { x: number; y: number; z: number; yaw: number }

interface Flock { poly: ReadonlyArray<readonly [number, number]>; cx: number; cz: number; hx: number; hz: number }

export class Herds {
  readonly mesh: THREE.InstancedMesh;
  readonly uniforms = { uHerdT: { value: 0 } };
  private readonly beasts: Beast[] = [];
  private readonly flocks: Flock[] = [];
  private readonly herd: THREE.InstancedBufferAttribute;
  private readonly herdB: THREE.InstancedBufferAttribute;

  /** the cart's road: xz polyline, cumulative length; where along it (m), which way, pause left (s), wheel angle */
  private readonly road: { pts: number[]; cum: number[]; s: number; dir: number; pause: number; wheel: number } | null;
  private readonly carterPose = { x: 0, y: 0, z: 0, yaw: 0, gait: 0 };

  constructor(geo: THREE.BufferGeometry, mats: HarbourMaterials, private readonly ground: HerdGround, pastures: ReadonlyArray<ReadonlyArray<readonly [number, number]>>, cats: readonly CatSeat[] = [], cartway: ReadonlyArray<readonly number[]> = [], seed = 61) {
    const r = rng(seed);
    // goats: a small flock per pasture (up to three), placed on open, gentle ground inside it
    pastures.slice(0, 3).forEach((poly, f) => {
      let cx = 0, cz = 0;
      for (const [x, z] of poly) { cx += x; cz += z; }
      cx /= poly.length; cz /= poly.length;
      this.flocks.push({ poly, cx, cz, hx: cx, hz: cz });
      const n = 5 + Math.floor(r() * 3);
      for (let k = 0; k < n; k++) {
        const br = rng(seed * 811 + f * 97 + k * 13);
        const b: Beast = { kind: "goat", x: cx, y: 0, z: cz, yaw: br() * Math.PI * 2, rank: br(), flock: f, t: br() * 8, tx: cx, tz: cz, graze: 1, gait: 0, walking: false, r: br, visible: true };
        for (let tries = 0; tries < 12; tries++) {
          const x = cx + (br() - 0.5) * 12, z = cz + (br() - 0.5) * 12;
          if (this.goodGround(x, z, poly)) { b.x = x; b.z = z; break; }
        }
        b.tx = b.x; b.tz = b.z;
        b.y = ground.heightAt(b.x, b.z);
        this.beasts.push(b);
      }
    });
    // cats: on their copings
    cats.forEach((c, k) => {
      const br = rng(seed * 499 + k * 31);
      this.beasts.push({ kind: "cat", x: c.x, y: c.y, z: c.z, yaw: c.yaw, rank: br(), flock: -1, t: 0, tx: c.x, tz: c.z, graze: 0, gait: 0, walking: false, r: br, visible: true });
    });
    // the donkey and its hay cart, part way along the farm road
    if (cartway.length >= 2) {
      const pts: number[] = [], cum: number[] = [0];
      cartway.forEach((v, k) => {
        pts.push(v[0], v[2]);
        if (k) cum.push(cum[k - 1] + Math.hypot(v[0] - cartway[k - 1][0], v[2] - cartway[k - 1][2]));
      });
      this.road = { pts, cum, s: cum[cum.length - 1] * 0.3, dir: 1, pause: 0, wheel: 0 };
      this.beasts.push({ kind: "donkey", x: pts[0], y: 0, z: pts[1], yaw: 0, rank: 0, flock: -1, t: 0, tx: 0, tz: 0, graze: 0, gait: 0, walking: true, r: rng(seed * 7), visible: true });
    } else this.road = null;
    const N = Math.max(1, this.beasts.length);
    const herd = new Float32Array(N * 4), herdB = new Float32Array(N * 4), tint = new Float32Array(N * 3);
    const c = new THREE.Color();
    this.beasts.forEach((b, i) => {
      herd[i * 4] = KIND_ID[b.kind]; herd[i * 4 + 1] = r();
      const coats = b.kind === "cat" ? CAT_COATS : GOAT_COATS;
      if (b.kind === "donkey") c.set("#8C7F72"); else c.set(coats[Math.floor(r() * coats.length)]);
      c.toArray(tint, i * 3);
    });
    this.herd = new THREE.InstancedBufferAttribute(herd, 4); this.herd.setUsage(THREE.DynamicDrawUsage);
    this.herdB = new THREE.InstancedBufferAttribute(herdB, 4); this.herdB.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aHerd", this.herd);
    geo.setAttribute("aHerdB", this.herdB);
    geo.setAttribute("aHdTint", new THREE.InstancedBufferAttribute(tint, 3));
    // two-sided: thin ears, tails and the cart's open boards
    const mat = chainedKitMaterial(mats, "herds", { vertexHead: VERTEX_HEAD, vertexPose: VERTEX_POSE, normalPose: NORMAL_POSE, colorPose: COLOR_POSE, uniforms: this.uniforms }, THREE.DoubleSide);
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.name = "life-herds";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = this.beasts.length;
  }

  get count(): number { return this.beasts.length; }

  /** Open, gentle ground inside the pasture: no wall, no building, no cliff within a metre. */
  private goodGround(x: number, z: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
    if (!inPoly(x, z, poly)) return false;
    const h = this.ground.heightAt(x, z);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (Math.abs(this.ground.heightAt(x + dx, z + dz) - h) > 0.55) return false;
    return true;
  }

  /**
   * @param night 0 day … 1 night (the flock stands close and still)
   * @param share the weather's and the tier's share of life (storms: some goats go in, the rest huddle)
   * @param moving false under reduced motion: everyone stands where they are
   */
  update(dt: number, night: number, share: number, moving: boolean, cartOut = false): void {
    if (moving) this.uniforms.uHerdT.value += dt;
    const huddle = Math.max(night > 0.6 ? 1 : 0, Math.min(1, (1 - share) * 2));
    const H = this.herd.array as Float32Array, HB = this.herdB.array as Float32Array;
    const e = this.mesh.instanceMatrix.array as Float32Array;
    // each flock's home wanders slowly round its pasture (where the grass is today)
    if (moving) for (const f of this.flocks) {
      f.hx += (f.cx - f.hx) * dt * 0.01;
      f.hz += (f.cz - f.hz) * dt * 0.01;
    }
    for (let i = 0; i < this.beasts.length; i++) {
      const b = this.beasts[i];
      b.visible = b.kind === "donkey" ? cartOut && share > 0.6 : b.rank < 0.35 + 0.65 * share;
      if (moving && b.visible && b.kind === "goat") this.stepGoat(b, dt, huddle);
      if (b.kind === "donkey") { this.stepCart(b, moving && b.visible ? dt : 0); HB[i * 4 + 1] = this.road!.wheel; }
      const gait = moving ? b.gait : 0;
      H[i * 4 + 2] = b.kind === "goat" ? (moving ? b.graze * (1 - huddle * 0.8) : 0.4) : 0;
      H[i * 4 + 3] = gait;
      // asleep: goats lower their heads a little at night; a cat dozes, head down, tail still
      HB[i * 4] = b.kind === "cat" ? THREE.MathUtils.smoothstep(night, 0.4, 0.8) : night > 0.6 ? 0.35 : 0;
      const s = b.visible ? SCALE[b.kind] : 0;
      const c = Math.cos(b.yaw) * s, sn = Math.sin(b.yaw) * s, o = i * 16;
      e[o] = c; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0;
      e[o + 4] = 0; e[o + 5] = s; e[o + 6] = 0; e[o + 7] = 0;
      e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0;
      e[o + 12] = b.x; e[o + 13] = b.y; e[o + 14] = b.z; e[o + 15] = 1;
    }
    this.herd.needsUpdate = true; this.herdB.needsUpdate = true;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  /** The carter's place this frame (at the donkey's head, on its left), or null when the cart is off the road. */
  carter(): { x: number; y: number; z: number; yaw: number; gait: number } | null {
    const b = this.beasts.find((o) => o.kind === "donkey");
    if (!b || !b.visible) return null;
    const c = Math.cos(b.yaw), sn = Math.sin(b.yaw), P = this.carterPose;
    // donkey-local (0.7 left, 0.6 ahead) → world (local +x maps to (cos, -sin), +z to (sin, cos))
    P.x = b.x + c * 0.7 + sn * 0.6 * SCALE.donkey; P.z = b.z - sn * 0.7 + c * 0.6 * SCALE.donkey;
    P.y = this.ground.heightAt(P.x, P.z); P.yaw = b.yaw; P.gait = b.gait;
    return P;
  }

  /** Walk the cart along its road (≈ 0.9 m/s), turning back at each end after a pause. */
  private stepCart(b: Beast, dt: number): void {
    const R = this.road!, L = R.cum[R.cum.length - 1];
    if (R.pause > 0) { R.pause -= dt; b.gait = Math.max(0, b.gait - dt * 2); }
    else if (dt > 0) {
      b.gait = Math.min(1, b.gait + dt * 1.5);
      const v = 0.9 * b.gait * dt;
      R.s += R.dir * v;
      R.wheel += v / (0.46 * SCALE.donkey);
      if (R.s <= 0 || R.s >= L) { R.s = Math.min(L, Math.max(0, R.s)); R.dir = -R.dir; R.pause = 20 + b.r() * 25; }
    }
    // place it on the road; the donkey leads, so it looks the way it goes
    let k = 1;
    while (k < R.cum.length - 1 && R.cum[k] < R.s) k++;
    const t = (R.s - R.cum[k - 1]) / Math.max(1e-6, R.cum[k] - R.cum[k - 1]);
    const x0 = R.pts[(k - 1) * 2], z0 = R.pts[(k - 1) * 2 + 1], x1 = R.pts[k * 2], z1 = R.pts[k * 2 + 1];
    b.x = x0 + (x1 - x0) * t; b.z = z0 + (z1 - z0) * t;
    b.y = this.ground.heightAt(b.x, b.z);
    const ty = Math.atan2((x1 - x0) * R.dir, (z1 - z0) * R.dir);
    // first placement: facing the road; after that it turns gently (round in the yard at each end, while it waits)
    b.yaw = b.t === 0 ? ty : b.yaw + Math.atan2(Math.sin(ty - b.yaw), Math.cos(ty - b.yaw)) * Math.min(1, dt * 1.5);
    b.t = 1;
  }

  private stepGoat(b: Beast, dt: number, huddle: number): void {
    const f = this.flocks[b.flock];
    b.t -= dt;
    if (b.walking) {
      const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
      b.gait = Math.min(1, b.gait + dt * 2);
      b.graze = Math.max(0, b.graze - dt * 1.5);
      if (d < 0.15 || b.t <= 0) { b.walking = false; b.t = 6 + b.r() * 16; }
      else {
        const v = 0.38 * b.gait * dt;
        b.x += (dx / d) * Math.min(v, d); b.z += (dz / d) * Math.min(v, d);
        b.y = this.ground.heightAt(b.x, b.z);
        const ty = Math.atan2(dx, dz);
        b.yaw += Math.atan2(Math.sin(ty - b.yaw), Math.cos(ty - b.yaw)) * Math.min(1, dt * 2.5);
      }
    } else {
      b.gait = Math.max(0, b.gait - dt * 2.5);
      b.graze = Math.min(1, b.graze + dt * 0.8);
      if (b.t <= 0) {
        // amble a few metres, staying near the flock (closer in a storm or at night)
        const R = 7 - 4.5 * huddle;
        for (let tries = 0; tries < 6; tries++) {
          const a = b.r() * Math.PI * 2, rr = Math.sqrt(b.r()) * R;
          const x = f.hx + Math.cos(a) * rr, z = f.hz + Math.sin(a) * rr;
          if (Math.hypot(x - b.x, z - b.z) < 9 && this.goodGround(x, z, f.poly)) { b.tx = x; b.tz = z; b.walking = huddle < 0.99 || Math.hypot(x - b.x, z - b.z) > R; break; }
        }
        b.t = b.walking ? 14 : 8 + b.r() * 14;
      }
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
