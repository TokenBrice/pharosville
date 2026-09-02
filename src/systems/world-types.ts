import type { ChainHealthFactors, ChainSummary } from "@shared/types/chains";
import type { CemeteryEntry } from "@shared/lib/cemetery-merged";
import type { ReportCard, StablecoinData, StablecoinMeta } from "@shared/types";
import type { ConditionBand } from "@shared/lib/psi-colors";
import type { NetFlowDirection24h } from "@shared/lib/mint-burn-signals";
import type { DependencyType } from "@shared/types/dependency-types";
import type { ShipAgeProfile } from "./ship-age";
import type { SupplyTide } from "./supply-tide";
import type { RimCoveId } from "./garden-rim";

export type TileKind = "deep-water" | "water" | "shore" | "land" | "road";

export type TerrainKind =
  | TileKind
  | "rim"
  | "alert-water"
  | "calm-water"
  | "harbor-water"
  | "watch-water"
  | "warning-water"
  | "storm-water"
  | "ledger-water"
  | "wreck-water"
  | "beach"
  | "grass"
  | "rock"
  | "cliff"
  | "hill";

export interface PharosVilleTile {
  x: number;
  y: number;
  kind: TileKind;
  terrain?: TerrainKind;
}

export interface PharosVilleMap {
  width: number;
  height: number;
  tiles: PharosVilleTile[];
  waterRatio: number;
}

export type RouteMode = "world" | "desktop-only" | "loading" | "error";

export type ShipRiskPlacement =
  | "safe-harbor"
  | "breakwater-edge"
  | "harbor-mouth-watch"
  | "outer-rough-water"
  | "storm-shelf"
  | "ledger-mooring";

export interface PlacementEvidence {
  reason: string;
  sourceFields: string[];
  stale: boolean;
  squadOverride?: { ownPlacement: ShipRiskPlacement; ownReason: string };
}

export type ShipHull =
  | "treasury-galleon"
  | "chartered-brigantine"
  | "dao-schooner"
  | "crypto-caravel"
  | "algo-junk"
  // N5(a): coins pegged to something other than the dollar. Measured on the
  // 217-coin set, 58% of the batched fleet sat on `treasury-galleon` while the
  // junk silhouette — authored and paid for — was never drawn, because no coin
  // in the set is `backing: "algorithmic"`. A non-USD peg (EUR/GBP/gold/RUB) is
  // its own trading tradition, and it is a 53-ship cohort, so it earns the junk
  // hull outright rather than borrowing the algorithmic one.
  | "foreign-peg-junk"
  // W2 (decision D3): four silhouettes carried 188 ships — galleon 64, clipper
  // 57, junk 53, schooner 14 — so a ship read as one of four stamps. These
  // three split the biggest pools along traits that are genuinely different
  // trades, so the extra silhouettes are earned rather than decorative.
  //
  // A yield-bearing coin PAYS OUT, which is a different voyage from holding
  // reserves; it earns a longer, richer hull in both the treasury and the
  // collateral family. A commodity peg is not a currency peg at all — bullion
  // is dense, so it rides in a short, deep, beamy hoy.
  | "yield-indiaman"
  | "yield-barque"
  | "commodity-peg-hoy";

export type ShipSizeTier =
  | "titan"
  | "unique"
  | "flagship"
  | "major"
  | "regional"
  | "local"
  | "skiff"
  | "micro"
  | "unknown";

export type ShipLogoShape = "circle" | "diamond" | "hex" | "pill" | "ring" | "slash" | "triangle";
export type ShipSailPanel = "center" | "field" | "hoist" | "quartered";
export type ShipStripePattern = "chevron" | "cross" | "diagonal" | "double" | "grain" | "ladder" | "single" | "wave";

export interface ShipLivery {
  accent: string;
  label: string;
  logoMatte: string;
  logoShape: ShipLogoShape;
  primary: string;
  sailColor: string;
  sailPanel: ShipSailPanel;
  secondary: string;
  source: "brand-color" | "peg-fallback" | "stablecoin-logo";
  stripePattern: ShipStripePattern;
}

/**
 * N5(a): per-ship hull proportions, as multipliers about 1. The batched fleet
 * renders four shared silhouettes as instanced meshes, so a ship cannot have
 * its own geometry — but it can have its own *proportions*, applied as a
 * per-instance deformation in the vertex shader at zero extra draw calls.
 *
 * Bounded to ±`SHIP_HULL_FORM_SPAN` so a hull never self-intersects and never
 * outgrows the blue-noise berth spacing, which is laid out for the ship's
 * `scale`, not for its proportions.
 */
export interface ShipHullForm {
  /** Athwartships width multiplier. Stability: a stiff hull is a beamy one. */
  beam: number;
  /** Topsides height multiplier, applied above the waterline only. */
  height: number;
  /** Fore-and-aft length multiplier. */
  length: number;
  /**
   * Tier 3 #13: how she rides. Signed OFFSET in ship-local units (not a
   * multiplier like its three neighbours) — positive lifts the hull, negative
   * settles it — derived from the SIGN of the coin's live peg deviation.
   *
   * It rides inside `ShipHullForm` rather than beside it because this struct is
   * the per-instance channel the batched fleet already carries all the way to
   * the vertex shader; a fourth component costs nothing where a fifth attribute
   * would cost a buffer.
   *
   * `cue.ship.distance` already spends the deviation's MAGNITUDE on which water
   * a ship anchors in. The sign was collapsed there and is the whole of what
   * this carries: above par is a demand premium, below par is redemption
   * pressure, and until now the world drew them identically.
   */
  waterline: number;
  /** W7.3: even hull patina, or -1 when age evidence is unavailable. */
  agePatina?: number;
  /** W5.8: decorative value-only variation; never changes issuer hue. */
  hullValue?: number;
  /** W5.8: deterministic repeated-fitting rotation in radians. */
  propRotation?: number;
  /** W5.8: deterministic signed rope sag. */
  ropeSag?: number;
  /** W7.6 fitting state packed into the existing hull surface instance slot. */
  fittingCode?: number;
}

export const SHIP_HULL_FORM_SPAN = 0.32;

export interface ShipVisual {
  hull: ShipHull;
  uniqueRationale?: string;
  classLabel: string;
  livery: ShipLivery;
  sailColor: string;
  overlay: "none" | "yield" | "nav" | "watch";
  sizeTier: ShipSizeTier;
  sizeLabel: string;
  scale: number;
  hullForm: ShipHullForm;
}

export interface ShipChainPresence {
  chainId: string;
  currentUsd: number;
  share: number;
  hasRenderedDock: boolean;
}

export interface ShipDockVisit {
  chainId: string;
  dockId: string;
  weight: number;
  mooringTile: { x: number; y: number };
}

export const SHIP_WATER_ZONES = ["calm", "watch", "alert", "warning", "danger", "ledger"] as const;
export type ShipWaterZone = typeof SHIP_WATER_ZONES[number];

export interface LighthousePsiComponents {
  severity: number;
  breadth: number;
  stressBreadth?: number;
  trend: number;
}

export interface LighthouseContributor {
  id: string;
  symbol: string;
  bps: number;
  mcapUsd: number;
  ageDays?: number;
  factor?: number;
}

/**
 * How many pennants the observatory hoist carries before it stops counting.
 *
 * A pennant per depeg with no cap turns a bad afternoon into a ladder of cloth
 * nobody can count, which reads as alarm rather than as a reading. Five is what
 * a real signal hoist flies and what stays legible at overview zoom; past that
 * the mast says "more than five" and the exact figure is the DOM's job
 * (`detailForLighthouse`'s Signal mast row).
 *
 * Lives here rather than in the stage that derives it so the renderer can size
 * its hoist without importing a world-build stage.
 */
export const SIGNAL_MAST_MAX_PENNANTS = 5;

/**
 * The observatory's storm-signal hoist, derived from `pegSummary.summary`.
 *
 * One reading of fleet-wide peg condition, carried at one place. Everything
 * here is a plain number or flag: the world model stays serializable and the
 * renderer decides nothing the DOM cannot also say.
 */
export interface SignalMastNode {
  /** `pegSummary.summary.activeDepegCount` — coins currently off peg. */
  activeDepegCount: number;
  /** Pennants actually hoisted: `activeDepegCount` capped at the mast's hoist. */
  pennantCount: number;
  /** True when `activeDepegCount` exceeded the hoist and the mast is showing
      fewer pennants than there are coins off peg. */
  capped: boolean;
  /** True when the worst current deviation crosses the storm gate. */
  stormCone: boolean;
  /** `pegSummary.summary.worstCurrent` — worst live deviation, signed bps. */
  worstBps: number | null;
  worstSymbol: string | null;
  /** `pegSummary.summary.medianDeviationBps`. */
  medianDeviationBps: number | null;
  /** `pegSummary.summary.coinsAtPeg` out of `totalTracked`. */
  coinsAtPeg: number | null;
  totalTracked: number | null;
  /** `pegSummary.summary.depegEventsToday`. */
  eventsToday: number | null;
  /** No peg summary in the payload. The mast stands bare rather than
      reporting a calm fleet it has no evidence for. */
  unavailable: boolean;
}

/**
 * The PSI condition bands, worst last.
 *
 * `shared/lib/psi-colors.ts` is the single source of truth for the band SET and
 * for every per-band lookup the app already makes, but it has never carried an
 * ORDER — which is exactly what "the worst band reached in the window" needs.
 * The list is authored here rather than derived so the ordering is readable,
 * and `world-types.test.ts` guards it against the shared record twice over: it
 * must cover the band set exactly, and it must agree with the ordering
 * `PSI_SWEEP_DURATION` already implies (a worse band turns the beam faster).
 * A band added upstream without a place here fails that test rather than
 * silently ranking as unknown.
 */
export const PSI_BAND_SEVERITY: readonly ConditionBand[] = [
  "BEDROCK",
  "STEADY",
  "TREMOR",
  "FRACTURE",
  "CRISIS",
  "MELTDOWN",
];

/**
 * Severity rank of a PSI band, 0 (BEDROCK) to 5 (MELTDOWN), or null when the
 * string is not a band this build knows. Null is NOT zero: an unrecognized
 * band must not be filed as the calmest one.
 */
export function psiBandSeverity(band: string | null | undefined): number | null {
  if (!band) return null;
  const index = PSI_BAND_SEVERITY.indexOf(band as ConditionBand);
  return index >= 0 ? index : null;
}

/** Trailing window the lighthouse tide-stain reads, in days. */
export const HIGH_WATER_MARK_WINDOW_DAYS = 30;

/**
 * The worst PSI band the fleet reached in the trailing window, stained on the
 * lighthouse's terrace as a high-water mark.
 *
 * `stability.history` has been arriving in the browser since the world was
 * built and nothing has ever read it — the world knew only `current`, so a
 * harbour that spent three weeks in FRACTURE and recovered yesterday looked
 * exactly like one that has never been anything but calm. This is the
 * difference between the two, and it is deliberately a RECORD rather than a
 * condition: the mark does not move, does not pulse, and never colours toward
 * the danger end of the palette. The sea rose this far; here is the line.
 */
export interface LighthouseHighWaterMark {
  /** Worst band in the window, or null when the history yielded nothing. */
  band: string | null;
  /** `PSI_BAND_SEVERITY` rank of `band`; also the number of stain courses. */
  severity: number | null;
  /** Score of the point that set the mark. */
  score: number | null;
  /** Epoch ms of that point, or null. */
  at: number | null;
  /** History points actually inside the window. */
  sampleCount: number;
  /** Days between the oldest and newest point read — the window really
      covered, which can be far short of `HIGH_WATER_MARK_WINDOW_DAYS`. */
  spanDays: number;
  /** No usable history. The rocks stand unstained and the DOM says why; an
      unstained rock must never be read as "the sea never rose". */
  unavailable: boolean;
}

/** Trailing PSI record carried by the island planting, never a live alarm. */
export interface GardenMonthRecord {
  averagePsi: number | null;
  growth: number;
  sampleCount: number;
  spanDays: number;
  unavailable: boolean;
}

/**
 * Where the beacon's sweep settles: the ship contributing most to the index.
 *
 * `stability.current.contributors` already has its own panel rows, so this
 * adds no new claim — it points the world's one moving light at the row the
 * reader would have looked up anyway. The wording is fixed everywhere as
 * "largest PSI contributor": the index is a weighted sum, and being the
 * largest term in it is arithmetic, not fault.
 */
export interface LighthouseBeamDwell {
  /** `ShipNode.id` of the largest contributor — the renderer resolves this to
      a berth to take a bearing from, and finds nothing if the coin is not in
      the rendered fleet. */
  shipId: string;
  symbol: string;
  /** That coin's signed peg deviation, bps, as the index read it. */
  bps: number;
}

export interface LighthouseNode {
  id: "lighthouse";
  kind: "lighthouse";
  label: string;
  tile: { x: number; y: number };
  psiBand: string | null;
  score: number | null;
  components?: LighthousePsiComponents;
  avg24h?: number;
  avg24hBand?: string;
  contributors?: LighthouseContributor[];
  color: string;
  unavailable: boolean;
  detailId: string;
  /** Epoch ms of the most recent depeg event across the tracked fleet
      (max `pegSummary.coins[].lastEventAt`), or null when none on record. */
  lastFleetDepegAt?: number | null;
  /** Fleet-wide peg condition, hoisted on the observatory signal mast. */
  signalMast?: SignalMastNode;
  /** Worst PSI band of the trailing window, stained on the terrace rocks. */
  highWaterMark?: LighthouseHighWaterMark;
  /** Thirty-day PSI record expressed as slow garden growth and weathering. */
  gardenMonthRecord?: GardenMonthRecord;
  /** Ship the beam's sweep settles toward, or absent when there is no
      contributor to point at. */
  beamDwell?: LighthouseBeamDwell;
}

export interface PigeonnierNode {
  id: "pigeonnier";
  kind: "pigeonnier";
  label: string;
  tile: { x: number; y: number };
  detailId: string;
  notableMovers?: Array<{
    change24hPctLabel: string;
    change24hUsdLabel: string;
    detailId: string;
    id: string;
    riskWaterLabel: string;
    symbol: string;
  }>;
  roost?: {
    capped: boolean;
    /** Today's count minus yesterday's, or null when either source is absent. */
    comparison: number | null;
    eventsToday: number | null;
    eventsYesterday: number | null;
    /** Rendered birds; exact event counts remain in the detail and ledger. */
    visualCount: number;
  };
}

export interface DockNode {
  id: string;
  kind: "dock";
  label: string;
  chainId: string;
  tile: { x: number; y: number };
  station: {
    coveId: RimCoveId;
    type:
      | "boathouse-precinct"
      | "annex-pavilion"
      | "gate-landing"
      | "tea-house-quay"
      | "fishing-pier"
      | "stepped-inlet"
      | "reed-boathouse"
      | "pigeonnier-islet";
    /** Radians from the station's landward edge toward open water. */
    shoreBearing: number;
  };
  totalUsd: number;
  size: number;
  healthBand: ChainSummary["healthBand"];
  stablecoinCount: number;
  concentration: number | null;
  /** Same-origin chain logo path from `ChainSummary.logoPath` (e.g.
      an ethereum.png under the chains directory), flown as the harbour's flag (N4). Optional: a
      chain without one falls back to its painted chain mark. */
  logoPath?: string | null;
  harborRank?: number;
  harborCount?: number;
  shareOfGlobal?: number | null;
  /** Chain `healthFactors.backingDiversity` score (higher = more diversified
      stablecoin backing), or null when unavailable. Attached by the world
      scaffold stage; drives the dock congestion cue and the "Backing
      diversity" detail row. */
  backingDiversity?: number | null;
  /** Full chain-health decomposition used by the quay masonry condition. */
  healthFactors?: ChainHealthFactors | null;
  /**
   * Tier 3 #13: this chain's own stablecoin supply change over 24h and 7d
   * (percent units, like `ShipNode.change24hPct`), from `chains.chains[]`.
   *
   * A harbour FILLING or DRAINING, which is not the same statement as
   * `cargoTide`: that is issuance measured at the quay — coins minted and
   * burned — while this is the chain's total held supply, which also moves when
   * supply bridges in or out without a single coin being created. A chain can
   * be net-burning and still filling, and the two rows sit next to each other
   * so that reading is available rather than hidden.
   */
  change24hPct?: number | null;
  change7dPct?: number | null;
  /** 24h issuance flow allocated to this harbour by `buildCargoTideStage`;
      drives the cargo-tide crates and the "Net flow 24h" detail row. Absent
      only on docks built outside the world pipeline. */
  cargoTide?: DockCargoTide;
  harboredStablecoins: DockStablecoin[];
  detailId: string;
}

/**
 * One harbour's share of the fleet's 24h mint/burn flow.
 *
 * `tracked` is the load-bearing field: `false` means issuance is not MEASURED
 * for this chain, which is a different statement from a measured zero, and the
 * two must never render alike.
 */
export interface DockCargoTide {
  burnVolumeUsd: number;
  /** How many coins contributed an allocation to this harbour. */
  coinCount: number;
  direction: NetFlowDirection24h;
  mintVolumeUsd: number;
  /** Positive = net minting (supply created), negative = net burning. */
  netFlowUsd: number;
  /** Signed -100..100 share of gross flow, or null when nothing moved. */
  pressureScore: number | null;
  /**
   * `unattributed`: the chain IS in the payload's scope, but no coin's flow
   * could be allocated here while issuance the fleet cannot place exists — so
   * the quiet is unverified rather than observed.
   */
  reason: "tracked" | "chain-not-in-scope" | "scope-unreported" | "no-flow-data" | "unattributed";
  tracked: boolean;
}

/** Fleet-wide issuance reading, straight from the mint/burn gauge. */
export interface FleetIssuance {
  activeCoins: number;
  band: string | null;
  burnVolumeUsd: number;
  direction: NetFlowDirection24h;
  flightIntensity: number;
  /** Capital rotating out of weaker issuers into stronger ones. */
  flightToQuality: boolean;
  mintVolumeUsd: number;
  netFlowUsd: number;
  scopeChainIds: string[];
  scopeLabel: string | null;
  score: number | null;
  trackedCoins: number;
}

export interface DockStablecoin {
  id: string;
  symbol: string;
  share: number;
  supplyUsd: number;
}

export type WorldSelectableEntity =
  | PharosVilleWorld["lighthouse"]
  | PharosVilleWorld["pigeonnier"]
  | PharosVilleWorld["docks"][number]
  | PharosVilleWorld["ships"][number]
  | PharosVilleWorld["areas"][number]
  | PharosVilleWorld["graves"][number];

export interface ShipNode {
  id: string;
  kind: "ship";
  label: string;
  symbol: string;
  asset: StablecoinData;
  meta: StablecoinMeta;
  reportCard: ReportCard | null;
  logoSrc: string | null;
  tile: { x: number; y: number };
  riskTile: { x: number; y: number };
  chainPresence: ShipChainPresence[];
  dockVisits: ShipDockVisit[];
  dominantChainId: string | null;
  homeDockChainId: string | null;
  dockChainId: string | null;
  marketCapUsd: number;
  riskPlacement: ShipRiskPlacement;
  riskZone: ShipWaterZone;
  riskWaterLabel: string;
  /** Fresh DEWS score normalized to calm-edge 0 … rough-edge 1 anchoring. */
  riskDepth?: number | null;
  placementEvidence: PlacementEvidence;
  stressBreakdown?: { signals: string[]; contagionActive: boolean } | null;
  visual: ShipVisual;
  /** W7.3 service/tracking evidence and its renderer-neutral age profile. */
  age?: ShipAgeProfile;
  change24hUsd: number | null;
  change24hPct: number | null;
  /** W7.7: signed 24h mint/redeem flow intensity; null when unmeasured. */
  flowIntensity?: number | null;
  /** W7.1: this coin's measured 24h issuance work, absent when unmeasured. */
  issuance?: ShipIssuance;
  /** W7.6: physical seaworthiness fittings derived from report-card raw inputs. */
  fittings?: ShipFittings;
  /** Live signed peg deviation from `pegSummary.coins[].currentDeviationBps`;
      null/absent when the coin has no peg row. Surfaced as the "Peg
      deviation" detail fact and matching ledger clause. */
  pegDeviationBps?: number | null;
  /** Peg currency (e.g. "USD") for the deviation reading. */
  pegCurrency?: string | null;
  /** Supply momentum over longer windows (percent units, like change24hPct). */
  change7dPct?: number | null;
  change30dPct?: number | null;
  /** Historical depeg record from `pegSummary.coins[]`; null/absent when the
      coin has no events on record. Surfaced as hull weathering plus a
      "Depeg history" detail/ledger line. */
  depegHistory?: ShipDepegHistory | null;
  /** Second bearing on the same price, from `pegSummary.coins[].dexPriceCheck`.
      Absent when the pipeline ran no check for this coin. */
  dexCrossCheck?: ShipDexCrossCheck;
  detailId: string;
  squadId?: "sky" | "maker" | "ethena";
  squadRole?: "flagship" | "consort";
  /** W7.2 strongest report-card dependency, when its parent is in the fleet. */
  dependencyFormation?: {
    parentId: string;
    type: DependencyType;
    weight: number;
  } | null;
}

export interface ShipIssuance {
  direction: "minting" | "redeeming" | "flat";
  flowIntensity: number | null;
  netFlow24hUsd: number;
  largestEvent24h: {
    amountUsd: number;
    direction: "mint" | "burn";
    timestamp: number;
  } | null;
}

export interface ShipFittings {
  blacklistStatus: ReportCard["rawInputs"]["canBeBlacklisted"];
  collateralCargo: "sealed" | "mixed";
  collateralQuality: ReportCard["rawInputs"]["collateralQuality"];
  redemptionCapacityRatio: number | null;
}

/**
 * Two instruments reading the same price, from `pegSummary.coins[].dexPriceCheck`.
 *
 * The reference price the whole world is built on comes from the consensus
 * feed; the pipeline separately reads the coin's on-chain DEX pools and asks
 * whether the two agree. When they do not, one of them is wrong, and which one
 * is wrong is not knowable from here — which is precisely why it is worth
 * showing. A market that has moved before the feed has caught up is the shape
 * a depeg has in its first minutes.
 *
 * The upstream field is nullable AND optional, and the absent case is load
 * bearing: no check ran is not the same claim as the check passed. This node
 * exists only when a check actually ran, so `undefined` can never be mistaken
 * for agreement anywhere downstream.
 */
export interface ShipDexCrossCheck {
  /** DEX-observed price, quote currency of the coin's peg. */
  dexPrice: number;
  /** That price's signed deviation from par, bps. */
  dexDeviationBps: number;
  /** Consensus-feed price the rest of the world is built from, or null when
      the asset carries none. */
  oraclePrice: number | null;
  /** The consensus feed's own signed deviation, bps, or null. */
  oracleDeviationBps: number | null;
  /** False when the two bearings cross. Only false moors a buoy. */
  agrees: boolean;
  /** How many pools the DEX reading was taken across, and their total TVL —
      the evidence behind the second bearing. A disagreement drawn from one
      thin pool is a different thing from one drawn from six deep ones. */
  sourcePools: number;
  sourceTvlUsd: number;
}

export interface ShipDepegHistory {
  eventCount: number;
  worstDeviationBps: number | null;
  /** Epoch ms (normalized) of the most recent depeg event, or null. */
  lastEventAt: number | null;
}

export interface GraveNode {
  id: string;
  kind: "grave";
  label: string;
  entry: CemeteryEntry;
  tile: { x: number; y: number };
  visual: {
    marker: "broken-keel" | "sinking-stern" | "grounded" | "shattered" | "skeletal";
    scale: number;
  };
  detailId: string;
}

export type DewsAreaBand = "DANGER" | "WARNING" | "ALERT" | "WATCH" | "CALM";

export interface AreaNode {
  id: string;
  kind: "area";
  label: string;
  tile: { x: number; y: number };
  band?: DewsAreaBand;
  count?: number | null;
  detailId: string;
  facts?: Array<{ label: string; value: string }>;
  links?: Array<{ label: string; href: string }>;
  riskPlacement?: ShipRiskPlacement;
  riskZone?: ShipWaterZone;
  sourceFields?: string[];
  summary?: string;
}

export interface DetailModelLink {
  label: string;
  href: string;
  target?: "_blank";
  inWorldDetailId?: string;
}

export interface DetailModelMember {
  id: string;
  label: string;
  href: string;
  value?: string;
  inWorldDetailId?: string;
}

export interface DetailModelStatus {
  /** Zone swatch color (same ZONE_THEMES source as the legend). */
  swatchColor: string;
  label: string;
  reading: string;
  /** Headline figure for the status line (live signed peg deviation). */
  figure?: string;
}

export interface DetailModel {
  id: string;
  title: string;
  kind: string;
  summary: string;
  /** Risk-band status line rendered at the top of the panel for ships. */
  status?: DetailModelStatus;
  paragraphs?: string[];
  facts: Array<{ label: string; value: string }>;
  links: DetailModelLink[];
  membersHeading?: string;
  members?: DetailModelMember[];
}

export type VisualCueTarget =
  | { kind: "area" }
  | { kind: "dock" }
  | { kind: "grave" }
  | { kind: "lighthouse" }
  | { kind: "pigeonnier" }
  | { kind: "ship" };

export type VisualCueChannel =
  | "color"
  | "glow"
  | "motion"
  | "opacity"
  | "position"
  | "shape"
  | "size";

export interface VisualCue {
  id: string;
  target: VisualCueTarget;
  primaryChannels: VisualCueChannel[];
  visual: string;
  sourceField: string;
  questionAnswered: string;
  failureState: string;
  domEquivalent: string;
  reducedMotionEquivalent: string;
}

export interface PharosVilleFreshness {
  stablecoinsStale?: boolean;
  chainsStale?: boolean;
  stabilityStale?: boolean;
  pegSummaryStale?: boolean;
  stressStale?: boolean;
  reportCardsStale?: boolean;
  mintBurnStale?: boolean;
}

export type SelectableWorldEntity =
  | LighthouseNode
  | DockNode
  | ShipNode
  | AreaNode
  | GraveNode
  | PigeonnierNode;

export interface PharosVilleWorld {
  generatedAt: number | null;
  routeMode: RouteMode;
  freshness: PharosVilleFreshness;
  map: PharosVilleMap;
  lighthouse: LighthouseNode;
  pigeonnier: PigeonnierNode;
  docks: DockNode[];
  areas: AreaNode[];
  ships: ShipNode[];
  graves: GraveNode[];
  /** Fleet-wide 24h issuance, or null when the mint/burn feed has not landed. */
  fleetIssuance: FleetIssuance | null;
  /** Weekly supply flow, drawn as the tide line on shore rock and pilings. */
  supplyTide: SupplyTide;
  detailIndex: Record<string, DetailModel>;
  // Keyed by `detailId` (the same key used by `detailIndex`) so detail-panel
  // selection can resolve the source entity in O(1) without a linear scan.
  entityById: Record<string, SelectableWorldEntity>;
  visualCues: VisualCue[];
}
