import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";
import { buildGeometry, chainedKitMaterial, type PartMesh } from "./figure-kit";
import type { V3 } from "./walkways";

/**
 * FLAGS AND BUNTING on land — declared decorative (the chain flagstaffs and the boats' house flags belong to
 * the island and the fleet). Civic flags on the Customs House and the Harbourmaster's bare poles, and strings
 * of bunting across the Customs square. Cloth flutters in the vertex shader, streams downwind and droops in
 * a calm. One draw for all of it.
 */

const BUNT = ["#8E2F24", "#F4F1E8", "#DCA548", "#25486A", "#2F5A4A", "#EDCB4F"];

/** Extra attributes: aHoist (vec3 pivot), aFly (0 hoist … 1 fly end), aKind (0 rigid, 1 pole flag, 2 pennant). */
interface ClothMesh extends PartMesh { hoist: number[]; fly: number[]; phase: number[] }

function push(m: ClothMesh, p: THREE.Vector3, n: THREE.Vector3, col: THREE.Color, kind: number, hoist: THREE.Vector3, fly: number, phase: number): void {
  m.pos.push(p.x, p.y, p.z); m.nor.push(n.x, n.y, n.z); m.col.push(col.r, col.g, col.b); m.part.push(kind);
  m.hoist.push(hoist.x, hoist.y, hoist.z); m.fly.push(fly); m.phase.push(phase);
}

/** A pole flag in its own frame (fly along +x from the hoist, hanging below the truck), coloured per cell. */
function poleFlag(m: ClothMesh, top: THREE.Vector3, L: number, H: number, cell: (u: number, v: number) => string, swallow: boolean, phase: number): void {
  const NX = 8, NY = 4;
  const n = new THREE.Vector3(0, 0, 1);
  for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
    const u0 = i / NX, u1 = (i + 1) / NX, v0 = j / NY, v1 = (j + 1) / NY;
    // swallowtail: cut a V out of the fly end
    const cut = (u: number, v: number) => (swallow && u > 0.7 ? Math.abs(v - 0.5) * 2 < (u - 0.7) / 0.3 * 0.9 ? 1 : 0 : 0);
    if (cut((u0 + u1) / 2, (v0 + v1) / 2)) continue;
    const col = new THREE.Color(cell((u0 + u1) / 2, (v0 + v1) / 2));
    const P = (u: number, v: number) => new THREE.Vector3(top.x + u * L, top.y - v * H, top.z);
    for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]]) push(m, P(u, v), n, col, 1, top, u, phase);
  }
}

export interface FlagSites {
  flagpoles: Array<{ p: V3; h: number }>;
  bunting: Array<{ a: V3; b: V3; sag: number }>;
}

const VERTEX_HEAD = /* glsl */ `
attribute float aPart;
attribute vec3 aHoist;
attribute float aFly;
attribute float aPhase;
uniform float uLifeT;
uniform vec4 uFlagWind;   // xy downwind (x, z), z strength 0..1, w yaw of downwind for pole flags
vec3 flRotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 flagPose(vec3 p, float dir) {
  float w = uFlagWind.z;
  float t = uLifeT * (4.0 + 5.0 * w) + aPhase;
  if (aPart > 0.5 && aPart < 1.5) {
    vec3 q = p - aHoist * (1.0 - dir);
    float u = aFly;
    // a calm lets the flag droop against the pole; a breeze lifts it out
    float droop = (1.0 - smoothstep(0.05, 0.6, w)) * 0.75;
    if (dir < 0.5) {
      q.y -= u * q.x * droop;
      q.x *= 1.0 - droop * 0.45 * u;
      q.z += sin(t - u * 5.0) * (0.08 + 0.22 * w) * u * (1.0 + q.x * 0.15);
      q.y += sin(t * 0.7 - u * 3.0) * 0.05 * u;
    } else {
      q.x += cos(t - u * 5.0) * (0.15 + 0.5 * w) * u;
    }
    q = flRotY(q, uFlagWind.w);
    return aHoist * (1.0 - dir) + q;
  }
  if (aPart > 1.5) {
    // pennants hang from the string; the wind pushes the tips downwind and flicks them
    float k = aFly * (0.12 + 0.42 * w);
    float f = sin(t * 1.3 + aPhase * 3.0) * (0.06 + 0.14 * w) * aFly;
    if (dir < 0.5) {
      p.x += uFlagWind.x * (k + f);
      p.z += uFlagWind.y * (k + f);
      p.y += aFly * w * 0.12;
    }
    return p;
  }
  return p;
}
`;

export class LandFlags {
  readonly mesh: THREE.Mesh;
  readonly uniforms = { uLifeT: { value: 0 }, uFlagWind: { value: new THREE.Vector4(0.8, -0.55, 0.3, 0) } };

  constructor(sites: FlagSites, mats: HarbourMaterials) {
    const m: ClothMesh = { pos: [], nor: [], col: [], part: [], hoist: [], fly: [], phase: [] };
    // civic flags: the Customs House a navy ensign with a cream band; the Harbourmaster a red swallowtail
    sites.flagpoles.forEach((f, i) => {
      const top = new THREE.Vector3(...f.p);
      // (simple two-colour civic pieces, deliberately no national or real signal flag)
      if (i === 0) poleFlag(m, top, 3.2, 1.5, (u, v) => (v < 0.22 ? "#EDE3CC" : u > 0.55 && Math.abs(v - 0.6) < 0.4 * (1 - u) + 0.05 ? "#DCA548" : "#25486A"), true, 0.3);
      else poleFlag(m, top, 3.0, 1.2, (_u, v) => (v < 0.2 || v > 0.8 ? "#F4F1E8" : "#A84A33"), true, 1.7);
    });
    // bunting strings: catenary line (rigid) + alternating triangular pennants
    let ph = 0;
    for (const b of sites.bunting) {
      const A = new THREE.Vector3(...b.a), B = new THREE.Vector3(...b.b);
      const at = (u: number) => A.clone().lerp(B, u).add(new THREE.Vector3(0, -b.sag * 4 * u * (1 - u), 0));
      const N = 12;
      const dark = new THREE.Color("#2A2522");
      for (let k = 0; k < N; k++) {
        const p0 = at(k / N), p1 = at((k + 1) / N);
        const up = new THREE.Vector3(0, 0.03, 0);
        const n = new THREE.Vector3(0, 1, 0);
        for (const p of [p0, p1, p1.clone().add(up), p0, p1.clone().add(up), p0.clone().add(up)]) push(m, p, n, dark, 0, p, 0, 0);
      }
      const len = A.distanceTo(B);
      const count = Math.floor(len / 0.95);
      const t = B.clone().sub(A).setY(0).normalize();
      for (let k = 1; k < count; k++) {
        const u = k / count;
        const p = at(u);
        const col = new THREE.Color(BUNT[(k + ph) % BUNT.length]);
        const l = p.clone().addScaledVector(t, -0.3), r = p.clone().addScaledVector(t, 0.3), tip = p.clone().add(new THREE.Vector3(0, -0.6, 0));
        const n = new THREE.Vector3().crossVectors(t, new THREE.Vector3(0, 1, 0)).normalize();
        const phase = k * 0.7 + ph;
        push(m, l, n, col, 2, p, 0, phase); push(m, r, n, col, 2, p, 0, phase); push(m, tip, n, col, 2, p, 1, phase);
      }
      ph += 2;
    }
    const geo = buildGeometry(m);
    geo.setAttribute("aHoist", new THREE.Float32BufferAttribute(m.hoist, 3));
    geo.setAttribute("aFly", new THREE.Float32BufferAttribute(m.fly, 1));
    geo.setAttribute("aPhase", new THREE.Float32BufferAttribute(m.phase, 1));
    const mat = chainedKitMaterial(mats, "flags", {
      vertexHead: VERTEX_HEAD, vertexPose: "transformed = flagPose(transformed, 0.0);", normalPose: "objectNormal = normalize(flagPose(objectNormal, 1.0));", uniforms: this.uniforms,
    }, THREE.DoubleSide);
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.name = "life-flags";
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
  }

  update(dt: number, moving: boolean, windTo: [number, number], wind: number): void {
    if (moving) this.uniforms.uLifeT.value += dt;
    // reduced motion: the cloth holds a gentle downwind set, no flutter
    this.uniforms.uFlagWind.value.set(windTo[0], windTo[1], wind, Math.atan2(-windTo[1], windTo[0]));
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
