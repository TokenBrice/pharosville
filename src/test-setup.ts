// Shared Vitest setup for deterministic world-component tests.

import { beforeEach } from "vitest";
import { resetHeldMoorings } from "./systems/pharosville-world/stages/dock-assignment";
import { resetHeldShipPlacements } from "./systems/pharosville-world/stages/ship-placement";

declare global {
  /**
   * Visual tests set this to force a deterministic wall-clock hour while the
   * normal motion clock remains owned by the route RAF loop.
   */
  var __pharosVilleTestWallClockHour: number | undefined;
}

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    clear: () => values.clear(),
    getItem: (key) => values.get(String(key)) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
    removeItem: (key) => {
      values.delete(String(key));
    },
    setItem: (key, value) => {
      values.set(String(key), String(value));
    },
  };
}

// Node 26 exposes an experimental global localStorage accessor which emits a
// warning every time Vitest touches it and can shadow jsdom's implementation.
// Install a deterministic Storage object explicitly instead of suppressing
// stderr; suites that exercise unavailable storage still stub it locally.
const testStorage = createMemoryStorage();
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: testStorage,
  writable: true,
});

// jsdom reports "not implemented" to its virtual console before returning
// null from canvas.getContext(). Tests that need a drawing context install
// their own focused mock; the shared default models jsdom's actual no-canvas
// capability without producing expected-noise errors.
if (typeof HTMLCanvasElement !== "undefined") {
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
    configurable: true,
    value: () => null,
    writable: true,
  });
}

// Seed the legend first-visit dismissal so component tests exercise the
// steady-state world instead of the one-time onboarding overlay. Tests that
// cover the auto-open path clear this key explicitly.
testStorage.setItem("pharosville.legend.dismissed", "1");

/**
 * Sticky placement and sticky berths are module-level memories of the PREVIOUS
 * world build, by design — they are what stop ships teleporting on refresh. In
 * a test file that builds more than one world they would also make the second
 * build depend on which `it()` ran first, so placement assertions would pass or
 * fail by execution order.
 *
 * Clearing them here rather than in each test file is deliberate: the next test
 * that builds a world gets a cold build by construction, with nothing to
 * remember to call.
 */
beforeEach(() => {
  resetHeldShipPlacements();
  resetHeldMoorings();
});

export {};
