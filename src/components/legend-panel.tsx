"use client";

import { useId, useMemo, useRef, useState } from "react";
import atlasManifest from "../systems/reading-atlas.json";
import { deriveReadingKey, type ReadingKeyEntry } from "../systems/reading-key";
import type { PharosVilleWorld } from "../systems/world-types";
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

// Vite includes only a genuinely published atlas. No broken image, fallback
// drawing or placeholder appears while the real-GPU crops are still pending.
const atlasFiles = import.meta.glob<string>("/public/garden-reading-atlas.webp", { eager: true, query: "?url", import: "default" });
const atlasUrl = Object.values(atlasFiles)[0];
type AtlasCell = { x: number; y: number; width: number; height: number; detailId?: string };
const atlasCells: Record<string, AtlasCell> = atlasManifest.exemplars;

function ReadingExemplar({ entry }: { entry: ReadingKeyEntry }) {
  const cell = entry.exemplarId ? atlasCells[entry.exemplarId] : undefined;
  if (!atlasUrl || !atlasManifest.image || !cell || (entry.id.startsWith("sail.") && cell.detailId !== entry.detailId)) return null;
  const scale = 96 / cell.width;
  return (
    <span aria-hidden="true" style={{ display: "inline-block", width: 96, height: cell.height * scale, overflow: "hidden", flexShrink: 0 }}>
      <img src={atlasUrl} alt="" role="presentation" title={`${entry.label}: ${entry.description}`}
        data-exemplar-id={entry.exemplarId} width={atlasManifest.width * scale} height={atlasManifest.height * scale}
        style={{ maxWidth: "none", transform: `translate(${-cell.x * scale}px, ${-cell.y * scale}px)` }} />
    </span>
  );
}

export interface ReadingKeyProps {
  world: PharosVilleWorld;
  onSelectDetail: (detailId: string) => void;
  /** Highlight only: focus must not become a camera command. */
  onPreviewDetail?: (detailId: string | null) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  teachingOpen?: boolean;
  onDismissTeaching?: () => void;
}

/** Always reopenable, nonmodal orientation beside—not instead of—the caption. */
export function ReadingKey({ world, onSelectDetail, onPreviewDetail, open, onOpenChange, teachingOpen = false, onDismissTeaching }: ReadingKeyProps) {
  const [localOpen, setLocalOpen] = useState(false);
  const expanded = teachingOpen || (open ?? localOpen);
  const id = useId();
  const opener = useRef<HTMLButtonElement>(null);
  const model = useMemo(() => deriveReadingKey(world), [world]);
  const setOpen = (next: boolean) => { setLocalOpen(next); onOpenChange?.(next); };
  const close = () => {
    setOpen(false);
    if (teachingOpen) onDismissTeaching?.();
    onPreviewDetail?.(null);
    opener.current?.focus({ preventScroll: true });
  };
  const entry = (reading: ReadingKeyEntry) => (
    <li key={reading.id} data-reading-id={reading.id}>
      <ReadingExemplar entry={reading} />
      <button type="button" className="pharosville-legend-panel__mover"
        style={{ minHeight: 44, outlineColor: "var(--pv-paper-ink)", color: "inherit" }}
        disabled={reading.detailId === null}
        onFocus={() => onPreviewDetail?.(reading.detailId)}
        onBlur={() => onPreviewDetail?.(null)}
        onPointerEnter={() => onPreviewDetail?.(reading.detailId)}
        onPointerLeave={() => onPreviewDetail?.(null)}
        onClick={() => {
          if (!reading.detailId) return;
          // Inspecting one exemplar is not completion of the whole teaching.
          if (!teachingOpen) close();
          onPreviewDetail?.(null);
          onSelectDetail(reading.detailId);
        }}>
        {reading.label}
      </button>
      {" — "}{reading.description}
    </li>
  );
  return (
    <aside className="pharosville-reading-key" aria-label="Garden reading key" data-testid="pharosville-reading-key"
      onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape" && expanded) close(); }}
      >
      <button ref={opener} type="button" className="pv-chrome-action pharosville-reading-key__trigger" aria-expanded={expanded} aria-controls={id}
        onClick={() => expanded ? close() : setOpen(true)}>Read key</button>
      {expanded && <div id={id} className="pharosville-reading-key__sheet pv-paper">
        <p>Read the lighthouse, ordered water surfaces and leading sails. These examples illustrate the key, not a second live feed.</p>
        <section aria-label="Lighthouse">
          <h3>Lighthouse</h3>
          <ul>{entry(model.lighthouse)}</ul>
          <p>{model.lighthouseEvidence}</p>
          <ReadingExemplar entry={{ ...model.lighthouse, exemplarId: "cloud", description: "PSI-owned cloud cover; the wall clock owns its lighting" }} />
        </section>
        <section aria-label="Water">
          <h3>Water</h3>
          <p>Five ordered risk surfaces, from steady peg evidence to greatest pressure. Berth is categorical, not a within-band score.</p>
          <ol>{model.waters.map(entry)}</ol>
          <p>Separate non-risk waters</p>
          <ul>{model.nonRiskWaters.map(entry)}</ul>
        </section>
        <section aria-label="Sails">
          <h3>Sails</h3>
          <ol>{model.leaders.map(entry)}</ol>
          {model.leaders.length === 0 && <p>Supply leaders unavailable.</p>}
          <p>{model.scaleCaveat}</p>
          <p>{model.supplyEvidence}</p>
        </section>
        <button type="button" className="pharosville-legend-panel__mover" style={{ minHeight: 44, outlineColor: "var(--pv-paper-ink)", color: "inherit" }} onClick={close}>{teachingOpen ? "Got it" : "Close reading key"}</button>
      </div>}
    </aside>
  );
}


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
            Danger Strait. On Wreck Shoal's shore a stone garden keeps one stone for every coin that died.
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
            The Pharos keeps the whole fleet&apos;s stability: its beacon and
            beam character, far-shore clarity and sky cover follow the Pharos
            Stability Index (PSI). Harbor light separately qualifies the seven
            sources; warmth alone does not decode PSI. The sky reads the fleet,
            the water reads each coin. The sun and moon keep your local time,
            set for a nominal 35° latitude in the hemisphere your time zone suggests.
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
