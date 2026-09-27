import { useMemo, type RefObject } from "react";
import type { GardenStationLabelFrame } from "../renderer/garden-observatory-hit-testing";
import type { PharosVilleWorld, ShipWaterZone } from "../systems/world-types";

/** Room for the 14 px hairline leader between the words and the mast (W6.4). */
const CHIP_GAP_PX = 14;
const CHIP_COLLISION_GAP_PX = 2;
const CHIP_FALLBACK_WIDTH_PX = 118;
/** Name over band word: the collision step for two stacked ink labels. */
const CHIP_HEIGHT_PX = 34;

/** Severity is word + glyph + tone, never a grey word alone (W6.4). */
const BAND_GLYPH: Readonly<Record<ShipWaterZone, string>> = {
  calm: "",
  watch: "·",
  alert: "◇",
  warning: "◆",
  danger: "◆",
  ledger: "",
};

interface HarborLabelChipItem {
  detailId: string;
  label: string;
  retiring: boolean;
  state: ShipWaterZone;
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

/** The admitted arrival ceremony's one nameplate; `retiring` holds it mounted while it fades out. */
export interface HarborNameplate {
  detailId: string;
  retiring: boolean;
}

export interface HarborLabelChipsProps {
  containerRef: RefObject<HTMLDivElement | null>;
  /** At most one ceremony nameplate at a time; nothing else in the harbour wears a chip. */
  nameplate?: HarborNameplate | null;
  onSelectDetail: (detailId: string) => void;
  selectedShipDetailId?: string | null;
  world: PharosVilleWorld;
}

/** The selected ship's caption and the single arrival-ceremony nameplate; station identity lives on rooftop flags. */
export function HarborLabelChips({
  containerRef,
  nameplate = null,
  onSelectDetail,
  selectedShipDetailId = null,
  world,
}: HarborLabelChipsProps) {
  const items = useMemo(() => {
    const chipItems: HarborLabelChipItem[] = [];
    const push = (detailId: string, retiring: boolean) => {
      const ship = world.entityById[detailId];
      if (ship?.kind !== "ship") return;
      chipItems.push({
        detailId,
        label: ship.label,
        retiring,
        state: ship.riskZone,
        supply: ship.marketCapUsd,
      });
    };
    if (selectedShipDetailId) push(selectedShipDetailId, false);
    if (nameplate && nameplate.detailId !== selectedShipDetailId) push(nameplate.detailId, nameplate.retiring);
    return chipItems;
  }, [nameplate, selectedShipDetailId, world]);

  return (
    <div ref={containerRef} className="pharosville-harbor-labels" aria-hidden="true" data-testid="pharosville-harbor-labels">
      {items.map((item) => (
        <button
          key={item.detailId}
          type="button"
          tabIndex={-1}
          aria-hidden="true"
          className="pharosville-harbor-label-chip"
          data-band={item.state}
          data-detail-id={item.detailId}
          data-supply={item.supply}
          data-retiring={item.retiring ? "true" : undefined}
          data-visible="false"
          onClick={() => onSelectDetail(item.detailId)}
        >
          <strong>{item.label}</strong>
          <span className="pharosville-harbor-label-chip__state">
            {BAND_GLYPH[item.state] && <span className="pharosville-harbor-label-chip__glyph">{BAND_GLYPH[item.state]}</span>}
            {item.state}
          </span>
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
  const exclusions = [input.lighthouseRect, ...(input.exclusionRects ?? [])];
  const placed: ScreenRect[] = [];
  const ordered = chips.sort((a, b) => numericSupply(b) - numericSupply(a));
  for (const chip of ordered) {
    const detailId = chip.dataset.detailId;
    const anchor = detailId ? input.anchorsByDetailId.get(detailId) : null;
    if (
      chip.dataset.retiring === "true"
      || !anchor || anchor.x < 0 || anchor.y < 0 || anchor.x > input.viewport.width || anchor.y > input.viewport.height
    ) {
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
