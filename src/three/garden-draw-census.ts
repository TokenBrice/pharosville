import type { BufferGeometry, Camera, InstancedMesh, Material, Object3D, Scene } from "three";

export interface DrawOwnerCensusEntry { owner: string; calls: number; triangles: number; instanced: boolean }
export interface DrawOwnerCensus { owners: DrawOwnerCensusEntry[]; attributedCalls: number; rendererCalls: number; sampledAtFrame: number }
export interface DrawRecorderTarget {
  renderBufferDirect: (camera: Camera, scene: Scene | null, geometry: BufferGeometry, material: Material, object: Object3D, group: { start: number; count: number } | null) => void;
  info: { render: { calls: number } };
}
export interface DrawOwnerRecorder { arm(): void; finish(frame: number): DrawOwnerCensus | null }

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
        const owner = ownerName(object, root, ownerDepth);
        const instanced = Boolean((object as InstancedMesh).isInstancedMesh);
        const instances = instanced ? (object as InstancedMesh).count : 1;
        const vertices = group ? group.count : (geometry.index?.count ?? geometry.getAttribute("position")?.count ?? 0);
        const entry = byOwner.get(owner) ?? { owner, calls: 0, triangles: 0, instanced };
        entry.calls += 1;
        entry.triangles += Math.floor(vertices / 3) * instances;
        entry.instanced = entry.instanced || instanced;
        byOwner.set(owner, entry);
        wrapped.call(target, camera, scene, geometry, material, object, group);
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
