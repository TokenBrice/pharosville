import * as THREE from "three";
import type { EngineContext } from "../engine/types";
import type { HarbourLayout, LayoutLight, Vec2 } from "../layout/types";
import { flattenKit, type KitPiece } from "./kit";
import type { HarbourMaterials } from "./materials";

/**
 * DEV STAND-IN ISLAND (until the island agent ships public/harbour/island.glb).
 * Lays style C's kit GLBs (p1/style-c/glb) along the v1/v2 layout: a flat-shaded terrain from the coast /
 * bay polygons (the grey-box terrain_h port), quay walls round the bay, piers from the pier segments,
 * a town, trees, lamps, props. Everything is instanced per (kit piece, material) — ~40 draws.
 * Not art: it exists so the material/light/post port can be judged on the real kit before island.glb.
 */

export const STYLE_C_GLB = "/agents/2026-10-13-pharosville-reboot/p1/style-c/glb";

// ------------------------------------------------------------------ small deterministic helpers
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(x: number, y: number, s = 0): number {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((y | 0) + s * 7919, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h ^= h >>> 13;
  return ((h >>> 0) % 100000) / 100000;
}
function vnoise(x: number, y: number, s = 0): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function inside(x: number, z: number, poly: Vec2[]): boolean {
  let ins = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi + 1e-12) + xi) ins = !ins;
  }
  return ins;
}
function polyDist(x: number, z: number, poly: Vec2[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz + 1e-9)));
    d = Math.min(d, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return d;
}


/**
 * Stand-in terrain height (grey-box terrain_h, generalised): quay level along the bay, an amphitheatre
 * rising away from the water in terraces, a cliff edge on the outer coast, and every raised landmark
 * (layout y > quay) lifted onto its own knoll. Underwater skirt outside the coast / inside the bay.
 */
export function makeTerrainHeight(layout: HarbourLayout) {
  const coast = layout.island.coast, bay = layout.island.bay;
  const quayY = (layout as { quayY?: number }).quayY ?? 2.3;
  const knolls = layout.landmarks.filter((l) => l.position[1] > quayY + 1.5)
    .map((l) => ({ x: l.position[0], z: l.position[2], y: l.position[1], r: Math.max(18, l.footprint * 2.2) }));
  return (x: number, z: number): { h: number; dBay: number; dSea: number } => {
    const inCoast = inside(x, z, coast), inBay = inside(x, z, bay);
    const dBay = polyDist(x, z, bay), dSea = polyDist(x, z, coast);
    if (!inCoast || inBay) {
      const d = !inCoast ? dSea : dBay;
      // inside the bay the quay walls stand 1 m proud of the edge: keep the quay level up to them, then drop
      if (inBay && inCoast && d < 0.9) return { h: quayY, dBay: -dBay, dSea };
      return { h: -Math.min(7, (inBay ? 3.5 : 0.6) + d * 0.9), dBay: inBay ? -dBay : dBay, dSea: !inCoast ? -dSea : dSea };
    }
    let h = quayY + 30 * smooth(16, 200, dBay);
    if (h > 5) h = 5 + Math.round((h - 5) / 4) * 4 * 0.85 + (h - 5) * 0.15;
    h *= 0.35 + 0.65 * smooth(0, 22, dSea);
    for (const k of knolls) {
      const g = Math.exp(-((x - k.x) ** 2 + (z - k.z) ** 2) / (k.r * k.r));
      h = h * (1 - g) + k.y * g;
    }
    // gentle undulation so slopes facet
    h += (vnoise(x * 0.05, z * 0.05, 3) - 0.5) * 1.6 * smooth(4, 30, dBay) * smooth(2, 12, dSea);
    return { h, dBay, dSea };
  };
}

// ------------------------------------------------------------------ palette (style C, sRGB → linear)
const lin = (hex: string) => new THREE.Color(hex);
const PAL = {
  grass: lin("#748F45"), grassLight: lin("#99AF56"), grassDark: lin("#58723A"), heather: lin("#7D5E74"),
  rock: lin("#7F848A"), rockDark: lin("#5C6168"), rockLight: lin("#A5A7A5"), rockWet: lin("#3A3F45"), lichen: lin("#C2A85A"),
  cobble: lin("#8F8A82"), quay: lin("#A8A398"), quayDark: lin("#7A756C"), earth: lin("#8B7558"), gravel: lin("#B9B09C"),
  seabed: lin("#2E4A4A"),
};

function buildTerrain(layout: HarbourLayout, H: ReturnType<typeof makeTerrainHeight>): THREE.BufferGeometry {
  const cs = 3;
  const xs = layout.island.coast.map((p) => p[0]), zs = layout.island.coast.map((p) => p[1]);
  const x0 = Math.min(...xs) - 12, x1 = Math.max(...xs) + 12, z0 = Math.min(...zs) - 12, z1 = Math.max(...zs) + 12;
  const nx = Math.ceil((x1 - x0) / cs) + 1, nz = Math.ceil((z1 - z0) / cs) + 1;
  const hv = new Float32Array(nx * nz), db = new Float32Array(nx * nz);
  const px = new Float32Array(nx * nz), pz = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    // jitter interior vertices a little so the facets are not a grid
    const jx = (hash2(i, j, 1) - 0.5) * cs * 0.5, jz = (hash2(i, j, 2) - 0.5) * cs * 0.5;
    const x = x0 + i * cs + jx, z = z0 + j * cs + jz;
    const r = H(x, z);
    hv[j * nx + i] = r.h; db[j * nx + i] = r.dBay; px[j * nx + i] = x; pz[j * nx + i] = z;
  }
  const P: number[] = [], C: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const col = new THREE.Color();
  const tri = (ia: number, ib: number, ic: number) => {
    a.set(px[ia], hv[ia], pz[ia]); b.set(px[ib], hv[ib], pz[ib]); c.set(px[ic], hv[ic], pz[ic]);
    if (a.y < -3.5 && b.y < -3.5 && c.y < -3.5) return;
    const n = e1.subVectors(b, a).cross(e2.subVectors(c, a)).normalize();
    if (n.y < 0) { n.negate(); }
    const cy = (a.y + b.y + c.y) / 3, cx = (a.x + b.x + c.x) / 3, cz = (a.z + b.z + c.z) / 3;
    const dBay = (db[ia] + db[ib] + db[ic]) / 3;
    let pat = 6;
    const nz2 = vnoise(cx * 0.045, cz * 0.045, 9), nf = vnoise(cx * 0.3, cz * 0.3, 4);
    if (cy < -1.2) { col.copy(PAL.seabed); pat = 5; }
    else if (cy < 0.7) { col.copy(PAL.rockWet); pat = 5; }
    else if (n.y < 0.72) { col.copy(n.y < 0.45 ? PAL.rockDark : PAL.rock).lerp(PAL.rockLight, nf * 0.35); pat = 5; }
    else if (dBay < 13 && cy < 3.6) { col.copy(PAL.cobble); pat = 4; }
    else if (n.y < 0.86) { col.copy(PAL.grassDark).lerp(PAL.rock, 0.25); pat = 6; }
    else {
      col.copy(PAL.grass).lerp(nz2 > 0.5 ? PAL.grassLight : PAL.grassDark, Math.min(1, Math.abs(nz2 - 0.5) * 1.6));
      const hz = vnoise(cx * 0.11, cz * 0.11, 12);
      if (hz > 0.72) col.lerp(PAL.heather, Math.min(0.55, (hz - 0.72) * 4));
    }
    const jit = 1 + (hash2(Math.floor(cx * 3), Math.floor(cz * 3), 5) - 0.5) * 0.08;
    for (const v of [a, b, c]) { P.push(v.x, v.y, v.z); C.push(col.r * jit, col.g * jit, col.b * jit, pat / 16); }
  };
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const i00 = j * nx + i, i10 = i00 + 1, i01 = i00 + nx, i11 = i01 + 1;
    if ((i + j) & 1) { tri(i00, i01, i10); tri(i10, i01, i11); } else { tri(i00, i01, i11); tri(i00, i11, i10); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(C, 4));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ placements
interface Placement { kit: string; m: THREE.Matrix4 }
const KITS = ["house_a_falu_gable", "house_b_ochre_slate_tall", "house_c_white_render", "house_d_blue_tar", "house_e_turf_cottage",
  "house_f_warehouse", "lighthouse_keeper_cottage", "lighthouse_oil_store", "lighthouse_signal_mast", "pier_finger_16m", "pier_main_10m",
  "pier_thead_20m", "prop_barrels", "prop_crates", "prop_nets", "prop_lamp_post", "prop_fence_picket", "prop_hand_crane",
  "prop_hjell_rack", "prop_dinghy", "quay_bollard", "quay_wall_10m", "tree_birch", "tree_spruce"] as const;
const HOUSES = KITS.filter((k) => k.startsWith("house_"));
/** Small props whose shadows are sub-pixel at harbour zoom: skip the shadow pass (draw calls). */
const NO_SHADOW = new Set(["quay_bollard", "prop_barrels", "prop_crates", "prop_nets", "prop_fence_picket", "prop_dinghy"]);

const _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _y = new THREE.Vector3(0, 1, 0);
function place(x: number, y: number, z: number, yaw: number, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q.setFromAxisAngle(_y, yaw), _s.set(sx, sy, sz));
}
/** yaw so that local +x runs along (dx, dz). */
const yawAlong = (dx: number, dz: number) => Math.atan2(-dz, dx);
/** yaw so that local +z faces (dx, dz). */
const yawFacing = (dx: number, dz: number) => Math.atan2(dx, dz);

export interface StandIn {
  group: THREE.Group;
  lights: LayoutLight[];
  heightAt: (x: number, z: number) => number;
}

export async function buildStandIn(ctx: EngineContext, layout: HarbourLayout, mats: HarbourMaterials): Promise<StandIn> {
  const H = makeTerrainHeight(layout);
  const quayY = (layout as { quayY?: number }).quayY ?? 2.3;
  const group = new THREE.Group();
  group.name = "harbour-standin-island";
  const terrainMesh = new THREE.Mesh(buildTerrain(layout, H), mats.kit({ side: THREE.FrontSide }));
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  terrainMesh.name = "standin-terrain";
  group.add(terrainMesh);

  const kits = new Map<string, KitPiece>();
  await Promise.all(KITS.map(async (k) => {
    try { kits.set(k, flattenKit(k, await ctx.assets.gltf(`${STYLE_C_GLB}/${k}.glb`))); } catch (err) { console.warn("[harbour] stand-in kit missing", k, err); }
  }));

  const P: Placement[] = [];
  const lights: LayoutLight[] = [];
  const rnd = rng(1337);
  const hAt = (x: number, z: number) => H(x, z).h;

  // --- quay walls round the bay (water side = local +z), bollards, lamps, props
  const bay = layout.island.bay;
  for (let i = 0; i < bay.length; i++) {
    let [ax, az] = bay[i];
    const [bx, bz] = bay[(i + 1) % bay.length];
    let dx = bx - ax, dz = bz - az;
    const L = Math.hypot(dx, dz);
    if (L < 4) continue;
    // normal pointing into the bay (water)
    let nx = -dz / L, nz = dx / L;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    if (!inside(mx + nx * 2, mz + nz * 2, bay)) { nx = -nx; nz = -nz; }
    if (hAt(mx - nx * 6, mz - nz * 6) < 0.8) continue;           // open water behind: the harbour mouth
    // local +z must equal the water normal: yawFacing(n); then local +x = (cos, -sin)… ensure along edge
    const yaw = yawFacing(nx, nz);
    const ex = Math.cos(yaw), ez = -Math.sin(yaw);               // where local +x points
    if (ex * dx + ez * dz < 0) { ax = bx; az = bz; dx = -dx; dz = -dz; }   // walk the edge from the other end
    const n = Math.max(1, Math.round(L / 10));
    const sx = L / (n * 10);
    for (let k = 0; k < n; k++) {
      const t = k / n;
      P.push({ kit: "quay_wall_10m", m: place(ax + dx * t, quayY - 3.3, az + dz * t, yaw, sx, 1, 1) });
    }
    // furniture along the coping (1 … 8 m inland)
    const ux = dx / L, uz = dz / L;
    for (let s = 6; s < L - 4; s += 18) {
      const lx = ax + ux * s - nx * 3.2, lz = az + uz * s - nz * 3.2;
      const y = quayY;
      P.push({ kit: "prop_lamp_post", m: place(lx, y, lz, yaw) });
      lights.push({ kind: "lamp", position: [lx, y + 4.55, lz] });
      const bxp = ax + ux * (s + 9) - nx * 0.9, bzp = az + uz * (s + 9) - nz * 0.9;
      P.push({ kit: "quay_bollard", m: place(bxp, y, bzp, yaw) });
      if (rnd() < 0.55) {
        const kind = ["prop_barrels", "prop_crates", "prop_nets", "prop_crates", "prop_hand_crane"][Math.floor(rnd() * 5)];
        const ox = ax + ux * (s + 4 + rnd() * 6) - nx * (5 + rnd() * 3), oz = az + uz * (s + 4 + rnd() * 6) - nz * (5 + rnd() * 3);
        P.push({ kit: kind, m: place(ox, y, oz, yaw + (rnd() - 0.5) * 0.8) });
      }
    }
  }

  // --- piers from segments
  const pierKit: Record<string, { kit: string; len: number; w: number }> = {
    finger: { kit: "pier_finger_16m", len: 16, w: 2.04 }, arm: { kit: "pier_main_10m", len: 10, w: 5.24 },
    grand: { kit: "pier_main_10m", len: 10, w: 5.24 }, thead: { kit: "pier_thead_20m", len: 20, w: 5.24 },
  };
  const stoneSegs: Array<{ a: Vec2; b: Vec2; w: number; top: number; quay: boolean }> = [];
  for (const pier of layout.piers) {
    for (const seg of pier.segments) {
      const pk = pierKit[seg.kind];
      const dx = seg.b[0] - seg.a[0], dz = seg.b[1] - seg.a[1];
      const L = Math.hypot(dx, dz);
      if (!pk) { stoneSegs.push({ a: seg.a, b: seg.b, w: seg.width, top: seg.kind === "quay" ? quayY : 3.0, quay: seg.kind === "quay" }); continue; }
      const n = Math.max(1, Math.round(L / pk.len));
      const sx = L / (n * pk.len);
      const yaw = yawAlong(dx, dz);
      for (let k = 0; k < n; k++) {
        const t = k / n;
        P.push({ kit: pk.kit, m: place(seg.a[0] + dx * t, 0, seg.a[1] + dz * t, yaw, sx, 1, seg.width / pk.w) });
      }
      if (seg.kind !== "finger" || hash2(Math.round(seg.b[0]), Math.round(seg.b[1]), 2) < 0.18) {
        const lx = seg.b[0] - (dx / L) * 1.2, lz = seg.b[1] - (dz / L) * 1.2;
        P.push({ kit: "prop_lamp_post", m: place(lx, 1.45, lz, yaw) });
        if (!layout.lights?.length) lights.push({ kind: seg.kind === "finger" ? "lamp" : "pierhead", position: [lx, 1.45 + 4.55, lz] });
      }
    }
  }

  // --- stone breakwater / mole (box + boulders)
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  {
    const pos = rockGeo.attributes.position;
    const C = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) { C.set([PAL.rock.r, PAL.rock.g, PAL.rock.b, 5 / 16], i * 4); }
    rockGeo.setAttribute("color", new THREE.BufferAttribute(C, 4));
  }
  const rockMats: THREE.Matrix4[] = [];
  const stone = new THREE.Group();
  for (const s of stoneSegs) {
    const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
    const L = Math.hypot(dx, dz);
    const box = new THREE.BoxGeometry(L, s.top + 4.2, s.w).toNonIndexed();
    box.translate(L / 2, (s.top - 4.2) / 2, 0);
    const pos = box.attributes.position, nrm = box.attributes.normal;
    const C = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const top = nrm.getY(i) > 0.5;
      const c = top ? PAL.quay : PAL.quayDark;
      C.set([c.r, c.g, c.b, (top ? 4 : 2) / 16], i * 4);
    }
    box.setAttribute("color", new THREE.BufferAttribute(C, 4));
    const mesh = new THREE.Mesh(box, mats.kit({ side: THREE.FrontSide }));
    mesh.applyMatrix4(place(s.a[0], 0, s.a[1], yawAlong(dx, dz)));
    mesh.castShadow = mesh.receiveShadow = true;
    stone.add(mesh);
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    for (let t = 0; t < L && !s.quay; t += 2.6) {
      for (const side of [-1, 1]) {
        const r = 1.4 + rnd() * 1.6;
        const off = s.w / 2 + 0.6 + rnd() * 1.6;
        const m = new THREE.Matrix4().compose(
          _p.set(s.a[0] + ux * t + nx * off * side, -0.4 + rnd() * 0.8, s.a[1] + uz * t + nz * off * side),
          new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, rnd() * 3)),
          _s.set(r, r * (0.6 + rnd() * 0.3), r * (0.8 + rnd() * 0.4)));
        rockMats.push(m);
      }
    }
    if (!s.quay) lights.push({ kind: "harbourlight", position: [s.b[0] - ux * 2, s.top + 3.5, s.b[1] - uz * 2], color: "#FF5A3C" });
  }
  group.add(stone);
  if (rockMats.length) {
    const rocks = new THREE.InstancedMesh(rockGeo, mats.kit({ side: THREE.FrontSide }), rockMats.length);
    rockMats.forEach((m, i) => rocks.setMatrixAt(i, m));
    rocks.castShadow = rocks.receiveShadow = true;
    rocks.name = "standin-boulders";
    group.add(rocks);
  }

  // --- town: houses on the slopes facing the bay
  const houseSpots: Array<[number, number]> = [];
  const cell = 15;
  const xs = layout.island.coast.map((p) => p[0]), zs = layout.island.coast.map((p) => p[1]);
  for (let gz = Math.min(...zs); gz < Math.max(...zs); gz += cell) {
    for (let gx = Math.min(...xs); gx < Math.max(...xs); gx += cell) {
      const x = gx + (rnd() - 0.5) * 6, z = gz + (rnd() - 0.5) * 6;
      const r = H(x, z);
      if (r.h < 1.5 || r.dBay < 16 || r.dBay > 78 || r.dSea < 16) continue;
      if (vnoise(x * 0.012, z * 0.012, 21) < 0.3) continue;
      if (houseSpots.length >= 130) continue;
      if (houseSpots.some(([hx, hz]) => Math.hypot(hx - x, hz - z) < 13.5)) continue;            // gardens / lanes break the grid
      // nearest water direction (toward the bay)
      let best = Infinity, bxn = 0, bzn = 1;
      for (let i = 0; i < bay.length; i++) {
        const [ax, az] = bay[i], [bx2, bz2] = bay[(i + 1) % bay.length];
        const ddx = bx2 - ax, ddz = bz2 - az;
        const t = Math.max(0, Math.min(1, ((x - ax) * ddx + (z - az) * ddz) / (ddx * ddx + ddz * ddz)));
        const qx = ax + ddx * t, qz = az + ddz * t;
        const d = Math.hypot(qx - x, qz - z);
        if (d < best) { best = d; bxn = qx - x; bzn = qz - z; }
      }
      const yaw = yawFacing(bxn, bzn);
      // footprint flatness
      const hs = [H(x + 4, z + 4).h, H(x - 4, z + 4).h, H(x + 4, z - 4).h, H(x - 4, z - 4).h, r.h];
      if (Math.max(...hs) - Math.min(...hs) > 2.2) continue;
      const kit = HOUSES[Math.floor(hash2(Math.round(x), Math.round(z), 8) * HOUSES.length)];
      const y = Math.min(...hs) + 0.15;
      P.push({ kit, m: place(x, y, z, yaw + (rnd() - 0.5) * 0.12) });
      houseSpots.push([x, z]);
      // window spill light in front of the facade
      const fx = Math.sin(yaw), fz = Math.cos(yaw);
      lights.push({ kind: "window", position: [x + fx * 6.4, y + 2.6, z + fz * 6.4] });
      if (rnd() < 0.35) {
        const side = rnd() < 0.5 ? -1 : 1;
        P.push({ kit: "prop_fence_picket", m: place(x + fx * 7.5 + fz * side * 2, y, z + fz * 7.5 - fx * side * 2, yaw + Math.PI / 2) });
      }
    }
  }

  // --- trees: clusters on the upper slopes and round the edges of town
  let trees = 0;
  for (let gz = Math.min(...zs); gz < Math.max(...zs) && trees < 520; gz += 7) {
    for (let gx = Math.min(...xs); gx < Math.max(...xs) && trees < 520; gx += 7) {
      const x = gx + (rnd() - 0.5) * 6, z = gz + (rnd() - 0.5) * 6;
      const r = H(x, z);
      if (r.h < 2 || r.dSea < 6 || r.dBay < 20) continue;
      const cl = vnoise(x * 0.02, z * 0.02, 33);
      if (cl < (r.dBay > 125 ? 0.42 : 0.66)) continue;
      if (houseSpots.some(([hx, hz]) => Math.abs(hx - x) < 8 && Math.abs(hz - z) < 8)) continue;
      const birch = vnoise(x * 0.03, z * 0.03, 44) > 0.6;
      const s = 0.8 + rnd() * 0.55;
      P.push({ kit: birch ? "tree_birch" : "tree_spruce", m: place(x, r.h - 0.2, z, rnd() * 6.28, s, s * (0.9 + rnd() * 0.3), s) });
      trees++;
    }
  }

  // --- headland: keeper's cottage, oil store, signal mast at their landmarks
  const lm = (id: string) => layout.landmarks.find((l) => l.id === id);
  const pharos = lm("pharos");
  const cottage = lm("keepers-cottage");
  if (cottage) {
    const yaw = pharos ? yawFacing(pharos.position[0] - cottage.position[0], pharos.position[2] - cottage.position[2]) + Math.PI / 2 : 0;
    P.push({ kit: "lighthouse_keeper_cottage", m: place(cottage.position[0], hAt(cottage.position[0], cottage.position[2]) + 0.1, cottage.position[2], yaw) });
    lights.push({ kind: "window", position: [cottage.position[0] + Math.sin(yaw) * 5, cottage.position[1] + 2.4, cottage.position[2] + Math.cos(yaw) * 5] });
  }
  if (pharos) {
    const ox = pharos.position[0] + 11, oz = pharos.position[2] + 7;
    P.push({ kit: "lighthouse_oil_store", m: place(ox, hAt(ox, oz), oz, 0.6) });
  }
  const mast = lm("storm-mast");
  if (mast) P.push({ kit: "lighthouse_signal_mast", m: place(mast.position[0], mast.position[1] + 0.6, mast.position[2], 0.4) });

  // --- instance everything per (kit, material)
  const byKit = new Map<string, THREE.Matrix4[]>();
  for (const p of P) { const l = byKit.get(p.kit) ?? []; l.push(p.m); byKit.set(p.kit, l); }
  const tmp = new THREE.Object3D();
  for (const [name, list] of byKit) {
    const kit = kits.get(name);
    if (!kit) continue;
    for (const part of kit.parts) {
      const proto = new THREE.Mesh(part.geometry, part.source);
      tmp.add(proto);
      mats.apply(tmp);
      tmp.remove(proto);
      const im = new THREE.InstancedMesh(part.geometry, proto.material, list.length);
      list.forEach((m, i) => im.setMatrixAt(i, m));
      im.castShadow = proto.castShadow && !NO_SHADOW.has(name);
      im.receiveShadow = proto.receiveShadow;
      im.name = `standin-${name}-${part.material}`;
      im.computeBoundingSphere();
      group.add(im);
    }
  }

  return { group, lights, heightAt: hAt };
}
