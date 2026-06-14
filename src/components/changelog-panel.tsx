"use client";

import { useCallback, useEffect, useRef, type KeyboardEvent } from "react";
import X from "lucide-react/dist/esm/icons/x";
import { PHAROSVILLE_CHANGELOG } from "../content/pharosville-changelog";

export interface ChangelogPanelProps {
  onClose: () => void;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const DIALOG_FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function ChangelogPanel({ onClose }: ChangelogPanelProps) {
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
      id="pharosville-changelog-panel"
      className="pharosville-changelog-panel"
      aria-labelledby="pharosville-changelog-title"
      aria-modal="true"
      data-testid="pharosville-changelog-panel"
      onKeyDown={handleDialogKeyDown}
      role="dialog"
      tabIndex={-1}
    >
      <header className="pharosville-changelog-panel__header">
        <div>
          <p className="pharosville-changelog-panel__eyebrow">Collected from commits</p>
          <h2 id="pharosville-changelog-title">Changelog</h2>
        </div>
        <button
          ref={closeButtonRef}
          className="pharosville-changelog-panel__close"
          type="button"
          aria-label="Close changelog"
          onClick={onClose}
        >
          <X aria-hidden="true" size={16} />
        </button>
      </header>
      <ol className="pharosville-changelog-panel__entries">
        {PHAROSVILLE_CHANGELOG.map((entry) => (
          <li key={entry.id} className="pharosville-changelog-entry">
            <div className="pharosville-changelog-entry__mast">
              <div className="pharosville-changelog-entry__meta">
                <span className="pharosville-changelog-entry__version">{entry.version}</span>
                <time dateTime={entry.date}>{dateFormatter.format(new Date(`${entry.date}T00:00:00Z`))}</time>
              </div>
              <h3>{entry.title}</h3>
            </div>
            <p className="pharosville-changelog-entry__summary">{entry.summary}</p>
            <ul>
              {entry.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
            <p className="pharosville-changelog-entry__source">{entry.source}</p>
          </li>
        ))}
      </ol>
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
