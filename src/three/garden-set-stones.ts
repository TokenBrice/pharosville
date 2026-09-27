import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { stableUnit } from "./garden-util";

/**
 * W4.G4 — ishi with intent (garden-5, garden-master-6). A set stone is
 * broad-based and a third buried, its top cut flat or gently tilted, with
 * faint horizontal bedding, moss on the up-facing planes and a dark wet line
 * at the foot. Smooth-shaded (§1.1 rule 1): the value comes from the authored
 * planes in vertex colour, never from facets. The Sakuteiki forms set the
 * proportions; one generator serves the island triads, the rim headlands and
 * coast, and the islets.
 *
 * Local frame: ground at y 0, the buried third below it, so a caller seats
 * the stone by placing its origin on the terrain.
 */
export type SetStoneForm = "tall" | "low" | "flat" | "reclining" | "arching";

const FORM_PROPORTIONS: Readonly<Record<SetStoneForm, readonly [number, number, number]>> = {
  tall: [0.82, 1.7, 0.72],
  low: [1.05, 0.95, 0.9],
  flat: [1.55, 0.5, 1.2],
  reclining: [1.7, 0.72, 0.85],
  arching: [1.35, 1.05, 0.75],
};

/** Fraction of the stone's height below ground. */
const SET_STONE_BURIAL = 0.35;
const BEDDING_STEP = 0.16;

const STONE_FOOT = new Color(HARBOR_PALETTE.stone_dark).lerp(new Color(HARBOR_PALETTE.deep_sea_1), 0.25);
const STONE_SIDE = new Color(HARBOR_PALETTE.stone_mid);
const STONE_CROWN = new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.fog_day), 0.12);
const STONE_MOSS = new Color(HARBOR_PALETTE.aurora_green).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.45).multiplyScalar(0.8);

export function createSetStoneGeometry(seed: string, form: SetStoneForm, segments = 3): BufferGeometry {
  const box = new BoxGeometry(1, 1, 1, segments, segments, segments);
  box.deleteAttribute("normal");
  box.deleteAttribute("uv");
  const geometry = mergeVertices(box);
  box.dispose();
  const [sx, sy, sz] = FORM_PROPORTIONS[form];
  const height = sy;
  const tilt = (6 + stableUnit(`${seed}.tilt`) * 8) * Math.PI / 180;
  const tiltAzimuth = stableUnit(`${seed}.tilt-az`) * Math.PI * 2;
  const topY = height * (1 - SET_STONE_BURIAL) * 0.92;
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    let x = position.getX(index);
    let y = position.getY(index);
    let z = position.getZ(index);
    // Spherify 40 %: a boulder, not a brick.
    const length = Math.hypot(x, y, z) || 1;
    x += (x / length * 0.62 - x) * 0.4;
    y += (y / length * 0.62 - y) * 0.4;
    z += (z / length * 0.62 - z) * 0.4;
    const displace = 1 + (stableUnit(`${seed}.d.${Math.round(x * 40)}.${Math.round(y * 40)}.${Math.round(z * 40)}`) - 0.5) * 0.2;
    x *= sx * displace;
    z *= sz * displace;
    y = (y + 0.5) * height * displace - height * SET_STONE_BURIAL;
    if (form === "arching") x += Math.max(0, y) * 0.35;
    // Horizontal bedding: alternate courses stand a hair proud.
    const course = Math.floor((y + height) / BEDDING_STEP);
    const bed = 1 + (course % 2 === 0 ? 0.03 : -0.03);
    x *= bed;
    z *= bed;
    // The cut top: a plane tilted 6–14°, so the crown is flat, not a dome.
    const cut = topY + Math.tan(tilt) * (x * Math.cos(tiltAzimuth) + z * Math.sin(tiltAzimuth));
    position.setXYZ(index, x, Math.min(y, cut), z);
  }
  geometry.computeVertexNormals();
  const normal = geometry.getAttribute("normal");
  const colors = new Float32Array(position.count * 3);
  const color = new Color();
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    const lift = Math.max(0, Math.min(1, y / Math.max(0.001, topY)));
    color.copy(STONE_SIDE).lerp(STONE_CROWN, lift * 0.7);
    // Moss holds the up-facing planes, patchily.
    const up = normal.getY(index);
    const patch = stableUnit(`${seed}.moss.${Math.round(position.getX(index) * 6)}.${Math.round(position.getZ(index) * 6)}`);
    if (up > 0.55 && patch < 0.6) color.lerp(STONE_MOSS, Math.min(1, (up - 0.55) / 0.3) * 0.85);
    // The wet dark line at the foot.
    if (y < 0.12) color.lerp(STONE_FOOT, 0.6 * (1 - Math.max(0, y) / 0.12));
    color.toArray(colors, index * 3);
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  return geometry;
}
