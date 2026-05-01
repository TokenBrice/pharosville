import type {
  PegSummaryResponse,
  ReportCardsResponse,
  StablecoinListResponse,
  StabilityIndexResponse,
  StressSignalsAllResponse,
} from "@shared/types";
import type { ChainsResponse } from "@shared/types/chains";
import type { CemeteryEntry } from "@shared/lib/cemetery-runtime";
import type {
  DetailModel,
  DockNode,
  LighthouseNode,
  PharosVilleFreshness,
  PharosVilleMap,
  PharosVilleWorld,
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
  cemeteryEntries?: readonly CemeteryEntry[];
  freshness: PharosVilleFreshness;
  routeMode?: PharosVilleWorld["routeMode"];
}

export type PharosVilleWorldBase = Omit<PharosVilleWorld, "detailIndex" | "entityById" | "visualCues">;

export interface BuildWorldScaffoldStage {
  map: PharosVilleMap;
  lighthouse: LighthouseNode;
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

export interface DetailIndexStage {
  detailIndex: Record<string, DetailModel>;
  entityById: Record<string, SelectableWorldEntity>;
}
