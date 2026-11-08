import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { calendarRecipes, visitShaderRecipes } from "./shader-recipes";
import { declarations } from "./shaders/matrix-runner";
import { seasonWeights } from "../season/calendar";
import { createWorldUniforms } from "./uniforms";
import { HarbourMaterials, shaderFeatureKey } from "../world/materials";
import { formatShaderVerdicts, matrixExitCode } from "../../../scripts/harbour/shader-matrix-core.mjs";

it("enumerates actual calendar identities once, keeping correlated bare/stooks/crop/biolum switches", () => {
  const recipes = calendarRecipes(), seen = new Set(recipes.map((r) => `${r.key}:${r.biolum}`));
  expect(seen.size).toBe(recipes.length);
  const u = createWorldUniforms(), materials = new HarbourMaterials(u);
  for (let day = 1; day <= 365; day++) {
    u.uSeasonPhase.value = (day - 1) / 365; u.uFoliage.value.set(...seasonWeights(day));
    expect(seen.has(`${shaderFeatureKey(materials.featureIdentity())}:${u.uFoliage.value.y > 0.001}`)).toBe(true);
  }
  const ids: string[] = [];
  visitShaderRecipes(({ id, material, geometry }) => {
    ids.push(id);
    if (id.startsWith("fleet/") && id.endsWith("colour")) expect(geometry).toBe("batched");
    if (id.includes("/predepth")) expect(material).toBeInstanceOf(THREE.MeshDepthMaterial);
  });
  expect(ids.length).toBe(new Set(ids).size);
  for (const recipe of recipes) for (const lite of [false, true]) {
    const signature = recipe.key + (lite ? "_lite" : "");
    for (const mode of ["static", "instanced"]) for (const pass of ["colour", "depth", "predepth"]) expect(ids).toContain(`kit/${signature}/${mode}/${pass}`);
  }
  expect(recipes.some((r) => r.key.includes("bare_st"))).toBe(false);
  materials.dispose();
});

it("reads fixture declarations without treating comments, precision or comma/array syntax as names", () => {
  const source = `// uniform vec2 bogus;\nuniform highp sampler2D data; uniform vec3 a, b[8];\n/* attribute vec4 bogus; */ attribute float weight;`;
  expect(declarations(source, "uniform")).toEqual([
    { type: "sampler2D", name: "data", count: null }, { type: "vec3", name: "a", count: null }, { type: "vec3", name: "b", count: 8 },
  ]);
  expect(declarations(source, "attribute")).toEqual([{ type: "float", name: "weight", count: null }]);
});

describe("driver matrix verdicts", () => {
  it("cannot pass empty, undrawn, diagnostic or software runs, and retains complete logs", () => {
    const pass = { id: "kit", draws: 1, logs: [] };
    const fail = { id: "fleet", draws: 1, logs: ["vertex line 12\ncomplete diagnostic", "link failed"] };
    expect(matrixExitCode([pass], true)).toBe(0);
    expect(matrixExitCode([], true)).toBe(1);
    expect(matrixExitCode([{ ...pass, draws: 0 }], true)).toBe(1);
    expect(matrixExitCode([pass, fail], true)).toBe(1);
    expect(matrixExitCode([pass], false)).toBe(78);
    expect(formatShaderVerdicts([pass, fail])).toBe("RESULT | RECIPE | DRAWS\nPASS | kit | 1\nFAIL | fleet | 1\n\n--- fleet ---\nvertex line 12\ncomplete diagnostic\nlink failed");
  });
});
