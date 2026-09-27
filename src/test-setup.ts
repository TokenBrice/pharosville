// Shared Vitest setup for deterministic world-component tests.

import { beforeEach } from "vitest";
import { resetHeldMoorings } from "./systems/pharosville-world/stages/dock-assignment";
import { resetHeldShipPlacements } from "./systems/pharosville-world/stages/ship-placement";
import { gardenSkyDayFromParts, pinGardenSkyDay } from "./systems/sky-almanac";

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

// Seed the first-visit flags so component tests exercise the steady-state
// world instead of the one-time onboarding (legend, and the three teachings
// on the now-line). Tests that cover those paths clear the keys explicitly.
testStorage.setItem("pharosville.legend.dismissed", "1");
testStorage.setItem("pharosville.orientation.seen", "1");

// The sky clock (W2.14) reads the date, the zone's daylight saving and the
// hemisphere. Suites share one pinned sky day — 26 September 2026 at 35° N in
// a CEST-like zone (solar noon 13:00, sunset ≈ 18:54) — so no result depends
// on when or where the tests run. Suites about another date pin their own.
pinGardenSkyDay(gardenSkyDayFromParts({
  year: 2026,
  month: 9,
  day: 26,
  utcOffsetHours: 2,
  dstHours: 1,
  latitude: { latitudeRad: (35 * Math.PI) / 180, southern: false },
}));

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

// jsdom has no top layer or keyboard default actions; browser assertions own
// modality/Tab behavior. This models only the native dialog lifecycle.
if (typeof HTMLDialogElement !== "undefined") {
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
}
