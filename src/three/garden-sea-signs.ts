import {
  BoxGeometry,
  CanvasTexture,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
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

/** Cedar wayfinding boards on paired pilings; one timber draw and one shared ink atlas. */

export interface SeaSignSpec {
  body: SeaBodyName;
  label: string;
  /** Retained in the renderer contract; counts do not compete with the name on timber. */
  reading: string | null;
  /** Retained for semantic parity; the board itself stays natural cedar. */
  accent: string;
}

export interface GardenSeaSigns {
  root: Group;
  /** Exact eased/hysteretic scale used by the most recently drawn frame. */
  readonly scale: number;
  /** Unlit boards contribute no light lanes. */
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

const STELE_HEIGHT = 1.5;
const STELE_CENTER_Y = STELE_FACE_BASE_Y;
const FACE_OFFSET = STELE_DEPTH * 0.53;
export const GARDEN_SEA_STELE_STONE_COLOR = "#a08153";
export const GARDEN_SEA_STELE_DEFAULT_CARVING_COLOR = "#302317";
export const GARDEN_SEA_STELE_NIGHT_CARVING_COLOR = "#978c78";
export const GARDEN_SEA_STELE_ACTIVE_CARVING_COLOR = "#fff0c9";
export const GARDEN_SEA_STELE_NAME_WIDTH_FRACTION = 0.94;
export const GARDEN_SEA_STELE_NAME_HEIGHT_FRACTION = 0.98;
const DEFAULT_CARVING = new Color(GARDEN_SEA_STELE_DEFAULT_CARVING_COLOR);
const NIGHT_CARVING = new Color(GARDEN_SEA_STELE_NIGHT_CARVING_COLOR);
const ACTIVE_CARVING = new Color(GARDEN_SEA_STELE_ACTIVE_CARVING_COLOR);
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
  const nameAtlas = createNameAtlas(entries.map(({ spec }) => spec.label));
  const stoneMaterial = new MeshStandardMaterial({
    color: GARDEN_SEA_STELE_STONE_COLOR,
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

  const faceParts: BufferGeometry[] = [];
  const faceRanges: FaceRange[] = [];
  let vertexStart = 0;
  const normalX = Math.sin(SEA_SIGN_STELE.yaw);
  const normalZ = Math.cos(SEA_SIGN_STELE.yaw);
  for (let index = 0; index < entries.length; index += 1) {
    const { site } = entries[index]!;
    const face = createSteleNameGeometry(index, entries.length);
    face.rotateY(SEA_SIGN_STELE.yaw);
    face.translate(
      site.x + normalX * FACE_OFFSET,
      GARDEN_WATER_Y + STELE_FACE_BASE_Y,
      site.z + normalZ * FACE_OFFSET,
    );
    const vertexCount = face.getAttribute("position").count;
    const colors = new Float32Array(vertexCount * 3);
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      DEFAULT_CARVING.toArray(colors, vertex * 3);
    }
    face.setAttribute("color", new Float32BufferAttribute(colors, 3));
    faceRanges.push({ body: site.body, count: vertexCount, start: vertexStart });
    vertexStart += vertexCount;
    faceParts.push(face);
  }

  const faceGeometry = faceParts.length > 0 ? mergeGeometries(faceParts, false) : null;
  for (const part of faceParts) part.dispose();
  const faceMaterial = new MeshBasicMaterial({
    color: "#ffffff",
    depthWrite: false,
    map: nameAtlas,
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
      faceGeometry?.dispose();
      faceMaterial.dispose();
      nameAtlas?.dispose();
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
      // Basic-material ink is not lit with the timber. Darkening it at night
      // therefore erased the name twice; muted tan ink restores the default
      // reading while the active carving remains the warmer, brighter state.
      const quiet = quietColor.copy(DEFAULT_CARVING).lerp(NIGHT_CARVING, night);
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

function createSteleGeometry(): BufferGeometry {
  const board = new BoxGeometry(STELE_WIDTH, STELE_HEIGHT, STELE_DEPTH, 8, 1, 1);
  // Irregular long edges and a slight cant leave a sawn cedar silhouette.
  const positions = board.getAttribute("position");
  for (let index = 0; index < positions.count; index += 1) {
    const x = positions.getX(index);
    positions.setY(index, positions.getY(index) + Math.sin(x * 3.8) * 0.025 + x * 0.012);
  }
  board.computeVertexNormals();
  const parts: BufferGeometry[] = [board];
  for (const x of [-STELE_WIDTH * 0.34, STELE_WIDTH * 0.34]) {
    const pile = new BoxGeometry(0.2, 1.6, 0.24);
    pile.translate(x, -0.74, -STELE_DEPTH * 0.24);
    parts.push(pile);
  }
  // Carved grain catches light on the face without another material or texture.
  for (let row = 0; row < 5; row += 1) {
    const grain = new BoxGeometry(STELE_WIDTH * (0.62 + row * 0.06), 0.012, 0.015);
    grain.translate(Math.sin(row * 2) * 0.18, (row - 2) * 0.28, STELE_DEPTH * 0.5);
    parts.push(grain);
  }
  const merged = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  return merged;
}

function createNameAtlas(labels: readonly string[]): CanvasTexture | null {
  if (typeof document === "undefined" || labels.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256 * labels.length;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  // Georgia is a native serif: no asynchronous font swap, remote load or pixel alphabet.
  context.font = 'bold 136px Georgia, "Times New Roman", serif';
  for (const [index, label] of labels.entries()) {
    const lines = label.split(" ");
    for (const [line, word] of lines.entries()) {
      context.fillText(word, 512, index * 256 + 128 + (line - (lines.length - 1) / 2) * 108, 980);
    }
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function createSteleNameGeometry(index: number, count: number): BufferGeometry {
  const geometry = new PlaneGeometry(
    STELE_WIDTH * GARDEN_SEA_STELE_NAME_WIDTH_FRACTION,
    STELE_FACE_HEIGHT * GARDEN_SEA_STELE_NAME_HEIGHT_FRACTION,
  );
  const uv = geometry.getAttribute("uv");
  for (let vertex = 0; vertex < uv.count; vertex += 1) {
    uv.setY(vertex, (count - index - 1 + uv.getY(vertex)) / count);
  }
  return geometry;
}
