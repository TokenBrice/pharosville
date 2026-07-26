import {
  BoxGeometry,
  BufferGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
} from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { HARBOR_PALETTE } from "../systems/palette";
import { PSI_BAND_SEVERITY } from "../systems/world-types";
import { LIGHTHOUSE_TERRACE_STEPS } from "./garden-lighthouse";

/**
 * 3c — the high-water mark on the lighthouse terrace.
 *
 * `stability.history` — thirty days of scores and bands — has been fetched on
 * every load and read by nothing in the world; `world-scaffold.ts` knew only
 * `stability.current`. So a harbour that spent three weeks in FRACTURE and came
 * out of it yesterday was drawn identically to one that has never been anything
 * but calm. This is the only thing in PharosVille that tells those two apart.
 *
 * It is a high-water mark, in the literal sense that harbour towns have carved
 * them into stone for centuries: pale salt courses climbing the terrace, one per
 * severity step of the worst band the fleet reached. The sea remembers where it
 * rose.
 *
 * ## Why it must not look like damage
 *
 * It sits a few units from hull weathering, which already means "this ship has
 * been in rough water" — a risk reading. If the stain went dark, streaked, or
 * grimy the world would be saying risk twice in two different vocabularies and
 * a reader would have no way to tell which was which. So the mark is PALE and
 * crisp: bleached mineral crust with a flat top edge, the look of a measured
 * line rather than a wound. Nothing here darkens the stone.
 *
 * ## Cost and motion
 *
 * Every course is built once into ONE merged, indexed geometry, bottom course
 * first, and the mark is set by draw range — one draw call, no rebuild on data
 * refresh, no allocation. There is no motion at any tier or setting: a record
 * that moved would be a condition, which is the one thing it is not.
 */

/**
 * How proud of the step face each course stands. Enough for the key light to
 * catch a real top edge — the crisp horizontal line is what makes this read as
 * a mark rather than a smudge — and not so much that it becomes a cornice.
 */
const COURSE_PROUD = 0.07;

/**
 * The courses, bottom to top, as `[centreY, height, stepIndex]` in
 * lighthouse-local units.
 *
 * Five courses for the five bands above the calmest one: BEDROCK leaves the
 * stone bare, so `severity` (0-5) is exactly the number of courses shown. Each
 * course is sized to its own terrace step and inset from the step's top and
 * bottom edges, so the stack reads as banding cut into the stonework rather
 * than as a skin wrapped over it.
 */
const COURSES: ReadonlyArray<readonly [number, number, number]> = [
  [0.24, 0.36, 0],
  [0.64, 0.34, 0],
  [1.09, 0.36, 1],
  [1.49, 0.34, 1],
  [2.09, 0.62, 2],
];

/** Bleached salt crust: foam white pulled a little toward the terrace's own
    pale stone, so the mark belongs to the masonry instead of sitting on it. */
const SALT_CRUST = new Color(HARBOR_PALETTE.foam_white)
  .lerp(new Color(HARBOR_PALETTE.stone_pale), 0.28);

export interface GardenTideStain {
  readonly root: Group;
  /** Courses this stain can show — the top of the scale. */
  readonly courseCount: number;
  dispose(): void;
  /**
   * Show the bottom `severity` courses, where `severity` is the
   * `PSI_BAND_SEVERITY` rank of the worst band in the window. Zero and null
   * both leave the stone bare, and the DOM row is what distinguishes them.
   */
  setMark(severity: number | null): void;
}

/**
 * One course: a picture-frame ring of four thin boxes around a terrace step.
 *
 * A solid box would bury the step it bands; the ring only touches the four
 * faces, which is where a tideline actually shows.
 */
function createCourseGeometry(halfWidth: number, centreY: number, height: number): BufferGeometry[] {
  const outer = halfWidth + COURSE_PROUD;
  const span = outer * 2;
  const thickness = COURSE_PROUD * 2;
  const parts: BufferGeometry[] = [];
  for (const [dx, dz, wide] of [
    [0, outer, true],
    [0, -outer, true],
    [outer, 0, false],
    [-outer, 0, false],
  ] as const) {
    const side = wide
      ? new BoxGeometry(span, height, thickness)
      : new BoxGeometry(thickness, height, span);
    side.translate(dx, centreY, dz);
    parts.push(side);
  }
  return parts;
}

export function createGardenTideStain(): GardenTideStain {
  const parts: BufferGeometry[] = [];
  // Index count after each course, so `setMark` can cut the draw range at a
  // course boundary. Merging bottom-first is what makes a prefix of the index
  // buffer mean "the bottom N courses" — the order here is load bearing.
  const indexCountAfterCourse: number[] = [];
  let indexCount = 0;
  for (const [centreY, height, stepIndex] of COURSES) {
    const step = LIGHTHOUSE_TERRACE_STEPS[stepIndex]!;
    for (const part of createCourseGeometry(step[0] / 2, centreY, height)) {
      indexCount += part.getIndex()?.count ?? 0;
      parts.push(part);
    }
    indexCountAfterCourse.push(indexCount);
  }

  const geometry = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!geometry) throw new Error("tide stain geometry failed to merge");

  const material = new MeshStandardMaterial({
    color: SALT_CRUST,
    flatShading: true,
    // Slightly less rough than the terrace stone around it: salt crust has a
    // faint sheen, and that difference is what keeps the band legible at noon
    // when albedo alone flattens against pale stonework.
    roughness: 0.72,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = "lighthouse-tide-stain";
  mesh.castShadow = false;
  mesh.receiveShadow = true;

  const root = new Group();
  root.name = "lighthouse-tide-stain-root";
  root.add(mesh);
  root.visible = false;

  return {
    root,
    courseCount: COURSES.length,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
    setMark(severity) {
      const courses = severity === null
        ? 0
        : Math.max(0, Math.min(COURSES.length, Math.trunc(severity)));
      root.visible = courses > 0;
      geometry.setDrawRange(0, courses === 0 ? 0 : indexCountAfterCourse[courses - 1]!);
    },
  };
}

/** The stain's own view of the band scale, for tests and for the legend. */
export const TIDE_STAIN_MAX_COURSES = PSI_BAND_SEVERITY.length - 1;
