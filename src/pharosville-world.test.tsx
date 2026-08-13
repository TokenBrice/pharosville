// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HARBORMASTER_NOTE_STORAGE_KEY, PharosVilleLoading, PharosVilleWorld } from "./pharosville-world";
import { overCapacityWorldFixture } from "./__fixtures__/over-capacity-world";
import { PHAROSVILLE_LATEST_VERSION } from "./content/pharosville-version";
import type { HitTarget } from "./renderer/hit-testing";
import {
  resolveGardenEntityDisplayTile,
  selectGardenObservatorySlice,
} from "./systems/garden-observatory-slice";
import { buildObserveSequence } from "./systems/observe-sequence";
import { tileToIso } from "./systems/projection";
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
    rendererWarmupReady: true,
    rendererStatus: "ready",
    requestPaint: vi.fn(),
    skipArrival: vi.fn(),
    startArrival: vi.fn<(onComplete: () => void) => void>(),
    startAttractTour: vi.fn(),
    startObserveTour: vi.fn(),
    stopAttractTour: vi.fn(),
    stopObserveTour: vi.fn(),
    targets,
  };
});

vi.mock("./components/accessibility-ledger", () => ({
  ACCESSIBILITY_LEDGER_HEADING_ID: "pharosville-accessibility-ledger-title",
  // Mirrors the real component's presentation switch so the shell's "exactly
  // one ledger is mounted" rule is testable without its full markup.
  AccessibilityLedger: ({ presentation = "screen-reader", title = "PharosVille accessibility ledger" }: {
    presentation?: "screen-reader" | "visible";
    title?: string;
  }) => (
    <div data-testid="pharosville-accessibility-ledger" data-presentation={presentation}>
      <h2 id="pharosville-accessibility-ledger-title">{title}</h2>
    </div>
  ),
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

vi.mock("./hooks/use-ship-logo-assets", () => ({
  useShipLogoAssets: () => ({
    logoGeneration: 0,
    logos: {
      getLogo: () => null,
      getLogoGenerationKey: () => "lg0",
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
    surfaceBudgetRef: { current: null },
    canvasRef: { current: null },
    canvasSize: mocks.canvasSizeRef.current,
    canvasSizeRef: mocks.canvasSizeRef,
    focusTile: mocks.focusTile,
    skipArrival: mocks.skipArrival,
    startArrival: mocks.startArrival,
    startAttractTour: mocks.startAttractTour,
    startObserveTour: mocks.startObserveTour,
    stopAttractTour: mocks.stopAttractTour,
    stopObserveTour: mocks.stopObserveTour,
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

vi.mock("./hooks/use-world-render-loop", () => ({
  useWorldRenderLoop: () => ({
    frameRateFps: null,
    rendererWarmupReady: mocks.rendererWarmupReady,
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
  buildBaseMotionPlan: vi.fn(() => ({ shipRoutes: new Map() })),
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
  mocks.startObserveTour.mockClear();
  mocks.startAttractTour.mockClear();
  mocks.stopAttractTour.mockClear();
  mocks.stopObserveTour.mockClear();
  mocks.reducedMotion = true;
  mocks.rendererWarmupReady = true;
  mocks.rendererStatus = "ready";
  mocks.requestPaint.mockClear();
  mocks.skipArrival.mockClear();
  mocks.startArrival.mockReset();
  mocks.startArrival.mockImplementation((onComplete) => onComplete());
  window.localStorage.setItem(HARBORMASTER_NOTE_STORAGE_KEY, "1");
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
  it("skips the establishing ease on any input", () => {
    mocks.reducedMotion = false;
    mocks.startArrival.mockImplementation(() => undefined);
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-charting-veil").getAttribute("data-arrival")).toBe("arriving");
    fireEvent.keyDown(window, { key: "a" });

    expect(mocks.skipArrival).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("pharosville-charting-veil")).toBeNull();
  });

  it("uses a reduced-motion crossfade before revealing the one-time note", () => {
    vi.useFakeTimers();
    window.localStorage.removeItem(HARBORMASTER_NOTE_STORAGE_KEY);
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-charting-veil").getAttribute("data-arrival")).toBe("crossfade");
    act(() => vi.advanceTimersByTime(320));
    expect(mocks.startArrival).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Read harbormaster's note" }));
    expect(screen.getByText("The lanterns are warm; the ledger is current.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Put away harbormaster's note" }));
    expect(window.localStorage.getItem(HARBORMASTER_NOTE_STORAGE_KEY)).toBe("1");
    expect(screen.queryByRole("button", { name: "Read harbormaster's note" })).toBeNull();
  });

  // Interface revamp DU4/DU7/DU11 + W0.4: the footer carries five items and
  // nothing else — mark, legend, changelog, harbor ledger, berth count. The
  // frame rate is instrumentation and lives behind ?debug=1.
  it("shows how much of the fleet holds a berth in the footer", () => {
    const { container } = render(<PharosVilleWorld world={worldFixture()} />);

    // "hold a berth", not "docked": the figure counts ships with a home harbor
    // among the charted chains, not ships moored at this instant.
    expect(screen.getByTestId("pharosville-ship-counter").textContent).toBe("1 of 1 hold a berth");
    const footer = container.querySelector(".pharosville-footer");
    expect(footer?.querySelector(".pharosville-footer__primary")).toBeTruthy();
    expect(footer?.querySelector(".pharosville-footer__telemetry")).toBeTruthy();
    // Separator spacing is CSS margin, so the DOM text runs them together.
    // Derived, not a literal: a version bump is a release chore, not a reason
    // for this test to fail.
    expect(footer?.textContent?.replace(/\s+/g, " ").trim()).toBe(
      `PharosVille ${PHAROSVILLE_LATEST_VERSION}·Legend·Changelog·Harbor ledger·1 of 1 hold a berth`,
    );
    expect(footer?.textContent).not.toContain("Copy link");
    expect(footer?.textContent).not.toContain("not financial advice");
  });

  // W0.4: a permanent fps readout is developer telemetry on a screen selling
  // serenity. It is not deleted — the perf lane needs it — only gated.
  it("hides the frame-rate counter from a visitor with no debug flag", () => {
    const { container } = render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.queryByTestId("pharosville-fps-counter")).toBeNull();
    expect(container.querySelector(".pharosville-footer__frame-rate")).toBeNull();
    expect(container.querySelector(".pharosville-footer")?.textContent).not.toContain("Static");
  });

  it("shows the frame-rate counter behind the ?debug=1 flag the preview lane sets", () => {
    window.history.replaceState(null, "", "/?debug=1");
    const { container } = render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-fps-counter").textContent).toBe("Static");
    expect(
      container.querySelector(".pharosville-footer__frame-rate")
        ?.contains(screen.getByTestId("pharosville-fps-counter")),
    ).toBe(true);
  });

  it("accepts the debug flag from the hash half of the URL too", () => {
    window.history.replaceState(null, "", "/#debug=1&t=7");
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

  it("opens the harbor ledger from the footer and closes it from its own control", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.getByTestId("pharosville-accessibility-ledger").dataset.presentation).toBe("screen-reader");

    fireEvent.click(screen.getByRole("button", { name: "Harbor ledger" }));
    const panel = await screen.findByTestId("pharosville-harbor-ledger-panel");
    expect(panel.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement).toBe(screen.getByLabelText("Close harbor ledger"));

    fireEvent.click(screen.getByLabelText("Close harbor ledger"));
    expect(screen.queryByTestId("pharosville-harbor-ledger-panel")).toBeNull();
    // Focus lands back on the world shell, as it does for the sibling panels.
    expect(document.activeElement).toBe(screen.getByTestId("pharosville-world"));
    expect(screen.getByTestId("pharosville-accessibility-ledger").dataset.presentation).toBe("screen-reader");
  });

  it("closes the harbor ledger on Escape", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "Harbor ledger" }));
    await screen.findByTestId("pharosville-harbor-ledger-panel");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTestId("pharosville-harbor-ledger-panel")).toBeNull();
  });

  // The panels render inside the shell, so their Escape bubbles into the world
  // handlers — which clear the selection on Escape. Closing a panel is not a
  // request to forget the ship the visitor opened it to read about.
  it("keeps Escape inside a reference panel away from the world shortcuts", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const panels = [
      ["Legend", "pharosville-legend-panel"],
      ["Changelog", "pharosville-changelog-panel"],
      ["Harbor ledger", "pharosville-harbor-ledger-panel"],
    ] as const;

    for (const [control, testId] of panels) {
      fireEvent.click(screen.getByRole("button", { name: control }));
      const panel = await screen.findByTestId(testId);
      mocks.canvasHandleKeyDown.mockClear();

      fireEvent.keyDown(panel, { key: "Escape" });

      expect(screen.queryByTestId(testId)).toBeNull();
      expect(mocks.canvasHandleKeyDown).not.toHaveBeenCalled();
    }
  });

  it("mounts exactly one ledger, so the world is never announced twice", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "Harbor ledger" }));
    await screen.findByTestId("pharosville-harbor-ledger-panel");

    const ledgers = screen.getAllByTestId("pharosville-accessibility-ledger");
    expect(ledgers).toHaveLength(1);
    expect(ledgers[0]!.dataset.presentation).toBe("visible");
  });

  it("keeps at most one reference panel open", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "Harbor ledger" }));
    await screen.findByTestId("pharosville-harbor-ledger-panel");

    fireEvent.click(screen.getByRole("button", { name: "Changelog" }));
    await screen.findByTestId("pharosville-changelog-panel");
    expect(screen.queryByTestId("pharosville-harbor-ledger-panel")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Harbor ledger" }));
    await screen.findByTestId("pharosville-harbor-ledger-panel");
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
    // S1: with no default selection, Tab enters the cycle at the FIRST target
    // rather than one past whatever was selected for the visitor.
    fireEvent.keyDown(shell, { key: "Tab" });
    expect(screen.getByText("Focused USDC. Press Enter to select.")).toBeTruthy();

    fireEvent.keyDown(shell, { key: "Enter" });
    await waitFor(() => {
      expect(screen.getByTestId("pharosville-detail-panel").textContent).toContain("USDC");
    });
    expect(screen.queryByTestId("pharosville-selection-strip")).toBeNull();
  });

  it("opens the DOM detail record for a selected transient outsider beyond capacity", async () => {
    const world = overCapacityWorldFixture();
    const ordinary = selectGardenObservatorySlice(world, null);
    const outsider = world.ships.find((ship) => (
      !ordinary.representativeDetailIds.has(ship.detailId)
    ));
    expect(outsider).toBeDefined();
    mocks.targets.splice(0, mocks.targets.length, {
      detailId: outsider!.detailId,
      id: outsider!.id,
      kind: "ship",
      label: outsider!.label,
      priority: 30,
      rect: { height: 40, width: 40, x: 100, y: 100 },
    });

    render(<PharosVilleWorld world={world} />);
    const shell = screen.getByTestId("pharosville-world");
    fireEvent.keyDown(shell, { key: "Tab" });
    fireEvent.keyDown(shell, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByTestId("pharosville-detail-panel").textContent)
        .toContain(outsider!.label);
    });
  });

  it("selects an in-world detail from a detail-panel callback", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const shell = screen.getByTestId("pharosville-world");
    // Target order is USDC, the lighthouse, then the dock; three Tabs reaches
    // the dock, whose panel carries the "Select USDC" cross-link under test.
    fireEvent.keyDown(shell, { key: "Tab" });
    fireEvent.keyDown(shell, { key: "Tab" });
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
    // S1: nothing selected, so Shift+Tab enters the cycle at the LAST target.
    fireEvent.keyDown(shell, { key: "Tab", shiftKey: true });
    expect(screen.getByText("Focused Ethereum Dock. Press Enter to select.")).toBeTruthy();

    fireEvent.keyDown(shell, { key: "Escape" });
    expect(mocks.canvasHandleKeyDown).toHaveBeenCalled();
  });

  it("does not render the lower-third caption with or without a selection", () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    // S1: arrival is unselected, so this now covers both states explicitly.
    expect(screen.queryByTestId("pharosville-detail-panel")).toBeNull();
    expect(screen.queryByTestId("pharosville-selection-strip")).toBeNull();

    const shell = screen.getByTestId("pharosville-world");
    fireEvent.keyDown(shell, { key: "Tab" });
    fireEvent.keyDown(shell, { key: "Enter" });
    expect(screen.getByTestId("pharosville-detail-panel")).toBeTruthy();
    expect(screen.queryByTestId("pharosville-selection-strip")).toBeNull();

    fireEvent.click(screen.getByLabelText("Close details"));
    expect(screen.queryByTestId("pharosville-selection-strip")).toBeNull();
  });

  it("leaves canvas selection changes to the canvas pointer-up handler", () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const shell = screen.getByTestId("pharosville-world");
    fireEvent.keyDown(shell, { key: "Tab" });
    fireEvent.keyDown(shell, { key: "Enter" });
    expect(screen.getByTestId("pharosville-detail-panel")).toBeTruthy();

    // pointerDown alone must not disturb the open panel: selection is the
    // pointer-UP handler's job. (S1: the panel has to be opened first now,
    // because arrival selects nothing.)
    fireEvent.pointerDown(screen.getByTestId("pharosville-canvas"));

    expect(screen.getByTestId("pharosville-detail-panel")).toBeTruthy();
  });

  // Interface revamp DU10: the hour slider is gone, so a shared `#t=` link is
  // the only way in and the day-night control is the only way out.
  it("routes a shared hour link through the wall-clock override", async () => {
    window.history.replaceState(null, "", "/#t=6.5");
    render(<PharosVilleWorld world={worldFixture()} />);

    await waitFor(() => expect(globalThis.__pharosVilleTestWallClockHour).toBe(6.5));
    expect(mocks.requestPaint).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Switch to night"));
    // D-R2: with no override the presentation follows the visitor's wall clock
    // (it does not snap back to a fixed noon default).
    await waitFor(() => expect(globalThis.__pharosVilleTestWallClockHour).toBeUndefined());
  });

  it("keeps sea-area naming out of the DOM overlay", () => {
    // The sea's place-names are carved boards in the world (garden-sea-signs),
    // not DOM chips; area details open through the canvas hit targets.
    render(<PharosVilleWorld world={worldFixture()} />);

    expect(screen.queryByLabelText(/Open .* details:/)).toBeNull();
    expect(screen.queryByText(/ships$/)).toBeNull();
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
    // Observe 2.0: the camera hook receives the whole tour as spline
    // keyframes up front — one per beat, in caption order — instead of a
    // per-beat focusTile target.
    expect(mocks.startObserveTour).toHaveBeenCalledTimes(1);
    const keyframes = mocks.startObserveTour.mock.calls[0]![0] as {
      beatIndex: number;
      isoX: number;
      isoY: number;
      zoom: number;
    }[];
    expect(keyframes.map((keyframe) => keyframe.beatIndex)).toEqual([0, 1, 2, 3]);
    expect({ x: keyframes[0]!.isoX, y: keyframes[0]!.isoY }).toEqual(tileToIso({ x: 16, y: 12 }));
    expect(mocks.focusTile).not.toHaveBeenCalled();

    const publishTourBeat = mocks.startObserveTour.mock.calls[0]![1] as
      (beatIndex: number | null) => void;
    act(() => publishTourBeat(1));
    expect(screen.getByTestId("pharosville-observe-caption").textContent).toContain(
      "USDC is the observatory's leading risk watch in Warning Shoals.",
    );
    const riskIso = tileToIso(resolveGardenEntityDisplayTile({
      entity: world.ships[0]!,
      slice,
    })!);
    expect({ x: keyframes[1]!.isoX, y: keyframes[1]!.isoY }).toEqual({ x: riskIso.x, y: riskIso.y });
    // S1: Observe is a camera tour, not a selection change. It used to be
    // asserted against the default lighthouse panel; with no default selection
    // the meaningful statement is that touring opens no panel at all.
    expect(screen.queryByTestId("pharosville-detail-panel")).toBeNull();

    const observe = screen.getByRole("button", { name: "Stop observing" });
    fireEvent.keyDown(observe, { key: "Tab" });
    expect(screen.queryByTestId("pharosville-observe-caption")).toBeNull();
    expect(mocks.cancelCameraIntent).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Observe harbor" }));
    fireEvent.pointerDown(screen.getByTestId("pharosville-canvas"));
    expect(screen.queryByTestId("pharosville-observe-caption")).toBeNull();
    expect(mocks.cancelCameraIntent).toHaveBeenCalledTimes(2);
  });

  it("uses sampled Observe progress for large jumps and completion", () => {
    mocks.reducedMotion = false;
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "Observe harbor" }));
    const publishTourBeat = mocks.startObserveTour.mock.calls[0]![1] as
      (beatIndex: number | null) => void;

    act(() => publishTourBeat(3));
    expect(screen.getByTestId("pharosville-observe-caption").textContent).toContain(
      "Ethereum Dock has the observatory's highest dock concentration",
    );

    act(() => publishTourBeat(null));
    expect(screen.queryByTestId("pharosville-observe-caption")).toBeNull();
  });

  it("steps Observe beat by beat under reduced motion", () => {
    vi.useFakeTimers();
    const world = worldFixture();
    const beats = buildObserveSequence(world);
    render(<PharosVilleWorld world={world} />);

    // The control never latches under reduced motion, so its label stays put.
    const observe = () => screen.getByRole("button", { name: "Observe harbor" });
    const caption = () => screen.getByTestId("pharosville-observe-caption").textContent;

    fireEvent.click(observe());
    expect(caption()).toContain(`Observe 1/${beats.length}`);
    expect(caption()).toContain("The Pharos lighthouse reports PSI 82, STEADY.");
    expect(mocks.focusTile).toHaveBeenLastCalledWith({ x: 16, y: 12 });

    // No timed tour: the harbor holds this beat until the reader asks for more.
    act(() => vi.advanceTimersByTime(OBSERVE_TEST_STEP_MS * 2));
    expect(caption()).toContain(`Observe 1/${beats.length}`);

    for (let index = 1; index < beats.length; index += 1) {
      fireEvent.click(observe());
      expect(caption()).toContain(`Observe ${index + 1}/${beats.length}`);
      expect(caption()).toContain(beats[index]!.label);
    }

    fireEvent.click(observe());
    expect(screen.queryByTestId("pharosville-observe-caption")).toBeNull();
  });

  it("opens the observe sequence from the legend's closing call to action", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    fireEvent.click(await screen.findByRole("button", { name: "Watch the harbor" }));

    expect(screen.queryByTestId("pharosville-legend-panel")).toBeNull();
    expect(screen.getByTestId("pharosville-observe-caption").textContent).toContain(
      "The Pharos lighthouse reports PSI 82, STEADY.",
    );
  });

  // Reduced motion has no timer to carry the tour, so "Watch the harbor" is
  // only a beginning if the control that steps it is reachable. It used to hand
  // over beat one and then cancel the sequence on the first Tab toward that
  // control, which left a keyboard reader with one beat and no way on.
  it("hands the reduced-motion observe sequence to the keyboard, steppable", async () => {
    const world = worldFixture();
    const beats = buildObserveSequence(world);
    render(<PharosVilleWorld world={world} />);

    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    fireEvent.click(await screen.findByRole("button", { name: "Watch the harbor" }));

    const observe = screen.getByRole("button", { name: "Observe harbor" });
    expect(document.activeElement).toBe(observe);
    expect(screen.getByTestId("pharosville-observe-caption").textContent).toContain(
      `Observe 1/${beats.length}`,
    );

    // Moving focus is navigation, not the input that ends the sequence.
    fireEvent.keyDown(observe, { key: "Tab" });
    expect(screen.getByTestId("pharosville-observe-caption")).toBeTruthy();

    fireEvent.keyDown(observe, { key: "Enter" });
    fireEvent.click(observe);
    expect(screen.getByTestId("pharosville-observe-caption").textContent).toContain(
      `Observe 2/${beats.length}`,
    );
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

describe("PharosVilleWorld quick find", () => {
  const openQuickFind = () => {
    fireEvent.keyDown(document, { key: "/" });
    return screen.getByRole("combobox", { name: "Find a ship or harbor by name" });
  };

  it("opens on slash, selects a named ship, and takes the camera to it", () => {
    const world = worldFixture();
    render(<PharosVilleWorld world={world} />);

    const input = openQuickFind();
    fireEvent.change(input, { target: { value: "usdc" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("pharosville-detail-panel").textContent).toContain("USDC");
    expect(mocks.focusTile).toHaveBeenLastCalledWith(resolveGardenEntityDisplayTile({
      entity: world.entityById["ship.usdc"]!,
      slice: selectGardenObservatorySlice(world, "ship.usdc"),
    }));
  });

  // The shell's own Escape clears the selection. Quick find sits inside that
  // subtree, so closing the field must not also close the panel behind it.
  it("closes on Escape without clearing the selection behind it", () => {
    render(<PharosVilleWorld world={worldFixture()} />);

    const input = openQuickFind();
    fireEvent.change(input, { target: { value: "usdc" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(openQuickFind(), { key: "Escape" });

    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.getByTestId("pharosville-detail-panel")).toBeTruthy();
  });

  it("leaves the slash key alone while a reference panel is open", async () => {
    render(<PharosVilleWorld world={worldFixture()} />);
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    await screen.findByTestId("pharosville-legend-panel");

    fireEvent.keyDown(document, { key: "/" });

    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("leaves the slash key alone while the visitor is typing in a field", () => {
    render(<PharosVilleWorld world={worldFixture()} />);
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();

    fireEvent.keyDown(field, { key: "/" });

    expect(screen.queryByRole("combobox")).toBeNull();
    field.remove();
  });
});

// The session hour used to be reachable only by hand-editing `t=` into the
// address bar; `[` and `]` walk it from the keyboard instead, and the link
// keeps working exactly as it did.
describe("PharosVilleWorld time-of-day keys", () => {
  const renderAtHalfPastSix = () => {
    window.history.replaceState(null, "", "/#t=6.5");
    render(<PharosVilleWorld world={worldFixture()} />);
  };
  const linkedHour = () => new URLSearchParams(window.location.hash.slice(1)).get("t");

  it("steps the hour later and writes it into the link", async () => {
    renderAtHalfPastSix();

    fireEvent.keyDown(document, { key: "]" });

    expect(screen.getByText("Time of day 07:00.")).toBeTruthy();
    await waitFor(() => expect(globalThis.__pharosVilleTestWallClockHour).toBe(7));
    await waitFor(() => expect(linkedHour()).toBe("7"));
  });

  it("steps the hour earlier and writes it into the link", async () => {
    renderAtHalfPastSix();

    fireEvent.keyDown(document, { key: "[" });

    expect(screen.getByText("Time of day 06:00.")).toBeTruthy();
    await waitFor(() => expect(linkedHour()).toBe("6"));
  });

  it("holds at the last quarter hour of the day", async () => {
    window.history.replaceState(null, "", "/#t=23.5");
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.keyDown(document, { key: "]" });
    fireEvent.keyDown(document, { key: "]" });

    // The live region paces its queue, so the second press repeats the hour
    // rather than adding a new one — the point is that it does not wrap to 00.
    expect(screen.getByText("Time of day 23:45.")).toBeTruthy();
    await waitFor(() => expect(linkedHour()).toBe("23.75"));
  });

  it("holds at the first hour of the day", async () => {
    window.history.replaceState(null, "", "/#t=0.25");
    render(<PharosVilleWorld world={worldFixture()} />);

    fireEvent.keyDown(document, { key: "[" });
    fireEvent.keyDown(document, { key: "[" });

    expect(screen.getByText("Time of day 00:00.")).toBeTruthy();
    await waitFor(() => expect(linkedHour()).toBe("0"));
  });

  it("leaves the bracket keys alone while a reference panel is open", async () => {
    renderAtHalfPastSix();
    fireEvent.click(screen.getByRole("button", { name: "Legend" }));
    await screen.findByTestId("pharosville-legend-panel");

    fireEvent.keyDown(document, { key: "]" });

    expect(screen.queryByText("Time of day 07:00.")).toBeNull();
    expect(linkedHour()).toBe("6.5");
  });

  it("leaves the bracket keys alone while the visitor is typing in a field", () => {
    renderAtHalfPastSix();
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();

    fireEvent.keyDown(field, { key: "]" });

    expect(screen.queryByText("Time of day 07:00.")).toBeNull();
    expect(linkedHour()).toBe("6.5");
    field.remove();
  });

  it("leaves a modified bracket press to the browser", () => {
    renderAtHalfPastSix();

    fireEvent.keyDown(document, { key: "]", metaKey: true });

    expect(screen.queryByText("Time of day 07:00.")).toBeNull();
    expect(linkedHour()).toBe("6.5");
  });
});

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
        // A DockNode always carries a tile; the fixture omitted it and only got
        // away with it while gardenDockDisplayTile passed its argument through
        // untouched.
        tile: { x: 5, y: 5 },
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
