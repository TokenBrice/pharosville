import {
  BoxGeometry,
  BufferGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import { HARBOR_PALETTE } from "../systems/palette";
import { TILE_SCALE } from "./garden-util";

/**
 * World-tile siting at the south-eastern mouth of the Calm Anchorage. The
 * anchorage's moorings remain wholly owned by the placement system: this gate
 * is purely decorative, carries no data meaning, and registers no hit target.
 */
export const GARDEN_TORII_TILE = { x: 55, y: 99 } as const;
export const GARDEN_TORII_YAW = -0.47;

export interface GardenTorii {
  drawCallCount: 1;
  root: Group;
  triangleCount: number;
  dispose: () => void;
}

const SHU = new Color(HARBOR_PALETTE.vermillion);
const SHU_WEATHERED = SHU.clone().lerp(new Color(HARBOR_PALETTE.timber_dark), 0.2);
const STONE_WET = new Color(HARBOR_PALETTE.stone_dark)
  .lerp(new Color(HARBOR_PALETTE.deep_sea_2), 0.28);
const STONE_DRY = new Color(HARBOR_PALETTE.stone_mid);

function paintGeometry(
  geometry: BufferGeometry,
  low: Color,
  high: Color,
  salt: number,
): BufferGeometry {
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const y = positions.getY(index);
    const z = positions.getZ(index);
    const weather = 0.88 + 0.12 * Math.sin(x * 3.7 + y * 5.1 + z * 2.9 + salt);
    color.copy(low).lerp(high, Math.max(0, Math.min(1, y + 0.5))).multiplyScalar(weather);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

function curvedKasagiGeometry(): BoxGeometry {
  const width = 8.8;
  const geometry = new BoxGeometry(width, 0.52, 0.62, 12, 1, 1);
  const positions = geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    const endRise = 0.34 * (Math.abs(x) / (width / 2)) ** 2.4;
    positions.setY(index, positions.getY(index) + endRise);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function translated(
  geometry: BufferGeometry,
  x: number,
  y: number,
  z: number,
): BufferGeometry {
  geometry.translate(x, y, z);
  return geometry;
}

function toriiGeometry(): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const pillarHeight = 6.15;
  const pillarLean = 0.055;

  // Broad octagonal footings disappear into the water; the dry shoulder and
  // wet-dark base make the waterline believable without another material.
  for (const x of [-3.05, 3.05]) {
    parts.push(paintGeometry(
      translated(new CylinderGeometry(0.72, 0.9, 1.55, 8), x, -0.48, 0),
      STONE_WET,
      STONE_DRY,
      x,
    ));
  }

  // Myojin pillars taper upward and lean subtly toward the opening.
  for (const [index, x] of [-3.05, 3.05].entries()) {
    const pillar = new CylinderGeometry(0.34, 0.47, pillarHeight, 10);
    pillar.rotateZ(index === 0 ? -pillarLean : pillarLean);
    parts.push(paintGeometry(
      translated(pillar, x, 2.78, 0),
      SHU_WEATHERED,
      SHU,
      index + 4,
    ));
  }

  // Lower nuki, upper shimaki, then the long upturned kasagi. Their unequal
  // depths keep the silhouette legible from the locked isometric camera.
  parts.push(paintGeometry(
    translated(new BoxGeometry(6.85, 0.42, 0.42), 0, 4.92, 0),
    SHU_WEATHERED,
    SHU,
    8,
  ));
  parts.push(paintGeometry(
    translated(new BoxGeometry(7.8, 0.38, 0.5), 0, 6.12, 0),
    SHU_WEATHERED,
    SHU,
    9,
  ));
  parts.push(paintGeometry(
    translated(curvedKasagiGeometry(), 0, 6.58, 0),
    SHU_WEATHERED,
    SHU,
    10,
  ));

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Could not merge the garden torii geometry.");
  return merged;
}

export function createGardenTorii(): GardenTorii {
  const root = new Group();
  root.name = "garden-torii";
  root.position.set(
    GARDEN_TORII_TILE.x * TILE_SCALE,
    GARDEN_WATER_Y,
    GARDEN_TORII_TILE.y * TILE_SCALE,
  );
  root.rotation.y = GARDEN_TORII_YAW;

  const geometry = toriiGeometry();
  const material = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.9,
    vertexColors: true,
  });
  const gate = new Mesh(geometry, material);
  gate.name = "garden-torii-merged";
  gate.castShadow = true;
  gate.receiveShadow = true;
  root.add(gate);

  const triangleCount = (geometry.getIndex()?.count ?? geometry.getAttribute("position").count) / 3;
  return {
    drawCallCount: 1,
    root,
    triangleCount,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
