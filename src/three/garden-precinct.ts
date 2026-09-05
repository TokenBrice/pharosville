import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { stableUnit } from "./garden-util";

const CX = -7;
const CZ = -1.25;
const COURT_Y = 2.55;
const HALF = 8.6;
const PALE = new Color(HARBOR_PALETTE.fog_day);
const DARK = new Color(HARBOR_PALETTE.stone_mid);

// The westward square meets the existing navigable-water ellipse at its two
// seaward corners. Clip those corners rather than silently enlarging land.
function shoreLimit(x: number, z: number): number {
  const reach = 19.65 * Math.sqrt(Math.max(0, 1.06 - ((z - 1.2) / 14.85) ** 2));
  return Math.max(0.6 - reach, Math.min(0.6 + reach, x));
}

export function precinctTerrainHeight(x: number, z: number): number {
  const distance = Math.max(Math.abs(x - CX), Math.abs(z - CZ));
  if (distance > 10.2 || x < shoreLimit(x, z) - 0.01) return -1.45;
  return COURT_Y - Math.max(0, distance - 9.6) / 0.6 * 4.4;
}

/** Stillness: this precinct replaces the keeper's cottage and the terrace's
 * bare rock, not a fourth free-standing garden monument. Four static draws,
 * including its cliff and the keeper's single emissive window; no lights. */
export function createGardenPrecinct(): Group {
  const root = new Group();
  root.name = "island-fortified-precinct";
  const stone: BufferGeometry[] = [];
  const recesses: BufferGeometry[] = [];
  const cliff: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  let block = 0;
  function add(bucket: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, batter = 0): void {
    const rock = bucket === cliff;
    const geometry = new BoxGeometry(w, h, d, rock ? 24 : 1, rock ? 8 : 1, rock ? 24 : 1);
    const p = geometry.getAttribute("position");
    const colors: number[] = [];
    const tone = 0.86 + stableUnit(`precinct.block.${block++}`) * 0.14;
    const color = new Color();
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i) + y;
      const scale = 1 + batter * (0.5 - p.getY(i) / h);
      let xx = p.getX(i) * scale + x;
      const zz = p.getZ(i) * scale + z;
      xx = shoreLimit(xx, zz);
      p.setXYZ(i, xx, yy, zz);
      const bed = 1 - 0.12 * Math.exp(-(((yy / 0.62 - Math.floor(yy / 0.62)) / 0.12) ** 2));
      color.copy(PALE).lerp(DARK, rock ? Math.max(0.18, 0.75 - (yy + 1.45) * 0.13) : 0.16);
      color.multiplyScalar(tone * bed * (p.getY(i) < y - h * 0.4 ? 0.86 : 1));
      colors.push(color.r, color.g, color.b);
    }
    geometry.computeVertexNormals();
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    bucket.push(geometry);
  }
  add(cliff, 19.2, 4.4, 19.2, CX, 0.35, CZ, 0.045);
  // Flagstones stop at the inner face: exactly 1.5 units remain around the
  // lighthouse's 6.2-half-width stylobate before the 7.7-half-width court edge.
  for (let ix = 0; ix < 14; ix++) for (let iz = 0; iz < 14; iz++) {
    add(stone, 1.085, 0.14, 1.085, CX - 7.15 + ix * 1.1, COURT_Y - 0.07, CZ - 7.15 + iz * 1.1);
  }
  // Coursed curtain masonry; a few unfilled joints form deep arrow slits.
  for (let side = 0; side < 4; side++) {
    for (let row = 0; row < 10; row++) {
      const bottom = -0.25 + row * 0.5;
      for (let column = 0; column < 18; column++) {
        const along = -8.1 + column * 0.9;
        if (side === 0 && Math.abs(along) < 1.8) continue;
        const slit = row >= 6 && row <= 7 && column % 5 === 2;
        const across = HALF - 0.45;
        const x = CX + (side < 2 ? (side === 0 ? across : -across) : along);
        const z = CZ + (side < 2 ? along : (side === 2 ? across : -across));
        if (slit) {
          for (const edge of [-1, 1]) {
            add(stone, side < 2 ? 0.9 : 0.365, 0.485, side < 2 ? 0.365 : 0.9,
              x + (side < 2 ? 0 : edge * 0.2575), bottom + 0.25,
              z + (side < 2 ? edge * 0.2575 : 0));
          }
          add(recesses, side < 2 ? 0.018 : 0.15, 0.5, side < 2 ? 0.15 : 0.018,
            x, bottom + 0.25, z);
        } else {
          add(stone, side < 2 ? 0.9 : 0.88, 0.485, side < 2 ? 0.88 : 0.9, x, bottom + 0.25, z);
        }
      }
    }
    for (let i = 0; i < 16; i++) {
      const along = -7.8 + i * 1.04;
      if (side === 0 && Math.abs(along) < 1.8) continue;
      add(stone, side < 2 ? 0.9 : 0.62, 0.6, side < 2 ? 0.62 : 0.9,
        CX + (side < 2 ? (side === 0 ? 8.15 : -8.15) : along), 5.05,
        CZ + (side < 2 ? along : (side === 2 ? 8.15 : -8.15)));
    }
  }
  // Bastions project from the curtain corners, clearing the stylobate inside.
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = CX + sx * HALF;
    const z = CZ + sz * HALF;
    for (let course = 0; course < 14; course++) {
      const height = 8.15 / 14;
      const width = 4 - 0.35 * (course + 0.5) / 14;
      add(stone, width, height - 0.025, width, x, -1.45 + (course + 0.5) * height, z, 0.006);
    }
    add(stone, 4, 0.3, 4, x, 6.85, z);
    for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
      add(stone, 0.64, 0.6, 0.48, x - 1.68 + i * 1.12, 7.3, z + side * 1.76);
      add(stone, 0.48, 0.6, 0.64, x + side * 1.76, 7.3, z - 1.68 + i * 1.12);
    }
  }
  // True open gate: paired jambs and stepped voussoirs leave the arch empty.
  const gx = CX + HALF;
  for (const side of [-1, 1]) add(stone, 2.3, 3.65, 0.65, gx, 4.375, CZ + side * 1.475);
  for (let i = 0; i < 12; i++) {
    const z = -1.15 + (i + 0.5) * 2.3 / 12;
    const arch = 4.35 + Math.sqrt(Math.max(0, 1.15 ** 2 - z ** 2));
    add(stone, 2.3, 6.2 - arch, 2.3 / 12 + 0.005, gx, (6.2 + arch) / 2, CZ + z);
  }
  add(stone, 2.55, 0.18, 3.75, gx, 6.29, CZ);
  add(recesses, 0.025, 0.67, 0.57, gx + 1.16, 5.78, CZ);
  add(glow, 0.03, 0.49, 0.36, gx + 1.18, 5.78, CZ);
  add(stone, 2.5, 0.22, 2.3, 3.25, 2.44, CZ);
  const materials = [
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: true }),
    new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.iron_dark, roughness: 1 }),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.lantern_glow, emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 0.65, roughness: 0.38 }),
  ];
  [stone, cliff, recesses, glow].forEach((bucket, index) => {
    const geometry = mergeGeometries(bucket, false)!;
    for (const part of bucket) part.dispose();
    const mesh = new Mesh(geometry, materials[index]);
    mesh.name = ["island-precinct-masonry", "island-precinct-cliff", "island-precinct-recesses", "island-gatehouse-lit-window"][index];
    mesh.userData.gardenKeepSeparate = true;
    mesh.castShadow = index < 2;
    mesh.receiveShadow = true;
    root.add(mesh);
  });
  return root;
}
