export const PATTERN_LEAF = 8;

export const PATTERN_LEAF_EVERGREEN = 14;

/** 08-T11: arable fields (hay, plough) whose colour follows the farm year (hbCrop). Decorative (calendar only). */
export const PATTERN_CROP = 15;

/**
 * Snow on a surface by its slope (mirrors hbWeather's upm): up = world normal y. Ground and roofs; leaves
 * (patterns 8 and 14) are dusted on gentler thresholds. Flat terraces (up = 1) and low-pitch tiled roofs
 * (18–24°, up ≥ 0.91) take full cover at any snow level; steep ground sheds it.
 */
export const SNOW_SLOPE = { lo: 0.42, hi: 0.74, leafLo: 0.34, leafHi: 0.62, give: 0.14 } as const;

/**
 * Share of the snow cover a leaf keeps (mirrors hbWeather's cover factor): leaves hold less than ground (0.55), and the
 * broad, flat evergreen crowns (pattern 14: umbrella pine, olive) hold less again, so a winter wood stays a dark
 * mass under snow-capped tops instead of whitening into the ground.
 */
export const SNOW_LEAF_KEEP = 0.55;

export const SNOW_CROWN_KEEP = 0.6;

/** Wall patterns that grow icicles under a snowy eave: plain (marble, trim), boards, render (stucco, limewash). */
export const ICICLE_WALL_PATTERNS = [0, 1, 10] as const;
