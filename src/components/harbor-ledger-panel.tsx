"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
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
  world: PharosVilleWorld;
  riskTransitionByShipId?: ReadonlyMap<string, ShipRiskTransitionEntry | null>;
}

const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/**
 * The ledger, made visible. PRODUCT.md promises a visitor can inspect the
 * underlying facts; until this panel existed that promise was kept only for
 * assistive technology. The body is the same `AccessibilityLedger` the sr-only
 * path renders — the caller mounts one or the other, never both, so the words
 * cannot drift and the region landmark is never announced twice.
 */
export function HarborLedgerPanel({ almanacEntries, onClose, riskTransitionByShipId, world }: HarborLedgerPanelProps) {
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

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
      id="pharosville-harbor-ledger-panel"
      className="pharosville-changelog-panel pharosville-harbor-ledger-panel"
      aria-labelledby={ACCESSIBILITY_LEDGER_HEADING_ID}
      aria-modal="true"
      data-testid="pharosville-harbor-ledger-panel"
      onKeyDown={handleDialogKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <header className="pharosville-changelog-panel__header pharosville-harbor-ledger-panel__header">
        <p className="pharosville-changelog-panel__eyebrow">Every reading, and where it came from</p>
        <button
          ref={closeButtonRef}
          className="pharosville-changelog-panel__close"
          type="button"
          aria-label="Close harbor ledger"
          onClick={onClose}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      {/* The ledger is prose — no links, no controls, nothing the browser makes
          a tab stop — so the scrolling body has to be one itself. Without it a
          keyboard reader lands on the close button, Tab returns them to it, and
          the panel built to make the ledger inspectable shows them one
          screenful of it. Named as its own region so the tab stop announces
          what it is rather than arriving as an unlabelled group. */}
      <div
        className="pharosville-harbor-ledger-panel__body"
        aria-label="Harbor ledger contents"
        role="region"
        tabIndex={0}
      >
        <AccessibilityLedger
          {...(almanacEntries ? { almanacEntries } : {})}
          presentation="visible"
          title="Harbor ledger"
          world={world}
          {...(riskTransitionByShipId ? { riskTransitionByShipId } : {})}
        />
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
