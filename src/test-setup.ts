// Shared Vitest setup for deterministic world-component tests.

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

export {};
