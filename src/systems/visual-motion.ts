import type { ShipMotionSample } from "./motion-types";

export interface VisualMotionSmoothingConfig {
  readonly tileDampingSeconds?: number;
  readonly headingDampingSeconds?: number;
  readonly numericDampingSeconds?: number;
  readonly maxGapSeconds?: number;
  readonly snapDistanceTiles?: number;
  readonly metadataChangeSnapDistanceTiles?: number;
}

export interface VisualShipMotionMemory {
  sample: ShipMotionSample;
  initialized: boolean;
  lastTimeSeconds: number;
  lastShipId: string | null;
  lastState: ShipMotionSample["state"] | null;
  lastZone: ShipMotionSample["zone"] | null;
  lastRouteKey: string | null;
  lastRoutePathKey: string | null;
  lastCurrentDockId: string | null;
  lastCurrentRouteStopId: string | null;
  lastCurrentRouteStopKind: ShipMotionSample["currentRouteStopKind"];
  lastMooringSubPhase: ShipMotionSample["mooringSubPhase"];
}

export type VisualMotionMemory = Map<string, VisualShipMotionMemory>;

export interface VisualMotionSmoothingState {
  readonly displaySamples: Map<string, ShipMotionSample>;
  readonly memory: VisualMotionMemory;
}

export interface SmoothShipMotionSamplesInput {
  readonly targetSamples: ReadonlyMap<string, ShipMotionSample>;
  readonly state: VisualMotionSmoothingState;
  readonly timeSeconds: number;
  readonly reducedMotion?: boolean;
  readonly staticMode?: boolean;
  readonly config?: VisualMotionSmoothingConfig;
}

export interface SmoothShipMotionSamplesIntoInput {
  readonly targetSamples: ReadonlyMap<string, ShipMotionSample>;
  readonly displaySamples: Map<string, ShipMotionSample>;
  readonly memory: VisualMotionMemory;
  readonly timeSeconds: number;
  readonly reducedMotion?: boolean;
  readonly staticMode?: boolean;
  readonly config?: VisualMotionSmoothingConfig;
}

export const DEFAULT_VISUAL_MOTION_CONFIG: Required<VisualMotionSmoothingConfig> = {
  tileDampingSeconds: 0.16,
  headingDampingSeconds: 0.1,
  numericDampingSeconds: 0.18,
  maxGapSeconds: 0.5,
  snapDistanceTiles: 3,
  metadataChangeSnapDistanceTiles: 0.8,
};

export function createVisualMotionSmoothingState(): VisualMotionSmoothingState {
  return {
    displaySamples: new Map(),
    memory: new Map(),
  };
}

export function resetVisualMotionSmoothingState(state: VisualMotionSmoothingState): void {
  state.displaySamples.clear();
  state.memory.clear();
}

export function smoothShipMotionSamples(input: SmoothShipMotionSamplesInput): ReadonlyMap<string, ShipMotionSample> {
  return smoothShipMotionSamplesInto({
    targetSamples: input.targetSamples,
    displaySamples: input.state.displaySamples,
    memory: input.state.memory,
    timeSeconds: input.timeSeconds,
    ...(input.reducedMotion !== undefined ? { reducedMotion: input.reducedMotion } : {}),
    ...(input.staticMode !== undefined ? { staticMode: input.staticMode } : {}),
    ...(input.config !== undefined ? { config: input.config } : {}),
  });
}

export function smoothShipMotionSamplesInto(input: SmoothShipMotionSamplesIntoInput): ReadonlyMap<string, ShipMotionSample> {
  const exactMode = Boolean(input.reducedMotion || input.staticMode);
  const tileDampingSeconds = input.config?.tileDampingSeconds ?? DEFAULT_VISUAL_MOTION_CONFIG.tileDampingSeconds;
  const headingDampingSeconds = input.config?.headingDampingSeconds ?? DEFAULT_VISUAL_MOTION_CONFIG.headingDampingSeconds;
  const numericDampingSeconds = input.config?.numericDampingSeconds ?? DEFAULT_VISUAL_MOTION_CONFIG.numericDampingSeconds;
  const maxGapSeconds = input.config?.maxGapSeconds ?? DEFAULT_VISUAL_MOTION_CONFIG.maxGapSeconds;
  const snapDistanceTiles = input.config?.snapDistanceTiles ?? DEFAULT_VISUAL_MOTION_CONFIG.snapDistanceTiles;
  const metadataChangeSnapDistanceTiles = input.config?.metadataChangeSnapDistanceTiles
    ?? DEFAULT_VISUAL_MOTION_CONFIG.metadataChangeSnapDistanceTiles;

  for (const [shipKey, target] of input.targetSamples) {
    const entry = ensureShipMemory(shipKey, input.displaySamples, input.memory);
    const rawDeltaSeconds = entry.initialized ? input.timeSeconds - entry.lastTimeSeconds : 0;
    const shouldSnap = exactMode || shouldSnapToTarget(
      entry,
      target,
      rawDeltaSeconds,
      maxGapSeconds,
      snapDistanceTiles,
      metadataChangeSnapDistanceTiles,
    );

    if (shouldSnap) {
      copyExactSample(target, entry.sample);
    } else {
      const deltaSeconds = Math.max(0, rawDeltaSeconds);
      smoothSampleInto(
        target,
        entry.sample,
        deltaSeconds,
        dampingAlpha(deltaSeconds, tileDampingSeconds),
        dampingAlpha(deltaSeconds, headingDampingSeconds),
        dampingAlpha(deltaSeconds, numericDampingSeconds),
      );
    }

    syncShipMemory(entry, target, input.timeSeconds);
  }

  pruneMissingShips(input.targetSamples, input.displaySamples, input.memory);
  return input.displaySamples;
}

function ensureShipMemory(
  shipKey: string,
  displaySamples: Map<string, ShipMotionSample>,
  memory: VisualMotionMemory,
): VisualShipMotionMemory {
  const existing = memory.get(shipKey);
  if (existing) {
    if (displaySamples.get(shipKey) !== existing.sample) displaySamples.set(shipKey, existing.sample);
    return existing;
  }

  const sample = displaySamples.get(shipKey) ?? createDisplaySample();
  const entry: VisualShipMotionMemory = {
    sample,
    initialized: false,
    lastTimeSeconds: 0,
    lastShipId: null,
    lastState: null,
    lastZone: null,
    lastRouteKey: null,
    lastRoutePathKey: null,
    lastCurrentDockId: null,
    lastCurrentRouteStopId: null,
    lastCurrentRouteStopKind: null,
    lastMooringSubPhase: null,
  };
  memory.set(shipKey, entry);
  displaySamples.set(shipKey, sample);
  return entry;
}

function shouldSnapToTarget(
  entry: VisualShipMotionMemory,
  target: ShipMotionSample,
  rawDeltaSeconds: number,
  maxGapSeconds: number,
  snapDistanceTiles: number,
  metadataChangeSnapDistanceTiles: number,
): boolean {
  if (!entry.initialized) return true;
  if (rawDeltaSeconds < 0) return true;
  if (rawDeltaSeconds > maxGapSeconds) return true;
  if (entry.lastShipId !== target.shipId) return true;
  if (!isCompatibleStateTransition(entry, target)) return true;

  const targetDistance = Math.hypot(entry.sample.tile.x - target.tile.x, entry.sample.tile.y - target.tile.y);
  if (targetDistance > snapDistanceTiles) return true;

  if (hasMetadataDiscontinuity(entry, target) && targetDistance > metadataChangeSnapDistanceTiles) {
    return true;
  }

  return false;
}

function hasMetadataDiscontinuity(entry: VisualShipMotionMemory, target: ShipMotionSample): boolean {
  return entry.lastZone !== target.zone
    || entry.lastCurrentDockId !== target.currentDockId
    || entry.lastCurrentRouteStopId !== target.currentRouteStopId
    || entry.lastCurrentRouteStopKind !== target.currentRouteStopKind
    || entry.lastMooringSubPhase !== target.mooringSubPhase;
}

function isCompatibleStateTransition(entry: VisualShipMotionMemory, target: ShipMotionSample): boolean {
  if (entry.lastState === target.state) return true;
  if (!entry.lastState) return false;

  if (entry.lastState === "moored" && target.state === "departing") return true;
  if (entry.lastState === "departing" && (target.state === "risk-drift" || target.state === "sailing")) return true;
  if ((entry.lastState === "risk-drift" || entry.lastState === "sailing") && target.state === "arriving") return true;
  if (entry.lastState === "arriving" && target.state === "moored") return true;

  const ledgerRoute = entry.lastZone === "ledger"
    || target.zone === "ledger"
    || entry.lastCurrentRouteStopKind === "ledger"
    || target.currentRouteStopKind === "ledger";
  if (ledgerRoute) {
    if (entry.lastState === "moored" && target.state === "sailing") return true;
    if (entry.lastState === "sailing" && target.state === "moored") return true;
  }

  return false;
}

function smoothSampleInto(
  target: ShipMotionSample,
  out: ShipMotionSample,
  deltaSeconds: number,
  tileAlpha: number,
  headingAlpha: number,
  numericAlpha: number,
): void {
  copyTargetMetadata(target, out);

  const previousX = out.tile.x;
  const previousY = out.tile.y;
  out.tile.x += (target.tile.x - out.tile.x) * tileAlpha;
  out.tile.y += (target.tile.y - out.tile.y) * tileAlpha;
  smoothHeadingInto(target, out, headingAlpha);
  writeDisplayVelocityInto(out, out.tile.x - previousX, out.tile.y - previousY, deltaSeconds);
  out.wakeIntensity += (target.wakeIntensity - out.wakeIntensity) * numericAlpha;
  smoothOptionalNumberInto(target, out, "mooringSwayAmplitude", numericAlpha);
  smoothOptionalNumberInto(target, out, "mooringTension", numericAlpha);
  smoothOptionalNumberInto(target, out, "lanternAlpha", numericAlpha);
  smoothOptionalNumberInto(target, out, "fenderContact", numericAlpha);
  smoothOptionalNumberInto(target, out, "mapVisibilityAlpha", numericAlpha);
}

function smoothHeadingInto(target: ShipMotionSample, out: ShipMotionSample, alpha: number): void {
  const targetLength = Math.hypot(target.heading.x, target.heading.y);
  if (targetLength <= Number.EPSILON) {
    out.heading.x = 0;
    out.heading.y = 0;
    return;
  }

  const targetX = target.heading.x / targetLength;
  const targetY = target.heading.y / targetLength;
  const currentLength = Math.hypot(out.heading.x, out.heading.y);
  const currentX = currentLength > Number.EPSILON ? out.heading.x / currentLength : targetX;
  const currentY = currentLength > Number.EPSILON ? out.heading.y / currentLength : targetY;
  const nextX = currentX + (targetX - currentX) * alpha;
  const nextY = currentY + (targetY - currentY) * alpha;
  const nextLength = Math.hypot(nextX, nextY);

  if (nextLength <= Number.EPSILON) {
    out.heading.x = targetX;
    out.heading.y = targetY;
    return;
  }

  out.heading.x = nextX / nextLength;
  out.heading.y = nextY / nextLength;
}

type OptionalNumberSampleKey =
  | "mooringSwayAmplitude"
  | "mooringTension"
  | "lanternAlpha"
  | "fenderContact"
  | "mapVisibilityAlpha";

function smoothOptionalNumberInto(
  target: ShipMotionSample,
  out: ShipMotionSample,
  key: OptionalNumberSampleKey,
  alpha: number,
): void {
  const mutableOut = out as ShipMotionSample & Partial<Record<OptionalNumberSampleKey, number>>;
  const readableTarget = target as ShipMotionSample & Partial<Record<OptionalNumberSampleKey, number>>;
  if (!hasOwn(target, key)) {
    delete mutableOut[key];
    return;
  }

  const targetValue = readableTarget[key];
  if (typeof targetValue !== "number" || !Number.isFinite(targetValue)) {
    if (targetValue !== undefined) {
      mutableOut[key] = targetValue;
    } else {
      delete mutableOut[key];
    }
    return;
  }

  const currentValue = mutableOut[key];
  mutableOut[key] = typeof currentValue === "number" && Number.isFinite(currentValue)
    ? currentValue + (targetValue - currentValue) * alpha
    : targetValue;
}

function copyExactSample(target: ShipMotionSample, out: ShipMotionSample): void {
  copyTargetMetadata(target, out);
  out.tile.x = target.tile.x;
  out.tile.y = target.tile.y;
  out.heading.x = target.heading.x;
  out.heading.y = target.heading.y;
  copyVelocity(target, out);
  out.wakeIntensity = target.wakeIntensity;
  copyOptionalNumber(target, out, "mooringSwayAmplitude");
  copyOptionalNumber(target, out, "mooringTension");
  copyOptionalNumber(target, out, "lanternAlpha");
  copyOptionalNumber(target, out, "fenderContact");
  copyOptionalNumber(target, out, "mapVisibilityAlpha");
}

function copyTargetMetadata(target: ShipMotionSample, out: ShipMotionSample): void {
  out.shipId = target.shipId;
  out.state = target.state;
  out.zone = target.zone;
  out.routeKey = target.routeKey ?? null;
  out.routePathKey = target.routePathKey ?? null;
  out.currentDockId = target.currentDockId;
  out.currentRouteStopId = target.currentRouteStopId;
  out.currentRouteStopKind = target.currentRouteStopKind;

  if (hasOwn(target, "mooringSubPhase")) {
    const mooringSubPhase = target.mooringSubPhase;
    if (mooringSubPhase !== undefined) {
      out.mooringSubPhase = mooringSubPhase;
    } else {
      delete out.mooringSubPhase;
    }
  } else {
    delete out.mooringSubPhase;
  }

  if (hasOwn(target, "seaState")) {
    const seaState = target.seaState;
    if (seaState !== undefined) {
      out.seaState = seaState;
    } else {
      delete out.seaState;
    }
  } else {
    delete out.seaState;
  }
}

function copyOptionalNumber(target: ShipMotionSample, out: ShipMotionSample, key: OptionalNumberSampleKey): void {
  const mutableOut = out as ShipMotionSample & Partial<Record<OptionalNumberSampleKey, number>>;
  const readableTarget = target as ShipMotionSample & Partial<Record<OptionalNumberSampleKey, number>>;
  if (hasOwn(target, key)) {
    const value = readableTarget[key];
    if (value !== undefined) {
      mutableOut[key] = value;
    } else {
      delete mutableOut[key];
    }
  } else {
    delete mutableOut[key];
  }
}

function copyVelocity(target: ShipMotionSample, out: ShipMotionSample): void {
  writeVelocity(out, target.velocity?.x ?? 0, target.velocity?.y ?? 0);
}

function writeDisplayVelocityInto(out: ShipMotionSample, dx: number, dy: number, deltaSeconds: number): void {
  if (deltaSeconds <= 0) {
    writeVelocity(out, 0, 0);
    return;
  }
  writeVelocity(out, dx / deltaSeconds, dy / deltaSeconds);
}

function writeVelocity(out: ShipMotionSample, x: number, y: number): void {
  const vx = Number.isFinite(x) ? x : 0;
  const vy = Number.isFinite(y) ? y : 0;
  if (!out.velocity) {
    out.velocity = { x: vx, y: vy };
  } else {
    out.velocity.x = vx;
    out.velocity.y = vy;
  }
  out.speedTilesPerSecond = Math.hypot(vx, vy);
}

function syncShipMemory(entry: VisualShipMotionMemory, target: ShipMotionSample, timeSeconds: number): void {
  entry.initialized = true;
  entry.lastTimeSeconds = timeSeconds;
  entry.lastShipId = target.shipId;
  entry.lastState = target.state;
  entry.lastZone = target.zone;
  entry.lastRouteKey = target.routeKey ?? null;
  entry.lastRoutePathKey = target.routePathKey ?? null;
  entry.lastCurrentDockId = target.currentDockId;
  entry.lastCurrentRouteStopId = target.currentRouteStopId;
  entry.lastCurrentRouteStopKind = target.currentRouteStopKind;
  entry.lastMooringSubPhase = target.mooringSubPhase;
}

function pruneMissingShips(
  targetSamples: ReadonlyMap<string, ShipMotionSample>,
  displaySamples: Map<string, ShipMotionSample>,
  memory: VisualMotionMemory,
): void {
  for (const shipKey of displaySamples.keys()) {
    if (!targetSamples.has(shipKey)) displaySamples.delete(shipKey);
  }
  for (const shipKey of memory.keys()) {
    if (!targetSamples.has(shipKey)) memory.delete(shipKey);
  }
}

function dampingAlpha(deltaSeconds: number, dampingSeconds: number): number {
  if (deltaSeconds <= 0) return 0;
  if (dampingSeconds <= 0) return 1;
  return 1 - Math.exp(-deltaSeconds / dampingSeconds);
}

function hasOwn(object: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function createDisplaySample(): ShipMotionSample {
  return {
    shipId: "",
    tile: { x: 0, y: 0 },
    state: "idle",
    zone: "calm",
    routeKey: null,
    routePathKey: null,
    currentDockId: null,
    currentRouteStopId: null,
    currentRouteStopKind: null,
    heading: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    speedTilesPerSecond: 0,
    wakeIntensity: 0,
    mooringSubPhase: null,
    mooringSwayAmplitude: 1,
    mooringTension: 0,
    lanternAlpha: 0,
    fenderContact: 0,
    mapVisibilityAlpha: 1,
    seaState: null,
  };
}
