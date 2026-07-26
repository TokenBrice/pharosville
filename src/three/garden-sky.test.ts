import { Mesh, MeshBasicMaterial, type DataTexture } from "three";
import { describe, expect, it } from "vitest";
import { dayCyclePhase } from "./garden-day-cycle";
import { createGardenSky } from "./garden-sky";

const FRAME = {
  reducedMotion: false,
  targetX: 47.6,
  targetZ: 38.9,
  timeSeconds: 0,
  viewHeight: 34,
};

function mistOf(sky: ReturnType<typeof createGardenSky>): Mesh<never, MeshBasicMaterial> {
  const mist = sky.root.getObjectByName("garden-sky-mist");
  expect(mist).toBeInstanceOf(Mesh);
  return mist as Mesh<never, MeshBasicMaterial>;
}

describe("garden sky mist band", () => {
  it("fades its alpha falloff to exactly zero at the geometry edge", () => {
    const sky = createGardenSky();
    const texture = mistOf(sky).material.alphaMap as DataTexture;
    const { data, height, width } = texture.image as {
      data: Uint8Array;
      height: number;
      width: number;
    };
    // three's `alphamap_fragment` reads the GREEN channel.
    const green = (x: number, y: number) => data[(y * width + x) * 4 + 1];

    // The plane is a 36:1 stripe rotated to the camera azimuth, so its top and
    // bottom edges project to exactly horizontal screen lines. Any non-zero
    // alpha on an edge texel is a straight band edge, not haze — DataTexture
    // clamps to edge, so the whole outer half-texel inherits that value.
    for (let x = 0; x < width; x += 1) {
      expect(green(x, 0)).toBe(0);
      expect(green(x, height - 1)).toBe(0);
    }
    for (let y = 0; y < height; y += 1) {
      expect(green(0, y)).toBe(0);
      expect(green(width - 1, y)).toBe(0);
    }

    // ...while the band itself still carries its full haze in the middle.
    expect(green(width >> 1, height >> 1)).toBeGreaterThan(200);
    sky.dispose();
  });

  it("keeps the band out of the night sky entirely", () => {
    const sky = createGardenSky();
    const mist = mistOf(sky);

    sky.update(dayCyclePhase(23), FRAME);
    expect(mist.material.opacity).toBe(0);
    expect(mist.visible).toBe(false);

    sky.update(dayCyclePhase(3), FRAME);
    expect(mist.material.opacity).toBe(0);
    expect(mist.visible).toBe(false);

    // Dusk still gets its mist — the band is a dawn/dusk element.
    sky.update(dayCyclePhase(18), FRAME);
    expect(mist.material.opacity).toBeGreaterThan(0.05);
    expect(mist.visible).toBe(true);
    sky.dispose();
  });
});
