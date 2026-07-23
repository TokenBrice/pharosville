import { useEffect, useMemo, useState } from "react";
import type {
  ThreeLogoAsset,
  ThreeLogoAssets,
} from "../renderer/world-renderer-backend";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";

export interface UseAssetLoadingPipelineResult {
  assetLoadTick: number;
  assets: ThreeLogoAssets;
}

class ThreeLogoAssetStore implements ThreeLogoAssets {
  private generation = 0;
  private readonly logos = new Map<string, ThreeLogoAsset>();

  getLogo(src: string | null | undefined): ThreeLogoAsset | null {
    return src ? this.logos.get(src) ?? null : null;
  }

  getRenderAssetGenerationKey(): string {
    return `lg${this.generation}`;
  }

  async load(srcs: readonly string[], signal: AbortSignal): Promise<boolean> {
    const pending = srcs.filter((src) => !this.logos.has(src));
    if (pending.length === 0) return false;

    const settled = await Promise.allSettled(
      pending.map(async (src) => ({ image: await loadLogoImage(src, signal), src })),
    );
    if (signal.aborted) return false;

    let changed = false;
    for (const result of settled) {
      if (result.status !== "fulfilled") continue;
      this.logos.set(result.value.src, result.value);
      changed = true;
    }
    if (changed) this.generation += 1;
    return changed;
  }
}

export function useAssetLoadingPipeline(input: {
  world: PharosVilleWorldModel;
}): UseAssetLoadingPipelineResult {
  const { world } = input;
  const [assets] = useState(() => new ThreeLogoAssetStore());
  const [assetLoadTick, setAssetLoadTick] = useState(0);
  const logoSources = useMemo(
    () => [...new Set(
      world.ships
        .map((ship) => ship.logoSrc)
        .filter((src): src is string => typeof src === "string" && src.startsWith("/")),
    )].sort(),
    [world.ships],
  );
  const logoSourcesSignature = logoSources.join("|");

  useEffect(() => {
    if (!logoSourcesSignature) return;
    const controller = new AbortController();
    void assets.load(logoSources, controller.signal).then((changed) => {
      if (changed && !controller.signal.aborted) {
        setAssetLoadTick((tick) => tick + 1);
      }
    });
    return () => controller.abort();
    // The stable signature prevents identical refetches from restarting loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets, logoSourcesSignature]);

  return { assetLoadTick, assets };
}

function loadLogoImage(src: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const cleanup = () => signal.removeEventListener("abort", handleAbort);
    const handleAbort = () => {
      image.onload = null;
      image.onerror = null;
      image.src = "";
      cleanup();
      reject(new DOMException("Logo load aborted", "AbortError"));
    };

    image.decoding = "async";
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      reject(new Error(`Could not load ship logo ${src}`));
    };
    if (signal.aborted) {
      handleAbort();
      return;
    }
    signal.addEventListener("abort", handleAbort, { once: true });
    image.src = src;
  });
}
