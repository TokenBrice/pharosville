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

// Seed the legend first-visit dismissal so component tests exercise the
// steady-state world instead of the one-time onboarding overlay. Tests that
// cover the auto-open path clear this key explicitly.
try {
  globalThis.localStorage?.setItem("pharosville.legend.dismissed", "1");
} catch {
  // Non-DOM test environments have no localStorage; nothing to seed.
}

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
