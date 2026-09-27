import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { gardenAnniversaryEvening } from "../systems/garden-anniversary";
import type { GardenRitualHandler } from "../systems/garden-director";
import { HARBOR_PALETTE } from "../systems/palette";
import { worldCalendarDate } from "../systems/season";
import { STONE_GARDEN_SITE } from "../systems/world-layout";
import type { GraveFamily, GraveNode } from "../systems/world-types";
import { chainGardenMaterialPatch } from "./garden-aerial";
import type { GardenLandmarkAnchor } from "./garden-landmarks";
import { bindGardenKindleUniforms, GARDEN_KINDLE_ORDER, gardenLanternKindleState } from "./garden-lanterns";
import { GARDEN_RIM_COLOR_HEX, gardenRimHeightAt } from "./garden-rim-mesh";
import { createSetStoneGeometry, type SetStoneForm } from "./garden-set-stones";
import { stableUnit } from "./garden-util";

/**
 * X1 (O8, K29; data-poetry-2, harbour-4) — the stone garden of the fallen.
 *
 * On the Wreck Shoal's south shore, outside the rest frame, a raked gravel
 * bed holds one unmarked set stone for every stablecoin that died. The seats
 * come from the world layout (`graveNodesFromEntries`): stone size is peak
 * market cap (log), and the stones gather by how the coin died into a few odd
 * islands with open gravel between the families. Stone form follows the
 * family too (reclining where the peg broke, arching where a counterparty
 * failed, flat where the coin was wound down), so colour carries nothing.
 * No text stands in the world; the detail panel and the ledger say it.
 *
 * One stone lantern stands at the bed's water edge. It is lit only on the
 * anniversary evening of a month in which coins fell (`garden-anniversary`),
 * kindled with the lamps (the kindling ladder) and by the day score's
 * `anniversary-lantern` companion, 60 s into the keeper's walk.
 *
 * Draws: the gravel bed, the stones and lantern body (one merged static
 * geometry), and the lantern's fire box. 0 textures.
 */

const TILE_SCALE = Math.SQRT2;
/** The rake reads rings round the stones at least this large (world units). */
const RING_STONE_SIZE = 0.45;
const RING_STONE_CAP = 16;
const RAKE_SPACING = 0.16;
/** The bed rides this far over the rim's own surface, clear of its facets without an offset. */
const BED_LIFT = 0.1;
/**
 * Where the lantern kindles in the K20 ladder: straight after the Pharos
 * lantern catches, with the first station lamps, so on an anniversary it is
 * burning by the blue hour.
 */
const ANNIVERSARY_LANTERN_ORDER = GARDEN_KINDLE_ORDER.stationNearest;
/** Its ember at full flame: below the harbour window tier, far below the beacon. */
export const ANNIVERSARY_LANTERN_EMBER = 1.15;
/** How long the lantern takes to catch when the ritual lights it. */
const ANNIVERSARY_CATCH_SECONDS = 8;
/** How often the world calendar date is re-read. */
const CALENDAR_REFRESH_SECONDS = 30;
/** The ritual's ledger beat. */
const ANNIVERSARY_HOLD_SECONDS = 45;

export const STONE_GARDEN_BED_NAME = "stone-garden-bed";
export const STONE_GARDEN_STONES_NAME = "stone-garden-stones";
export const STONE_GARDEN_LANTERN_NAME = "stone-garden-anniversary-lantern";

const FAMILY_FORM: Readonly<Record<GraveFamily, SetStoneForm>> = {
  "lost-peg": "reclining",
  counterparty: "arching",
  "wound-down": "flat",
};

/** Pale grey gravel: the rim's raked gravel cooled toward the mist, never sand. */
const GRAVEL = new Color(GARDEN_RIM_COLOR_HEX.rakedGravel).lerp(new Color(HARBOR_PALETTE.fog_pale), 0.35);
const KERB = new Color(HARBOR_PALETTE.stone_mid).lerp(new Color(HARBOR_PALETTE.stone_dark), 0.4);
const LANTERN_STONE = new Color(HARBOR_PALETTE.stone_pale).lerp(new Color(HARBOR_PALETTE.stone_mid), 0.45);

export interface GardenStoneGarden {
  anchors: ReadonlyMap<string, GardenLandmarkAnchor<"grave">>;
  root: Group;
  /** The day score's `anniversary-lantern` companion. */
  ritual: GardenRitualHandler;
  /**
   * Once per frame with the world clock hour. The world calendar date is read
   * every half minute (or given, in tests); allocation-free otherwise.
   */
  update(input: { date?: Date; hour: number; deltaSeconds: number; reducedMotion: boolean }): void;
  dispose(): void;
}

function tileToWorld(x: number, y: number): Vector3 {
  return new Vector3(x * TILE_SCALE, gardenRimHeightAt(x, y), y * TILE_SCALE);
}

/** The bed: a draped polar grid over the site ellipse, a darker kerb at its rim. */
function createBedGeometry(): BufferGeometry {
  const rings = 12;
  const spokes = 72;
  const { x: cx, y: cy, rx, ry } = STONE_GARDEN_SITE;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const color = new Color();
  positions.push(cx * TILE_SCALE, gardenRimHeightAt(cx, cy) + BED_LIFT, cy * TILE_SCALE);
  GRAVEL.toArray(colors, 0);
  for (let ring = 1; ring <= rings; ring += 1) {
    const r = ring / rings;
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const angle = (spoke / spokes) * Math.PI * 2;
      const x = cx + Math.cos(angle) * rx * r;
      const y = cy + Math.sin(angle) * ry * r;
      // The outer ring tucks to the ground so the bed's edge never floats.
      positions.push(x * TILE_SCALE, gardenRimHeightAt(x, y) + (ring === rings ? 0.02 : BED_LIFT), y * TILE_SCALE);
      color.copy(GRAVEL).lerp(KERB, ring >= rings - 1 ? 0.85 : 0);
      colors.push(color.r, color.g, color.b);
    }
  }
  for (let spoke = 0; spoke < spokes; spoke += 1) {
    const next = (spoke + 1) % spokes;
    indices.push(0, 1 + next, 1 + spoke);
  }
  for (let ring = 1; ring < rings; ring += 1) {
    const inner = 1 + (ring - 1) * spokes;
    const outer = 1 + ring * spokes;
    for (let spoke = 0; spoke < spokes; spoke += 1) {
      const next = (spoke + 1) % spokes;
      indices.push(inner + spoke, inner + next, outer + spoke, inner + next, outer + next, outer + spoke);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * The rake, drawn in the fragment as value only: concentric rings round the
 * larger stones, straight furrows along the bed elsewhere. Faded where a
 * furrow is under two pixels, so there is no moiré and no 1-px line far off.
 */
function patchRake(material: MeshStandardMaterial, rings: readonly Vector3[]): void {
  const hearts = Array.from({ length: RING_STONE_CAP }, (_, index) => rings[index]?.clone() ?? new Vector3(0, 0, -1));
  const uniform = { value: hearts };
  chainGardenMaterialPatch(material, {
    key: "stone-garden-rake-v1",
    compile: (shader) => {
      shader.uniforms.uStoneGardenRings = uniform;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vRakeXZ;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRakeXZ = position.xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", `#include <common>\nuniform vec3 uStoneGardenRings[${RING_STONE_CAP}];\nvarying vec2 vRakeXZ;`)
        .replace("#include <color_fragment>", `#include <color_fragment>
{
  float rakeRing = 1e4;
  for (int i = 0; i < ${RING_STONE_CAP}; i++) {
    vec3 heart = uStoneGardenRings[i];
    if (heart.z > 0.0) rakeRing = min(rakeRing, distance(vRakeXZ, heart.xy) - heart.z);
  }
  float rakeRinged = 1.0 - smoothstep(0.55, 0.75, rakeRing);
  float rakeCoord = mix(vRakeXZ.y, max(rakeRing, 0.0), rakeRinged) / ${RAKE_SPACING.toFixed(3)};
  float rakeFurrow = abs(fract(rakeCoord) - 0.5) * 2.0;
  float rakeResolve = 1.0 - smoothstep(0.3, 0.6, fwidth(rakeCoord));
  diffuseColor.rgb *= 1.0 - 0.14 * smoothstep(0.55, 0.95, rakeFurrow) * rakeResolve;
}`);
    },
  });
}

/** A stone tōrō: base, shaft, platform and cap, stone-coloured, 1.3 u tall. */
function lanternBodyGeometry(origin: Vector3, yaw: number): BufferGeometry {
  const parts = [
    new CylinderGeometry(0.26, 0.3, 0.14, 6).translate(0, 0.07, 0),
    new CylinderGeometry(0.09, 0.11, 0.6, 6).translate(0, 0.44, 0),
    new BoxGeometry(0.46, 0.08, 0.46).translate(0, 0.78, 0),
    new ConeGeometry(0.38, 0.24, 4).rotateY(Math.PI / 4).translate(0, 1.2, 0),
    new CylinderGeometry(0.03, 0.06, 0.12, 6).translate(0, 1.37, 0),
  ];
  for (const part of parts) {
    part.deleteAttribute("uv");
    const count = part.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let index = 0; index < count; index += 1) LANTERN_STONE.toArray(colors, index * 3);
    part.setAttribute("color", new BufferAttribute(colors, 3));
  }
  const geometry = mergeGeometries(parts.map((part) => part.index ? part.toNonIndexed() : part), false)!;
  for (const part of parts) part.dispose();
  geometry.rotateY(yaw);
  geometry.translate(origin.x, origin.y - 0.04, origin.z);
  return geometry;
}

function stoneGeometry(grave: GraveNode): BufferGeometry {
  const size = grave.visual.scale;
  const geometry = createSetStoneGeometry(grave.id, FAMILY_FORM[grave.visual.family], size > 0.45 ? 3 : 2);
  const indexed = geometry.index ? geometry.toNonIndexed() : geometry;
  if (indexed !== geometry) geometry.dispose();
  const seat = tileToWorld(grave.tile.x, grave.tile.y);
  // Faces run with the bed, turned a little each; a hair of value per stone.
  indexed.scale(size, size, size);
  indexed.rotateY((stableUnit(`${grave.id}.yaw`) - 0.5) * 1.2);
  indexed.translate(seat.x, seat.y + 0.04, seat.z);
  const tone = 0.9 + stableUnit(`${grave.id}.tone`) * 0.14;
  const colors = indexed.getAttribute("color");
  for (let index = 0; index < colors.count; index += 1) {
    colors.setXYZ(index, colors.getX(index) * tone, colors.getY(index) * tone, colors.getZ(index) * tone);
  }
  return indexed;
}

export function createGardenStoneGarden(graves: readonly GraveNode[]): GardenStoneGarden {
  const root = new Group();
  root.name = "garden-stone-garden";

  const anchors = new Map<string, GardenLandmarkAnchor<"grave">>();
  for (const grave of graves) {
    const anchor = new Object3D() as GardenLandmarkAnchor<"grave">;
    anchor.userData = {
      detailId: grave.detailId,
      entityId: grave.id,
      kind: "grave",
      label: grave.label,
      selectionRadius: 0.5 + grave.visual.scale * 0.8,
    };
    anchor.name = `stone-garden-anchor:${grave.id}`;
    const seat = tileToWorld(grave.tile.x, grave.tile.y);
    anchor.position.set(seat.x, seat.y + grave.visual.scale * 0.4, seat.z);
    root.add(anchor);
    anchors.set(grave.detailId, anchor);
  }

  const bedMaterial = new MeshStandardMaterial({
    envMapIntensity: 0.3,
    roughness: 1,
    vertexColors: true,
  });
  const ringStones = graves
    .filter((grave) => grave.visual.scale >= RING_STONE_SIZE)
    .toSorted((a, b) => b.visual.scale - a.visual.scale || a.id.localeCompare(b.id))
    .slice(0, RING_STONE_CAP)
    .map((grave) => new Vector3(grave.tile.x * TILE_SCALE, grave.tile.y * TILE_SCALE, grave.visual.scale * 0.85));
  patchRake(bedMaterial, ringStones);
  const bed = new Mesh(createBedGeometry(), bedMaterial);
  bed.name = STONE_GARDEN_BED_NAME;
  bed.receiveShadow = true;
  root.add(bed);

  // The lantern stands on the bed's water edge, facing the shoal.
  const { x: cx, y: cy, rx, ry } = STONE_GARDEN_SITE;
  const lanternSeat = tileToWorld(cx + rx * 0.12, cy - ry - 0.45);
  const lanternYaw = Math.PI / 4;
  const parts = graves.map(stoneGeometry);
  parts.push(lanternBodyGeometry(lanternSeat, lanternYaw));
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error("Could not merge the stone garden.");
  const stones = new Mesh(
    merged,
    new MeshStandardMaterial({ envMapIntensity: 0.3, roughness: 1, vertexColors: true }),
  );
  stones.name = STONE_GARDEN_STONES_NAME;
  stones.castShadow = true;
  stones.receiveShadow = true;
  root.add(stones);

  // The fire box: a dark opening by day and every night but the anniversary.
  const lit = { value: 0 };
  const flame = { value: 0 };
  const lampMaterial = new MeshStandardMaterial({
    color: HARBOR_PALETTE.iron_dark,
    emissive: HARBOR_PALETTE.lantern_warm,
    emissiveIntensity: ANNIVERSARY_LANTERN_EMBER,
    roughness: 0.9,
    toneMapped: false,
  });
  chainGardenMaterialPatch(lampMaterial, {
    key: "stone-garden-anniversary-v1",
    compile: (shader) => {
      shader.uniforms.uAnniversaryLit = lit;
      shader.uniforms.uAnniversaryFlame = flame;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uAnniversaryLit;\nuniform float uAnniversaryFlame;")
        .replace("#include <emissivemap_fragment>", `#include <emissivemap_fragment>
totalEmissiveRadiance *= uAnniversaryLit * max(uAnniversaryFlame, gardenKindleFactor(${ANNIVERSARY_LANTERN_ORDER.toFixed(4)}));`);
      bindGardenKindleUniforms(shader);
    },
  });
  const lamp = new Mesh(new BoxGeometry(0.3, 0.28, 0.3), lampMaterial);
  lamp.name = STONE_GARDEN_LANTERN_NAME;
  lamp.position.set(lanternSeat.x, lanternSeat.y + 0.94, lanternSeat.z);
  lamp.rotation.y = lanternYaw;
  root.add(lamp);

  const falls = graves.map((grave) => grave.entry);
  let eveningKey = "";
  let calendar = worldCalendarDate();
  let calendarAge = 0;
  let catching = false;
  let ritualStart = 0;

  return {
    anchors,
    root,
    ritual: {
      start(t) {
        ritualStart = t;
        catching = lit.value > 0;
      },
      update: (t) => t - ritualStart >= ANNIVERSARY_HOLD_SECONDS,
      cancel() {},
    },
    update({ date: given, hour, deltaSeconds, reducedMotion }) {
      calendarAge += Math.max(0, deltaSeconds);
      if (given) calendar = given;
      else if (calendarAge >= CALENDAR_REFRESH_SECONDS) {
        calendar = worldCalendarDate();
        calendarAge = 0;
      }
      const date = calendar;
      const key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}:${hour < 12 ? "am" : "pm"}`;
      if (key !== eveningKey) {
        eveningKey = key;
        lit.value = gardenAnniversaryEvening(date, hour, falls) ? 1 : 0;
        flame.value = 0;
        catching = false;
      }
      if (catching) {
        flame.value = reducedMotion ? 1 : Math.min(1, flame.value + Math.max(0, deltaSeconds) / ANNIVERSARY_CATCH_SECONDS);
        if (flame.value >= 1) catching = false;
      }
      // Dawn banks it with the other lamps: the ritual's flame holds only
      // until the ladder itself runs back below the lantern's order.
      if (hour < 12 && flame.value > 0 && gardenLanternKindleState().progress < ANNIVERSARY_LANTERN_ORDER) flame.value = 0;
    },
    dispose() {
      bed.geometry.dispose();
      bedMaterial.dispose();
      stones.geometry.dispose();
      stones.material.dispose();
      lamp.geometry.dispose();
      lampMaterial.dispose();
    },
  };
}
