export type PharosVilleControlGroupId = "inspect" | "camera" | "time" | "panels";

export type PharosVilleControlInputKind =
  | "field"
  | "keyboard"
  | "mouse"
  | "panel"
  | "toolbar";

export interface PharosVilleControlInput {
  kind: PharosVilleControlInputKind;
  label: string;
  tokens?: readonly string[];
}

export interface PharosVilleControlAction {
  id: string;
  label: string;
  summary: string;
  inputs: readonly PharosVilleControlInput[];
}

export interface PharosVilleControlGroup {
  id: PharosVilleControlGroupId;
  title: string;
  description: string;
  actions: readonly PharosVilleControlAction[];
}

export const PHAROSVILLE_CONTROLS_TITLE = "World Controls Cheatsheet";

export const PHAROSVILLE_CONTROLS_INTRO =
  "Use these controls to inspect the harbor, move the camera, tune time of day, and reopen reference panels.";

export const PHAROSVILLE_CONTROL_GROUPS: readonly PharosVilleControlGroup[] = [
  {
    id: "inspect",
    title: "Inspect",
    description: "Move between map targets and open their detail panels.",
    actions: [
      {
        id: "focus-next-target",
        label: "Focus next map target",
        summary: "Cycles the canvas focus beacon through visible ships, docks, areas, and landmarks; past the last target, Tab continues into the page controls.",
        inputs: [{ kind: "keyboard", label: "Tab", tokens: ["Tab"] }],
      },
      {
        id: "focus-previous-target",
        label: "Focus previous map target",
        summary: "Cycles backward through the same target order.",
        inputs: [{ kind: "keyboard", label: "Shift + Tab", tokens: ["Shift", "Tab"] }],
      },
      {
        id: "select-focused-target",
        label: "Select focused target",
        summary: "Opens the detail panel for the focused map target.",
        inputs: [{ kind: "keyboard", label: "Enter", tokens: ["Enter"] }],
      },
      {
        id: "quick-find",
        label: "Find a ship or harbor by name",
        summary: "Opens a search field, top left. Type a ticker or name, use the arrow keys to move through matches, and press Enter to select one and centre the view on it.",
        inputs: [
          { kind: "keyboard", label: "/", tokens: ["/"] },
          { kind: "toolbar", label: "find" },
        ],
      },
      {
        id: "select-pointer-target",
        label: "Select target with the mouse",
        summary: "Click a ship, dock, water area, landmark, or grave to open its detail panel.",
        inputs: [{ kind: "mouse", label: "Click map target" }],
      },
      {
        id: "clear-selection",
        label: "Clear selected detail",
        summary: "Closes the current detail panel and returns focus to the world shell when available.",
        inputs: [
          { kind: "keyboard", label: "Escape", tokens: ["Escape"] },
          { kind: "panel", label: "Close details button" },
        ],
      },
    ],
  },
  {
    id: "camera",
    title: "Camera",
    description: "Move around the isometric harbor and keep the view on the area you care about.",
    actions: [
      {
        id: "pan-map",
        label: "Pan the map",
        summary: "Drag the canvas, or use arrow keys. Hold Shift with an arrow key for a larger step.",
        inputs: [
          { kind: "mouse", label: "Drag canvas" },
          { kind: "keyboard", label: "Arrow keys", tokens: ["Arrow keys"] },
          { kind: "keyboard", label: "Shift + Arrow keys", tokens: ["Shift", "Arrow keys"] },
        ],
      },
      {
        id: "zoom-map",
        label: "Zoom the map",
        summary: "Zoom from the pointer position with the mouse wheel, or use keyboard zoom shortcuts.",
        inputs: [
          { kind: "mouse", label: "Mouse wheel" },
          { kind: "keyboard", label: "Zoom in", tokens: ["+", "="] },
          { kind: "keyboard", label: "Zoom out", tokens: ["-", "_"] },
        ],
      },
      {
        id: "reset-view",
        label: "Recenter the view",
        summary: "Returns the camera to the resting harbor view. The circular-arrow glyph sits in the row behind explore, bottom right.",
        inputs: [{ kind: "toolbar", label: "Reset view control" }],
      },
      {
        id: "reveal-world-controls",
        label: "Reveal the world controls",
        summary: "One word, explore, rests bottom right beside its / key. It unfolds a row of words — find, legend, ledger, stay — and three hairline glyphs: reset, observe and light. The row also comes up after any camera input, on hover, and whenever one of its controls takes keyboard focus.",
        inputs: [
          { kind: "toolbar", label: "explore" },
          { kind: "keyboard", label: "Tab to a control", tokens: ["Tab"] },
          { kind: "mouse", label: "Hover the bottom-right controls" },
        ],
      },
    ],
  },
  {
    id: "time",
    title: "Time",
    description: "Choose the session lighting without changing live data.",
    actions: [
      {
        id: "set-time-of-day",
        label: "Choose the light",
        summary: "The sun or moon glyph opens the light drawer: set a time of day, return to local time, or hold the world still.",
        inputs: [{ kind: "toolbar", label: "Light and motion drawer" }],
      },
      {
        id: "toggle-day-night",
        label: "Switch day or night",
        summary: "Switches between the day and night presentation, and clears any hour carried in the link.",
        inputs: [{ kind: "toolbar", label: "Night preset in the light drawer" }],
      },
      {
        id: "nudge-session-hour",
        label: "Shift the time of day",
        summary: "Steps the light half an hour earlier or later, starting from whatever the sky is showing. It stops at the ends of the day rather than wrapping around. The hour travels in the link, so a view you share opens at the light you left it at.",
        inputs: [
          { kind: "keyboard", label: "Half an hour earlier", tokens: ["["] },
          { kind: "keyboard", label: "Half an hour later", tokens: ["]"] },
        ],
      },
      {
        id: "stay",
        label: "Stay",
        summary: "Leaves the harbour open as a window: full screen where the browser allows, the screen kept awake, the controls and then the cursor fading, and the view held at its resting shot. The caption returns when something happens and when the hour strikes. Escape or a click leaves.",
        inputs: [
          { kind: "toolbar", label: "stay" },
          { kind: "keyboard", label: "Leave Stay", tokens: ["Escape"] },
        ],
      },
    ],
  },
  {
    id: "panels",
    title: "Panels",
    description: "Reopen reference panels and close them without disturbing the world state.",
    actions: [
      {
        id: "open-legend",
        label: "Open the field guide",
        summary: "The legend word behind explore opens a short field guide to the sails, the water and the lighthouse.",
        inputs: [{ kind: "toolbar", label: "legend" }],
      },
      {
        id: "open-ledger",
        label: "Open the harbor ledger",
        summary: "The ledger word opens every reading and its source, the session's harbor log of risk-band changes and sightings, and any change since your last visit.",
        inputs: [{ kind: "toolbar", label: "ledger" }],
      },
      {
        id: "open-changelog",
        label: "Open changelog",
        summary: "Opens the commit-collected changelog from the foot of the field guide.",
        inputs: [{ kind: "panel", label: "Changelog button in the field guide" }],
      },
      {
        id: "close-reference-panel",
        label: "Close open reference panel",
        summary: "Closes the open field guide, ledger or changelog.",
        inputs: [
          { kind: "keyboard", label: "Escape", tokens: ["Escape"] },
          { kind: "panel", label: "Panel close button" },
        ],
      },
    ],
  },
] as const;

export const PHAROSVILLE_CONTROL_ACTIONS: readonly PharosVilleControlAction[] = PHAROSVILLE_CONTROL_GROUPS.flatMap(
  (group) => [...group.actions],
);
