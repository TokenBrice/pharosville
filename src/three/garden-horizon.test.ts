import { Mesh, Raycaster, ShaderMaterial, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { REST_SEAT_EYE_LANDSCAPE, REST_SEAT_YAW_RAD } from "../systems/rest-seat";
import { countDrawableObjects } from "./garden-util";
import { createGardenHorizon, GARDEN_HORIZON_RIDGES } from "./garden-horizon";
import { createGardenRimMesh } from "./garden-rim-mesh";

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
  it("keeps four sky ridges and kasumi in one non-selectable draw; the world headland belongs to the rim", () => {
    const horizon = createGardenHorizon();
    horizon.update(12, FRAME);
    expect(horizon.silhouetteCount).toBe(4);
    expect(GARDEN_HORIZON_RIDGES.map((ridge) => ridge.name)).toEqual([
      "peak", "far-range", "eastern-ridge", "western-ridge",
    ]);
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

  it("lets PSI move only the three named ranges, farthest first; the anchor peak holds", () => {
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

  it("gives the fixed-world near headland parallax while sky ranges remain eye-relative", () => {
    const horizon = createGardenHorizon();
    const rim = createGardenRimMesh();
    const sky = horizon.root.children[0] as Mesh;
    const land = rim.root.getObjectByName("garden-rim-land") as Mesh;
    const positions = land.geometry.getAttribute("position");
    let crest = -1;
    for (let i = 0; i < positions.count; i += 1) {
      if (positions.getZ(i) < 0 && (crest < 0 || positions.getY(i) > positions.getY(crest))) crest = i;
    }
    expect(crest).toBeGreaterThanOrEqual(0);
    const near = new Vector3().fromBufferAttribute(positions, crest);
    expect(near.y).toBeGreaterThan(10);
    const eye = new Vector3(FRAME.cameraPosition.x, FRAME.cameraPosition.y, FRAME.cameraPosition.z);
    const movedEye = eye.clone().add(new Vector3(20, 2, 10));
    const localSky = new Vector3().fromBufferAttribute(sky.geometry.getAttribute("position"), 1);
    horizon.update(12, FRAME);
    horizon.root.updateMatrixWorld(true);
    rim.root.updateMatrixWorld(true);
    const skyDirection = sky.localToWorld(localSky.clone()).sub(eye).normalize();
    const nearWorld = land.localToWorld(near.clone());
    const nearDirection = nearWorld.clone().sub(eye).normalize();
    const forward = new Vector3(-Math.sin(REST_SEAT_YAW_RAD), 0, -Math.cos(REST_SEAT_YAW_RAD));
    const right = new Vector3(Math.cos(REST_SEAT_YAW_RAD), 0, -Math.sin(REST_SEAT_YAW_RAD));
    expect(Math.atan2(nearDirection.dot(right), nearDirection.dot(forward)) * 180 / Math.PI).toBeGreaterThan(8.5);
    expect(Math.asin(nearDirection.y) * 180 / Math.PI).toBeLessThan(4);
    horizon.update(12, {
      ...FRAME,
      clarity: -1,
      cameraPosition: { x: movedEye.x, y: movedEye.y, z: movedEye.z },
    });
    horizon.root.updateMatrixWorld(true);
    rim.root.updateMatrixWorld(true);
    expect(sky.localToWorld(localSky.clone()).sub(movedEye).normalize().distanceTo(skyDirection)).toBeLessThan(1e-12);
    expect(land.localToWorld(near.clone()).distanceTo(nearWorld)).toBe(0);
    expect(nearWorld.clone().sub(movedEye).normalize().distanceTo(nearDirection)).toBeGreaterThan(0.01);
    horizon.dispose();
    rim.dispose();
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
