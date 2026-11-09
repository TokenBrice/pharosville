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

/** Conservative slot-conflict envelope; supply classes themselves keep their analytical dimensions. */
export function slotFootprint(cls: Boat["hullClass"], L: Pick<SimLayout, "loa" | "beam">): { loa: number; beam: number } {
  let loa = L.loa[cls], beam = L.beam[cls];
  for (const rig of ["usd", "eur", "gold", "fiat", "other"] as const) {
    const f = footprint({ id: "", rig, hullClass: cls }, L);
    loa = Math.max(loa, f.loa); beam = Math.max(beam, f.beam);
  }
  for (const h of hulls) {
    if (h.class !== cls) continue;
    const hero = h.id.startsWith("titan_");
    loa = Math.max(loa, hero ? h.loa_m : L.loa[cls]);
    beam = Math.max(beam, h.beam_m * (hero ? 1 : L.loa[cls] / h.loa_m));
  }
  return { loa, beam };
}
