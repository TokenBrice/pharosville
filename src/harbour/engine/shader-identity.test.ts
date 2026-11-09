import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import fixture from "./shader-identity.json";
import { assembleShader, visitShaderRecipes } from "./shader-recipes";

it("preserves every assembled shader source, feature define and program cache key", () => {
  const hash = (source: string) => createHash("sha256").update(source).digest("hex");
  const actual: Record<string, { vertex: string; fragment: string; defines: string; cacheKey: string }> = {};
  visitShaderRecipes(({ id, material }) => {
    const shader = assembleShader(material);
    actual[id] = { vertex: hash(shader.vertexShader), fragment: hash(shader.fragmentShader), defines: hash(JSON.stringify(shader.defines)), cacheKey: material.customProgramCacheKey() };
  });
  expect(actual).toEqual(fixture);
});
