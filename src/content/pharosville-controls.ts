export type PharosVilleControlGroupId = "inspect" | "camera" | "time" | "panels";

export type PharosVilleControlInputKind =
  | "field"
  | "footer"
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
        summary: "Returns the camera to the default harbor view. The control sits with the world controls, bottom right; it brightens on hover or keyboard focus.",
        inputs: [{ kind: "toolbar", label: "Reset view control" }],
      },
      {
        id: "reveal-world-controls",
        label: "Reveal the world controls",
        summary: "The three world controls idle faint, bottom right. They come up to full after any camera input, on hover, and whenever one of them takes keyboard focus.",
        inputs: [
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
        id: "toggle-day-night",
        label: "Switch day or night",
        summary: "Switches between the day and night presentation, and clears any hour carried in the link.",
        inputs: [{ kind: "toolbar", label: "Day-night control" }],
      },
      {
        id: "share-session-hour",
        label: "Set an exact hour",
        summary: "A shared link carries its own hour: add t= to the address (for example #t=18.5 for half past six in the evening) and the view opens at that light.",
        inputs: [{ kind: "field", label: "t= in the page address" }],
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
        label: "Open legend",
        summary: "Reopens the visual legend from the footer.",
        inputs: [{ kind: "footer", label: "Legend button" }],
      },
      {
        id: "open-changelog",
        label: "Open changelog",
        summary: "Reopens the commit-collected changelog from the footer.",
        inputs: [{ kind: "footer", label: "Changelog button" }],
      },
      {
        id: "close-reference-panel",
        label: "Close open reference panel",
        summary: "Closes an open legend or changelog panel.",
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
