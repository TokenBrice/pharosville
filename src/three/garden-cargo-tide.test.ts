import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { DockCargoTide, DockNode } from "../systems/world-types";
import {
  cargoTideCrateCount,
  cargoTideSpecs,
  createGardenCargoTide,
} from "./garden-cargo-tide";
import { CARGO_TIDE_SLOTS, type DockVisual } from "./garden-docks";

function tide(overrides: Partial<DockCargoTide> = {}): DockCargoTide {
  return {
    burnVolumeUsd: 1_000_000,
    coinCount: 1,
    direction: "minting",
    mintVolumeUsd: 9_000_000,
    netFlowUsd: 8_000_000,
    pressureScore: 80,
    reason: "tracked",
    tracked: true,
    ...overrides,
  };
}

/** A harbour placed and yawed like a composed one, with authored tide lanes. */
function dockVisual(chainId: string, cargoTide: DockCargoTide | undefined, yaw = 0): DockVisual {
  const visual = {
    cargoTideLanes: {
      aboard: Array.from({ length: CARGO_TIDE_SLOTS }, (_, index) => ({ x: index, y: 0.21, z: 0 })),
      ashore: Array.from({ length: CARGO_TIDE_SLOTS }, (_, index) => ({ x: -index, y: 0.62, z: 3 })),
    },
    dock: { chainId, detailId: `dock.${chainId}`, ...(cargoTide ? { cargoTide } : {}) } as DockNode,
    root: {
      position: new Vector3(10, 0, -4),
      rotation: { y: yaw },
    },
  } as unknown as DockVisual;
  return visual;
}

describe("cargoTideCrateCount", () => {
  it("stands nothing at an unmeasured harbour", () => {
    expect(cargoTideCrateCount(tide({ tracked: false, reason: "chain-not-in-scope" }))).toBe(0);
    expect(cargoTideCrateCount(undefined)).toBe(0);
  });

  it("stands nothing at a harbour that moved no supply, or moved it evenly", () => {
    expect(cargoTideCrateCount(tide({ direction: "inactive", pressureScore: null }))).toBe(0);
    expect(cargoTideCrateCount(tide({ direction: "flat", pressureScore: 0 }))).toBe(0);
  });

  it("always stands at least one crate for a harbour that did move supply", () => {
    // A one-sided day worth $1 and a one-sided day worth $1B are both worth
    // seeing; what must never happen is a real tide rounding away to an empty
    // quay, which reads as "not measured".
    expect(cargoTideCrateCount(tide({ pressureScore: 0.4 }))).toBe(1);
  });

  it("grows the run with how one-sided the day was, and caps it", () => {
    expect(cargoTideCrateCount(tide({ pressureScore: 50 }))).toBe(CARGO_TIDE_SLOTS / 2);
    expect(cargoTideCrateCount(tide({ pressureScore: 100 }))).toBe(CARGO_TIDE_SLOTS);
    expect(cargoTideCrateCount(tide({ direction: "burning", pressureScore: -100 })))
      .toBe(CARGO_TIDE_SLOTS);
  });
});

describe("cargoTideSpecs", () => {
  it("puts minting cargo on the pier lane and burning cargo on the quay lane", () => {
    // Direction is POSITION here, so the two must never resolve to the same
    // berths — this is the assertion that a flipped sign would break.
    const minting = cargoTideSpecs([dockVisual("ethereum", tide({ pressureScore: 100 }))]);
    const burning = cargoTideSpecs([
      dockVisual("ethereum", tide({ direction: "burning", netFlowUsd: -8_000_000, pressureScore: -100 })),
    ]);

    expect(minting[0]!.slots[1]).toMatchObject({ x: 11, y: 0.21, z: -4 });
    expect(burning[0]!.slots[1]).toMatchObject({ x: 9, y: 0.62, z: -1 });
    expect(minting[0]!.slots).not.toEqual(burning[0]!.slots);
  });

  it("carries slots through the harbour's own yaw", () => {
    // The tide is one mesh for the whole ring and has no per-harbour parent to
    // inherit a transform from, so the rotation has to be applied here or every
    // crate lands beside the wrong quay.
    const [spec] = cargoTideSpecs([
      dockVisual("ethereum", tide({ pressureScore: 100 }), Math.PI / 2),
    ]);

    expect(spec!.yaw).toBeCloseTo(Math.PI / 2);
    // Local +X maps to world -Z under a quarter turn about Y.
    expect(spec!.slots[1]!.x).toBeCloseTo(10);
    expect(spec!.slots[1]!.z).toBeCloseTo(-5);
  });

  it("skips harbours with no tide entirely", () => {
    expect(cargoTideSpecs([
      dockVisual("solana", tide({ tracked: false, reason: "chain-not-in-scope" })),
      dockVisual("base", undefined),
    ])).toEqual([]);
  });
});

describe("createGardenCargoTide", () => {
  it("draws every harbour's cargo in one instanced call", () => {
    const specs = cargoTideSpecs([
      dockVisual("ethereum", tide({ pressureScore: 100 })),
      dockVisual("arbitrum", tide({ direction: "burning", netFlowUsd: -1, pressureScore: -100 })),
    ]);
    const cargo = createGardenCargoTide(specs);

    const meshes = cargo.root.children.filter((child) => child instanceof InstancedMesh);
    expect(meshes).toHaveLength(1);
    expect(cargo.count).toBe(CARGO_TIDE_SLOTS * 2);
    expect((meshes[0] as InstancedMesh).count).toBe(CARGO_TIDE_SLOTS * 2);
    cargo.dispose();
  });

  it("builds the named group even when no harbour has a tide, and costs no draw", () => {
    // The overview LOD policy resolves props by name at compose time; a group
    // that vanished on a quiet day would silently drop out of that scan.
    const cargo = createGardenCargoTide([]);

    expect(cargo.root.name).toBe("dock-cargo-tide");
    expect(cargo.count).toBe(0);
    expect(cargo.root.children).toHaveLength(0);
  });

  it("stands each crate at exactly its authored berth, hashed rather than random", () => {
    const specs = cargoTideSpecs([dockVisual("ethereum", tide({ pressureScore: 100 }))]);
    const first = createGardenCargoTide(specs);
    const second = createGardenCargoTide(specs);

    const read = (cargo: ReturnType<typeof createGardenCargoTide>, index: number) => {
      const mesh = cargo.root.children.find((child) => child instanceof InstancedMesh) as InstancedMesh;
      const matrix = new Matrix4();
      mesh.getMatrixAt(index, matrix);
      return matrix.toArray();
    };

    expect(read(first, 3)).toEqual(read(second, 3));
    const position = new Vector3().setFromMatrixPosition(
      new Matrix4().fromArray(read(first, 2)),
    );
    expect(position.x).toBeCloseTo(specs[0]!.slots[2]!.x);
    expect(position.z).toBeCloseTo(specs[0]!.slots[2]!.z);
    first.dispose();
    second.dispose();
  });
});
