// Re-export barrel for the per-frame ship motion sampler. The implementation
// is split by concern under ./motion-sampling/:
//   resolve.ts        — resolveShipMotionSample(Into) entry points
//   consort.ts        — squad-consort flagship shadowing + heading lag
//   reduced-motion.ts — deterministic representative idle frames
//   route-cycle.ts    — dock/risk/transit cycle resolution
//   transit.ts        — transit phase profiles, lane offset, docking choreography
//   mooring.ts        — moored dwell sway + cast-off prep
//   risk-water.ts     — risk-water dispatch + ledger roaming behavior
//   risk-drift.ts     — risk-tile orbital drift + W4.25 tack-out
//   open-water.ts     — W4.23 calm patrol itineraries
//   route-runtime.ts  — per-route derived sampling runtime cache
//   memory.ts         — heading/wake low-pass memory
//   sea-room.ts       — W3.20 sea-room soft separation pass
//   shared.ts         — sample writers, clamps, route identity keys
export { createShipMotionSample } from "./motion-sampling/shared";
export { resolveShipMotionSample, resolveShipMotionSampleInto } from "./motion-sampling/resolve";
export { clearShipHeadingMemory, getShipHeadingDelta, getShipWakeIntensityMemory } from "./motion-sampling/memory";
export { __resetConsortHeadingLagMemory } from "./motion-sampling/consort";
export { RISK_TRANSITION_HEADING_EASE_SECONDS, RISK_TRANSITION_TACK_OUT_SECONDS } from "./motion-sampling/risk-drift";
export {
  applySeaRoomSeparationPass,
  SEA_ROOM_BASE_RADIUS_TILES,
  SEA_ROOM_MAX_NUDGE_PER_FRAME,
  seaRoomSeparationRadius,
} from "./motion-sampling/sea-room";
export type { SeaRoomSeparationOptions } from "./motion-sampling/sea-room";
// These two were always thin wrappers over motion-water/motion-utils; the
// barrel re-exports the underlying functions directly (same signatures).
export { sampleShipWaterPath } from "./motion-water";
export { pathKey as shipWaterPathKey } from "./motion-utils";
