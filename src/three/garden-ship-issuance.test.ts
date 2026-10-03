import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { denseQuietArtInput, SCENARIOS } from "../__fixtures__/data-contract-scenarios";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import type { ShipVisual } from "./garden-ships";
import { createGardenShipIssuanceWorksets, shipIssuanceWorksetSpecs } from "./garden-ship-issuance";

function visual(name: "largeMint" | "largeRedemption" | "largeBalancedGross" | "quietNormal" | "partialFlow"): ShipVisual {
  const input = structuredClone(SCENARIOS[name]);
  const ship = buildPharosVilleWorld(input).ships.find((entry) => entry.id === input.mintBurn!.coins[0]!.stablecoinId)!;
  return { ship, selectionRadius: 2 } as ShipVisual;
}

function matrices(ship: ShipVisual, yaw: number): Matrix4[] {
  const cargo = createGardenShipIssuanceWorksets(shipIssuanceWorksetSpecs([ship]));
  cargo.place(0, 0, 1, 0, yaw);
  cargo.flush({ detail: 1, overview: true, reducedMotion: true, timeSeconds: 100 });
  const mesh = cargo.root.children.find((child) => child instanceof InstancedMesh) as InstancedMesh | undefined;
  const result = Array.from({ length: cargo.count }, (_, index) => {
    const matrix = new Matrix4();
    mesh!.getMatrixAt(index, matrix);
    return matrix;
  });
  cargo.dispose();
  return result;
}

describe("categorical issuance cargo", () => {
  it.each([0, Math.PI / 2])("balanced gross has opposing static cargo while inactivity has none: yaw %s", (yaw) => {
    const balanced = matrices(visual("largeBalancedGross"), yaw).map((matrix) => new Vector3().setFromMatrixPosition(matrix));
    expect(balanced).toHaveLength(2);
    expect(balanced[0]!.y).toBeCloseTo(0.68);
    expect(balanced[1]!.y).toBeCloseTo(0.48);
    const along = balanced.map((position) => position.x * Math.cos(yaw) - position.z * Math.sin(yaw));
    expect(along[0]).toBeLessThan(0);
    expect(along[1]).toBeGreaterThan(0);
    expect(matrices(visual("quietNormal"), yaw)).toEqual([]);
    expect(matrices(visual("partialFlow"), yaw)).toEqual([]);
    const mint = matrices(visual("largeMint"), yaw);
    const redeem = matrices(visual("largeRedemption"), yaw);
    expect(mint.map((matrix) => new Vector3().setFromMatrixPosition(matrix).y)).toEqual([expect.closeTo(0.68), expect.closeTo(0.68)]);
    expect(redeem.map((matrix) => new Vector3().setFromMatrixPosition(matrix).y)).toEqual([expect.closeTo(0.48), expect.closeTo(0.48)]);
  });

  it("keeps categorical pose independent of intensity and holds the reported largest-event lift static", () => {
    const ship = visual("largeMint");
    const changed = { ...ship, ship: { ...ship.ship, issuance: { ...ship.ship.issuance!, intensity: 100 } } };
    expect(matrices(changed, 0)).toEqual(matrices(ship, 0));
    const eventShip = { ...ship, ship: { ...ship.ship, issuance: { ...ship.ship.issuance!, largestEvent24h: { direction: "mint" as const, amountUsd: 1_000_000, timestamp: 1_699_999_000 } } } };
    const cargo = createGardenShipIssuanceWorksets(shipIssuanceWorksetSpecs([eventShip]));
    cargo.place(0, 0, 1, 0, 0);
    const mesh = cargo.root.children[0] as InstancedMesh;
    for (const timeSeconds of [0, 10, 20]) {
      cargo.flush({ detail: 1, overview: true, reducedMotion: false, timeSeconds });
      const matrix = new Matrix4();
      mesh.getMatrixAt(1, matrix);
      expect(new Vector3().setFromMatrixScale(matrix).y).toBeCloseTo(1.3);
    }
    cargo.dispose();
  });

  it.each(["oneDollarNet", "largeMint"] as const)("materiality gates moving work without erasing its categorical pose: %s", (name) => {
    const input = structuredClone(SCENARIOS[name]);
    const ship = buildPharosVilleWorld(input).ships.find((entry) => entry.id === "usdc-circle")!;
    const cargo = createGardenShipIssuanceWorksets(shipIssuanceWorksetSpecs([{ ship, selectionRadius: 2 } as ShipVisual]));
    cargo.place(0, 0, 1, 0, 0);
    const mesh = cargo.root.children[0] as InstancedMesh;
    const before = new Matrix4();
    const after = new Matrix4();
    cargo.flush({ detail: 1, overview: true, reducedMotion: false, timeSeconds: 0 });
    mesh.getMatrixAt(0, before);
    cargo.flush({ detail: 1, overview: true, reducedMotion: false, timeSeconds: 10 });
    mesh.getMatrixAt(0, after);
    if (name === "oneDollarNet") {
      expect(after).toEqual(before);
      expect(new Vector3().setFromMatrixPosition(after).y).toBeCloseTo(0.68);
      expect(ship.issuance!.netFlow24hUsd).toBe(1);
    } else expect(new Vector3().setFromMatrixPosition(after).y).not.toBeCloseTo(new Vector3().setFromMatrixPosition(before).y);
    cargo.dispose();
  });

  it("keeps the fourth eligible cargo static at overview without suppressing its near work", () => {
    const input = denseQuietArtInput();
    const ids = input.mintBurn!.coins.slice(0, 4).map((row) => row.stablecoinId);
    for (const row of input.mintBurn!.coins) if (ids.includes(row.stablecoinId)) Object.assign(row, {
      mintVolume24hUsd: 2_000_000, burnVolume24hUsd: 0, netFlow24hUsd: 2_000_000,
    });
    const ships = buildPharosVilleWorld(input).ships.filter((ship) => ids.includes(ship.id));
    const specs = shipIssuanceWorksetSpecs(ships.map((ship) => ({ ship, selectionRadius: 2 } as ShipVisual)));
    const cargo = createGardenShipIssuanceWorksets(specs);
    const fourth = specs.findIndex((spec) => !spec.overviewWork);
    const first = specs.findIndex((spec) => spec.overviewWork);
    const mesh = cargo.root.children[0] as InstancedMesh;
    for (let index = 0; index < specs.length; index += 1) cargo.place(index, 0, 1, 0, 0);
    const pose = (index: number) => {
      const matrix = new Matrix4();
      mesh.getMatrixAt(index * 2, matrix);
      return matrix;
    };
    cargo.flush({ detail: 1, overview: true, reducedMotion: false, timeSeconds: 0 });
    const held = pose(fourth);
    const working = pose(first);
    cargo.flush({ detail: 1, overview: true, reducedMotion: false, timeSeconds: 10 });
    expect(pose(fourth)).toEqual(held);
    expect(pose(first)).not.toEqual(working);
    cargo.flush({ detail: 1, overview: false, reducedMotion: false, timeSeconds: 20 });
    expect(pose(fourth)).not.toEqual(held);
    cargo.dispose();
  });
});
