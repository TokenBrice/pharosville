import { Mesh, Raycaster, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { REST_SEAT_EYE_LANDSCAPE, REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { countDrawableObjects } from "./garden-util";
import { createGardenHorizon, GARDEN_HORIZON_RIDGES } from "./garden-horizon";

const FRAME = {
  cameraPosition: REST_SEAT_EYE_LANDSCAPE.world,
  clarity: 0.57,
  tier: "full" as const,
};

/** Crest vertices in the seat's frame: degrees right of the view axis, degrees up. */
function crests(mesh: Mesh): Array<{ kind: number; angle: number; elevation: number }> {
  const positions = mesh.geometry.getAttribute("position");
  const kinds = mesh.geometry.getAttribute("aKind");
  const verticals = mesh.geometry.getAttribute("aVertical");
  const forward = { x: -Math.sin(REST_SEAT_YAW_RAD), z: -Math.cos(REST_SEAT_YAW_RAD) };
  const right = { x: Math.cos(REST_SEAT_YAW_RAD), z: -Math.sin(REST_SEAT_YAW_RAD) };
  const out = [];
  for (let vertex = 0; vertex < positions.count; vertex += 1) {
    const kind = kinds.getX(vertex);
    if (verticals.getX(vertex) < 0.5 || kind >= GARDEN_HORIZON_RIDGES.length) continue;
    const x = positions.getX(vertex);
    const z = positions.getZ(vertex);
    const along = x * forward.x + z * forward.z;
    const across = x * right.x + z * right.z;
    out.push({
      kind,
      angle: Math.atan2(across, along) * 180 / Math.PI,
      elevation: Math.atan2(positions.getY(vertex), Math.hypot(along, across)) * 180 / Math.PI,
    });
  }
  return out;
}

describe("garden horizon (shakkei)", () => {
  it("keeps five borrowed ridges and their kasumi in one non-selectable draw under the triangle cap", () => {
    const horizon = createGardenHorizon();
    horizon.update(12, FRAME);
    expect(horizon.silhouetteCount).toBe(5);
    expect(horizon.triangleCount).toBeLessThanOrEqual(2_000);
    expect(countDrawableObjects(horizon.root)).toBe(1);
    const mesh = horizon.root.children[0] as Mesh;
    expect(mesh.castShadow).toBe(false);
    expect(mesh.receiveShadow).toBe(false);
    horizon.root.updateMatrixWorld(true);
    const positions = mesh.geometry.getAttribute("position");
    const faceCentre = new Vector3();
    for (let index = 0; index < 3; index += 1) {
      faceCentre.add(new Vector3().fromBufferAttribute(positions, mesh.geometry.index!.getX(index)));
    }
    faceCentre.multiplyScalar(1 / 3).applyMatrix4(mesh.matrixWorld);
    const origin = faceCentre.clone().add(new Vector3(10, 0, 10));
    const raycaster = new Raycaster(origin, faceCentre.clone().sub(origin).normalize());
    expect(raycaster.intersectObject(horizon.root, true)).toEqual([]);
    horizon.dispose();
  });

  it("keeps the peak subordinate and the sky gap behind the tower open at the seat", () => {
    const horizon = createGardenHorizon();
    const mesh = horizon.root.children[0] as Mesh;
    const all = crests(mesh);
    // No borrowed crest competes with the monument: everything under 4°.
    expect(Math.max(...all.map((crest) => crest.elevation))).toBeLessThan(4);
    // The tower stands ~6° right of the axis at the seat; the band around it
    // and the centre stay low (ma).
    const gap = all.filter((crest) => crest.angle > -3 && crest.angle < 8.5);
    expect(Math.max(...gap.map((crest) => crest.elevation))).toBeLessThanOrEqual(1);
    horizon.dispose();
  });

  it("lets PSI move only the three named ranges, farthest first; the anchor peak and the headland hold", () => {
    const horizon = createGardenHorizon();
    const material = (horizon.root.children[0] as Mesh).material as ShaderMaterial;
    const k = () => [...(material.uniforms.uRidgeK.value as number[])];
    horizon.update(12, { ...FRAME, clarity: 1 });
    const clear = k();
    horizon.update(12, { ...FRAME, clarity: 0 });
    const tremor = k();
    horizon.update(12, { ...FRAME, clarity: -1 });
    const crisis = k();
    for (const [index, ridge] of GARDEN_HORIZON_RIDGES.entries()) {
      if (ridge.psi < 0) {
        expect(clear[index]).toBe(ridge.k);
        expect(crisis[index]).toBe(ridge.k);
        continue;
      }
      // Hidden = dissolved into the air (k → 1), never a hole.
      expect(crisis[index]).toBeGreaterThan(0.95);
      expect(clear[index]).toBeLessThan(ridge.k + 1e-9);
    }
    const farRange = GARDEN_HORIZON_RIDGES.findIndex((ridge) => ridge.psi === 0);
    const eastern = GARDEN_HORIZON_RIDGES.findIndex((ridge) => ridge.psi === 2);
    expect(tremor[farRange]).toBeGreaterThan(0.95);
    expect(tremor[eastern]).toBeLessThan(0.8);
    horizon.dispose();
  });

  it("sheds only on the constrained tier", () => {
    const horizon = createGardenHorizon();
    horizon.update(12, FRAME);
    expect(horizon.root.visible).toBe(true);
    horizon.update(12, { ...FRAME, tier: "constrained" });
    expect(horizon.root.visible).toBe(false);
    horizon.dispose();
  });
});
