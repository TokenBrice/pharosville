// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { useWorldSelection } from "./use-world-selection";

describe("useWorldSelection", () => {
  it("defaults to the lighthouse selection", () => {
    const { result } = renderHook(() => useWorldSelection({ world: worldFixture() }));

    expect(result.current.selectedDetailId).toBe("lighthouse");
    expect(result.current.selectedEntity?.detailId).toBe("lighthouse");
  });

  it("accepts an initial selected detail id without rebasing after initialization", () => {
    const world = worldFixture();
    const { result, rerender } = renderHook(
      ({ initialSelectedDetailId }) => useWorldSelection({ initialSelectedDetailId, world }),
      { initialProps: { initialSelectedDetailId: "ship.usdc" } },
    );

    expect(result.current.selectedDetailId).toBe("ship.usdc");

    rerender({ initialSelectedDetailId: "lighthouse" });

    expect(result.current.selectedDetailId).toBe("ship.usdc");

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedDetailId).toBeNull();
  });
});

function worldFixture(): PharosVilleWorldModel {
  return {
    detailIndex: {
      lighthouse: { id: "lighthouse", kind: "lighthouse", summary: "Beacon.", title: "Pharos Lighthouse" },
      "ship.usdc": { id: "ship.usdc", kind: "ship", summary: "USDC.", title: "USDC" },
    },
    entityById: {
      lighthouse: { detailId: "lighthouse", id: "lighthouse", kind: "lighthouse" },
      "ship.usdc": { detailId: "ship.usdc", id: "ship.usdc", kind: "ship" },
    },
  } as unknown as PharosVilleWorldModel;
}
