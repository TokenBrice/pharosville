import * as THREE from "three";
import type { HarbourMaterials } from "../world/materials";

/**
 * Tiny low-poly geometry helpers for the life layer (townsfolk, gulls, flags), plus the one trick every life
 * material uses: CHAIN the harbour kit material (palette patterns, height-field AO, cloud shadows, lamp pools,
 * moonlight lift) and add a vertex pose on top, so the little lives are lit exactly like the island.
 */

export interface PartMesh { pos: number[]; nor: number[]; col: number[]; part: number[] }

export const newPartMesh = (): PartMesh => ({ pos: [], nor: [], col: [], part: [] });

const linear = (hex: string) => new THREE.Color(hex); // three converts sRGB hex to the linear working space

function tri(m: PartMesh, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, col: THREE.Color, part: number, n?: THREE.Vector3): void {
  const nn = n ?? new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
  for (const v of [a, b, c]) {
    m.pos.push(v.x, v.y, v.z); m.nor.push(nn.x, nn.y, nn.z); m.col.push(col.r, col.g, col.b); m.part.push(part);
  }
}

function quad(m: PartMesh, a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, col: THREE.Color, part: number): void {
  tri(m, a, b, c, col, part); tri(m, a, c, d, col, part);
}

/** Axis-aligned box from min to max corner. */
export function box(m: PartMesh, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, hex: string | THREE.Color, part: number): void {
  const col = typeof hex === "string" ? linear(hex) : hex;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  quad(m, V(x0, y0, z1), V(x1, y0, z1), V(x1, y1, z1), V(x0, y1, z1), col, part); // +z
  quad(m, V(x1, y0, z0), V(x0, y0, z0), V(x0, y1, z0), V(x1, y1, z0), col, part); // -z
  quad(m, V(x1, y0, z1), V(x1, y0, z0), V(x1, y1, z0), V(x1, y1, z1), col, part); // +x
  quad(m, V(x0, y0, z0), V(x0, y0, z1), V(x0, y1, z1), V(x0, y1, z0), col, part); // -x
  quad(m, V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0), col, part); // +y
  quad(m, V(x0, y0, z0), V(x1, y0, z0), V(x1, y0, z1), V(x0, y0, z1), col, part); // -y
}

/** Tapered n-gon prism around the y axis (flat face forward), capped. `sz` squashes depth. */
export function prism(m: PartMesh, cx: number, cz: number, y0: number, y1: number, r0: number, r1: number, n: number, hex: string, part: number, sz = 1): void {
  const col = linear(hex);
  const at = (k: number, r: number, y: number) => {
    const a = ((k + 0.5) / n) * Math.PI * 2;
    return new THREE.Vector3(cx + Math.sin(a) * r, y, cz + Math.cos(a) * r * sz);
  };
  for (let k = 0; k < n; k++) {
    quad(m, at(k, r0, y0), at(k + 1, r0, y0), at(k + 1, r1, y1), at(k, r1, y1), col, part);
    tri(m, new THREE.Vector3(cx, y1, cz), at(k, r1, y1), at(k + 1, r1, y1), col, part);
    tri(m, new THREE.Vector3(cx, y0, cz), at(k + 1, r0, y0), at(k, r0, y0), col, part);
  }
}

/** Low-poly ball (icosahedron, detail 0), flat-shaded. */
export function ball(m: PartMesh, cx: number, cy: number, cz: number, r: number, hex: string, part: number, sy = 1): void {
  const g = new THREE.IcosahedronGeometry(r, 0); // polyhedra are non-indexed already
  const p = g.getAttribute("position");
  const col = linear(hex);
  for (let i = 0; i < p.count; i += 3) {
    const v = [0, 1, 2].map((k) => new THREE.Vector3(p.getX(i + k) + cx, p.getY(i + k) * sy + cy, p.getZ(i + k) + cz));
    tri(m, v[0], v[1], v[2], col, part);
  }
  g.dispose();
}

export function buildGeometry(m: PartMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(m.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(m.nor, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(m.col, 3));
  g.setAttribute("aPart", new THREE.Float32BufferAttribute(m.part, 1));
  return g;
}

export interface LifeShaderHooks {
  /** GLSL declarations (attributes, uniforms, functions) for the vertex shader. */
  vertexHead: string;
  /** Runs after begin_vertex: may rewrite `transformed`. */
  vertexPose: string;
  /** Runs after beginnormal_vertex: may rewrite `objectNormal`. */
  normalPose?: string;
  /** Runs after color_vertex: may rewrite `vColor`. */
  colorPose?: string;
  fragmentHead?: string;
  /** Replaces the emissivemap chunk's tail (may add to totalEmissiveRadiance). */
  emissive?: string;
  uniforms: Record<string, THREE.IUniform>;
}

/**
 * A kit-lit material with a custom vertex pose. The pose runs before the kit's own varyings are taken, so
 * the AO / lamp pools / patterns see the posed world position.
 */
export function chainedKitMaterial(mats: HarbourMaterials, key: string, hooks: LifeShaderHooks, side: THREE.Side = THREE.FrontSide): THREE.MeshStandardMaterial {
  const base = mats.kit({ side });
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0, vertexColors: true, side });
  m.name = `hb_life_${key}`;
  m.onBeforeCompile = (shader, renderer) => {
    Object.assign(shader.uniforms, hooks.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${hooks.vertexHead}`)
      .replace("#include <beginnormal_vertex>", `#include <beginnormal_vertex>\n${hooks.normalPose ?? ""}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${hooks.vertexPose}`)
      .replace("#include <color_vertex>", `#include <color_vertex>\n${hooks.colorPose ?? ""}`);
    base.onBeforeCompile(shader, renderer);
    if (hooks.fragmentHead) shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${hooks.fragmentHead}`);
    if (hooks.emissive) shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>\n${hooks.emissive}`);
  };
  m.customProgramCacheKey = () => `hb_life_${key}_${base.customProgramCacheKey()}`;
  return m;
}

/** The shadow-pass twin of a posed life material (same pose, so shadows walk with their owners). */
export function posedDepthMaterial(key: string, hooks: LifeShaderHooks): THREE.MeshDepthMaterial {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, hooks.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${hooks.vertexHead}`)
      .replace("#include <begin_vertex>", `#include <begin_vertex>\n${hooks.vertexPose}`);
  };
  m.customProgramCacheKey = () => `hb_life_depth_${key}`;
  return m;
}
