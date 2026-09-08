import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  applyLighthouseRimLight,
  LIGHTHOUSE_WINDOW_MATERIAL_NAME,
} from "./garden-lighthouse";
import { stableUnit } from "./garden-util";

const CX = -7;
const CZ = -1.25;
const COURT_Y = 2.55;
const HALF = 8.6;
const PALE = new Color(HARBOR_PALETTE.fog_day);
const DARK = new Color(HARBOR_PALETTE.stone_mid);
const TIMBER = new Color(HARBOR_PALETTE.timber_mid);
const ROOF = new Color(HARBOR_PALETTE.timber_dark);

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
  root.name = "island-shoin-precinct";
  const stone: BufferGeometry[] = [];
  const recesses: BufferGeometry[] = [];
  const cliff: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  let block = 0;
  function add(bucket: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, batter = 0, tint?: Color, jitter = 0): void {
    const rock = bucket === cliff;
    const geometry = new BoxGeometry(w, h, d, rock ? 24 : 1, rock ? 8 : 1, rock ? 24 : 1);
    const p = geometry.getAttribute("position");
    const colors: number[] = [];
    const tone = 0.86 + stableUnit(`precinct.block.${block++}`) * 0.14;
    const color = new Color();
    for (let i = 0; i < p.count; i++) {
      // Key shared corners by position, not vertex index: adjacent box faces
      // retain a watertight edge while the dry-laid stones lose their grid.
      const noise = jitter === 0 ? 0 : jitter * (stableUnit(`precinct.v.${block}.${p.getX(i)}.${p.getY(i)}.${p.getZ(i)}`) - 0.5);
      const yy = p.getY(i) + y + noise;
      const scale = 1 + batter * (0.5 - p.getY(i) / h);
      let xx = p.getX(i) * scale + x + noise;
      const zz = p.getZ(i) * scale + z - noise;
      xx = shoreLimit(xx, zz);
      p.setXYZ(i, xx, yy, zz);
      const bed = 1 - 0.12 * Math.exp(-(((yy / 0.62 - Math.floor(yy / 0.62)) / 0.12) ** 2));
      if (tint) color.copy(tint);
      else color.copy(PALE).lerp(DARK, rock ? Math.max(0.18, 0.75 - (yy + 1.45) * 0.13) : 0.16);
      color.multiplyScalar(tone * (rock ? bed : 1) * (p.getY(i) < y - h * 0.4 ? 0.86 : 1));
      colors.push(color.r, color.g, color.b);
    }
    geometry.computeVertexNormals();
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    bucket.push(geometry);
  }
  add(cliff, 19.2, 4.4, 19.2, CX, 0.35, CZ, 0.045);
  // One pale gravel bed preserves the court level and the 7.7-half-width
  // footprint. The lighthouse's 6.2-half-width stylobate remains untouched.
  add(stone, 15.4, 0.14, 15.4, CX, COURT_Y - 0.07, CZ, 0, PALE);
  // Three dry-laid courses rise at most 1.115 above the court, including
  // vertex jitter. Unequal joints and heights avoid a miniature curtain wall.
  for (let side = 0; side < 4; side++) {
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 18; column++) {
        const along = -8.1 + column * 0.9;
        if (side === 0 && Math.abs(along) < 1.8) continue;
        const across = HALF - 0.45;
        const x = CX + (side < 2 ? (side === 0 ? across : -across) : along);
        const z = CZ + (side < 2 ? along : (side === 2 ? across : -across));
        const width = 0.79 + stableUnit(`precinct.joint.${side}.${row}.${column}`) * 0.07;
        const height = 0.28 + stableUnit(`precinct.course.${side}.${row}.${column}`) * 0.06;
        add(stone, side < 2 ? 0.9 : width, height, side < 2 ? width : 0.9,
          x, COURT_Y + row * 0.36 + 0.18, z, 0, undefined, 0.07);
      }
    }
  }
  // Two open engawa occupy the sheltered west/north strips, outside the
  // stylobate. Their low roof edges frame the court without another monument.
  // Timber shares the masonry's vertex-colour draw; no new material bucket.
  for (let side = 0; side < 2; side++) {
    const x = CX - (side === 0 ? 7 : 0);
    const z = CZ - (side === 1 ? 7 : 0);
    add(stone, side === 0 ? 1.4 : 10, 0.18, side === 0 ? 10 : 1.4,
      x, COURT_Y + 0.15, z, 0, TIMBER);
    for (const edge of [-1, 1]) {
      for (const along of [-4.7, 0, 4.7]) {
        add(stone, 0.13, 1.65, 0.13,
          x + (side === 0 ? edge * 0.55 : along), COURT_Y + 1.065,
          z + (side === 0 ? along : edge * 0.55), 0, TIMBER);
      }
      add(stone, side === 0 ? 0.14 : 10, 0.16, side === 0 ? 10 : 0.14,
        x + (side === 0 ? edge * 0.55 : 0), COURT_Y + 1.84,
        z + (side === 0 ? 0 : edge * 0.55), 0, ROOF);
    }
    add(stone, side === 0 ? 1.5 : 10.3, 0.12, side === 0 ? 10.3 : 1.5,
      x, COURT_Y + 1.98, z, 0, ROOF);
  }
  // A human-scale stone opening replaces the castle arch. Its single inset
  // gatehouse light sits in one jamb, not in a luminous lintel over the court.
  const gx = CX + HALF;
  for (const side of [-1, 1]) {
    add(stone, 0.65, 2.1, 0.65, gx, COURT_Y + 1.05, CZ + side * 1.475);
  }
  add(stone, 0.85, 0.22, 3.75, gx, COURT_Y + 2.21, CZ);
  add(recesses, 0.025, 0.55, 0.4, gx + 0.33, COURT_Y + 1.3, CZ + 1.475);
  add(glow, 0.03, 0.37, 0.24, gx + 0.35, COURT_Y + 1.3, CZ + 1.475);
  add(stone, 2.5, 0.22, 2.3, 3.25, 2.44, CZ);
  const materials = [
    new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: true }),
    new MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.iron_dark, roughness: 1 }),
    // T0.2 (2026-09-07): the keeper's window was a frozen 0.65 — lit at noon,
    // no brighter at midnight. Carrying the shared aperture material NAME puts
    // it on the day cycle's tower-window curve (0.18 day / 1.53 night) with no
    // handle of its own; see collectLighthouseGlowMaterials. The 0.65 here is
    // now only the value it is born with, before the first frame runs.
    new MeshStandardMaterial({ color: HARBOR_PALETTE.lantern_glow, emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 0.65, name: LIGHTHOUSE_WINDOW_MATERIAL_NAME, roughness: 0.38 }),
  ];
  [stone, cliff, recesses, glow].forEach((bucket, index) => {
    const geometry = mergeGeometries(bucket, false)!;
    for (const part of bucket) part.dispose();
    const mesh = new Mesh(geometry, materials[index]);
    mesh.name = ["island-shoin-precinct-masonry", "island-shoin-precinct-cliff", "island-shoin-precinct-recesses", "island-shoin-precinct-gatehouse-lit-window"][index];
    mesh.userData.gardenKeepSeparate = true;
    mesh.castShadow = index < 2;
    mesh.receiveShadow = true;
    // Preserve the shared cliff/court rim response beneath the lighthouse.
    if (index < 2) applyLighthouseRimLight(mesh);
    root.add(mesh);
  });
  return root;
}
