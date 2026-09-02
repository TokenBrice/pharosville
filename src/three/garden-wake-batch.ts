import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  type BufferGeometry,
  type Material,
} from "three";

export const WAKE_TRAIL_QUADS = 7;
export const WAKE_BOW_QUADS = 2;

export interface GardenWakeBatch {
  root: Group;
  trails: InstancedMesh;
  bows: InstancedMesh;
  /** Writes one ship's wake matrices; hidden ships collapse to zero scale. */
  setShip(
    slot: number,
    pose: {
      x: number;
      y: number;
      z: number;
      headingY: number;
      hullScale: number;
    },
    visible: boolean,
    intensityScaleX: number,
  ): void;
  /** Marks both instance buffers for upload after this frame's writes. */
  commit(): void;
  dispose(): void;
}

const UP = new Vector3(0, 1, 0);
const IDENTITY_QUATERNION = new Quaternion();
const scratchShipMatrix = new Matrix4();
const scratchLocalMatrix = new Matrix4();
const scratchWorldMatrix = new Matrix4();
const scratchPosition = new Vector3();
const scratchQuaternion = new Quaternion();
const scratchScale = new Vector3();
const hiddenMatrix = new Matrix4().makeScale(0, 0, 0);

export function createGardenWakeBatch(
  capacity: number,
  material: Material,
  quadGeometry: BufferGeometry,
): GardenWakeBatch {
  // A plane has no volume: DoubleSide's transparent back/front two-pass path
  // only draws one surviving face per view, so one raster pass is equivalent.
  material.forceSinglePass = true;
  const root = new Group();
  root.name = "fleet-wakes";

  const trails = new InstancedMesh(
    quadGeometry,
    material,
    capacity * WAKE_TRAIL_QUADS,
  );
  trails.name = "fleet-wake-trails";
  trails.frustumCulled = false;
  trails.instanceMatrix.setUsage(DynamicDrawUsage);

  const bows = new InstancedMesh(
    quadGeometry,
    material,
    capacity * WAKE_BOW_QUADS,
  );
  bows.name = "fleet-wake-bows";
  bows.frustumCulled = false;
  bows.instanceMatrix.setUsage(DynamicDrawUsage);

  root.add(trails, bows);
  const writtenGeneration = new Uint32Array(capacity);
  const activeSlots = new Uint8Array(capacity);
  let generation = 1;

  // InstancedMesh initializes every slot to identity. Collapse the spare
  // capacity now so slots that have never held a ship cannot draw at origin.
  for (let index = 0; index < trails.count; index += 1) {
    trails.setMatrixAt(index, hiddenMatrix);
  }
  for (let index = 0; index < bows.count; index += 1) {
    bows.setMatrixAt(index, hiddenMatrix);
  }
  trails.instanceMatrix.needsUpdate = true;
  bows.instanceMatrix.needsUpdate = true;

  return {
    root,
    trails,
    bows,
    setShip(slot, pose, visible, intensityScaleX) {
      if (slot < 0 || slot >= capacity) return;
      writtenGeneration[slot] = generation;
      const trailBase = slot * WAKE_TRAIL_QUADS;
      const bowBase = slot * WAKE_BOW_QUADS;
      if (!visible) {
        if (activeSlots[slot] === 0) return;
        for (let index = 0; index < WAKE_TRAIL_QUADS; index += 1) {
          trails.setMatrixAt(trailBase + index, hiddenMatrix);
        }
        for (let index = 0; index < WAKE_BOW_QUADS; index += 1) {
          bows.setMatrixAt(bowBase + index, hiddenMatrix);
        }
        activeSlots[slot] = 0;
        return;
      }
      activeSlots[slot] = 1;

      scratchPosition.set(pose.x, pose.y, pose.z);
      scratchQuaternion.setFromAxisAngle(UP, pose.headingY);
      scratchScale.setScalar(pose.hullScale);
      scratchShipMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);

      for (let index = 0; index < WAKE_TRAIL_QUADS; index += 1) {
        const age = index / (WAKE_TRAIL_QUADS - 1);
        scratchPosition.set((-2.3 - age * 3.9) * intensityScaleX, -0.34, 0);
        scratchScale.set(
          (1.1 + age * 1.7) * intensityScaleX,
          1,
          0.9 + Math.sin(age * Math.PI) * 2.3,
        );
        scratchLocalMatrix.compose(
          scratchPosition,
          IDENTITY_QUATERNION,
          scratchScale,
        );
        scratchWorldMatrix.multiplyMatrices(scratchShipMatrix, scratchLocalMatrix);
        trails.setMatrixAt(trailBase + index, scratchWorldMatrix);
      }

      for (let index = 0; index < WAKE_BOW_QUADS; index += 1) {
        scratchPosition.set(3.15 * intensityScaleX, -0.34, index === 0 ? -0.62 : 0.62);
        scratchScale.set(2.1 * intensityScaleX, 1, 0.85);
        scratchLocalMatrix.compose(
          scratchPosition,
          IDENTITY_QUATERNION,
          scratchScale,
        );
        scratchWorldMatrix.multiplyMatrices(scratchShipMatrix, scratchLocalMatrix);
        bows.setMatrixAt(bowBase + index, scratchWorldMatrix);
      }
    },
    commit() {
      // A departure can disappear between frames. Clear any slot that was not
      // rewritten so its last wake cannot linger after the hull is gone.
      for (let slot = 0; slot < capacity; slot += 1) {
        if (writtenGeneration[slot] === generation || activeSlots[slot] === 0) continue;
        const trailBase = slot * WAKE_TRAIL_QUADS;
        const bowBase = slot * WAKE_BOW_QUADS;
        for (let index = 0; index < WAKE_TRAIL_QUADS; index += 1) {
          trails.setMatrixAt(trailBase + index, hiddenMatrix);
        }
        for (let index = 0; index < WAKE_BOW_QUADS; index += 1) {
          bows.setMatrixAt(bowBase + index, hiddenMatrix);
        }
        activeSlots[slot] = 0;
      }
      trails.instanceMatrix.needsUpdate = true;
      bows.instanceMatrix.needsUpdate = true;
      generation += 1;
      if (generation === 0xffffffff) {
        writtenGeneration.fill(0);
        generation = 1;
      }
    },
    dispose() {
      trails.dispose();
      bows.dispose();
    },
  };
}
