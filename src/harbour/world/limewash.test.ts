import * as THREE from "three";
import { expect, it } from "vitest";
import { LIMEWASH, limewash } from "./limewash";
import { patternIdOf } from "./materials";

/** COLOR_0 alpha byte for a pattern id (the export's id / 16, normalized). */
const pid = (id: number) => Math.round((id / 16) * 255);

it("E03a: lifts the Pharos' stone (plain marble, ashlar limestone) by LIMEWASH; metal, paving and ids keep theirs", () => {
  const bytes = [
    200, 190, 170, pid(0),   // marble trim
    206, 190, 160, pid(2),   // ashlar limestone (the lit face)
    120, 80, 40, pid(12),    // bronze
    180, 170, 150, pid(4),   // paving setts
    250, 250, 248, pid(0),   // the brightest marble: capped at 1
  ];
  const g = new THREE.BufferGeometry();
  const c = new THREE.BufferAttribute(new Uint8Array(bytes), 4, true);
  g.setAttribute("color", c);
  expect(LIMEWASH).toBeCloseTo(1.06, 9);
  expect(limewash(g)).toBe(3);
  const rgb = (i: number) => [c.getX(i), c.getY(i), c.getZ(i)].map((v) => Math.round(v * 255));
  expect(rgb(0)).toEqual([212, 201, 180]);
  expect(rgb(1)).toEqual([218, 201, 170]);
  expect(rgb(2)).toEqual([120, 80, 40]);
  expect(rgb(3)).toEqual([180, 170, 150]);
  expect(rgb(4)).toEqual([255, 255, 255]);
  for (let i = 0; i < c.count; i++) expect(c.getW(i)).toBe(bytes[i * 4 + 3] / 255);
  expect([0, 1, 2, 3, 4].map((i) => patternIdOf(c.getW(i)))).toEqual([0, 2, 12, 4, 0]);
  expect(limewash(new THREE.BufferGeometry())).toBe(0);
});
