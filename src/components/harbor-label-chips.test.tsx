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

  it("adds at most one ceremony nameplate and never duplicates the selected ship", () => {
    const world = labelWorld();
    const props = { containerRef: createRef<HTMLDivElement>(), onSelectDetail: vi.fn(), world };
    const view = render(
      <HarborLabelChips {...props} nameplate={{ detailId: "ship.arrival", retiring: false }} />,
    );
    expect(Array.from(view.container.querySelectorAll<HTMLElement>("[data-detail-id]"), (chip) => chip.dataset.detailId))
      .toEqual(["ship.arrival"]);
    view.rerender(
      <HarborLabelChips
        {...props}
        nameplate={{ detailId: "ship.arrival", retiring: false }}
        selectedShipDetailId="ship.chain-0"
      />,
    );
    expect(view.container.querySelectorAll("[data-detail-id]")).toHaveLength(2);
    view.rerender(
      <HarborLabelChips
        {...props}
        nameplate={{ detailId: "ship.chain-0", retiring: true }}
        selectedShipDetailId="ship.chain-0"
      />,
    );
    const chips = view.container.querySelectorAll<HTMLElement>("[data-detail-id]");
    expect(chips).toHaveLength(1);
    expect(chips[0]!.dataset.retiring).toBeUndefined();
  });

  it("projects ship anchors, steps the lower-supply overlap down, and excludes the lighthouse", () => {
    const containerRef = createRef<HTMLDivElement>();
    const onSelectDetail = vi.fn();
    const world = labelWorld();
    const view = render(
      <HarborLabelChips
        containerRef={containerRef}
        nameplate={{ detailId: "ship.chain-0", retiring: false }}
        onSelectDetail={onSelectDetail}
        selectedShipDetailId="ship.chain-1"
        world={world}
      />,
    );
    const chips = Array.from(view.container.querySelectorAll<HTMLElement>("[data-detail-id]"));
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(domRect(100, 18));
    }

    const anchorsByDetailId = new Map([
      ["ship.chain-0", { x: 200, y: 100 }],
      ["ship.chain-1", { x: 200, y: 100 }],
    ]);
    const frame = {
      anchorsByDetailId,
      lighthouseRect: { x: 375, y: 145, width: 100, height: 40 },
      viewport: { width: 1_200, height: 600 },
      zoom: 1,
    };
    updateHarborLabelChipLayout(containerRef.current, frame);

    const larger = view.container.querySelector<HTMLElement>('[data-detail-id="ship.chain-0"]')!;
    const smaller = view.container.querySelector<HTMLElement>('[data-detail-id="ship.chain-1"]')!;
    expect(larger.style.transform).toBe("translate(150px, 76px)");
    expect(smaller.style.transform).toBe("translate(150px, 96px)");
    expect(chips.every((chip) => chip.dataset.visible === "true")).toBe(true);

    updateHarborLabelChipLayout(containerRef.current, {
      ...frame,
      lighthouseRect: { x: 100, y: 60, width: 220, height: 80 },
    });
    expect(chips.every((chip) => chip.dataset.visible === "false")).toBe(true);

    fireEvent.click(larger);
    expect(onSelectDetail).toHaveBeenCalledWith("ship.chain-0");
  });

  it("hides a retiring nameplate while it stays mounted for the fade-out", () => {
    const containerRef = createRef<HTMLDivElement>();
    const world = labelWorld();
    const props = { containerRef, onSelectDetail: vi.fn(), world };
    const view = render(<HarborLabelChips {...props} nameplate={{ detailId: "ship.arrival", retiring: false }} />);
    const frame = {
      anchorsByDetailId: new Map([["ship.arrival", { x: 400, y: 300 }]]),
      lighthouseRect: { x: -1, y: -1, width: 0, height: 0 },
      viewport: { width: 1_200, height: 600 },
      zoom: 1,
    };
    updateHarborLabelChipLayout(containerRef.current, frame);
    const chip = view.container.querySelector<HTMLElement>('[data-detail-id="ship.arrival"]')!;
    expect(chip.dataset.visible).toBe("true");

    view.rerender(<HarborLabelChips {...props} nameplate={{ detailId: "ship.arrival", retiring: true }} />);
    updateHarborLabelChipLayout(containerRef.current, frame);
    expect(view.container.querySelector('[data-detail-id="ship.arrival"]')).toBe(chip);
    expect(chip.dataset.visible).toBe("false");
  });

  it("keeps every on-screen chip visible at whole-map and sailed-in zooms alike", () => {
    const containerRef = createRef<HTMLDivElement>();
    const world = labelWorld();
    const view = render(
      <HarborLabelChips
        containerRef={containerRef}
        nameplate={{ detailId: "ship.arrival", retiring: false }}
        onSelectDetail={vi.fn()}
        selectedShipDetailId="ship.chain-2"
        world={world}
      />,
    );
    const chips = Array.from(view.container.querySelectorAll<HTMLElement>("[data-detail-id]"));
    expect(chips).toHaveLength(2);
    for (const chip of chips) {
      vi.spyOn(chip, "getBoundingClientRect").mockReturnValue(domRect(100, 18));
    }
    // Selected/nameplate captions remain visible across zoom levels.
    const frame = {
      anchorsByDetailId: new Map([
        ["ship.chain-2", { x: 320, y: 100 }],
        ["ship.arrival", { x: 400, y: 300 }],
      ]),
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
