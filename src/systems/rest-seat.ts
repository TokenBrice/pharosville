/**
 * The Hour-Print rest seat (plan K1, O1 resolution; `agents/2026-09-26-opus-visual-leap/w1-station-scan.md` §3).
 *
 * The rest view is an authored pose, not a zoom: seat C on the south shore, looking at the Pharos
 * at yaw 31° (45° is blocked by the Polygon station on the sight line and no legal slot exists to
 * move it). Pitch and eye height are free of zoom. One eye serves every landscape gate (tower foot
 * x 0.620 / 0.602 / 0.654 at 1600×1000 / 1200×640 / 900×720, all inside K1); the tall 720×900
 * window needs its own eye about 8 tiles along the orbit so the foot lands at 0.59.
 *
 * World units: x/z are world-plane coordinates (tile × TILE_SCALE convention used by projection.ts),
 * y is height above the water plane. Consumers: the pose model and ShotSpec (W1.0/W1.1), the
 * threshold landform (W1.5), the inlet re-projection (W1.6) and the light sketch (W1.8).
 */
export const REST_SEAT_YAW_RAD = (31 * Math.PI) / 180;
export const REST_SEAT_PITCH_RAD = (2.6 * Math.PI) / 180;
export const REST_SEAT_EYE_HEIGHT = 15.23;
export const REST_SEAT_VFOV_DEG = 32;

export interface RestSeatEye {
  /** Eye tile coordinates (for siting world features). */
  tile: { x: number; y: number };
  /** Eye world position. */
  world: { x: number; y: number; z: number };
}

/** Aspect ≥ 1 (1600×1000, 1200×640, 900×720 and wider). */
export const REST_SEAT_EYE_LANDSCAPE: RestSeatEye = {
  tile: { x: 114.2, y: 179.7 },
  world: { x: 161.54, y: REST_SEAT_EYE_HEIGHT, z: 254.11 },
};

/** Aspect < 1 (the tall 720×900 gate profile). */
export const REST_SEAT_EYE_TALL: RestSeatEye = {
  tile: { x: 120.9, y: 175.7 },
  world: { x: 170.93, y: REST_SEAT_EYE_HEIGHT, z: 248.47 },
};

/** Screen-space K1 targets the pose was solved for (fractions of the viewport). */
export const REST_SEAT_TARGETS = {
  towerFootX: { landscape: 0.62, tall: 0.59 },
  crownY: 0.14,
  towerSpan: 0.42,
} as const;

export function restSeatEyeForAspect(aspect: number): RestSeatEye {
  return aspect >= 1 ? REST_SEAT_EYE_LANDSCAPE : REST_SEAT_EYE_TALL;
}
