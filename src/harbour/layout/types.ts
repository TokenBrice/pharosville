/**
 * HarbourLayout: the Blender-exported island layout (src/harbour/data/layout.json).
 * v1 = the P1 grey-box (agents/…/p1/greybox/layout.json). v2 (island agent) keeps every v1 base key
 * and adds the optional fields marked "v2". Units: metres. Axes: glTF Y-up, x east, y up, z south
 * (toward the default camera). Headings: bow along (sin h, 0, cos h).
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export type HullClass = "flagship" | "large" | "medium" | "small" | "boat" | "skiff";

export interface LayoutCameraPreset {
  target: Vec3;
  distance: number;
  fovDeg: number;
  pitchDeg: number;
  yawDeg: number;
}

export interface LayoutCamera {
  /** Named presets. "heart" (v2, default framing) and "overview" are the canonical ones. */
  presets: Record<string, LayoutCameraPreset>;
  /** Ground-plane (x, z) pan clamp. */
  panClamp: { min: Vec2; max: Vec2 };
  /** v2: zoom distance limits. */
  minDistance?: number;
  maxDistance?: number;
}

export interface LayoutHullTable {
  classes: HullClass[];
  loa: Record<HullClass, number>;
  beam: Record<HullClass, number>;
  mastAboveDeck: Record<HullClass, number>;
  mooring: Record<HullClass, string>;
}

export interface LayoutIsland {
  /** Outer coast polygon, (x, z). */
  coast: Vec2[];
  /** Bay (inner water) polygon, (x, z). */
  bay: Vec2[];
  breakwater: Vec2[];
  mole: Vec2[];
  /** P6: offshore islets (the Pharos islet), (x, z) polygons. */
  islets?: Vec2[][];
}

export type PierSegmentKind = "finger" | "arm" | "grand" | "thead" | "breakwater" | "mole" | "quay" | (string & {});

export interface PierSegment {
  kind: PierSegmentKind;
  /** Segment ends, (x, z). */
  a: Vec2;
  b: Vec2;
  width: number;
}

export interface Berth {
  id: string;
  class: HullClass;
  position: Vec3;
  headingRad: number;
  /** Lane node id of the approach gate. */
  gate: string;
  /** Approach polyline (x, z), ending at the berth. */
  approach: Vec2[];
}

export interface Pier {
  id: string;
  chain: string;
  kind: string;
  gate: Vec2;
  segments: PierSegment[];
  berths: Berth[];
  berthCounts: Partial<Record<HullClass, number>>;
}

export interface LaneNode { id: string; position: Vec3 }
export interface LaneEdge { from: string; to: string }
export interface LayoutLanes { oneWay: boolean; nodes: LaneNode[]; edges: LaneEdge[] }

export interface Landmark {
  id: string;
  name: string;
  position: Vec3;
  footprint: number;
  /** v2 (optional): yaw of the landmark's front, radians. */
  headingRad?: number;
}

export interface HeadedSlot { id: string; class: HullClass; position: Vec3; headingRad: number }

export interface LayoutZones {
  shoals?: { polygon: Vec2[]; slots: Vec3[] };
  wreckCove?: { polygon: Vec2[]; slots: HeadedSlot[] };
  slipway?: { polygon: Vec2[]; slots: Vec3[]; launchPath: Vec2[] };
  farPorts?: { polygon: Vec2[]; rows: Array<{ cls: HullClass; line: Vec2[]; slots: Vec3[] }> };
  skiffBasins?: Array<{ pier: string; polygon: Vec2[]; slots: string[] }>;
  [zone: string]: unknown;
}

// ------------------------------------------------------------------ v2 additions (all optional)

export interface Mooring {
  id: string;
  chain: string;
  class: HullClass;
  position: Vec3;
  swingRadius: number;
}

export type LayoutLightKind = "window" | "lamp" | "pierhead" | "harbourlight";

export interface LayoutLight {
  kind: LayoutLightKind;
  position: Vec3;
  /** sRGB hex; defaults per kind (sodium for window/lamp, lantern for pierhead, red for harbourlight). */
  color?: string;
}

export interface LayoutSea {
  /** URL of the RGBA8 sea SDF (see P2 brief). */
  sdf: string;
  /** [minX, minZ, maxX, maxZ] covered by the SDF. */
  bounds: [number, number, number, number];
}

export interface LayoutLabel {
  id: string;
  text: string;
  anchor: Vec3;
  kind: string;
}

export interface HarbourLayout {
  version?: 1 | 2;
  units: "m";
  axes?: string;
  seaLevel: number;
  deckY: number;
  bounds: { min: Vec3; max: Vec3 };
  camera: LayoutCamera;
  hull: LayoutHullTable;
  island: LayoutIsland;
  piers: Pier[];
  lanes: LayoutLanes;
  landmarks: Landmark[];
  zones: LayoutZones;
  // v2
  moorings?: Mooring[];
  lights?: LayoutLight[];
  sea?: LayoutSea;
  labels?: LayoutLabel[];
}

/** The 'layout' service value (ctx.services.get("layout")). */
export type LayoutService = HarbourLayout;
