// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DockNode, PharosVilleWorld } from "../systems/world-types";
import { HarborLabelChips, updateHarborLabelChipLayout } from "./harbor-label-chips";

afterEach(cleanup);

describe("HarborLabelChips", () => {
  it("projects nine anchors, steps the lower-supply overlap down, and excludes the lighthouse", () => {
    const containerRef = createRef<HTMLDivElement>();
    const onSelectDetail = vi.fn();
    const world = labelWorld();
    const view = render(
      <HarborLabelChips containerRef={containerRef} onSelectDetail={onSelectDetail} world={world} />,
    );
    const chips = Array.from(view.container.querySelectorAll<HTMLElement>("[data-detail-id]"));
    expect(chips).toHaveLength(9);
    for (const chip of chips) {
      vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(domRect(100, 22));
    }

    const anchorsByDetailId = new Map<string, { x: number; y: number }>();
    for (let index = 0; index < 9; index += 1) {
      anchorsByDetailId.set(index < 8 ? `dock.chain-${index}` : "pigeonnier", {
        x: index < 2 ? 200 : 100 + index * 110,
        y: index < 2 ? 100 : 180,
      });
    }
    updateHarborLabelChipLayout(containerRef.current, {
      anchorsByDetailId,
      lighthouseRect: { x: 375, y: 145, width: 100, height: 40 },
      viewport: { width: 1_200, height: 600 },
      zoom: 1,
    });

    const larger = view.container.querySelector<HTMLElement>('[data-detail-id="dock.chain-0"]')!;
    const smaller = view.container.querySelector<HTMLElement>('[data-detail-id="dock.chain-1"]')!;
    const lighthouseOccluded = view.container.querySelector<HTMLElement>('[data-detail-id="dock.chain-3"]')!;
    expect(larger.style.transform).toBe("translate(150px, 72px)");
    expect(smaller.style.transform).toBe("translate(150px, 96px)");
    expect(lighthouseOccluded.dataset.visible).toBe("false");
    expect(chips.filter((chip) => chip.dataset.visible === "true")).toHaveLength(8);

    fireEvent.click(larger);
    expect(onSelectDetail).toHaveBeenCalledWith("dock.chain-0");
  });

  it("keeps every on-screen chip visible at whole-map and sailed-in zooms alike", () => {
    const containerRef = createRef<HTMLDivElement>();
    const world = labelWorld();
    const view = render(
      <HarborLabelChips containerRef={containerRef} onSelectDetail={vi.fn()} world={world} />,
    );
    const chips = Array.from(view.container.querySelectorAll<HTMLElement>("[data-detail-id]"));
    for (const chip of chips) {
      vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(domRect(100, 22));
    }
    // Well-separated anchors so no collision or exclusion hides anything: the
    // only variable under test is zoom, and the operator's decision is that
    // station chips are always on — whole-map is where all nine share a frame.
    const anchorsByDetailId = new Map(world.docks.map((dock, index) => [dock.detailId, { x: 60 + index * 130, y: 100 }]));
    anchorsByDetailId.set(world.pigeonnier.detailId, { x: 400, y: 300 });
    const frame = {
      anchorsByDetailId,
      lighthouseRect: { x: -1, y: -1, width: 0, height: 0 },
      viewport: { width: 1_200, height: 600 },
      zoom: 0.3,
    };

    for (const zoom of [0.3, 0.49, 1, 1.81, 2.4]) {
      updateHarborLabelChipLayout(containerRef.current, { ...frame, zoom });
      expect(chips.every((chip) => chip.dataset.visible === "true")).toBe(true);
    }
  });
});

function labelWorld(): PharosVilleWorld {
  const docks = Array.from({ length: 8 }, (_, index): DockNode => ({
    id: `dock.chain-${index}`,
    kind: "dock",
    label: `Chain ${index}`,
    chainId: `chain-${index}`,
    tile: { x: index, y: index },
    station: { coveId: "north-watch", type: "uogashi", shoreBearing: 0 },
    totalUsd: 8_000 - index * 1_000,
    size: 7,
    healthBand: "healthy",
    stablecoinCount: 1,
    concentration: index / 10,
    logoPath: index === 0 ? "/chains/ethereum.svg" : null,
    detailId: `dock.chain-${index}`,
    harboredStablecoins: [],
  }));
  return {
    docks,
    pigeonnier: {
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "TON Pigeonnier",
      tile: { x: 10, y: 10 },
      detailId: "pigeonnier",
    },
    entityById: {},
  } as unknown as PharosVilleWorld;
}

function domRect(width: number, height: number): DOMRect {
  return { bottom: height, height, left: 0, right: width, top: 0, width, x: 0, y: 0, toJSON: () => ({}) };
}
