"use client";

import { useId, useMemo, useState } from "react";
import Filter from "lucide-react/dist/esm/icons/filter";
import type {
  FleetFocusDimension,
  FleetFocusOption,
  FleetFocusOptions,
  FleetFocusSelection,
  FleetFocusSummary,
} from "../hooks/use-world-focus";

export interface FleetFocusProps extends FleetFocusSummary {
  chainOptionLimit?: number;
  className?: string;
  clearFocus: () => void;
  options: FleetFocusOptions;
  selection: FleetFocusSelection;
  updateSelection: (patch: Partial<FleetFocusSelection>) => void;
}

const DEFAULT_CHAIN_OPTION_LIMIT = 8;

const DIMENSION_LABELS: Record<FleetFocusDimension, string> = {
  riskBand: "Risk band",
  shipClass: "Ship class",
  sizeTier: "Size tier",
  chain: "Chain",
};

export function FleetFocus({
  activeSubsetLabel,
  chainOptionLimit = DEFAULT_CHAIN_OPTION_LIMIT,
  className,
  clearFocus,
  matchCountLabel,
  options,
  selection,
  updateSelection,
}: FleetFocusProps) {
  const [showAllChains, setShowAllChains] = useState(false);
  const titleId = useId();
  const chainOptions = useMemo(
    () => visibleChainOptions(options.chains, selection.chain, chainOptionLimit, showAllChains),
    [chainOptionLimit, options.chains, selection.chain, showAllChains],
  );
  const hasActiveFocus = activeSubsetLabel !== "all ships";
  const rootClassName = className ? `pharosville-fleet-focus ${className}` : "pharosville-fleet-focus";

  return (
    <section className={rootClassName} aria-labelledby={titleId} data-testid="pharosville-fleet-focus">
      <header className="pharosville-fleet-focus__header">
        <h2 id={titleId}>
          <Filter aria-hidden="true" size={15} />
          <span>Fleet focus</span>
        </h2>
        <button
          type="button"
          className="pharosville-fleet-focus__clear"
          disabled={!hasActiveFocus}
          onClick={clearFocus}
        >
          Clear
        </button>
      </header>
      <p className="pharosville-fleet-focus__count" aria-live="polite" data-testid="pharosville-fleet-focus-count">
        {matchCountLabel}
      </p>

      <ToggleGroup
        dimension="riskBand"
        label={DIMENSION_LABELS.riskBand}
        options={options.riskBands}
        selectedValue={selection.riskBand}
        onSelect={(value) => updateSelection({ riskBand: value })}
      />
      <ToggleGroup
        dimension="shipClass"
        label={DIMENSION_LABELS.shipClass}
        options={options.shipClasses}
        selectedValue={selection.shipClass}
        onSelect={(value) => updateSelection({ shipClass: value })}
      />
      <ToggleGroup
        dimension="sizeTier"
        label={DIMENSION_LABELS.sizeTier}
        options={options.sizeTiers}
        selectedValue={selection.sizeTier}
        onSelect={(value) => updateSelection({ sizeTier: value })}
      />
      <ToggleGroup
        dimension="chain"
        label={DIMENSION_LABELS.chain}
        options={chainOptions}
        selectedValue={selection.chain}
        onSelect={(value) => updateSelection({ chain: value })}
      />
      {options.chains.length > chainOptionLimit && (
        <button
          type="button"
          className="pharosville-fleet-focus__more"
          aria-expanded={showAllChains}
          onClick={() => setShowAllChains((value) => !value)}
        >
          {showAllChains ? "Fewer chains" : `More chains (${options.chains.length - chainOptions.length})`}
        </button>
      )}
    </section>
  );
}

function ToggleGroup<Value extends string>({
  dimension,
  label,
  onSelect,
  options,
  selectedValue,
}: {
  dimension: FleetFocusDimension;
  label: string;
  onSelect: (value: Value | null) => void;
  options: readonly FleetFocusOption<Value>[];
  selectedValue: Value | null;
}) {
  if (options.length === 0) return null;
  return (
    <div className="pharosville-fleet-focus__group" role="group" aria-label={label}>
      <span className="pharosville-fleet-focus__group-label">{label}</span>
      <div className="pharosville-fleet-focus__segmented">
        <button
          type="button"
          aria-pressed={selectedValue === null}
          className="pharosville-fleet-focus__option"
          onClick={() => onSelect(null)}
        >
          All
        </button>
        {options.map((option) => {
          const active = selectedValue === option.value;
          return (
            <button
              key={`${dimension}:${option.value}`}
              type="button"
              aria-pressed={active}
              aria-label={`${label}: ${option.label}, ${option.count} ships`}
              className={active ? "pharosville-fleet-focus__option pharosville-fleet-focus__option--active" : "pharosville-fleet-focus__option"}
              onClick={() => onSelect(active ? null : option.value)}
            >
              <span>{option.label}</span>
              <span aria-hidden="true">{option.count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function visibleChainOptions(
  options: readonly FleetFocusOption<string>[],
  selectedChain: string | null,
  limit: number,
  showAll: boolean,
): readonly FleetFocusOption<string>[] {
  if (showAll || options.length <= limit) return options;
  const visible = options.slice(0, Math.max(1, limit));
  if (!selectedChain || visible.some((option) => option.value === selectedChain)) return visible;
  const selected = options.find((option) => option.value === selectedChain);
  return selected ? [...visible, selected] : visible;
}
