// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { useShipLogoAssets } from "./use-ship-logo-assets";

const requestedSources: string[] = [];

class LoadedImage {
  decoding = "";
  onerror: OnErrorEventHandler | null = null;
  onload: ((event: Event) => void) | null = null;
  private value = "";

  get src(): string {
    return this.value;
  }

  set src(value: string) {
    this.value = value;
    if (!value) return;
    requestedSources.push(value);
    queueMicrotask(() => this.onload?.(new Event("load")));
  }
}

function Harness({ world }: { world: PharosVilleWorldModel }) {
  const result = useShipLogoAssets({ world });
  return (
    <output
      data-generation={result.logos.getLogoGenerationKey()}
      data-load-tick={result.logoGeneration}
    />
  );
}

describe("useShipLogoAssets", () => {
  beforeEach(() => {
    requestedSources.length = 0;
    vi.stubGlobal("Image", LoadedImage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads only unique ship logos", async () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput());
    const firstShip = base.ships[0]!;
    const duplicate = {
      ...firstShip,
      detailId: `${firstShip.detailId}.duplicate`,
      id: `${firstShip.id}.duplicate`,
    };
    const world = {
      ...base,
      ships: [...base.ships, duplicate],
    } as PharosVilleWorldModel;

    const { container } = render(<Harness world={world} />);
    await act(async () => {});

    expect(requestedSources).toEqual(
      [...new Set(world.ships.map((ship) => ship.logoSrc).filter(Boolean))].sort(),
    );
    expect(container.querySelector("output")?.dataset).toMatchObject({
      generation: "lg1",
      loadTick: "1",
    });
  });

  it("does not reload logos for a structurally identical world", async () => {
    const worldA = buildPharosVilleWorld(makePharosVilleWorldInput());
    const worldB = buildPharosVilleWorld(makePharosVilleWorldInput());
    const { rerender } = render(<Harness world={worldA} />);
    await act(async () => {});
    const callsAfterMount = requestedSources.length;

    await act(async () => {
      rerender(<Harness world={worldB} />);
    });

    expect(requestedSources).toHaveLength(callsAfterMount);
  });
});
