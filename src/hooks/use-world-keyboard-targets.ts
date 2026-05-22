import { useCallback, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from "react";
import type { HitTarget } from "../renderer/hit-testing";
import type { ScreenPoint } from "../systems/projection";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import type { DetailAnchor } from "./use-world-selection";

export function useWorldKeyboardTargets(input: {
  canvasHandleKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  canvasSizeRef: MutableRefObject<ScreenPoint>;
  hitTargetsRef: MutableRefObject<readonly HitTarget[]>;
  keyboardFocusedDetailId: string | null;
  recomputeHitTargets: () => { targets?: readonly HitTarget[]; targetsByDetailId?: ReadonlyMap<string, HitTarget> } | null;
  reducedMotion: boolean;
  requestPaint: () => void;
  selectDetail: (detailId: string, anchor: DetailAnchor | null) => void;
  selectedDetailId: string | null;
  setAnnouncement: (message: string) => void;
  setHoveredDetailId: (detailId: string | null) => void;
  setKeyboardFocusedDetailId: (detailId: string | null) => void;
  world: PharosVilleWorldModel;
}) {
  const {
    canvasHandleKeyDown,
    canvasSizeRef,
    hitTargetsRef,
    keyboardFocusedDetailId,
    recomputeHitTargets,
    reducedMotion,
    requestPaint,
    selectDetail,
    selectedDetailId,
    setAnnouncement,
    setHoveredDetailId,
    setKeyboardFocusedDetailId,
    world,
  } = input;

  const cycleKeyboardTarget = useCallback((backwards: boolean) => {
    const snapshot = recomputeHitTargets();
    const targets = keyboardTargetOrder(snapshot?.targets ?? hitTargetsRef.current);
    const nextTarget = nextKeyboardTarget(targets, keyboardFocusedDetailId ?? selectedDetailId, backwards);
    if (!nextTarget) {
      setKeyboardFocusedDetailId(null);
      setHoveredDetailId(null);
      setAnnouncement("No map targets available.");
      return;
    }

    setKeyboardFocusedDetailId(nextTarget.detailId);
    setHoveredDetailId(nextTarget.detailId);
    const detail = world.detailIndex[nextTarget.detailId];
    setAnnouncement(`Focused ${detail?.title ?? nextTarget.label}. Press Enter to select.`);
    if (reducedMotion) requestPaint();
  }, [
    hitTargetsRef,
    keyboardFocusedDetailId,
    recomputeHitTargets,
    reducedMotion,
    requestPaint,
    selectedDetailId,
    setAnnouncement,
    setHoveredDetailId,
    setKeyboardFocusedDetailId,
    world.detailIndex,
  ]);

  const selectKeyboardTarget = useCallback((): boolean => {
    if (!keyboardFocusedDetailId) return false;
    const snapshot = recomputeHitTargets();
    const target = snapshot?.targetsByDetailId?.get(keyboardFocusedDetailId)
      ?? hitTargetsRef.current.find((entry) => entry.detailId === keyboardFocusedDetailId)
      ?? null;
    const viewport = canvasSizeRef.current;
    const anchor = target
      ? detailAnchorForPoint(centerPointForTarget(target), viewport)
      : null;
    selectDetail(keyboardFocusedDetailId, anchor);
    if (reducedMotion) requestPaint();
    return true;
  }, [canvasSizeRef, hitTargetsRef, keyboardFocusedDetailId, recomputeHitTargets, reducedMotion, requestPaint, selectDetail]);

  return useCallback((event: ReactKeyboardEvent<HTMLElement>) => {
    if (!isInteractiveEventTarget(event.target) && event.key === "Tab") {
      event.preventDefault();
      cycleKeyboardTarget(event.shiftKey);
      return;
    }
    if (!isInteractiveEventTarget(event.target) && event.key === "Enter" && selectKeyboardTarget()) {
      event.preventDefault();
      return;
    }
    canvasHandleKeyDown(event);
  }, [canvasHandleKeyDown, cycleKeyboardTarget, selectKeyboardTarget]);
}

export function detailAnchorForPoint(point: ScreenPoint, viewport: ScreenPoint): DetailAnchor {
  const side = point.x > viewport.x * 0.6 ? "left" : "right";
  return { ...point, side };
}

function centerPointForTarget(target: HitTarget): ScreenPoint {
  return {
    x: target.rect.x + target.rect.width / 2,
    y: target.rect.y + target.rect.height / 2,
  };
}

function keyboardTargetOrder(targets: readonly HitTarget[]): HitTarget[] {
  const seenDetailIds = new Set<string>();
  const ordered: HitTarget[] = [];
  const byVisualPriority = targets
    .map((target, index) => ({ index, target }))
    .sort((left, right) => (
      right.target.priority - left.target.priority
      || right.index - left.index
    ));

  for (const entry of byVisualPriority) {
    if (seenDetailIds.has(entry.target.detailId)) continue;
    seenDetailIds.add(entry.target.detailId);
    ordered.push(entry.target);
  }
  return ordered;
}

function nextKeyboardTarget(
  targets: readonly HitTarget[],
  currentDetailId: string | null,
  backwards: boolean,
): HitTarget | null {
  if (targets.length === 0) return null;
  const currentIndex = currentDetailId
    ? targets.findIndex((target) => target.detailId === currentDetailId)
    : -1;
  if (currentIndex === -1) return backwards ? targets[targets.length - 1]! : targets[0]!;
  const delta = backwards ? -1 : 1;
  const nextIndex = (currentIndex + delta + targets.length) % targets.length;
  return targets[nextIndex]!;
}

function isInteractiveEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest("a, button, input, select, textarea, summary, [role='button']"));
}
