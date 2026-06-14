"use client";

import {
  PHAROSVILLE_CONTROL_GROUPS,
  PHAROSVILLE_CONTROLS_INTRO,
  PHAROSVILLE_CONTROLS_TITLE,
  type PharosVilleControlAction,
  type PharosVilleControlGroup,
  type PharosVilleControlInput,
} from "../content/pharosville-controls";

export interface ControlsCheatsheetProps {
  className?: string;
  controls?: readonly PharosVilleControlGroup[];
  headingId?: string;
  intro?: string;
  title?: string;
}

export function ControlsCheatsheet({
  className,
  controls = PHAROSVILLE_CONTROL_GROUPS,
  headingId = "pharosville-controls-cheatsheet-title",
  intro = PHAROSVILLE_CONTROLS_INTRO,
  title = PHAROSVILLE_CONTROLS_TITLE,
}: ControlsCheatsheetProps) {
  const introId = `${headingId}-intro`;
  const rootClassName = [
    "pharosville-controls-cheatsheet",
    className,
  ].filter(Boolean).join(" ");

  return (
    <section
      className={rootClassName}
      aria-labelledby={headingId}
      aria-describedby={introId}
      data-testid="pharosville-controls-cheatsheet"
    >
      <h2 id={headingId} className="sr-only">{title}</h2>
      <p id={introId} className="pharosville-legend-panel__intro">{intro}</p>
      {controls.map((group) => (
        <section key={group.id} aria-labelledby={`${headingId}-${group.id}`}>
          <h3 id={`${headingId}-${group.id}`}>{group.title}</h3>
          <p>{group.description}</p>
          <dl>
            {group.actions.map((action) => renderAction(action))}
          </dl>
        </section>
      ))}
    </section>
  );
}

function renderAction(action: PharosVilleControlAction) {
  return (
    <div key={action.id} className="pharosville-controls-cheatsheet__action">
      <dt>{action.label}</dt>
      <dd>
        <p>{action.summary}</p>
        <ul aria-label={`${action.label} inputs`}>
          {action.inputs.map((input, index) => renderInput(input, `${action.id}-${index}`))}
        </ul>
      </dd>
    </div>
  );
}

function renderInput(input: PharosVilleControlInput, key: string) {
  return (
    <li key={key}>
      <span>{input.kind}: </span>
      {input.tokens ? (
        <span aria-label={input.label}>
          {input.tokens.map((token, index) => (
            <span key={`${token}-${index}`}>
              {index > 0 ? " + " : ""}
              <kbd>{token}</kbd>
            </span>
          ))}
        </span>
      ) : (
        <span>{input.label}</span>
      )}
    </li>
  );
}
