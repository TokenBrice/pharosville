import type {
  PegSummaryResponse,
  ReportCardsResponse,
  StablecoinListResponse,
  StabilityIndexResponse,
  StressSignalsAllResponse,
} from "@shared/types";
import type { ChainsResponse } from "@shared/types/chains";
import type { CemeteryEntry } from "@shared/lib/cemetery-runtime";
import type { MintBurnFlowsResponse } from "@shared/types/mint-burn";
import type {
  DetailModel,
  DockNode,
  FleetIssuance,
  LighthouseNode,
  PharosVilleFreshness,
  PharosVilleMap,
  PharosVilleWorld,
  PigeonnierNode,
  SelectableWorldEntity,
  ShipNode,
} from "../world-types";

export interface PharosVilleInputs {
  generatedAt?: number;
  stablecoins: StablecoinListResponse | null | undefined;
  chains: ChainsResponse | null | undefined;
  stability: StabilityIndexResponse | null | undefined;
  pegSummary: PegSummaryResponse | null | undefined;
  stress: StressSignalsAllResponse | null | undefined;
  reportCards: ReportCardsResponse | null | undefined;
  // Optional, unlike the six above: mint/burn is an ENRICHER. A world built
  // without it is a real harbour whose quays simply report their issuance as
  // unmeasured, so a caller that has no flow payload passes nothing rather than
  // being forced to spell out its absence.
  mintBurn?: MintBurnFlowsResponse | null | undefined;
  cemeteryEntries?: readonly CemeteryEntry[];
  freshness: PharosVilleFreshness;
  routeMode?: PharosVilleWorld["routeMode"];
}

export type PharosVilleWorldBase = Omit<PharosVilleWorld, "detailIndex" | "entityById" | "visualCues">;

export interface BuildWorldScaffoldStage {
  map: PharosVilleMap;
  lighthouse: LighthouseNode;
  pigeonnier: PigeonnierNode;
  docks: DockNode[];
  areas: PharosVilleWorld["areas"];
  graves: PharosVilleWorld["graves"];
}

export interface BuildShipsStage {
  ships: ShipNode[];
}

export interface DockAssignmentStage {
  ships: ShipNode[];
}

export interface CargoTideStage {
  docks: DockNode[];
  fleetIssuance: FleetIssuance | null;
}

export interface DetailIndexStage {
  detailIndex: Record<string, DetailModel>;
  entityById: Record<string, SelectableWorldEntity>;
}
