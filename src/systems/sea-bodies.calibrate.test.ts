import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { SEA_BODY_REACH, SEA_BODY_TARGET_SHARE, type SeaBodyName } from "./sea-bodies";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, terrainKindAt } from "./world-layout";

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

function measure(): { counts: Record<SeaBodyName, number>; total: number } {
  const counts = Object.fromEntries(
    Object.keys(SEA_BODY_TARGET_SHARE).map((name) => [name, 0]),
  ) as Record<SeaBodyName, number>;
  let total = 0;
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const body = TERRAIN_TO_BODY[terrainKindAt(x, y)];
      if (!body) continue;
      counts[body] += 1;
      total += 1;
    }
  }
  return { counts, total };
}

const names = Object.keys(SEA_BODY_TARGET_SHARE) as SeaBodyName[];

it.skipIf(!process.env.CALIBRATE_SEA_BODIES)("solves sea-body reach against target shares", () => {
  const lines: string[] = [];
  const say = (line: string) => { lines.push(line); };

  const snapshot = (label: string) => {
    const { counts, total } = measure();
    say(`\n${label}  (${total} classified water tiles)`);
    say("  body      share  target   delta   tiles    reach");
    let worst = 0;
    for (const name of [...names].sort((a, b) => SEA_BODY_TARGET_SHARE[b] - SEA_BODY_TARGET_SHARE[a])) {
      const share = counts[name] / total;
      const delta = (share - SEA_BODY_TARGET_SHARE[name]) * 100;
      worst = Math.max(worst, Math.abs(delta));
      say(
        `  ${name.padEnd(8)} ${(share * 100).toFixed(1).padStart(5)}%  ${(SEA_BODY_TARGET_SHARE[name] * 100).toFixed(0).padStart(4)}%  `
        + `${delta >= 0 ? "+" : ""}${delta.toFixed(1).padStart(5)}pt ${String(counts[name]).padStart(6)}  ${SEA_BODY_REACH[name].toFixed(4)}`,
      );
    }
    say(`  worst deviation: ${worst.toFixed(2)} points`);
    return { counts, total, worst };
  };

  snapshot("BEFORE");

  const DAMPING = 0.012;
  for (let round = 0; round < 80; round += 1) {
    const { counts, total } = measure();
    for (const name of names) {
      const share = Math.max(counts[name] / total, 1e-4);
      SEA_BODY_REACH[name] += Math.log(SEA_BODY_TARGET_SHARE[name] / share) * DAMPING;
    }
    // Re-centre. `reach` is purely RELATIVE — adding the same constant to every
    // body leaves the partition identical — so without this the iteration has a
    // free gauge and every value drifts upward together while the differences
    // that actually decide the map barely move.
    const mean = names.reduce((sum, name) => sum + SEA_BODY_REACH[name], 0) / names.length;
    for (const name of names) SEA_BODY_REACH[name] -= mean;
  }

  const after = snapshot("AFTER");
  say("\nPaste into SEA_BODY_REACH:\n");
  for (const name of names) say(`  ${name}: ${SEA_BODY_REACH[name].toFixed(4)},`);

  const report = lines.join("\n");
  writeFileSync("outputs/sea-audit/calibration.txt", `${report}\n`);
  console.log(report);
  if (after.worst > 3) throw new Error(`calibration did not converge: worst ${after.worst.toFixed(2)} pt`);
});
