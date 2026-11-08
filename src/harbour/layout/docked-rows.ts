import { inPoly } from "../ui/places";
import type { HarbourLayout, Vec3 } from "./types";

/**
 * E08 overview focus: the docked rows of the inner harbour, the overview's subject. Every berth inside the bay
 * polygon (the grand mole's rows); the outer coves stay in the miniature's soft frame edge. Empty without a bay.
 */
export function dockedRows(layout: Pick<HarbourLayout, "piers" | "island">): Vec3[] {
  const bay = layout.island.bay;
  if (bay.length < 3) return [];
  return layout.piers.flatMap((pier) => pier.berths.filter((b) => inPoly(b.position[0], b.position[2], bay)).map((b) => b.position));
}
