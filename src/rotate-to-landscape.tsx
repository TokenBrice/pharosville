import { SmallScreenWelcome } from "./desktop-only-fallback";

/** Kept as the viewport-gate surface; admission depends on size, not rotation. */
export function RotateToLandscape() {
  return <SmallScreenWelcome windowCanFit />;
}
