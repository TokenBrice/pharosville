// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { HitTarget } from "../renderer/hit-testing";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { useWorldKeyboardTargets } from "./use-world-keyboard-targets";

function target(detailId: string, priority = 1): HitTarget {
  return {
    detailId,
    label: detailId,
    priority,
    rect: { x: 0, y: 0, width: 10, height: 10 },
  } as unknown as HitTarget;
}

function keyEvent(key: string, shiftKey = false): ReactKeyboardEvent<HTMLElement> {
  return {
    key,
    shiftKey,
    target: document.createElement("main"),
    preventDefault: vi.fn(),
  } as unknown as ReactKeyboardEvent<HTMLElement>;
}

function setup(input: { focused: string | null; targets: HitTarget[] }) {
  const setKeyboardFocusedDetailId = vi.fn();
  const setAnnouncement = vi.fn();
  const { result } = renderHook(() => useWorldKeyboardTargets({
    canvasHandleKeyDown: vi.fn(),
    canvasSizeRef: { current: { x: 800, y: 600 } },
    hitTargetsRef: { current: input.targets },
    keyboardFocusedDetailId: input.focused,
    recomputeHitTargets: () => ({ targets: input.targets }),
    reducedMotion: false,
    requestPaint: vi.fn(),
    selectDetail: vi.fn(),
    selectedDetailId: null,
    setAnnouncement,
    setHoveredDetailId: vi.fn(),
    setKeyboardFocusedDetailId,
    world: { detailIndex: {} } as unknown as PharosVilleWorldModel,
  }));
  return { handler: result.current, setAnnouncement, setKeyboardFocusedDetailId };
}

describe("useWorldKeyboardTargets bounded Tab cycle", () => {
  it("consumes Tab while cycling through map targets", () => {
    const { handler, setKeyboardFocusedDetailId } = setup({
      focused: "ship.a",
      targets: [target("ship.a", 2), target("ship.b", 1)],
    });

    const event = keyEvent("Tab");
    handler(event);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(setKeyboardFocusedDetailId).toHaveBeenCalledWith("ship.b");
  });

  it("releases Tab past the last target so focus reaches page controls", () => {
    const { handler, setAnnouncement, setKeyboardFocusedDetailId } = setup({
      focused: "ship.b",
      targets: [target("ship.a", 2), target("ship.b", 1)],
    });

    const event = keyEvent("Tab");
    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(setKeyboardFocusedDetailId).toHaveBeenCalledWith(null);
    expect(setAnnouncement).toHaveBeenCalledWith("End of map targets; continuing to page controls.");
  });

  it("releases Shift+Tab before the first target", () => {
    const { handler } = setup({
      focused: "ship.a",
      targets: [target("ship.a", 2), target("ship.b", 1)],
    });

    const event = keyEvent("Tab", true);
    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("releases Tab entirely when no map targets exist", () => {
    const { handler } = setup({ focused: null, targets: [] });

    const event = keyEvent("Tab");
    handler(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
