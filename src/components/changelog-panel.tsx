"use client";

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

export function ChangelogPanel({ onClose }: ChangelogPanelProps) {
  return (
    <aside
      id="pharosville-changelog-panel"
      className="pharosville-changelog-panel"
      aria-labelledby="pharosville-changelog-title"
      data-testid="pharosville-changelog-panel"
      role="dialog"
    >
      <header className="pharosville-changelog-panel__header">
        <div>
          <p className="pharosville-changelog-panel__eyebrow">Collected from commits</p>
          <h2 id="pharosville-changelog-title">Changelog</h2>
        </div>
        <button
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
