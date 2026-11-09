import * as THREE from "three";
import { expect, it, vi } from "vitest";
import { FleetSystem } from "./fleet-system";

const scope = vi.hoisted(() => ({ low: false }));
vi.mock("../world/materials", () => ({ getHarbourMaterials: () => ({ preparationScope: (low: boolean) => {
  const before = scope.low; scope.low = low; return () => { scope.low = before; };
} }) }));

it("prepares and retains both fade shader tiers with no live material change across awaits", async () => {
  const system = new FleetSystem(), material = new THREE.MeshStandardMaterial();
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
  Object.assign(system, { mesh, material });
  const tiers: boolean[] = [], programs: unknown[] = [];
  const prepare = vi.fn(async (_entries, enter: () => () => void) => {
    const restore = enter();
    expect(material.transparent).toBe(true); tiers.push(scope.low); restore();
    await Promise.resolve(); expect(material.transparent).toBe(false);
    const receipt = { status: "complete", dispose: vi.fn() }; programs.push(receipt); return receipt;
  });
  const ctx = { services: new Map([["preparation", { prepare }]]), composer: { inputBuffer: null } };
  await system.prepareIdle(ctx as never);
  expect(tiers).toEqual([false, true]); expect(prepare).toHaveBeenCalledTimes(2);
  expect((system as unknown as { resumePrograms: unknown[] }).resumePrograms).toEqual(programs);
  material.dispose(); mesh.geometry.dispose();
});
