import { useState, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { Mesh, MeshStandardMaterial, Vector2, type Object3D } from "three";
import type { DrawOwnerCensus } from "../three/garden-draw-census";
import type { ThreeWorldRenderer } from "../renderer/world-renderer-backend";
import { chainGardenMaterialPatch, GARDEN_AIR } from "../three/garden-aerial";
import { getGardenSurfaceExemption, GARDEN_SURFACE_RECIPES, type GardenSurfaceMetadata } from "../three/garden-surfaces";
import {
  GARDEN_APPEARANCE_DEFAULTS, GARDEN_APPEARANCE_PRESETS, GARDEN_APPEARANCE_PARAMETERS,
  exportGardenAppearance, gardenAppearanceChecksum, parseGardenAppearance,
  type GardenAppearance, type GardenAppearanceParameter, type GardenLookdevHost, type GardenLookdevRenderer,
} from "../three/garden-appearance";

export interface GardenLookdevSnapshot {
  schemaVersion: number; preset: string; checksum: string; appliedChecksum: string | null;
  inspectorActive: boolean; owners: readonly { name: string; epoch: number; dirty: boolean }[];
  census: DrawOwnerCensus | null;
}
export interface GardenLookdevAPI {
  install(value: unknown): GardenLookdevSnapshot;
  export(): string;
  snapshot(): GardenLookdevSnapshot;
  inspect(mode: "isolate" | "highlight" | "reset", owner?: string): void;
}
type LookdevWindow = typeof window & {
  __pharosVilleTestAppearance?: unknown;
  __pharosVilleLookdev?: GardenLookdevAPI;
};

/** Installed before the hook admits its first frame. No timers or RAF of its own. */
export function mountGardenLookdev(renderer: ThreeWorldRenderer & GardenLookdevRenderer, canvas: HTMLCanvasElement): () => void {
  const rendererHost = renderer.gardenLookdev;
  if (!rendererHost) throw new Error("Garden lookdev requires a DEV renderer.");
  const host: GardenLookdevHost = rendererHost;
  const target = window as LookdevWindow;
  const initialAppearance = target.__pharosVilleTestAppearance === undefined ? undefined
    : parseGardenAppearance(typeof target.__pharosVilleTestAppearance === "string"
      ? JSON.parse(target.__pharosVilleTestAppearance) : target.__pharosVilleTestAppearance);
  let disposed = false;
  let mode: "isolate" | "highlight" | "reset" = "reset";
  let panelOpen = false;
  let ownerName: string | undefined;
  let appearance = host.current();
  let appliedChecksum: string | null = null;
  let pendingPublish = true;
  let owners = host.owners();
  let snapshot: GardenLookdevSnapshot;
  const listeners = new Set<() => void>();
  const visibility = new Map<Object3D, boolean>();
  const wires = new Map<MeshStandardMaterial, boolean>();
  const bases = new WeakMap<MeshStandardMaterial, { flatShading: boolean }>();
  const surfaceUniform = { value: new Vector2() };
  const lights = host.lights();
  const airSun = GARDEN_AIR.airSun.clone();
  const airAnti = GARDEN_AIR.airAnti.clone();
  const airlight = GARDEN_AIR.airlight.clone();
  let radiance = GARDEN_AIR.radiance;
  let airApplied = false;
  function restore() {
    for (const [root, visible] of visibility) root.visible = visible;
    for (const [material, wireframe] of wires) material.wireframe = wireframe;
    if (airApplied) {
      GARDEN_AIR.radiance = radiance;
      GARDEN_AIR.airSun.copy(airSun); GARDEN_AIR.airAnti.copy(airAnti); GARDEN_AIR.airlight.copy(airlight);
      airApplied = false;
    }
  }
  function publish() {
    owners = host.owners();
    snapshot = {
      schemaVersion: appearance.schemaVersion, preset: appearance.preset,
      checksum: gardenAppearanceChecksum(appearance), appliedChecksum,
      inspectorActive: panelOpen || mode !== "reset", owners: owners.map(({ name, epoch, dirty }) => ({ name, epoch, dirty })),
      census: host.census(),
    };
    pendingPublish = false;
    for (const listener of listeners) listener();
  }
  function install(value: unknown) {
    if (disposed) throw new Error("Garden lookdev is disposed.");
    const next = parseGardenAppearance(typeof value === "string" ? JSON.parse(value) : value);
    host.queue(next);
    appearance = host.current();
    pendingPublish = true;
    publish();
    pendingPublish = true;
    return snapshot;
  }
  const api: GardenLookdevAPI = {
    install,
    export: () => exportGardenAppearance(appearance),
    snapshot: () => snapshot,
    inspect(nextMode, name) {
      if (disposed) throw new Error("Garden lookdev is disposed.");
      restore(); visibility.clear(); wires.clear();
      owners = host.owners();
      if (nextMode !== "reset" && !owners.some((owner) => owner.name === name)) throw new Error("Unknown garden inspector owner.");
      mode = nextMode; ownerName = name;
      pendingPublish = true;
      host.requestCensus();
      publish();
    },
  };
  const visitMaterial = (material: MeshStandardMaterial) => {
    const metadata = material.userData.gardenSurface as GardenSurfaceMetadata | undefined;
    if (!metadata || getGardenSurfaceExemption(material)) return;
    let base = bases.get(material);
    if (!base) {
      base = { flatShading: material.flatShading }; bases.set(material, base);
      // Reuse the surface recipe's role/range shader, including mixed-role terrain.
      chainGardenMaterialPatch(material, {
        key: "garden-lookdev-surface-v1", slot: "garden-lookdev", stage: "surface",
        compile(shader) {
          shader.uniforms.uGardenLookdevRoughness = surfaceUniform;
          shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", `#include <common>
uniform vec2 uGardenLookdevRoughness;`)
            .replace("gardenSurfaceRange.z);", `gardenSurfaceRange.z);
  float gardenLookdevDelta = gardenSurfaceRole < 0.5 ? uGardenLookdevRoughness.x
    : gardenSurfaceRole < 1.5 ? uGardenLookdevRoughness.y : 0.0;
  if (gardenLookdevDelta != 0.0) roughnessFactor = clamp(roughnessFactor + gardenLookdevDelta, gardenSurfaceRange.y, gardenSurfaceRange.z);`);
        },
      });
    }
    if (metadata.role !== "moss" && metadata.role !== "stone") return;
    const shading = metadata.role === "moss" ? appearance.mossShading : appearance.stoneShading;
    const flat = shading === "authored" ? base.flatShading : shading === "faceted";
    if (material.flatShading !== flat) { material.flatShading = flat; material.needsUpdate = true; }
  };
  const visit = (node: Object3D) => {
    if (!(node instanceof Mesh)) return;
    if (Array.isArray(node.material)) {
      for (const material of node.material) if (material instanceof MeshStandardMaterial) visitMaterial(material);
    } else if (node.material instanceof MeshStandardMaterial) visitMaterial(node.material);
  };
  const highlight = (node: Object3D) => {
    if (!(node instanceof Mesh)) return;
    if (Array.isArray(node.material)) {
      for (const material of node.material) if (material instanceof MeshStandardMaterial) {
        if (!wires.has(material)) wires.set(material, material.wireframe);
        material.wireframe = true;
      }
    } else if (node.material instanceof MeshStandardMaterial) {
      if (!wires.has(node.material)) wires.set(node.material, node.material.wireframe);
      node.material.wireframe = true;
    }
  };
  host.onFrameStart = restore;
  host.onBeforeFrame = () => {
    const queuedAppearance = host.current();
    if (queuedAppearance !== appearance) {
      appearance = queuedAppearance;
      publish();
      pendingPublish = true;
    }
    surfaceUniform.value.set(appearance.mossRoughness - GARDEN_SURFACE_RECIPES.moss.roughness,
      appearance.stoneRoughness - GARDEN_SURFACE_RECIPES.stone.roughness);
    lights.key.intensity *= appearance.keyLight;
    lights.ambient.intensity *= appearance.skyFill;
    lights.hemisphere.intensity *= appearance.skyFill;
    radiance = GARDEN_AIR.radiance;
    airSun.copy(GARDEN_AIR.airSun); airAnti.copy(GARDEN_AIR.airAnti); airlight.copy(GARDEN_AIR.airlight);
    airApplied = true;
    GARDEN_AIR.radiance *= appearance.airBalance;
    GARDEN_AIR.airSun.multiplyScalar(appearance.airBalance);
    GARDEN_AIR.airAnti.multiplyScalar(appearance.airBalance);
    GARDEN_AIR.airlight.multiplyScalar(appearance.airBalance);
    host.root().traverse(visit);
    if (mode === "isolate") {
      for (const owner of owners) {
        // Scene lights remain on: isolation diagnoses owners under production light.
        if ("isLight" in owner.root) continue;
        visibility.set(owner.root, owner.root.visible);
        owner.root.visible = owner.root.visible && owner.name === ownerName;
      }
    } else if (mode === "highlight") {
      for (const owner of owners) if (owner.name === ownerName) owner.root.traverse(highlight);
    }
    appliedChecksum = snapshot.checksum;
  };
  const isDirty = (owner: GardenLookdevSnapshot["owners"][number]) => owner.dirty;
  host.onAfterFrame = () => {
    if (pendingPublish || snapshot.appliedChecksum !== appliedChecksum || snapshot.owners.some(isDirty) || snapshot.census !== host.census()) publish();
  };
  publish();
  // Preview injects this local object before navigation; it never enters /api.
  if (initialAppearance) install(initialAppearance);
  target.__pharosVilleLookdev = api;
  const container = document.createElement("div");
  canvas.parentElement?.append(container);
  const root = createRoot(container);
  const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
  function Panel() {
    const state = useSyncExternalStore(subscribe, api.snapshot);
    const [open, setOpen] = useState(false);
    const download = () => {
      const url = URL.createObjectURL(new Blob([api.export()], { type: "application/json" }));
      const link = document.createElement("a"); link.href = url; link.download = `garden-${state.preset}.json`; link.click(); URL.revokeObjectURL(url);
    };
    return <>
      <button type="button" className="pharosville-debug-chrome" aria-expanded={open} aria-controls="garden-lookdev-panel" onClick={() => { panelOpen = !open; setOpen(panelOpen); publish(); host.requestCensus(); }}>Garden lookdev · DEV</button>
      {open && <dialog id="garden-lookdev-panel" open className="pharosville-changelog-panel pharosville-legend-panel" aria-label="Garden appearance and owner inspector">
      <section className="pharosville-detail-panel__inner pharosville-legend-panel__body">
        <p>Appearance only. Inspector frames are not art evidence.</p>
        <button type="button" className="pharosville-detail-panel__close" onClick={() => { panelOpen = false; setOpen(false); publish(); }}>Close lookdev</button>
        <label>Preset <select value={appearance.preset} onChange={(event) => install(GARDEN_APPEARANCE_PRESETS.find((preset) => preset.preset === event.target.value))}>
          {!GARDEN_APPEARANCE_PRESETS.some((preset) => preset.preset === appearance.preset) && <option value={appearance.preset}>{appearance.preset}</option>}
          {GARDEN_APPEARANCE_PRESETS.map((preset) => <option key={preset.preset}>{preset.preset}</option>)}
        </select></label>
        <button type="button" onClick={() => install(GARDEN_APPEARANCE_DEFAULTS)}>Reset appearance</button>
        <button type="button" onClick={download}>Export JSON</button>
        <dl>{(Object.entries(GARDEN_APPEARANCE_PARAMETERS) as [GardenAppearanceParameter, { min: number; max: number; update: string }][]).map(([key, range]) => <div key={key} className="pv-fact-row">
          <dt><label htmlFor={`garden-${key}`}>{key} · {range.update}</label></dt>
          <dd><input id={`garden-${key}`} type="range" min={range.min} max={range.max} step="0.01" value={appearance[key]} onChange={(event) => install({ ...appearance, preset: "custom", [key]: Number(event.target.value) })} /> {appearance[key]}</dd>
        </div>)}</dl>
        {(["mossShading", "stoneShading"] as const).map((key) => <label key={key}>{key} · material-recompile <select value={appearance[key]} onChange={(event) => install({ ...appearance, preset: "custom", [key]: event.target.value })}>
          <option>authored</option><option>smooth</option><option>faceted</option>
        </select></label>)}
        <p>Schema {state.schemaVersion} · {state.checksum} · {state.appliedChecksum === state.checksum ? "applied" : "queued"}</p>
        <details><summary>Named owner inspector{state.inspectorActive ? " · active" : ""}</summary>
          <button type="button" onClick={() => api.inspect("reset")}>Reset inspector</button>
          <button type="button" onClick={() => host.requestCensus()}>Refresh census</button>
          <table><caption>Production owner epochs and pending rebuilds</caption><thead><tr><th>Owner</th><th>Epoch / state</th><th>Inspect</th></tr></thead><tbody>
            {state.owners.map((owner) => <tr key={owner.name}><th scope="row">{owner.name}</th><td>{owner.epoch} / {owner.dirty ? "dirty" : "clean"}</td><td>
              <button type="button" onClick={() => api.inspect("isolate", owner.name)}>Isolate</button>
              <button type="button" onClick={() => api.inspect("highlight", owner.name)}>Highlight</button>
              {owner.epoch > 0 && <button type="button" onClick={() => { host.rebuild(owner.name); pendingPublish = true; publish(); pendingPublish = true; }}>Rebuild</button>}
            </td></tr>)}
          </tbody></table>
          <table><caption>Draw census · frame {state.census?.sampledAtFrame ?? "pending"}</caption><thead><tr><th>Named draw owner</th><th>Calls</th><th>Triangles</th></tr></thead><tbody>
            {state.census?.owners.map((owner) => <tr key={owner.owner}><th scope="row">{owner.owner}</th><td>{owner.calls}</td><td>{owner.triangles}</td></tr>)}
          </tbody></table>
        </details>
      </section>
      </dialog>}
    </>;
  }
  root.render(<Panel />);
  const cleanup = () => {
    if (disposed) return;
    disposed = true; restore(); visibility.clear(); wires.clear(); listeners.clear();
    surfaceUniform.value.set(0, 0);
    appearance = GARDEN_APPEARANCE_DEFAULTS;
    host.root().traverse(visit);
    delete host.onFrameStart; delete host.onBeforeFrame; delete host.onAfterFrame; delete host.onDispose;
    if (target.__pharosVilleLookdev === api) delete target.__pharosVilleLookdev;
    root.unmount(); container.remove();
  };
  host.onDispose = cleanup;
  if (import.meta.hot) {
    import.meta.hot.accept("../three/garden-appearance", (module) => {
      if (disposed || !module) return;
      install(module.GARDEN_APPEARANCE_PRESETS.find((preset: GardenAppearance) => preset.preset === appearance.preset) ?? appearance);
    });
    import.meta.hot.dispose(cleanup);
  }
  return cleanup;
}
