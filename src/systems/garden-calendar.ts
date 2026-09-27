import { gardenSkyLatitude, type GardenSkyLatitude } from "./sky-almanac";

/**
 * The garden's one calendar (K24/K25, contract G-A). The sun's ecliptic
 * longitude, not the UTC month, decides where the year stands:
 *
 * - `gardenMicroseason` names the 72 kō (七十二候) the day falls in. They are
 *   event gates and Almanac words (K18), never a colour switch.
 * - `seasonalPhenology` gives each deciduous specimen its own continuous
 *   state (turning, leaf mass, blossom, spring flush) from a stable seed, so
 *   maples turn one by one instead of all at once on 1 September.
 * - `gardenSnowCover` marks the rare winter days that lay snow on pad tops.
 *
 * Evergreens are not on this clock: the pines carry the 30-day market record
 * (garden-month-record) and nothing else. In the southern hemisphere (O11:
 * from the visitor's time zone) the garden year runs half a turn apart, so a
 * visitor in Brisbane sees maples turn in April.
 */

const DAY_MS = 86_400_000;
const DEG = Math.PI / 180;
/** Unix epoch as a Julian day. */
const UNIX_EPOCH_JD = 2440587.5;
const J2000_JD = 2451545;

/** FNV-1a string hash → [0, 1). Deterministic, allocation-free per call. */
function seedUnit(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 15;
  hash = Math.imul(hash, 0x2c1b3c6d);
  hash ^= hash >>> 12;
  return (hash >>> 0) / 4_294_967_296;
}

function wrapDeg(value: number): number {
  return ((value % 360) + 360) % 360;
}

function smooth01(value: number): number {
  const t = value <= 0 ? 0 : value >= 1 ? 1 : value;
  return t * t * (3 - 2 * t);
}

/**
 * Apparent solar ecliptic longitude, degrees [0, 360): 0 at the March
 * equinox, 180 at the September one. Low-precision almanac series (±0.01°),
 * far finer than the garden's five-degree microseasons.
 */
export function solarEclipticLongitudeDeg(date: Date): number {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return 0;
  const n = ms / DAY_MS + UNIX_EPOCH_JD - J2000_JD;
  const meanLongitude = 280.46 + 0.9856474 * n;
  const meanAnomaly = (357.528 + 0.9856003 * n) * DEG;
  return wrapDeg(meanLongitude + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly));
}

/**
 * The garden's seasonal longitude: the solar longitude in the northern
 * hemisphere, half a turn on in the southern, so every phenology threshold
 * below reads as "northern-equivalent" season.
 */
export function gardenSeasonalLongitudeDeg(
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): number {
  const longitude = solarEclipticLongitudeDeg(date);
  return latitude.southern ? wrapDeg(longitude + 180) : longitude;
}

/** The 24 sekki (節気), three kō each, from Risshun at 315°. */
const SEKKI = [
  "Beginning of spring", "Rain water", "Insects awaken", "Spring equinox",
  "Pure and clear", "Grain rains", "Beginning of summer", "Lesser ripening",
  "Grain in ear", "Summer solstice", "Lesser heat", "Greater heat",
  "Beginning of autumn", "End of heat", "White dew", "Autumn equinox",
  "Cold dew", "Frost falls", "Beginning of winter", "Lesser snow",
  "Greater snow", "Winter solstice", "Lesser cold", "Greater cold",
] as const;

/** The 72 kō in English (the 1874 Ryakuhon-reki names), from Risshun. */
export const GARDEN_MICROSEASONS = [
  "East wind melts the ice", "Bush warblers sing in the mountains", "Fish rise from the ice",
  "Rain moistens the soil", "Mist starts to linger", "Grass sprouts, trees bud",
  "Hibernating insects surface", "First peach blossoms", "Caterpillars become butterflies",
  "Sparrows start to nest", "First cherry blossoms", "Distant thunder",
  "Swallows return", "Wild geese fly north", "First rainbows",
  "First reeds sprout", "Frost ends, rice seedlings grow", "Peonies bloom",
  "Frogs start singing", "Worms surface", "Bamboo shoots sprout",
  "Silkworms feast on mulberry leaves", "Safflowers bloom", "Wheat ripens",
  "Praying mantises hatch", "Fireflies rise from the grass", "Plums turn yellow",
  "Self-heal withers", "Irises bloom", "Crow-dipper sprouts",
  "Warm winds blow", "First lotus blossoms", "Hawks learn to fly",
  "Paulownia sets its seed", "Earth is damp, air is humid", "Great rains sometimes fall",
  "Cool winds blow", "Evening cicadas sing", "Thick fog descends",
  "Cotton bolls open", "The heat starts to die down", "Rice ripens",
  "Dew glistens white on grass", "Wagtails sing", "Swallows leave",
  "Thunder ceases", "Insects hole up underground", "Farmers drain the fields",
  "Wild geese return", "Chrysanthemums bloom", "Crickets chirp by the door",
  "First frost", "Light rains sometimes fall", "Maple leaves and ivy turn",
  "Camellias bloom", "Land starts to freeze", "Daffodils bloom",
  "Rainbows hide", "North wind blows the leaves from the trees", "Tachibana leaves start to yellow",
  "Cold sets in, winter begins", "Bears start hibernating", "Salmon gather and swim upstream",
  "Self-heal sprouts", "Deer shed their antlers", "Wheat sprouts under the snow",
  "Parsley flourishes", "Springs thaw", "Pheasants start to call",
  "Butterburs bud", "Ice thickens on the streams", "Hens start laying eggs",
] as const;

export interface GardenMicroseason {
  /** 0 = Risshun's first kō (seasonal longitude 315°) … 71. */
  index: number;
  /** English kō name, for the Almanac and the ledger only. */
  name: string;
  /** English name of the sekki (two-week term) holding it. */
  sekki: string;
}

export function gardenMicroseason(
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): GardenMicroseason {
  const index = Math.floor(wrapDeg(gardenSeasonalLongitudeDeg(date, latitude) - 315) / 5) % 72;
  return { index, name: GARDEN_MICROSEASONS[index]!, sekki: SEKKI[Math.floor(index / 3)]! };
}

export type GardenDeciduousKind = "momiji" | "cherry";

/** One deciduous specimen's state on a day; every field is continuous. */
export interface GardenPhenology {
  /** Autumn colour: 0 summer green → 1 fully turned (amber → persimmon → deep). */
  turn: number;
  /** Leaf mass: 1 full crown … 0 bare branches. */
  leaf: number;
  /** Blossom 0…1 (cherry only; maples stay 0). */
  blossom: number;
  /** Fresh spring flush: 1 the day leaves open, fading over five weeks. */
  flush: number;
}

interface PhenologyTimes {
  /** Leaf-out starts (seasonal longitude, degrees). */
  leafOut: number;
  /** Colour starts turning. */
  turn: number;
  /** Colour ramp length, degrees. */
  turnSpan: number;
  /** Leaf fall starts / ends, degrees after `turn`. */
  fallFrom: number;
  fallTo: number;
  /** Blossom peak and half-width, or null. */
  blossom: { peak: number; halfWidth: number } | null;
}

/**
 * Per-specimen dates, northern-equivalent seasonal longitude. One degree is
 * about one day. Maples turn from late October to late November (garden-3:
 * DOY 298 + 28·u) and drop two to four weeks later; cherries flower for about
 * nine days either side of early April, leaf out as the petals go, and turn
 * early.
 */
function phenologyTimes(seed: string, kind: GardenDeciduousKind): PhenologyTimes {
  const unit = seedUnit(`${kind}.${seed}`);
  const spread = seedUnit(`${kind}.${seed}.spread`);
  if (kind === "cherry") {
    const peak = 12 + (unit - 0.5) * 6;
    return {
      leafOut: peak + 3,
      turn: 196 + spread * 14,
      turnSpan: 9,
      fallFrom: 10,
      fallTo: 22,
      blossom: { peak, halfWidth: 9 },
    };
  }
  return {
    leafOut: 24 + spread * 8,
    turn: 211 + unit * 27,
    turnSpan: 10,
    fallFrom: 14,
    fallTo: 26,
    blossom: null,
  };
}

/**
 * Contract G-A: the continuous state of one deciduous specimen on `date`.
 * `specimenSeed` must be stable per tree (its authored id), so the same tree
 * turns on the same day every year and its neighbours on other days.
 */
export function seasonalPhenology(
  specimenSeed: string,
  date: Date,
  kind: GardenDeciduousKind = "momiji",
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): GardenPhenology {
  const longitude = gardenSeasonalLongitudeDeg(date, latitude);
  const times = phenologyTimes(specimenSeed, kind);
  // Degrees since this tree's leaf-out, so the whole leafy year is one
  // monotonic run and the bare winter is its tail.
  const since = wrapDeg(longitude - times.leafOut);
  const turnAt = wrapDeg(times.turn - times.leafOut);
  const fallFrom = turnAt + times.fallFrom;
  const fallTo = turnAt + times.fallTo;
  const leaf = since < 10
    ? smooth01(since / 10)
    : since < fallFrom
      ? 1
      : since < fallTo
        ? 1 - smooth01((since - fallFrom) / (fallTo - fallFrom))
        : 0;
  const turn = since < turnAt ? 0 : since >= fallTo ? 1 : smooth01((since - turnAt) / times.turnSpan);
  const flush = since < fallFrom ? smooth01(since / 3) * (1 - smooth01(since / 35)) : 0;
  let blossom = 0;
  if (times.blossom) {
    const offset = wrapDeg(longitude - times.blossom.peak + 180) - 180;
    const t = offset / times.blossom.halfWidth;
    blossom = Math.abs(t) >= 1 ? 0 : (1 - t * t) * (1 - t * t);
  }
  return { turn, leaf, blossom, flush };
}

/** Degrees either side of a blossom peak petals keep drifting on the water. */
const PETAL_DRIFT_AFTER_PEAK_DEG = 12;

/**
 * 0…1: how strongly petals from the lee cherry lie on the water — from the
 * flower's opening through twelve days after its peak.
 */
export function gardenPetalDrift(
  specimenSeed: string,
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): number {
  const times = phenologyTimes(specimenSeed, "cherry");
  const blossom = times.blossom!;
  const offset = wrapDeg(gardenSeasonalLongitudeDeg(date, latitude) - blossom.peak + 180) - 180;
  if (offset < -blossom.halfWidth * 0.5 || offset > PETAL_DRIFT_AFTER_PEAK_DEG) return 0;
  return offset <= 0 ? smooth01((offset + blossom.halfWidth * 0.5) / (blossom.halfWidth * 0.5)) : 1 - smooth01(offset / PETAL_DRIFT_AFTER_PEAK_DEG);
}

/** Snow may lie only in the deep-winter window (garden-3: DOY 350 → 59). */
const SNOW_WINDOW_DEG = [268, 340] as const;
/** Share of deep-winter weeks that bring one snowfall. */
const SNOW_WEEK_SHARE = 0.2;

/**
 * Snow on pad tops, 0…1, for the UTC day of `date`: a rare deterministic
 * event (one deep-winter week in five brings a fall that lies two to four
 * days, the last day half melted). Purely calendar-derived, never data.
 */
export function gardenSnowCover(
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): number {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return 0;
  const day = Math.floor(ms / DAY_MS);
  const week = Math.floor((day + 3) / 7);
  const weekStartDay = week * 7 - 3;
  if (seedUnit(`snow.${week}`) >= SNOW_WEEK_SHARE) return 0;
  const fall = weekStartDay + Math.floor(seedUnit(`snow.${week}.day`) * 3);
  const lies = 2 + Math.floor(seedUnit(`snow.${week}.lies`) * 3);
  const into = day - fall;
  if (into < 0 || into >= lies) return 0;
  // The fall itself must land in the window; it may melt just past it.
  const fallLongitude = gardenSeasonalLongitudeDeg(new Date(fall * DAY_MS + DAY_MS / 2), latitude);
  if (fallLongitude < SNOW_WINDOW_DEG[0] || fallLongitude > SNOW_WINDOW_DEG[1]) return 0;
  return into === lies - 1 ? 0.5 : 1;
}

// --- Event gates (K24, W5.6) ------------------------------------------------------

export type GardenSeasonalVisitorId = "fireflies" | "leaf-fall";

/**
 * Which visitor the kō admit (0-based kō index, inclusive ranges). Names stay
 * in the Almanac section and the ledger (K18); the visitor itself is a scored
 * ritual (garden-score.ts), so it obeys the §5.0 budget like any other gift.
 * - fireflies: the early-summer kō, "Praying mantises hatch" … "Irises bloom".
 * - leaf fall: "Light rains sometimes fall" … "North wind blows the leaves".
 */
const SEASONAL_VISITOR_GATES: readonly { id: GardenSeasonalVisitorId; from: number; to: number }[] = [
  { id: "fireflies", from: 24, to: 28 },
  { id: "leaf-fall", from: 52, to: 58 },
];

export interface GardenSeasonalVisitor {
  id: GardenSeasonalVisitorId;
  microseason: GardenMicroseason;
}

/** The one seasonal visitor the day's kō admit, or null (most of the year). */
export function gardenSeasonalVisitor(
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): GardenSeasonalVisitor | null {
  const microseason = gardenMicroseason(date, latitude);
  const gate = SEASONAL_VISITOR_GATES.find((entry) => microseason.index >= entry.from && microseason.index <= entry.to);
  return gate ? { id: gate.id, microseason } : null;
}

// --- One tree lets go (X5, garden-7) -------------------------------------------

/** The one specimen whose last leaves go in a single scored afternoon: the island maple by the stair. */
export const GARDEN_LETS_GO_TREE = { kind: "momiji", seed: "island-stair" } as const;
/** Its crown thins with the calendar until less than this is left; that day it lets go of the rest. */
const LETS_GO_CROWN = 0.5;

export interface GardenTreeLetsGo {
  /** The crown the tree shows today before any event: 1 full … 0 bare. */
  crown: number;
  /** Today is the day it lets go (≤ 1 a year). */
  today: boolean;
}

/**
 * garden-7: the island maple's leaf fall is its phenology until its crown
 * first drops below half; that UTC day the tree lets go of everything left in
 * one scored afternoon, and from the next day it stands bare until spring.
 * Pure per UTC day, so the score, the renderer and the ledger agree.
 */
export function gardenTreeLetsGo(
  date: Date,
  latitude: GardenSkyLatitude = gardenSkyLatitude(),
): GardenTreeLetsGo {
  const ms = date.getTime();
  if (!Number.isFinite(ms)) return { crown: 1, today: false };
  const noonOf = (dayOffset: number) => new Date((Math.floor(ms / DAY_MS) + dayOffset) * DAY_MS + DAY_MS / 2);
  const crownOn = (dayOffset: number) => seasonalPhenology(GARDEN_LETS_GO_TREE.seed, noonOf(dayOffset), GARDEN_LETS_GO_TREE.kind, latitude).leaf;
  const crown = crownOn(0);
  if (crown >= LETS_GO_CROWN || crown <= 0) return { crown, today: false };
  // Past the threshold: today only if yesterday was still above it (the
  // thinning crown is monotonic through the fall), otherwise already bare.
  return crownOn(-1) >= LETS_GO_CROWN ? { crown, today: true } : { crown: 0, today: false };
}
