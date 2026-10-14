import * as THREE from "three";
import type { Bounds4 } from "./sea-sdf";

/**
 * Sea-zone mask for the ocean shader (P6 D18, identity agent): layout.seaZones rasterised over the sea
 * bounds with soft edges. R = the Shoals, G = the Far Ports, B = the chain harbours' waters, A = the Roads.
 * Rows run from minZ (same convention as the runtime sea SDF). Absent zones leave the mask black.
 */
export interface SeaZoneLike { kind: string; polygon: Array<[number, number]> }

const CHANNEL: Record<string, number> = { shoals: 0, farPorts: 1, harbour: 2, roads: 3 };

export function buildZoneMask(zones: readonly SeaZoneLike[] | undefined, bounds: Bounds4, size = 512): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  const cv = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(size, size) : null;
  const c2 = cv?.getContext("2d", { willReadFrequently: true }) ?? null;
  if (c2 && zones?.length) {
    const [x0, z0, x1, z1] = bounds;
    const sx = size / (x1 - x0), sz = size / (z1 - z0);
    for (const [kind, ch] of Object.entries(CHANNEL)) {
      const polys = zones.filter((z) => z.kind === kind && z.polygon.length > 2);
      if (!polys.length) continue;
      c2.filter = "none";
      c2.fillStyle = "#000";
      c2.fillRect(0, 0, size, size);
      // feathered edges (~8 m): the treatments fade in, never stop at a hard line
      c2.filter = `blur(${Math.max(1, Math.round(4 * sx))}px)`;
      c2.fillStyle = "#fff";
      for (const z of polys) {
        c2.beginPath();
        z.polygon.forEach(([x, zz], i) => (i ? c2.lineTo((x - x0) * sx, (zz - z0) * sz) : c2.moveTo((x - x0) * sx, (zz - z0) * sz)));
        c2.closePath();
        c2.fill();
      }
      const px = c2.getImageData(0, 0, size, size).data;
      for (let i = 0; i < size * size; i++) data[i * 4 + ch] = Math.max(data[i * 4 + ch], px[i * 4]);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
