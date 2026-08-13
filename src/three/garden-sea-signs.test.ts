// @vitest-environment jsdom
import {
  Mesh,
  MeshStandardMaterial,
  Texture,
} from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEWS_AREA_LABEL_COLORS } from "../systems/palette";
import {
  SEA_SIGN_SCALE_STEPS,
  SEA_SIGN_STEP_FADE_SECONDS,
  createGardenSeaSigns,
  seaSignScaleForZoom,
  type SeaSignSpec,
} from "./garden-sea-signs";

const context = {
  arc: vi.fn(),
  beginPath: vi.fn(),
  bezierCurveTo: vi.fn(),
  fill: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  moveTo: vi.fn(),
  restore: vi.fn(),
  save: vi.fn(),
  stroke: vi.fn(),
  strokeRect: vi.fn(),
  strokeText: vi.fn(),
  translate: vi.fn(),
};

// The accents the world actually hands the boards (DEWS_AREA_LABEL_COLORS), so
// the contrast this file asserts is the contrast that ships.
const specs: SeaSignSpec[] = [
  { accent: DEWS_AREA_LABEL_COLORS.CALM, body: "calm", label: "Calm Anchorage", reading: "CALM · 20" },
  { accent: DEWS_AREA_LABEL_COLORS.WARNING, body: "warning", label: "Warning Shoals", reading: "WARNING · 4" },
  { accent: DEWS_AREA_LABEL_COLORS.DANGER, body: "danger", label: "Storm Strait", reading: "DANGER · 2" },
];

/** The plank, as `paintSeaSign` lays it out. */
const TEXTURE_HEIGHT = 272;
const IRON_BAND_HEIGHT = 22;
/** Oak ground and the iron rail's ink, composited: 0.92 of the ink over #a87e50. */
const IRON_RAIL_COMPOSITE = [37.36, 30.32, 22.96] as const;
const OAK_GROUND = [168, 126, 80] as const;

function relativeLuminance(channels: readonly number[]): number {
  const [red, green, blue] = channels.map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
}

function contrastRatio(hex: string, ground: readonly number[]): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
  const luminances = [relativeLuminance(channels), relativeLuminance(ground)].sort(
    (left, right) => right - left,
  );
  return (luminances[0]! + 0.05) / (luminances[1]! + 0.05);
}

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext")
    .mockReturnValue(context as unknown as CanvasRenderingContext2D);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("garden sea-sign texture atlas", () => {
  it("packs every board into one texture with disjoint padded UV cells", () => {
    const signs = createGardenSeaSigns(specs);
    const boards: Mesh[] = [];
    signs.root.traverse((object) => {
      if (object.name.startsWith("garden-sea-sign-board.")) boards.push(object as Mesh);
    });
    expect(boards).toHaveLength(specs.length);

    const materials = boards.map((board) => board.material as MeshStandardMaterial);
    const maps = materials.map((material) => material.map);
    expect(new Set(maps).size).toBe(1);
    expect(maps[0]).toBeInstanceOf(Texture);
    expect(materials.every((material) => material.emissiveMap === maps[0])).toBe(true);
    expect((maps[0]!.image as HTMLCanvasElement).width).toBe(1024);
    expect((maps[0]!.image as HTMLCanvasElement).height).toBe(1024);

    const ranges = boards.map((board) => {
      const uv = board.geometry.getAttribute("uv");
      const values = Array.from({ length: uv.count }, (_, index) => uv.getY(index));
      return { max: Math.max(...values), min: Math.min(...values) };
    }).sort((left, right) => left.min - right.min);
    for (const range of ranges) {
      expect(range.min).toBeGreaterThanOrEqual(0);
      expect(range.max).toBeLessThanOrEqual(1);
      expect(range.max - range.min).toBeCloseTo(272 / 1024, 6);
    }
    for (let index = 1; index < ranges.length; index += 1) {
      expect(ranges[index]!.min).toBeGreaterThan(ranges[index - 1]!.max);
    }
    expect(context.translate).toHaveBeenCalledTimes(specs.length);

    signs.dispose();
  });

  it("scales every board to the quantized rung, not a per-zoom curve", () => {
    const signs = createGardenSeaSigns(specs);
    const groups = specs.map((spec) => signs.root.getObjectByName(`garden-sea-sign.${spec.body}`)!);

    const scaleAt = (zoom: number) => {
      signs.update({ deltaSeconds: Number.POSITIVE_INFINITY, night: 0, visible: true, zoom });
      return groups.map((group) => group.scale.x);
    };

    // Whole-map framing and a slightly closer one land on the same rung: the
    // boards hold still while the world under them changes size.
    expect(scaleAt(0.3)).toEqual(specs.map(() => SEA_SIGN_SCALE_STEPS[2]!));
    expect(scaleAt(0.38)).toEqual(specs.map(() => SEA_SIGN_SCALE_STEPS[2]!));
    // Close framing is near world scale, as D6 was reviewed at.
    expect(scaleAt(1.6)).toEqual(specs.map(() => SEA_SIGN_SCALE_STEPS[0]!));
    // And every board answers with the shared pure function the hit targets read.
    for (const zoom of [0.3, 0.6, 1.6]) {
      expect(scaleAt(zoom)[0]!).toBe(seaSignScaleForZoom(zoom));
    }

    signs.dispose();
  });

  it("eases across a rung and holds the rung it left until then", () => {
    const signs = createGardenSeaSigns(specs);
    const board = signs.root.getObjectByName(`garden-sea-sign.${specs[0]!.body}`)!;

    signs.update({ deltaSeconds: Number.POSITIVE_INFINITY, night: 0, visible: true, zoom: 1.2 });
    expect(board.scale.x).toBe(SEA_SIGN_SCALE_STEPS[0]!);

    signs.update({ deltaSeconds: 1 / 60, night: 0, visible: true, zoom: 0.6 });
    expect(board.scale.x).toBeGreaterThan(SEA_SIGN_SCALE_STEPS[0]!);
    expect(board.scale.x).toBeLessThan(SEA_SIGN_SCALE_STEPS[1]!);

    signs.update({
      deltaSeconds: SEA_SIGN_STEP_FADE_SECONDS,
      night: 0,
      visible: true,
      zoom: 0.6,
    });
    expect(board.scale.x).toBe(SEA_SIGN_SCALE_STEPS[1]!);
    // Uniform: the board is not stretched by the settle.
    expect(board.scale.y).toBe(board.scale.x);
    expect(board.scale.z).toBe(board.scale.x);

    signs.dispose();
  });

  it("draws the reduced-motion frame settled, with no easing to finish", () => {
    const signs = createGardenSeaSigns(specs);
    const board = signs.root.getObjectByName(`garden-sea-sign.${specs[0]!.body}`)!;

    signs.update({
      deltaSeconds: Number.POSITIVE_INFINITY,
      night: 0,
      reducedMotion: true,
      visible: true,
      zoom: 1.2,
    });
    signs.update({ deltaSeconds: 1 / 60, night: 0, reducedMotion: true, visible: true, zoom: 0.3 });

    expect(board.scale.x).toBe(seaSignScaleForZoom(0.3));

    signs.dispose();
  });

  it("takes its motion policy from the frame, not from its own media query", () => {
    // W0.7 follow-up: the renderer now passes `reducedMotion` (and the frame's
    // delta) into the sign update, so the module has no business keeping a
    // second matchMedia subscription of its own — a per-system watcher is a
    // listener to leak and a second source of truth to drift from the frame.
    const listeners: (() => void)[] = [];
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: (query: string) => ({
        addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        removeEventListener: () => {},
      }),
      writable: true,
    });

    try {
      const signs = createGardenSeaSigns(specs);
      const board = signs.root.getObjectByName(`garden-sea-sign.${specs[0]!.body}`)!;
      expect(listeners).toHaveLength(0);

      signs.update({ deltaSeconds: Number.POSITIVE_INFINITY, night: 0, visible: true, zoom: 1.2 });
      // The platform says "reduce" and the frame does not: the frame wins, so
      // one 60 fps step across two rung edges is still an EASE, not a jump.
      signs.update({ deltaSeconds: 1 / 60, night: 0, visible: true, zoom: 0.3 });
      expect(board.scale.x).not.toBe(seaSignScaleForZoom(0.3));

      signs.dispose();
      expect(listeners).toHaveLength(0);
    } finally {
      Reflect.deleteProperty(window, "matchMedia");
    }
  });

  it("settles the rung whole for a caller that brings no clock", () => {
    // The parameters take precedence and the renderer always supplies them.
    // What is left is the degenerate caller: with no delta there is nothing
    // advancing an ease, so the board must land settled rather than stranded
    // at whatever fraction of the step one unclocked call happened to produce.
    const signs = createGardenSeaSigns(specs);
    const board = signs.root.getObjectByName(`garden-sea-sign.${specs[0]!.body}`)!;

    signs.update({ night: 0, visible: true, zoom: 1.2 });
    expect(board.scale.x).toBe(seaSignScaleForZoom(1.2));
    signs.update({ night: 0, visible: true, zoom: 0.3 });
    expect(board.scale.x).toBe(seaSignScaleForZoom(0.3));

    signs.dispose();
  });

  it("comes back on its settled rung after standing down for a detail panel", () => {
    const signs = createGardenSeaSigns(specs);
    const board = signs.root.getObjectByName(`garden-sea-sign.${specs[0]!.body}`)!;

    signs.update({ deltaSeconds: Number.POSITIVE_INFINITY, night: 0, visible: true, zoom: 1.2 });
    // Panel owns the frame: boards are cleared, and the zoom moves behind it.
    // The rung settles off screen over these frames rather than on the way in.
    for (let frame = 0; frame < 30; frame += 1) {
      signs.update({ deltaSeconds: 1 / 60, night: 0, visible: false, zoom: 0.3 });
    }
    expect(signs.root.visible).toBe(false);
    signs.update({ deltaSeconds: 1 / 60, night: 0, visible: true, zoom: 0.3 });
    expect(signs.root.visible).toBe(true);
    expect(board.scale.x).toBe(seaSignScaleForZoom(0.3));

    signs.dispose();
  });

  it("lays the band accent on the iron rail, where it can reach contrast", () => {
    // The rule used to sit on the oak, mid-plank, under a comment claiming it
    // sat on the ironwork. It did not, and on oak no accent in the ladder can
    // reach 3:1 — so the rule moved to the ground the claim described.
    const painted: { rect: number[]; style: unknown }[] = [];
    context.fillRect.mockImplementation((...rect: number[]) => {
      painted.push({ rect, style: (context as { fillStyle?: unknown }).fillStyle });
    });

    try {
      const signs = createGardenSeaSigns([specs[2]!]);
      const rules = painted.filter((call) => call.style === specs[2]!.accent);
      expect(rules).toHaveLength(1);

      const [, y, , height] = rules[0]!.rect;
      expect(y!).toBeGreaterThanOrEqual(TEXTURE_HEIGHT - IRON_BAND_HEIGHT);
      expect(y! + height!).toBeLessThanOrEqual(TEXTURE_HEIGHT);

      signs.dispose();
    } finally {
      // The context is shared across this file's tests; hand it back clean.
      context.fillRect.mockReset();
    }
  });

  it("clears 3:1 for every band against the rail, and for none against the oak", () => {
    for (const accent of Object.values(DEWS_AREA_LABEL_COLORS)) {
      expect(contrastRatio(accent, IRON_RAIL_COMPOSITE)).toBeGreaterThanOrEqual(3);
    }
    // The other half of the finding: this is a property of the GROUND, not of
    // the dye, so re-dyeing the accents can never put the rule back on the oak.
    expect(contrastRatio(DEWS_AREA_LABEL_COLORS.DANGER, OAK_GROUND)).toBeLessThan(1.5);
  });

  it("disposes the shared atlas once rather than once per board", () => {
    const signs = createGardenSeaSigns(specs);
    const board = signs.root.getObjectByName("garden-sea-sign-board.calm") as Mesh;
    const texture = (board.material as MeshStandardMaterial).map!;
    const dispose = vi.spyOn(texture, "dispose");

    signs.dispose();

    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
