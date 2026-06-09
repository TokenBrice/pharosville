// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render } from "@testing-library/react";
import { LEGEND_DISMISSED_STORAGE_KEY, useLegendDialog } from "./use-legend-dialog";

function Harness({ setAnnouncement }: { setAnnouncement: (message: string) => void }) {
  const legend = useLegendDialog({ setAnnouncement });
  return (
    <div>
      <output data-testid="legend-open">{legend.legendOpen ? "open" : "closed"}</output>
      <button type="button" data-testid="legend-open-button" onClick={legend.openLegend}>open</button>
      <button type="button" data-testid="legend-close-button" onClick={legend.closeLegend}>close</button>
    </div>
  );
}

// The repo's jsdom environment ships without localStorage (the hook treats
// that as "dismissed"); install a minimal in-memory implementation so these
// tests can exercise the real persistence paths.
function ensureLocalStorage(): void {
  if (window.localStorage) return;
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, String(value)),
      removeItem: (key: string) => void store.delete(key),
      clear: () => store.clear(),
    },
  });
}

describe("useLegendDialog", () => {
  beforeEach(() => {
    ensureLocalStorage();
    window.localStorage.removeItem(LEGEND_DISMISSED_STORAGE_KEY);
  });

  afterEach(() => {
    cleanup();
    // Restore the suite-wide seed from test-setup.ts.
    window.localStorage.setItem(LEGEND_DISMISSED_STORAGE_KEY, "1");
  });

  it("auto-opens on first visit and stays closed once dismissed", () => {
    const setAnnouncement = vi.fn();
    const first = render(<Harness setAnnouncement={setAnnouncement} />);
    expect(first.getByTestId("legend-open").textContent).toBe("open");

    act(() => {
      first.getByTestId("legend-close-button").click();
    });
    expect(first.getByTestId("legend-open").textContent).toBe("closed");
    expect(window.localStorage.getItem(LEGEND_DISMISSED_STORAGE_KEY)).toBe("1");
    expect(setAnnouncement).toHaveBeenCalledWith("Closed PharosVille legend.");
    first.unmount();

    const second = render(<Harness setAnnouncement={setAnnouncement} />);
    expect(second.getByTestId("legend-open").textContent).toBe("closed");
  });

  it("does not auto-open when previously dismissed, but reopens on demand", () => {
    window.localStorage.setItem(LEGEND_DISMISSED_STORAGE_KEY, "1");
    const setAnnouncement = vi.fn();
    const view = render(<Harness setAnnouncement={setAnnouncement} />);
    expect(view.getByTestId("legend-open").textContent).toBe("closed");

    act(() => {
      view.getByTestId("legend-open-button").click();
    });
    expect(view.getByTestId("legend-open").textContent).toBe("open");
    expect(setAnnouncement).toHaveBeenCalledWith("Opened PharosVille legend.");
  });

  it("closes on Escape and persists the dismissal", () => {
    const setAnnouncement = vi.fn();
    const view = render(<Harness setAnnouncement={setAnnouncement} />);
    expect(view.getByTestId("legend-open").textContent).toBe("open");

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(view.getByTestId("legend-open").textContent).toBe("closed");
    expect(window.localStorage.getItem(LEGEND_DISMISSED_STORAGE_KEY)).toBe("1");
  });
});
