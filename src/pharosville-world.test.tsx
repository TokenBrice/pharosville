// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleLoading, PharosVilleWorld } from "./pharosville-world";
import type { HitTarget } from "./renderer/hit-testing";
import {
  resolveGardenEntityDisplayTile,
  selectGardenObservatorySlice,
} from "./systems/garden-observatory-slice";
import type { PharosVilleWorld as PharosVilleWorldModel } from "./systems/world-types";

const mocks = vi.hoisted(() => {
  const canvasSizeRef = { current: { x: 800, y: 600 } };
  const cameraRef = { current: { offsetX: 0, offsetY: 0, zoom: 1 } };
  const targets: HitTarget[] = [];
  return {
    cameraRef,
    cancelCameraIntent: vi.fn(),
    canvasHandleKeyDown: vi.fn(),
    canvasSizeRef,
    focusTile: vi.fn(),
    reducedMotion: true,
    rendererStatus: "ready",
    requestPaint: vi.fn(),
    targets,
  };
});

vi.mock("./components/accessibility-ledger", () => ({
  AccessibilityLedger: () => <div data-testid="pharosville-accessibility-ledger" />,
}));

vi.mock("./components/detail-panel", () => ({
  DetailPanel: ({
    detail,
    onClose,
    onSelectDetail,
  }: {
    detail: { title: string };
    onClose: () => void;
    onSelectDetail?: (detailId: string) => void;
  }) => (
    <section data-testid="pharosville-detail-panel">
      <h2>{detail.title}</h2>
      {onSelectDetail ? (
        <button type="button" aria-label="Select USDC in PharosVille" onClick={() => onSelectDetail("ship.usdc")}>USDC</button>
      ) : null}
      <button type="button" aria-label="Close details" onClick={onClose}>Close</button>
    </section>
  ),
}));

vi.mock("./hooks/use-asset-loading-pipeline", () => ({
  useAssetLoadingPipeline: () => ({
    assetLoadTick: 0,
    assets: {
      getLogo: () => null,
      getRenderAssetGenerationKey: () => "lg0",
    },
  }),
}));

vi.mock("./hooks/use-canvas-resize-and-camera", () => ({
  useCanvasResizeAndCamera: () => ({
    adaptiveDprStateRef: { current: { requestedDpr: 1 } },
    camera: mocks.cameraRef.current,
    cameraRef: mocks.cameraRef,
    cameraZoomLabel: "100%",
    cancelCameraIntent: mocks.cancelCameraIntent,
    canvasBudgetRef: { current: null },
    canvasRef: { current: null },
    canvasSize: mocks.canvasSizeRef.current,
    canvasSizeRef: mocks.canvasSizeRef,
    focusTile: mocks.focusTile,
    handleFollowSelected: vi.fn(),
    handleKeyDown: mocks.canvasHandleKeyDown,
    handlePointerCancel: vi.fn(),
    handlePointerDown: vi.fn(),
    handlePointerLeave: vi.fn(),
    handlePointerMove: vi.fn(),
    handlePointerUp: vi.fn(),
    handleResetView: vi.fn(),
    handleToolbarPan: vi.fn(),
    handleToolbarZoomIn: vi.fn(),
    handleToolbarZoomOut: vi.fn(),
    maximumRequestedDprRef: { current: 1 },
    setCamera: vi.fn(),
  }),
}));

vi.mock("./hooks/use-fullscreen-mode", () => ({
  useFullscreenMode: () => ({
    exitFullscreen: vi.fn(),
    fullscreenMode: false,
    toggleFullscreen: vi.fn(),
  }),
}));

vi.mock("./hooks/use-world-render-loop", () => ({
  useWorldRenderLoop: () => ({
    frameRateFps: null,
    rendererStatus: mocks.rendererStatus,
    requestPaint: mocks.requestPaint,
  }),
}));

vi.mock("./renderer/garden-observatory-hit-testing", () => ({
  createGardenObservatoryHitTargetSnapshot: vi.fn(() => ({
    recordsById: new Map(),
    spatialIndex: {
      cellSize: 96,
      cells: new Map(),
      targetById: new Map(mocks.targets.map((target) => [target.id, target])),
      targetCellKeys: new Map(),
      targets: mocks.targets,
    },
    targets: mocks.targets,
    targetsByDetailId: new Map(mocks.targets.map((target) => [target.detailId, target])),
  })),
}));

vi.mock("./renderer/hit-testing", () => {
  const snapshot = () => ({
    recordsById: new Map(),
    spatialIndex: {
      cellSize: 96,
      cells: new Map(),
      targetById: new Map(mocks.targets.map((target) => [target.id, target])),
      targetCellKeys: new Map(),
      targets: mocks.targets,
    },
    targets: mocks.targets,
    targetsByDetailId: new Map(mocks.targets.map((target) => [target.detailId, target])),
  });
  return {
    createHitTargetSnapshot: vi.fn(snapshot),
    hitTargetSnapshotFromTargets: vi.fn((targets: HitTarget[]) => ({
      ...snapshot(),
      spatialIndex: {
        ...snapshot().spatialIndex,
        targetById: new Map(targets.map((target) => [target.id, target])),
        targets,
      },
      targets,
      targetsByDetailId: new Map(targets.map((target) => [target.detailId, target])),
    })),
    recomputeHitTargetsForCameraOnly: vi.fn(snapshot),
  };
});

vi.mock("./systems/motion", () => ({
  buildBaseMotionPlan: vi.fn(() => ({ effectShipIds: new Set(), moverShipIds: new Set(), shipRoutes: new Map() })),
  buildMotionPlan: vi.fn(() => ({ effectShipIds: new Set(), moverShipIds: new Set(), shipRoutes: new Map() })),
  disposePathCacheForMap: vi.fn(),
  motionPlanSignature: vi.fn(() => "test-motion-plan"),
}));

vi.mock("./systems/reduced-motion", () => ({
  observeReducedMotion: (callback: (matches: boolean) => void) => {
    callback(mocks.reducedMotion);
    return () => undefined;
  },
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  mocks.cameraRef.current.offsetX = 0;
  mocks.cameraRef.current.offsetY = 0;
  mocks.cameraRef.current.zoom = 1;
  mocks.canvasHandleKeyDown.mockClear();
  mocks.cancelCameraIntent.mockClear();
  mocks.focusTile.mockClear();
  mocks.reducedMotion = true;
  mocks.rendererStatus = "ready";
  mocks.requestPaint.mockClear();
  mocks.targets.splice(0, mocks.targets.length, ...targetFixtures());
  delete (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  window.history.replaceState(null, "", "/");
  delete (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
});

describe("PharosVilleWorld UI accessibility controls", () => {
  it("shows the current docked ship count in the beta footer", () => {
    const { container } = render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-ship-counter").textContent).toBe("1 ship docked / 1 total");
    expect(screen.queryByTestId("pharosville-fps-counter")).toBeNull();
    expect(container.querySelector(".pharosville-beta-tag")?.textContent).toContain("PharosVille beta v0.3.0");
    expect(container.querySelector(".pharosville-beta-tag")?.textContent?.replace(/\s+/g, " ").trim()).toMatch(
      /Legend\|Changelog\|1 ship docked \/ 1 total\|Copy link\|Pharos$/,
    );
  });

  it("shows the frame-rate counter only behind the debug flag", () => {
    window.history.replaceState(null, "", "/?debug=1");
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-fps-counter").textContent).toBe("Static");
  });

  it("opens the commit-collected changelog from the beta footer", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "Changelog" }));
    const panel = await screen.findByTestId("pharosville-changelog-panel");
    expect(panel.textContent).toContain("True Waters");
    expect(panel.textContent).toContain("v0.3.0");
    expect(panel.textContent).toContain("Curtain Up");
    expect(panel.textContent).toContain("Signal Clarity");
    expect(panel.textContent).toContain("Need For Speed");
    expect(panel.textContent).toContain("v0.2.2");
    expect(panel.textContent).toContain("v0.2.1");
    expect(panel.textContent).toContain("v0.2.0");
    expect(panel.textContent).toContain("v0.1.3");
    expect(panel.textContent).toContain("Harbor motion and atmosphere");
    expect(panel.textContent).toContain("Collected from commits");

    fireEvent.click(screen.getByLabelText("Close changelog"));
    expect(screen.queryByTestId("pharosville-changelog-panel")).toBeNull();
  });

  it("announces background data timestamp and freshness changes", async () => {
    const initialGeneratedAt = Date.UTC(2026, 5, 14, 12, 0);
    const refreshedGeneratedAt = Date.UTC(2026, 5, 14, 12, 5);
    const view = render(<PharosVilleWorld world={worldFixture({ generatedAt: initialGeneratedAt })} />);

    view.rerender(<PharosVilleWorld world={worldFixture({ generatedAt: refreshedGeneratedAt })} />);
    await waitFor(() => {
      expect(screen.getByText(`Harbor data updated at ${new Date(refreshedGeneratedAt).toISOString()}.`)).toBeTruthy();
    });

    view.rerender(<PharosVilleWorld
      world={worldFixture({
        freshness: { stabilityStale: true },
        generatedAt: refreshedGeneratedAt,
      })}
    />);
    await waitFor(() => {
      expect(screen.getByText("Harbor data updated. Stale source groups: PSI.")).toBeTruthy();
    });
  });

  it("cycles canvas hit targets with Tab and selects the focused target with Enter", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const shell = screen.getByTestId("pharosville-world");
    fireEvent.keyDown(shell, { key: "Tab" });
    expect(screen.getByText("Focused Ethereum Dock. Press Enter to select.")).toBeTruthy();

    fireEvent.keyDown(shell, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByTestId("pharosville-detail-panel").textContent).toContain("Ethereum Dock");
    });
    expect(screen.queryByTestId("pharosville-selection-strip")).toBeNull();
  });

  it("selects an in-world detail from a detail-panel callback", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const shell = screen.getByTestId("pharosville-world");
    fireEvent.keyDown(shell, { key: "Tab" });
    fireEvent.keyDown(shell, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByTestId("pharosville-detail-panel").textContent).toContain("Ethereum Dock");
    });

    fireEvent.click(screen.getByRole("button", { name: "Select USDC in PharosVille" }));
    await waitFor(() => {
      expect(screen.getByTestId("pharosville-detail-panel").textContent).toContain("USDC");
    });
  });

  it("cycles backward with Shift Tab and keeps Escape delegated to existing canvas shortcuts", () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const shell = screen.getByTestId("pharosville-world");
    fireEvent.keyDown(shell, { key: "Tab", shiftKey: true });
    expect(screen.getByText("Focused USDC. Press Enter to select.")).toBeTruthy();

    fireEvent.keyDown(shell, { key: "Escape" });
    expect(mocks.canvasHandleKeyDown).toHaveBeenCalled();
  });

  it("does not render the lower-third caption while details are selected", () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.queryByTestId("pharosville-selection-strip")).toBeNull();
    fireEvent.click(screen.getByLabelText("Close details"));
    expect(screen.queryByTestId("pharosville-selection-strip")).toBeNull();
  });

  it("leaves canvas selection changes to the canvas pointer-up handler", () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.pointerDown(screen.getByTestId("pharosville-canvas"));

    expect(screen.getByTestId("pharosville-detail-panel")).toBeTruthy();
  });

  it("routes manual time scrub changes through the wall-clock override", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const scrubber = screen.getByLabelText("Set session hour");
    fireEvent.change(scrubber, { target: { value: "6.5" } });

    await waitFor(() => expect(globalThis.__pharosVilleTestWallClockHour).toBe(6.5));
    await waitFor(() => expect(screen.getByLabelText("Time of day").textContent).toBe("06:30"));
    expect(mocks.requestPaint).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Return to day-night preset"));
    await waitFor(() => expect(globalThis.__pharosVilleTestWallClockHour).toBeUndefined());
    await waitFor(() => expect(screen.getByLabelText("Time of day").textContent).toBe("12:00"));
  });

  it("projects truthful area controls over the Three scene", async () => {
    mocks.cameraRef.current.offsetX = 328;
    mocks.cameraRef.current.offsetY = 100;
    render(<PharosVilleWorld world={worldFixture()} />);
    fireEvent.click(screen.getByLabelText("Close details"));

    const warning = screen.getByRole("button", {
      name: "Open Warning Shoals details: WARNING, 2 ships",
    });
    expect(warning.getAttribute("style")).toContain("--pv-observatory-x: 184px");
    expect(screen.getByText("Watch Breakwater")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Observe harbor" })).toBeNull();

    fireEvent.click(warning);
    await waitFor(() => {
      expect(screen.getByTestId("pharosville-detail-panel").textContent).toContain("Warning Shoals");
    });
  });

  it("does not leave offscreen analytical labels in the keyboard order", () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.queryByLabelText(/Open .* details:/)).toBeNull();
  });

  it("advances Observe through the camera controller and stops on input", () => {
    vi.useFakeTimers();
    mocks.reducedMotion = false;
    const world = worldFixture();
    const slice = selectGardenObservatorySlice(world, null);
    render(<PharosVilleWorld world={world} />);

    fireEvent.click(screen.getByRole("button", { name: "Observe harbor" }));
    expect(screen.getByTestId("pharosville-observe-caption").textContent).toContain(
      "The Pharos lighthouse reports PSI 82, STEADY.",
    );
    expect(mocks.focusTile).toHaveBeenLastCalledWith({ x: 16, y: 12 });

    act(() => vi.advanceTimersByTime(OBSERVE_TEST_STEP_MS));
    expect(screen.getByTestId("pharosville-observe-caption").textContent).toContain(
      "USDC is the observatory's leading risk watch in Warning Shoals.",
    );
    expect(mocks.focusTile).toHaveBeenLastCalledWith(resolveGardenEntityDisplayTile({
      entity: world.ships[0]!,
      slice,
    }));
    expect(screen.getByRole("heading", { level: 2, name: "Pharos Lighthouse" })).toBeTruthy();

    const observe = screen.getByRole("button", { name: "Stop observing" });
    fireEvent.keyDown(observe, { key: "Tab" });
    expect(screen.queryByTestId("pharosville-observe-caption")).toBeNull();
    expect(mocks.cancelCameraIntent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Observe harbor" }));
    fireEvent.pointerDown(screen.getByTestId("pharosville-canvas"));
    expect(screen.queryByTestId("pharosville-observe-caption")).toBeNull();
    expect(mocks.cancelCameraIntent).toHaveBeenCalledTimes(2);
  });

  it("replaces a failed Three scene with a navigable static signal overview", async () => {
    mocks.rendererStatus = "failed";
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-canvas").hasAttribute("hidden")).toBe(true);
    expect(screen.getByRole("heading", { name: "Harbor signal overview" })).toBeTruthy();
    expect(screen.getByText("The Pharos lighthouse reports PSI 82, STEADY.")).toBeTruthy();
    expect(screen.getByText(/USDC is the observatory's leading risk watch/)).toBeTruthy();
    expect(screen.getByText(/USDC has the observatory's strongest weekly supply move/)).toBeTruthy();
    expect(screen.getByText(/Ethereum Dock has the observatory's highest dock concentration/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Use standard view" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Recenter map" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Open Risk watch details" }));
    await waitFor(() => {
      expect(screen.getByTestId("pharosville-detail-panel").textContent).toContain("USDC");
    });
  });
});

describe("PharosVilleLoading (W4.07)", () => {
  it("renders the canvas-palette loading shell with default copy", () => {
    const { container } = render(<PharosVilleLoading />);

    const root = container.querySelector(".pharosville-loading");
    expect(root).not.toBeNull();
    expect(root?.classList.contains("pharosville-desktop")).toBe(true);
    expect(root?.getAttribute("role")).toBe("status");
    expect(root?.getAttribute("aria-busy")).toBe("true");
    expect(root?.getAttribute("aria-live")).toBe("polite");
    expect(root?.textContent).toBe("Charting market winds…");
  });

  it("accepts a custom loading message", () => {
    render(<PharosVilleLoading message="Loading fixture" />);
    expect(screen.getByText("Loading fixture")).toBeTruthy();
  });
});

function targetFixtures(): HitTarget[] {
  return [
    {
      detailId: "dock.ethereum",
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum Dock",
      priority: 10,
      rect: { height: 20, width: 20, x: 100, y: 100 },
    },
    {
      detailId: "lighthouse",
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos Lighthouse",
      priority: 20,
      rect: { height: 20, width: 20, x: 300, y: 140 },
    },
    {
      detailId: "ship.usdc",
      id: "ship.usdc",
      kind: "ship",
      label: "USDC",
      priority: 30,
      rect: { height: 20, width: 20, x: 420, y: 200 },
    },
  ];
}

function worldFixture(input: {
  freshness?: PharosVilleWorldModel["freshness"];
  generatedAt?: number;
} = {}): PharosVilleWorldModel {
  return {
    areas: [
      {
        band: "WARNING",
        count: 2,
        detailId: "area.dews.warning",
        id: "area.dews.warning",
        kind: "area",
        label: "Warning Shoals",
        tile: { x: 1, y: 2 },
      },
      {
        band: "WATCH",
        count: 1,
        detailId: "area.dews.watch",
        id: "area.dews.watch",
        kind: "area",
        label: "Watch Breakwater",
        tile: { x: 3, y: 1 },
      },
    ],
    detailIndex: {
      "area.dews.warning": detail("area.dews.warning", "Warning Shoals", "area", "Two ships are in warning water."),
      "area.dews.watch": detail("area.dews.watch", "Watch Breakwater", "area", "One ship is under watch."),
      "dock.ethereum": detail("dock.ethereum", "Ethereum Dock", "dock", "Ethereum chain harbor summary."),
      lighthouse: detail("lighthouse", "Pharos Lighthouse", "lighthouse", "Beacon summary."),
      "ship.usdc": detail("ship.usdc", "USDC", "ship", "USDC ship summary."),
    },
    docks: [{
      chainId: "ethereum",
      detailId: "dock.ethereum",
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum Dock",
      concentration: 0.72,
      tile: { x: 6, y: 6 },
      totalUsd: 2_000,
    }],
    effects: [],
    entityById: {
      "area.dews.warning": {
        band: "WARNING",
        count: 2,
        detailId: "area.dews.warning",
        id: "area.dews.warning",
        kind: "area",
        label: "Warning Shoals",
        tile: { x: 1, y: 2 },
      },
      "area.dews.watch": {
        band: "WATCH",
        count: 1,
        detailId: "area.dews.watch",
        id: "area.dews.watch",
        kind: "area",
        label: "Watch Breakwater",
        tile: { x: 3, y: 1 },
      },
      "dock.ethereum": {
        chainId: "ethereum",
        detailId: "dock.ethereum",
        id: "dock.ethereum",
        kind: "dock",
        label: "Ethereum Dock",
      },
      lighthouse: {
        detailId: "lighthouse",
        id: "lighthouse",
        kind: "lighthouse",
        label: "Pharos Lighthouse",
        tile: { x: 4, y: 4 },
      },
      "ship.usdc": {
        detailId: "ship.usdc",
        id: "ship.usdc",
        kind: "ship",
        label: "USDC",
      },
    },
    freshness: input.freshness ?? {},
    generatedAt: input.generatedAt ?? 1,
    graves: [],
    legends: [],
    lighthouse: {
      detailId: "lighthouse",
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos Lighthouse",
      psiBand: "STEADY",
      score: 82,
      tile: { x: 4, y: 4 },
      unavailable: false,
    },
    map: { height: 10, tiles: [], waterRatio: 1, width: 10 },
    pigeonnier: {
      detailId: "pigeonnier",
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      tile: { x: 8, y: 8 },
    },
    routeMode: "world",
    ships: [{
      chainPresence: [{
        chainId: "ethereum",
        currentUsd: 1,
        hasRenderedDock: true,
        share: 1,
      }],
      detailId: "ship.usdc",
      dockVisits: [{ chainId: "ethereum", dockId: "dock.ethereum", weight: 1, mooringTile: { x: 2, y: 3 } }],
      id: "ship.usdc",
      kind: "ship",
      label: "USDC",
      marketCapUsd: 1_000,
      pegDeviationBps: 45,
      riskPlacement: "outer-rough-water",
      riskTile: { x: 7, y: 2 },
      riskZone: "warning",
      symbol: "USDC",
      tile: { x: 2, y: 3 },
      change7dPct: 4,
      visual: {
        shipClass: "cefi",
        sizeTier: "major",
      },
    }],
    visualCues: [],
  } as unknown as PharosVilleWorldModel;
}

const OBSERVE_TEST_STEP_MS = 12_000;

function detail(id: string, title: string, kind: string, summary: string) {
  return {
    facts: [],
    id,
    kind,
    links: [],
    summary,
    title,
  };
}
