import type { WorldSystem } from "./engine/types";
import { PlaceholderSystem } from "./placeholder";

/**
 * Ordered registry of world systems. Each owner appends its factory here (keep order):
 *   layout → sky → ocean → island/kit → lighthouse → fleet → lights → labels
 */
export const SYSTEMS: Array<() => WorldSystem> = [
  () => new PlaceholderSystem(),
];
