// Renderer visual configuration tables. Extracted from `layers/terrain.ts`
// and `layers/graves.ts` so art-driven tuning lives apart from rendering
// logic. See agents/health-checkup-2026-05-04/04-maintainability.md (F5).

import type { PharosVilleWorld } from "../systems/world-types";

type WreckMarker = PharosVilleWorld["graves"][number]["visual"]["marker"];

export const TILE_COLORS: Record<string, string> = {
  beach: "#dcb978",
  cliff: "#5c5240",
  grass: "#d8c8a8",
  hill: "#9c8a6c",
  land: "#d8c8a8",
  shore: "#dcb978",
};

export const TERRAIN_TEXTURE = {
  beachPebble: "rgba(82, 67, 47, 0.12)",
  cliffFace: "rgba(92, 80, 60, 0.42)",
  foam: "rgba(232, 243, 233, 0.56)",
  groundGrain: "rgba(64, 56, 40, 0.14)",
  sandLight: "rgba(240, 216, 160, 0.22)",
} as const;

// Logo plaque vertical offset above the wreck silhouette, in coordinate-space units.
export const WRECK_LOGO_OFFSET: Record<WreckMarker, number> = {
  "broken-keel": 11,
  "sinking-stern": 13,
  grounded: 14,
  shattered: 11,
  skeletal: 10,
};
