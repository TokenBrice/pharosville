import { useCallback, useMemo, useState } from "react";
import type {
  PharosVilleWorld,
  ShipClass,
  ShipNode,
  ShipSizeTier,
  ShipWaterZone,
} from "../systems/world-types";

export type FleetFocusDimension = "riskBand" | "shipClass" | "sizeTier" | "chain";

export interface FleetFocusSelection {
  riskBand: ShipWaterZone | null;
  shipClass: ShipClass | null;
  sizeTier: ShipSizeTier | null;
  chain: string | null;
}

export interface FleetFocusOption<Value extends string = string> {
  value: Value;
  label: string;
  count: number;
}

export interface FleetFocusOptions {
  riskBands: readonly FleetFocusOption<ShipWaterZone>[];
  shipClasses: readonly FleetFocusOption<ShipClass>[];
  sizeTiers: readonly FleetFocusOption<ShipSizeTier>[];
  chains: readonly FleetFocusOption<string>[];
}

export interface FleetFocusSummary {
  activeSubsetLabel: string;
  label: string;
  matchCount: number;
  matchCountLabel: string;
  totalCount: number;
}

export interface UseWorldFocusResult extends FleetFocusSummary {
  clearFocus: () => void;
  focusedShipIds: ReadonlySet<string> | undefined;
  options: FleetFocusOptions;
  selection: FleetFocusSelection;
  signature: string;
  setSelection: (selection: FleetFocusSelection) => void;
  updateSelection: (patch: Partial<FleetFocusSelection>) => void;
}

export const EMPTY_FLEET_FOCUS_SELECTION: FleetFocusSelection = Object.freeze({
  riskBand: null,
  shipClass: null,
  sizeTier: null,
  chain: null,
});

const RISK_BAND_LABELS: Record<ShipWaterZone, string> = {
  calm: "Calm",
  watch: "Watch",
  alert: "Alert",
  warning: "Warning",
  danger: "Danger",
  ledger: "Ledger",
};

const RISK_BAND_ORDER: readonly ShipWaterZone[] = ["calm", "watch", "alert", "warning", "danger", "ledger"];

const SHIP_CLASS_LABELS: Record<ShipClass, string> = {
  cefi: "CeFi",
  "cefi-dependent": "CeFi-dependent",
  defi: "DeFi",
  "legacy-algo": "Legacy algo",
  unclassified: "Unclassified",
};

const SHIP_CLASS_ORDER: readonly ShipClass[] = ["cefi", "cefi-dependent", "defi", "legacy-algo", "unclassified"];

const SIZE_TIER_LABELS: Record<ShipSizeTier, string> = {
  titan: "Titan",
  unique: "Heritage",
  flagship: "Flagship",
  major: "Major",
  regional: "Regional",
  local: "Local",
  skiff: "Skiff",
  micro: "Micro",
  unknown: "Unknown",
};

const SIZE_TIER_ORDER: readonly ShipSizeTier[] = [
  "titan",
  "unique",
  "flagship",
  "major",
  "regional",
  "local",
  "skiff",
  "micro",
  "unknown",
];

export function useWorldFocus(input: {
  initialSelection?: Partial<FleetFocusSelection>;
  world: Pick<PharosVilleWorld, "ships">;
}): UseWorldFocusResult {
  const { world } = input;
  const [selection, setSelectionState] = useState<FleetFocusSelection>(() => ({
    ...EMPTY_FLEET_FOCUS_SELECTION,
    ...input.initialSelection,
  }));

  const options = useMemo(() => buildFleetFocusOptions(world.ships), [world.ships]);
  const resolved = useMemo(
    () => resolveFleetFocus({ options, selection, ships: world.ships }),
    [options, selection, world.ships],
  );

  const setSelection = useCallback((nextSelection: FleetFocusSelection) => {
    setSelectionState(nextSelection);
  }, []);

  const updateSelection = useCallback((patch: Partial<FleetFocusSelection>) => {
    setSelectionState((current) => ({ ...current, ...patch }));
  }, []);

  const clearFocus = useCallback(() => {
    setSelectionState(EMPTY_FLEET_FOCUS_SELECTION);
  }, []);

  return {
    ...resolved,
    clearFocus,
    options,
    selection,
    setSelection,
    updateSelection,
  };
}

export function buildFleetFocusOptions(ships: readonly ShipNode[]): FleetFocusOptions {
  const riskBandCounts = new Map<ShipWaterZone, number>();
  const shipClassCounts = new Map<ShipClass, number>();
  const sizeTierCounts = new Map<ShipSizeTier, number>();
  const chainCounts = new Map<string, number>();

  for (const ship of ships) {
    riskBandCounts.set(ship.riskZone, (riskBandCounts.get(ship.riskZone) ?? 0) + 1);
    shipClassCounts.set(ship.visual.shipClass, (shipClassCounts.get(ship.visual.shipClass) ?? 0) + 1);
    sizeTierCounts.set(ship.visual.sizeTier, (sizeTierCounts.get(ship.visual.sizeTier) ?? 0) + 1);

    const positiveChains = new Set<string>();
    for (const presence of ship.chainPresence) {
      if (presence.currentUsd > 0) positiveChains.add(presence.chainId);
    }
    for (const chainId of positiveChains) {
      chainCounts.set(chainId, (chainCounts.get(chainId) ?? 0) + 1);
    }
  }

  return {
    riskBands: orderedOptions(RISK_BAND_ORDER, riskBandCounts, RISK_BAND_LABELS),
    shipClasses: orderedOptions(SHIP_CLASS_ORDER, shipClassCounts, SHIP_CLASS_LABELS),
    sizeTiers: orderedOptions(SIZE_TIER_ORDER, sizeTierCounts, SIZE_TIER_LABELS),
    chains: [...chainCounts.entries()]
      .map(([value, count]) => ({ value, count, label: formatChainLabel(value) }))
      .toSorted(compareOptionsByCountThenLabel),
  };
}

export function resolveFleetFocus(input: {
  options: FleetFocusOptions;
  selection: FleetFocusSelection;
  ships: readonly ShipNode[];
}): FleetFocusSummary & {
  focusedShipIds: ReadonlySet<string> | undefined;
  signature: string;
} {
  const { options, selection, ships } = input;
  const activeLabels = activeSelectionLabels(selection, options);
  const totalCount = ships.length;
  if (activeLabels.length === 0) {
    const matchCountLabel = `${totalCount} of ${totalCount} ships`;
    return {
      activeSubsetLabel: "all ships",
      focusedShipIds: undefined,
      label: "all ships",
      matchCount: totalCount,
      matchCountLabel,
      signature: `all:${totalCount}`,
      totalCount,
    };
  }

  const focusedShipIds = new Set<string>();
  for (const ship of ships) {
    if (shipMatchesSelection(ship, selection)) focusedShipIds.add(ship.id);
  }
  const activeSubsetLabel = joinHuman(activeLabels);
  const sortedIds = [...focusedShipIds].toSorted();
  const criteriaSignature = activeCriteriaSignature(selection);
  const matchCountLabel = `${focusedShipIds.size} of ${totalCount} ships`;
  return {
    activeSubsetLabel,
    focusedShipIds,
    label: activeSubsetLabel,
    matchCount: focusedShipIds.size,
    matchCountLabel,
    signature: `${criteriaSignature}:${focusedShipIds.size}/${totalCount}:${sortedIds.join(",")}`,
    totalCount,
  };
}

function orderedOptions<Value extends string>(
  order: readonly Value[],
  counts: ReadonlyMap<Value, number>,
  labels: Record<Value, string>,
): FleetFocusOption<Value>[] {
  return order.flatMap((value) => {
    const count = counts.get(value) ?? 0;
    return count > 0 ? [{ value, count, label: labels[value] }] : [];
  });
}

function compareOptionsByCountThenLabel(a: FleetFocusOption, b: FleetFocusOption): number {
  return b.count - a.count || a.label.localeCompare(b.label) || a.value.localeCompare(b.value);
}

function shipMatchesSelection(ship: ShipNode, selection: FleetFocusSelection): boolean {
  if (selection.riskBand && ship.riskZone !== selection.riskBand) return false;
  if (selection.shipClass && ship.visual.shipClass !== selection.shipClass) return false;
  if (selection.sizeTier && ship.visual.sizeTier !== selection.sizeTier) return false;
  if (selection.chain && !ship.chainPresence.some((presence) => (
    presence.chainId === selection.chain && presence.currentUsd > 0
  ))) return false;
  return true;
}

function activeSelectionLabels(selection: FleetFocusSelection, options: FleetFocusOptions): string[] {
  return [
    selection.riskBand ? `risk band ${optionLabel(options.riskBands, selection.riskBand, RISK_BAND_LABELS[selection.riskBand])}` : null,
    selection.shipClass ? `ship class ${optionLabel(options.shipClasses, selection.shipClass, SHIP_CLASS_LABELS[selection.shipClass])}` : null,
    selection.sizeTier ? `size tier ${optionLabel(options.sizeTiers, selection.sizeTier, SIZE_TIER_LABELS[selection.sizeTier])}` : null,
    selection.chain ? `chain ${optionLabel(options.chains, selection.chain, formatChainLabel(selection.chain))}` : null,
  ].filter((label): label is string => label !== null);
}

function optionLabel<Value extends string>(
  options: readonly FleetFocusOption<Value>[],
  value: Value,
  fallback: string,
): string {
  return options.find((option) => option.value === value)?.label ?? fallback;
}

function activeCriteriaSignature(selection: FleetFocusSelection): string {
  return [
    selection.riskBand ? `risk:${selection.riskBand}` : null,
    selection.shipClass ? `class:${selection.shipClass}` : null,
    selection.sizeTier ? `size:${selection.sizeTier}` : null,
    selection.chain ? `chain:${selection.chain}` : null,
  ].filter((part): part is string => part !== null).join("|");
}

function joinHuman(parts: readonly string[]): string {
  if (parts.length === 0) return "all ships";
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function formatChainLabel(chainId: string): string {
  return chainId
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "evm") return "EVM";
      if (lower === "bsc") return "BSC";
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}
