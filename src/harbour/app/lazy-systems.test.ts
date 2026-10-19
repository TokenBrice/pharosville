import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EngineContext, FrameState } from "../engine/types";
import { LazyLifeSystem } from "../life/lazy-system";
import { LazyIdentitySystem } from "../identity/lazy-system";

const ctx = { services: new Map<string, unknown>() } as EngineContext;
const frame: FrameState = { elapsed: 1, delta: 1 / 60, nowMs: 1000 };
const events: string[] = [];
const lifeLoaded = vi.fn();
const identityLoaded = vi.fn();
const lifeInit = vi.fn(async () => { events.push("life:init"); });
const identityInit = vi.fn(async () => { events.push("identity:init"); });
const update = vi.fn();
const resize = vi.fn();
const dispose = vi.fn();

beforeEach(() => {
  // Module boundary tests intentionally reset dynamic implementation imports between cases.
  vi.resetModules();
  vi.clearAllMocks();
  events.length = 0;
  lifeInit.mockImplementation(async () => { events.push("life:init"); });
  identityInit.mockImplementation(async () => { events.push("identity:init"); });
  vi.doMock("../life/life-system", () => {
    lifeLoaded();
    return { LifeSystem: class { init = lifeInit; update = update; resize = resize; dispose = dispose; } };
  });
  vi.doMock("../identity/identity-system", () => {
    identityLoaded();
    return { IdentitySystem: class { init = identityInit; update = update; resize = resize; dispose = dispose; } };
  });
});

describe("deferred life/identity module boundaries", () => {
  it("preserves deferred registry names without evaluating implementation code at construction", () => {
    const life = new LazyLifeSystem(), identity = new LazyIdentitySystem();
    expect([life.name, identity.name]).toEqual(["life", "identity"]);
    life.update(frame, ctx);
    identity.update(frame, ctx);
    life.resize(1000, 800, ctx);
    identity.resize(1000, 800, ctx);
    life.dispose(ctx);
    identity.dispose(ctx);
    expect(lifeLoaded).not.toHaveBeenCalled();
    expect(identityLoaded).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(resize).not.toHaveBeenCalled();
    expect(dispose).not.toHaveBeenCalled();
  });

  it("imports and initializes only at its ordered init slot, then delegates the same frame and context", async () => {
    const systems = [new LazyLifeSystem(), new LazyIdentitySystem()];
    await systems[0].init(ctx);
    expect(lifeLoaded).toHaveBeenCalledOnce();
    expect(identityLoaded).not.toHaveBeenCalled();
    await systems[1].init(ctx);
    expect(events).toEqual(["life:init", "identity:init"]);
    expect(lifeInit).toHaveBeenCalledWith(ctx);
    expect(identityInit).toHaveBeenCalledWith(ctx);
    for (const system of systems) {
      system.update(frame, ctx);
      system.resize(1000, 800, ctx);
      system.dispose(ctx);
      system.update(frame, ctx);
    }
    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(frame, ctx);
    expect(resize).toHaveBeenCalledTimes(2);
    expect(resize).toHaveBeenCalledWith(1000, 800, ctx);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(dispose).toHaveBeenCalledWith(ctx);
  });

  it("does not swallow import failures that Engine's deferred-init handler must report", async () => {
    const error = new Error("life chunk unavailable");
    vi.doMock("../life/life-system", () => { throw error; });
    // Vitest wraps a throwing module factory in its own import error, retaining the original as cause.
    // The wrapper must reject with that import failure; it cannot preserve the factory error's identity.
    await expect(new LazyLifeSystem().init(ctx)).rejects.toMatchObject({ cause: error });
    expect(lifeInit).not.toHaveBeenCalled();
  });

  it("preserves implementation init errors", async () => {
    const error = new Error("identity atlas unavailable");
    identityInit.mockRejectedValueOnce(error);
    await expect(new LazyIdentitySystem().init(ctx)).rejects.toBe(error);
  });

  it("keeps slow init pending so Engine can defer readiness and dispose after it settles", async () => {
    let finish: (() => void) | undefined;
    lifeInit.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve; }));
    const life = new LazyLifeSystem();
    let settled = false;
    const pending = life.init(ctx).then(() => { settled = true; });
    await vi.dynamicImportSettled();
    expect(settled).toBe(false);
    expect(finish).toBeDefined();
    finish!();
    await pending;
    life.dispose(ctx);
    expect(dispose).toHaveBeenCalledWith(ctx);
  });
});
