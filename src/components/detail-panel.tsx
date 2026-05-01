"use client";

import type { DetailModel } from "../systems/world-types";
import { compactCurrency, composeCurrently } from "../lib/format-detail";

export interface DetailPanelProps {
  detail: DetailModel;
  headingId?: string;
  panelId?: string;
  onClose?: () => void;
}

type SectionId = "identity" | "position";

interface DisplayRow {
  key: string;
  label: string;
  value: string;
}

interface Sections {
  identity: DisplayRow[];
  position: DisplayRow[];
}

const KNOWN_LABELS = {
  shipClass: /^ship\s*class$/i,
  sizeTier: /^size\s*tier$/i,
  marketCap: /^market\s*cap$/i,
  homeDock: /^home\s*dock$/i,
  representativePosition: /^representative\s*position$/i,
  riskWaterArea: /^risk\s*water\s*area$/i,
  riskWaterZone: /^risk\s*water\s*zone$/i,
  chainsPresent: /^chains?\s*present$/i,
  sailingInFormation: /^sailing\s*in\s*formation$/i,
} as const satisfies Record<string, RegExp>;

type LabelKey = keyof typeof KNOWN_LABELS;

function classifyLabel(label: string): LabelKey | null {
  for (const [key, pattern] of Object.entries(KNOWN_LABELS) as [LabelKey, RegExp][]) {
    if (pattern.test(label.trim())) return key;
  }
  return null;
}

function buildSections(facts: DetailModel["facts"]): Sections {
  const lookup = new Map<LabelKey, string>();
  const unknown: string[] = [];
  for (const fact of facts) {
    const key = classifyLabel(fact.label);
    if (key) {
      lookup.set(key, fact.value);
    } else {
      unknown.push(fact.label);
    }
  }

  // Dev-mode warning: surface unmatched labels so allowlist drift is visible
  // during development. Spec: 2026-05-01-old-school-ui-design.md "Migration / risk".
  if (import.meta.env.DEV && unknown.length > 0) {
    // eslint-disable-next-line no-console
    console.warn("[DetailPanel] dropped unmatched fact labels:", unknown);
  }

  const identity: DisplayRow[] = [];
  const tier = lookup.get("sizeTier");
  const klass = lookup.get("shipClass");
  if (tier || klass) {
    const composed = [tier, klass].filter(Boolean).join(" · ");
    identity.push({ key: "class", label: "Class", value: composed });
  }
  const marketCap = lookup.get("marketCap");
  if (marketCap) identity.push({ key: "marketCap", label: "Market cap", value: compactCurrency(marketCap) });
  const homeDock = lookup.get("homeDock");
  if (homeDock) identity.push({ key: "homeDock", label: "Home dock", value: homeDock });

  const position: DisplayRow[] = [];
  const currently = composeCurrently({
    position: lookup.get("representativePosition"),
    area: lookup.get("riskWaterArea"),
    zone: lookup.get("riskWaterZone"),
  });
  if (currently) position.push({ key: "currently", label: "Currently", value: currently });
  const chains = lookup.get("chainsPresent");
  if (chains) position.push({ key: "chains", label: "Chains", value: chains });
  const formation = lookup.get("sailingInFormation");
  if (formation) position.push({ key: "formation", label: "Sailing in formation", value: formation });

  return { identity, position };
}

export function DetailPanel({
  detail,
  headingId = "pharosville-detail-panel-title",
  panelId = "pharosville-detail-panel",
  onClose,
}: DetailPanelProps) {
  const sections = buildSections(detail.facts);

  return (
    <aside
      id={panelId}
      className="pharosville-detail-panel"
      aria-labelledby={headingId}
      aria-live="polite"
      data-testid="pharosville-detail-panel"
    >
      <div className="pharosville-detail-panel__inner">
        <header className="pharosville-detail-panel__header">
          <p className="pharosville-detail-panel__kind">{detail.kind}</p>
          <h2 id={headingId}>{detail.title}</h2>
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
                  {member.value ? <small>{member.value}</small> : null}
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
                  <a className="pv-panel-link" href={link.href}>
                    {link.label} →
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {onClose && (
          <button className="pharosville-detail-panel__close pv-panel-link" type="button" onClick={onClose}>
            Close details
          </button>
        )}
      </div>
    </aside>
  );
}

function renderSection(id: SectionId, title: string, rows: DisplayRow[]) {
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
