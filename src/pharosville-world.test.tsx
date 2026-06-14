// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PharosVilleLoading, PharosVilleWorld } from "./pharosville-world";
import type { HitTarget } from "./renderer/hit-testing";
import type { PharosVilleWorld as PharosVilleWorldModel } from "./systems/world-types";

const mocks = vi.hoisted(() => {
  const canvasSizeRef = { current: { x: 800, y: 600 } };
  const cameraRef = { current: { offsetX: 0, offsetY: 0, zoom: 1 } };
  const targets: HitTarget[] = [];
  return {
    cameraRef,
    canvasHandleKeyDown: vi.fn(),
    canvasSizeRef,
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
    assetLoadErrors: [],
    assetLoadTick: 0,
    assetManager: {
      get: () => null,
      getLoadStats: () => ({ criticalLoaded: 0, deferredLoaded: 0, failed: 0, requested: 0 }),
    },
    criticalAssetAttemptsSettled: true,
    criticalAssetsLoaded: true,
    deferredAssetsLoaded: true,
    setCriticalFramePainted: vi.fn(),
  }),
}));

vi.mock("./hooks/use-canvas-resize-and-camera", () => ({
  useCanvasResizeAndCamera: () => ({
    adaptiveDprStateRef: { current: { requestedDpr: 1 } },
    camera: mocks.cameraRef.current,
    cameraRef: mocks.cameraRef,
    cameraZoomLabel: "100%",
    canvasBudgetRef: { current: null },
    canvasRef: { current: null },
    canvasSize: mocks.canvasSizeRef.current,
    canvasSizeRef: mocks.canvasSizeRef,
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
    requestPaint: mocks.requestPaint,
  }),
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
    callback(true);
    return () => undefined;
  },
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  mocks.canvasHandleKeyDown.mockClear();
  mocks.requestPaint.mockClear();
  mocks.targets.splice(0, mocks.targets.length, ...targetFixtures());
  delete (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  delete (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
});

describe("PharosVilleWorld UI accessibility controls", () => {
  it("shows the current docked ship count in the beta footer", () => {
    const { container } = render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-ship-counter").textContent).toBe("1 ship docked / 1 total");
    expect(screen.getByTestId("pharosville-fps-counter").textContent).toBe("Static");
    expect(container.querySelector(".pharosville-beta-tag")?.textContent).toContain("PharosVille beta v0.2.2");
    expect(container.querySelector(".pharosville-beta-tag")?.textContent?.replace(/\s+/g, " ").trim()).toMatch(
      /Legend\|Changelog\|1 ship docked \/ 1 total\|Static\|Copy link\|Pharos$/,
    );
  });

  it("opens the commit-collected changelog from the beta footer", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "Changelog" }));
    const panel = await screen.findByTestId("pharosville-changelog-panel");
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

function worldFixture(): PharosVilleWorldModel {
  return {
    areas: [],
    detailIndex: {
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
    }],
    effects: [],
    entityById: {
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
      },
      "ship.usdc": {
        detailId: "ship.usdc",
        id: "ship.usdc",
        kind: "ship",
        label: "USDC",
      },
    },
    freshness: {},
    generatedAt: 1,
    graves: [],
    legends: [],
    lighthouse: {
      detailId: "lighthouse",
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos Lighthouse",
    },
    map: { height: 10, tiles: [], waterRatio: 1, width: 10 },
    pigeonnier: {
      detailId: "pigeonnier",
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
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
      riskZone: "calm",
      visual: {
        shipClass: "cefi",
        sizeTier: "major",
      },
    }],
    visualCues: [],
  } as unknown as PharosVilleWorldModel;
}

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
