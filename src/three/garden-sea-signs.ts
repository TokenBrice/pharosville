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
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SeaBodyName } from "../systems/sea-bodies";
import { GARDEN_WATER_Y } from "../systems/garden-observatory-slice";
import {
  BOARD_BASE_Y,
  BOARD_HEIGHT,
  BOARD_THICKNESS,
  BOARD_WIDTH,
  PILING_RADIUS,
  PILING_SPREAD,
  SEA_SIGN_BOARD,
  createSeaSignScaleTrack,
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
 * W0.7 quantized that response to three rungs
 * (`garden-sea-sign-siting.ts`). The end states are the ones D6 was reviewed
 * at; what went is the continuous tracking in between, which made the boards
 * the only thing in the world that visibly animated AGAINST a zoom gesture.
 * Inside a rung the board is an ordinary world object; crossing one is a
 * single 0.45 s settle, instant under reduced motion.
 *
 * ## Cost
 *
 * One merged geometry for every board's timber, and one instanced-free mesh per
 * sign for the lettered face. Every face samples one padded cell in a shared
 * atlas, so seven bodies remain eight draw calls but cost one texture rather
 * than seven.
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
    /**
     * World-clock seconds since the previous frame, for the D6 step settle.
     *
     * Supplied by the world renderer from the frame it is drawing. Optional
     * only so a caller can omit it deliberately, in which case the settle is
     * taken WHOLE — an unclocked caller gets the settled rung rather than a
     * board frozen part-way through an ease nobody is advancing.
     */
    deltaSeconds?: number;
    /**
     * Forces the settle to be instant and the rung to be the pure function of
     * zoom. Supplied by the world renderer from the frame's motion policy, like
     * every other eased system in the scene. Absent, motion is allowed.
     */
    reducedMotion?: boolean;
    /** Camera zoom; drives the D6 quantized on-screen scaling. */
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
export {
  BOARD_BASE_Y,
  BOARD_HEIGHT,
  BOARD_WIDTH,
  SEA_SIGN_BOARD,
  SEA_SIGN_SCALE_STEPS,
  SEA_SIGN_STEP_FADE_SECONDS,
  SEA_SIGN_STEP_HYSTERESIS,
  SEA_SIGN_STEP_ZOOMS,
  createSeaSignScaleTrack,
  seaSignBoards,
  seaSignScaleForZoom,
  seaSignSites,
  seaSignStepForZoom,
  seaSignStepWithHysteresis,
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
  const lampMeshes: Mesh[] = [];
  const lampPositions: { x: number; y: number; z: number }[] = [];
  const signGroups: Group[] = [];

  const specByBody = new Map(specs.map((spec) => [spec.body, spec]));
  const signEntries = seaSignSites(specs.map((spec) => spec.body))
    .flatMap((site) => {
      const spec = specByBody.get(site.body);
      return spec ? [{ site, spec }] : [];
    });
  const faceAtlas = createSeaSignAtlas(signEntries.map(({ spec }) => spec));
  const faceMaterial = new MeshStandardMaterial({
    color: "#ffffff",
    map: faceAtlas?.texture ?? null,
    emissive: new Color("#ffdfae"),
    emissiveMap: faceAtlas?.texture ?? null,
    emissiveIntensity: 0.12,
    roughness: 0.82,
  });

  for (let signIndex = 0; signIndex < signEntries.length; signIndex += 1) {
    const { site: { x, z }, spec } = signEntries[signIndex]!;
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

    // The lettered face. Its atlas cell doubles as the emissive map: by day
    // the intensity is a
    // whisper that keeps the oak reading as oak under AgX, and after dusk the
    // hung lantern (below) justifies a lit face — without it the night scene's
    // blue light swallowed the board into navy and the name went unreadable.
    const faceGeometry = new BoxGeometry(BOARD_WIDTH, BOARD_HEIGHT, BOARD_THICKNESS);
    const atlasCell = faceAtlas?.cells[signIndex];
    if (atlasCell) remapSeaSignUvs(faceGeometry, atlasCell);
    const face = new Mesh(faceGeometry, faceMaterial);
    face.name = `garden-sea-sign-board.${spec.body}`;
    face.position.y = BOARD_BASE_Y;
    group.add(face);

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

  const scaleTrack = createSeaSignScaleTrack();
  let appliedScale = 0;

  return {
    root,
    lampPositions,
    dispose() {
      faceAtlas?.texture.dispose();
      faceMaterial.dispose();
      for (const mesh of timberParts) mesh.geometry.dispose();
      timberMaterial.dispose();
      lampMaterial.dispose();
    },
    update({ deltaSeconds, night, reducedMotion, visible, zoom }) {
      root.visible = visible;
      // The track advances on hidden frames too. The boards stand down while a
      // detail panel owns the frame and the camera keeps moving behind it — a
      // rung settled off screen is one the board does not have to perform on
      // its way back in.
      const scale = scaleTrack.advance({
        // The frame's numbers take precedence and the world renderer always
        // supplies both. The fallbacks are only for a caller with no frame to
        // speak of: an infinite delta lands the rung settled rather than
        // stranded mid-ease, and motion is allowed unless a frame says
        // otherwise — the still frame's own update passes `reducedMotion`.
        deltaSeconds: deltaSeconds ?? Number.POSITIVE_INFINITY,
        reducedMotion: reducedMotion ?? false,
        zoom,
      });
      if (!visible) return;
      if (scale !== appliedScale) {
        appliedScale = scale;
        for (const group of signGroups) group.scale.setScalar(scale);
      }
      // The lamp is a flat emissive; it only earns its brightness after dusk.
      lampMaterial.color.setStyle(HARBOR_PALETTE.lantern_warm);
      lampMaterial.color.multiplyScalar(0.35 + night * 1.5);
      for (const lamp of lampMeshes) lamp.visible = night > 0.05;
      // The lantern's light on the board face: day keeps the whisper, night
      // lifts the paint clear of the blue scene light.
      faceMaterial.emissiveIntensity = 0.12 + night * 0.5;
    },
  };
}

// Texture resolution per board. Wide because the lettering is wide-tracked and
// has to stay crisp when the board is scaled up at overview framing (D6).
const SIGN_TEXTURE_WIDTH = 1024;
const SIGN_TEXTURE_HEIGHT = 272;
/**
 * The iron rail across the top and bottom of the plank — and, since W0.5, the
 * only ground on the board dark enough to carry the band accent at contrast.
 */
const SIGN_IRON_BAND_HEIGHT = 22;
const SIGN_ATLAS_CELL_GUTTER = 8;
const SIGN_ATLAS_MAX_HEIGHT = 2048;

interface SeaSignAtlasCell {
  uMax: number;
  uMin: number;
  vMax: number;
  vMin: number;
}

interface SeaSignAtlas {
  cells: SeaSignAtlasCell[];
  texture: CanvasTexture;
}

/**
 * The board face: weathered oak with painted, wide-tracked capitals.
 *
 * Typeset in EB Garamond, which the app already ships and loads as `PV Plaque`
 * (src/pharosville.css) — no new asset and no new licence. If the face has not
 * finished loading the canvas falls back to a serif stack, which is the same
 * treatment `garden-sail-texture.ts` uses.
 */
function createSeaSignAtlas(specs: readonly SeaSignSpec[]): SeaSignAtlas | null {
  if (specs.length === 0) return null;
  if (typeof document === "undefined") return null;
  const columns = specs.length > 7 ? 2 : 1;
  const rows = Math.ceil(specs.length / columns);
  const requiredHeight = rows * (SIGN_TEXTURE_HEIGHT + SIGN_ATLAS_CELL_GUTTER * 2);
  if (requiredHeight > SIGN_ATLAS_MAX_HEIGHT) {
    throw new Error(`Sea-sign atlas exceeds ${SIGN_ATLAS_MAX_HEIGHT}px for ${specs.length} signs.`);
  }
  const atlasHeight = Math.min(
    SIGN_ATLAS_MAX_HEIGHT,
    2 ** Math.ceil(Math.log2(requiredHeight)),
  );
  const atlasWidth = SIGN_TEXTURE_WIDTH * columns;
  const cellStride = Math.floor(atlasHeight / rows);
  const canvas = document.createElement("canvas");
  canvas.width = atlasWidth;
  canvas.height = atlasHeight;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const cells: SeaSignAtlasCell[] = [];
  for (let index = 0; index < specs.length; index += 1) {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const cellLeft = column * SIGN_TEXTURE_WIDTH;
    const cellTop = row * cellStride
      + Math.floor((cellStride - SIGN_TEXTURE_HEIGHT) / 2);
    context.save();
    context.translate(cellLeft, cellTop);
    paintSeaSign(context, specs[index]!);
    context.restore();
    // CanvasTexture.flipY maps canvas top to texture V=1. Preserve the same
    // per-board orientation the old one-canvas-per-sign textures had.
    cells.push({
      uMax: (cellLeft + SIGN_TEXTURE_WIDTH) / atlasWidth,
      uMin: cellLeft / atlasWidth,
      vMax: 1 - cellTop / atlasHeight,
      vMin: 1 - (cellTop + SIGN_TEXTURE_HEIGHT) / atlasHeight,
    });
  }

  const texture = new CanvasTexture(canvas);
  texture.name = "garden-sea-sign-atlas";
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  // The board renders far below texture resolution and at 45° to the camera:
  // without mipmaps the minified lettering aliased into mush, and without
  // anisotropy the mipmaps alone smear it along the oblique axis.
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return { cells, texture };
}

function paintSeaSign(
  context: CanvasRenderingContext2D,
  spec: SeaSignSpec,
): void {
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
  context.fillRect(0, 0, SIGN_TEXTURE_WIDTH, SIGN_IRON_BAND_HEIGHT);
  context.fillRect(
    0,
    SIGN_TEXTURE_HEIGHT - SIGN_IRON_BAND_HEIGHT,
    SIGN_TEXTURE_WIDTH,
    SIGN_IRON_BAND_HEIGHT,
  );
  context.fillStyle = "rgba(120, 108, 92, 0.5)";
  for (let index = 0; index < 8; index += 1) {
    const x = ((index + 0.5) / 8) * SIGN_TEXTURE_WIDTH;
    context.beginPath();
    context.arc(x, SIGN_IRON_BAND_HEIGHT / 2, 5, 0, Math.PI * 2);
    context.arc(x, SIGN_TEXTURE_HEIGHT - SIGN_IRON_BAND_HEIGHT / 2, 5, 0, Math.PI * 2);
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
  // Bone-white paint, not the band accent: on weathered oak every DEWS accent
  // goes muddy and the name stops reading. The accent earns its place on the
  // rule below instead.
  context.fillStyle = "#f8eed8";
  context.fillText(name, centreX, nameY, SIGN_TEXTURE_WIDTH * 0.88);

  // The band accent, as a rule laid along the BOTTOM IRON RAIL — not on the
  // oak, where this used to sit and where the comment above it claimed the
  // ironwork was.
  //
  // Oak (#a87e50) has a relative luminance of 0.238, and nothing chromatic can
  // clear 3:1 against a ground that mid: it would need luminance above 0.815
  // or below 0.046, and the W0.5 accent ladder runs 0.501 down to 0.199, so
  // danger read at about 1.2:1 there — a cue only if you already knew it was a
  // cue. The rail is the one dark ground the board owns: the ironwork
  // composites to #251f17 over the oak, which takes the same five accents
  // (#94c7ac, #6fb6ae, #b7954c, #c97344, #d54e3c) to 8.6, 7.0, 5.8, 4.7 and
  // 3.9:1 — every band clear of 3:1, danger included.
  //
  // Seated a few pixels INSIDE the rail rather than flush with its top edge:
  // the board renders far below texture resolution, so a rule laid on the
  // seam mips half of itself back into the oak it was moved off. Three pixels
  // of iron above it and the rivet row below keep it on the dark ground at
  // every mip. The band NAME remains the primary channel; hue is never alone.
  context.fillStyle = spec.accent;
  context.fillRect(
    centreX - SIGN_TEXTURE_WIDTH * 0.3,
    SIGN_TEXTURE_HEIGHT - SIGN_IRON_BAND_HEIGHT + 3,
    SIGN_TEXTURE_WIDTH * 0.6,
    7,
  );

  if (spec.reading) {
    context.font = `700 48px "PV Plaque", Georgia, "Times New Roman", serif`;
    context.letterSpacing = "8px";
    context.strokeStyle = "rgba(43, 27, 12, 0.9)";
    context.lineWidth = 8;
    context.strokeText(spec.reading.toUpperCase(), centreX, SIGN_TEXTURE_HEIGHT * 0.74, SIGN_TEXTURE_WIDTH * 0.8);
    context.fillStyle = "#f2e5c8";
    context.fillText(spec.reading.toUpperCase(), centreX, SIGN_TEXTURE_HEIGHT * 0.74, SIGN_TEXTURE_WIDTH * 0.8);
  }

}

function remapSeaSignUvs(
  geometry: BoxGeometry,
  cell: SeaSignAtlasCell,
): void {
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
