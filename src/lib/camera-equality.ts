import type { IsoCamera, ScreenPoint } from "../systems/projection";

export function samePoint(left: ScreenPoint, right: ScreenPoint): boolean {
  return left.x === right.x && left.y === right.y;
}

export function sameCamera(left: IsoCamera | null, right: IsoCamera | null): boolean {
  if (left === null || right === null) return left === right;
  return left.offsetX === right.offsetX && left.offsetY === right.offsetY && left.zoom === right.zoom;
}

export function nearlySameCamera(left: IsoCamera, right: IsoCamera): boolean {
  return Math.abs(left.offsetX - right.offsetX) < 0.01
    && Math.abs(left.offsetY - right.offsetY) < 0.01
    && Math.abs(left.zoom - right.zoom) < 0.0001;
}
