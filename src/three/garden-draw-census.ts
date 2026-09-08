import type { BufferGeometry, Camera, InstancedMesh, Material, Object3D, Scene } from "three";

export interface DrawOwnerCensusEntry { owner: string; calls: number; triangles: number; instanced: boolean }
export interface DrawOwnerCensus { owners: DrawOwnerCensusEntry[]; attributedCalls: number; rendererCalls: number; sampledAtFrame: number }
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
