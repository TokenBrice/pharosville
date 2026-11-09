import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { EngineContext } from "../engine/types";
import { IdentitySystem } from "./identity-system";

const built = vi.hoisted(() => [] as string[]);
vi.mock("./lettering", async () => {
  const { Object3D } = await import("three");
  return { ChartLettering: class { mesh = new Object3D(); constructor() { built.push("lettering"); } } };
});
vi.mock("./crest-flags", async () => {
  const { Group } = await import("three");
  return { CrestFlags: class { group = new Group(); constructor() { built.push("flags"); } } };
});
vi.mock("./offices", () => ({ officePlots: () => [], OfficeDresser: class { constructor() { built.push("dresser"); } setFurl() {} } }));
vi.mock("./pier-marks", async () => {
  const { Object3D } = await import("three");
  return { markSites: () => [{ x: 0, z: 0 }], PierMarks: class { mesh = new Object3D(); constructor() { built.push("marks"); } } };
});

it("builds the lettering, the offices' heraldry, the house flags and the pier marks in idle steps of their own (p-hitch2)", () => {
  const layout = { civic: [], seaLevel: 0, piers: [{ segments: [] }] };
  const ctx = { scene: new THREE.Scene(), uniforms: {}, services: new Map<string, unknown>([["layout", layout], ["ground", { heightAt: () => 2 }]]) } as unknown as EngineContext;
  const texture = new THREE.Texture();
  const system = new IdentitySystem() as unknown as { dressSteps(...args: unknown[]): Generator<void, void> };
  const steps = system.dressSteps(ctx, layout, {}, texture, { chains: {} }, texture);
  const perStep: string[][] = [];
  for (let step = steps.next(); ; step = steps.next()) { perStep.push(built.splice(0)); if (step.done) break; }
  expect(perStep).toEqual([[], ["lettering"], ["dresser"], ["flags"], ["marks"]]);
  expect(ctx.scene.children).toHaveLength(3);
  expect(ctx.services.get("identity")).toMatchObject({ chains: {} });
});
