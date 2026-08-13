import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import type { IsoCamera, ScreenPoint } from "../systems/projection";
import { clampCameraToMap } from "../systems/camera";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";

export const MOMENT_URL_SETTLE_DELAY_MS = 800;

export interface MomentUrlState {
  camera: IsoCamera | null;
  shipId: string | null;
}

interface UseMomentUrlInput {
  camera: IsoCamera | null;
  canvasSize: ScreenPoint;
  onRestoreShip: (detailId: string, frameSelection: boolean) => void;
  ready: boolean;
  selectedDetailId: string | null;
  moveCameraTo: ((camera: IsoCamera) => void) | null;
  setCamera: Dispatch<SetStateAction<IsoCamera | null>>;
  world: PharosVilleWorldModel;
}

/**
 * Owns the shareable, present-tense view only. Time deliberately stays in the
 * existing hash controls; this query contract carries a ship and a vantage,
 * never a historical world state.
 */
export function useMomentUrl(input: UseMomentUrlInput): void {
  const {
    camera,
    canvasSize,
    onRestoreShip,
    ready,
    selectedDetailId,
    moveCameraTo,
    setCamera,
    world,
  } = input;
  const [initialState] = useState(() => parseMomentUrl());
  const restoredRef = useRef(false);

  useEffect(() => {
    if (restoredRef.current || !ready || !camera || canvasSize.x <= 0 || canvasSize.y <= 0) return;
    restoredRef.current = true;

    const requestedShip = initialState.shipId ? world.entityById[initialState.shipId] : null;
    if (requestedShip?.kind === "ship" && requestedShip.detailId === initialState.shipId) {
      // Selection already has the established W4.6 follow path. Only ask it
      // to frame when the URL did not provide an explicit camera vantage.
      onRestoreShip(requestedShip.detailId, initialState.camera === null);
    }

    if (initialState.camera) {
      const restoredCamera = clampCameraToMap(initialState.camera, {
        map: world.map,
        viewport: { x: canvasSize.x, y: canvasSize.y },
      });
      if (moveCameraTo) moveCameraTo(restoredCamera);
      else setCamera(restoredCamera);
    }
  }, [camera, canvasSize.x, canvasSize.y, initialState, moveCameraTo, onRestoreShip, ready, setCamera, world]);

  useEffect(() => {
    if (!restoredRef.current || !ready || !camera || typeof window === "undefined") return;
    const timeoutId = window.setTimeout(() => {
      const selectedEntity = selectedDetailId ? world.entityById[selectedDetailId] : null;
      const shipId = selectedEntity?.kind === "ship" ? selectedEntity.detailId : null;
      const nextHref = buildMomentUrlHref(window.location.href, { camera, shipId });
      if (nextHref !== window.location.href) {
        window.history.replaceState(window.history.state, "", nextHref);
      }
    }, MOMENT_URL_SETTLE_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [camera, ready, selectedDetailId, world]);
}

export function parseMomentUrl(href?: string): MomentUrlState {
  if (typeof window === "undefined" && href === undefined) {
    return { camera: null, shipId: null };
  }

  const url = new URL(href ?? window.location.href);
  return {
    camera: parseMomentCamera(url.searchParams.get("cam")),
    shipId: url.searchParams.get("ship"),
  };
}

export function buildMomentUrlHref(currentHref: string, state: MomentUrlState): string {
  const url = new URL(currentHref);
  if (state.shipId) {
    url.searchParams.set("ship", state.shipId);
  } else {
    url.searchParams.delete("ship");
  }

  if (state.camera) {
    url.searchParams.set("cam", formatMomentCamera(state.camera));
  } else {
    url.searchParams.delete("cam");
  }

  return url.href;
}

function parseMomentCamera(rawCamera: string | null): IsoCamera | null {
  if (!rawCamera) return null;
  const [position, rawZoom, ...extra] = rawCamera.split("@");
  if (!position || !rawZoom || extra.length > 0) return null;
  const [rawX, rawY, ...extraPosition] = position.split(",");
  if (!rawX || !rawY || extraPosition.length > 0) return null;

  const offsetX = Number(rawX);
  const offsetY = Number(rawY);
  const zoom = Number(rawZoom);
  if (!Number.isFinite(offsetX) || !Number.isFinite(offsetY) || !Number.isFinite(zoom) || zoom <= 0) return null;
  return { offsetX, offsetY, zoom };
}

function formatMomentCamera(camera: IsoCamera): string {
  return `${formatMomentNumber(camera.offsetX)},${formatMomentNumber(camera.offsetY)}@${formatMomentNumber(camera.zoom)}`;
}

function formatMomentNumber(value: number): string {
  const quantized = Math.round(value * 10) / 10;
  return (Object.is(quantized, -0) ? 0 : quantized).toFixed(1);
}
