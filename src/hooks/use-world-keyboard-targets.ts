import { useCallback, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject } from "react";
import type { HitTarget } from "../renderer/hit-testing";
import type { ScreenPoint } from "../systems/projection";
import type { PharosVilleWorld as PharosVilleWorldModel } from "../systems/world-types";
import { isDialogEventTarget } from "./keyboard-event-target";
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

  // Returns false when Tab should fall through to the browser so keyboard
  // users can leave the map cycle and reach the toolbar, search, and footer
  // controls the cheatsheet promises (bounded cycle, no modulo trap).
  const cycleKeyboardTarget = useCallback((backwards: boolean): boolean => {
    const snapshot = recomputeHitTargets();
    const targets = keyboardTargetOrder(snapshot?.targets ?? hitTargetsRef.current);
    if (targets.length === 0) {
      setKeyboardFocusedDetailId(null);
      setHoveredDetailId(null);
      return false;
    }

    const currentDetailId = keyboardFocusedDetailId ?? selectedDetailId;
    const currentIndex = currentDetailId
      ? targets.findIndex((target) => target.detailId === currentDetailId)
      : -1;
    let nextIndex: number;
    if (currentIndex === -1) {
      nextIndex = backwards ? targets.length - 1 : 0;
    } else {
      nextIndex = currentIndex + (backwards ? -1 : 1);
      if (nextIndex < 0 || nextIndex >= targets.length) {
        setKeyboardFocusedDetailId(null);
        setHoveredDetailId(null);
        setAnnouncement("End of map targets; continuing to page controls.");
        if (reducedMotion) requestPaint();
        return false;
      }
    }

    const nextTarget = targets[nextIndex]!;
    setKeyboardFocusedDetailId(nextTarget.detailId);
    setHoveredDetailId(nextTarget.detailId);
    const detail = world.detailIndex[nextTarget.detailId];
    setAnnouncement(`Focused ${detail?.title ?? nextTarget.label}. Press Enter to select.`);
    if (reducedMotion) requestPaint();
    return true;
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
    // An open panel owns every key pressed inside it — its focus trap, its
    // scrolling body, its own Escape. None of it is map input.
    if (isDialogEventTarget(event.target)) return;
    if (!isInteractiveEventTarget(event.target) && event.key === "Tab") {
      if (cycleKeyboardTarget(event.shiftKey)) event.preventDefault();
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
  if (target.anchor) return target.anchor;
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

function isInteractiveEventTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement
    && Boolean(target.closest("a, button, input, select, textarea, summary, [role='button']"));
}
