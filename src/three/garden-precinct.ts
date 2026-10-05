import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, Group, Mesh, MeshStandardMaterial, type Object3D } from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GARDEN_LIGHTHOUSE_ROOT_OFFSET } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import {
  applyLighthouseRimLight,
  LIGHTHOUSE_WINDOW_MATERIAL_NAME,
} from "./garden-lighthouse";
import { stableUnit } from "./garden-util";
import { applyGardenSurface, normalizeGardenSurfaceGeometry, getGardenSurfaceExemption, type GardenSurfaceDetailSource, type GardenSurfaceMetadata } from "./garden-surfaces";
import { buildGardenVeranda } from "./garden-architecture-kit";

const CX = GARDEN_LIGHTHOUSE_ROOT_OFFSET.x;
const CZ = GARDEN_LIGHTHOUSE_ROOT_OFFSET.z;
/**
 * W1.9: the court is the crag's crown, level with the tower root — the old
 * 19.2 × 4.4 × 19.2 cliff box and the square gravel bed that read as a fort
 * are gone; the headland itself is the plinth (garden-island's crag).
 */
const COURT_Y = GARDEN_LIGHTHOUSE_ROOT_OFFSET.y;
const HALF = 8.6;
/**
 * The stone opening on the gate spur east of the tower. The quay stair's head
 * lines up on it (garden-island derives GARDEN_QUAY_STAIR_HEAD from this).
 */
export const GARDEN_PRECINCT_GATE = { x: CX + HALF, z: -3.3 } as const;
/** The seaward parapet runs only where the crag's north lip carries it. */
const PARAPET_WEST_X = -11.5;
const PALE = new Color(HARBOR_PALETTE.fog_day);
const DARK = new Color(HARBOR_PALETTE.stone_mid);
const TIMBER = new Color(HARBOR_PALETTE.timber_mid);
const ROOF = new Color(HARBOR_PALETTE.timber_dark);

/** Stillness: this precinct replaces the keeper's cottage and the terrace's
 * bare rock, not a fourth free-standing garden monument. Three static draws,
 * including the keeper's single emissive window; no lights. */
export function createGardenPrecinct(): Group {
  const root = new Group();
  root.name = "island-shoin-precinct";
  const stone: BufferGeometry[] = [];
  const recesses: BufferGeometry[] = [];
  const glow: BufferGeometry[] = [];
  let block = 0;
  function add(bucket: BufferGeometry[], w: number, h: number, d: number, x: number, y: number, z: number, tint?: Color, jitter = 0): void {
    const geometry = new BoxGeometry(w, h, d);
    const p = geometry.getAttribute("position");
    const colors: number[] = [];
    const tone = 0.86 + stableUnit(`precinct.block.${block++}`) * 0.14;
    const color = new Color();
    for (let i = 0; i < p.count; i++) {
      // Key shared corners by position, not vertex index: adjacent box faces
      // retain a watertight edge while the dry-laid stones lose their grid.
      const noise = jitter === 0 ? 0 : jitter * (stableUnit(`precinct.v.${block}.${p.getX(i)}.${p.getY(i)}.${p.getZ(i)}`) - 0.5);
      p.setXYZ(i, p.getX(i) + x + noise, p.getY(i) + y + noise, p.getZ(i) + z - noise);
      // W4.P1: a dry-laid stone a step under the tower's limestone, so the
      // tower's lit face stays the brightest land value above the gate.
      if (tint) color.copy(tint);
      else color.copy(PALE).lerp(DARK, 0.3);
      color.multiplyScalar(tone * (p.getY(i) < y - h * 0.4 ? 0.86 : 1));
      colors.push(color.r, color.g, color.b);
    }
    geometry.computeVertexNormals();
    geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    normalizeGardenSurfaceGeometry(geometry, tint === TIMBER ? "timber" : tint === ROOF ? "roofTile" : "stone");
    bucket.push(geometry);
  }
  // pharos-2: three dry-laid courses on the seaward (north) lip only, a low
  // parapet above the sheer cliff to the Danger water. The three landward
  // runs read as merlons from the rest seat and are gone. The bottom course
  // beds a little into the rounded lip.
  for (let row = 0; row < 3; row++) {
    for (let column = 0; column < 18; column++) {
      const x = CX - 8.1 + column * 0.9;
      if (x < PARAPET_WEST_X) continue;
      const width = 0.79 + stableUnit(`precinct.joint.3.${row}.${column}`) * 0.07;
      const height = 0.28 + stableUnit(`precinct.course.3.${row}.${column}`) * 0.06;
      add(stone, width, height, 0.9, x, COURT_Y + row * 0.36 + 0.13, CZ - (HALF - 0.45), undefined, 0.07);
    }
  }
  // One open engawa shelters under the parapet on the north strip, outside
  // the stylobate. Its low roof edge frames the court without another
  // monument. Timber shares the masonry's vertex-colour draw.
  const engawaZ = CZ - 7;
  const veranda = buildGardenVeranda({
    length: 10, span: 1.4, deckY: COURT_Y + 0.24,
    eaveY: COURT_Y + 1.9, ridgeY: COURT_Y + 2.14,
    profile: "mono-pitch", thickness: 0.12, bayLength: 5,
  });
  for (const part of veranda.parts) {
    part.geometry.translate(CX, 0, engawaZ);
    const count = part.geometry.getAttribute("position").count;
    const tint = part.bucket === "roof" ? ROOF : TIMBER;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    part.geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
    stone.push(part.geometry);
  }
  // A human-scale stone opening replaces the castle arch. Its single inset
  // gatehouse light sits in one jamb, not in a luminous lintel over the court.
  const { x: gx, z: gz } = GARDEN_PRECINCT_GATE;
  for (const side of [-1, 1]) {
    add(stone, 0.65, 2.1, 0.65, gx, COURT_Y + 1.05, gz + side * 1.475);
  }
  add(stone, 0.85, 0.22, 3.75, gx, COURT_Y + 2.21, gz);
  add(recesses, 0.025, 0.55, 0.4, gx + 0.33, COURT_Y + 1.3, gz + 1.475);
  add(glow, 0.03, 0.37, 0.24, gx + 0.35, COURT_Y + 1.3, gz + 1.475);
  // The stair-head landing the quay stair arrives on.
  add(stone, 2.5, 0.22, 1.8, gx + 1.65, COURT_Y - 0.11, gz);
  // X10 / §1.1 rule 3: props take ≤ 0.3 of the environment — value, no sheen.
  const materials = [
    new MeshStandardMaterial({ envMapIntensity: 0.3, vertexColors: true, roughness: 0.96, flatShading: true }),
    new MeshStandardMaterial({ color: HARBOR_PALETTE.iron_dark, envMapIntensity: 0.3, roughness: 1 }),
    // T0.2 (2026-09-07): the keeper's window was a frozen 0.65 — lit at noon,
    // no brighter at midnight. Carrying the shared aperture material NAME puts
    // it on the day cycle's tower-window curve with no handle of its own; see
    // collectLighthouseGlowMaterials. The 0.65 here is only the value it is
    // born with, before the first frame runs.
    new MeshStandardMaterial({ color: HARBOR_PALETTE.lantern_glow, emissive: HARBOR_PALETTE.lantern_warm, emissiveIntensity: 0.65, name: LIGHTHOUSE_WINDOW_MATERIAL_NAME, roughness: 0.38 }),
  ];
  [stone, recesses, glow].forEach((bucket, index) => {
    const prepared = bucket.map((part) => {
      normalizeGardenSurfaceGeometry(part, "stone");
      return part.index ? part.toNonIndexed() : part;
    });
    const geometry = mergeGeometries(prepared, false)!;
    for (const part of prepared) if (!bucket.includes(part)) part.dispose();
    for (const part of bucket) part.dispose();
    const mesh = new Mesh(geometry, materials[index]);
    mesh.name = ["island-shoin-precinct-masonry", "island-shoin-precinct-recesses", "island-shoin-precinct-gatehouse-lit-window"][index]!;
    mesh.userData.gardenKeepSeparate = true;
    mesh.castShadow = index === 0;
    mesh.receiveShadow = true;
    // Preserve the shared court rim response beneath the lighthouse.
    if (index === 0) applyLighthouseRimLight(mesh);
    if (index === 0) applyGardenSurface(mesh.material, {
      role: "stone", mapping: "uv", metresPerRepeat: 1.6,
      detailStrength: 0.28, vertexRoles: true, vertexWeights: true,
    });
    root.add(mesh);
  });
  return root;
}

/** Prepare existing architectural trees without touching identity, flora or lamps. */
export function prepareGardenArchitectureTree(root: Object3D, detailSource?: GardenSurfaceDetailSource): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || getGardenSurfaceExemption(material)) continue;
      const authored = material.userData.gardenSurface as GardenSurfaceMetadata | undefined;
      const stone = /lighthouse|pharos|precinct.*masonry|weathered-limestone/i.test(`${object.name} ${material.name}`)
        && !/window|glow|beam|fire|metal|bronze/i.test(`${object.name} ${material.name}`);
      if (!authored && !stone) continue;
      const role = authored?.role ?? "stone";
      normalizeGardenSurfaceGeometry(object.geometry, role);
      applyGardenSurface(material, {
        role, mapping: authored?.mapping ?? "triplanar",
        metresPerRepeat: authored?.metresPerRepeat ?? 1.6,
        detailStrength: authored?.detailStrength ?? 0.28,
        vertexRoles: authored?.vertexRoles ?? false,
        vertexWeights: authored?.vertexWeights ?? false,
        ...(detailSource ? { detailSource } : {}),
      });
    }
  });
}
