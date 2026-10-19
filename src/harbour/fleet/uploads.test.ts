import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { Fenders } from "./fenders";
import { FleetSystem } from "./fleet-system";

interface FleetDataHarness {
  data: Float32Array;
  uniforms: { uFleetData: THREE.IUniform<THREE.DataTexture> };
  ensureData(max: number): void;
  writeData(inst: number, furl: number, swing: number, hi: number, r: number, g: number, b: number, slot: number): void;
  uploadData(): void;
}

describe("fleet upload ownership", () => {
  it("uploads only changed whole rows and compares stored Float32 values", () => {
    const fleet = new FleetSystem() as unknown as FleetDataHarness;
    fleet.ensureData(300);
    const texture = fleet.uniforms.uFleetData.value;
    const version = texture.version;
    fleet.writeData(0, 0.1, 0, 0, 0.3, 0.4, 0.5, 3);
    fleet.writeData(129, 0.2, 0, 0, 0.3, 0.4, 0.5, 4);
    fleet.uploadData();
    expect(texture.updateRanges).toEqual([{ start: 0, count: 1024 }, { start: 1024, count: 1024 }]);
    expect(texture.version).toBe(version + 1);
    // Repeated writes before a render must not lose or multiply pending dirty rows.
    fleet.writeData(0, 0.15, 0, 0, 0.3, 0.4, 0.5, 3);
    fleet.uploadData();
    expect(texture.updateRanges).toHaveLength(2);
    texture.clearUpdateRanges(); // renderer consumption
    const consumedVersion = texture.version;
    fleet.writeData(0, 0.15, 0, 0, 0.3, 0.4, 0.5, 3);
    fleet.uploadData();
    expect(texture.updateRanges).toEqual([]);
    expect(texture.version).toBe(consumedVersion);
    // Reusing an instance on a model refresh must dirty its old row with the new values.
    fleet.writeData(129, 0.8, 0, 0, 0.8, 0.4, 0.5, 9);
    fleet.uploadData();
    expect(texture.updateRanges).toEqual([{ start: 1024, count: 1024 }]);
    const before = fleet.data.slice();
    fleet.ensureData(600);
    expect(fleet.data.slice(0, before.length)).toEqual(before);
    expect(fleet.uniforms.uFleetData.value.version).toBeGreaterThan(0);
    fleet.uniforms.uFleetData.value.dispose();
  });

  it("limits fender matrices to the active prefix and uploads nothing when empty", () => {
    const fenders = new Fenders();
    fenders.begin();
    fenders.add(new THREE.Matrix4(), 10, 2, 1.2, 1, 1, 0);
    fenders.end();
    expect(fenders.mesh.count).toBe(3);
    expect(fenders.mesh.instanceMatrix.updateRanges).toEqual([{ start: 0, count: 3 * 16 }]);
    const version = fenders.mesh.instanceMatrix.version;
    fenders.begin(); fenders.end();
    expect(fenders.mesh.count).toBe(0);
    expect(fenders.mesh.instanceMatrix.version).toBe(version);
    fenders.dispose();
  });
});
