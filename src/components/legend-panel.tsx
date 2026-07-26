"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import X from "lucide-react/dist/esm/icons/x";
import { ControlsCheatsheet } from "./controls-cheatsheet";
import { zoneThemeForTerrain } from "../systems/palette";
import { RISK_WATER_AREAS } from "../systems/risk-water-areas";
import {
  recentFleetTrendEntryLabel,
  recentFleetTrendSummaryText,
  type RecentFleetTrendSummary,
} from "../systems/sea-state";
import { LEGEND_MARK_ROWS } from "../systems/visual-cue-registry";
import type { ShipRiskPlacement } from "../systems/world-types";

export interface LegendPanelProps {
  onClose: () => void;
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
    name: "Treasury galleon",
    reading: "Centralized issuer (fiat reserves)",
  },
  {
    name: "Chartered brigantine",
    reading: "Centralized-dependent backing",
  },
  {
    name: "DAO schooner",
    reading: "Decentralized governance",
  },
  {
    name: "Legacy junk",
    reading: "Algorithmic backing",
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

const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function LegendPanel({ onClose, onObserve, onSelectDetail, recentFleetTrend }: LegendPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const hasRecentMoves = recentFleetTrend
    ? recentFleetTrend.growers.length > 0 || recentFleetTrend.shrinkers.length > 0
    : false;

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusWithoutScroll(closeButtonRef.current ?? panelRef.current);
    return () => {
      restoreDialogFocus(previouslyFocused);
    };
  }, []);

  const handleDialogKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    trapDialogTab(event, panelRef.current);
  }, []);

  return (
    <aside
      ref={panelRef}
      id="pharosville-legend-panel"
      className="pharosville-changelog-panel pharosville-legend-panel"
      aria-labelledby="pharosville-legend-title"
      aria-modal="true"
      data-testid="pharosville-legend-panel"
      onKeyDown={handleDialogKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <header className="pharosville-changelog-panel__header">
        <div>
          <p className="pharosville-changelog-panel__eyebrow">Reading the harbor</p>
          <h2 id="pharosville-legend-title">Legend</h2>
        </div>
        <button
          ref={closeButtonRef}
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
          financial advice. Click a ship and read the water it sails in first.
        </p>

        {/* The first interactive choice after Close. A new reader can move
            directly from the explanation into the harbor without scrolling
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

        <section aria-labelledby="pharosville-legend-zones">
          <h3 id="pharosville-legend-zones">Sea zones</h3>
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
          </ul>
        </section>

        <section aria-labelledby="pharosville-legend-ships">
          <h3 id="pharosville-legend-ships">Ships</h3>
          <ul className="pharosville-legend-panel__ships">
            {LEGEND_SHIP_CLASSES.map(({ name, reading }) => (
              <li key={name}>
                <strong>{name}</strong> — {reading}
              </li>
            ))}
          </ul>
          <p>
            Hull size tracks market-cap tier (compressed, not linear). The
            ship&apos;s cruising pace also tracks its supply tier — bigger coins
            cycle a little faster; pace never means transfers or activity. The
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
            Stability Index. Its beam warmth tracks fleet-wide PSI; the colour
            of the water and sky a ship sails in is that area&apos;s own DEWS
            peg-risk reading — they are separate signals. The cemetery islet
            remembers coins lost at sea.
          </p>
        </section>

        {/* Movers, marks and the full control list are reference rather than
            orientation, so they wait behind progressive disclosure. */}
        <details className="pharosville-legend-panel__more">
          <summary>More: recent movers, marks and controls</summary>

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
        </details>
      </div>
    </aside>
  );
}

function trapDialogTab(event: KeyboardEvent<HTMLElement>, panel: HTMLElement | null): void {
  if (event.key !== "Tab" || !panel) return;

  const focusableElements = getDialogFocusableElements(panel);
  if (focusableElements.length === 0) {
    event.preventDefault();
    focusWithoutScroll(panel);
    return;
  }

  const firstElement = focusableElements[0]!;
  const lastElement = focusableElements[focusableElements.length - 1]!;
  const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const activeInPanel = Boolean(activeElement && panel.contains(activeElement));

  if (event.shiftKey) {
    if (!activeInPanel || activeElement === panel || activeElement === firstElement) {
      event.preventDefault();
      focusWithoutScroll(lastElement);
    }
    return;
  }

  if (!activeInPanel || activeElement === panel || activeElement === lastElement) {
    event.preventDefault();
    focusWithoutScroll(firstElement);
  }
}

function getDialogFocusableElements(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR))
    .filter((element) => element.tabIndex >= 0);
}

function restoreDialogFocus(previouslyFocused: HTMLElement | null): void {
  if (
    previouslyFocused
    && previouslyFocused !== document.body
    && document.contains(previouslyFocused)
  ) {
    focusWithoutScroll(previouslyFocused);
    return;
  }
  focusWithoutScroll(document.querySelector<HTMLElement>('[data-testid="pharosville-world"]'));
}

function focusWithoutScroll(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true });
}
