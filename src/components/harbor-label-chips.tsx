import { useMemo, type RefObject, type SyntheticEvent } from "react";
import type { GardenStationLabelFrame } from "../renderer/garden-observatory-hit-testing";
import { dockConcentrationLabel } from "../systems/detail-model";
import type { PharosVilleWorld } from "../systems/world-types";

const CHIP_GAP_PX = 6;
const CHIP_COLLISION_GAP_PX = 2;
const CHIP_FALLBACK_WIDTH_PX = 118;
const CHIP_HEIGHT_PX = 18;
const NO_TRANSIENT_SHIP_LABELS: readonly string[] = [];

interface HarborLabelChipItem {
  detailId: string;
  initials: string;
  label: string;
  logoPath: string | null;
  state: string;
  supply: number;
}

interface ScreenRect {
  height: number;
  width: number;
  x: number;
  y: number;
}

export interface HarborLabelChipLayoutInput extends GardenStationLabelFrame {
  exclusionRects?: readonly ScreenRect[];
}

export interface HarborLabelChipsProps {
  /** Ships mid arrival/departure beat; they carry a brief nameplate and nothing else does. */
  arrivalShipDetailIds?: readonly string[];
  containerRef: RefObject<HTMLDivElement | null>;
  onSelectDetail: (detailId: string) => void;
  selectedShipDetailId?: string | null;
  world: PharosVilleWorld;
}

/**
 * The always-on station naming surface. It displaces hover-only station naming;
 * the accessibility ledger remains the spoken channel, so these chips are
 * deliberately aria-hidden. Position is written by the world's existing RAF.
 */
export function HarborLabelChips({
  arrivalShipDetailIds = NO_TRANSIENT_SHIP_LABELS,
  containerRef,
  onSelectDetail,
  selectedShipDetailId = null,
  world,
}: HarborLabelChipsProps) {
  const items = useMemo(() => {
    const stationItems: HarborLabelChipItem[] = world.docks.map((dock) => ({
      detailId: dock.detailId,
      initials: paintedInitials(dock.label),
      label: dock.label,
      logoPath: dock.logoPath?.startsWith("/") ? dock.logoPath : null,
      state: dockConcentrationLabel(dock.concentration)?.split(" ", 1)[0] ?? "unavailable",
      supply: dock.totalUsd,
    }));
    stationItems.push({
      detailId: world.pigeonnier.detailId,
      initials: "TON",
      label: world.pigeonnier.label,
      logoPath: null,
      state: "watch",
      supply: 0,
    });

    const transientIds = new Set(arrivalShipDetailIds);
    if (selectedShipDetailId) transientIds.add(selectedShipDetailId);
    for (const detailId of transientIds) {
      const ship = world.entityById[detailId];
      if (ship?.kind !== "ship") continue;
      stationItems.push({
        detailId,
        initials: paintedInitials(ship.label),
        label: ship.label,
        logoPath: null,
        state: ship.riskZone,
        supply: ship.marketCapUsd,
      });
    }
    return stationItems;
  }, [arrivalShipDetailIds, selectedShipDetailId, world]);

  return (
    <div ref={containerRef} className="pharosville-harbor-labels" aria-hidden="true" data-testid="pharosville-harbor-labels">
      {items.map((item) => (
        <button
          key={item.detailId}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="pharosville-harbor-label-chip"
          data-detail-id={item.detailId}
          data-supply={item.supply}
          data-visible="false"
          onClick={() => onSelectDetail(item.detailId)}
        >
          <span className="pharosville-harbor-label-chip__mark" aria-hidden="true">
            {item.logoPath ? <img src={item.logoPath} alt="" onError={hideBrokenMark} /> : null}
            <span data-fallback={item.logoPath ? "hidden" : "visible"}>{item.initials}</span>
          </span>
          <strong>{item.label}</strong>
          <span className="pharosville-harbor-label-chip__state">{item.state}</span>
        </button>
      ))}
    </div>
  );
}

/** Writes every chip in one pass from the hit-test projection produced by the current frame. */
export function updateHarborLabelChipLayout(
  container: HTMLDivElement | null,
  input: HarborLabelChipLayoutInput,
): void {
  if (!container) return;
  const chips = Array.from(container.querySelectorAll<HTMLElement>("[data-detail-id]"));
  // Chips are always on at every zoom (operator decision 2026-09-05): the
  // whole-map framing is exactly where all nine stations share the frame and
  // need naming. Only per-anchor hiding below applies (off-screen, exclusion).

  const exclusions = [input.lighthouseRect, ...(input.exclusionRects ?? [])];
  const placed: ScreenRect[] = [];
  const ordered = chips.sort((a, b) => numericSupply(b) - numericSupply(a));
  for (const chip of ordered) {
    const detailId = chip.dataset.detailId;
    const anchor = detailId ? input.anchorsByDetailId.get(detailId) : null;
    if (!anchor || anchor.x < 0 || anchor.y < 0 || anchor.x > input.viewport.width || anchor.y > input.viewport.height) {
      chip.dataset.visible = "false";
      continue;
    }

    const measured = chip.getBoundingClientRect();
    const width = measured.width || chip.offsetWidth || CHIP_FALLBACK_WIDTH_PX;
    const height = Math.min(CHIP_HEIGHT_PX, measured.height || chip.offsetHeight || CHIP_HEIGHT_PX);
    const rect = {
      x: anchor.x - width / 2,
      y: anchor.y - height - CHIP_GAP_PX,
      width,
      height,
    };
    while (placed.some((other) => rectanglesOverlap(rect, other))) {
      rect.y += height + CHIP_COLLISION_GAP_PX;
    }

    if (exclusions.some((exclusion) => rectanglesOverlap(rect, exclusion))) {
      chip.dataset.visible = "false";
      continue;
    }

    chip.style.transform = `translate(${Math.round(rect.x)}px, ${Math.round(rect.y)}px)`;
    chip.dataset.visible = "true";
    placed.push(rect);
  }
}

function numericSupply(chip: HTMLElement): number {
  const supply = Number(chip.dataset.supply);
  return Number.isFinite(supply) ? supply : 0;
}

function rectanglesOverlap(a: ScreenRect, b: ScreenRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function paintedInitials(label: string): string {
  const words = label.trim().split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return "?";
  return words.length === 1
    ? words[0]!.slice(0, 2).toUpperCase()
    : words.slice(0, 2).map((word) => word[0]).join("").toUpperCase();
}

function hideBrokenMark(event: SyntheticEvent<HTMLImageElement>): void {
  event.currentTarget.hidden = true;
  const fallback = event.currentTarget.nextElementSibling;
  if (fallback instanceof HTMLElement) fallback.dataset.fallback = "visible";
}
