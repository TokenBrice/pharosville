import type { CameraPreset } from "../engine/camera-rig";

export interface ScreenRect { left: number; top: number; right: number; bottom: number }
export interface SubjectBounds { center: [number, number, number]; radius: number }

/** Bounds for a selected pier or sea area, including its full footprint. */
export function footprintBounds(points: readonly [number, number][], top: number): SubjectBounds | null {
  if (!points.length) return null;
  const xs = points.map((p) => p[0]), zs = points.map((p) => p[1]);
  const left = Math.min(...xs), right = Math.max(...xs), near = Math.min(...zs), far = Math.max(...zs);
  return { center: [(left + right) / 2, top / 2, (near + far) / 2], radius: Math.hypot((right - left) / 2, top / 2, (far - near) / 2) };
}

/** Largest uninterrupted rectangle beside the measured sheets, inset by the reading margin. */
export function usableSpace(width: number, height: number, overlays: ScreenRect[], padding = 24): ScreenRect {
  let free: ScreenRect[] = [{ left: 0, top: 0, right: width, bottom: height }];
  for (const o of overlays) free = free.flatMap((r) => {
    if (o.right <= r.left || o.left >= r.right || o.bottom <= r.top || o.top >= r.bottom) return [r];
    return [{ ...r, right: Math.max(r.left, o.left) }, { ...r, left: Math.min(r.right, o.right) },
      { ...r, bottom: Math.max(r.top, o.top) }, { ...r, top: Math.min(r.bottom, o.bottom) }];
  });
  const r = free.reduce((a, b) => (a.right - a.left) * (a.bottom - a.top) >= (b.right - b.left) * (b.bottom - b.top) ? a : b);
  const px = Math.min(padding, (r.right - r.left) / 4), py = Math.min(padding, (r.bottom - r.top) / 4);
  return { left: r.left + px, right: r.right - px, top: r.top + py, bottom: r.bottom - py };
}

/** A sphere fits even at the near edge, including a tall landmark's lantern. */
export function frameSubject(subject: SubjectBounds, space: ScreenRect, width: number, height: number, pose: CameraPreset): CameraPreset {
  const tan = Math.tan(pose.fovDeg * Math.PI / 360);
  const half = Math.min(space.right - space.left, space.bottom - space.top) / 2;
  const offsetX = width / 2 - (space.left + space.right) / 2, offsetY = (space.top + space.bottom) / 2 - height / 2;
  const offAxis = 1 + 2 * Math.max(Math.abs(offsetX), Math.abs(offsetY)) * tan / height;
  const distance = Math.max(pose.distance, subject.radius + subject.radius * offAxis * height / (2 * Math.max(1, half) * tan));
  const perPx = 2 * distance * tan / height;
  const dx = offsetX * perPx;
  const dy = offsetY * perPx;
  const yaw = pose.yawDeg * Math.PI / 180, pitch = pose.pitchDeg * Math.PI / 180;
  const [x, y, z] = subject.center;
  return { ...pose, distance, target: [x + Math.cos(yaw) * dx - Math.sin(yaw) * Math.sin(pitch) * dy,
    y + Math.cos(pitch) * dy, z - Math.sin(yaw) * dx - Math.cos(yaw) * Math.sin(pitch) * dy] };
}
