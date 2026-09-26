import type { IsoCamera, ScreenPoint } from "../systems/projection";

export function samePoint(left: ScreenPoint, right: ScreenPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

/** Rest presence (W1.0): 0 on the rig. */
function restPresence(camera: IsoCamera): number {
  return camera.rest?.presence ?? 0;
}

/** Composed-shot presence (W1.7): 0 without a shot. */
function shotPresence(camera: IsoCamera): number {
  return camera.shot?.presence ?? 0;
}

export function sameCamera(left: IsoCamera | null, right: IsoCamera | null): boolean {
  if (left === null || right === null) return left === right;
  return left.offsetX === right.offsetX && left.offsetY === right.offsetY && left.zoom === right.zoom
    && restPresence(left) === restPresence(right)
    && (restPresence(left) === 0 || left.rest?.view === right.rest?.view)
    && shotPresence(left) === shotPresence(right)
    && (shotPresence(left) === 0 || left.shot?.view === right.shot?.view);
}

export function nearlySameCamera(left: IsoCamera, right: IsoCamera): boolean {
  return Math.abs(left.offsetX - right.offsetX) < 0.01
    && Math.abs(left.offsetY - right.offsetY) < 0.01
    && Math.abs(left.zoom - right.zoom) < 0.0001
    && Math.abs(restPresence(left) - restPresence(right)) < 1e-4
    && (restPresence(left) === 0 || left.rest?.view === right.rest?.view)
    && Math.abs(shotPresence(left) - shotPresence(right)) < 1e-4
    && (shotPresence(left) === 0 || left.shot?.view === right.shot?.view);
}
