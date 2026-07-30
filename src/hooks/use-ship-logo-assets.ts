import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ThreeLogoAsset,
  ThreeLogoAssets,
} from "../renderer/world-renderer-backend";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { extractSailEmblem } from "../three/garden-sail-emblem";

export interface UseShipLogoAssetsResult {
  logoGeneration: number;
  logos: ThreeLogoAssets;
}

class ThreeLogoAssetStore implements ThreeLogoAssets {
  private disposed = false;
  private expected = 0;
  private generation = 0;
  private readonly logos = new Map<string, ThreeLogoAsset>();

  getLogo(src: string | null | undefined): ThreeLogoAsset | null {
    return src ? this.logos.get(src) ?? null : null;
  }

  getLogoGenerationKey(): string {
    return `lg${this.generation}`;
  }

  getExpectedLogoCount(): number {
    return this.expected;
  }

  getLoadedLogoCount(): number {
    return this.logos.size;
  }

  retain(srcs: readonly string[]): boolean {
    if (this.disposed) return false;
    const retained = new Set(srcs);
    this.expected = retained.size;
    let changed = false;
    for (const [src, asset] of this.logos) {
      if (retained.has(src)) continue;
      closeLogoAsset(asset);
      this.logos.delete(src);
      changed = true;
    }
    if (changed) this.generation += 1;
    return changed;
  }

  async load(
    srcs: readonly string[],
    signal: AbortSignal,
    onAssetReady?: () => void,
  ): Promise<boolean> {
    if (this.disposed) return false;
    const pending = srcs.filter((src) => !this.logos.has(src));
    if (pending.length === 0) return false;

    const settled = await Promise.allSettled(
      pending.map(async (src) => {
        const image = await loadLogoImage(src, signal);
        // H1: separate the mark from its disc ONCE per unique logo, here, rather
        // than per ship in the atlas painter — a coin carried by several ships
        // would otherwise pay for the pixel scan several times over.
        const asset = {
          emblem: extractSailEmblem(
            image,
            "naturalWidth" in image ? image.naturalWidth || image.width : image.width,
            "naturalHeight" in image ? image.naturalHeight || image.height : image.height,
          )?.canvas ?? null,
          image,
          src,
        };
        if (signal.aborted || this.disposed) {
          closeLogoAsset(asset);
          return false;
        }
        // Commit each decode as it settles. Waiting for every fleet logo before
        // changing the generation let one slow image pin every sail to its
        // unresolved fallback.
        this.logos.set(src, asset);
        this.generation += 1;
        onAssetReady?.();
        return true;
      }),
    );
    return settled.some((result) => (
      result.status === "fulfilled" && result.value
    ));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const asset of this.logos.values()) closeLogoAsset(asset);
    this.logos.clear();
  }
}

export function useShipLogoAssets(input: {
  world: PharosVilleWorldModel;
}): UseShipLogoAssetsResult {
  const { world } = input;
  const [logos] = useState(() => new ThreeLogoAssetStore());
  const [logoGeneration, setLogoGeneration] = useState(0);
  const disposalEpochRef = useRef(0);
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
    // Pruning follows an already-committed world change, which schedules its
    // own paint. Only asynchronous arrivals need the React tick below.
    logos.retain(logoSources);
    if (!logoSourcesSignature) return undefined;
    const controller = new AbortController();
    let notificationFrame = 0;
    const notifyAssetReady = () => {
      if (notificationFrame || controller.signal.aborted) return;
      // Many logo decodes can settle together. One React notification per
      // display frame is enough; the renderer reads the store's generation.
      notificationFrame = window.requestAnimationFrame(() => {
        notificationFrame = 0;
        if (!controller.signal.aborted) {
          setLogoGeneration((generation) => generation + 1);
        }
      });
    };
    void logos.load(logoSources, controller.signal, notifyAssetReady).then((changed) => {
      if (changed && !controller.signal.aborted) {
        if (notificationFrame) {
          window.cancelAnimationFrame(notificationFrame);
          notificationFrame = 0;
        }
        setLogoGeneration((generation) => generation + 1);
      }
    });
    return () => {
      controller.abort();
      if (notificationFrame) window.cancelAnimationFrame(notificationFrame);
    };
    // The stable signature prevents identical refetches from restarting loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logos, logoSourcesSignature]);

  useEffect(() => {
    disposalEpochRef.current += 1;
    const epoch = disposalEpochRef.current;
    return () => {
      // React Strict Mode runs setup -> cleanup -> setup while reusing hook
      // state. Defer ownership release one microtask so the second setup can
      // claim a newer epoch; a real unmount has no successor and disposes.
      queueMicrotask(() => {
        if (disposalEpochRef.current === epoch) logos.dispose();
      });
    };
  }, [logos]);

  return { logoGeneration, logos };
}

function closeLogoAsset(asset: ThreeLogoAsset): void {
  if ("close" in asset.image && typeof asset.image.close === "function") {
    asset.image.close();
  }
}

function loadLogoImage(src: string, signal: AbortSignal): Promise<HTMLImageElement | ImageBitmap> {
  // ZERO-style decode budgeting: `createImageBitmap` decodes off the main
  // thread at promise resolution, so the later emblem pixel-scan and atlas
  // repaint never pay a synchronous decode for a logo that `onload` fired
  // for but the browser has not decoded yet. Fetch honours the abort signal
  // natively, replacing the manual `image.src = ""` abort trick.
  return fetch(src, { signal })
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load ship logo ${src}`);
      return response.blob();
    })
    .then((blob): Promise<HTMLImageElement | ImageBitmap> => {
      // Chrome cannot decode SVG through createImageBitmap (the promise
      // rejects with "The source image could not be decoded"), which dropped
      // every vector mark out of the sail atlas and fell the fleet back to
      // painted ticker text. SVG marks take the HTMLImageElement path —
      // `decode()` still awaits the async decode before the pixel scan runs —
      // while raster marks keep the off-main-thread bitmap decode.
      if (blob.type === "image/svg+xml" || src.endsWith(".svg")) {
        const objectUrl = URL.createObjectURL(blob);
        const image = new Image();
        image.src = objectUrl;
        return image.decode().then(
          () => {
            URL.revokeObjectURL(objectUrl);
            return image;
          },
          (error: unknown) => {
            URL.revokeObjectURL(objectUrl);
            throw error;
          },
        );
      }
      return createImageBitmap(blob);
    });
}
