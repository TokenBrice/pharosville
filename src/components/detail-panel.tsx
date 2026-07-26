"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link2 from "lucide-react/dist/esm/icons/link-2";
import { buildShareableWorldUrlHref } from "../hooks/use-world-url-state";
import type { DetailModel } from "../systems/world-types";
import {
  buildDetailFactSections,
  buildDetailReadingLine,
  compactCurrency,
  detailFactValue,
  type DetailDisplayRow,
} from "../lib/format-detail";

export interface DetailPanelProps {
  detail: DetailModel;
  headingId?: string;
  onSelectDetail?: (detailId: string) => void;
  panelId?: string;
  onClose?: () => void;
  setAnnouncement?: (message: string) => void;
}

type SectionId = "identity" | "position";
type DetailMember = NonNullable<DetailModel["members"]>[number];
type DetailLink = DetailModel["links"][number];

/**
 * Whether the record disclosure is open, remembered for the session so someone
 * reading the figures keeps them as they move from ship to ship, and a fresh
 * tab still opens calm (interface revamp DU13). Module state, not storage.
 */
let recordOpenForSession = false;

const COPY_FEEDBACK_MS = 2500;

export function DetailPanel({
  detail,
  headingId = "pharosville-detail-panel-title",
  onSelectDetail,
  panelId = "pharosville-detail-panel",
  onClose,
  setAnnouncement,
}: DetailPanelProps) {
  const sections = buildDetailFactSections(detail.facts);
  const heritage = detailFactValue(detail.facts, "culturalSignificance");
  const readingLine = buildDetailReadingLine(detail.kind, detail.facts);
  const [primaryLink, ...secondaryLinks] = detail.links;
  const hasRecord = sections.identity.length > 0
    || sections.position.length > 0
    || (detail.members?.length ?? 0) > 0
    || secondaryLinks.length > 0;
  const [recordOpen, setRecordOpen] = useState(recordOpenForSession);
  const handleRecordToggle = useCallback((event: React.SyntheticEvent<HTMLDetailsElement>) => {
    recordOpenForSession = event.currentTarget.open;
    setRecordOpen(recordOpenForSession);
  }, []);
  const panelRef = useRef<HTMLElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);

  // The address bar carries sel/cam/t/n in the fragment, which never reaches a
  // server — so copying it verbatim would unfurl as the generic card wherever
  // it was pasted. The shared form moves the same params to the query string,
  // which functions/index.ts reads to name the ship in the preview.
  // The label swap is for people who cannot hear the live region.
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyTimerRef = useRef<number | null>(null);
  const handleCopyLink = useCallback(async () => {
    let message = "Link copied";
    try {
      await navigator.clipboard.writeText(buildShareableWorldUrlHref(window.location.href));
    } catch {
      message = "Could not copy link";
    }
    setAnnouncement?.(message);
    setCopyFeedback(message);
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyFeedback(null), COPY_FEEDBACK_MS);
  }, [setAnnouncement]);
  useEffect(() => () => {
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
  }, []);

  // Move focus to close button on mount; restore to the previously focused
  // element on unmount. If that element is no longer in the DOM, fall back
  // to the canvas shell so keyboard users land somewhere predictable.
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    focusWithoutScroll(closeButtonRef.current ?? panelRef.current);
    return () => {
      restoreDialogFocus(previouslyFocused);
    };
  }, []);


  return (
    <aside
      ref={panelRef}
      id={panelId}
      className="pharosville-detail-panel"
      aria-labelledby={headingId}
      data-testid="pharosville-detail-panel"
      role="complementary"
      tabIndex={-1}
    >
      <div className="pharosville-detail-panel__inner">
        <header className="pharosville-detail-panel__header">
          <p className="pharosville-detail-panel__kind">{detail.kind}</p>
          <h2 id={headingId}>{detail.title}</h2>
          {detail.status && (
            <p className="pharosville-detail-panel__zone" data-testid="pharosville-detail-zone">
              <span
                className="pharosville-detail-panel__zone-swatch"
                style={{ backgroundColor: detail.status.swatchColor }}
                aria-hidden="true"
              />
              {detail.status.label}
            </p>
          )}
        </header>

        <div className="pharosville-detail-panel__prose">
          {/* Heritage and placement read as one thought — what this hull is,
              then what it is doing here — rather than stacked fragments. */}
          <p>
            {heritage && (
              <span className="pharosville-detail-panel__heritage">{heritage} </span>
            )}
            {detail.summary}
          </p>
          {detail.paragraphs?.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>

        {readingLine && (
          <p className="pharosville-detail-panel__reading" data-testid="pharosville-detail-reading">
            {readingLine}
          </p>
        )}

        <div className="pharosville-detail-panel__foot">
          {hasRecord && (
            <details
              className="pharosville-detail-panel__record"
              data-testid="pharosville-detail-record"
              open={recordOpen}
              onToggle={handleRecordToggle}
            >
              <summary>Read the record</summary>

              {renderSection("identity", "Identity", sections.identity)}
              {renderSection("position", "Position", sections.position)}

              {detail.members && detail.members.length > 0 && (
                <section
                  className="pharosville-detail-panel__section pharosville-detail-panel__section--members"
                  aria-label={detail.membersHeading ?? "Members"}
                >
                  <h3 className="pv-section-title">{detail.membersHeading ?? "Members"}</h3>
                  <ol className="pv-formation-list">
                    {detail.members.map((member) => renderMember(member, onSelectDetail))}
                  </ol>
                </section>
              )}

              {secondaryLinks.length > 0 && (
                <nav
                  className="pharosville-detail-panel__section pharosville-detail-panel__section--links"
                  aria-label={`${detail.title} links`}
                >
                  <h3 className="pv-section-title">Links</h3>
                  <ul className="pv-formation-list">
                    {secondaryLinks.map((link) => renderLink(link, onSelectDetail))}
                  </ul>
                </nav>
              )}
            </details>
          )}

          {primaryLink && (
            <p className="pharosville-detail-panel__primary-link">
              {renderPrimaryLink(primaryLink, onSelectDetail)}
            </p>
          )}
        </div>

        <div className="pharosville-detail-panel__close-wrap">
          <button
            className="pharosville-detail-panel__copy"
            type="button"
            data-testid="pharosville-detail-copy-link"
            onClick={handleCopyLink}
          >
            <Link2 size={13} aria-hidden="true" />
            {copyFeedback ?? "Copy link"}
          </button>
          {onClose && (
            <button
              ref={closeButtonRef}
              className="pharosville-detail-panel__close"
              type="button"
              aria-label="Close details"
              onClick={onClose}
            >
              Close
            </button>
          )}
        </div>
      </div>
    </aside>
  );
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

function renderMember(member: DetailMember, onSelectDetail?: (detailId: string) => void) {
  if (member.inWorldDetailId && onSelectDetail) {
    const detailId = member.inWorldDetailId;
    return (
      <li key={member.id}>
        <button
          className="pv-panel-link"
          type="button"
          aria-label={`Select ${member.label} in PharosVille`}
          onClick={() => onSelectDetail(detailId)}
        >
          {member.label}
        </button>
        <a
          className="pv-panel-link"
          href={member.href}
          aria-label={`Open ${member.label} page`}
        >
          Open page →
        </a>
        {member.value ? <small>{compactCurrency(member.value)}</small> : null}
      </li>
    );
  }
  return (
    <li key={member.id}>
      <a href={member.href}>{member.label}</a>
      {member.value ? <small>{compactCurrency(member.value)}</small> : null}
    </li>
  );
}

/**
 * The one link that stays on the first screen. In-world links keep both
 * affordances — select it here, or open its page — because the pair is how the
 * dock and squad panels hand off to the analytical site.
 */
function renderPrimaryLink(link: DetailLink, onSelectDetail?: (detailId: string) => void) {
  if (link.inWorldDetailId && onSelectDetail) {
    const detailId = link.inWorldDetailId;
    return (
      <>
        <button
          className="pv-panel-link"
          type="button"
          aria-label={`Select ${link.label} in PharosVille`}
          onClick={() => onSelectDetail(detailId)}
        >
          {link.label}
        </button>
        <a
          className="pv-panel-link"
          href={link.href}
          aria-label={`Open ${link.label} page`}
          {...externalLinkAttrs(link)}
        >
          Open page →
        </a>
      </>
    );
  }
  return (
    <a className="pv-panel-link" href={link.href} {...externalLinkAttrs(link)}>
      {link.label} →
    </a>
  );
}

function renderLink(link: DetailLink, onSelectDetail?: (detailId: string) => void) {
  if (link.inWorldDetailId && onSelectDetail) {
    const detailId = link.inWorldDetailId;
    return (
      <li key={link.href}>
        <button
          className="pv-panel-link"
          type="button"
          aria-label={`Select ${link.label} in PharosVille`}
          onClick={() => onSelectDetail(detailId)}
        >
          {link.label}
        </button>
        <a
          className="pv-panel-link"
          href={link.href}
          aria-label={`Open ${link.label} page`}
          {...externalLinkAttrs(link)}
        >
          Open page →
        </a>
      </li>
    );
  }
  return (
    <li key={link.href}>
      <a
        className="pv-panel-link"
        href={link.href}
        {...externalLinkAttrs(link)}
      >
        {link.label} →
      </a>
    </li>
  );
}

function externalLinkAttrs(link: DetailLink) {
  return link.target === "_blank"
    ? { target: "_blank", rel: "noopener noreferrer" }
    : {};
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
