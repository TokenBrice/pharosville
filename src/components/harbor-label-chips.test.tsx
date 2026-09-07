// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DockNode, PharosVilleWorld } from "../systems/world-types";
import { HarborLabelChips, updateHarborLabelChipLayout } from "./harbor-label-chips";

afterEach(cleanup);

describe("HarborLabelChips", () => {
  it("removes harbor and pigeonnier captions while retaining selected ship captions", () => {
    const world = labelWorld();
    const props = { containerRef: createRef<HTMLDivElement>(), onSelectDetail: vi.fn(), world };
    const view = render(<HarborLabelChips {...props} />);
    expect(view.container.querySelectorAll("[data-detail-id]")).toHaveLength(0);
    view.rerender(<HarborLabelChips {...props} selectedShipDetailId="ship.chain-0" />);
    expect(view.container.querySelectorAll("[data-detail-id]")).toHaveLength(1);
    expect(view.container.textContent).not.toContain("Concentrated");
  });
  it("projects ship anchors, steps the lower-supply overlap down, and excludes the lighthouse", () => {
    const containerRef = createRef<HTMLDivElement>();
    const onSelectDetail = vi.fn();
    const world = labelWorld();
    const view = render(
      <HarborLabelChips containerRef={containerRef} onSelectDetail={onSelectDetail} world={world} arrivalShipDetailIds={Object.keys(world.entityById)} />,
    );
    const chips = Array.from(view.container.querySelectorAll<HTMLElement>("[data-detail-id]"));
    expect(chips).toHaveLength(9);
    for (const chip of chips) {
      vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(domRect(100, 18));
    }

    const anchorsByDetailId = new Map<string, { x: number; y: number }>();
    for (let index = 0; index < 9; index += 1) {
      anchorsByDetailId.set(index < 8 ? `ship.chain-${index}` : "ship.arrival", {
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

    const larger = view.container.querySelector<HTMLElement>('[data-detail-id="ship.chain-0"]')!;
    const smaller = view.container.querySelector<HTMLElement>('[data-detail-id="ship.chain-1"]')!;
    const lighthouseOccluded = view.container.querySelector<HTMLElement>('[data-detail-id="ship.chain-3"]')!;
    expect(larger.style.transform).toBe("translate(150px, 76px)");
    expect(smaller.style.transform).toBe("translate(150px, 96px)");
    expect(lighthouseOccluded.dataset.visible).toBe("false");
    expect(chips.filter((chip) => chip.dataset.visible === "true")).toHaveLength(8);

    fireEvent.click(larger);
    expect(onSelectDetail).toHaveBeenCalledWith("ship.chain-0");
  });

  it("keeps every on-screen chip visible at whole-map and sailed-in zooms alike", () => {
    const containerRef = createRef<HTMLDivElement>();
    const world = labelWorld();
    const view = render(
      <HarborLabelChips containerRef={containerRef} onSelectDetail={vi.fn()} world={world} arrivalShipDetailIds={Object.keys(world.entityById)} />,
    );
    const chips = Array.from(view.container.querySelectorAll<HTMLElement>("[data-detail-id]"));
    for (const chip of chips) {
      vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(domRect(100, 18));
    }
    // Selected/arrival captions remain visible across zoom levels.
    const anchorsByDetailId = new Map(world.docks.map((dock, index) => [dock.detailId.replace("dock.", "ship."), { x: 60 + index * 130, y: 100 }]));
    anchorsByDetailId.set("ship.arrival", { x: 400, y: 300 });
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
    entityById: Object.fromEntries([...docks, { detailId: "pigeonnier", label: "Arrival", totalUsd: 0 }].map((dock) => [dock.detailId === "pigeonnier" ? "ship.arrival" : dock.detailId.replace("dock.", "ship."), {
      kind: "ship", label: dock.label, marketCapUsd: dock.totalUsd, riskZone: "calm",
    }])),
  } as unknown as PharosVilleWorld;
}

function domRect(width: number, height: number): DOMRect {
  return { bottom: height, height, left: 0, right: width, top: 0, width, x: 0, y: 0, toJSON: () => ({}) };
}
