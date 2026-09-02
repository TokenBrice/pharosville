import { test } from "vitest";
import { seaRegionAtTile, SEA_REGION_ID } from "./garden-sea-regions";
import { PHAROSVILLE_MAP_HEIGHT, PHAROSVILLE_MAP_WIDTH, terrainKindAt } from "./world-layout";
import { isGardenShipWater, gardenShipWaterMarginTiles } from "./garden-water-exclusion";
import { gardenShipVisualScale } from "./garden-observatory-slice";

test("map audit", () => {
  const counts: Record<string, number> = {};
  const margin = gardenShipWaterMarginTiles(gardenShipVisualScale(1), "bezaisen");
  let water = 0;
  let eligible = 0;
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 1) {
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 1) {
      const k = terrainKindAt(x, y);
      counts[k] = (counts[k] ?? 0) + 1;
      if (seaRegionAtTile(x, y) !== SEA_REGION_ID.none) {
        water += 1;
        if (isGardenShipWater({ x, y }, margin)) eligible += 1;
      }
    }
  }
  const total = PHAROSVILLE_MAP_WIDTH * PHAROSVILLE_MAP_HEIGHT;
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `  ${k.padEnd(15)}${String(v).padStart(6)}  ${(v / total * 100).toFixed(1)}%`);
  process.stderr.write(
    `\nMAP AUDIT ${PHAROSVILLE_MAP_WIDTH}x${PHAROSVILLE_MAP_HEIGHT} (${total} tiles)\n`
    + rows.join("\n")
    + `\n  water=${water} eligible=${eligible} eligiblePerShip@187=${(eligible / 187).toFixed(1)}\n`,
  );

  const glyph: Record<number, string> = { 0: ".", 1: "c", 2: "w", 3: "a", 4: "W", 5: "D", 6: "L", 7: "o" };
  let map = "\nREGION MAP (4x downsample)\n";
  for (let y = 0; y < PHAROSVILLE_MAP_HEIGHT; y += 4) {
    let row = "";
    for (let x = 0; x < PHAROSVILLE_MAP_WIDTH; x += 4) row += glyph[seaRegionAtTile(x, y)] ?? "?";
    map += row + "\n";
  }
  process.stderr.write(map);
});
