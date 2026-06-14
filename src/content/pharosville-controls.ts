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
    description: "Move between map targets and open detail panels without sending typed input to the canvas.",
    actions: [
      {
        id: "focus-next-target",
        label: "Focus next map target",
        summary: "Cycles the canvas focus beacon through visible ships, docks, areas, and landmarks.",
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
      {
        id: "find-ship",
        label: "Find a ship",
        summary: "Type a stablecoin name or id, then choose a match to select and follow that ship.",
        inputs: [
          { kind: "field", label: "Find a ship field" },
          { kind: "keyboard", label: "Arrow keys and Enter", tokens: ["Arrow keys", "Enter"] },
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
        label: "Reset view",
        summary: "Recenters the camera on the default harbor view.",
        inputs: [
          { kind: "toolbar", label: "Reset view button" },
          { kind: "toolbar", label: "Recenter map button" },
        ],
      },
      {
        id: "follow-selected",
        label: "Follow selected",
        summary: "Moves the camera to the selected detail, and follows selected ships while they sail.",
        inputs: [{ kind: "toolbar", label: "Follow selected button" }],
      },
      {
        id: "fullscreen",
        label: "Fullscreen",
        summary: "Toggles the world shell into fullscreen. Escape exits fullscreen before clearing selection.",
        inputs: [
          { kind: "toolbar", label: "Enter or exit fullscreen button" },
          { kind: "keyboard", label: "Escape while fullscreen", tokens: ["Escape"] },
        ],
      },
    ],
  },
  {
    id: "time",
    title: "Time",
    description: "Control the session lighting without changing live data.",
    actions: [
      {
        id: "set-session-hour",
        label: "Set session hour",
        summary: "Scrubs the local day-night hour for this view.",
        inputs: [{ kind: "toolbar", label: "Time slider" }],
      },
      {
        id: "return-to-preset",
        label: "Return to day-night preset",
        summary: "Clears the manual hour override and returns to the active day-night preset.",
        inputs: [{ kind: "toolbar", label: "Return to day-night preset button" }],
      },
      {
        id: "toggle-day-night",
        label: "Switch day or night",
        summary: "Switches between the day and night presentation.",
        inputs: [{ kind: "toolbar", label: "Day-night button" }],
      },
      {
        id: "toggle-auto-cycle",
        label: "Auto day-night cycle",
        summary: "Turns the automatic local day-night cycle on or off.",
        inputs: [{ kind: "toolbar", label: "Auto day-night button" }],
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
