import type { WorldSystem } from "./engine/types";
import { LayoutSystem } from "./layout/layout-system";
import { DataSystem } from "./sim/system";
import { SkySystem } from "./sky/sky-system";
import { OceanSystem } from "./ocean/ocean-system";
import { BeamSystem } from "./beam/beam-system";
import { IslandSystem } from "./world/island-system";
import { LighthouseSystem } from "./world/lighthouse-system";
import { LightsSystem } from "./lights/lights-system";
import { FleetSystem } from "./fleet/fleet-system";
import { ReadingsSystem } from "./readings/readings-system";
import { LifeSystem } from "./life/life-system";
import { IdentitySystem } from "./identity/identity-system";
import { CivicSystem } from "./civic/civic-system";

/**
 * Ordered registry of world systems. Each owner appends its factory here (keep order):
 *   layout → sky → ocean → island/kit → lighthouse → fleet → lights → labels
 */
export const SYSTEMS: Array<() => WorldSystem> = [
  () => new LayoutSystem(),
  () => new DataSystem(),
  () => new ReadingsSystem(),
  () => new SkySystem(),
  () => new OceanSystem(),
  () => new IslandSystem(),
  () => new LighthouseSystem(),
  () => new CivicSystem(),
  () => new FleetSystem(),
  () => new LifeSystem(),
  () => new IdentitySystem(),
  () => new LightsSystem(),
  () => new BeamSystem(),
];
