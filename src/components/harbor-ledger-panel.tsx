"use client";

import { useModalDialog } from "../hooks/use-modal-dialog";
import X from "lucide-react/dist/esm/icons/x";
import {
  AccessibilityLedger,
  ACCESSIBILITY_LEDGER_HEADING_ID,
  type ShipRiskTransitionEntry,
} from "./accessibility-ledger";
import type { PharosVilleWorld } from "../systems/world-types";
import type { GardenAlmanacLogEntry } from "../systems/garden-almanac";

export interface HarborLedgerPanelProps {
  almanacEntries?: readonly GardenAlmanacLogEntry[];
  onClose: () => void;
  onSelectDetail?: (detailId: string) => void;
  world: PharosVilleWorld;
  riskTransitionByShipId?: ReadonlyMap<string, ShipRiskTransitionEntry | null>;
}



/**
 * The ledger, made visible. PRODUCT.md promises a visitor can inspect the
 * underlying facts; until this panel existed that promise was kept only for
 * assistive technology. The body is the same `AccessibilityLedger` the sr-only
 * path renders — the caller mounts one or the other, never both, so the words
 * cannot drift and the region landmark is never announced twice.
 */
export function HarborLedgerPanel({ almanacEntries, onClose, onSelectDetail, riskTransitionByShipId, world }: HarborLedgerPanelProps) {
  const panelRef = useModalDialog();


  return (
    <dialog
      ref={panelRef}
      id="pharosville-harbor-ledger-panel"
      className="pharosville-changelog-panel pharosville-harbor-ledger-panel"
      aria-labelledby={ACCESSIBILITY_LEDGER_HEADING_ID}
      aria-modal="true"
      data-testid="pharosville-harbor-ledger-panel"
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      tabIndex={-1}
    >
      <header className="pharosville-changelog-panel__header pharosville-harbor-ledger-panel__header">
        <p className="pharosville-changelog-panel__eyebrow">Every reading, and where it came from</p>
        <button
          className="pharosville-changelog-panel__close"
          type="button"
          aria-label="Close harbor ledger"
          onClick={onClose}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      {/* Keep a scrollable region alongside the native record disclosures. */}
      <div
        className="pharosville-harbor-ledger-panel__body"
        aria-label="Harbor ledger contents"
        role="region"
        tabIndex={0}
      >
        <AccessibilityLedger
          {...(almanacEntries ? { almanacEntries } : {})}
          {...(onSelectDetail ? { onSelectDetail: (id: string) => { onClose(); onSelectDetail(id); } } : {})}
          presentation="visible"
          title="Harbor ledger"
          world={world}
          {...(riskTransitionByShipId ? { riskTransitionByShipId } : {})}
        />
      </div>
    </dialog>
  );
}
