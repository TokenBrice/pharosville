import type { BufferGeometry, Camera, InstancedMesh, Material, Object3D, Scene, Texture } from "three";

export interface DrawOwnerCensusEntry { owner: string; calls: number; triangles: number; instanced: boolean }
export interface DrawOwnerCensus {
  owners: DrawOwnerCensusEntry[];
  attributedCalls: number;
  rendererCalls: number;
  sampledAtFrame: number;
  /** DEV-only handle; export on demand, never serialize it in ordinary polling. */
  spikeTrace?: GardenSpikeTrace;
}
export interface DrawRecorderTarget {
  renderBufferDirect: (camera: Camera, scene: Scene | null, geometry: BufferGeometry, material: Material, object: Object3D, group: { start: number; count: number } | null) => void;
  info: { render: { calls: number; triangles: number } };
}
export interface DrawOwnerRecorder { arm(): void; finish(frame: number): DrawOwnerCensus | null }

export function shouldRequestDrawCensus(input: {
  debug: boolean;
  framesSinceSample: number;
  topologyChanged: boolean;
}): boolean {
  return input.topologyChanged || (input.debug && input.framesSinceSample >= 120);
}

function ownerName(object: Object3D, root: Object3D, depth: number): string {
  const names: string[] = [];
  let current: Object3D | null = object;
  while (current && current !== root && names.length < depth) {
    if (current.name) names.push(current.name);
    current = current.parent;
  }
  return names.length ? names.reverse().join("/") : object.type;
}

/**
 * Wraps the renderer INSTANCE's `renderBufferDirect` (three assigns it per instance in the
 * constructor) for exactly one armed frame, so every counted draw is a draw that happened.
 * `attributedCalls === rendererCalls` is therefore a reconciliation the caller may assert.
 *
 * Draws are measured from the renderer's own call and triangle deltas. That keeps draw
 * ranges, groups, instancing, and non-triangle primitives identical to `renderer.info`.
 */
export function createDrawOwnerRecorder(target: DrawRecorderTarget, root: Object3D, ownerDepth = 2): DrawOwnerRecorder {
  let armed = false;
  let original: DrawRecorderTarget["renderBufferDirect"] | null = null;
  let byOwner = new Map<string, DrawOwnerCensusEntry>();

  return {
    arm() {
      if (armed) return;
      armed = true;
      byOwner = new Map();
      original = target.renderBufferDirect;
      const wrapped = original;
      target.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
        const beforeCalls = target.info.render.calls;
        const beforeTriangles = target.info.render.triangles;
        wrapped.call(target, camera, scene, geometry, material, object, group);
        const callDelta = target.info.render.calls - beforeCalls;
        if (callDelta <= 0) return;
        const triangleDelta = target.info.render.triangles - beforeTriangles;
        const owner = ownerName(object, root, ownerDepth);
        const instanced = Boolean((object as InstancedMesh).isInstancedMesh);
        const entry = byOwner.get(owner) ?? { owner, calls: 0, triangles: 0, instanced };
        entry.calls += callDelta;
        entry.triangles += triangleDelta;
        entry.instanced = entry.instanced || instanced;
        byOwner.set(owner, entry);
      };
    },
    finish(frame) {
      if (!armed) return null;
      armed = false;
      if (original) target.renderBufferDirect = original;
      original = null;
      const owners = [...byOwner.values()].sort((a, b) => b.calls - a.calls || a.owner.localeCompare(b.owner));
      return {
        owners,
        attributedCalls: owners.reduce((sum, entry) => sum + entry.calls, 0),
        rendererCalls: target.info.render.calls,
        sampledAtFrame: frame,
      };
    },
  };
}

export type SpikePass = "boundary" | "environment" | "wakes" | "update" | "reflection" | "post" | "scene" | "shadow";
const SPIKE_PASSES: readonly SpikePass[] = ["boundary", "environment", "wakes", "update", "reflection", "post", "scene", "shadow"];
const SPIKE_PASS_INDEX: Record<SpikePass, number> = {
  boundary: 0, environment: 1, wakes: 2, update: 3, reflection: 4, post: 5, scene: 6, shadow: 7,
};
const SPIKE_PRE_FRAMES = 3;
const SPIKE_POST_FRAMES = 3;
const SPIKE_WINDOW = SPIKE_PRE_FRAMES + 1 + SPIKE_POST_FRAMES;
const SPIKE_CAPTURES = 32;
const SPIKE_DRAW_SLOTS = 2048; // Power of two, keyed by object identity AND pass.
const SPIKE_EVENT_SLOTS = 128;

interface SpikeFrameSlot {
  frame: number; timeSeconds: number; calls: number; triangles: number;
  rendererEpoch: number;
  reportedCalls: number; reportedTriangles: number; replacementEpoch: number;
  droppedDraws: number; droppedEvents: number; eventCount: number;
  objectIds: Float64Array; instanced: Uint8Array; passes: Uint8Array;
  ownerNear: string[]; ownerFar: string[]; objectNames: string[];
  drawCalls: Float64Array; drawTriangles: Float64Array;
  eventKinds: string[]; eventDetails: string[]; eventValues: Float64Array;
  eventCalls: Float64Array; eventTriangles: Float64Array; eventPasses: Uint8Array;
  eventTimes: Float64Array;
}

export interface SpikeTraceDraw {
  owner: string; objectId: number; objectName: string; instanced: boolean;
  pass: SpikePass; calls: number; triangles: number;
}
export interface SpikeTraceEvent {
  kind: string; detail: string; value: number; pass: SpikePass; calls: number; triangles: number;
  observedAtMs: number;
}
export interface SpikeTraceFrame {
  frame: number; timeSeconds: number; calls: number; triangles: number;
  rendererEpoch: number;
  reportedCalls: number; reportedTriangles: number; replacementEpoch: number;
  droppedDraws: number; droppedEvents: number; draws: SpikeTraceDraw[]; events: SpikeTraceEvent[];
}
export interface SpikeTraceSnapshot {
  threshold: number; preFrames: number; postFrames: number; frameCount: number;
  peakTriangles: number; droppedTriggers: number;
  rendererEpoch: number; disposed: boolean; latestFrame: SpikeTraceFrame | null;
  captures: { triggerFrame: number; triggerRendererEpoch: number; complete: boolean; frames: SpikeTraceFrame[] }[];
}

function spikeFrameSlot(): SpikeFrameSlot {
  return {
    frame: -1, timeSeconds: 0, calls: 0, triangles: 0,
    rendererEpoch: 0,
    reportedCalls: 0, reportedTriangles: 0, replacementEpoch: 0,
    droppedDraws: 0, droppedEvents: 0, eventCount: 0,
    objectIds: new Float64Array(SPIKE_DRAW_SLOTS).fill(-1),
    instanced: new Uint8Array(SPIKE_DRAW_SLOTS),
    ownerNear: Array<string>(SPIKE_DRAW_SLOTS).fill(""),
    ownerFar: Array<string>(SPIKE_DRAW_SLOTS).fill(""),
    objectNames: Array<string>(SPIKE_DRAW_SLOTS).fill(""),
    passes: new Uint8Array(SPIKE_DRAW_SLOTS),
    drawCalls: new Float64Array(SPIKE_DRAW_SLOTS),
    drawTriangles: new Float64Array(SPIKE_DRAW_SLOTS),
    eventKinds: Array<string>(SPIKE_EVENT_SLOTS).fill(""),
    eventDetails: Array<string>(SPIKE_EVENT_SLOTS).fill(""),
    eventValues: new Float64Array(SPIKE_EVENT_SLOTS),
    eventCalls: new Float64Array(SPIKE_EVENT_SLOTS),
    eventTriangles: new Float64Array(SPIKE_EVENT_SLOTS),
    eventPasses: new Uint8Array(SPIKE_EVENT_SLOTS),
    eventTimes: new Float64Array(SPIKE_EVENT_SLOTS),
  };
}

function copySpikeFrame(to: SpikeFrameSlot, from: SpikeFrameSlot): void {
  to.frame = from.frame;
  to.rendererEpoch = from.rendererEpoch;
  to.timeSeconds = from.timeSeconds;
  to.calls = from.calls;
  to.triangles = from.triangles;
  to.reportedCalls = from.reportedCalls;
  to.reportedTriangles = from.reportedTriangles;
  to.replacementEpoch = from.replacementEpoch;
  to.droppedDraws = from.droppedDraws;
  to.droppedEvents = from.droppedEvents;
  to.eventCount = from.eventCount;
  to.passes.set(from.passes);
  to.objectIds.set(from.objectIds);
  to.instanced.set(from.instanced);
  to.drawCalls.set(from.drawCalls);
  to.drawTriangles.set(from.drawTriangles);
  to.eventValues.set(from.eventValues);
  to.eventCalls.set(from.eventCalls);
  to.eventTriangles.set(from.eventTriangles);
  to.eventPasses.set(from.eventPasses);
  to.eventTimes.set(from.eventTimes);
  for (let index = 0; index < SPIKE_DRAW_SLOTS; index += 1) {
    to.ownerNear[index] = from.ownerNear[index]!;
    to.ownerFar[index] = from.ownerFar[index]!;
    to.objectNames[index] = from.objectNames[index]!;
  }
  for (let index = 0; index < SPIKE_EVENT_SLOTS; index += 1) {
    to.eventKinds[index] = from.eventKinds[index]!;
    to.eventDetails[index] = from.eventDetails[index]!;
  }
}

/** Replacement-time import into fixed storage; never runs on the frame path. */
function restoreSpikeFrame(to: SpikeFrameSlot, from: SpikeTraceFrame): void {
  to.frame = from.frame;
  to.rendererEpoch = from.rendererEpoch;
  to.timeSeconds = from.timeSeconds;
  to.calls = from.calls;
  to.triangles = from.triangles;
  to.reportedCalls = from.reportedCalls;
  to.reportedTriangles = from.reportedTriangles;
  to.replacementEpoch = from.replacementEpoch;
  to.droppedDraws = from.droppedDraws;
  to.droppedEvents = from.droppedEvents;
  for (let index = 0; index < from.draws.length; index += 1) {
    const draw = from.draws[index]!;
    to.objectIds[index] = draw.objectId;
    to.instanced[index] = draw.instanced ? 1 : 0;
    to.ownerNear[index] = draw.owner;
    to.objectNames[index] = draw.objectName;
    to.passes[index] = SPIKE_PASS_INDEX[draw.pass];
    to.drawCalls[index] = draw.calls;
    to.drawTriangles[index] = draw.triangles;
  }
  to.eventCount = from.events.length;
  for (let index = 0; index < from.events.length; index += 1) {
    const event = from.events[index]!;
    to.eventKinds[index] = event.kind;
    to.eventDetails[index] = event.detail;
    to.eventValues[index] = event.value;
    to.eventPasses[index] = SPIKE_PASS_INDEX[event.pass];
    to.eventCalls[index] = event.calls;
    to.eventTriangles[index] = event.triangles;
    to.eventTimes[index] = event.observedAtMs;
  }
}

export interface GardenSpikeTrace {
  beginFrame(frame: number, timeSeconds: number): void;
  setPass(pass: SpikePass): void;
  setScene(root: Object3D, shadowCamera: Camera): void;
  event(kind: string, value?: number, detail?: string): void;
  finishFrame(reportedCalls: number, reportedTriangles: number, replacementEpoch: number): void;
  snapshot(): SpikeTraceSnapshot;
  dispose(): void;
}

/**
 * DEV diagnosis only. Storage, wrappers and capture windows are allocated ONCE.
 * Draw/reset/upload hooks never construct records, names, maps or arrays. Export is
 * the only allocating operation, called by preview after the measurement session.
 * Actual counter deltas survive every reset; reported counters remain separate.
 */
export function createGardenSpikeTrace(target: DrawRecorderTarget & {
  info: DrawRecorderTarget["info"] & { reset(): void };
  initTexture?: (texture: Texture) => void;
}, previous?: SpikeTraceSnapshot): GardenSpikeTrace {
  const ring = Array.from({ length: SPIKE_WINDOW }, spikeFrameSlot);
  const captures = Array.from({ length: SPIKE_CAPTURES }, () => ({
    triggerFrame: -1, triggerRendererEpoch: 0, count: 0, remaining: 0,
    frames: Array.from({ length: SPIKE_WINDOW }, spikeFrameSlot),
  }));
  let root: Object3D | null = null;
  let shadowCamera: Camera | null = null;
  let pass = 0;
  let currentIndex = 0;
  let current = ring[0]!;
  let frameOpen = false;
  let completed = 0;
  let captureCount = 0;
  let droppedTriggers = previous?.droppedTriggers ?? 0;
  let aboveThreshold = false;
  let peakTriangles = previous?.peakTriangles ?? 0;
  let disposed = false;
  const rendererEpoch = previous ? previous.rendererEpoch + 1 : 0;
  const previousFrameCount = previous?.frameCount ?? 0;
  // Preserve the same bounded session windows through HMR/renderer replacement.
  // An interrupted old window stays incomplete; a successor cannot supply its post frames.
  if (previous) {
    for (const saved of previous.captures) {
      const capture = captures[captureCount++]!;
      capture.triggerFrame = saved.triggerFrame;
      capture.triggerRendererEpoch = saved.triggerRendererEpoch;
      capture.remaining = saved.complete ? 0 : -1;
      for (const frame of saved.frames) restoreSpikeFrame(capture.frames[capture.count++]!, frame);
    }
  }
  const originalDraw = target.renderBufferDirect;
  const originalReset = target.info.reset;
  const originalInitTexture = target.initTexture;
  const recordEvent = (kind: string, value = 0, detail = "") => {
    const index = current.eventCount;
    if (index === SPIKE_EVENT_SLOTS) { current.droppedEvents += 1; return; }
    current.eventCount += 1;
    current.eventKinds[index] = kind;
    current.eventDetails[index] = detail;
    current.eventValues[index] = value;
    current.eventCalls[index] = target.info.render.calls;
    current.eventTriangles[index] = target.info.render.triangles;
    current.eventPasses[index] = pass;
    current.eventTimes[index] = performance.now();
  };
  target.info.reset = () => {
    recordEvent("counter-reset");
    originalReset.call(target.info);
  };
  if (originalInitTexture) {
    target.initTexture = (texture) => {
      recordEvent("texture-upload", texture.id, texture.name);
      originalInitTexture.call(target, texture);
    };
  }
  target.renderBufferDirect = (camera, scene, geometry, material, object, group) => {
    const beforeCalls = target.info.render.calls;
    const beforeTriangles = target.info.render.triangles;
    originalDraw.call(target, camera, scene, geometry, material, object, group);
    const calls = target.info.render.calls - beforeCalls;
    const triangles = target.info.render.triangles - beforeTriangles;
    if (calls <= 0) return;
    current.calls += calls;
    current.triangles += triangles;
    const drawPass = camera === shadowCamera
      ? SPIKE_PASS_INDEX.shadow
      : scene === root && pass === SPIKE_PASS_INDEX.post ? SPIKE_PASS_INDEX.scene : pass;
    let index = ((object.id * 31 + drawPass) >>> 0) & (SPIKE_DRAW_SLOTS - 1);
    for (let probe = 0; probe < SPIKE_DRAW_SLOTS; probe += 1) {
      if (current.objectIds[index] === -1) {
        current.objectIds[index] = object.id;
        current.instanced[index] = (object as InstancedMesh).isInstancedMesh ? 1 : 0;
        current.passes[index] = drawPass;
        // Retain name references NOW: a later part replacement can detach these
        // objects before export. Only joining strings waits until snapshot().
        let near = "";
        let far = "";
        let ancestor: Object3D | null = object;
        while (ancestor && ancestor !== root) {
          if (ancestor.name) {
            if (near) { far = ancestor.name; break; }
            near = ancestor.name;
          }
          ancestor = ancestor.parent;
        }
        current.ownerNear[index] = near || object.type;
        current.ownerFar[index] = far;
        current.objectNames[index] = object.name;
      }
      if (current.objectIds[index] === object.id && current.passes[index] === drawPass) {
        current.drawCalls[index] += calls;
        current.drawTriangles[index] += triangles;
        return;
      }
      index = (index + 1) & (SPIKE_DRAW_SLOTS - 1);
    }
    current.droppedDraws += calls;
  };
  const api = {
    beginFrame(frame: number, timeSeconds: number) {
      // Between-frame async attach/upload events already occupy this fresh slot.
      current.frame = frame;
      current.rendererEpoch = rendererEpoch;
      current.timeSeconds = timeSeconds;
      frameOpen = true;
      pass = 0;
      recordEvent("frame-begin");
    },
    setPass(next: SpikePass) { pass = SPIKE_PASS_INDEX[next]; },
    setScene(nextRoot: Object3D, nextShadowCamera: Camera) { root = nextRoot; shadowCamera = nextShadowCamera; },
    event: recordEvent,
    finishFrame(reportedCalls: number, reportedTriangles: number, replacementEpoch: number) {
      if (!frameOpen) return;
      current.reportedCalls = reportedCalls;
      current.reportedTriangles = reportedTriangles;
      current.replacementEpoch = replacementEpoch;
      recordEvent("frame-end");
      // Complete existing windows before opening a new one (overlap is allowed).
      for (let index = 0; index < captureCount; index += 1) {
        const capture = captures[index]!;
        if (capture.remaining <= 0) continue;
        copySpikeFrame(capture.frames[capture.count++]!, current);
        capture.remaining -= 1;
      }
      const triangles = Math.max(reportedTriangles, current.triangles);
      peakTriangles = Math.max(peakTriangles, triangles);
      if (triangles > 480_000 && !aboveThreshold) {
        if (captureCount === SPIKE_CAPTURES) droppedTriggers += 1;
        else {
          const capture = captures[captureCount++]!;
          capture.triggerFrame = current.frame;
          capture.triggerRendererEpoch = rendererEpoch;
          capture.remaining = SPIKE_POST_FRAMES;
          const preCount = Math.min(completed, SPIKE_PRE_FRAMES);
          for (let offset = preCount; offset > 0; offset -= 1) {
            copySpikeFrame(capture.frames[capture.count++]!, ring[(currentIndex - offset + SPIKE_WINDOW) % SPIKE_WINDOW]!);
          }
          copySpikeFrame(capture.frames[capture.count++]!, current);
        }
      }
      aboveThreshold = triangles > 480_000;
      completed += 1;
      currentIndex = (currentIndex + 1) % SPIKE_WINDOW;
      current = ring[currentIndex]!;
      current.objectIds.fill(-1);
      current.drawCalls.fill(0);
      current.drawTriangles.fill(0);
      current.eventKinds.fill("");
      current.eventDetails.fill("");
      current.calls = current.triangles = current.eventCount = current.droppedDraws = current.droppedEvents = 0;
      frameOpen = false;
      pass = 0;
    },
    snapshot() {
      const exportFrame = (slot: SpikeFrameSlot): SpikeTraceFrame => {
        const draws = [];
        const events = [];
        for (let index = 0; index < SPIKE_DRAW_SLOTS; index += 1) {
          const objectId = slot.objectIds[index]!;
          if (objectId === -1) continue;
          draws.push({
            owner: slot.ownerFar[index] ? `${slot.ownerFar[index]}/${slot.ownerNear[index]}` : slot.ownerNear[index]!,
            objectId, objectName: slot.objectNames[index]!, instanced: slot.instanced[index] === 1,
            pass: SPIKE_PASSES[slot.passes[index]!]!,
            calls: slot.drawCalls[index]!, triangles: slot.drawTriangles[index]!,
          });
        }
        for (let index = 0; index < slot.eventCount; index += 1) {
          events.push({
            kind: slot.eventKinds[index]!, detail: slot.eventDetails[index]!, value: slot.eventValues[index]!,
            pass: SPIKE_PASSES[slot.eventPasses[index]!]!,
            calls: slot.eventCalls[index]!, triangles: slot.eventTriangles[index]!,
            observedAtMs: slot.eventTimes[index]!,
          });
        }
        return {
          frame: slot.frame, timeSeconds: slot.timeSeconds, calls: slot.calls, triangles: slot.triangles,
          rendererEpoch: slot.rendererEpoch,
          reportedCalls: slot.reportedCalls, reportedTriangles: slot.reportedTriangles,
          replacementEpoch: slot.replacementEpoch, droppedDraws: slot.droppedDraws, droppedEvents: slot.droppedEvents,
          draws, events,
        };
      };
      return {
        threshold: 480_000, preFrames: SPIKE_PRE_FRAMES, postFrames: SPIKE_POST_FRAMES,
        frameCount: previousFrameCount + completed, peakTriangles, droppedTriggers, rendererEpoch, disposed,
        latestFrame: frameOpen ? exportFrame(current)
          : completed > 0 ? exportFrame(ring[(currentIndex - 1 + SPIKE_WINDOW) % SPIKE_WINDOW]!) : null,
        captures: captures.slice(0, captureCount).map((capture) => ({
          triggerFrame: capture.triggerFrame, triggerRendererEpoch: capture.triggerRendererEpoch,
          complete: capture.remaining === 0,
          frames: capture.frames.slice(0, capture.count).map(exportFrame),
        })),
      };
    },
    dispose() {
      disposed = true;
      root = null;
      shadowCamera = null;
      target.renderBufferDirect = originalDraw;
      target.info.reset = originalReset;
      if (originalInitTexture) target.initTexture = originalInitTexture;
    },
  };
  return api;
}
