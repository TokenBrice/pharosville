import type * as DetailModule from "./DetailPanels";

/** Closed panels stay off the first-frame graph; the arrival owner warms this after world reveal. */
let pending: Promise<typeof DetailModule> | undefined;
export function preloadDetails(): Promise<typeof DetailModule> {
  return pending ??= import("./DetailPanels").catch((error: unknown) => {
    pending = undefined;
    throw error;
  });
}
