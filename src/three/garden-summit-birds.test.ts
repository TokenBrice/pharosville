import { InstancedMesh, ShaderMaterial } from "three";
import { describe, expect, it } from "vitest";
import {
  createGardenSummitBirds,
  GARDEN_BIRD_SORTIE_CHANCE,
  GARDEN_BIRD_SORTIE_GLSL,
  GARDEN_BIRD_SORTIE_PERIOD,
  GARDEN_BIRD_SORTIE_SHARE,
  gardenBirdSortie,
  gardenBirdSortieOffset,
} from "./garden-summit-birds";

function birdMesh(): InstancedMesh {
  const birds = createGardenSummitBirds();
  const mesh = birds.root.children[0];
  if (!(mesh instanceof InstancedMesh)) throw new Error("no bird mesh");
  return mesh;
}

const RUNNING = { reducedMotion: false, timeSeconds: 12.5, visible: true };

describe("gardenBirdSortie", () => {
  it("leaves a bird ON HER PERCH between turns", () => {
    // Outside her window the function resolves to exactly 0 (she has not gone
    // yet) or exactly 1 (she is back) — and both of those put her on the perch,
    // because the flight path is a closed loop. There is no third resting value.
    let resting = 0;
    let samples = 0;
    for (let seed = 0; seed < 1; seed += 0.017) {
      for (let seconds = 0; seconds < 900; seconds += 1.3) {
        const sortie = gardenBirdSortie(seed, seconds);
        expect(sortie).toBeGreaterThanOrEqual(0);
        expect(sortie).toBeLessThanOrEqual(1);
        if (sortie === 0 || sortie === 1) resting += 1;
        samples += 1;
      }
    }
    expect(resting / samples).toBeGreaterThan(0.6);
  });

  it("keeps roughly a third of the harbour's birds in the air", () => {
    let airborne = 0;
    let samples = 0;
    for (let seed = 0; seed < 1; seed += 0.011) {
      for (let seconds = 0; seconds < 1_200; seconds += 1.7) {
        const sortie = gardenBirdSortie(seed, seconds);
        if (sortie > 0 && sortie < 1) airborne += 1;
        samples += 1;
      }
    }
    // The design figure is CHANCE x SHARE: a bird flies that share of her
    // windows, for that share of the window — 0.55 x 0.6 ≈ a third since the
    // warm-village D2 retune (2026-09-05, amplitude not count; W3.4's quarter
    // became a third so flight reads at the zoom-1.0 rest).
    const expected = GARDEN_BIRD_SORTIE_CHANCE * GARDEN_BIRD_SORTIE_SHARE;
    expect(airborne / samples).toBeGreaterThan(expected - 0.06);
    expect(airborne / samples).toBeLessThan(expected + 0.06);
    // And the brief's own bound still holds a third aloft: presence through
    // intermittency, never a sky full of birds.
    expect(airborne / samples).toBeLessThan(0.35);
  });

  it("re-tunes amplitude, not count (warm-village D2, 2026-09-05)", () => {
    // The share rose 0.45 → 0.6; the chance, the period and the per-bird phase
    // offsets are the W3.4 clockwork critique and stay untouched.
    expect(GARDEN_BIRD_SORTIE_SHARE).toBe(0.6);
    expect(GARDEN_BIRD_SORTIE_CHANCE).toBe(0.55);
    expect(GARDEN_BIRD_SORTIE_PERIOD).toBe(62);
    // The widened loop (3.6 ± 0.9 → 6 ± 1.2) and lifted climb (4.4 → 6, spread
    // unchanged) are baked into the vertex shader; pin the band so the sweep
    // cannot silently shrink back. The loop stays tangent to the perch, so its
    // closest approach to the tower axis is the perch radius at every width.
    const material = birdMesh().material as ShaderMaterial;
    expect(material.vertexShader).toContain("6.00 + aSeed * 1.20");
    expect(material.vertexShader).toContain("6.00 + aSeed * 2.40");
  });

  it("is a pure function of the clock, with no shared phase", () => {
    for (const [seed, seconds] of [[0.2, 40], [0.77, 613.5], [0.03, 9_999]]) {
      expect(gardenBirdSortie(seed!, seconds!)).toBe(gardenBirdSortie(seed!, seconds!));
    }
    // Two birds must not lift together: their window boundaries are offset by
    // seed, so their turns land in different places.
    const first: number[] = [];
    const second: number[] = [];
    for (let seconds = 0; seconds < 600; seconds += 2) {
      first.push(gardenBirdSortie(0.21, seconds));
      second.push(gardenBirdSortie(0.62, seconds));
    }
    expect(first).not.toEqual(second);
  });

  it("takes off and lands at a standstill", () => {
    // Find a window this bird flies, then check the ends of it: the eased
    // progress must leave and rejoin the perch with (near) zero rate of change,
    // which is what makes take-off and landing read as eased rather than as
    // popping on and off the stone.
    const seed = 0.41;
    let found = false;
    for (let seconds = 0; seconds < 4_000 && !found; seconds += 0.25) {
      const before = gardenBirdSortie(seed, seconds);
      const after = gardenBirdSortie(seed, seconds + 0.25);
      if (before !== 0 || after <= 0 || after >= 1) continue;
      found = true;
      // Just off the perch: the step taken is a small fraction of the step the
      // same bird takes at the middle of her turn.
      const period = GARDEN_BIRD_SORTIE_PERIOD * GARDEN_BIRD_SORTIE_SHARE;
      const middle = Math.abs(
        gardenBirdSortie(seed, seconds + period * 0.5 + 0.25)
        - gardenBirdSortie(seed, seconds + period * 0.5),
      );
      expect(after).toBeLessThan(middle);
    }
    expect(found).toBe(true);
  });
});

describe("gardenBirdSortieOffset", () => {
  it("begins and ends on the very spot she left", () => {
    for (const sortie of [0, 1]) {
      const [x, y, z] = gardenBirdSortieOffset(sortie, 0.6, -0.8, 4.2, 5.5);
      expect(x).toBeCloseTo(0, 10);
      expect(y).toBeCloseTo(0, 10);
      expect(z).toBeCloseTo(0, 10);
    }
  });

  it("never flies through the thing she is sitting on", () => {
    // The loop is tangent to the perch and bulges along the OUTWARD direction,
    // so its component that way is never negative — no bird ever crosses into
    // the tower, the rig or the island she just left.
    const outX = 0.6;
    const outZ = -0.8;
    for (let sortie = 0; sortie <= 1; sortie += 0.005) {
      const [x, , z] = gardenBirdSortieOffset(sortie, outX, outZ, 4.2, 5.5);
      expect(x * outX + z * outZ).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("climbs and settles, and faces where it is going", () => {
    const [, mid] = gardenBirdSortieOffset(0.5, 1, 0, 4.2, 5.5);
    expect(mid).toBeCloseTo(5.5, 10);
    const [, low] = gardenBirdSortieOffset(0.02, 1, 0, 4.2, 5.5);
    expect(low).toBeLessThan(0.4);

    // Heading turns through exactly one full circle over a turn, so a bird sits
    // facing the way she launched and the way she landed — no snap at either.
    const [, , , start] = gardenBirdSortieOffset(0, 1, 0, 4.2, 5.5);
    const [, , , end] = gardenBirdSortieOffset(1, 1, 0, 4.2, 5.5);
    expect(start - end).toBeCloseTo(Math.PI * 2, 10);
  });
});

describe("createGardenSummitBirds", () => {
  it("is still one instanced draw call over eight birds", () => {
    const mesh = birdMesh();
    expect(mesh.count).toBe(8);
    expect(mesh.geometry.getAttribute("aPerch").count).toBe(8);
    expect(mesh.geometry.getAttribute("aSeed").count).toBe(8);
  });

  it("spreads the roost unequally round the cornice", () => {
    const perches = [
      ...(birdMesh().geometry.getAttribute("aPerch").array as Float32Array),
    ].sort((left, right) => left - right);
    const gaps = perches.slice(1).map((angle, index) => angle - perches[index]!);
    // An even ring of eight would read as a machined collar; the gaps have to
    // differ from each other by a real margin (fukinsei).
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeGreaterThan(0.25);
  });

  it("shares the harbour's one choreography rather than forking it", () => {
    const material = birdMesh().material as ShaderMaterial;
    expect(material.vertexShader).toContain("gardenBirdSortieAt");
    expect(GARDEN_BIRD_SORTIE_GLSL).toContain("gardenBirdSortieAt");
  });

  it("stands the whole flock down onto its perches under reduced motion", () => {
    const birds = createGardenSummitBirds();
    const mesh = birds.root.children[0] as InstancedMesh;
    const material = mesh.material as ShaderMaterial;

    birds.update(RUNNING);
    expect(material.uniforms.uFlight!.value).toBe(1);
    expect(material.uniforms.uTime!.value).toBe(12.5);

    birds.update({ ...RUNNING, reducedMotion: true });
    // Both halves matter: no clock, and no bird in the air whatever the clock
    // said last frame.
    expect(material.uniforms.uFlight!.value).toBe(0);
    expect(material.uniforms.uTime!.value).toBe(0);

    birds.update({ ...RUNNING, visible: false });
    expect(birds.root.visible).toBe(false);
  });
});
