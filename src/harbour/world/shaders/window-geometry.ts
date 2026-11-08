import * as THREE from "three";

/**
 * Per-window attributes for the window material: every connected piece of a window mesh is one window
 * pane. hbWin = (u, v, width m, height m) in the pane's own plane (u across, v up), hbWinC = its centre.
 * Idempotent; runs once at load (union-find over the index).
 */
export function prepareWindowGeometry(g: THREE.BufferGeometry): void {
  if (g.attributes.hbWin) return;
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const n = pos.count;
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const idx = g.index;
  const triCount = idx ? idx.count : n;
  for (let t = 0; t < triCount; t += 3) {
    const a = find(idx ? idx.getX(t) : t);
    for (let k = 1; k < 3; k++) { const b = find(idx ? idx.getX(t + k) : t + k); if (b !== a) parent[b] = a; }
  }
  const comp = new Map<number, { min: THREE.Vector3; max: THREE.Vector3; n: THREE.Vector3; verts: number[] }>();
  const p = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    let c = comp.get(r);
    if (!c) { c = { min: new THREE.Vector3(Infinity, Infinity, Infinity), max: new THREE.Vector3(-Infinity, -Infinity, -Infinity), n: new THREE.Vector3(), verts: [] }; comp.set(r, c); }
    p.fromBufferAttribute(pos, i);
    c.min.min(p); c.max.max(p);
    if (nrm) { c.n.x += nrm.getX(i); c.n.y += nrm.getY(i); c.n.z += nrm.getZ(i); }
    c.verts.push(i);
  }
  const win = new Float32Array(n * 4), ctr = new Float32Array(n * 3);
  const side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), centre = new THREE.Vector3();
  for (const c of comp.values()) {
    centre.addVectors(c.min, c.max).multiplyScalar(0.5);
    c.n.y = 0;
    if (c.n.lengthSq() < 1e-6) c.n.set(0, 0, 1);
    side.crossVectors(up, c.n.normalize()).normalize();
    let lo = Infinity, hi = -Infinity;
    for (const i of c.verts) { const s = side.dot(p.fromBufferAttribute(pos, i).sub(centre)); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    const w = Math.max(1e-3, hi - lo), h = Math.max(1e-3, c.max.y - c.min.y);
    for (const i of c.verts) {
      p.fromBufferAttribute(pos, i);
      win[i * 4] = (side.dot(p.clone().sub(centre)) - lo) / w;
      win[i * 4 + 1] = (p.y - c.min.y) / h;
      win[i * 4 + 2] = w; win[i * 4 + 3] = h;
      ctr[i * 3] = centre.x; ctr[i * 3 + 1] = centre.y; ctr[i * 3 + 2] = centre.z;
    }
  }
  g.setAttribute("hbWin", new THREE.BufferAttribute(win, 4));
  g.setAttribute("hbWinC", new THREE.BufferAttribute(ctr, 3));
}
