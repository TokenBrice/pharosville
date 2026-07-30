// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildPharosVilleWorld } from "../systems/pharosville-world";
import { makePharosVilleWorldInput } from "../__fixtures__/pharosville-world";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { useShipLogoAssets } from "./use-ship-logo-assets";

const requestedSources: string[] = [];
const closeImageBitmapMock = vi.fn();

/**
 * The loader decodes through `fetch → blob → createImageBitmap` (off-main-thread
 * decode), so the tests stub that pipeline instead of the old `new Image()`
 * one. jsdom has no createImageBitmap; the emblem extractor tolerates a null
 * 2D context, so a bare {width, height} stand-in is enough.
 */
const fetchMock = vi.fn((src: unknown): Promise<Response> => {
  requestedSources.push(String(src));
  return Promise.resolve({
    ok: true,
    blob: () => Promise.resolve(new Blob()),
  } as unknown as Response);
});

const createImageBitmapMock = vi.fn(
  (): Promise<ImageBitmap> => Promise.resolve({
    close: closeImageBitmapMock,
    height: 64,
    width: 64,
  } as unknown as ImageBitmap),
);

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
    closeImageBitmapMock.mockClear();
    fetchMock.mockReset();
    fetchMock.mockImplementation((src: unknown): Promise<Response> => {
      requestedSources.push(String(src));
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob()),
      } as unknown as Response);
    });
    createImageBitmapMock.mockReset();
    createImageBitmapMock.mockImplementation(
      (): Promise<ImageBitmap> => Promise.resolve({
        close: closeImageBitmapMock,
        height: 64,
        width: 64,
      } as unknown as ImageBitmap),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", createImageBitmapMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads only unique ship logos", async () => {
    const decodeMock = vi.fn((): Promise<void> => Promise.resolve());
    class FakeImage {
      src = "";
      naturalWidth = 64;
      naturalHeight = 64;
      decode = decodeMock;
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    }));
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
    // Every unique logo is decoded exactly once, through whichever branch its
    // type takes (raster → createImageBitmap, vector → Image.decode).
    expect(createImageBitmapMock.mock.calls.length + decodeMock.mock.calls.length)
      .toBe(requestedSources.length);
    expect(container.querySelector("output")?.dataset).toMatchObject({
      generation: `lg${requestedSources.length}`,
      loadTick: "1",
    });
  });

  it("decodes raster marks through createImageBitmap", async () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput());
    const rasterShip = { ...base.ships[0]!, logoSrc: "/logos/233-usds.png" };
    const world = { ...base, ships: [rasterShip] } as PharosVilleWorldModel;

    const { container } = render(<Harness world={world} />);
    await act(async () => {});

    expect(requestedSources).toEqual(["/logos/233-usds.png"]);
    expect(createImageBitmapMock).toHaveBeenCalledTimes(1);
    expect(container.querySelector("output")?.dataset).toMatchObject({
      generation: "lg1",
      loadTick: "1",
    });
  });

  it("keeps the logo store alive across the Strict Mode effect replay", async () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput());
    const rasterShip = { ...base.ships[0]!, logoSrc: "/logos/strict.png" };
    const world = { ...base, ships: [rasterShip] } as PharosVilleWorldModel;

    const { container } = render(
      <StrictMode>
        <Harness world={world} />
      </StrictMode>,
    );
    await act(async () => {});

    expect(container.querySelector("output")?.dataset.generation).toBe("lg1");
    expect(createImageBitmapMock).toHaveBeenCalled();
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

  it("publishes each decoded logo without waiting for the slowest asset", async () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput());
    const first = { ...base.ships[0]!, logoSrc: "/logos/first.png" };
    const second = {
      ...base.ships[1]!,
      detailId: `${base.ships[1]!.detailId}.progressive-logo`,
      id: `${base.ships[1]!.id}.progressive-logo`,
      logoSrc: "/logos/second.png",
    };
    const world = { ...base, ships: [first, second] } as PharosVilleWorldModel;
    const deferred: { resolve: ((image: ImageBitmap) => void) | null } = { resolve: null };
    createImageBitmapMock
      .mockResolvedValueOnce({
        close: closeImageBitmapMock,
        height: 64,
        width: 64,
      } as unknown as ImageBitmap)
      .mockImplementationOnce(() => new Promise<ImageBitmap>((resolve) => {
        deferred.resolve = resolve;
      }));
    const logosRef: { current: ReturnType<typeof useShipLogoAssets>["logos"] | null } = {
      current: null,
    };
    function ProgressiveHarness() {
      const result = useShipLogoAssets({ world });
      useEffect(() => {
        logosRef.current = result.logos;
      }, [result.logos]);
      return null;
    }

    render(<ProgressiveHarness />);
    await act(async () => {});

    expect(logosRef.current?.getLogo("/logos/first.png")).not.toBeNull();
    expect(logosRef.current?.getLogo("/logos/second.png")).toBeNull();
    expect(logosRef.current?.getLogoGenerationKey()).toBe("lg1");

    deferred.resolve?.({
      close: closeImageBitmapMock,
      height: 64,
      width: 64,
    } as unknown as ImageBitmap);
    await act(async () => {});

    expect(logosRef.current?.getLogo("/logos/second.png")).not.toBeNull();
    expect(logosRef.current?.getLogoGenerationKey()).toBe("lg2");
  });

  it("decodes SVG marks through HTMLImageElement, never createImageBitmap", async () => {
    // Chrome rejects SVG blobs in createImageBitmap ("The source image could
    // not be decoded"); the loader must branch vector marks to the
    // Image+decode path or the sail atlas falls back to painted ticker text
    // (2026-07-30: PYUSD and ~160 SVG marks rendered as letters).
    fetchMock.mockImplementation((src: unknown): Promise<Response> => {
      requestedSources.push(String(src));
      return Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(new Blob([], { type: "image/svg+xml" })),
      } as unknown as Response);
    });
    const decodeMock = vi.fn((): Promise<void> => Promise.resolve());
    class FakeImage {
      src = "";
      naturalWidth = 64;
      naturalHeight = 64;
      decode = decodeMock;
    }
    vi.stubGlobal("Image", FakeImage);
    vi.stubGlobal("URL", Object.assign(URL, {
      createObjectURL: vi.fn(() => "blob:mock"),
      revokeObjectURL: vi.fn(),
    }));
    const world = buildPharosVilleWorld(makePharosVilleWorldInput());

    const { container } = render(<Harness world={world} />);
    await act(async () => {});

    expect(createImageBitmapMock).not.toHaveBeenCalled();
    expect(decodeMock).toHaveBeenCalledTimes(requestedSources.length);
    expect(container.querySelector("output")?.dataset).toMatchObject({
      generation: `lg${requestedSources.length}`,
      loadTick: "1",
    });
  });

  it("closes decoded bitmaps when their logo source leaves the world", async () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput());
    const first = { ...base.ships[0]!, logoSrc: "/logos/first.png" };
    const second = {
      ...base.ships[1]!,
      detailId: `${base.ships[1]!.detailId}.bitmap-close`,
      id: `${base.ships[1]!.id}.bitmap-close`,
      logoSrc: "/logos/second.png",
    };
    const firstWorld = { ...base, ships: [first, second] } as PharosVilleWorldModel;
    const secondWorld = { ...base, ships: [first] } as PharosVilleWorldModel;
    const { rerender } = render(<Harness world={firstWorld} />);
    await act(async () => {});

    expect(createImageBitmapMock).toHaveBeenCalledTimes(2);
    expect(closeImageBitmapMock).not.toHaveBeenCalled();

    await act(async () => {
      rerender(<Harness world={secondWorld} />);
    });

    expect(closeImageBitmapMock).toHaveBeenCalledTimes(1);
  });

  it("closes retained decoded bitmaps when the hook unmounts", async () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput());
    const rasterShip = { ...base.ships[0]!, logoSrc: "/logos/unmount.png" };
    const world = { ...base, ships: [rasterShip] } as PharosVilleWorldModel;
    const { unmount } = render(<Harness world={world} />);
    await act(async () => {});

    expect(closeImageBitmapMock).not.toHaveBeenCalled();
    unmount();
    await act(async () => {});

    expect(closeImageBitmapMock).toHaveBeenCalledTimes(1);
  });

  it("drops loads that resolve after unmount aborted them", async () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput());
    const rasterShip = { ...base.ships[0]!, logoSrc: "/logos/late.png" };
    const world = { ...base, ships: [rasterShip] } as PharosVilleWorldModel;
    // Hold the first fetch open so the unmount lands mid-load; the store must
    // then discard the settled results instead of bumping the generation.
    // Boxed refs: closures assigned from inside callbacks defeat TS narrowing.
    const deferred: { resolve: ((response: Response) => void) | null } = { resolve: null };
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => {
        deferred.resolve = resolve;
      }),
    );
    // The store outlives the render through this reference, so the assertion
    // reads its generation after the DOM is gone.
    const logosRef: { current: ReturnType<typeof useShipLogoAssets>["logos"] | null } = {
      current: null,
    };
    function AbortHarness() {
      const result = useShipLogoAssets({ world });
      useEffect(() => {
        logosRef.current = result.logos;
      }, [result.logos]);
      return null;
    }

    const { unmount } = render(<AbortHarness />);
    expect(fetchMock).toHaveBeenCalled();
    unmount();
    deferred.resolve?.({
      ok: true,
      blob: () => Promise.resolve(new Blob()),
    } as unknown as Response);
    await act(async () => {});

    expect(logosRef.current?.getLogoGenerationKey()).toBe("lg0");
    expect(closeImageBitmapMock).toHaveBeenCalledTimes(1);
  });
});
