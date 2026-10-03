import { InstancedMesh, Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../__fixtures__/data-contract-scenarios";
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
  cargo.flush({ detail: 1, reducedMotion: true, timeSeconds: 100 });
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
      cargo.flush({ detail: 1, reducedMotion: false, timeSeconds });
      const matrix = new Matrix4();
      mesh.getMatrixAt(1, matrix);
      expect(new Vector3().setFromMatrixScale(matrix).y).toBeCloseTo(1.3);
    }
    cargo.dispose();
  });
});
