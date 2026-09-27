import { BufferAttribute, Color, Group, InstancedMesh, MeshStandardMaterial } from "three";
import type { GardenMonthRecord } from "../systems/world-types";
import { HARBOR_PALETTE, hexToOklch, oklchToHex } from "../systems/palette";
import { GARDEN_FLORA_COLORS } from "./garden-flora";

/**
 * W4.G5 (garden-3, data-poetry defect 4): the evergreens carry the trailing
 * 30-day PSI record as DEPTH, never chroma. A calm month deepens the island
 * pines' pads and the karikomi toward the dark velvet of moss after rain
 * (OKLCH L −0.08, C ≤ 0.09, H 150) and fills the pads out; a stressed month
 * thins them and browns them toward straw. The ratio is applied to the
 * existing vertex/instance colours, so each pad keeps its dark belly and lit
 * crown. The deciduous maple is on the calendar, not the record.
 */
const needle = GARDEN_FLORA_COLORS.needle;
const needleOklch = hexToOklch(`#${needle.getHexString()}`);
const deep = new Color(oklchToHex({ c: Math.min(needleOklch.c, 0.09), h: 150, l: needleOklch.l - 0.08 }));
const straw = new Color(HARBOR_PALETTE.timber_warm).lerp(new Color(HARBOR_PALETTE.roof_thatch), 0.35);
const DEPTH_RATIO = [deep.r / needle.r, deep.g / needle.g, deep.b / needle.b] as const;
const STRAW_RATIO = [straw.r / needle.r, straw.g / needle.g, straw.b / needle.b] as const;
/** Stress browns only part-way: the pads stay pines, not hay. */
const STRAW_STRENGTH = 0.5;

function growthOf(record?: GardenMonthRecord): number {
  return record?.unavailable ? 0.5 : Math.max(0, Math.min(1, record?.growth ?? 0.5));
}

/** Per-channel multiplier for a month: 1 at a neutral record. */
function recordRatio(growth: number): [number, number, number] {
  const amount = Math.abs(growth - 0.5) * 2 * (growth >= 0.5 ? 1 : STRAW_STRENGTH);
  const ratio = growth >= 0.5 ? DEPTH_RATIO : STRAW_RATIO;
  return [1 + (ratio[0] - 1) * amount, 1 + (ratio[1] - 1) * amount, 1 + (ratio[2] - 1) * amount];
}

/** Reuses the garden's existing buffers: zero new draws. Apply once per build. */
export function applyGardenMonthRecord(root: Group, record?: GardenMonthRecord): void {
  const growth = growthOf(record);
  const [r, g, b] = recordRatio(growth);
  // Fuller pads after a calm month, tighter after a stressed one.
  const fullness = 1 + (growth - 0.5) * 0.14;
  root.traverse((object) => {
    if (!(object instanceof InstancedMesh) || !(object.material instanceof MeshStandardMaterial)) return;
    if (object.name === "island-karikomi") {
      const color = new Color();
      for (let index = 0; index < object.count; index += 1) {
        object.getColorAt(index, color);
        object.setColorAt(index, color.setRGB(color.r * r, color.g * g, color.b * b));
      }
      if (object.instanceColor) object.instanceColor.needsUpdate = true;
      return;
    }
    if (object.name !== "island-niwaki-grove") return;
    const geometry = object.geometry;
    const foliage = geometry.getAttribute("aGardenFoliage") as BufferAttribute | undefined;
    const position = geometry.getAttribute("position") as BufferAttribute;
    const colors = geometry.getAttribute("color") as BufferAttribute | undefined;
    if (!foliage || !colors) return;
    // Each pine pad carries its own rank: gather its centre and seat.
    const pads = new Map<number, { x: number; z: number; count: number; floor: number }>();
    for (let vertex = 0; vertex < foliage.count; vertex += 1) {
      const rank = foliage.getX(vertex);
      if (rank <= 0) continue;
      colors.setXYZ(vertex, colors.getX(vertex) * r, colors.getY(vertex) * g, colors.getZ(vertex) * b);
      const pad = pads.get(rank) ?? { count: 0, floor: Number.POSITIVE_INFINITY, x: 0, z: 0 };
      pad.x += position.getX(vertex);
      pad.z += position.getZ(vertex);
      pad.floor = Math.min(pad.floor, position.getY(vertex));
      pad.count += 1;
      pads.set(rank, pad);
    }
    for (let vertex = 0; vertex < foliage.count; vertex += 1) {
      const pad = pads.get(foliage.getX(vertex));
      if (!pad) continue;
      const cx = pad.x / pad.count;
      const cz = pad.z / pad.count;
      position.setXYZ(
        vertex,
        cx + (position.getX(vertex) - cx) * fullness,
        pad.floor + (position.getY(vertex) - pad.floor) * fullness,
        cz + (position.getZ(vertex) - cz) * fullness,
      );
    }
    colors.needsUpdate = true;
    position.needsUpdate = true;
    geometry.computeBoundingSphere();
  });
}
