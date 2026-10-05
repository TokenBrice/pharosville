import { describe, expect, it } from "vitest";
import { CatmullRomCurve3, Color, Vector3 } from "three";
import {
  createAuthoredKuromatsuGeometry, createNiwakiPine, niwakiDefaultBranches,
  GARDEN_KUROMATSU_FLEX_ATTRIBUTE, GARDEN_KUROMATSU_ROOT_INDEX_ATTRIBUTE,
  type AuthoredKuromatsuOptions,
} from "./garden-niwaki";

describe("niwaki kuromatsu generator", () => {
  it("builds flat-bottomed pads that are dark beneath and lit on the crown", () => {
    const pine = createNiwakiPine({ seed: "test.pine", height: 9 });
    const position = pine.geometry.getAttribute("position");
    const color = pine.geometry.getAttribute("color");
    expect(pine.pads.length).toBeGreaterThanOrEqual(5);
    for (const pad of pine.pads) {
      const base = pad.center.y - pad.halfSize.y;
      let underside = 0;
      let undersideCount = 0;
      let crown = 0;
      let crownCount = 0;
      for (let index = 0; index < position.count; index += 1) {
        const dx = position.getX(index) - pad.center.x;
        const dz = position.getZ(index) - pad.center.z;
        if (Math.hypot(dx, dz) > pad.halfSize.z * 0.5) continue;
        const y = position.getY(index);
        const luma = color.getX(index) + color.getY(index) + color.getZ(index);
        if (Math.abs(y - base) < pad.halfSize.y * 0.25) {
          underside += luma;
          undersideCount += 1;
        } else if (y > pad.center.y + pad.halfSize.y * 0.6) {
          crown += luma;
          crownCount += 1;
        }
      }
      expect(undersideCount, "pad has a flat underside").toBeGreaterThan(0);
      expect(crownCount, "pad has a domed crown").toBeGreaterThan(0);
      expect(underside / undersideCount).toBeLessThan(crown / crownCount * 0.7);
      // Flattened lobes: thickness over half-width stays in 0.25–0.42.
      expect(pad.halfSize.y / pad.halfSize.x).toBeGreaterThanOrEqual(0.25);
      expect(pad.halfSize.y / pad.halfSize.x).toBeLessThanOrEqual(0.42);
    }
    // Pads step down the tree: the lowest tier pad is larger than the apex pad.
    const tiers = niwakiDefaultBranches(9, "test.pine");
    expect(tiers[0]!.padSize).toBeGreaterThan(tiers[tiers.length - 2]!.padSize);
    pine.geometry.dispose();
  });

  it("is smooth-shaded: pad and bark vertices are shared, not per-face", () => {
    const pine = createNiwakiPine({ seed: "test.smooth", height: 6 });
    const vertices = pine.geometry.getAttribute("position").count;
    expect(pine.geometry.index).not.toBeNull();
    // Flat shading would need three vertices per triangle.
    expect(vertices).toBeLessThan(pine.triangleCount * 1.2);
    pine.geometry.dispose();
  });

  it("is deterministic per seed", () => {
    const a = createNiwakiPine({ seed: "same", height: 7 });
    const b = createNiwakiPine({ seed: "same", height: 7 });
    const c = createNiwakiPine({ seed: "other", height: 7 });
    expect(Array.from(b.geometry.getAttribute("position").array)).toEqual(Array.from(a.geometry.getAttribute("position").array));
    expect(c.geometry.getAttribute("position").count === a.geometry.getAttribute("position").count
      && Array.from(c.geometry.getAttribute("position").array).every((value, index) => value === a.geometry.getAttribute("position").array[index]))
      .toBe(false);
    for (const pine of [a, b, c]) pine.geometry.dispose();
  });
});

function authoredPine(seed: string, rootIndex: 0 | 1 = 0): AuthoredKuromatsuOptions {
  return {
    seed, rootIndex, bark: new Color().setRGB(0.03, 0.025, 0.02), needle: new Color().setRGB(0.025, 0.033, 0.009),
    trunk: [[0, 0, 0], [-0.3, 1.5, 0.2], [-0.1, 3, 0.3]], radii: [0.3, 0.08],
    limbs: [
      { parent: 0, at: 0.45, order: "primary", points: [[-0.7, 1.5, -1], [-1.6, 2, -2]], radii: [0.14, 0.04] },
      { parent: 1, at: 0.8, order: "secondary", points: [[-1.8, 2.1, -2.4], [-2.1, 2.6, -2.7]], radii: [0.036, 0.014] },
      { parent: 2, at: 0.75, order: "twig", points: [[-2.4, 2.6, -3]], radii: [0.012, 0.005],
        spray: { needles: 18, length: 0.2, spread: 1.05 } },
    ],
  };
}

describe("authored near kuromatsu graph", () => {
  it("is deterministic, indexed and finite, with normalized normals and baked rooted flexibility", () => {
    const a = createAuthoredKuromatsuGeometry(authoredPine("same"));
    const b = createAuthoredKuromatsuGeometry(authoredPine("same"));
    const c = createAuthoredKuromatsuGeometry(authoredPine("different", 1));
    try {
      expect(Array.from(a.getAttribute("position").array)).toEqual(Array.from(b.getAttribute("position").array));
      expect(Array.from(a.getAttribute("position").array)).not.toEqual(Array.from(c.getAttribute("position").array));
      expect(a.index!.count % 3).toBe(0);
      const count = a.getAttribute("position").count;
      for (const name of ["position", "normal", "color", GARDEN_KUROMATSU_FLEX_ATTRIBUTE, GARDEN_KUROMATSU_ROOT_INDEX_ATTRIBUTE]) {
        expect(a.getAttribute(name).count).toBe(count);
        expect(Array.from(a.getAttribute(name).array).every(Number.isFinite)).toBe(true);
      }
      const flex = a.getAttribute(GARDEN_KUROMATSU_FLEX_ATTRIBUTE);
      expect(flex.itemSize).toBe(3);
      expect(Array.from(flex.array).every((value) => value >= 0 && value <= 1)).toBe(true);
      expect(Array.from(a.getAttribute(GARDEN_KUROMATSU_ROOT_INDEX_ATTRIBUTE).array).every((value) => value === 0)).toBe(true);
      expect(Array.from(c.getAttribute(GARDEN_KUROMATSU_ROOT_INDEX_ATTRIBUTE).array).every((value) => value === 1)).toBe(true);
      const position = a.getAttribute("position"), normal = a.getAttribute("normal");
      const point = new Vector3();
      let rooted = 0;
      for (let vertex = 0; vertex < count; vertex += 1) {
        expect(point.fromBufferAttribute(normal, vertex).length()).toBeCloseTo(1, 5);
        if (flex.getX(vertex) !== 0 || flex.getY(vertex) !== 0 || flex.getZ(vertex) !== 0) continue;
        rooted += 1;
        expect(point.fromBufferAttribute(position, vertex).length()).toBeCloseTo(0.3, 5);
      }
      expect(rooted).toBeGreaterThan(2);
      expect(a.boundingBox!.isEmpty()).toBe(false);
      expect([...a.boundingBox!.min.toArray(), ...a.boundingBox!.max.toArray(),
        ...a.boundingSphere!.center.toArray(), a.boundingSphere!.radius].every(Number.isFinite)).toBe(true);
    } finally {
      a.dispose(); b.dispose(); c.dispose();
    }
  });

  it("attaches tapered limbs to their parent curve and closes every opaque needle volume", () => {
    const options = authoredPine("attachment");
    const geometry = createAuthoredKuromatsuGeometry(options);
    try {
      const curves = [new CatmullRomCurve3(options.trunk.map(([x, y, z]) => new Vector3(x, y, z)), false, "centripetal")];
      const radii = [options.radii];
      for (const [index, limb] of options.limbs.entries()) {
        expect(limb.parent).toBeLessThan(index + 1);
        const parentRadii = radii[limb.parent]!;
        expect(limb.radii[0]).toBeLessThanOrEqual(parentRadii[0] + (parentRadii[1] - parentRadii[0]) * limb.at);
        expect(limb.radii[1]).toBeLessThan(limb.radii[0]);
        const start = curves[limb.parent]!.getPointAt(limb.at);
        curves.push(new CatmullRomCurve3([start, ...limb.points.map(([x, y, z]) => new Vector3(x, y, z))], false, "centripetal"));
        radii.push(limb.radii);
      }
      const position = geometry.getAttribute("position"), flex = geometry.getAttribute(GARDEN_KUROMATSU_FLEX_ATTRIBUTE);
      const attachment = curves[0]!.getPointAt(options.limbs[0]!.at);
      let ring = 0;
      const point = new Vector3();
      for (let vertex = 0; vertex < position.count; vertex += 1) {
        if (Math.abs(flex.getX(vertex) - options.limbs[0]!.at) > 1e-6 || flex.getY(vertex) !== 0 || flex.getZ(vertex) !== 0) continue;
        ring += 1;
        expect(point.fromBufferAttribute(position, vertex).distanceTo(attachment)).toBeCloseTo(options.limbs[0]!.radii[0], 5);
      }
      expect(ring).toBeGreaterThan(2);
      const tip = Array.from({ length: position.count }, (_, vertex) => vertex).find((vertex) => flex.getZ(vertex) === 1)!;
      expect(tip).toBeDefined();
      const component = new Set([tip]);
      const index = geometry.index!;
      let previous = 0;
      while (component.size !== previous) {
        previous = component.size;
        for (let face = 0; face < index.count; face += 3) {
          const vertices = [index.getX(face), index.getX(face + 1), index.getX(face + 2)];
          if (vertices.some((vertex) => component.has(vertex))) vertices.forEach((vertex) => component.add(vertex));
        }
      }
      const edges = new Map<string, number>();
      for (let face = 0; face < index.count; face += 3) {
        const a = index.getX(face), b = index.getX(face + 1), c = index.getX(face + 2);
        if (!component.has(a)) continue;
        for (const [start, end] of [[a, b], [b, c], [c, a]]) {
          const key = `${Math.min(start!, end!)}/${Math.max(start!, end!)}`;
          edges.set(key, (edges.get(key) ?? 0) + 1);
        }
      }
      expect(edges.size).toBeGreaterThan(2);
      expect([...edges.values()].every((incidence) => incidence === 2)).toBe(true);
    } finally {
      geometry.dispose();
    }
  });
});
