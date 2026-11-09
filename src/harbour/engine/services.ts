import type { FleetPreparation } from "../fleet/preparation";
import type { SoundController } from "../audio/controller";
import type { BeamService } from "../beam/beam-system";
import type { BeamUniforms } from "../beam/uniforms";
import type { CivicService } from "../civic/civic-system";
import type { HarbourFeed } from "../data/fetch";
import type { Bunting } from "../fleet/bunting";
import type { FleetFrameState, PickingService } from "../fleet/fleet-system";
import type { MastheadService } from "../fleet/mastheads";
import type { CoveService } from "../fleet/wreck-cove";
import type { IdentityService } from "../identity/identity-system";
import type { HarbourLayout } from "../layout/types";
import type { LifeService } from "../life/life-system";
import type { LightsStore } from "../lights/lights-service";
import type { EventsService } from "../model/event-hub";
import type { HarbourModel } from "../model/types";
import type { OceanService } from "../ocean/ocean-system";
import type { SharedFxTextures } from "../ocean/textures";
import type { WakeService } from "../ocean/wake";
import type { ReadingsService } from "../readings/readings-system";
import type { SeasonService } from "../season/season-system";
import type { HarbourSim } from "../sim/sim";
import type { SimulationClock } from "../sim/system";
import type { SkyService } from "../sky/sky-system";
import type { MotionService } from "../ui/services";
import type { GustService } from "../weather/gust";
import type { WeatherService } from "../weather/weather-system";
import type { GroundService } from "../world/ground";
import type { LighthouseService } from "../world/lighthouse-system";
import type { HarbourMaterials } from "../world/materials";
import type { SunRig } from "../world/sun";
import type { CameraPreset } from "./camera-rig";
import type { GraphicsValidity } from "./graphics";
import type { PostChain } from "./post";
import type { QualityService } from "./quality";
import type { PreparationService, ReadinessState, SimulationStatus } from "./types";

/** Fixed service keys and their publishers' contracts. Services may arrive after their consumers. */
export interface ServiceMap {
  "beam:uniforms": BeamUniforms;
  "fleet-frame": FleetFrameState;
  "fleet-preparation": FleetPreparation;
  "fx:textures": Promise<SharedFxTextures>;
  "graphics-validity": GraphicsValidity;
  "home-view": () => CameraPreset;
  "simulation-status": SimulationStatus;
  beam: BeamService;
  bunting: Bunting;
  civic: CivicService;
  cove: CoveService;
  events: EventsService;
  feed: HarbourFeed;
  ground: GroundService;
  gust: GustService;
  identity: IdentityService;
  layout: HarbourLayout;
  life: LifeService;
  lighthouse: LighthouseService;
  lights: LightsStore;
  mastheads: MastheadService;
  materials: HarbourMaterials;
  model: HarbourModel;
  motion: MotionService;
  ocean: OceanService;
  picking: PickingService;
  post: PostChain;
  preparation: PreparationService;
  quality: QualityService;
  readiness: ReadinessState;
  readings: ReadingsService;
  season: SeasonService;
  sim: HarbourSim;
  simclock: SimulationClock;
  sky: SkyService;
  sound: SoundController;
  sun: SunRig;
  wake: WakeService;
  weather: WeatherService;
}

/** Type-only facade over the engine's native Map; no runtime wrapper or eager service requirements. */
export interface Services extends Map<keyof ServiceMap, ServiceMap[keyof ServiceMap]> {
  get<K extends keyof ServiceMap>(key: K): ServiceMap[K] | undefined;
  set<K extends keyof ServiceMap>(key: K, value: ServiceMap[K]): this;
}
