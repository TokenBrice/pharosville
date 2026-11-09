import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type { EngineContext, PreparationService } from "../engine/types";
import type { HarbourModel } from "../model/types";
import type { HarbourSim } from "../sim/sim";
import { FleetSystem } from "./fleet-system";

it("stages fallback wreck matrices while hidden and keeps the previous complete scenery until publication", async () => {
  const jobs: Array<() => void> = [], visible = new Map<number, boolean>();
  let next = 1;
  const mesh = {
    addInstance: vi.fn(() => next++), deleteInstance: vi.fn(), instanceCount: 0, maxInstanceCount: 100,
    setVisibleAt: vi.fn((id: number, shown: boolean) => visible.set(id, shown)), setMatrixAt: vi.fn(),
  };
  const prep = { submit: <T>(work: (deadline: number) => T) => new Promise<T>((resolve, reject) => { jobs.push(() => { try { resolve(work(-Infinity)); } catch (error) { reject(error); } }); }) } as unknown as PreparationService;
  const ctx = { services: new Map<string, unknown>([["preparation", prep], ["ground", { heightAt: () => 1 }]]) } as unknown as EngineContext;
  const fleet = new FleetSystem(), internal = fleet as unknown as {
    ensureData(count: number): void; wreckInst: Array<{ inst: number }>;
    placeWrecks(model: HarbourModel, sim: HarbourSim): void; wreckAbort: AbortController;
    uniforms: { uFleetData: THREE.IUniform<THREE.Texture>; uFleetPaint: THREE.IUniform<THREE.Texture> };
  };
  const geometry = new THREE.BoxGeometry();
  Object.assign(fleet, { mesh, ctx, coveState: "done", geomIds: new Map([["wreck_a", 0], ["wreck_b", 1], ["wreck_c", 2]]),
    kit: { props: new Map(["wreck_a", "wreck_b", "wreck_c"].map((id) => [id, { geometry, loa: 10 }])) },
    wreckInst: [{ inst: 0 }],
  });
  internal.ensureData(100);
  const model = { boats: [], readings: { wrecks: [{ id: "dead", name: "Dead", symbol: "D", deathDate: "2020-01-01", peakMcap: 1000 }] } } as unknown as HarbourModel;
  const sim = { pose: { count: 0 }, layout: { wrecks: [0], loa: { large: 18 }, slots: [{ id: "wreck/a", x: 0, z: 0, cls: "large", heading: 0 }] } } as unknown as HarbourSim;
  const step = async () => { jobs.shift()?.(); for (let i = 0; i < 8; i++) await Promise.resolve(); };
  internal.placeWrecks(model, sim); await step();
  expect(internal.wreckInst).toEqual([{ inst: 0 }]); expect(mesh.deleteInstance).not.toHaveBeenCalled();
  expect(mesh.setMatrixAt).toHaveBeenCalledOnce(); expect(visible.get(1)).toBe(false);
  await step();
  expect(mesh.deleteInstance).toHaveBeenCalledExactlyOnceWith(0); expect(internal.wreckInst[0].inst).toBe(1); expect(visible.get(1)).toBe(true);
  internal.placeWrecks(model, sim); await step(); internal.wreckAbort.abort(); await step();
  expect(mesh.deleteInstance).toHaveBeenLastCalledWith(2); expect(internal.wreckInst[0].inst).toBe(1);
  internal.uniforms.uFleetData.value.dispose(); internal.uniforms.uFleetPaint.value.dispose(); geometry.dispose();
});
