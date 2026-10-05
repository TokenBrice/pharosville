import { GARDEN_SURFACE_RECIPES } from "./garden-surfaces";
import type { DrawOwnerCensus } from "./garden-draw-census";
import type { Object3D } from "three";

export const GARDEN_APPEARANCE_SCHEMA = 1;
export interface GardenAppearance {
  readonly schemaVersion: typeof GARDEN_APPEARANCE_SCHEMA;
  readonly preset: string;
  readonly keyLight: number;
  readonly skyFill: number;
  readonly airBalance: number;
  readonly mossRoughness: number;
  readonly stoneRoughness: number;
  /** Reserved for S1 registration after its profile cutover; empty until then. */
  readonly thresholdProfile: Readonly<Record<string, number>>;
  readonly mossShading: "authored" | "smooth" | "faceted";
  readonly stoneShading: "authored" | "smooth" | "faceted";
}
/** Identity settings preserve the accepted production picture, not a second art recipe. */
export const GARDEN_APPEARANCE_DEFAULTS: GardenAppearance = /*#__PURE__*/ Object.freeze({
  schemaVersion: GARDEN_APPEARANCE_SCHEMA, preset: "accepted",
  keyLight: 1, skyFill: 1, airBalance: 1,
  mossRoughness: GARDEN_SURFACE_RECIPES.moss.roughness,
  stoneRoughness: GARDEN_SURFACE_RECIPES.stone.roughness,
  thresholdProfile: /*#__PURE__*/ Object.freeze({}), mossShading: "authored", stoneShading: "authored",
});
export type GardenAppearanceParameter = Exclude<keyof GardenAppearance, "schemaVersion" | "preset" | "thresholdProfile" | "mossShading" | "stoneShading">;
export type GardenAppearanceUpdate = "uniform-update" | "material-recompile" | "named-part-rebuild";
export const GARDEN_APPEARANCE_PARAMETERS: Readonly<Record<GardenAppearanceParameter, {
  readonly update: GardenAppearanceUpdate; readonly min: number; readonly max: number;
}>> = /*#__PURE__*/ Object.freeze({
  keyLight: /*#__PURE__*/ Object.freeze({ update: "uniform-update", min: 0.5, max: 1.5 }),
  skyFill: /*#__PURE__*/ Object.freeze({ update: "uniform-update", min: 0.5, max: 1.5 }),
  airBalance: /*#__PURE__*/ Object.freeze({ update: "uniform-update", min: 0.5, max: 1.5 }),
  mossRoughness: /*#__PURE__*/ Object.freeze({ update: "uniform-update", min: 0.9, max: 1 }),
  stoneRoughness: /*#__PURE__*/ Object.freeze({ update: "uniform-update", min: 0.8, max: 0.98 }),
});
export const GARDEN_APPEARANCE_CLASSIFICATION = /*#__PURE__*/ Object.freeze({
  ...GARDEN_APPEARANCE_PARAMETERS,
  mossShading: /*#__PURE__*/ Object.freeze({ update: "material-recompile" as const }),
  stoneShading: /*#__PURE__*/ Object.freeze({ update: "material-recompile" as const }),
  thresholdProfile: /*#__PURE__*/ Object.freeze({ update: "named-part-rebuild" as const, owner: "threshold" }),
});
export const GARDEN_APPEARANCE_PRESETS: readonly GardenAppearance[] = /*#__PURE__*/ Object.freeze([
  GARDEN_APPEARANCE_DEFAULTS,
  /*#__PURE__*/ Object.freeze({ ...GARDEN_APPEARANCE_DEFAULTS, preset: "soft-moss", keyLight: 0.94, skyFill: 1.08, airBalance: 0.96, mossRoughness: 0.99, stoneRoughness: 0.92 }),
  /*#__PURE__*/ Object.freeze({ ...GARDEN_APPEARANCE_DEFAULTS, preset: "clear-stone", keyLight: 1.06, skyFill: 0.96, airBalance: 0.92, mossRoughness: 0.95, stoneRoughness: 0.84 }),
]);
export function gardenAppearanceInvalidation(before: GardenAppearance, after: GardenAppearance) {
  const changed = (Object.keys(GARDEN_APPEARANCE_CLASSIFICATION) as (keyof typeof GARDEN_APPEARANCE_CLASSIFICATION)[])
    .filter((key) => key === "thresholdProfile"
      ? JSON.stringify(before.thresholdProfile) !== JSON.stringify(after.thresholdProfile)
      : before[key] !== after[key]);
  return { changed, rebuildParts: changed.includes("thresholdProfile") ? ["threshold"] as const : [] };
}
export function parseGardenAppearance(value: unknown): GardenAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a garden appearance object.");
  const source = value as Record<string, unknown>;
  if (source.schemaVersion !== GARDEN_APPEARANCE_SCHEMA) throw new Error("Stale garden appearance schema; export again from this checkout.");
  if (typeof source.preset !== "string" || !/^[a-z0-9-]{1,64}$/.test(source.preset)) throw new Error("Invalid appearance preset name.");
  const result: Record<string, unknown> = { schemaVersion: GARDEN_APPEARANCE_SCHEMA, preset: source.preset };
  for (const [key, range] of Object.entries(GARDEN_APPEARANCE_PARAMETERS)) {
    const scalar = source[key];
    if (typeof scalar !== "number" || !Number.isFinite(scalar) || scalar < range.min || scalar > range.max) throw new Error(`Invalid appearance parameter: ${key}`);
    result[key] = scalar;
  }
  for (const key of ["mossShading", "stoneShading"] as const) {
    if (!["authored", "smooth", "faceted"].includes(source[key] as string)) throw new Error(`Invalid appearance parameter: ${key}`);
    result[key] = source[key];
  }
  const profile = source.thresholdProfile;
  if (!profile || typeof profile !== "object" || Array.isArray(profile) || Object.keys(profile).length !== 0) {
    throw new Error("Threshold appearance parameters are not registered in this checkout.");
  }
  result.thresholdProfile = Object.freeze({});
  if (Object.keys(source).some((key) => !Object.hasOwn(result, key) && key !== "checksum")) throw new Error("Unknown garden appearance parameter.");
  const appearance = Object.freeze(result) as unknown as GardenAppearance;
  if (source.checksum !== undefined && source.checksum !== gardenAppearanceChecksum(appearance)) throw new Error("Garden appearance checksum mismatch.");
  return appearance;
}
function canonicalAppearance(appearance: GardenAppearance): string {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(appearance).sort()) sorted[key] = appearance[key as keyof GardenAppearance];
  return JSON.stringify(sorted);
}
export function gardenAppearanceChecksum(appearance: GardenAppearance): string {
  const json = canonicalAppearance(appearance);
  let hash = 0x811c9dc5;
  for (let index = 0; index < json.length; index++) hash = Math.imul(hash ^ json.charCodeAt(index), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, "0");
}
export function exportGardenAppearance(appearance: GardenAppearance): string {
  return `${canonicalAppearance({ ...appearance, checksum: gardenAppearanceChecksum(appearance) } as GardenAppearance)}\n`;
}

/** DEV-only bridge. No scene access or inspector controls are installed in production. */
export interface GardenLookdevHost {
  queue(appearance: GardenAppearance): void;
  current(): GardenAppearance;
  root(): Object3D;
  owners(): readonly { name: string; root: Object3D; epoch: number; dirty: boolean }[];
  census(): DrawOwnerCensus | null;
  requestCensus(): void;
  rebuild(name: string): void;
  lights(): { key: { intensity: number }; ambient: { intensity: number }; hemisphere: { intensity: number } };
  onFrameStart?: () => void;
  onBeforeFrame?: () => void;
  onAfterFrame?: () => void;
  onDispose?: () => void;
}
export interface GardenLookdevRenderer { gardenLookdev?: GardenLookdevHost }
