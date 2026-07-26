import { writeFileSync } from "node:fs";
import { it, vi } from "vitest";
import { SEA_BODY_TARGET_SHARE, type SeaBodyName } from "./sea-bodies";

/**
 * Z3: solve each sea body's `reach` so it hits its target share.
 *
 * Not a test — a design tool that happens to live in the test runner, because
 * the runner is what can import the real TypeScript classifier. It is skipped
 * by default; run it deliberately with:
 *
 *   CALIBRATE_SEA_BODIES=1 npx vitest run src/systems/sea-bodies.calibrate.test.ts
 *
 * then paste the printed block into SEA_BODY_REACH.
 *
 * The iteration is a damped fixed point: measure each body's share, nudge its
 * reach by the log-ratio against target, repeat. The partition is monotone in
 * reach (raising one body's reach can only grow it at its neighbours' expense),
 * so this converges; the damping stops bodies competing for the same water from
 * oscillating.
 *
 * ## Why each round re-imports the module graph
 *
 * `terrainKindAt` memoises its answer per tile for the session — it has to, the
 * classifier is six noise octaves and fifteen SDFs per tile and the world build
 * scans the whole map several times. That cache is correct for the app, where
 * the terrain field really is fixed, and fatal here, where moving `reach` IS the
 * point: an earlier version of this file mutated `SEA_BODY_REACH` in place and
 * re-measured through the cache, so all eighty rounds scored the SAME frozen
 * grid. The BEFORE and AFTER snapshots came out identical to the decimal, the
 * log-ratio step never saw its own effect, and `reach` random-walked to values
 * like `danger: -2.71` while the report claimed the deviation it started with.
 * Every number it printed was fiction.
 *
 * So a round resets the module registry and re-imports, which gives a fresh
 * empty cache, and applies the accumulated reach vector to the fresh module
 * before the first tile is touched. Costs a full uncached map scan per round,
 * which is the price of measuring something real.
 */
const TERRAIN_TO_BODY: Record<string, SeaBodyName> = {
  "alert-water": "alert",
  "calm-water": "calm",
  "ledger-water": "ledger",
  "storm-water": "danger",
  "warning-water": "warning",
  "watch-water": "watch",
  "wreck-water": "wreck",
  water: "open",
};

const names = Object.keys(SEA_BODY_TARGET_SHARE) as SeaBodyName[];

type Reach = Record<SeaBodyName, number>;

interface Measurement {
  counts: Record<SeaBodyName, number>;
  total: number;
  worst: number;
}

/** Re-import the classifier with `reach` applied, and count each body's tiles. */
async function measure(reach: Reach | null): Promise<{ measurement: Measurement; reach: Reach }> {
  vi.resetModules();
  const bodies = await import("./sea-bodies");
  const layout = await import("./world-layout");
  if (reach) Object.assign(bodies.SEA_BODY_REACH, reach);
  const applied = { ...bodies.SEA_BODY_REACH };

  const counts = Object.fromEntries(names.map((name) => [name, 0])) as Record<SeaBodyName, number>;
  let total = 0;
  for (let y = 0; y < layout.PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < layout.PHAROSVILLE_MAP_WIDTH; x += 1) {
      const body = TERRAIN_TO_BODY[layout.terrainKindAt(x, y)];
      if (!body) continue;
      counts[body] += 1;
      total += 1;
    }
  }
  let worst = 0;
  for (const name of names) worst = Math.max(worst, Math.abs(counts[name] / total - SEA_BODY_TARGET_SHARE[name]) * 100);
  return { measurement: { counts, total, worst }, reach: applied };
}

it.skipIf(!process.env.CALIBRATE_SEA_BODIES)("solves sea-body reach against target shares", async () => {
  const lines: string[] = [];
  const say = (line: string) => { lines.push(line); };

  const report = (label: string, { counts, total, worst }: Measurement, reach: Reach) => {
    say(`\n${label}  (${total} classified water tiles)`);
    say("  body      share  target   delta   tiles    reach");
    for (const name of [...names].sort((a, b) => SEA_BODY_TARGET_SHARE[b] - SEA_BODY_TARGET_SHARE[a])) {
      const delta = (counts[name] / total - SEA_BODY_TARGET_SHARE[name]) * 100;
      say(
        `  ${name.padEnd(8)} ${(counts[name] / total * 100).toFixed(1).padStart(5)}%  ${(SEA_BODY_TARGET_SHARE[name] * 100).toFixed(0).padStart(4)}%  `
        + `${delta >= 0 ? "+" : ""}${delta.toFixed(1).padStart(5)}pt ${String(counts[name]).padStart(6)}  ${reach[name].toFixed(4)}`,
      );
    }
    say(`  worst deviation: ${worst.toFixed(2)} points`);
  };

  const first = await measure(null);
  report("BEFORE", first.measurement, first.reach);

  const DAMPING = 0.02;
  const ROUNDS = 60;
  let current = first.reach;
  let latest = first.measurement;
  // Keep the best vector seen rather than the last one: the step is a fixed
  // point, not a descent, so the final round is not necessarily the closest.
  let best = { reach: current, measurement: latest };

  for (let round = 0; round < ROUNDS; round += 1) {
    const next = { ...current };
    for (const name of names) {
      const share = Math.max(latest.counts[name] / latest.total, 1e-4);
      next[name] += Math.log(SEA_BODY_TARGET_SHARE[name] / share) * DAMPING;
    }
    // Re-centre. `reach` is purely RELATIVE — adding the same constant to every
    // body leaves the partition identical — so without this the iteration has a
    // free gauge and every value drifts upward together while the differences
    // that actually decide the map barely move.
    const mean = names.reduce((sum, name) => sum + next[name], 0) / names.length;
    for (const name of names) next[name] -= mean;

    const step = await measure(next);
    current = step.reach;
    latest = step.measurement;
    if (latest.worst < best.measurement.worst) best = { reach: current, measurement: latest };
  }

  report("AFTER", best.measurement, best.reach);
  say("\nPaste into SEA_BODY_REACH:\n");
  for (const name of names) say(`  ${name}: ${best.reach[name].toFixed(4)},`);

  const text = lines.join("\n");
  writeFileSync("outputs/sea-audit/calibration.txt", `${text}\n`);
  console.log(text);
  if (best.measurement.worst > 3) throw new Error(`calibration did not converge: worst ${best.measurement.worst.toFixed(2)} pt`);
});
