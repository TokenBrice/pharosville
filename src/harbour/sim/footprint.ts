import hulls from "./hull-footprints.json";
import { indexVariants, pickVariant } from "../fleet/variants";
import { titanFor } from "../fleet/titans";
import type { Boat } from "../model/types";
import type { SimLayout } from "./layout-graph";

const index = indexVariants(hulls);
const byId = new Map(hulls.map((h) => [h.id, h]));

/** Same variant fallback and scaling as FleetSystem; this compact manifest slice is checked in tests. */
export function footprint(b: Pick<Boat, "id" | "rig" | "hullClass">, L: Pick<SimLayout, "loa" | "beam">): { loa: number; beam: number } {
  const hero = titanFor(b.id, (id) => byId.has(id));
  const h = byId.get(hero ?? pickVariant(index, b.rig, b.hullClass) ?? "");
  const loa = hero && h ? h.loa_m : L.loa[b.hullClass];
  return { loa, beam: h ? h.beam_m * (loa / h.loa_m) : L.beam[b.hullClass] };
}

/** True when `id` resolves to a hero titan hull in the kit manifest. */
export function isTitanBoat(id: string): boolean {
  return titanFor(id, (v) => byId.has(v)) !== null;
}

/** Conservative slot-conflict envelope for ordinary fleet hulls; titans use per-slot footprint checks. */
export function slotFootprint(cls: Boat["hullClass"], L: Pick<SimLayout, "loa" | "beam">): { loa: number; beam: number } {
  let loa = L.loa[cls], beam = L.beam[cls];
  for (const rig of ["usd", "eur", "gold", "fiat", "other"] as const) {
    const f = footprint({ id: "", rig, hullClass: cls }, L);
    loa = Math.max(loa, f.loa); beam = Math.max(beam, f.beam);
  }
  for (const h of hulls) {
    if (h.class !== cls || h.id.startsWith("titan_")) continue;
    loa = Math.max(loa, L.loa[cls]);
    beam = Math.max(beam, h.beam_m * (L.loa[cls] / h.loa_m));
  }
  return { loa, beam };
}
