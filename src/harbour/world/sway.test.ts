import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { SWAY_AMP, SWAY_VERTEX_APPLY, swayAmplitude } from "./sway";

describe("08-T3 sway", () => {
  it("stays a few centimetres in ordinary wind and never exceeds ~0.4 m in a storm", () => {
    expect(swayAmplitude(0.8, 0.35, 1)).toBeGreaterThan(0.05);
    expect(swayAmplitude(0.8, 0.35, 1)).toBeLessThan(0.15);
    expect(swayAmplitude(1, 5, 1)).toBeCloseTo(SWAY_AMP.calm + SWAY_AMP.perWind * 1.4);
    expect(swayAmplitude(1, 5, 1)).toBeLessThan(0.4);
  });
  it("is still under reduced motion (gain 0) and on unweighted vertices", () => {
    expect(swayAmplitude(1, 1, 0)).toBe(0);
    expect(swayAmplitude(0, 1, 1)).toBe(0);
  });
  it("handles USE_INSTANCING with instanceMatrix, HB_VEG_INSTANCED aVegMeta.z gain, and exact non-uniform TRS inverse", () => {
    expect(SWAY_VERTEX_APPLY).toContain("#ifdef USE_INSTANCING");
    expect(SWAY_VERTEX_APPLY).toContain("mat4 hbM = modelMatrix * instanceMatrix;");
    expect(SWAY_VERTEX_APPLY).toContain("#ifdef HB_VEG_INSTANCED");
    expect(SWAY_VERTEX_APPLY).toContain("float hbSwGain = aVegMeta.z;");

    // Verify the column-normalized transpose inverse matches Matrix4 forward transform exactly
    // under arbitrary yaw rotation AND non-uniform scaleXZ != scaleY.
    const yaw = 1.17;
    const hbM = new THREE.Matrix4().compose(
      new THREE.Vector3(42, 7.5, -63),
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw),
      new THREE.Vector3(1.65, 0.58, 1.65),
    );
    const e = hbM.elements;
    const c0 = new THREE.Vector3(e[0], e[1], e[2]);
    const c1 = new THREE.Vector3(e[4], e[5], e[6]);
    const c2 = new THREE.Vector3(e[8], e[9], e[10]);
    const worldDelta = new THREE.Vector3(0.24, -0.04, -0.17);
    const localDelta = new THREE.Vector3(
      c0.dot(worldDelta) / c0.dot(c0),
      c1.dot(worldDelta) / c1.dot(c1),
      c2.dot(worldDelta) / c2.dot(c2),
    );
    const roundTrip = localDelta.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(hbM));
    expect(roundTrip.x).toBeCloseTo(worldDelta.x, 6);
    expect(roundTrip.y).toBeCloseTo(worldDelta.y, 6);
    expect(roundTrip.z).toBeCloseTo(worldDelta.z, 6);
  });
});
