import {
  BoxGeometry,
  CanvasTexture,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  LinearFilter,
  LinearMipmapLinearFilter,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { SeaBodyName } from "../systems/sea-bodies";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  SEA_SIGN_STELE,
  STELE_DEPTH,
  STELE_FACE_BASE_Y,
  STELE_FACE_HEIGHT,
  STELE_WIDTH,
  createSeaSignScaleTrack,
  seaSignSites,
} from "./garden-sea-sign-siting";

/**
 * W2a — low boundary steles, not labels standing over the sea.
 *
 * Stone mass UP; timber boards, pilings and seven sign lanterns DOWN. The
 * stone is one InstancedMesh and every carved face is one merged atlas mesh:
 * seven bodies cost two draws total and one texture. Names remain quiet and
 * water-valued until the existing body hover/selection plumbing activates one.
 * The canvas content is aria-hidden; the accessibility ledger remains the
 * redundant naming channel.
 */

export interface SeaSignSpec {
  body: SeaBodyName;
  label: string;
  /** Retained in the renderer contract; counts no longer compete with the name on stone. */
  reading: string | null;
  /** Retained for semantic parity; the stele itself stays neutral stone. */
  accent: string;
}

export interface GardenSeaSigns {
  root: Group;
  /** Exact eased/hysteretic scale used by the most recently drawn frame. */
  readonly scale: number;
  /** Steles shed the board lanterns, so they contribute no light lanes. */
  lampPositions: readonly { x: number; y: number; z: number }[];
  dispose: () => void;
  update: (frame: {
    activeBody?: SeaBodyName | null;
    deltaSeconds?: number;
    night: number;
    reducedMotion?: boolean;
    visible: boolean;
    zoom: number;
  }) => void;
}

const STELE_HEIGHT = 1.9;
const STELE_CENTER_Y = 0.65;
const FACE_OFFSET = STELE_DEPTH * 0.51;
const QUIET_CARVING = new Color("#42595b");
const ACTIVE_CARVING = new Color("#e7dfc8");
export {
  SEA_SIGN_SCALE_STEPS,
  SEA_SIGN_STELE,
  SEA_SIGN_STEP_FADE_SECONDS,
  SEA_SIGN_STEP_HYSTERESIS,
  SEA_SIGN_STEP_ZOOMS,
  STELE_DEPTH,
  STELE_FACE_BASE_Y,
  STELE_FACE_HEIGHT,
  STELE_WIDTH,
  createSeaSignScaleTrack,
  seaSignScaleForZoom,
  seaSignSites,
  seaSignSteles,
  seaSignStepForZoom,
  seaSignStepWithHysteresis,
  type SeaSignArea,
  type SeaSignSite,
  type SeaSignStele,
} from "./garden-sea-sign-siting";

interface FaceRange {
  body: SeaBodyName;
  count: number;
  start: number;
}

export function createGardenSeaSigns(specs: readonly SeaSignSpec[]): GardenSeaSigns {
  const root = new Group();
  root.name = "garden-sea-steles";

  const specByBody = new Map(specs.map((spec) => [spec.body, spec]));
  const entries = seaSignSites(specs.map((spec) => spec.body)).flatMap((site) => {
    const spec = specByBody.get(site.body);
    return spec ? [{ site, spec }] : [];
  });

  const stoneGeometry = createSteleGeometry();
  const stoneMaterial = new MeshStandardMaterial({
    color: "#526969",
    flatShading: true,
    roughness: 0.98,
  });
  const stones = new InstancedMesh(stoneGeometry, stoneMaterial, entries.length);
  stones.name = "garden-sea-steles-stone";
  stones.castShadow = false;
  stones.receiveShadow = true;

  const matrix = new Matrix4();
  const rotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    SEA_SIGN_STELE.yaw,
  );
  for (let index = 0; index < entries.length; index += 1) {
    const { site } = entries[index]!;
    matrix.compose(
      new Vector3(site.x, GARDEN_WATER_Y + STELE_CENTER_Y, site.z),
      rotation,
      new Vector3(1, 1, 1),
    );
    stones.setMatrixAt(index, matrix);

    const anchor = new Group();
    anchor.name = `garden-sea-stele.${site.body}`;
    anchor.position.set(site.x, GARDEN_WATER_Y, site.z);
    root.add(anchor);
  }
  stones.instanceMatrix.needsUpdate = true;
  root.add(stones);

  const atlas = createSteleAtlas(entries.map(({ spec }) => spec));
  const faceParts: PlaneGeometry[] = [];
  const faceRanges: FaceRange[] = [];
  let vertexStart = 0;
  const normalX = Math.sin(SEA_SIGN_STELE.yaw);
  const normalZ = Math.cos(SEA_SIGN_STELE.yaw);
  for (let index = 0; index < entries.length; index += 1) {
    const { site, spec } = entries[index]!;
    const face = new PlaneGeometry(STELE_WIDTH * 0.86, STELE_FACE_HEIGHT);
    const cell = atlas?.cells[index];
    if (cell) remapSteleUvs(face, cell);
    face.rotateY(SEA_SIGN_STELE.yaw);
    face.translate(
      site.x + normalX * FACE_OFFSET,
      GARDEN_WATER_Y + STELE_FACE_BASE_Y,
      site.z + normalZ * FACE_OFFSET,
    );
    const vertexCount = face.getAttribute("position").count;
    const colors = new Float32Array(vertexCount * 3);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      QUIET_CARVING.toArray(colors, vertex * 3);
    }
    face.setAttribute("color", new Float32BufferAttribute(colors, 3));
    faceRanges.push({ body: spec.body, count: vertexCount, start: vertexStart });
    vertexStart += vertexCount;
    faceParts.push(face);
  }

  const faceGeometry = faceParts.length > 0 ? mergeGeometries(faceParts, false) : null;
  for (const part of faceParts) part.dispose();
  const faceMaterial = new MeshBasicMaterial({
    alphaTest: 0.08,
    color: "#ffffff",
    depthWrite: false,
    map: atlas?.texture ?? null,
    transparent: true,
    vertexColors: true,
  });
  const faces = faceGeometry ? new Mesh(faceGeometry, faceMaterial) : null;
  if (faces) {
    faces.name = "garden-sea-steles-carving";
    faces.renderOrder = 2;
    root.add(faces);
  }

  let appliedBody: SeaBodyName | null | undefined;
  let appliedNight = Number.NaN;
  let appliedScale = 0;
  const scaleTrack = createSeaSignScaleTrack();
  const baseFacePositions = faceGeometry
    ? new Float32Array(faceGeometry.getAttribute("position").array)
    : null;
  const quietColor = new Color();
  const activeColor = new Color();
  return {
    root,
    get scale() {
      return scaleTrack.scale;
    },
    lampPositions: [],
    dispose() {
      atlas?.texture.dispose();
      faceGeometry?.dispose();
      faceMaterial.dispose();
      stoneGeometry.dispose();
      stoneMaterial.dispose();
    },
    update({
      activeBody = null,
      deltaSeconds = Number.POSITIVE_INFINITY,
      night,
      reducedMotion = false,
      visible,
      zoom,
    }) {
      root.visible = visible;
      const scale = scaleTrack.advance({ deltaSeconds, reducedMotion, zoom });
      if (scale !== appliedScale) {
        appliedScale = scale;
        for (let index = 0; index < entries.length; index += 1) {
          const { site } = entries[index]!;
          matrix.compose(
            new Vector3(site.x, GARDEN_WATER_Y + STELE_CENTER_Y * scale, site.z),
            rotation,
            new Vector3(scale, scale, scale),
          );
          stones.setMatrixAt(index, matrix);
        }
        stones.instanceMatrix.needsUpdate = true;
        stones.computeBoundingBox();
        stones.computeBoundingSphere();
        if (faces && baseFacePositions) {
          const positions = faces.geometry.getAttribute("position");
          for (let faceIndex = 0; faceIndex < faceRanges.length; faceIndex += 1) {
            const range = faceRanges[faceIndex]!;
            const { site } = entries[faceIndex]!;
            for (let vertex = range.start; vertex < range.start + range.count; vertex += 1) {
              const offset = vertex * 3;
              positions.setXYZ(
                vertex,
                site.x + (baseFacePositions[offset]! - site.x) * scale,
                GARDEN_WATER_Y + (baseFacePositions[offset + 1]! - GARDEN_WATER_Y) * scale,
                site.z + (baseFacePositions[offset + 2]! - site.z) * scale,
              );
            }
          }
          positions.needsUpdate = true;
          faces.geometry.computeBoundingBox();
          faces.geometry.computeBoundingSphere();
        }
      }
      if (!faces || (activeBody === appliedBody && Math.abs(night - appliedNight) < 0.01)) return;
      appliedBody = activeBody;
      appliedNight = night;
      const colors = faces.geometry.getAttribute("color");
      const quiet = quietColor.copy(QUIET_CARVING).multiplyScalar(1 - night * 0.18);
      const active = activeColor.copy(ACTIVE_CARVING).multiplyScalar(0.92 + night * 0.08);
      for (const range of faceRanges) {
        const color = range.body === activeBody ? active : quiet;
        for (let index = range.start; index < range.start + range.count; index += 1) {
          colors.setXYZ(index, color.r, color.g, color.b);
        }
      }
      colors.needsUpdate = true;
    },
  };
}

function createSteleGeometry(): BoxGeometry {
  const geometry = new BoxGeometry(STELE_WIDTH, STELE_HEIGHT, STELE_DEPTH, 1, 2, 1);
  const position = geometry.getAttribute("position");
  for (let index = 0; index < position.count; index += 1) {
    const y = position.getY(index);
    if (y > STELE_HEIGHT * 0.2) {
      const taper = 1 - ((y / STELE_HEIGHT) - 0.2) * 0.18;
      position.setX(index, position.getX(index) * taper);
      position.setZ(index, position.getZ(index) * (0.95 + taper * 0.05));
    }
  }
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

const ATLAS_WIDTH = 1024;
const CELL_HEIGHT = 192;
const ATLAS_MAX_HEIGHT = 2048;

interface SteleAtlasCell {
  uMax: number;
  uMin: number;
  vMax: number;
  vMin: number;
}

interface SteleAtlas {
  cells: SteleAtlasCell[];
  texture: CanvasTexture;
}

function createSteleAtlas(specs: readonly SeaSignSpec[]): SteleAtlas | null {
  if (specs.length === 0 || typeof document === "undefined") return null;
  const requiredHeight = specs.length * CELL_HEIGHT;
  if (requiredHeight > ATLAS_MAX_HEIGHT) {
    throw new Error(`Sea-stele atlas exceeds ${ATLAS_MAX_HEIGHT}px for ${specs.length} steles.`);
  }
  const atlasHeight = 2 ** Math.ceil(Math.log2(requiredHeight));
  const canvas = document.createElement("canvas");
  canvas.width = ATLAS_WIDTH;
  canvas.height = atlasHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const cells: SteleAtlasCell[] = [];
  for (let index = 0; index < specs.length; index += 1) {
    const top = index * CELL_HEIGHT;
    paintSteleName(context, specs[index]!, top);
    cells.push({
      uMin: 0,
      uMax: 1,
      vMax: 1 - top / atlasHeight,
      vMin: 1 - (top + CELL_HEIGHT) / atlasHeight,
    });
  }

  const texture = new CanvasTexture(canvas);
  texture.name = "garden-sea-stele-atlas";
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return { cells, texture };
}

function paintSteleName(
  context: CanvasRenderingContext2D,
  spec: SeaSignSpec,
  top: number,
): void {
  const centreX = ATLAS_WIDTH / 2;
  const centreY = top + CELL_HEIGHT / 2;
  context.save();
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 116px "PV Plaque", Georgia, "Times New Roman", serif`;
  context.letterSpacing = "9px";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(0, 0, 0, 0.72)";
  context.lineWidth = 15;
  context.strokeText(spec.label.toUpperCase(), centreX, centreY + 3, ATLAS_WIDTH * 0.9);
  context.fillStyle = "rgba(255, 255, 255, 0.96)";
  context.fillText(spec.label.toUpperCase(), centreX, centreY, ATLAS_WIDTH * 0.9);
  context.restore();
}

function remapSteleUvs(geometry: PlaneGeometry, cell: SteleAtlasCell): void {
  const uv = geometry.getAttribute("uv");
  const scaleU = cell.uMax - cell.uMin;
  const scaleV = cell.vMax - cell.vMin;
  for (let index = 0; index < uv.count; index += 1) {
    uv.setXY(
      index,
      cell.uMin + uv.getX(index) * scaleU,
      cell.vMin + uv.getY(index) * scaleV,
    );
  }
  uv.needsUpdate = true;
}
