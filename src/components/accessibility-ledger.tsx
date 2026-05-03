import { memo } from "react";
import { CAUSE_HEX, CAUSE_META, type CauseOfDeath } from "@shared/lib/cause-of-death";
import type { HealthBand } from "@shared/types/chains";
import { formationLabel, squadRole, STABLECOIN_SQUADS, type StablecoinSquad } from "../systems/maker-squad";
import { SQUAD_DISTRESS_FLAG_HEX } from "../renderer/layers/maker-squad-chrome";
import type { AreaNode, DewsAreaBand, PharosVilleWorld, ShipNode } from "../systems/world-types";
import { shipCycleTempo } from "../systems/ship-cycle-tempo";

// Dock health-band swatches mirror the renderer's `dockHealthColor()` table in
// `src/renderer/layers/docks.ts`. Robust and healthy share the same green
// since the renderer treats them identically; both are listed for ledger
// parity with the textual `healthBand` value the dock row already prints.
// Update both sites if the palette drifts.
const DOCK_HEALTH_BAND_LEGEND: ReadonlyArray<{
  band: HealthBand;
  hex: string;
  label: string;
}> = [
  { band: "robust", hex: "#78b689", label: "Robust — diversified, healthy stablecoin mix" },
  { band: "healthy", hex: "#78b689", label: "Healthy — well-distributed supply" },
  { band: "mixed", hex: "#dfb95a", label: "Mixed — moderate concentration risk" },
  { band: "fragile", hex: "#d98b54", label: "Fragile — single-stablecoin dominance" },
  { band: "concentrated", hex: "#c9675c", label: "Concentrated — extreme single-issuer dependence" },
];

// Wreck cause-color swatches are sourced from the canonical `CAUSE_HEX` table
// in `shared/lib/cause-of-death.ts`, which the renderer's `graves.ts` also
// reads via `GRAVE_CAUSE_COLORS`. Single source of truth — adding a cause
// upstream will require an entry here.
const WRECK_CAUSE_LEGEND: ReadonlyArray<{
  cause: CauseOfDeath;
  hex: string;
  label: string;
}> = (Object.keys(CAUSE_HEX) as CauseOfDeath[]).map((cause) => ({
  cause,
  hex: CAUSE_HEX[cause],
  label: CAUSE_META[cause]?.label ?? cause,
}));

// Mirrors the per-band atmosphere descriptor in `src/systems/detail-model.ts`
// (Phase 2.6 DOM parity). When a banded area's renderer treatment escalates,
// the ledger row escalates with it. Lightning suffix gates on the same
// `band >= WARNING` threshold the renderer uses.
const ATMOSPHERE_DESCRIPTORS: Record<DewsAreaBand, string> = {
  CALM: "clear sky, calm sea",
  WATCH: "thin clouds, light chop",
  ALERT: "broken clouds, moderate chop",
  WARNING: "thickening clouds, rough sea, lightning active",
  DANGER: "heavy storm clouds, heavy chop, lightning active",
};

function atmosphereLineForArea(area: AreaNode): string {
  if (!area.band) return "Atmosphere: calm waters; no DEWS atmosphere modulation";
  return `Atmosphere: ${area.band}, ${ATMOSPHERE_DESCRIPTORS[area.band]}`;
}

const compactUsd = new Intl.NumberFormat("en-US", {
  currency: "USD",
  maximumFractionDigits: 1,
  notation: "compact",
  style: "currency",
});

const percent = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  style: "percent",
});

export interface AccessibilityLedgerProps {
  world: PharosVilleWorld;
  headingId?: string;
}

function AccessibilityLedgerContent({
  world,
  headingId = "pharosville-accessibility-ledger-title",
}: AccessibilityLedgerProps) {
  const staleSources = freshnessEntries(world)
    .filter((entry) => entry.stale)
    .map((entry) => entry.label);

  return (
    <section className="sr-only" aria-labelledby={headingId} data-testid="pharosville-accessibility-ledger">
      <h2 id={headingId}>PharosVille accessibility ledger</h2>
      <p>
        Generated at{" "}
        <time dateTime={new Date(world.generatedAt).toISOString()}>{new Date(world.generatedAt).toISOString()}</time>.
        {staleSources.length > 0
          ? ` Stale source groups: ${staleSources.join(", ")}.`
          : " All source groups are current."}
      </p>

      <dl>
        <div>
          <dt>Route mode</dt>
          <dd>{world.routeMode}</dd>
        </div>
        <div>
          <dt>Map size</dt>
          <dd>
            {world.map.width} by {world.map.height} tiles, {percent.format(world.map.waterRatio)} water.
          </dd>
        </div>
        <div>
          <dt>Lighthouse</dt>
          <dd>
            {world.lighthouse.label}: PSI {world.lighthouse.score ?? "unavailable"}, band{" "}
            {world.lighthouse.psiBand ?? "unavailable"}.
          </dd>
        </div>
        <div>
          <dt>Pigeonnier</dt>
          <dd>
            {world.pigeonnier.label}: PharosWatch Telegram dispatch for stablecoin depeg and safety-score alerts.
          </dd>
        </div>
      </dl>

      <h3>Named areas</h3>
      <ol>
        {world.areas.map((area) => (
          <li key={area.id}>
            {area.label}
            {area.riskPlacement ? `: ${area.band ? `DEWS ${area.band}, ${area.count ?? 0} stablecoins` : `risk water zone ${area.riskZone ?? "unavailable"}`}, placement ${area.riskPlacement}. ${area.summary ?? ""} Facts: ${area.facts?.map((fact) => `${fact.label} ${fact.value}`).join("; ") ?? "unavailable"}. Source fields ${area.sourceFields?.join(", ") || "unavailable"}.` : "."}
            {area.riskPlacement ? ` ${atmosphereLineForArea(area)}.` : ""}
          </li>
        ))}
      </ol>

      <h3>Docks</h3>
      <ol>
        {world.docks.map((dock) => (
          <li key={dock.id}>
            {dock.label}: {compactUsd.format(dock.totalUsd)} stablecoin supply, {dock.stablecoinCount} stablecoins,
            health {dock.healthBand ?? "unavailable"}, harboring{" "}
            {dock.harboredStablecoins.map((coin) => `${coin.symbol} ${compactUsd.format(coin.supplyUsd)}`).join(", ") || "no listed stablecoins"}.
          </li>
        ))}
      </ol>

      <h3>Ships</h3>
      <ol>
        {world.ships.map((ship) => {
          const tempo = shipCycleTempo(ship, world.ships);
          return (
            <li key={ship.id}>
              {ship.label} ({ship.symbol}): {compactUsd.format(ship.marketCapUsd)} market cap, placed at{" "}
              {ship.riskPlacement === "ledger-mooring" ? "Ledger Mooring idle" : `${ship.riskWaterLabel} idle`}; risk anchor{" "}
              {ship.riskPlacement}; route summary: {pluralize(ship.chainPresence.length, "positive chain deployment")},{" "}
              {pluralize(ship.dockVisits.length, "rendered dock stop")}, risk water {ship.riskWaterLabel}, risk zone{" "}
              {ship.riskZone}; livery {ship.visual.livery.label}, {ship.visual.livery.logoShape} logo shape,{" "}
              {ship.visual.livery.sailPanel} sail panel, {ship.visual.livery.stripePattern} brand stripe; placement evidence{" "}
              {ship.placementEvidence.reason}; evidence status {ship.placementEvidence.stale ? "caveat" : "fresh"}; source fields {ship.placementEvidence.sourceFields.join(", ") || "unavailable"}{ship.visual.uniqueRationale ? ` — heritage hull: ${ship.visual.uniqueRationale}` : ""}; cycle tempo {tempo.label}; 24h supply change {ship.change24hPct != null ? `${ship.change24hPct >= 0 ? "+" : ""}${ship.change24hPct.toFixed(1)}%` : "unavailable"}.
            </li>
          );
        })}
      </ol>

      {STABLECOIN_SQUADS.map((squad) => {
        const squadShips = world.ships.filter((ship) => ship.squadId === squad.id);
        if (squadShips.length === 0) return null;
        const flagship = squadShips.find((ship) => ship.squadRole === "flagship") ?? squadShips[0]!;
        const orderedShips = orderSquadShips(squadShips, squad);
        const memberLine = orderedShips
          .map((ship) => formationLabel(ship.id, squadRole(ship.id) ?? "consort", ship.symbol))
          .join(", ");
        const overrideShips = squadShips.filter((ship) => ship.placementEvidence.squadOverride !== undefined);
        return (
          <div key={squad.id}>
            <h3>{squad.label} squad</h3>
            <ol>
              <li>
                Sailing in formation: {memberLine}; shared placement {flagship.riskPlacement} at {flagship.riskWaterLabel}.
                {overrideShips.length > 0 && (
                  <ul>
                    {overrideShips.map((ship) => (
                      <li key={ship.id}>
                        <span
                          aria-hidden="true"
                          data-testid="squad-distress-swatch"
                          style={{
                            background: SQUAD_DISTRESS_FLAG_HEX,
                            display: "inline-block",
                            height: "0.7em",
                            marginRight: "0.3em",
                            width: "0.7em",
                          }}
                        />
                        <span>distress signal flag</span>{" "}
                        {ship.symbol} in distress — squad sheltering at flagship&apos;s position
                        {ship.placementEvidence.squadOverride?.ownReason
                          ? `; consort signal ${ship.placementEvidence.squadOverride.ownReason}`
                          : ""}
                        {ship.placementEvidence.squadOverride?.ownPlacement
                          ? ` (own placement ${ship.placementEvidence.squadOverride.ownPlacement})`
                          : ""}
                        .
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            </ol>
          </div>
        );
      })}

      <h3>Cemetery</h3>
      <ol>
        {world.graves.map((grave) => (
          <li key={grave.id}>
            {grave.entry.name} ({grave.entry.symbol}): {grave.entry.causeOfDeath}, {grave.entry.deathDate}.
          </li>
        ))}
      </ol>

      <section data-testid="dock-health-band-legend">
        <h3>Dock health-band color legend</h3>
        <ul>
          {DOCK_HEALTH_BAND_LEGEND.map((entry) => (
            <li key={entry.band}>
              <span
                aria-hidden="true"
                style={{
                  background: entry.hex,
                  display: "inline-block",
                  height: "0.7em",
                  marginRight: "0.3em",
                  width: "0.7em",
                }}
              />
              {entry.band}: {entry.label} ({entry.hex}).
            </li>
          ))}
        </ul>
      </section>

      <section data-testid="wreck-cause-color-legend">
        <h3>Wreck cause-color swatch legend</h3>
        <ul>
          {WRECK_CAUSE_LEGEND.map((entry) => (
            <li key={entry.cause}>
              <span
                aria-hidden="true"
                style={{
                  background: entry.hex,
                  display: "inline-block",
                  height: "0.7em",
                  marginRight: "0.3em",
                  width: "0.7em",
                }}
              />
              {entry.cause}: {entry.label} ({entry.hex}).
            </li>
          ))}
        </ul>
      </section>

      <h3>Visual cues</h3>
      <ol>
        {world.visualCues.map((cue) => (
          <li key={cue.id}>
            {cue.visual}: answers {cue.questionAnswered}; DOM equivalent {cue.domEquivalent}; failure state{" "}
            {cue.failureState}; reduced motion {cue.reducedMotionEquivalent}.
          </li>
        ))}
      </ol>
    </section>
  );
}

export const AccessibilityLedger = memo(AccessibilityLedgerContent);

function pluralize(count: number, singular: string, plural: string = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function orderSquadShips(ships: readonly ShipNode[], squad: StablecoinSquad): ShipNode[] {
  const byId = new Map(ships.map((ship) => [ship.id, ship]));
  return squad.displayOrder
    .map((id) => byId.get(id))
    .filter((ship): ship is ShipNode => ship !== undefined);
}

function freshnessEntries(world: PharosVilleWorld) {
  return [
    { label: "Stablecoins", stale: world.freshness.stablecoinsStale === true },
    { label: "Chains", stale: world.freshness.chainsStale === true },
    { label: "PSI", stale: world.freshness.stabilityStale === true },
    { label: "Peg summary", stale: world.freshness.pegSummaryStale === true },
    { label: "Stress signals", stale: world.freshness.stressStale === true },
    { label: "Report cards", stale: world.freshness.reportCardsStale === true },
  ];
}
