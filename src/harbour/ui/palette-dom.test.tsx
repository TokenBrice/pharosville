// @vitest-environment jsdom
import * as THREE from "three";
import { act } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountOverlayHarness } from "../../../tests/harness/overlay";
import { createReplay } from "../../../tests/helpers/scenario";
import fixture from "../../../tests/fixtures/scenarios/current.json";
import { CameraRig } from "../engine/camera-rig";
import { createWorldUniforms } from "../engine/uniforms";
import type { Engine } from "../engine/engine";
import type { EngineContext, WorldSystem } from "../engine/types";
import { PALETTE_TOKENS } from "./palette";
import { HarbourUIStore } from "./store";

/** The real store on a bare engine: its 1 Hz tick reads ctx.uniforms.uNight. */
function storeAt(night: number) {
  const canvas = document.createElement("canvas"), camera = new THREE.PerspectiveCamera(25, 1.6), rig = new CameraRig(camera);
  const ctx = { camera, rig, scene: new THREE.Scene(), uniforms: createWorldUniforms(), services: new Map(), renderer: { domElement: canvas } } as unknown as EngineContext;
  ctx.uniforms.uNight.value = night;
  let system!: WorldSystem;
  const store = new HarbourUIStore({ ctx, add: (s: WorldSystem) => { system = s; } } as unknown as Engine);
  const frame = () => system.update({ delta: 1 / 60, elapsed: 1, nowMs: Date.now() }, ctx);
  return { store, ctx, frame, dispose: () => { store.dispose(); store.motion.dispose(); } };
}

describe("the palette follows the clock's night factor at the 1 Hz tick", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("opens in the hour's palette", () => {
    for (const [night, palette] of [[0, "day"], [0.49, "day"], [0.5, "night"], [1, "night"]] as const) {
      const f = storeAt(night);
      expect(f.store.getSnapshot().palette).toBe(palette);
      f.dispose();
    }
  });

  it("switches only on the tick, with hysteresis: night above 0.55, day below 0.45", () => {
    const f = storeAt(0.3);
    const palette = () => f.store.getSnapshot().palette;
    f.frame(); // the first tick
    f.ctx.uniforms.uNight.value = 0.6;
    vi.advanceTimersByTime(500); f.frame();
    expect(palette()).toBe("day"); // between ticks nothing moves
    vi.advanceTimersByTime(500); f.frame();
    expect(palette()).toBe("night");
    for (const night of [0.5, 0.46, 0.54, 0.45]) { f.ctx.uniforms.uNight.value = night; vi.advanceTimersByTime(1000); f.frame(); expect(palette()).toBe("night"); }
    f.ctx.uniforms.uNight.value = 0.44; vi.advanceTimersByTime(1000); f.frame();
    expect(palette()).toBe("day");
    f.ctx.uniforms.uNight.value = 0.55; vi.advanceTimersByTime(1000); f.frame();
    expect(palette()).toBe("day");
    f.dispose();
  });

  it("mirrors the visitor's Still world for its slip", () => {
    const f = storeAt(0);
    expect(f.store.getSnapshot()).toMatchObject({ still: false });
    f.store.motion.setStill(true);
    expect(f.store.getSnapshot()).toMatchObject({ still: true, reducedMotion: true });
    f.store.motion.setStill(false);
    expect(f.store.getSnapshot()).toMatchObject({ still: false });
    f.dispose();
  });
});

describe("the overlay root carries the palette", () => {
  let harness: Awaited<ReturnType<typeof mountOverlayHarness>> | undefined;
  afterEach(async () => { await act(async () => harness?.dispose()); harness = undefined; document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("sets it on the root that defines the tokens, with the token fade, and cuts under reduced motion", async () => {
    const replay = createReplay(fixture);
    vi.stubGlobal("fetch", replay.fetch); vi.spyOn(Date, "now").mockImplementation(replay.now);
    document.body.innerHTML = '<div id="overlay"></div>';
    await act(async () => { harness = await mountOverlayHarness(document.getElementById("overlay")!); });
    const root = document.querySelector<HTMLElement>(".hb-ui")!;
    expect(root.getAttribute("data-palette")).toBe("day");
    await act(async () => harness!.store.set({ palette: "night" }));
    expect(root.matches('.hb-ui[data-palette="night"]')).toBe(true);
    expect(document.querySelectorAll("[data-palette]")).toHaveLength(1);
    expect(root.style.transitionProperty.split(/,\s*/)).toEqual(PALETTE_TOKENS.map((t) => `--${t}`));
    // the harness world is still: the same root is .hb-reduced, whose transition-duration is 0s (palette.test.ts)
    expect(root.classList.contains("hb-reduced")).toBe(true);
    await act(async () => harness!.store.set({ reducedMotion: false }));
    expect(root.classList.contains("hb-reduced")).toBe(false);
    expect(root.getAttribute("data-palette")).toBe("night");
  });
});
