import type { ServiceMap, Services } from "../engine/services";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EngineContext, PreparationService } from "../engine/types";
import type { Boat, HarbourModel } from "../model/types";
import type { HarbourSim } from "../sim/sim";
import { FleetSystem } from "./fleet-system";
import type { HullVariant, Kit } from "./hull-kit";
import { indexVariants, sternLampLit } from "./variants";

type SimSlot = HarbourSim["layout"]["slots"][number];
interface RecordHarness {
  id: string; source: Boat; inst: number; slot: number; variant: HullVariant; geomCur: number; geomFull: number; geomLod: number; geomWreck: number;
  scale: number; loa: number; beam: number; top: number; visualRadius: number; wrecked: boolean; brand: THREE.Color;
  swing: number; heel: number; hi: number; px: number; pz: number; vx: number; vz: number; flag: number; struck: boolean; posed: boolean;
  swell: Float64Array; bollardSlot: SimSlot | null; bow: [number, number, number] | null; reading: boolean; lit: boolean;
}
interface FleetHarness {
  mesh: THREE.BatchedMesh; boats: RecordHarness[]; byId: Map<string, RecordHarness>; paint: Float32Array;
  modelRevision: number; needsFullPose: boolean;
  uniforms: { uFleetPaint: THREE.IUniform<THREE.DataTexture>; uFleetData: THREE.IUniform<THREE.DataTexture> };
  buildMesh(ctx: EngineContext, n: number): void;
  placeWrecks(model: HarbourModel, sim: unknown): void;
  placeBuoys(): void;
  paintFor(id: string | null, family: string, brandColor: string | null): Float32Array;
  mooringLines(b: RecordHarness, s: SimSlot, x: number, z: number, lines: number, bob: number): void;
}

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
const coin = (id: string, patch: Partial<Boat> = {}): Boat => ({
  id, name: id, symbol: id.toUpperCase(), supply: 1000, hullClass: "boat", rig: "usd", pegType: "peggedUSD",
  brandColor: "#5588AA", logo: null, chainShares: [], circuit: [], home: "far", pegDeviationBps: 0,
  activeDepeg: false, nullPeg: false, dews: "CALM", dewsScore: 0, grade: null, state: "moored", maiden: false, stormSignal: null, ...patch,
});
function model(boats: Boat[], wrecks: HarbourModel["readings"]["wrecks"] = []): HarbourModel {
  return { boats, hasFleet: true, readings: { wrecks } } as HarbourModel;
}
function fixture() {
  const geometry = new THREE.BoxGeometry(10, 8, 2);
  const variant = (id: string, family: string, cls: string, loa: number): HullVariant => ({
    id, family, cls, loa, beam: 2, full: geometry, lod: geometry, top: 8,
    bowCleat: new THREE.Vector3(4, 1, 0), sternCleat: new THREE.Vector3(-4, 1, 0), masthead: new THREE.Vector3(0, 8, 0),
    sternLantern: new THREE.Vector3(-4, 2, 0), oars: false,
  });
  const usd = variant("usd_boat", "usd", "boat", 10), eur = variant("eur_large", "eur", "large", 18);
  const kit: Kit = {
    manifest: { hulls: [], props: [] }, hulls: new Map([[usd.id, usd], [eur.id, eur]]),
    props: new Map(["wreck_a", "wreck_b", "wreck_c", "mooring_buoy"].map((id) => [id, { geometry, loa: 10, nodes: [] }])),
  };
  const ctx = { scene: new THREE.Scene(), services: new Map<string, unknown>() as Services } as unknown as EngineContext;
  const material = new THREE.MeshStandardMaterial();
  const system = new FleetSystem(), fleet = system as unknown as FleetHarness;
  const slots = new Map<string, number>();
  const atlas = { setHeroes: vi.fn().mockResolvedValue(undefined), begin: vi.fn(), end: vi.fn(), slotFor: vi.fn((b: Boat) => {
    if (!slots.has(b.id)) slots.set(b.id, slots.size);
    return slots.get(b.id)!;
  }) };
  Object.assign(atlas, { prepareCoins: async (coins: Boat[]) => {
    const assigned = new Map(coins.map((b) => [b.id, atlas.slotFor(b)]));
    return { slots: assigned, commit: () => { atlas.begin(); atlas.end(); }, dispose() {} };
  } });
  Object.assign(system, { kit, ctx, material, layout: { moorings: [{ id: "buoy", position: [3, 0, 4] }] },
    index: indexVariants([{ id: usd.id, family: usd.family, class: usd.cls }, { id: eur.id, family: eur.family, class: eur.cls }]), atlas });
  fleet.buildMesh(ctx, 32);
  const add = vi.spyOn(fleet.mesh, "addInstance"), remove = vi.spyOn(fleet.mesh, "deleteInstance");
  const geometryChange = vi.spyOn(fleet.mesh, "setGeometryIdAt"), paint = vi.spyOn(fleet, "paintFor");
  const wrecks = vi.spyOn(fleet, "placeWrecks"), buoys = vi.spyOn(fleet, "placeBuoys");
  const clear = () => { for (const spy of [add, remove, geometryChange, paint, wrecks, buoys, atlas.begin, atlas.end, atlas.slotFor]) spy.mockClear(); };
  cleanups.push(() => { fleet.mesh.dispose(); material.dispose(); geometry.dispose(); fleet.uniforms.uFleetPaint.value.dispose(); fleet.uniforms.uFleetData.value.dispose(); });
  const install = async (next: HarbourModel) => {
    const delta = await system.prepareFleet(next, undefined, ctx.services.get("readiness")?.revision ?? 0);
    delta.commit(); delta.dispose();
  };
  return { system, install, fleet, ctx, atlas, add, remove, geometryChange, paint, wrecks, buoys, clear, usd, eur };
}

describe("fleet refresh reconciliation", () => {
  it("keeps original model-order rig phases independent of partial-model instance allocation", async () => {
    const f = fixture();
    await f.install(model([coin("early")]));
    await f.install(model([coin("a"), coin("early")]));
    const a = f.fleet.byId.get("a")!, early = f.fleet.byId.get("early")!;
    expect(a.inst).toBeGreaterThan(0); // the fixture also allocates a buoy between installs
    expect(early.inst).toBe(0);
    expect(f.fleet.paint[a.inst * 20 + 11]).toBe(0);
    expect(f.fleet.paint[early.inst * 20 + 11]).toBe(1);
  });
  it("captures the installed readiness revision and requires one complete pose on each install", async () => {
    const f = fixture();
    const readiness = { revision: 3, boats: 1, prepared: true };
    f.ctx.services.set("readiness", readiness);
    await f.install(model([coin("a")]));
    expect(f.fleet.modelRevision).toBe(3);
    expect(f.fleet.needsFullPose).toBe(true);
    f.fleet.needsFullPose = false;
    readiness.revision = 4;
    // A readiness mutation alone is not submission evidence for the previously installed model.
    expect(f.fleet.modelRevision).toBe(3);
    await f.install(model([coin("a")]));
    expect(f.fleet.modelRevision).toBe(4);
    expect(f.fleet.needsFullPose).toBe(true);
  });

  it("keeps instances, texels, slots, matrices and motion history on identical/reordered/reading-only refreshes", async () => {
    const f = fixture(), a = coin("a"), b = coin("b");
    await f.install(model([a, b]));
    const oldA = f.fleet.byId.get("a")!, oldB = f.fleet.byId.get("b")!;
    Object.assign(oldA, { swing: 0.4, heel: 0.2, hi: 0.6, px: 5, pz: 6, vx: 0.7, vz: -0.2, flag: 0, struck: true, posed: false, bollardSlot: { index: 7 }, bow: [1, 2, 3] });
    const history = { ...oldA }, paint = f.fleet.paint.slice(), version = f.fleet.uniforms.uFleetPaint.value.version;
    const matrix = new THREE.Matrix4().makeTranslation(4, 5, 6);
    f.fleet.mesh.setMatrixAt(oldA.inst, matrix);
    f.clear();
    await f.install(model([{ ...b }, { ...a, name: "New name", supply: 2000, pegDeviationBps: 3, grade: "A", dews: "WATCH" }]));
    expect(f.fleet.boats).toEqual([oldB, oldA]);
    expect(f.fleet.byId.get("a")).toBe(oldA);
    expect({ ...oldA, source: history.source }).toEqual(history);
    expect(oldA.swell).toBe(history.swell);
    paint[oldA.inst * 20 + 11] = 1;
    paint[oldB.inst * 20 + 11] = 0;
    expect(f.fleet.paint).toEqual(paint);
    expect(f.fleet.uniforms.uFleetPaint.value.version).toBeGreaterThan(version);
    const actual = new THREE.Matrix4();
    f.fleet.mesh.getMatrixAt(oldA.inst, actual);
    expect(actual.elements).toEqual(matrix.elements);
    for (const spy of [f.add, f.remove, f.geometryChange, f.paint, f.wrecks, f.buoys, f.atlas.begin, f.atlas.slotFor]) expect(spy).not.toHaveBeenCalled();
  });

  it("moves an unchanged hull's reading only at commit, without a staged copy of her record (p-hitch2)", async () => {
    const f = fixture(), a = coin("a");
    await f.install(model([a]));
    const rec = f.fleet.byId.get("a")!, brand = rec.brand;
    const abandoned = await f.system.prepareFleet(model([{ ...a, supply: 3000 }]), undefined, 0);
    abandoned.dispose();
    expect(rec.source).toBe(a);
    const next = { ...a, supply: 2000, pegDeviationBps: 4 };
    const delta = await f.system.prepareFleet(model([next]), undefined, 0);
    expect(rec.source).toBe(a); // nothing is published before the commit
    delta.commit(); delta.dispose();
    expect(f.fleet.byId.get("a")).toBe(rec);
    expect(rec.source).toBe(next);
    expect(rec.brand).toBe(brand); // the same colour object: no clone was staged and swapped in
  });

  it("only adds/removes actual membership changes and preserves a survivor's slot and instance", async () => {
    const f = fixture();
    await f.install(model([coin("a"), coin("b")]));
    const a = f.fleet.byId.get("a")!, b = f.fleet.byId.get("b")!;
    f.clear();
    await f.install(model([coin("c"), coin("b")]));
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(a.inst);
    expect(f.add).toHaveBeenCalledTimes(1);
    expect(f.paint).toHaveBeenCalledTimes(1);
    expect(f.fleet.byId.get("b")).toBe(b);
    expect(f.fleet.boats.map((r) => r.id)).toEqual(["c", "b"]);
    expect(f.atlas.slotFor).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ id: "c" }));
    expect(f.buoys).not.toHaveBeenCalled();
  });

  it("updates livery, brand and monogram inputs without resetting history or touching other boats", async () => {
    const f = fixture();
    await f.install(model([coin("a"), coin("b")]));
    const a = f.fleet.byId.get("a")!, b = f.fleet.byId.get("b")!, slot = a.slot;
    a.vx = 2; a.hi = 0.5;
    f.clear();
    const changed = coin("a", { brandColor: "#AA6633", symbol: "NEW" });
    await f.install(model([changed, coin("b")]));
    expect(f.fleet.byId.get("a")).toBe(a); expect(f.fleet.byId.get("b")).toBe(b);
    expect(a.brand.equals(new THREE.Color(changed.brandColor))).toBe(true);
    expect([a.vx, a.hi, a.slot]).toEqual([2, 0.5, slot]);
    expect(f.paint).toHaveBeenCalledExactlyOnceWith("a", "usd", changed.brandColor);
    expect(f.atlas.slotFor).toHaveBeenCalledExactlyOnceWith(changed);
    for (const spy of [f.add, f.remove, f.geometryChange]) expect(spy).not.toHaveBeenCalled();
    f.clear();
    await f.install(model([{ ...changed, symbol: "OTHER" }, coin("b")]));
    expect(f.paint).not.toHaveBeenCalled();
    expect(f.atlas.slotFor).toHaveBeenCalledTimes(1);
  });

  it("reconciles geometry, dimensions, mooring caches, wreck state and peg-light truth in place", async () => {
    const f = fixture();
    await f.install(model([coin("a")]));
    const a = f.fleet.byId.get("a")!, inst = a.inst, slot = a.slot;
    a.swing = 0.2;
    f.clear();
    await f.install(model([coin("a", { rig: "eur", hullClass: "large" })]));
    expect(a.variant).toBe(f.eur);
    expect([a.inst, a.slot, a.swing, a.loa, a.beam, a.top, a.bollardSlot]).toEqual([inst, slot, 0.2, 18, 2, 8, null]);
    expect(f.geometryChange).toHaveBeenCalledTimes(1);
    expect(f.paint).toHaveBeenCalledExactlyOnceWith("a", "eur", "#5588AA");
    f.clear();
    await f.install(model([coin("a", { rig: "eur", hullClass: "large", nullPeg: true })]));
    expect(a.reading).toBe(false); expect(a.lit).toBe(false);
    expect(f.paint).not.toHaveBeenCalled(); expect(f.atlas.slotFor).not.toHaveBeenCalled();
    await f.install(model([coin("a", { rig: "eur", hullClass: "large", state: "wrecked" })]));
    expect(a.wrecked).toBe(true); expect(a.geomCur).toBe(a.geomWreck);
    expect(f.fleet.paint.slice(inst * 20, inst * 20 + 20)).toEqual(new Float32Array(20));
    await f.install(model([coin("a", { rig: "eur", hullClass: "large" })]));
    expect(a.wrecked).toBe(false); expect(a.reading).toBe(true);
    expect(a.lit).toBe(sternLampLit(coin("a"), "moored"));
    expect(a.geomCur === a.geomFull || a.geomCur === a.geomLod).toBe(true);
    expect(f.add).not.toHaveBeenCalled(); expect(f.remove).not.toHaveBeenCalled();
  });

  it("invalidates berth endpoints when a raft replan reuses the same numeric slot index", async () => {
    const f = fixture();
    await f.install(model([coin("a")]));
    const a = f.fleet.byId.get("a")!;
    // Only berth fields read by mooringLines are relevant; no sim/renderer is needed.
    const oldSlot = { kind: "berth", index: 7, id: "old/raft", heading: 0, x: 0, z: 0 } as SimSlot;
    const newSlot = { ...oldSlot, id: "new/raft", x: 10 };
    a.bollardSlot = oldSlot; a.bow = [1, 2, 3];
    f.fleet.mooringLines(a, oldSlot, 0, 0, 0, 0);
    expect(a.bow).toEqual([1, 2, 3]); // exactly the same immutable slot keeps its cache
    f.fleet.mooringLines(a, newSlot, 10, 0, 0, 0);
    expect(a.bollardSlot).toBe(newSlot);
    expect(a.bow).toBeNull(); // neither fixture pier exists: recomputation must clear the old endpoint
  });

  it("rebuilds wreck scenery only when dead fields, live exclusions or occupied wreck slots change", async () => {
    const f = fixture();
    f.wrecks.mockImplementation(() => {}); // exercise invalidation without requiring authored cove/ground fixtures
    const dead: HarbourModel["readings"]["wrecks"] = [{ id: "dead", name: "Dead", symbol: "D", cause: "Cause", family: "exploit", deathDate: "2025-01-01", peakMcap: 1000 }];
    await f.install(model([coin("a")], dead)); f.clear();
    await f.install(model([coin("a")], dead.map((w) => ({ ...w }))));
    expect(f.wrecks).not.toHaveBeenCalled();
    await f.install(model([coin("a")], [{ ...dead[0], peakMcap: 2000 }]));
    expect(f.wrecks).toHaveBeenCalledTimes(1); f.clear();
    await f.install(model([coin("a"), coin("dead")], [{ ...dead[0], peakMcap: 2000 }]));
    expect(f.wrecks).toHaveBeenCalledTimes(1); f.clear();
    f.ctx.services.set("sim", { pose: { count: 2, slot: [3, -1] } } as unknown as ServiceMap["sim"]);
    await f.install(model([coin("a", { state: "wrecked" }), coin("dead")], [{ ...dead[0], peakMcap: 2000 }]));
    expect(f.wrecks).toHaveBeenCalledTimes(1);
    expect(f.buoys).not.toHaveBeenCalled();
  });
});

describe("bounded fleet installation", () => {
  function queue(f: ReturnType<typeof fixture>) {
    const jobs: Array<() => void> = [];
    f.ctx.services.set("preparation", {
      submit: <T>(work: (deadline: number) => T, options: { signal?: AbortSignal }) => new Promise<T>((resolve, reject) => {
        jobs.push(() => { try { options.signal?.throwIfAborted(); resolve(work(-Infinity)); } catch (error) { reject(error); } });
      }),
      stageTexture: async () => {},
    } as unknown as PreparationService);
    const step = async () => { jobs.shift()?.(); for (let i = 0; i < 6; i++) await Promise.resolve(); };
    return { jobs, step };
  }

  it("culls hull by hull only: the batch's whole-object sphere, cached at its first test, never gates the fleet", async () => {
    const f = fixture();
    expect(f.fleet.mesh.perObjectFrustumCulled).toBe(true);
    expect(f.fleet.mesh.frustumCulled).toBe(false);
    // the sphere three would cache before the staged install poses a hull: empty, at the origin
    f.fleet.mesh.computeBoundingSphere();
    const first = f.fleet.mesh.boundingSphere!.clone();
    await f.install(model([coin("a")]));
    const a = f.fleet.byId.get("a")!;
    f.fleet.mesh.setMatrixAt(a.inst, new THREE.Matrix4().makeTranslation(-350, 0, -60));
    // a close camera on that hull (the Shoals' framing) does not see the stale sphere, yet the hull is in view
    const camera = new THREE.PerspectiveCamera(25, 1.6, 5, 9000);
    camera.position.set(-350 + 280 * Math.SQRT1_2 * Math.cos(0.454), 280 * Math.sin(0.454), -60 + 280 * Math.SQRT1_2 * Math.cos(0.454));
    camera.lookAt(-350, 0, -60); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    const frustum = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    expect(frustum.intersectsSphere(first)).toBe(false);
    expect(frustum.containsPoint(new THREE.Vector3(-350, 0, -60))).toBe(true);
  });

  it("stages hidden additions without changing live membership, colours or revision, and keeps history at commit", async () => {
    const f = fixture(); await f.install(model([coin("a")]));
    const old = f.fleet.byId.get("a")!, source = old.source, color = old.brand.clone(), q = queue(f);
    const pending = f.system.prepareFleet(model([coin("a", { brandColor: "#AA6633" }), coin("b"), coin("c")]), undefined, 9);
    await q.step();
    expect(f.fleet.boats).toEqual([old]); expect(old.source).toBe(source); expect(old.brand.equals(color)).toBe(true);
    expect(f.fleet.modelRevision).toBe(0); expect(q.jobs).toHaveLength(1);
    await q.step();
    const inst = f.add.mock.results.at(-1)!.value as number;
    expect(f.fleet.mesh.getVisibleAt(inst)).toBe(false); expect(f.fleet.byId.has("b")).toBe(false);
    old.vx = 3; old.swing = 0.7; // the old fleet keeps running during preparation
    await q.step(); const prepared = await pending;
    expect(old.source).toBe(source); prepared.commit(); prepared.dispose();
    expect(f.fleet.byId.get("a")).toBe(old); expect([old.vx, old.swing]).toEqual([3, 0.7]);
    expect(f.fleet.modelRevision).toBe(9); expect(f.fleet.needsFullPose).toBe(true);
    expect(f.fleet.boats.map((b) => b.id)).toEqual(["a", "b", "c"]);
  });

  it("releases superseded hidden instances and never publishes its changed source or atlas", async () => {
    const f = fixture(); await f.install(model([coin("a")])); f.clear();
    const old = f.fleet.byId.get("a")!, source = old.source, q = queue(f), controller = new AbortController();
    const pending = f.system.prepareFleet(model([coin("new"), coin("a", { symbol: "CHANGED" })]), undefined, 7, controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await q.step(); const allocated = f.add.mock.results[0].value as number;
    controller.abort(); await q.step(); await rejected;
    expect(f.remove).toHaveBeenCalledExactlyOnceWith(allocated); expect(old.source).toBe(source);
    expect(f.fleet.boats).toEqual([old]); expect(f.atlas.begin).not.toHaveBeenCalled();
  });
});
