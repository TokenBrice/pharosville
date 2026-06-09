"use client";

import X from "lucide-react/dist/esm/icons/x";
import { zoneThemeForTerrain } from "../systems/palette";
import { RISK_WATER_AREAS } from "../systems/risk-water-areas";
import type { ShipRiskPlacement } from "../systems/world-types";

export interface LegendPanelProps {
  onClose: () => void;
}

// Zone rows derive label + swatch color from the canonical tables
// (RISK_WATER_AREAS / ZONE_THEMES) so the legend can never drift from the
// rendered map. Only the one-line reading is authored here.
const LEGEND_ZONE_READINGS: ReadonlyArray<{ placement: ShipRiskPlacement; reading: string }> = [
  { placement: "safe-harbor", reading: "Steady peg evidence; the safe default berth" },
  { placement: "breakwater-edge", reading: "Early-warning signals worth watching" },
  { placement: "harbor-mouth-watch", reading: "Elevated DEWS alert; pressure building" },
  { placement: "outer-rough-water", reading: "Serious peg stress; shallow, hazardous water" },
  { placement: "storm-shelf", reading: "Active depeg or critical risk; storm water" },
  { placement: "ledger-mooring", reading: "NAV-priced ledger assets; priced by attestation, not market peg" },
];

const LEGEND_SHIP_CLASSES: ReadonlyArray<{ name: string; reading: string }> = [
  { name: "Treasury galleon", reading: "Centralized issuer (fiat reserves)" },
  { name: "Chartered brigantine", reading: "Centralized-dependent backing" },
  { name: "DAO schooner", reading: "Decentralized governance" },
  { name: "Legacy junk", reading: "Algorithmic backing" },
];

export function LegendPanel({ onClose }: LegendPanelProps) {
  return (
    <aside
      id="pharosville-legend-panel"
      className="pharosville-changelog-panel pharosville-legend-panel"
      aria-labelledby="pharosville-legend-title"
      data-testid="pharosville-legend-panel"
      role="dialog"
    >
      <header className="pharosville-changelog-panel__header">
        <div>
          <p className="pharosville-changelog-panel__eyebrow">Reading the harbor</p>
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
          PharosVille is a live chart of the stablecoin seas: every ship is a
          stablecoin, every harbor a blockchain, and the water a coin sails in
          is its current peg-risk reading. It is an interpretive view, not
          financial advice.
        </p>

        <section aria-labelledby="pharosville-legend-zones">
          <h3 id="pharosville-legend-zones">Sea zones</h3>
          <ul className="pharosville-legend-panel__zones">
            {LEGEND_ZONE_READINGS.map(({ placement, reading }) => {
              const area = RISK_WATER_AREAS[placement];
              const swatch = zoneThemeForTerrain(area.terrain).base;
              return (
                <li key={placement}>
                  <span
                    className="pharosville-legend-panel__swatch"
                    style={{ backgroundColor: swatch }}
                    aria-hidden="true"
                  />
                  <strong>{area.label}</strong> — {reading}
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="pharosville-legend-ships">
          <h3 id="pharosville-legend-ships">Ships</h3>
          <ul>
            {LEGEND_SHIP_CLASSES.map(({ name, reading }) => (
              <li key={name}>
                <strong>{name}</strong> — {reading}
              </li>
            ))}
          </ul>
          <p>
            Hull size tracks market-cap tier (compressed, not linear). The
            largest titans and culturally significant heritage hulls stay
            visible even while moored; smaller ships disappear into their dock
            while berthed.
          </p>
        </section>

        <section aria-labelledby="pharosville-legend-harbors">
          <h3 id="pharosville-legend-harbors">Harbors &amp; landmarks</h3>
          <p>
            Docks are blockchains; a ship calling at a dock means the coin has
            real supply on that chain (it does not imply bridge volume or
            transfers). The Pharos lighthouse glows with the fleet-wide Peg
            Stability Index, and the cemetery islet remembers coins lost at
            sea.
          </p>
        </section>

        <section aria-labelledby="pharosville-legend-controls">
          <h3 id="pharosville-legend-controls">Controls</h3>
          <p>
            Drag to pan, scroll to zoom, click any ship, dock, or sea label
            for details. Tab / Shift+Tab cycles map targets, Enter selects.
            The toolbar sets the time of day and follows your selection.
          </p>
        </section>
      </div>
    </aside>
  );
}
