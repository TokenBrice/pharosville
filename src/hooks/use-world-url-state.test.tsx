// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { buildWorldUrlHref, useWorldUrlState } from "./use-world-url-state";

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("useWorldUrlState", () => {
  it("parses hash descriptors once and preserves unknown keys while writing", () => {
    window.history.replaceState(null, "", "/#f=ships&sel=ship.usdc&t=5.13&n=1&cam=10,20,1.5");

    const { result } = renderHook(() => useWorldUrlState({ world: worldFixture() }));

    expect(result.current.initialState).toEqual({
      camera: { offsetX: 10, offsetY: 20, zoom: 1.5 },
      followSelectedDetailId: null,
      manualTimeOverrideHour: 5.25,
      nightMode: true,
      selectedDetailId: "ship.usdc",
    });

    const href = result.current.replaceWorldUrlState({
      nightMode: false,
      selectedDetailId: null,
      timeHour: 12,
    });
    expect(href).not.toBeNull();
    const hashParams = new URL(href!).hash.slice(1);
    const params = new URLSearchParams(hashParams);
    expect(params.get("f")).toBe("ships");
    expect(params.has("sel")).toBe(false);
    expect(params.get("t")).toBe("12");
    expect(params.get("n")).toBe("0");
    expect(params.get("cam")).toBe("10,20,1.5");
  });

  it("falls back to lighthouse for unknown selections and ignores invalid time", () => {
    window.history.replaceState(null, "", "/#sel=missing&t=nope&n=2");

    const { result } = renderHook(() => useWorldUrlState({ world: worldFixture() }));

    expect(result.current.initialState.selectedDetailId).toBe("lighthouse");
    expect(result.current.initialState.followSelectedDetailId).toBeNull();
    expect(result.current.initialState.manualTimeOverrideHour).toBeNull();
    expect(result.current.initialState.nightMode).toBe(false);
  });

  it("can target search descriptors when no hash descriptor is present", () => {
    const href = buildWorldUrlHref("https://example.test/?foo=bar&sel=ship.usdc&t=24&n=1", "search", {
      camera: { offsetX: 1.234, offsetY: 5.678, zoom: 1.23456 },
      nightMode: false,
      selectedDetailId: "lighthouse",
      timeHour: 99,
    });
    const url = new URL(href);

    expect(url.searchParams.get("foo")).toBe("bar");
    expect(url.searchParams.get("sel")).toBe("lighthouse");
    expect(url.searchParams.get("t")).toBe("23.75");
    expect(url.searchParams.get("n")).toBe("0");
    expect(url.searchParams.get("cam")).toBe("1.23,5.68,1.235");
  });
});

function worldFixture(): PharosVilleWorldModel {
  return {
    entityById: {
      lighthouse: { detailId: "lighthouse", id: "lighthouse", kind: "lighthouse" },
      "ship.usdc": { detailId: "ship.usdc", id: "ship.usdc", kind: "ship" },
    },
  } as unknown as PharosVilleWorldModel;
}
