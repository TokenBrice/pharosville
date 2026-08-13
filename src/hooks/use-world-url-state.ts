import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IsoCamera } from "../systems/projection";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { clampManualTimeOverrideHour } from "./use-world-time-controls";

type WorldUrlDescriptorTarget = "hash" | "search";

export interface WorldUrlInitialState {
  camera: IsoCamera | null;
  followSelectedDetailId: string | null;
  /** True when the URL carried an explicit sel= param, resolved or not. */
  hasExplicitSelection: boolean;
  manualTimeOverrideHour: number | null;
  nightMode: boolean;
  /**
   * S1 (2026-07-25): `null` when the URL names no selection.
   *
   * This used to fall back to the lighthouse, which meant every visit opened a
   * detail panel nobody asked for and then wrote `sel=lighthouse` into the URL,
   * so the panel outlived the visit that created it. Arriving at the harbour
   * with nothing selected is the honest default.
   */
  selectedDetailId: string | null;
}

export interface WorldUrlWriteState {
  camera?: IsoCamera | null;
  nightMode?: boolean;
  selectedDetailId?: string | null;
  timeHour?: number | null;
}

export interface WorldUrlLateResolvedSelection {
  detailId: string;
  follow: boolean;
}

// `cam` now belongs to the query-only moment URL contract. Keeping it out of
// this legacy descriptor chooser prevents a new `?ship=…&cam=…` URL from
// making the time controls write `t`/`n` into the query string.
const OWNED_WORLD_URL_KEYS = ["sel", "t", "n"] as const;

export function useWorldUrlState(input: {
  world: PharosVilleWorldModel;
}) {
  const { world } = input;
  const [parsed] = useState(() => parseInitialWorldUrlState(world));
  const { initialState, target, unresolvedSelectedDetailId } = parsed;

  // Cold loads parse the URL against the empty loading world, so a shared
  // ?sel= permalink to a ship cannot resolve yet. Keep the raw value and
  // resolve it once against the settled world; unknown ids keep the
  // lighthouse fallback.
  const [lateResolvedSelection, setLateResolvedSelection] = useState<WorldUrlLateResolvedSelection | null>(null);
  const pendingSelectedDetailIdRef = useRef(unresolvedSelectedDetailId);
  useEffect(() => {
    const rawSelectedDetailId = pendingSelectedDetailIdRef.current;
    if (!rawSelectedDetailId || world.routeMode !== "world") return;
    pendingSelectedDetailIdRef.current = null;
    if (!world.entityById[rawSelectedDetailId]) return;
    setLateResolvedSelection({
      detailId: rawSelectedDetailId,
      follow: initialState.camera === null,
    });
  }, [initialState.camera, world]);

  const replaceWorldUrlState = useCallback((state: WorldUrlWriteState): string | null => {
    if (typeof window === "undefined") return null;
    const nextHref = buildWorldUrlHref(window.location.href, target, state);
    window.history.replaceState(window.history.state, "", nextHref);
    return nextHref;
  }, [target]);

  return useMemo(() => ({
    initialState,
    lateResolvedSelection,
    replaceWorldUrlState,
  }), [initialState, lateResolvedSelection, replaceWorldUrlState]);
}

export function parseInitialWorldUrlState(world: PharosVilleWorldModel): {
  initialState: WorldUrlInitialState;
  target: WorldUrlDescriptorTarget;
  unresolvedSelectedDetailId: string | null;
} {
  if (typeof window === "undefined") {
    return {
      initialState: defaultInitialWorldUrlState(),
      target: "hash",
      unresolvedSelectedDetailId: null,
    };
  }

  const url = new URL(window.location.href);
  const hashParams = paramsFromHash(url.hash);
  const searchParams = new URLSearchParams(url.search);
  const target = chooseDescriptorTarget(hashParams, searchParams);
  const params = target === "hash" ? hashParams : searchParams;
  const rawSelectedDetailId = params.get("sel");
  const camera = parseCamera(params.get("cam"));
  const selectedDetailId = resolveUrlSelection(rawSelectedDetailId, world);
  const hasValidSelectedDetail = Boolean(rawSelectedDetailId && world.entityById[rawSelectedDetailId]);

  return {
    initialState: {
      camera,
      followSelectedDetailId: hasValidSelectedDetail && camera === null ? selectedDetailId : null,
      hasExplicitSelection: Boolean(rawSelectedDetailId),
      manualTimeOverrideHour: parseHour(params.get("t")),
      nightMode: params.get("n") === "1",
      selectedDetailId,
    },
    target,
    unresolvedSelectedDetailId: rawSelectedDetailId && !hasValidSelectedDetail ? rawSelectedDetailId : null,
  };
}

/**
 * A link built for sharing rather than for the address bar.
 *
 * The world keeps its params in the fragment, which never reaches a server, so
 * an unfurled link would always show the generic card no matter what was
 * selected. Sharing moves them to the query string, which `functions/index.ts`
 * can read to rewrite the card — and which `chooseDescriptorTarget` reads back
 * as the owned target, since the fragment it prefers is left empty here.
 */
export function buildShareableWorldUrlHref(currentHref: string): string {
  const url = new URL(currentHref);
  const hashParams = paramsFromHash(url.hash);
  const searchParams = new URLSearchParams(url.search);
  // W6.5 moment links are already in the server-visible half of the URL. Do
  // not run them through the legacy hash-to-query conversion below, which
  // would discard `?ship=…&cam=…` when the existing time controls own the hash.
  if (searchParams.has("ship") || searchParams.has("cam")) return url.href;
  const owned = chooseDescriptorTarget(hashParams, searchParams) === "hash" ? hashParams : searchParams;
  const search = owned.toString();
  url.hash = "";
  url.search = search ? `?${search}` : "";
  return url.href;
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
    hasExplicitSelection: false,
    manualTimeOverrideHour: null,
    nightMode: false,
    selectedDetailId: null,
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

/**
 * The selection a URL asks for, or `null`.
 *
 * An unresolvable `sel=` stays null here; `unresolvedSelectedDetailId` carries
 * it so a cold-load permalink can be re-resolved once the real world settles.
 */
function resolveUrlSelection(rawSelectedDetailId: string | null, world: PharosVilleWorldModel): string | null {
  if (rawSelectedDetailId && world.entityById[rawSelectedDetailId]) return rawSelectedDetailId;
  return null;
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
