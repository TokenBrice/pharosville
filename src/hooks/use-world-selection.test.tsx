// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { useWorldSelection } from "./use-world-selection";

describe("useWorldSelection", () => {
  it("selects nothing by default", () => {
    // S1: arriving at the harbour opens no detail panel. It used to default to
    // the lighthouse, which put a panel over the world on every visit and then
    // persisted `sel=lighthouse` into the URL so it outlived that visit.
    const { result } = renderHook(() => useWorldSelection({ world: worldFixture() }));

    expect(result.current.selectedDetailId).toBeNull();
    expect(result.current.selectedEntity).toBeNull();
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

  it("queues rapid announcements instead of clobbering the live region text", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useWorldSelection({ world: worldFixture() }));

    try {
      act(() => {
        result.current.setAnnouncement("Harbor data updated.");
        result.current.setAnnouncement("Selected USDC.");
      });

      expect(result.current.announcement).toBe("Harbor data updated.");

      act(() => {
        vi.advanceTimersByTime(200);
      });

      expect(result.current.announcement).toBe("Selected USDC.");
    } finally {
      unmount();
      vi.useRealTimers();
    }
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
