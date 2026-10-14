import * as THREE from "three";
import type { LightsService } from "../lights/lights-service";
import type { HarbourMaterials } from "../world/materials";
import { box, ball, buildGeometry, chainedKitMaterial, newPartMesh, posedDepthMaterial, prism } from "./figure-kit";
import { buildWalkGraph, rng, spawnWalker, stepWalker, type Walker, type WalkGraph, type Walkways } from "./walkways";

/**
 * TOWNSFOLK — declared decorative. Little stylised figures strolling the quays, lanes and stairs, standing in
 * twos and threes at the quay edge and on the squares, sitting on the benches. They never carry anything
 * (research/04 §7: crates would read as mint/burn). Fewer at night, and some of those carry a lantern.
 *
 * One InstancedMesh (one draw). Fixed slot per figure; hidden figures get a zero matrix. The CPU only moves
 * walkers along the walk graph; the gait (legs, knees, arms, bob), idle gestures and sitting are posed in
 * the vertex shader.
 */

// part ids (vertex attribute aPart)
const P_THIGH_L = 0, P_THIGH_R = 1, P_COAT = 2, P_ARM_L = 3, P_ARM_R = 4, P_HEAD = 5, P_HAT = 6, P_LANTERN = 7, P_SHIN_L = 8, P_SHIN_R = 9;
const HIP_Y = 0.86, KNEE_Y = 0.45, SHOULDER_Y = 1.4, LEG_X = 0.095, ARM_X = 0.285;

function figureGeometry(): THREE.BufferGeometry {
  const m = newPartMesh();
  // legs: thigh + shin (with a boot) each side; white so the instance colour sets the cloth
  for (const [s, thigh, shin] of [[-1, P_THIGH_L, P_SHIN_L], [1, P_THIGH_R, P_SHIN_R]] as const) {
    const x = s * LEG_X;
    box(m, x - 0.072, KNEE_Y - 0.02, -0.08, x + 0.072, HIP_Y + 0.02, 0.08, "#FFFFFF", thigh);
    box(m, x - 0.066, 0.1, -0.075, x + 0.066, KNEE_Y + 0.01, 0.075, "#FFFFFF", shin);
    box(m, x - 0.07, 0, -0.085, x + 0.07, 0.11, 0.13, "#55504A", shin); // boot (stays dark)
  }
  // coat / dress: a tapered hexagonal body, slightly flattened front to back
  prism(m, 0, 0, 0.66, 1.46, 0.27, 0.19, 6, "#FFFFFF", P_COAT, 0.78);
  // shoulders: a flatter cap so the silhouette reads as a body, not a cone
  box(m, -0.25, 1.36, -0.12, 0.25, 1.47, 0.12, "#FFFFFF", P_COAT);
  // arms (the instance tints them a shade darker than the coat) + hands
  for (const [s, part] of [[-1, P_ARM_L], [1, P_ARM_R]] as const) {
    const x = s * ARM_X;
    box(m, x - 0.055, 0.84, -0.06, x + 0.055, SHOULDER_Y + 0.05, 0.06, "#FFFFFF", part);
  }
  ball(m, 0, 1.63, 0.0, 0.15, "#FFFFFF", P_HEAD, 1.08);
  // hat: brim + crown (collapsed when the figure goes bareheaded)
  prism(m, 0, 0, 1.71, 1.735, 0.21, 0.21, 8, "#FFFFFF", P_HAT);
  prism(m, 0, 0, 1.73, 1.84, 0.13, 0.115, 8, "#FFFFFF", P_HAT);
  // lantern: hangs from the right hand (collapsed unless lit)
  const lx = ARM_X;
  box(m, lx - 0.06, 0.6, -0.06, lx + 0.06, 0.75, 0.06, "#FFD9A0", P_LANTERN);
  box(m, lx - 0.075, 0.75, -0.075, lx + 0.075, 0.79, 0.075, "#2A2522", P_LANTERN);
  box(m, lx - 0.075, 0.57, -0.075, lx + 0.075, 0.6, 0.075, "#2A2522", P_LANTERN);
  return buildGeometry(m);
}

const VERTEX_HEAD = /* glsl */ `
attribute float aPart;
attribute vec3 aTint;
attribute vec3 aSkin;
attribute vec4 aHat;
attribute vec3 aLegs;
attribute vec4 aAnim;        // x phase, y gait 0..1, z sit 0/1, w lantern 0/1
uniform float uLifeT;
varying float vLfLantern;

vec3 lfRotX(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x, p.y * c - p.z * s, p.y * s + p.z * c); }
vec3 lfRotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }

// pose a point (dir = 0) or a normal (dir = 1: pivots ignored)
vec3 lfPose(vec3 p, float dir) {
  float part = aPart;
  float gait = aAnim.y, sit = aAnim.z, lantern = aAnim.w;
  float ph = uLifeT * 5.6 + aAnim.x * 6.2831;
  float sw = sin(ph);
  float stand = (1.0 - gait) * (1.0 - sit);
  vec3 piv;
  if (part < 1.5 || (part > 7.5 && part < 9.5)) {
    bool left = part < 0.5 || (part > 7.5 && part < 8.5);
    float s = left ? 1.0 : -1.0;
    float thigh = -0.48 * gait * sw * s - 1.45 * sit;
    float knee = 0.62 * gait * max(0.0, cos(ph) * s) + 1.32 * sit;
    float x = left ? -${LEG_X.toFixed(3)} : ${LEG_X.toFixed(3)};
    if (part > 7.5) {
      piv = vec3(x, ${KNEE_Y.toFixed(3)}, 0.0) * (1.0 - dir);
      p = piv + lfRotX(p - piv, knee);
    }
    piv = vec3(x, ${HIP_Y.toFixed(3)}, 0.0) * (1.0 - dir);
    p = piv + lfRotX(p - piv, thigh);
  } else if (part > 2.5 && part < 4.5 || part > 6.5 && part < 7.5) {
    bool left = part < 3.5;
    float s = left ? 1.0 : -1.0;
    float a = 0.42 * gait * sw * s;
    // conversation: now and then a hand comes up
    a -= stand * 0.85 * pow(max(0.0, sin(uLifeT * 0.55 + aAnim.x * 17.0 + (left ? 0.0 : 2.1))), 8.0);
    a -= sit * 0.45;
    if (!left) a = mix(a, -0.12 + 0.08 * gait * sw, lantern);   // the lantern arm swings little
    float x = left ? -${ARM_X.toFixed(3)} : ${ARM_X.toFixed(3)};
    piv = vec3(x, ${SHOULDER_Y.toFixed(3)}, 0.0);
    if (part > 6.5) {
      // the lantern hangs plumb from the hand: translate with the hand, never rotate
      vec3 hand = vec3(x, 0.8, 0.0);
      p += (piv + lfRotX(hand - piv, a) - hand) * (1.0 - dir);
    } else {
      piv *= 1.0 - dir;
      p = piv + lfRotX(p - piv, a);
    }
  } else if (part > 4.5 && part < 6.5) {
    float yaw = 0.45 * sin(uLifeT * 0.31 + aAnim.x * 11.0) * stand + 0.15 * sin(uLifeT * 0.23 + aAnim.x * 5.0) * sit;
    piv = vec3(0.0, 1.5, 0.0) * (1.0 - dir);
    p = piv + lfRotY(p - piv, yaw);
  }
  if (dir < 0.5) {
    p.y += gait * 0.032 * (0.5 - 0.5 * cos(2.0 * ph)) - sit * 0.31;
    p.z += sit * 0.06;
    // hats and lanterns that are not there collapse inside the head / the hand
    if (part > 5.5 && part < 6.5 && aHat.a < 0.5) p = vec3(0.0, 1.6, 0.0);
    if (part > 6.5 && part < 7.5 && lantern < 0.5) p = vec3(${ARM_X.toFixed(3)}, 0.9, 0.0);
  }
  return p;
}
`;

const VERTEX_POSE = /* glsl */ `
  transformed = lfPose(transformed, 0.0);
  vLfLantern = (aPart > 6.5 && aPart < 7.5) ? aAnim.w : 0.0;
`;
const NORMAL_POSE = /* glsl */ `objectNormal = normalize(lfPose(objectNormal, 1.0));`;
const COLOR_POSE = /* glsl */ `
  #ifdef USE_COLOR
  if (aPart < 1.5 || (aPart > 7.5 && aPart < 9.5)) vColor.rgb *= aLegs;
  else if (aPart < 2.5) vColor.rgb *= aTint;
  else if (aPart < 4.5) vColor.rgb *= aTint * 0.82;
  else if (aPart < 5.5) vColor.rgb *= aSkin;
  else if (aPart < 6.5) vColor.rgb *= aHat.rgb;
  #endif
`;
const FRAG_HEAD = /* glsl */ `varying float vLfLantern;\nuniform float uLifeLamp;`;
const EMISSIVE = /* glsl */ `totalEmissiveRadiance += vec3(1.0, 0.52, 0.18) * vLfLantern * uLifeLamp;`;

const COATS = ["#2E4B6B", "#A84A33", "#D9A441", "#2F5A4A", "#7A2A22", "#E9E4DE", "#C2453A", "#AB9BC4", "#E39A7E", "#3B4B5E", "#6E7F4A", "#E2D4B4"];
const LEGS = ["#2B2E36", "#3B3A33", "#4A4236", "#5B4A3A", "#34404C", "#6B5E4B"];
const SKIN = ["#E3BE9E", "#C99A78", "#8D5B3E", "#F0CDB0", "#A87452", "#DDB08C"];
const HATS = ["#2A2522", "#3B4B5E", "#D8C08A", "#7A2A22", "#E9E4DE", "#2F5A4A"];

type ActorKind = "walk" | "stand" | "sit";
/** Share of night walkers who carry a lantern. */
const LANTERN_SHARE = 0.5;
interface Actor {
  kind: ActorKind;
  /** visibility rank: shown while rank < density */
  rank: number;
  /** night-only lantern carrier (walkers) */
  lanternRank: number;
  scale: number;
  walker?: Walker;
  rng?: () => number;
  /** bloomed lantern sprite (lights service), lantern carriers only */
  light?: number;
  lightOn?: boolean;
  x: number; y: number; z: number; yaw: number;
  visible: boolean;
}

export interface FolkCaps { walkers: number; standers: number }

/** Tests against the built island (the ground height field), so nobody walks or stands inside a house. */
export interface FolkGround {
  /** a walk node inside a building / wall */
  blocked(x: number, y: number, z: number): boolean;
  /** open, level ground for a standing group */
  open(x: number, y: number, z: number, radius: number): boolean;
  /** a bench seat really stands here (not buried in a terrace) */
  seat(x: number, y: number, z: number): boolean;
  /** top of the quay coping at (x, z), or null where there is none (water stairs, bollards) */
  seatHeight(x: number, z: number, fx: number, fz: number): number | null;
}

export class Townsfolk {
  readonly mesh: THREE.InstancedMesh;
  private readonly actors: Actor[] = [];
  private readonly graph: WalkGraph;
  private readonly anim: THREE.InstancedBufferAttribute;
  readonly uniforms = { uLifeT: { value: 0 }, uLifeLamp: { value: 0 } };
  private lastDensity = -1;

  private readonly lightPos = new THREE.Vector3();

  constructor(walk: Walkways, mats: HarbourMaterials, caps: FolkCaps, ground?: FolkGround, focus?: [number, number], private readonly lights?: LightsService, seed = 7) {
    this.graph = buildWalkGraph(walk.paths, { blocked: ground ? (x, y, z) => ground.blocked(x, y, z) : undefined, focus });
    const r = rng(seed);
    // walkers
    for (let i = 0; i < caps.walkers; i++) {
      const wr = rng(seed * 977 + i * 131);
      const w = spawnWalker(this.graph, wr);
      this.actors.push({ kind: "walk", rank: r(), lanternRank: r(), scale: 0.94 + r() * 0.12, walker: w, rng: wr, x: w.x, y: w.y, z: w.z, yaw: w.yaw, visible: true });
    }
    // standers: twos and threes at the quay edge (facing the water, turned to each other) and on the squares
    // edge spots stand 1.15 m from the quay edge: test a tighter ring there than on the squares
    const isOpen = (s: { kind: string; p: [number, number, number] }) => !ground || ground.open(s.p[0], s.p[1], s.p[2], s.kind === "edge" ? 0.45 : 1.3);
    const edges = walk.spots.filter((s) => s.kind === "edge" && isOpen(s));
    const squares = walk.spots.filter((s) => s.kind === "square" && isOpen(s));
    let n = 0;
    const groups: Array<{ p: [number, number, number]; h: number; kind: "edge" | "square" }> = [];
    for (let k = 0; k < edges.length && groups.length < caps.standers; k += 3) groups.push({ ...edges[k], kind: "edge" });
    for (const s of squares) groups.push({ ...s, kind: "square" });
    for (const g of groups) {
      if (n >= caps.standers) break;
      const size = g.kind === "square" ? 3 : r() < 0.5 ? 1 : 2;
      const rank = r();
      for (let j = 0; j < size && n < caps.standers; j++, n++) {
        let x = g.p[0], z = g.p[2], yaw: number;
        if (g.kind === "edge") {
          // side by side along the edge, each turned a little toward the other
          const ox = Math.cos(g.h), oz = -Math.sin(g.h);
          const off = size === 1 ? 0 : (j - 0.5) * 0.9;
          x += ox * off; z += oz * off;
          yaw = g.h + (size === 1 ? 0 : (j === 0 ? 0.5 : -0.5));
        } else {
          const a = (j / size) * Math.PI * 2 + r();
          x += Math.sin(a) * 0.62; z += Math.cos(a) * 0.62;
          yaw = a + Math.PI;     // facing the circle's centre
        }
        this.actors.push({ kind: "stand", rank: rank * 0.9 + r() * 0.1, lanternRank: 1, scale: 0.94 + r() * 0.12, x, y: g.p[1], z, yaw, visible: true });
      }
    }
    // quay-edge sitters: on the coping, facing the water, legs over the edge (about half the edge spots the
    // standing groups leave free); the seat height comes from the island itself
    if (ground) for (let k = 1; k < edges.length; k++) {
      if (k % 3 === 0 || r() < 0.5) continue;
      const e = edges[k];
      const fx = Math.sin(e.h), fz = Math.cos(e.h);
      const two = r() < 0.4, rank = r();
      for (let j = 0; j < (two ? 2 : 1); j++) {
        const off = two ? (j - 0.5) * 0.7 : 0;
        const x = e.p[0] + fx * 0.8 + Math.cos(e.h) * off, z = e.p[2] + fz * 0.8 - Math.sin(e.h) * off;
        const seat = ground.seatHeight(x, z, fx, fz);
        if (seat === null) continue;
        this.actors.push({ kind: "sit", rank, lanternRank: 1, scale: 0.95 + r() * 0.08, x, y: seat - 0.55, z, yaw: e.h + (two ? (j ? -0.15 : 0.15) : 0), visible: true });
      }
    }
    // sitters: one or two per bench
    for (const b of walk.benches) {
      if (ground && !ground.seat(b.p[0], b.p[1], b.p[2])) continue;
      const two = r() < 0.55;
      const rank = r() * 0.8;
      const rx = Math.cos(b.h), rz = -Math.sin(b.h);
      for (let j = 0; j < (two ? 2 : 1); j++) {
        const off = two ? (j - 0.5) * 0.75 : (r() - 0.5) * 0.6;
        this.actors.push({ kind: "sit", rank, lanternRank: 1, scale: 0.95 + r() * 0.08, x: b.p[0] + rx * off, y: b.p[1], z: b.p[2] + rz * off, yaw: b.h + (two ? (j ? -0.2 : 0.2) : 0), visible: true });
      }
    }

    // lantern carriers get a small bloomed glow from the lights service (a sprite, no ground pool: it moves)
    if (lights) for (const a of this.actors) {
      if (a.kind !== "walk" || a.lanternRank >= LANTERN_SHARE) continue;
      a.light = lights.add("riding", [a.x, a.y + 0.7, a.z], "#FFB866");
      a.lightOn = false;
      lights.setOn(a.light, false);
    }
    const geo = figureGeometry();
    const N = this.actors.length;
    const tint = new Float32Array(N * 3), skin = new Float32Array(N * 3), hat = new Float32Array(N * 4), legs = new Float32Array(N * 3), anim = new Float32Array(N * 4);
    const c = new THREE.Color();
    this.actors.forEach((a, i) => {
      c.set(COATS[Math.floor(r() * COATS.length)]); c.toArray(tint, i * 3);
      c.set(SKIN[Math.floor(r() * SKIN.length)]); c.toArray(skin, i * 3);
      c.set(LEGS[Math.floor(r() * LEGS.length)]); c.toArray(legs, i * 3);
      c.set(HATS[Math.floor(r() * HATS.length)]); c.toArray(hat, i * 4); hat[i * 4 + 3] = r() < 0.55 ? 1 : 0;
      anim[i * 4] = r(); anim[i * 4 + 1] = a.kind === "walk" ? 1 : 0; anim[i * 4 + 2] = a.kind === "sit" ? 1 : 0;
    });
    geo.setAttribute("aTint", new THREE.InstancedBufferAttribute(tint, 3));
    geo.setAttribute("aSkin", new THREE.InstancedBufferAttribute(skin, 3));
    geo.setAttribute("aHat", new THREE.InstancedBufferAttribute(hat, 4));
    geo.setAttribute("aLegs", new THREE.InstancedBufferAttribute(legs, 3));
    this.anim = new THREE.InstancedBufferAttribute(anim, 4);
    this.anim.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute("aAnim", this.anim);

    const hooks = {
      vertexHead: VERTEX_HEAD, vertexPose: VERTEX_POSE, normalPose: NORMAL_POSE, colorPose: COLOR_POSE,
      fragmentHead: FRAG_HEAD, emissive: EMISSIVE, uniforms: this.uniforms,
    };
    const mat = chainedKitMaterial(mats, "folk", hooks);
    this.mesh = new THREE.InstancedMesh(geo, mat, N);
    this.mesh.name = "life-townsfolk";
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    // a small real shadow grounds each figure (one shadow-pass draw); the depth twin walks with them
    this.mesh.castShadow = true;
    this.mesh.customDepthMaterial = posedDepthMaterial("folk", hooks);
    this.mesh.receiveShadow = true;
    for (let i = 0; i < N; i++) this.write(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  get count(): number { return this.actors.length; }

  private write(i: number): void {
    const a = this.actors[i], e = this.mesh.instanceMatrix.array as Float32Array, o = i * 16;
    const s = a.visible ? a.scale : 0;
    const c = Math.cos(a.yaw) * s, sn = Math.sin(a.yaw) * s;
    e[o] = c; e[o + 1] = 0; e[o + 2] = -sn; e[o + 3] = 0;
    e[o + 4] = 0; e[o + 5] = s; e[o + 6] = 0; e[o + 7] = 0;
    e[o + 8] = sn; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0;
    e[o + 12] = a.x; e[o + 13] = a.y; e[o + 14] = a.z; e[o + 15] = 1;
  }

  /**
   * @param density share of townsfolk about (hour curve × quality share)
   * @param night 0 day … 1 night (lanterns)
   * @param moving false under reduced motion: everyone stands where they are
   */
  update(dt: number, density: number, night: number, lamp: number, moving: boolean): void {
    if (moving) this.uniforms.uLifeT.value += dt;
    this.uniforms.uLifeLamp.value = lamp;
    const anim = this.anim.array as Float32Array;
    const lanternShare = night > 0.55 ? LANTERN_SHARE : 0;
    let dirtyAnim = false;
    for (let i = 0; i < this.actors.length; i++) {
      const a = this.actors[i];
      const vis = a.rank < density;
      if (a.kind === "walk") {
        const w = a.walker!;
        if (vis && moving) stepWalker(this.graph, w, dt, a.rng!);
        a.x = w.x; a.y = w.y; a.z = w.z; a.yaw = w.yaw;
        const gait = moving ? w.gait : 0;
        const lantern = a.lanternRank < lanternShare ? 1 : 0;
        if (anim[i * 4 + 1] !== gait || anim[i * 4 + 3] !== lantern) { anim[i * 4 + 1] = gait; anim[i * 4 + 3] = lantern; dirtyAnim = true; }
        a.visible = vis;
        this.write(i);
        if (a.light !== undefined && this.lights) {
          const on = vis && lantern === 1;
          if (on !== a.lightOn) { this.lights.setOn(a.light, on); a.lightOn = on; }
          if (on) {
            // the hand: 0.285 m to the right, lantern glass at ≈ 0.68 m
            const c = Math.cos(a.yaw), sn = Math.sin(a.yaw), s = a.scale;
            this.lightPos.set(a.x + c * 0.285 * s, a.y + 0.7 * s, a.z - sn * 0.285 * s);
            this.lights.setPosition(a.light, this.lightPos);
          }
        }
      } else if (a.visible !== vis || this.lastDensity < 0) {
        a.visible = vis;
        this.write(i);
      }
    }
    this.lastDensity = density;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (dirtyAnim) this.anim.needsUpdate = true;
  }

  dispose(): void {
    if (this.lights) for (const a of this.actors) if (a.light !== undefined) this.lights.remove(a.light);
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.customDepthMaterial?.dispose();
  }
}
