"use client";

import { useModalDialog } from "../hooks/use-modal-dialog";
import X from "lucide-react/dist/esm/icons/x";
import { ControlsCheatsheet } from "./controls-cheatsheet";
import { zoneThemeForTerrain } from "../systems/palette";
import { RISK_WATER_AREAS, WRECK_SHOAL_AREA } from "../systems/risk-water-areas";
import {
  recentFleetTrendEntryLabel,
  recentFleetTrendSummaryText,
  type RecentFleetTrendSummary,
} from "../systems/sea-state";
import { LEGEND_MARK_ROWS } from "../systems/visual-cue-registry";
import type { ShipRiskPlacement } from "../systems/world-types";

export interface LegendPanelProps {
  onClose: () => void;
  onChangelog?: () => void;
  /** Starts the observe sequence from its first beat. Omitted when the world
      runtime cannot run it, which drops the closing call to action. */
  onObserve?: () => void;
  /** Selects a mover's ship in the world (closing the legend is the caller's
      choice via onClose composition). */
  onSelectDetail?: (detailId: string) => void;
  recentFleetTrend?: RecentFleetTrendSummary;
}

// Zone rows derive label, swatch color, and reading from the canonical tables
// (RISK_WATER_AREAS / ZONE_THEMES) so the legend can never drift from the
// rendered map or the ship detail-panel status line.
const LEGEND_ZONE_PLACEMENTS: ReadonlyArray<ShipRiskPlacement> = [
  "safe-harbor",
  "breakwater-edge",
  "harbor-mouth-watch",
  "outer-rough-water",
  "storm-shelf",
  "ledger-mooring",
];

const LEGEND_SHIP_CLASSES: ReadonlyArray<{ name: string; reading: string }> = [
  {
    name: "Bezaisen carrier",
    reading: "Centralized issuer or dependent backing",
  },
  {
    name: "Kobaya runner",
    reading: "Unclassified or missing-governance fallback",
  },
  {
    name: "Twin-hull council boat",
    reading: "Decentralized governance",
  },
  {
    name: "Takasebune barge",
    reading: "Yield-bearing reserves",
  },
  {
    name: "Battened junk",
    reading: "Algorithmic or foreign-currency peg",
  },
  {
    name: "Bullion scow",
    reading: "Gold or silver peg",
  },
];

// Movers carry detailId precisely so narrative text can take the viewer to
// the ship; without a selection callback they fall back to plain labels.
function renderMoverEntries(
  entries: RecentFleetTrendSummary["growers"],
  onSelectDetail: ((detailId: string) => void) | undefined,
  onClose: () => void,
) {
  if (!onSelectDetail) {
    return entries.map(recentFleetTrendEntryLabel).join("; ");
  }
  return entries.map((entry, index) => (
    <span key={entry.detailId}>
      {index > 0 ? "; " : ""}
      <button
        type="button"
        className="pharosville-legend-panel__mover"
        onClick={() => {
          onClose();
          onSelectDetail(entry.detailId);
        }}
      >
        {recentFleetTrendEntryLabel(entry)}
      </button>
    </span>
  ));
}

export function LegendPanel({ onClose, onChangelog, onObserve, onSelectDetail, recentFleetTrend }: LegendPanelProps) {
  const panelRef = useModalDialog();
  const hasRecentMoves = recentFleetTrend
    ? recentFleetTrend.growers.length > 0 || recentFleetTrend.shrinkers.length > 0
    : false;

  return (
    <dialog
      ref={panelRef}
      id="pharosville-legend-panel"
      className="pharosville-changelog-panel pharosville-legend-panel"
      aria-labelledby="pharosville-legend-title"
      aria-modal="true"
      data-testid="pharosville-legend-panel"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      tabIndex={-1}
    >
      <header className="pharosville-changelog-panel__header">
        <div>
          <p className="pharosville-changelog-panel__eyebrow">A field guide to the harbour</p>
          <h2 id="pharosville-legend-title">Legend</h2>
        </div>
        <button
          className="pharosville-changelog-panel__close"
          type="button"
          aria-label="Close legend"
          onClick={onClose}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <div className="pharosville-legend-panel__body">
        <p className="pharosville-legend-panel__intro">
          A live chart of the stablecoin seas, read in its sails, its water and
          its light. An interpretive view, not financial advice.
        </p>

        {/* The first interactive choice after Close. A new reader can move
            directly from the guide into the harbor without scrolling
            through the reference material first. */}
        {onObserve && (
          <p className="pharosville-legend-panel__primary-action">
            <button
              type="button"
              className="pharosville-legend-panel__observe"
              data-testid="pharosville-legend-observe"
              onClick={() => {
                onClose();
                onObserve();
              }}
            >
              Watch the harbor
            </button>
            <span>The lighthouse, the leading risk watch, and the week&apos;s largest moves.</span>
          </p>
        )}

        <section className="pharosville-legend-panel__stanza" aria-labelledby="pharosville-legend-ships">
          <h3 id="pharosville-legend-ships">The ships</h3>
          <p>
            Each sail is a stablecoin; the hull grows with its market cap and its
            build tells how it is backed. A ship at a shore station holds real
            supply on that chain — Ethereum is the stone mole on the west shore.
          </p>
        </section>

        <section className="pharosville-legend-panel__stanza" aria-labelledby="pharosville-legend-zones">
          <h3 id="pharosville-legend-zones">The water</h3>
          <p>
            The water beneath a ship is its peg risk, from Calm Anchorage out to
            Danger Strait. Wreck Shoal keeps the coins lost at sea.
          </p>
          <ul className="pharosville-legend-panel__zones">
            {LEGEND_ZONE_PLACEMENTS.map((placement) => {
              const area = RISK_WATER_AREAS[placement];
              const swatch = zoneThemeForTerrain(area.terrain).base;
              return (
                <li key={placement}>
                  <span
                    className="pharosville-legend-panel__swatch"
                    style={{ backgroundColor: swatch }}
                    aria-hidden="true"
                  />
                  <strong>{area.label}</strong> — {area.reading}
                </li>
              );
            })}
            <li key={WRECK_SHOAL_AREA.id}>
              <span
                className="pharosville-legend-panel__swatch"
                style={{ backgroundColor: zoneThemeForTerrain(WRECK_SHOAL_AREA.terrain).base }}
                aria-hidden="true"
              />
              <strong>{WRECK_SHOAL_AREA.label}</strong> — {WRECK_SHOAL_AREA.reading}
            </li>
          </ul>
        </section>

        <section className="pharosville-legend-panel__stanza" aria-labelledby="pharosville-legend-lighthouse">
          <h3 id="pharosville-legend-lighthouse">The lighthouse</h3>
          <p>
            The Pharos keeps the whole fleet&apos;s stability: its beam warmth
            and the clarity of the sky follow the Peg Stability Index. The sky
            reads the fleet, the water reads each coin. The sun and moon keep
            your local time, set for a nominal 35° latitude in the hemisphere
            your time zone suggests.
          </p>
        </section>

        {/* Hulls, movers, marks and the full control list are reference rather
            than orientation, so they wait behind progressive disclosure. */}
        <details className="pharosville-legend-panel__more">
          <summary>More: hulls, movers, marks and controls</summary>

          <section aria-labelledby="pharosville-legend-hulls">
            <h3 id="pharosville-legend-hulls">Hull families</h3>
            <ul className="pharosville-legend-panel__ships">
              {LEGEND_SHIP_CLASSES.map(({ name, reading }) => (
                <li key={name}>
                  <strong>{name}</strong> — {reading}
                </li>
              ))}
            </ul>
          </section>

          {recentFleetTrend && (
            <section aria-labelledby="pharosville-legend-recent-movers">
              <h3 id="pharosville-legend-recent-movers">Recent movers</h3>
              {hasRecentMoves ? (
                <>
                  {recentFleetTrend.growers.length > 0 && (
                    <p>Growing: {renderMoverEntries(recentFleetTrend.growers, onSelectDetail, onClose)}.</p>
                  )}
                  {recentFleetTrend.shrinkers.length > 0 && (
                    <p>Shrinking: {renderMoverEntries(recentFleetTrend.shrinkers, onSelectDetail, onClose)}.</p>
                  )}
                  <p>{recentFleetTrend.elevatedShipCount} ships in elevated water.</p>
                </>
              ) : (
                <p>{recentFleetTrendSummaryText(recentFleetTrend)}.</p>
              )}
            </section>
          )}

          <section aria-labelledby="pharosville-legend-marks">
            <h3 id="pharosville-legend-marks">Marks to look for</h3>
            <ul>
              {LEGEND_MARK_ROWS.map((row) => (
                <li key={row.cueId} data-cue-id={row.cueId}>
                  <strong>{row.label}</strong> — {row.text}
                </li>
              ))}
            </ul>
            <p>
              Audit shields are near-zoom marks; click a ship for the exact
              source row.
            </p>
          </section>

          <ControlsCheatsheet
            headingId="pharosville-legend-controls"
            title="Controls"
            intro="Use these controls to inspect the harbor, move the camera, choose the light, and reopen reference panels."
          />
          {onChangelog && <button type="button" className="pharosville-legend-panel__changelog" onClick={onChangelog}>Changelog</button>}
        </details>
      </div>
    </dialog>
  );
}
