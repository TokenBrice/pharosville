// Ship visual configuration tables. Extracted from `layers/ships.ts` so that
// art-driven tuning lives apart from rendering logic. See
// agents/health-checkup-2026-05-04/04-maintainability.md (F5).

interface ShipTrimSpec {
  deck: readonly { height: number; width: number; x: number; y: number }[];
  keel: readonly [number, number, number, number];
  rail: readonly [number, number, number, number];
  stern: { height: number; width: number; x: number; y: number };
}

export interface ShipTrimColorStory {
  deckFill: string;
  deckStroke: string;
  keel: string;
  rail: string;
  railDash?: readonly [number, number];
  secondaryRail?: string;
  sternFill: string;
  sternStroke: string;
}

export interface ShipPennantSpec {
  bowLogoSize: number;
  bowLogoX: number;
  bowLogoY: number;
  lanternX: number;
  lanternY: number;
  mastTopX: number;
  mastTopY: number;
  pennantHeight: number;
  pennantWidth: number;
  poleHeight: number;
}

export const SHIP_COLORS = {
  "treasury-galleon": "#8a4f2b",
  "chartered-brigantine": "#735233",
  "dao-schooner": "#35606c",
  "crypto-caravel": "#58433a",
  "algo-junk": "#774734",
} as const;

export const SHIP_CONTINUOUS_MOTION = {
  standardBankGain: 0.075,
  standardBankMaxRadians: 0.024,
  standardBobPixels: 2,
  standardRollMaxRadians: 0.014,
  standardSailFlutterBase: 0.08,
  standardSailFlutterRange: 0.28,
  titanStaticAnimationFrameCountMax: 4,
  trailingWakeMinIntensity: 0.18,
  trailingWakeSegmentCount: 3,
  trailingWakeSpacingPixels: 13,
} as const;

// Per-ship sail-emblem override: paints a custom silhouette into the dyed
// sail cloth instead of the issuer logo. Applies to titan-tier ships that
// would otherwise fall through to the white-matte sticker overlay.
//
// W6.01 (decision D7 §6) — `usdt-tether` removed: the kraken silhouette is
// now baked directly into `ships/usdt-titan.png` (and the WebP twin), so the
// runtime overlay is no longer needed.
export const SHIP_SAIL_EMBLEM_OVERRIDES: Record<string, string> = {};

export const SHIP_SAIL_EMBLEM_PAINTED: ReadonlySet<string> = new Set([
  "crvusd-curve",
  "usdc-circle",
  "usde-ethena",
  "susde-ethena",
  "pyusd-paypal",
  "usd1-world-liberty-financial",
  "buidl-blackrock",
  "usyc-hashnote",
  // W6.01 — USDT kraken now baked into the sprite. Per decision D7 §6, the
  // canary outcome drives whether the five sibling titans (PYUSD / USD1 /
  // BUIDL / USDe / sUSDe) also stay in `SHIP_SAIL_EMBLEM_PAINTED` without
  // a `SHIP_SAIL_TINT_MASKS` polygon. They were already painted-set members
  // pre-W6 so no change needed for the canary commit.
  "usdt-tether",
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

export const SHIP_PENNANT_MARKS: Record<string, ShipPennantSpec> = {
  "algo-junk": {
    mastTopX: 1,
    mastTopY: -38,
    poleHeight: 13,
    pennantWidth: 14,
    pennantHeight: 7,
    lanternX: 0,
    lanternY: -29,
    bowLogoX: 22,
    bowLogoY: -8,
    bowLogoSize: 8,
  },
  "chartered-brigantine": {
    mastTopX: 1,
    mastTopY: -40,
    poleHeight: 14,
    pennantWidth: 15,
    pennantHeight: 7,
    lanternX: 0,
    lanternY: -31,
    bowLogoX: 23,
    bowLogoY: -9,
    bowLogoSize: 8,
  },
  "crypto-caravel": {
    mastTopX: 0,
    mastTopY: -37,
    poleHeight: 12,
    pennantWidth: 13,
    pennantHeight: 6,
    lanternX: 0,
    lanternY: -28,
    bowLogoX: 21,
    bowLogoY: -8,
    bowLogoSize: 7,
  },
  "dao-schooner": {
    mastTopX: 0,
    mastTopY: -38,
    poleHeight: 13,
    pennantWidth: 14,
    pennantHeight: 6,
    lanternX: 0,
    lanternY: -29,
    bowLogoX: 21,
    bowLogoY: -8,
    bowLogoSize: 7,
  },
  "treasury-galleon": {
    mastTopX: 1,
    mastTopY: -42,
    poleHeight: 15,
    pennantWidth: 16,
    pennantHeight: 7,
    lanternX: 0,
    lanternY: -32,
    bowLogoX: 24,
    bowLogoY: -10,
    bowLogoSize: 8,
  },
};

export const PROCEDURAL_SHIP_PENNANT_MARK: ShipPennantSpec = {
  mastTopX: 0,
  mastTopY: -25,
  poleHeight: 9,
  pennantWidth: 10,
  pennantHeight: 5,
  lanternX: 0,
  lanternY: -18,
  bowLogoX: 15,
  bowLogoY: -4,
  bowLogoSize: 5.5,
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
};

export const SHIP_TRIM_COLOR_STORIES: Record<string, ShipTrimColorStory> = {
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
