import { Texture } from "three";
import { describe, expect, it, vi } from "vitest";
import { createTextureUploadScheduler } from "./texture-upload-scheduler";

function testEnvironment() {
  let now = 0;
  let nextHandle = 0;
  const callbacks = new Map<number, IdleRequestCallback>();
  return {
    environment: {
      cancelIdleCallback: vi.fn((handle: number) => callbacks.delete(handle)),
      now: () => now,
      requestIdleCallback: vi.fn((callback: IdleRequestCallback) => {
        nextHandle += 1;
        callbacks.set(nextHandle, callback);
        return nextHandle;
      }),
    },
    advance(ms: number) {
      now += ms;
    },
    fireIdle({ didTimeout = false, timeRemaining = 5 } = {}) {
      const entry = callbacks.entries().next().value as [number, IdleRequestCallback] | undefined;
      if (!entry) throw new Error("No idle callback was scheduled.");
      callbacks.delete(entry[0]);
      entry[1]({
        didTimeout,
        timeRemaining: () => timeRemaining,
      });
    },
  };
}

function request(
  key: string,
  owner: object,
  texture = new Texture(),
  overrides: Partial<Parameters<ReturnType<typeof createTextureUploadScheduler>["schedule"]>[0]> = {},
) {
  return {
    isOwnerValid: () => true,
    key,
    owner,
    ownerName: key,
    texture,
    ...overrides,
  };
}

describe("texture upload scheduler", () => {
  it("bounds idle work and continues in another callback", () => {
    const renderer = { initTexture: vi.fn() };
    const harness = testEnvironment();
    const scheduler = createTextureUploadScheduler(renderer, harness.environment);
    const owner = {};
    scheduler.schedule(request("one", owner));
    scheduler.schedule(request("two", owner));
    scheduler.schedule(request("three", owner));

    harness.fireIdle();
    expect(renderer.initTexture).toHaveBeenCalledTimes(2);
    expect(scheduler.metrics()).toMatchObject({
      idleFlushCount: 1,
      pending: 1,
      uploaded: 2,
    });

    harness.fireIdle();
    expect(renderer.initTexture).toHaveBeenCalledTimes(3);
    expect(scheduler.metrics().pending).toBe(0);
  });

  it("drains a bounded fallback between frames when idle work cannot run", () => {
    const renderer = { initTexture: vi.fn() };
    const harness = testEnvironment();
    const scheduler = createTextureUploadScheduler(renderer, {
      now: harness.environment.now,
    });
    const owner = {};
    for (let index = 0; index < 7; index += 1) {
      scheduler.schedule(request(`texture-${index}`, owner));
    }

    scheduler.flushBetweenFrames();
    expect(renderer.initTexture).toHaveBeenCalledTimes(4);
    expect(scheduler.metrics()).toMatchObject({
      frameFlushCount: 1,
      pending: 3,
    });
  });

  it("replaces pending work with the latest generation before painting", () => {
    const renderer = { initTexture: vi.fn() };
    const harness = testEnvironment();
    const scheduler = createTextureUploadScheduler(renderer, harness.environment);
    const owner = {};
    const texture = new Texture();
    const firstPaint = vi.fn(() => true);
    const secondPaint = vi.fn(() => true);

    scheduler.schedule(request("sail-atlas", owner, texture, { prepare: firstPaint }));
    scheduler.schedule(request("sail-atlas", owner, texture, { prepare: secondPaint }));
    harness.fireIdle();

    expect(firstPaint).not.toHaveBeenCalled();
    expect(secondPaint).toHaveBeenCalledTimes(1);
    expect(renderer.initTexture).toHaveBeenCalledWith(texture);
  });

  it("validates ownership, cancels owners, and never drains after dispose", () => {
    const renderer = { initTexture: vi.fn() };
    const harness = testEnvironment();
    const scheduler = createTextureUploadScheduler(renderer, harness.environment);
    const staleOwner = {};
    const canceledOwner = {};
    const disposedOwner = {};
    scheduler.schedule(request("stale", staleOwner, new Texture(), {
      isOwnerValid: () => false,
    }));
    scheduler.schedule(request("canceled", canceledOwner));
    scheduler.cancelOwner(canceledOwner);
    harness.fireIdle();
    expect(renderer.initTexture).not.toHaveBeenCalled();
    expect(scheduler.metrics().canceled).toBe(2);

    scheduler.schedule(request("disposed", disposedOwner));
    scheduler.dispose();
    expect(harness.environment.cancelIdleCallback).toHaveBeenCalled();
    expect(() => scheduler.flushBetweenFrames()).not.toThrow();
    expect(renderer.initTexture).not.toHaveBeenCalled();
  });

  it("defers paint until execution and reports failures without throwing", () => {
    const renderer = { initTexture: vi.fn() };
    const harness = testEnvironment();
    const scheduler = createTextureUploadScheduler(renderer, harness.environment);
    const owner = {};
    const drained = vi.fn();
    const prepare = vi.fn(() => {
      throw new Error("paint failed");
    });
    scheduler.schedule(request("sail-atlas", owner, new Texture(), {
      onOwnerDrained: drained,
      prepare,
    }));
    expect(prepare).not.toHaveBeenCalled();

    harness.fireIdle({ didTimeout: true, timeRemaining: 0 });
    expect(renderer.initTexture).not.toHaveBeenCalled();
    expect(drained).toHaveBeenCalledTimes(1);
    expect(scheduler.metrics()).toMatchObject({
      failed: 1,
      pending: 0,
    });
  });
});
