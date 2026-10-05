import type { ReactNode } from "react";
import { SmallScreenWelcome } from "./desktop-only-fallback";

/** Kept as the viewport-gate surface; admission depends on size, not rotation. */
export function RotateToLandscape(props: { illustration?: ReactNode }) {
  return <SmallScreenWelcome {...props} windowCanFit />;
}
