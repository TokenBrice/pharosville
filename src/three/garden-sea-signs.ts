import {
  BoxGeometry,
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
 * stone is one InstancedMesh and every carved name is one merged cut-stroke mesh:
 * seven bodies cost two draws total and no texture. The default carving now
 * reads as dark cut ink against lifted stone at the inhabited camera, while
 * hover/selection still reverses it to the stronger pale emphasis. The canvas
 * content is aria-hidden; the accessibility ledger remains the redundant
 * naming channel.
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
export const GARDEN_SEA_STELE_STONE_COLOR = "#71827d";
export const GARDEN_SEA_STELE_DEFAULT_CARVING_COLOR = "#132c33";
export const GARDEN_SEA_STELE_NIGHT_CARVING_COLOR = "#829b96";
export const GARDEN_SEA_STELE_ACTIVE_CARVING_COLOR = "#fff0c9";
export const GARDEN_SEA_STELE_NAME_WIDTH_FRACTION = 0.94;
export const GARDEN_SEA_STELE_NAME_HEIGHT_FRACTION = 0.82;
export const GARDEN_SEA_STELE_GLYPH_FILL = { x: 0.92, y: 0.86 } as const;
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
    const { site, spec } = entries[index]!;
    const face = createSteleNameGeometry(spec.label);
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
    faceRanges.push({ body: spec.body, count: vertexCount, start: vertexStart });
    vertexStart += vertexCount;
    faceParts.push(face);
  }

  const faceGeometry = faceParts.length > 0 ? mergeGeometries(faceParts, false) : null;
  for (const part of faceParts) part.dispose();
  const faceMaterial = new MeshBasicMaterial({
    color: "#ffffff",
    depthWrite: false,
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
      // Basic-material ink is not lit with the stone. Darkening it at night
      // therefore erased the name twice; cool pale ink restores the default
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

const GLYPH_ROWS = 7;
const GLYPH_COLUMNS = 5;
const GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
};

/** A tiny cut-stone alphabet: one merged mesh, no canvas or GPU texture. */
function createSteleNameGeometry(label: string): BufferGeometry {
  // Two short lines give the cut letters natural proportions. Compressing a
  // whole sea name into one line made tall slivers even on the enlarged stone.
  const lines = label.toUpperCase().split(" ");
  const columns = Math.max(1, ...lines.map((line) => line.length * (GLYPH_COLUMNS + 1) - 1));
  const rows = lines.length * (GLYPH_ROWS + 1) - 1;
  const unitX = STELE_WIDTH * GARDEN_SEA_STELE_NAME_WIDTH_FRACTION / columns;
  const unitY = STELE_FACE_HEIGHT * GARDEN_SEA_STELE_NAME_HEIGHT_FRACTION / rows;
  const parts: PlaneGeometry[] = [];
  for (const [lineIndex, text] of lines.entries()) {
    const lineColumns = text.length * (GLYPH_COLUMNS + 1) - 1;
    for (let characterIndex = 0; characterIndex < text.length; characterIndex += 1) {
      const glyph = GLYPHS[text[characterIndex]!] ?? [];
      for (let row = 0; row < glyph.length; row += 1) {
        for (let column = 0; column < GLYPH_COLUMNS; column += 1) {
          if (glyph[row]![column] !== "1") continue;
          const block = new PlaneGeometry(
            unitX * GARDEN_SEA_STELE_GLYPH_FILL.x,
            unitY * GARDEN_SEA_STELE_GLYPH_FILL.y,
          );
          block.translate(
            (characterIndex * (GLYPH_COLUMNS + 1) + column - (lineColumns - 1) / 2) * unitX,
            ((rows - 1) / 2 - lineIndex * (GLYPH_ROWS + 1) - row) * unitY,
            0,
          );
          parts.push(block);
        }
      }
    }
  }
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) return new PlaneGeometry(0.001, 0.001);
  return merged;
}
