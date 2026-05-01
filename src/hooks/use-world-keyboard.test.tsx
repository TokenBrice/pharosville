// @vitest-environment jsdom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mirror of the keyboard logic in pharosville-world.tsx so we can verify the
// dispatch table independently of the world shell's rendering surface.
// If pharosville-world.tsx changes, update this test alongside.
function makeHandler(handlers: {
  zoomIn: () => void;
  zoomOut: () => void;
  pan: (delta: { x: number; y: number }) => void;
  clearSelection: () => void;
}) {
  return (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    const interactive = target?.closest("a, button, input, select, textarea");
    if (interactive) return;
    if (event.key === "Escape") {
      event.preventDefault();
      handlers.clearSelection();
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      handlers.zoomIn();
      return;
    }
    if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      handlers.zoomOut();
      return;
    }
    if (event.key === "ArrowUp") { event.preventDefault(); handlers.pan({ x: 0, y: 32 }); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); handlers.pan({ x: 0, y: -32 }); return; }
    if (event.key === "ArrowLeft") { event.preventDefault(); handlers.pan({ x: 32, y: 0 }); return; }
    if (event.key === "ArrowRight") { event.preventDefault(); handlers.pan({ x: -32, y: 0 }); return; }
  };
}

function setup() {
  const zoomIn = vi.fn();
  const zoomOut = vi.fn();
  const pan = vi.fn();
  const clearSelection = vi.fn();
  const handler = makeHandler({ zoomIn, zoomOut, pan, clearSelection });
  const { container } = render(<main onKeyDown={(e) => handler(e.nativeEvent)} tabIndex={0} />);
  const root = container.querySelector("main")!;
  return { root, zoomIn, zoomOut, pan, clearSelection };
}

describe("world keyboard shortcuts", () => {
  it("Escape clears selection", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "Escape" });
    expect(t.clearSelection).toHaveBeenCalledOnce();
  });

  it("+ and = zoom in", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "+" });
    fireEvent.keyDown(t.root, { key: "=" });
    expect(t.zoomIn).toHaveBeenCalledTimes(2);
  });

  it("- and _ zoom out", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "-" });
    fireEvent.keyDown(t.root, { key: "_" });
    expect(t.zoomOut).toHaveBeenCalledTimes(2);
  });

  it("arrow keys pan in correct cardinal directions", () => {
    const t = setup();
    fireEvent.keyDown(t.root, { key: "ArrowUp" });
    fireEvent.keyDown(t.root, { key: "ArrowDown" });
    fireEvent.keyDown(t.root, { key: "ArrowLeft" });
    fireEvent.keyDown(t.root, { key: "ArrowRight" });
    expect(t.pan).toHaveBeenNthCalledWith(1, { x: 0, y: 32 });
    expect(t.pan).toHaveBeenNthCalledWith(2, { x: 0, y: -32 });
    expect(t.pan).toHaveBeenNthCalledWith(3, { x: 32, y: 0 });
    expect(t.pan).toHaveBeenNthCalledWith(4, { x: -32, y: 0 });
  });
});
