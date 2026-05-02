// @vitest-environment jsdom
import { useState } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as AssetManagerModule from "../renderer/asset-manager";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { buildBaseMotionPlan, buildMotionPlan } from "../systems/motion";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import { useAssetLoadingPipeline } from "./use-asset-loading-pipeline";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";

describe("useAssetLoadingPipeline", () => {
  let loadLogosSpy: ReturnType<typeof vi.spyOn>;
  let loadCriticalSpy: ReturnType<typeof vi.spyOn>;
  let loadDeferredSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Stub the network-bound load methods. loadLogos resolves immediately so
    // the effect's then-branch fires synchronously inside `act`.
    loadLogosSpy = vi.spyOn(AssetManagerModule.PharosVilleAssetManager.prototype, "loadLogos")
      .mockImplementation(async () => []);
    loadCriticalSpy = vi.spyOn(AssetManagerModule.PharosVilleAssetManager.prototype, "loadCritical")
      .mockImplementation(async () => ({ errors: [], loaded: [] } as unknown as Awaited<ReturnType<AssetManagerModule.PharosVilleAssetManager["loadCritical"]>>));
    loadDeferredSpy = vi.spyOn(AssetManagerModule.PharosVilleAssetManager.prototype, "loadDeferred")
      .mockImplementation(async () => ({ errors: [], loaded: [] } as unknown as Awaited<ReturnType<AssetManagerModule.PharosVilleAssetManager["loadDeferred"]>>));
  });

  afterEach(() => {
    loadLogosSpy.mockRestore();
    loadCriticalSpy.mockRestore();
    loadDeferredSpy.mockRestore();
  });

  function Harness({ world }: { world: PharosVilleWorldModel }) {
    const [baseMotionPlan] = useState(() => buildBaseMotionPlan(world));
    const [motionPlan] = useState(() => buildMotionPlan(world, null, baseMotionPlan));
    const [motionPlanRef] = useState<{ current: typeof motionPlan }>(() => ({ current: motionPlan }));
    useAssetLoadingPipeline({ motionPlanRef, world });
    return null;
  }

  it("does not re-invoke loadLogos when a structurally-identical world replaces the previous reference", async () => {
    // Two world instances built from the same fixture inputs share identical
    // logo source arrays but have distinct array identities — the original
    // effect dep `[world.docks, world.graves, world.ships]` would re-run the
    // body on every rerender. The signature dep must skip it.
    const worldA = buildPharosVilleWorld(makePharosVilleWorldInput());
    const worldB = buildPharosVilleWorld(makePharosVilleWorldInput());
    expect(worldA).not.toBe(worldB);
    expect(worldA.docks).not.toBe(worldB.docks);

    const { rerender } = render(<Harness world={worldA} />);
    // Flush the initial loadLogos promise.
    await act(async () => {});
    const callsAfterMount = loadLogosSpy.mock.calls.length;
    expect(callsAfterMount).toBeGreaterThanOrEqual(1);

    // Rerender with a structurally-identical but reference-distinct world.
    await act(async () => {
      rerender(<Harness world={worldB} />);
    });

    // No additional loadLogos invocation should have been triggered: the
    // signature memo collapsed worldB.docks/graves/ships into the same string.
    expect(loadLogosSpy.mock.calls.length).toBe(callsAfterMount);
  });
});
