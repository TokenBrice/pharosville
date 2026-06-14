import { useCallback, useMemo, useState } from "react";
import type { IsoCamera } from "../systems/projection";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { DEFAULT_WORLD_SELECTED_DETAIL_ID } from "./use-world-selection";
import { clampManualTimeOverrideHour } from "./use-world-time-controls";

type WorldUrlDescriptorTarget = "hash" | "search";

export type WorldUrlCopyResult = "copied" | "failed" | "unavailable";

export interface WorldUrlInitialState {
  camera: IsoCamera | null;
  followSelectedDetailId: string | null;
  manualTimeOverrideHour: number | null;
  nightMode: boolean;
  selectedDetailId: string;
}

export interface WorldUrlWriteState {
  camera?: IsoCamera | null;
  nightMode?: boolean;
  selectedDetailId?: string | null;
  timeHour?: number | null;
}

const OWNED_WORLD_URL_KEYS = ["sel", "t", "n", "cam"] as const;

export function useWorldUrlState(input: {
  world: PharosVilleWorldModel;
}) {
  const { world } = input;
  const [parsed] = useState(() => parseInitialWorldUrlState(world));
  const { initialState, target } = parsed;

  const replaceWorldUrlState = useCallback((state: WorldUrlWriteState): string | null => {
    if (typeof window === "undefined") return null;
    const nextHref = buildWorldUrlHref(window.location.href, target, state);
    window.history.replaceState(window.history.state, "", nextHref);
    return nextHref;
  }, [target]);

  const copyWorldUrlState = useCallback(async (state: WorldUrlWriteState): Promise<WorldUrlCopyResult> => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return "unavailable";
    const nextHref = replaceWorldUrlState(state);
    if (!nextHref) return "unavailable";
    try {
      await navigator.clipboard.writeText(nextHref);
      return "copied";
    } catch {
      return "failed";
    }
  }, [replaceWorldUrlState]);

  return useMemo(() => ({
    copyWorldUrlState,
    initialState,
    replaceWorldUrlState,
  }), [copyWorldUrlState, initialState, replaceWorldUrlState]);
}

export function parseInitialWorldUrlState(world: PharosVilleWorldModel): {
  initialState: WorldUrlInitialState;
  target: WorldUrlDescriptorTarget;
} {
  if (typeof window === "undefined") {
    return {
      initialState: defaultInitialWorldUrlState(),
      target: "hash",
    };
  }

  const url = new URL(window.location.href);
  const hashParams = paramsFromHash(url.hash);
  const searchParams = new URLSearchParams(url.search);
  const target = chooseDescriptorTarget(hashParams, searchParams);
  const params = target === "hash" ? hashParams : searchParams;
  const rawSelectedDetailId = params.get("sel");
  const camera = parseCamera(params.get("cam"));
  const selectedDetailId = parseSelectedDetailId(rawSelectedDetailId, world);
  const hasValidSelectedDetail = Boolean(rawSelectedDetailId && world.entityById[rawSelectedDetailId]);

  return {
    initialState: {
      camera,
      followSelectedDetailId: hasValidSelectedDetail && camera === null ? selectedDetailId : null,
      manualTimeOverrideHour: parseHour(params.get("t")),
      nightMode: params.get("n") === "1",
      selectedDetailId,
    },
    target,
  };
}

export function buildWorldUrlHref(
  currentHref: string,
  target: WorldUrlDescriptorTarget,
  state: WorldUrlWriteState,
): string {
  const url = new URL(currentHref);
  const params = target === "hash" ? paramsFromHash(url.hash) : new URLSearchParams(url.search);
  applyWorldUrlWriteState(params, state);

  if (target === "hash") {
    const hash = params.toString();
    url.hash = hash ? `#${hash}` : "";
  } else {
    const search = params.toString();
    url.search = search ? `?${search}` : "";
  }

  return url.href;
}

function defaultInitialWorldUrlState(): WorldUrlInitialState {
  return {
    camera: null,
    followSelectedDetailId: null,
    manualTimeOverrideHour: null,
    nightMode: false,
    selectedDetailId: DEFAULT_WORLD_SELECTED_DETAIL_ID,
  };
}

function chooseDescriptorTarget(
  hashParams: URLSearchParams,
  searchParams: URLSearchParams,
): WorldUrlDescriptorTarget {
  if (hasOwnedWorldUrlKeys(hashParams) || Array.from(hashParams.keys()).length > 0) return "hash";
  if (hasOwnedWorldUrlKeys(searchParams)) return "search";
  return "hash";
}

function hasOwnedWorldUrlKeys(params: URLSearchParams): boolean {
  return OWNED_WORLD_URL_KEYS.some((key) => params.has(key));
}

function paramsFromHash(hash: string): URLSearchParams {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
}

function parseSelectedDetailId(rawSelectedDetailId: string | null, world: PharosVilleWorldModel): string {
  if (rawSelectedDetailId && world.entityById[rawSelectedDetailId]) return rawSelectedDetailId;
  return DEFAULT_WORLD_SELECTED_DETAIL_ID;
}

function parseHour(rawHour: string | null): number | null {
  if (rawHour === null) return null;
  return clampManualTimeOverrideHour(Number(rawHour));
}

function parseCamera(rawCamera: string | null): IsoCamera | null {
  if (!rawCamera) return null;
  const parts = rawCamera.split(",");
  if (parts.length !== 3) return null;
  const [offsetX, offsetY, zoom] = parts.map(Number);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY) || !Number.isFinite(zoom) || zoom <= 0) return null;
  return { offsetX, offsetY, zoom };
}

function applyWorldUrlWriteState(params: URLSearchParams, state: WorldUrlWriteState): void {
  if ("selectedDetailId" in state) {
    if (state.selectedDetailId) {
      params.set("sel", state.selectedDetailId);
    } else {
      params.delete("sel");
    }
  }

  if ("timeHour" in state) {
    if (state.timeHour === null) {
      params.delete("t");
    } else {
      const clampedHour = clampManualTimeOverrideHour(state.timeHour);
      if (clampedHour !== null) params.set("t", formatCompactNumber(clampedHour, 2));
    }
  }

  if ("nightMode" in state) {
    params.set("n", state.nightMode ? "1" : "0");
  }

  if ("camera" in state) {
    if (state.camera) {
      params.set("cam", [
        formatCompactNumber(state.camera.offsetX, 2),
        formatCompactNumber(state.camera.offsetY, 2),
        formatCompactNumber(state.camera.zoom, 3),
      ].join(","));
    } else {
      params.delete("cam");
    }
  }
}

function formatCompactNumber(value: number, fractionDigits: number): string {
  return String(Number(value.toFixed(fractionDigits)));
}
