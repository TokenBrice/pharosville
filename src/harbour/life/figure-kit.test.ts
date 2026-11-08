import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createWorldUniforms } from "../engine/uniforms";
import { HarbourMaterials } from "../world/materials";
import { Workers } from "../civic/workers";
import { chainedKitMaterial } from "./figure-kit";

describe("kit derivatives", () => {
  it("invalidates life and civic workers once in both tier directions and unregisters disposed derivatives", () => {
    const mats = new HarbourMaterials(createWorldUniforms());
    const life = chainedKitMaterial(mats, "test", { vertexHead: "", vertexPose: "", uniforms: {} });
    const workers = new Workers(mats, 2, 17);
    const worker = workers.mesh.material as THREE.Material;
    const original = [life, worker].map((m) => m.customProgramCacheKey());
    for (const lite of [true, false]) {
      const versions = [life.version, worker.version];
      mats.setLite(lite); mats.setLite(lite);
      expect([life.version, worker.version]).toEqual(versions.map((v) => v + 1));
      if (!lite) expect([life, worker].map((m) => m.customProgramCacheKey())).toEqual(original);
    }
    life.dispose(); workers.dispose();
    const versions = [life.version, worker.version];
    mats.setLite(true);
    expect([life.version, worker.version]).toEqual(versions);
    mats.dispose();
  });
});
