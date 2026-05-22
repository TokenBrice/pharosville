"use client";

import { useEffect, useRef } from "react";
import X from "lucide-react/dist/esm/icons/x";
import type { DetailModel } from "../systems/world-types";
import { buildDetailFactSections, compactCurrency, detailFactValue, type DetailDisplayRow } from "../lib/format-detail";

export interface DetailPanelProps {
  detail: DetailModel;
  headingId?: string;
  panelId?: string;
  onClose?: () => void;
}

type SectionId = "identity" | "position";

export function DetailPanel({
  detail,
  headingId = "pharosville-detail-panel-title",
  panelId = "pharosville-detail-panel",
  onClose,
}: DetailPanelProps) {
  const sections = buildDetailFactSections(detail.facts);
  const heritage = detailFactValue(detail.facts, "culturalSignificance");
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // Move focus to close button on mount; restore to the previously focused
  // element on unmount. If that element is no longer in the DOM, fall back
  // to the canvas shell so keyboard users land somewhere predictable.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeButtonRef.current?.focus();
    return () => {
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
        return;
      }
      const fallback = document.querySelector<HTMLElement>('[data-testid="pharosville-world"]');
      fallback?.focus();
    };
  }, []);

  return (
    <aside
      id={panelId}
      className="pharosville-detail-panel"
      aria-labelledby={headingId}
      data-testid="pharosville-detail-panel"
    >
      <span className="pv-corner-brass pv-corner-brass--tl" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--tr" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--bl" aria-hidden="true" />
      <span className="pv-corner-brass pv-corner-brass--br" aria-hidden="true" />
      <div className="pharosville-detail-panel__inner">
        <header className="pharosville-detail-panel__header">
          <p className="pharosville-detail-panel__kind">{detail.kind}</p>
          <h2 id={headingId}>{detail.title}</h2>
          {heritage && <p className="pharosville-detail-panel__heritage">{heritage}</p>}
          <p>{detail.summary}</p>
        </header>

        {renderSection("identity", "Identity", sections.identity)}
        {renderSection("position", "Position", sections.position)}

        {detail.members && detail.members.length > 0 && (
          <section
            className="pharosville-detail-panel__section pharosville-detail-panel__section--members"
            aria-label={detail.membersHeading ?? "Members"}
          >
            <h3 className="pv-section-title">{detail.membersHeading ?? "Members"}</h3>
            <ol className="pv-formation-list">
              {detail.members.map((member) => (
                <li key={member.id}>
                  <a href={member.href}>{member.label}</a>
                  {member.value ? <small>{compactCurrency(member.value)}</small> : null}
                </li>
              ))}
            </ol>
          </section>
        )}

        {detail.links.length > 0 && (
          <nav
            className="pharosville-detail-panel__section pharosville-detail-panel__section--links"
            aria-label={`${detail.title} links`}
          >
            <h3 className="pv-section-title">Links</h3>
            <ul className="pv-formation-list">
              {detail.links.map((link) => (
                <li key={link.href}>
                  <a
                    className="pv-panel-link"
                    href={link.href}
                    {...(link.target === "_blank"
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                  >
                    {link.label} →
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {onClose && (
          <div className="pharosville-detail-panel__close-wrap">
            <button
              ref={closeButtonRef}
              className="pharosville-detail-panel__close pv-panel-link"
              type="button"
              onClick={onClose}
            >
              <X size={14} aria-hidden="true" /> Close details
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function renderSection(id: SectionId, title: string, rows: DetailDisplayRow[]) {
  if (rows.length === 0) return null;
  return (
    <section
      key={id}
      className={`pharosville-detail-panel__section pharosville-detail-panel__section--${id}`}
      aria-label={title}
    >
      <h3 className="pv-section-title">{title}</h3>
      <dl>
        {rows.map((row) => (
          <div key={row.key} className="pv-fact-row">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
