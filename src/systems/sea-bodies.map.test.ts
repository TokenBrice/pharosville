import { writeFileSync } from "node:fs";
import { it } from "vitest";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, terrainKindAt } from "./world-layout";

/** Renders the classified sea to outputs/ so the composition can be eyeballed. */
const GLYPH: Record<string, string> = {
  "calm-water": "C",
  "watch-water": "W",
  "alert-water": "A",
  "warning-water": "!",
  "storm-water": "D",
  "ledger-water": "L",
  "wreck-water": "x",
  water: "-",
  "deep-water": ".",
};

it.skipIf(!process.env.CALIBRATE_SEA_BODIES)("renders the sea partition", () => {
  const rows: string[] = [];
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    let row = "";
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      row += GLYPH[terrainKindAt(x, y)] ?? "#";
    }
    rows.push(`${String(y).padStart(3, " ")} ${row}`);
  }
  writeFileSync("outputs/sea-audit/partition.txt", `${rows.join("\n")}\n`);
});
