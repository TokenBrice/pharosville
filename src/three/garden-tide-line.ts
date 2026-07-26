import {
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
} from "three";
import { HARBOR_PALETTE } from "../systems/palette";
import type { SupplyTide } from "../systems/supply-tide";

/**
 * Where the tide line falls on a piece of sea-washed stone.
 *
 * Pure arithmetic, shared by the island's rock terraces and the harbours' quay
 * walls so the two cannot drift: a band that sat at one height on the island and
 * another on the quays would not read as one tide.

 * The quay wall, not the pilings: a pile spans dock-local y -2.7 to -0.1
 * against a waterline at -0.2, so a tenth of a unit of it stands above water
 * and it cannot hold a 0.9-unit band at any legible size.
 *
 * ## The reading
 *
 * A fixed DATUM notch is cut into the stone at a constant height — the harbour
 * datum plate every real port carries, and the reference that makes this cue
 * readable at all. The wet band's top edge, the strandline, then moves against
 * it:
 *
 * - Strandline ABOVE the datum: the water has drawn back and bared wet stone.
 *   Supply shrank over the week (ebb).
 * - Strandline BELOW the datum: the water stands high and there is little bare
 *   wet stone to see. Supply grew (flood).
 * - Strandline exactly ON the datum: slack water, a flat week.
 * - No notch and no band at all: no chains payload. Distinct from all three
 *   above, because a cue that cannot say "I do not know" will eventually lie.
 *
 * Direction is therefore POSITION AGAINST A VISIBLE REFERENCE, not colour. That
 * matters twice over: colour alone would be ambiguous, and the pale end of the
 * palette is already spoken for — `garden-tide-stain.ts` uses bleached salt
 * courses on the lighthouse terrace for the 30-day worst PSI band. This band is
 * DARK WET STONE on the quay walls and shore rock. Different surface, different
 * value, different sentence.
 *
 * ## Cost
 *
 * None. Both consumers already paint their vertices, so the band rides existing
 * geometry and existing draw calls. Nothing here allocates or animates: a tide
 * that crept would be inventing a rate the weekly figure does not report, so the
 * reduced-motion presentation is identical by construction.
 */

/**
 * Height of the datum notch above still water, in world units, and half the
 * band's full excursion.
 *
 * Set by the shortest surface that has to carry the band. A harbour's quay wall
 * runs from dock-local -0.44 to +0.48 against a waterline at -0.2, so there are
 * 0.68 units of wall above the water before the coping lip; a larger datum would
 * stand the plate proud of the stonework it is supposed to be painted on. 0.34
 * therefore puts the full swing at exactly 0.68 and the notch at mid-face.
 *
 * The island rock has far more height to spare, but it uses the same constant on
 * purpose — a band that sat at one height on the shore and another on the quays
 * would not read as one tide.
 */
export const TIDE_DATUM_RISE = 0.34;

/** Vertical thickness of the datum notch itself. Thin enough to read as scored. */
export const TIDE_DATUM_THICKNESS = 0.07;

/** How far below the strandline the extra wetting fades out. */
const WET_FALLOFF = 0.38;

export interface TideLineSample {
  /** 0..1 extra wetting, hard-edged at the strandline and fading downward. */
  wet: number;
  /** 0..1 presence of the fixed datum notch at this height. */
  datum: number;
}

const DRY_STONE: TideLineSample = { datum: 0, wet: 0 };

/** World height of the strandline — the wet band's top edge — above still water. */
export function tideStrandlineRise(tide: SupplyTide): number {
  return TIDE_DATUM_RISE * (1 - tide.offset);
}

/**
 * Samples the band at `rise` world units above the still-water line. Heights at
 * or below the water are left alone: the sea already colours what it covers, and
 * darkening it again would only muddy the waterline the band is measured from.
 */
export function sampleTideLine(rise: number, tide: SupplyTide): TideLineSample {
  if (tide.state === "unavailable" || rise <= 0) return DRY_STONE;

  const strandline = tideStrandlineRise(tide);
  // Hard top edge, soft bottom: a strandline is a line, and the wetness below it
  // grades away rather than stopping. The hard edge is the whole read.
  const wet = rise > strandline
    ? 0
    : Math.min(1, (strandline - rise) / WET_FALLOFF) * 0.35 + 0.65;

  const datum = Math.abs(rise - TIDE_DATUM_RISE) <= TIDE_DATUM_THICKNESS / 2 ? 1 : 0;
  return { datum, wet };
}

/**
 * The harbour half of the cue: one plate of banded stone on each quay's
 * seaward face.
 *
 * The tide is a single global reading, so every harbour's plate is identical —
 * which is what lets the whole ring share ONE geometry and ONE InstancedMesh,
 * and therefore one draw call for the world. The band and the datum notch are
 * baked in as vertex colours at compose time; a data refresh rebuilds the world
 * and with it this mesh, exactly as every other composed cue does.
 */

/** Height of the plate above still water. Covers the band's full excursion. */
const PLATE_RISE = TIDE_DATUM_RISE * 2;
/** Vertical rows across the plate. Enough to place a crisp strandline edge. */
const PLATE_ROWS = 24;

export interface TideLinePlateSpec {
  /** Dock detail id, carried so a later hit-test pass can find these. */
  detailId: string;
  /** World-space centre of the face at the still-water line. */
  x: number;
  y: number;
  z: number;
  width: number;
  /** Harbour yaw, so the plate lies flat against its own quay. */
  yaw: number;
}

export interface GardenTideLine {
  readonly root: Group;
  /** How many harbours carry a plate. */
  readonly count: number;
  dispose(): void;
}

/**
 * A vertical strip, `PLATE_ROWS` rows tall, coloured by `sampleTideLine`.
 *
 * Rows rather than a texture: the band is three flat zones and a scored line,
 * which is what vertex colours are for, and a texture would be a second asset
 * to load and a second thing to keep in step with the island's own painting.
 */
function createPlateGeometry(tide: SupplyTide): BufferGeometry {
  const geometry = new PlaneGeometry(1, PLATE_RISE, 1, PLATE_ROWS);
  // Plane is built centred; lift it so its base sits on the waterline.
  geometry.translate(0, PLATE_RISE / 2, 0);
  const positions = geometry.getAttribute("position");
  const colors = new Float32Array(positions.count * 3);
  const color = new Color();
  for (let index = 0; index < positions.count; index += 1) {
    const { datum, wet } = sampleTideLine(positions.getY(index), tide);
    color.copy(PLATE_DRY);
    if (wet > 0) color.lerp(PLATE_WET, wet);
    if (datum > 0) color.copy(PLATE_DATUM);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return geometry;
}

// Dry quay stone, the same value the harbour's own masonry uses, so the plate
// disappears into the wall everywhere the tide is not marking it.
const PLATE_DRY = new Color("#8e8877");
const PLATE_WET = new Color(HARBOR_PALETTE.iron_dark).lerp(new Color("#2b3630"), 0.5);
const PLATE_DATUM = new Color(HARBOR_PALETTE.iron_dark);

export function createGardenTideLine(
  specs: readonly TideLinePlateSpec[],
  tide: SupplyTide,
): GardenTideLine {
  const root = new Group();
  // Named for the overview LOD policy: the band is a ~0.9-unit feature and
  // cannot read at whole-map framing. Built even when empty so the name always
  // resolves in the composed world.
  root.name = "dock-tide-line";
  if (specs.length === 0 || tide.state === "unavailable") {
    return { root, count: 0, dispose() {} };
  }

  const geometry = createPlateGeometry(tide);
  const material = new MeshStandardMaterial({
    flatShading: true,
    roughness: 0.95,
    // The quay face is a flat wall the camera sees from one side only, but the
    // harbour ring yaws each quay differently, so both faces have to shade.
    side: DoubleSide,
    vertexColors: true,
  });
  const mesh = new InstancedMesh(geometry, material, specs.length);
  mesh.name = "dock-tide-line-plates";
  mesh.receiveShadow = true;

  const dummy = new Object3D();
  for (const [index, spec] of specs.entries()) {
    dummy.position.set(spec.x, spec.y, spec.z);
    dummy.rotation.set(0, spec.yaw, 0);
    dummy.scale.set(spec.width, 1, 1);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = false;
  root.add(mesh);

  return {
    root,
    count: specs.length,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
