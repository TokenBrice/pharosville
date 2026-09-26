/**
 * The *ma* of the Hour-Print: the approach water between the viewer's
 * threshold and the Pharos (plan W1.6, K21; review garden-master-2).
 *
 * Projected for rest seat C (`rest-seat.ts`). The spine runs along the sight
 * line from the rest eye to the tower foot — the mean of the landscape eye
 * (114.2, 179.7) and the tall 720×900 eye (120.9, 175.7), which differ by
 * under 3 tiles where the line leaves the south rim — from the rim waterline
 * (95, 133) to the island's near waterline (71, 84) below the tower foot
 * (67.05, 77.12). Ending at the foot itself let the round cap reach 12 tiles
 * round behind the island, water the viewer does not look across. Water
 * only: the capsule's land tiles are irrelevant to every consumer.
 *
 * The half-width is the smallest whole-tile width whose impassable core
 * (`halfWidth − GARDEN_INLET_CORE_INSET_TILES`) contains the seat's sight inlet
 * — the ground wedge from the frame-bottom ground hits at the bottom centre and
 * the tower-foot column ± 0.12 up to the foot, clipped to plate water and to
 * the near side of the tower — at all four gate profiles (1600×1000, 1200×640,
 * 900×720, 720×900; at 11 the 1200×640 wedge is only 97 % inside). The whole
 * capsule covers 31–57 % of the frame's plate water at rest, and seen from
 * the seat it is wide at the shore (about half the frame's width at
 * 1600×1000) and narrows into the island in perspective. Dock moorings
 * (`dock-assignment.ts`) and berths stay out of it; transit routes around it.
 *
 * Seat B's corridor (spine (72,112)→(29,45), half-width 21) took 3 134 of
 * Calm's 4 837 water tiles and left the band room for 46 hulls at
 * `MIN_HULL_GAP` against a live fleet of 72; this one takes 168 and leaves
 * room for 164 (live payload, greedy packing at the band's mean hull gap).
 *
 * No imports: fleet placement, sea-edge siting and the motion A* all read it
 * without closing an import cycle through `garden-water-exclusion.ts`.
 */
export const GARDEN_EMPTY_INLET = {
  polyline: [
    { x: 95, y: 133 },
    { x: 71, y: 84 },
  ],
  halfWidth: 12,
} as const;

/**
 * Transit routing inside the corridor: the outer band costs
 * `GARDEN_INLET_ROUTE_COST` × per step, the core (`halfWidth` minus this
 * inset) is impassable to every hull without a crossing token.
 */
export const GARDEN_INLET_CORE_INSET_TILES = 6;
export const GARDEN_INLET_ROUTE_COST = 8;

/**
 * A leg that starts or ends inside the core must still leave it. For those
 * legs the core is passable at this per-step cost, so the route exits by the
 * shortest way out instead of failing.
 */
export const GARDEN_INLET_CORE_EXIT_COST = 64;

/** Tile distance from the inlet spine. */
export function gardenInletDistance(x: number, y: number): number {
  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 1; index < GARDEN_EMPTY_INLET.polyline.length; index += 1) {
    const start = GARDEN_EMPTY_INLET.polyline[index - 1]!;
    const end = GARDEN_EMPTY_INLET.polyline[index]!;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const t = Math.max(0, Math.min(1,
      ((x - start.x) * dx + (y - start.y) * dy) / (dx * dx + dy * dy),
    ));
    nearest = Math.min(nearest, Math.hypot(x - start.x - t * dx, y - start.y - t * dy));
  }
  return nearest;
}

/** True inside the impassable core of the corridor. */
export function isGardenInletCoreTile(x: number, y: number): boolean {
  return gardenInletDistance(x, y) <= GARDEN_EMPTY_INLET.halfWidth - GARDEN_INLET_CORE_INSET_TILES;
}

const routeCostFieldByDimensions = new Map<string, Float32Array>();

/**
 * Per-tile step multiplier for the motion A*, row-major for a
 * `width × height` grid: 1 outside the corridor, `GARDEN_INLET_ROUTE_COST`
 * in its band, `+Infinity` in its core. Built once per grid size.
 */
export function gardenInletRouteCostField(width: number, height: number): Float32Array {
  const key = `${width}x${height}`;
  const cached = routeCostFieldByDimensions.get(key);
  if (cached) return cached;
  const field = new Float32Array(width * height).fill(1);
  const core = GARDEN_EMPTY_INLET.halfWidth - GARDEN_INLET_CORE_INSET_TILES;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = gardenInletDistance(x, y);
      if (distance <= core) field[y * width + x] = Number.POSITIVE_INFINITY;
      else if (distance <= GARDEN_EMPTY_INLET.halfWidth) field[y * width + x] = GARDEN_INLET_ROUTE_COST;
    }
  }
  routeCostFieldByDimensions.set(key, field);
  return field;
}
