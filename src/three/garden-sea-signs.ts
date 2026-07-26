import {
  BoxGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  Group,
  LinearFilter,
  LinearMipmapLinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SRGBColorSpace,
  type Texture,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SeaBodyName } from "../systems/sea-bodies";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  BOARD_BASE_Y,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  SEA_SIGN_BOARD,
  seaSignScaleForZoom,
  seaSignSites,
} from "./garden-sea-sign-siting";

/**
 * N (Sea Master, decisions D3 + D6 + D7): the sea's place-names, as objects.
 *
 * The operator's firm ask was "some kind of sign or written annotation of the
 * sea zones... to make it feel like an actual map", and chose physical signage
 * over chart lettering laid on the water: a carved timber board on pilings, in
 * the same oak and ironwork as the docks and piers already in the world.
 *
 * Before this, the only annotation was a DOM chip layer that
 * `observe-sequence.ts` caps at TWO at overview zoom — so the framing where a
 * map most wants its place-names carried the fewest, and four of the seven
 * bodies were never named at all.
 *
 * ## The scale problem, and D6
 *
 * A true-scale board is about four pixels tall at whole-map framing, which is
 * exactly the framing that needs it. So the board's world scale RISES as the
 * camera pulls back, holding a roughly constant on-screen size — drawn out of
 * scale on the chart, the way a landmark is on an old map. Ships and water are
 * untouched; only the signage does this.
 *
 * ## Cost
 *
 * One merged geometry for every board's timber, and one instanced-free mesh per
 * sign for the lettered face (each face needs its own texture, so those cannot
 * merge). Seven bodies is eight draw calls, not fifty.
 */

/** Which bodies get a board, and what it says. */
export interface SeaSignSpec {
  body: SeaBodyName;
  /** The name carved into the board — read from the same area records as the detail panels. */
  label: string;
  /** Optional second line, smaller: the band and its live ship count. */
  reading: string | null;
  /** Band accent, used for the painted letters. */
  accent: string;
}

export interface GardenSeaSigns {
  root: Group;
  /** Lamp world positions, for the light-lane registry (N5). */
  lampPositions: readonly { x: number; y: number; z: number }[];
  dispose: () => void;
  update: (frame: {
    /** Camera zoom; drives the D6 constant-on-screen scaling. */
    zoom: number;
    /** Signs are cleared when a detail panel owns the frame. */
    visible: boolean;
    /** 0..1 night weight — lights the hung lantern. */
    night: number;
  }) => void;
}

// Board proportions, in world units at zoom 1. The siting and face geometry
// live in a three-free module so the hit tester can share them without pulling
// the renderer into the world chunk; re-exported here for existing callers.
const BOARD_THICKNESS = 0.22;
const PILING_RADIUS = 0.16;
const PILING_SPREAD = 2.4;

export {
  BOARD_BASE_Y,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  SEA_SIGN_BOARD,
  seaSignBoards,
  seaSignScaleForZoom,
  seaSignSites,
  type SeaSignArea,
  type SeaSignBoard,
  type SeaSignSite,
} from "./garden-sea-sign-siting";

export function createGardenSeaSigns(specs: readonly SeaSignSpec[]): GardenSeaSigns {
  const root = new Group();
  root.name = "garden-sea-signs";

  const timberMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.timber_warm ?? "#8a6a44",
    roughness: 0.86,
  });
  const lampMaterial = new MeshBasicMaterial({
    color: new Color(HARBOR_PALETTE.lantern_warm),
    toneMapped: false,
  });

  const timberParts: Mesh[] = [];
  const faceMaterials: MeshStandardMaterial[] = [];
  const faceTextures: Texture[] = [];
  const lampMeshes: Mesh[] = [];
  const lampPositions: { x: number; y: number; z: number }[] = [];
  const signGroups: Group[] = [];

  const specByBody = new Map(specs.map((spec) => [spec.body, spec]));

  for (const { body, x, z } of seaSignSites(specs.map((spec) => spec.body))) {
    const spec = specByBody.get(body);
    if (!spec) continue;
    const group = new Group();
    group.name = `garden-sea-sign.${spec.body}`;
    group.position.set(x, GARDEN_WATER_Y, z);
    // A board is only worth having if it can be read.
    group.rotation.y = SEA_SIGN_BOARD.yaw;

    // Two pilings and their iron collars, merged into one geometry per sign.
    const parts = [];
    for (const side of [-1, 1]) {
      const piling = new CylinderGeometry(PILING_RADIUS, PILING_RADIUS * 1.15, BOARD_BASE_Y + 1.2, 7);
      piling.translate(side * PILING_SPREAD, (BOARD_BASE_Y + 1.2) / 2 - 0.6, 0);
      parts.push(piling);
    }
    const merged = mergeGeometries(parts, false);
    if (merged) {
      const timber = new Mesh(merged, timberMaterial);
      timber.name = `garden-sea-sign-pilings.${spec.body}`;
      timber.castShadow = false;
      group.add(timber);
      timberParts.push(timber);
    }

    // The lettered face. Its own texture, so it cannot merge with the rest.
    // The texture doubles as the emissive map: by day the intensity is a
    // whisper that keeps the oak reading as oak under AgX, and after dusk the
    // hung lantern (below) justifies a lit face — without it the night scene's
    // blue light swallowed the board into navy and the name went unreadable.
    const texture = createSeaSignTexture(spec);
    const faceMaterial = new MeshStandardMaterial({
      color: "#ffffff",
      map: texture,
      emissive: new Color("#ffdfae"),
      emissiveMap: texture,
      emissiveIntensity: 0.12,
      roughness: 0.82,
    });
    const face = new Mesh(new BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_THICKNESS), faceMaterial);
    face.name = `garden-sea-sign-board.${spec.body}`;
    face.position.y = BOARD_BASE_Y;
    group.add(face);
    faceMaterials.push(faceMaterial);
    if (texture) faceTextures.push(texture);

    // N5: a hung lantern, so the board joins the Lantern Sea at night instead
    // of standing dark in it.
    const lamp = new Mesh(new CylinderGeometry(0.16, 0.2, 0.34, 6), lampMaterial);
    lamp.position.set(BOARD_WIDTH / 2 - 0.35, BOARD_BASE_Y - BOARD_HEIGHT / 2 - 0.3, 0);
    group.add(lamp);
    lampMeshes.push(lamp);
    lampPositions.push({
      x: group.position.x + Math.cos(group.rotation.y) * (BOARD_WIDTH / 2 - 0.35),
      y: GARDEN_WATER_Y + BOARD_BASE_Y,
      z: group.position.z - Math.sin(group.rotation.y) * (BOARD_WIDTH / 2 - 0.35),
    });

    root.add(group);
    signGroups.push(group);
  }

  return {
    root,
    lampPositions,
    dispose() {
      for (const texture of faceTextures) texture.dispose();
      for (const material of faceMaterials) material.dispose();
      for (const mesh of timberParts) mesh.geometry.dispose();
      timberMaterial.dispose();
      lampMaterial.dispose();
    },
    update({ zoom, visible, night }) {
      root.visible = visible;
      if (!visible) return;
      const scale = seaSignScaleForZoom(zoom);
      for (const group of signGroups) group.scale.setScalar(scale);
      // The lamp is a flat emissive; it only earns its brightness after dusk.
      lampMaterial.color.setStyle(HARBOR_PALETTE.lantern_warm);
      lampMaterial.color.multiplyScalar(0.35 + night * 1.5);
      for (const lamp of lampMeshes) lamp.visible = night > 0.05;
      // The lantern's light on the board face: day keeps the whisper, night
      // lifts the paint clear of the blue scene light.
      for (const material of faceMaterials) {
        material.emissiveIntensity = 0.12 + night * 0.5;
      }
    },
  };
}

// Texture resolution per board. Wide because the lettering is wide-tracked and
// has to stay crisp when the board is scaled up at overview framing (D6).
const SIGN_TEXTURE_WIDTH = 1024;
const SIGN_TEXTURE_HEIGHT = 272;

/**
 * The board face: weathered oak with painted, wide-tracked capitals.
 *
 * Typeset in EB Garamond, which the app already ships and loads as `PV Plaque`
 * (src/pharosville.css) — no new asset and no new licence. If the face has not
 * finished loading the canvas falls back to a serif stack, which is the same
 * treatment `garden-sail-texture.ts` uses.
 */
function createSeaSignTexture(spec: SeaSignSpec): CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = SIGN_TEXTURE_WIDTH;
  canvas.height = SIGN_TEXTURE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;

  // Oak ground, with a grain so the plank does not read as a UI panel.
  // Painted well above the target read: AgX and the scene light take the
  // board down a band or more, so #7d5f3d rendered as murk, not wood.
  context.fillStyle = "#a87e50";
  context.fillRect(0, 0, SIGN_TEXTURE_WIDTH, SIGN_TEXTURE_HEIGHT);
  context.strokeStyle = "rgba(58, 40, 22, 0.22)";
  context.lineWidth = 2;
  for (let index = 0; index < 14; index += 1) {
    const y = ((index + 0.5) / 14) * SIGN_TEXTURE_HEIGHT;
    context.beginPath();
    context.moveTo(0, y);
    context.bezierCurveTo(
      SIGN_TEXTURE_WIDTH * 0.3, y + (index % 3 - 1) * 5,
      SIGN_TEXTURE_WIDTH * 0.7, y - (index % 2) * 6,
      SIGN_TEXTURE_WIDTH, y + (index % 4 - 2) * 3,
    );
    context.stroke();
  }
  // Chamfered edge, so the plank reads as a thick board.
  context.strokeStyle = "rgba(40, 26, 14, 0.55)";
  context.lineWidth = 10;
  context.strokeRect(5, 5, SIGN_TEXTURE_WIDTH - 10, SIGN_TEXTURE_HEIGHT - 10);
  // Iron banding across the top and bottom rails. Painted rather than modelled:
  // as geometry it was two extra meshes on every board, and at the draw-call
  // ceiling that mattered more than the millimetre of relief it bought.
  context.fillStyle = "rgba(26, 22, 18, 0.92)";
  context.fillRect(0, 0, SIGN_TEXTURE_WIDTH, 22);
  context.fillRect(0, SIGN_TEXTURE_HEIGHT - 22, SIGN_TEXTURE_WIDTH, 22);
  context.fillStyle = "rgba(120, 108, 92, 0.5)";
  for (let index = 0; index < 8; index += 1) {
    const x = ((index + 0.5) / 8) * SIGN_TEXTURE_WIDTH;
    context.beginPath();
    context.arc(x, 11, 5, 0, Math.PI * 2);
    context.arc(x, SIGN_TEXTURE_HEIGHT - 11, 5, 0, Math.PI * 2);
    context.fill();
  }

  const centreX = SIGN_TEXTURE_WIDTH / 2;
  const nameY = spec.reading ? SIGN_TEXTURE_HEIGHT * 0.42 : SIGN_TEXTURE_HEIGHT * 0.58;

  context.textAlign = "center";
  context.textBaseline = "middle";
  // Painted lettering with a dark rim, not an offset "carved" ghost. The
  // ghost doubled every edge, and at the on-screen sizes the boards actually
  // render at it read as broken glyphs, not relief. A stroke under the fill
  // keeps every edge crisp at any scale.
  const name = spec.label.toUpperCase();
  context.font = `700 108px "PV Plaque", Georgia, "Times New Roman", serif`;
  context.letterSpacing = "10px";
  context.lineJoin = "round";
  context.strokeStyle = "rgba(43, 27, 12, 0.95)";
  context.lineWidth = 10;
  context.strokeText(name, centreX, nameY, SIGN_TEXTURE_WIDTH * 0.88);
  // Bone-white paint, not the band accent. The DEWS accents are a green, a
  // teal, a yellow, an orange and a red; on weathered oak they all go muddy and
  // the name stops reading. The accent earns its place on the rule beneath,
  // where it sits against the dark ironwork and stays a band cue.
  context.fillStyle = "#f8eed8";
  context.fillText(name, centreX, nameY, SIGN_TEXTURE_WIDTH * 0.88);
  context.fillStyle = spec.accent;
  context.fillRect(centreX - SIGN_TEXTURE_WIDTH * 0.3, nameY + 58, SIGN_TEXTURE_WIDTH * 0.6, 6);

  if (spec.reading) {
    context.font = `700 48px "PV Plaque", Georgia, "Times New Roman", serif`;
    context.letterSpacing = "8px";
    context.strokeStyle = "rgba(43, 27, 12, 0.9)";
    context.lineWidth = 8;
    context.strokeText(spec.reading.toUpperCase(), centreX, SIGN_TEXTURE_HEIGHT * 0.74, SIGN_TEXTURE_WIDTH * 0.8);
    context.fillStyle = "#f2e5c8";
    context.fillText(spec.reading.toUpperCase(), centreX, SIGN_TEXTURE_HEIGHT * 0.74, SIGN_TEXTURE_WIDTH * 0.8);
  }

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  // The board renders far below texture resolution and at 45° to the camera:
  // without mipmaps the minified lettering aliased into mush, and without
  // anisotropy the mipmaps alone smear it along the oblique axis.
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
}
