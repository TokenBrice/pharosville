import * as THREE from "three";
import type { CrestAtlas } from "./types";

/**
 * Pier furniture in the chain's colours (D17): a row of short bollards along each pier head's seaward edge
 * and staggered down its arm (the cove piers' heads already stand between chain-banded dolphins and lamps);
 * a quay-only harbour also gets a banded beacon post at each seaward end of its quay. The posts are in the
 * chain's field colour with an ivory band and an iron cap. Small and few: the harbour reads as "this is Base's pier" at a glance, not as a fence.
 * Every post is the same turned profile, so beacons and bollards are ONE instanced draw.
 */
export interface MarkPier {
  chain: string;
  kind?: string;
  segments: Array<{ kind: string; a: [number, number]; b: [number, number]; width: number }>;
}

export interface MarkSite { x: number; z: number; beacon: boolean }

export function chainSlug(name: string): string { return name.toLowerCase().trim().replace(/\s+/g, "-"); }

/** Where the posts stand (pure; heights are read later from the ground). */
export function markSites(piers: readonly MarkPier[], atWater?: (x: number, z: number) => boolean): Array<MarkSite & { chain: string }> {
  const out: Array<MarkSite & { chain: string }> = [];
  for (const p of piers) {
    // the grand Ethereum moles carry their own harbour lights and a town quay; leave them be
    if (p.kind === "grand") continue;
    const chain = chainSlug(p.chain);
    const heads = p.segments.filter((s) => s.kind === "thead");
    // a row of bollards along a line, offset to one side (side +1/-1), both sides staggered (side 0), or on it (off 0)
    const row = (a: [number, number], b: [number, number], off: number, side: number, step: number, skipEnds: number) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
      if (L < 2 * skipEnds + 1) return;
      const tx = dx / L, tz = dz / L, nx = -tz, nz = tx;
      const n = Math.max(1, Math.floor((L - 2 * skipEnds) / step));
      for (let i = 0; i <= n; i++) {
        const d = skipEnds + ((L - 2 * skipEnds) * i) / n, k = side || (i % 2 ? 1 : -1);
        out.push({ chain, x: a[0] + tx * d + nx * off * k, z: a[1] + tz * d + nz * off * k, beacon: false });
      }
    };
    const beacon = (a: [number, number], b: [number, number]) => {
      // at the very end, pulled back a stride so it stands on the stones
      const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1, k = Math.min(1.1, L / 3);
      const x = a[0] + (dx / L) * k, z = a[1] + (dz / L) * k;
      if (!atWater || atWater(x, z)) out.push({ chain, x, z, beacon: true });
    };
    const arms = p.segments.filter((s) => s.kind === "arm");
    for (const h of heads) {
      // the pier head already stands between chain-banded dolphins and lamps: bollards on its seaward edge only
      const mx = (h.a[0] + h.b[0]) / 2, mz = (h.a[1] + h.b[1]) / 2;
      const land = arms.flatMap((s) => [s.a, s.b]).sort((p1, p2) => Math.hypot(p2[0] - mx, p2[1] - mz) - Math.hypot(p1[0] - mx, p1[1] - mz))[0];
      const dx = h.b[0] - h.a[0], dz = h.b[1] - h.a[1];
      // the normal (-dz, dx) points to side +1: seaward is the side away from the arm's landward end
      const side = land ? (((land[0] - mx) * -dz + (land[1] - mz) * dx) > 0 ? -1 : 1) : 1;
      row(h.a, h.b, h.width / 2 - 0.45, side, 6.8, 2.6);
    }
    for (const s of arms) row(s.a, s.b, s.width / 2 - 0.3, 0, 6.5, 3);
    if (!heads.length) {
      // a quay-only harbour: bollards along the quay edge and beacons at its seaward ends
      const quays = p.segments.filter((s) => s.kind === "quay");
      for (const s of quays) row(s.a, s.b, 0, 1, 8, 2);
      if (quays.length) { const first = quays[0], last = quays[quays.length - 1]; beacon(first.a, first.b); beacon(last.b, last.a); }
    }
  }
  return out;
}

/** The turned post, unit height and radius ~1; aTint 1 = takes the chain colour, 0 = keeps its own. */
function postGeometry(): THREE.BufferGeometry {
  // (radius, height, colour, tint)
  const IRON = 0x2a2724, IVORY = 0xf1eadb, WHITE = 0xffffff;
  const prof: Array<[number, number, number, number]> = [
    [0, 0, IRON, 0], [1.3, 0, IRON, 0], [1.3, 0.07, IRON, 0], [1.0, 0.1, WHITE, 1],
    [1.0, 0.56, WHITE, 1], [1.02, 0.56, IVORY, 0], [1.02, 0.7, IVORY, 0], [1.0, 0.7, WHITE, 1],
    [0.96, 0.82, WHITE, 1], [1.24, 0.84, IRON, 0], [1.24, 0.9, IRON, 0], [0.7, 0.98, IRON, 0], [0, 1.0, IRON, 0],
  ];
  const SEG = 8, pos: number[] = [], col: number[] = [], tint: number[] = [], idx: number[] = [];
  const c = new THREE.Color();
  // flat-shaded bands: each profile step is its own ring pair (low-poly look, crisp colour edges)
  for (let i = 0; i < prof.length - 1; i++) {
    const [r0, y0, c0, t0] = prof[i], [r1, y1] = prof[i + 1];
    const base = pos.length / 3;
    c.setHex(c0).convertSRGBToLinear();
    for (let s = 0; s <= SEG; s++) {
      const a = (s / SEG) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      pos.push(r0 * ca, y0, r0 * sa, r1 * ca, y1, r1 * sa);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      tint.push(t0, t0);
    }
    for (let s = 0; s < SEG; s++) {
      const a = base + s * 2;
      idx.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute("aTint", new THREE.Float32BufferAttribute(tint, 1));
  g.setIndex(idx);
  const ni = g.toNonIndexed();
  ni.computeVertexNormals();
  g.dispose();
  return ni;
}

export class PierMarks {
  readonly mesh: THREE.InstancedMesh;

  constructor(sites: ReadonlyArray<MarkSite & { chain: string; y: number }>, chains: CrestAtlas["chains"]) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.08 });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aTint;")
        .replace("#include <color_vertex>", "vColor = vec4(1.0);\nvColor.rgb *= color;\n#ifdef USE_INSTANCING_COLOR\nvColor.rgb *= mix(vec3(1.0), instanceColor.rgb, aTint);\n#endif");
    };
    mat.name = "identity_pier_marks";
    const list = sites.filter((s) => chains[s.chain]);
    this.mesh = new THREE.InstancedMesh(postGeometry(), mat, Math.max(1, list.length));
    this.mesh.count = list.length;
    this.mesh.name = "identity-pier-marks";
    this.mesh.castShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    list.forEach((site, i) => {
      // beacon: a slim 2.6 m post; bollard: a squat 0.65 m post
      if (site.beacon) s.set(0.28, 2.6, 0.28); else s.set(0.2, 0.65, 0.2);
      m.compose(p.set(site.x, site.y, site.z), q.identity(), s);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, c.set(chains[site.chain].color));
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.mesh.computeBoundingSphere();
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as THREE.Material).dispose(); }
}
