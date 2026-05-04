// Ship visual configuration tables. Extracted from `layers/ships.ts` so that
// art-driven tuning lives apart from rendering logic. See
// agents/health-checkup-2026-05-04/04-maintainability.md (F5).

interface ShipTrimSpec {
  deck: readonly { height: number; width: number; x: number; y: number }[];
  keel: readonly [number, number, number, number];
  rail: readonly [number, number, number, number];
  stern: { height: number; width: number; x: number; y: number };
}

export const SHIP_COLORS = {
  "treasury-galleon": "#8a4f2b",
  "chartered-brigantine": "#735233",
  "dao-schooner": "#35606c",
  "crypto-caravel": "#58433a",
  "algo-junk": "#774734",
} as const;

// Per-ship sail-emblem override: paints a custom silhouette into the dyed
// sail cloth instead of the issuer logo. Applies to titan-tier ships that
// would otherwise fall through to the white-matte sticker overlay.
export const SHIP_SAIL_EMBLEM_OVERRIDES: Record<string, string> = {
  "usdt-tether": "/sail-emblems/usdt-kraken.png",
};

export const SHIP_SAIL_EMBLEM_PAINTED: ReadonlySet<string> = new Set([
  "crvusd-curve",
  "usdc-circle",
  "usde-ethena",
  "susde-ethena",
  "pyusd-paypal",
  "usd1-world-liberty-financial",
  "buidl-blackrock",
  "usyc-hashnote",
  ...Object.keys(SHIP_SAIL_EMBLEM_OVERRIDES),
]);

export const SHIP_SAIL_MARKS: Record<string, { height: number; width: number; x: number; y: number }> = {
  "algo-junk": { height: 15, width: 18, x: 8, y: -28 },
  "chartered-brigantine": { height: 15, width: 18, x: 9, y: -29 },
  "crypto-caravel": { height: 14, width: 17, x: 8, y: -26 },
  "dao-schooner": { height: 14, width: 17, x: 8, y: -27 },
  "treasury-galleon": { height: 16, width: 19, x: 10, y: -31 },
  "ship.usdc-titan": { height: 19, width: 19, x: -9, y: -35 },
  "ship.usde-titan": { height: 19, width: 19, x: -9, y: -35 },
  "ship.susde-titan": { height: 19, width: 19, x: -9, y: -35 },
  "ship.pyusd-titan": { height: 19, width: 19, x: -9, y: -35 },
  "ship.usd1-titan": { height: 19, width: 19, x: -9, y: -35 },
  "ship.buidl-titan": { height: 19, width: 19, x: -9, y: -35 },
  "ship.usyc-unique": { height: 19, width: 19, x: -9, y: -35 },
  "ship.usds-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.usdt-titan": { height: 50, width: 78, x: -4, y: -52 },
  // Maker consorts seeded from ship.usds-titan; tuning in Task 7.5.
  "ship.dai-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.susds-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.sdai-titan": { height: 19, width: 23, x: 3, y: -45 },
  "ship.stusds-titan": { height: 19, width: 23, x: 3, y: -45 },
  // Unique heritage hulls (136x100, anchor [68,92]). Per-sprite tuned to the
  // painted mainsail polygon centroid; see PNG inspection notes in
  // agents/completed/2026-05-01-unique-ship-category-plan.md Step 6.1.
  "ship.crvusd-unique": { height: 19, width: 22, x: 4, y: -50 },
  "ship.bold-unique": { height: 18, width: 21, x: 3, y: -52 },
  "ship.fxusd-unique": { height: 18, width: 20, x: 3, y: -50 },
  "ship.xaut-unique": { height: 17, width: 20, x: -7, y: -57 },
  "ship.paxg-unique": { height: 20, width: 22, x: 2, y: -47 },
};

export const SHIP_TRIM_MARKS: Record<string, ShipTrimSpec> = {
  "algo-junk": {
    rail: [-24, -13, 21, -8],
    keel: [-22, -3, 18, 0],
    stern: { x: -29, y: -17, width: 9, height: 4 },
    deck: [{ x: -8, y: -20, width: 8, height: 4 }, { x: 5, y: -18, width: 7, height: 3 }],
  },
  "chartered-brigantine": {
    rail: [-25, -14, 22, -9],
    keel: [-23, -3, 20, 0],
    stern: { x: -30, y: -18, width: 9, height: 4 },
    deck: [{ x: -10, y: -22, width: 8, height: 4 }, { x: 7, y: -20, width: 7, height: 3 }],
  },
  "crypto-caravel": {
    rail: [-23, -13, 21, -8],
    keel: [-21, -3, 18, 0],
    stern: { x: -27, y: -17, width: 8, height: 4 },
    deck: [{ x: -7, y: -20, width: 7, height: 4 }, { x: 7, y: -18, width: 6, height: 3 }],
  },
  "dao-schooner": {
    rail: [-22, -13, 20, -8],
    keel: [-20, -3, 17, 0],
    stern: { x: -26, y: -17, width: 8, height: 4 },
    deck: [{ x: -7, y: -20, width: 7, height: 4 }, { x: 6, y: -18, width: 6, height: 3 }],
  },
  "treasury-galleon": {
    rail: [-26, -15, 23, -9],
    keel: [-24, -4, 20, 0],
    stern: { x: -31, y: -19, width: 10, height: 5 },
    deck: [{ x: -10, y: -23, width: 8, height: 4 }, { x: 8, y: -21, width: 7, height: 3 }],
  },
  "ship.usdc-titan": {
    rail: [-43, -15, 39, -8],
    keel: [-39, -3, 35, 0],
    stern: { x: -48, y: -20, width: 11, height: 5 },
    deck: [{ x: -13, y: -23, width: 9, height: 4 }, { x: 11, y: -20, width: 8, height: 3 }],
  },
  "ship.usde-titan": {
    rail: [-43, -15, 39, -8],
    keel: [-39, -3, 35, 0],
    stern: { x: -48, y: -20, width: 11, height: 5 },
    deck: [{ x: -13, y: -23, width: 9, height: 4 }, { x: 11, y: -20, width: 8, height: 3 }],
  },
  "ship.susde-titan": {
    rail: [-43, -15, 39, -8],
    keel: [-39, -3, 35, 0],
    stern: { x: -48, y: -20, width: 11, height: 5 },
    deck: [{ x: -13, y: -23, width: 9, height: 4 }, { x: 11, y: -20, width: 8, height: 3 }],
  },
  "ship.pyusd-titan": {
    rail: [-43, -15, 39, -8],
    keel: [-39, -3, 35, 0],
    stern: { x: -48, y: -20, width: 11, height: 5 },
    deck: [{ x: -13, y: -23, width: 9, height: 4 }, { x: 11, y: -20, width: 8, height: 3 }],
  },
  "ship.usd1-titan": {
    rail: [-43, -15, 39, -8],
    keel: [-39, -3, 35, 0],
    stern: { x: -48, y: -20, width: 11, height: 5 },
    deck: [{ x: -13, y: -23, width: 9, height: 4 }, { x: 11, y: -20, width: 8, height: 3 }],
  },
  "ship.buidl-titan": {
    rail: [-43, -15, 39, -8],
    keel: [-39, -3, 35, 0],
    stern: { x: -48, y: -20, width: 11, height: 5 },
    deck: [{ x: -13, y: -23, width: 9, height: 4 }, { x: 11, y: -20, width: 8, height: 3 }],
  },
  "ship.usyc-unique": {
    rail: [-43, -15, 39, -8],
    keel: [-39, -3, 35, 0],
    stern: { x: -48, y: -20, width: 11, height: 5 },
    deck: [{ x: -13, y: -23, width: 9, height: 4 }, { x: 11, y: -20, width: 8, height: 3 }],
  },
  "ship.usds-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.usdt-titan": {
    rail: [-66, -23, 61, -12],
    keel: [-60, -5, 53, 0],
    stern: { x: -74, y: -31, width: 18, height: 8 },
    deck: [{ x: -23, y: -35, width: 15, height: 7 }, { x: 16, y: -30, width: 13, height: 6 }],
  },
  // Maker consorts seeded from ship.usds-titan; tuning in Task 7.5.
  "ship.dai-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.susds-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.sdai-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  "ship.stusds-titan": {
    rail: [-44, -18, 40, -8],
    keel: [-40, -5, 35, 0],
    stern: { x: -48, y: -26, width: 14, height: 6 },
    deck: [{ x: -14, y: -29, width: 11, height: 5 }, { x: 12, y: -25, width: 10, height: 4 }],
  },
  // Unique heritage hulls (136x100, anchor [68,92]). Trim offsets sit between
  // the standard galleon (104x80) and the titan hulls (144x104+).
  "ship.crvusd-unique": {
    rail: [-38, -16, 36, -7],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -22, width: 12, height: 5 },
    deck: [{ x: -12, y: -25, width: 10, height: 4 }, { x: 10, y: -22, width: 9, height: 4 }],
  },
  "ship.bold-unique": {
    rail: [-38, -16, 36, -7],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -23, width: 12, height: 5 },
    deck: [{ x: -12, y: -26, width: 10, height: 4 }, { x: 10, y: -23, width: 9, height: 4 }],
  },
  "ship.fxusd-unique": {
    rail: [-38, -15, 36, -7],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -21, width: 12, height: 5 },
    deck: [{ x: -12, y: -24, width: 10, height: 4 }, { x: 10, y: -21, width: 9, height: 4 }],
  },
  "ship.xaut-unique": {
    rail: [-38, -14, 36, -6],
    keel: [-36, -3, 32, 0],
    stern: { x: -42, y: -19, width: 12, height: 5 },
    deck: [{ x: -12, y: -22, width: 10, height: 4 }, { x: 10, y: -19, width: 9, height: 4 }],
  },
  "ship.paxg-unique": {
    rail: [-38, -17, 36, -8],
    keel: [-36, -4, 32, 0],
    stern: { x: -42, y: -23, width: 12, height: 5 },
    deck: [{ x: -12, y: -26, width: 10, height: 4 }, { x: 10, y: -23, width: 9, height: 4 }],
  },
};

export const TITAN_SPRITE_IDS: ReadonlySet<string> = new Set([
  "ship.usdc-titan",
  "ship.usds-titan",
  "ship.usdt-titan",
  "ship.dai-titan",
  "ship.susds-titan",
  "ship.sdai-titan",
  "ship.stusds-titan",
  "ship.usde-titan",
  "ship.susde-titan",
  "ship.pyusd-titan",
  "ship.usd1-titan",
  "ship.buidl-titan",
]);
