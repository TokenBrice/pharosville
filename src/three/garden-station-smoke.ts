import {
  Color,
  Group,
  InstancedBufferAttribute,
  Vector3,
  type DataTexture,
} from "three";
import { blendDayCycleScalar, type DayCyclePhase } from "./garden-day-cycle";
import { cargoTideCrateCount } from "./garden-cargo-tide";
import { createSmokePlume } from "./garden-beacon-fire";
import type { DockVisual } from "./garden-docks";
import { HARBOR_PALETTE } from "../systems/palette";
import type { PharosVilleRenderSchedulerTier } from "../renderer/render-types";

/**
 * D3 — Station chimney smoke, warm-village life phase.
 *
 * **Authored displacement:** three hearth chimneys — the uogashi kitchen, the
 * hatago-wharf inn, the tea-house-quay hearth — displace the beacon plume's
 * uniqueness as the harbour's only smoke. No light is displaced because no
 * light is added: the plumes are UNLIT (no emissive, no reflection lane, no
 * ember-budget entry), fade to a 0.35-opacity dark silhouette at night so they
 * stay ember-tier and never compete with the one dominant light, and shed at
 * the `constrained` tier like the beacon's own embers.
 *
 * **Data gate (DOM parity):** a chimney smokes only while its harbour's
 * `cargoTide` stands crates — the same `cargoTideCrateCount` gate, source
 * field, and "Net flow 24h" detail/ledger row as the quay's cargo tide — so a
 * cold chimney and an empty quay always agree. No new analytical meaning is
 * carried; the smoke is decorative dressing on an existing reading.
 *
 * **Clock discipline:** one mesh, one draw, zero per-frame allocation. Puff age
 * is a pure function of the shared route `timeSeconds` and per-instance seeds
 * inside the beacon's own `createSmokePlume` shader; drift rides the same
 * ambient sky-mist wind diagonal the beacon plume and the flags' wind share —
 * no new oscillator. Under reduced motion `uTime` pins to 0 and the puffs park
 * in their deterministic composed pose, exactly like the beacon's.
 */

/** The three archetypes whose hearths smoke, in deterministic chimney order. */
export const STATION_SMOKE_ARCHETYPES = [
  "uogashi",
  "hatago-wharf",
  "tea-house-quay",
] as const;
export type StationSmokeArchetype = (typeof STATION_SMOKE_ARCHETYPES)[number];

export const STATION_SMOKE_PUFFS_PER_CHIMNEY = 8;
export const STATION_SMOKE_MAX_CHIMNEYS = STATION_SMOKE_ARCHETYPES.length;
/** 8 puffs × 3 archetypes — the hard instance ceiling for this system. */
export const STATION_SMOKE_MAX_INSTANCES =
  STATION_SMOKE_PUFFS_PER_CHIMNEY * STATION_SMOKE_MAX_CHIMNEYS;

/** Rise band: puffs travel this far above the ridge anchor over one life. */
const STATION_SMOKE_RISE = 4.6;
const STATION_SMOKE_RISE_BASE = 0.1;
const STATION_SMOKE_QUAD = 1.1;
const STATION_SMOKE_SCALE_MIN = 0.38;
const STATION_SMOKE_SCALE_MAX = 1.25;
const STATION_SMOKE_WIND_DRIFT = 3.1;
const STATION_SMOKE_WOBBLE = 0.22;

// C1: colours derive from HARBOR_PALETTE's fog tokens, same as the beacon
// plume's, but with a black backlight — nothing burns behind a station chimney.
const P = HARBOR_PALETTE;
const STATION_SMOKE_DAY_LIGHT = new Color(P.fog_pale);
const STATION_SMOKE_DAY_DARK = new Color(P.fog_blue);
const STATION_SMOKE_NIGHT = new Color(P.deep_sea_1).lerp(new Color(P.fog_blue), 0.3);
const STATION_SMOKE_BACKLIGHT = new Color(0, 0, 0);

/** Day-first opacity ladder: full by day, half at dusk, ember-tier at night. */
export const STATION_SMOKE_OPACITY = { day: 1, dusk: 0.5, night: 0.35 } as const;

export function stationSmokeOpacity(
  phase: Pick<DayCyclePhase, "daylight" | "dusk">,
): number {
  return blendDayCycleScalar(
    STATION_SMOKE_OPACITY.night,
    STATION_SMOKE_OPACITY.dusk,
    STATION_SMOKE_OPACITY.day,
    phase.dusk,
    phase.daylight,
  );
}

export interface StationSmokeSpec {
  archetype: StationSmokeArchetype;
  detailId: string;
  /** Index into the composed docks array this chimney's gate reads each frame. */
  dockIndex: number;
  /** World-space chimney anchor, on the archetype's ridge. */
  anchor: Vector3;
}

/**
 * Resolves the ring's smoking chimneys: per archetype, the representative
 * station (largest `totalUsd`, detailId breaking ties) — one chimney per
 * ARCHETYPE, never per station, so the instance ceiling holds on every feed.
 */
export function stationSmokeSpecs(docks: readonly DockVisual[]): StationSmokeSpec[] {
  const chosen: { dockIndex: number; visual: DockVisual }[] = [];
  for (const [dockIndex, visual] of docks.entries()) {
    const archetype = STATION_SMOKE_ARCHETYPES.indexOf(
      visual.recipe.plan as StationSmokeArchetype,
    );
    if (archetype < 0) continue;
    const incumbent = chosen[archetype];
    if (incumbent) {
      const rank = rankForChimney(visual);
      const incumbentRank = rankForChimney(incumbent.visual);
      if (rank > incumbentRank) chosen[archetype] = { dockIndex, visual };
    } else {
      chosen[archetype] = { dockIndex, visual };
    }
  }
  const specs: StationSmokeSpec[] = [];
  for (const [archetype, entry] of chosen.entries()) {
    if (!entry) continue;
    const { chimney, anchorPosition, anchorRotationY, dock } = entry.visual.recipe;
    if (!chimney) continue;
    // Same local→world turn the cargo-tide crate slots take: rotate by the
    // dock root's yaw, then offset by its anchor position.
    const cos = Math.cos(anchorRotationY);
    const sin = Math.sin(anchorRotationY);
    specs.push({
      anchor: new Vector3(
        anchorPosition.x + chimney.x * cos + chimney.z * sin,
        anchorPosition.y + chimney.y,
        anchorPosition.z - chimney.x * sin + chimney.z * cos,
      ),
      archetype: STATION_SMOKE_ARCHETYPES[archetype]!,
      detailId: dock.detailId,
      dockIndex: entry.dockIndex,
    });
  }
  return specs;
}

function rankForChimney(visual: DockVisual): number {
  // totalUsd ranks; detailId only breaks exact ties so a re-render never
  // swaps chimneys between equal harbours.
  const totalUsd = visual.recipe.dock.totalUsd;
  return Number.isFinite(totalUsd) && totalUsd > 0 ? totalUsd : 0;
}

export interface GardenStationSmokeUpdate {
  docks: readonly DockVisual[];
  phase: Pick<DayCyclePhase, "daylight" | "dusk">;
  reducedMotion: boolean;
  timeSeconds: number;
  tier: PharosVilleRenderSchedulerTier;
}

export interface GardenStationSmoke {
  /** Named `dock-station-smoke` for the overview LOD shed; at world origin. */
  readonly root: Group;
  readonly chimneyCount: number;
  /** Built instance capacity — puffs × chimneys, never above 24. */
  readonly instanceCapacity: number;
  update(input: GardenStationSmokeUpdate): void;
  dispose(): void;
}

export function createGardenStationSmoke(
  specs: readonly StationSmokeSpec[],
  cloudNoise: DataTexture,
): GardenStationSmoke {
  const root = new Group();
  root.name = "dock-station-smoke";
  const chimneyCount = specs.length;
  const uniforms = { uTime: { value: 0 } };
  const mesh = chimneyCount === 0 ? null : createSmokePlume(uniforms, cloudNoise, {
    anchors: specs.map((spec) => spec.anchor),
    backlight: STATION_SMOKE_BACKLIGHT,
    count: Math.min(STATION_SMOKE_MAX_INSTANCES, chimneyCount * STATION_SMOKE_PUFFS_PER_CHIMNEY),
    dayDark: STATION_SMOKE_DAY_DARK,
    dayLight: STATION_SMOKE_DAY_LIGHT,
    name: "dock-station-smoke-puffs",
    night: STATION_SMOKE_NIGHT,
    quadSize: STATION_SMOKE_QUAD,
    rise: STATION_SMOKE_RISE,
    riseBase: STATION_SMOKE_RISE_BASE,
    scaleMax: STATION_SMOKE_SCALE_MAX,
    scaleMin: STATION_SMOKE_SCALE_MIN,
    seedPrefix: "station-smoke",
    windDrift: STATION_SMOKE_WIND_DRIFT,
    wobble: STATION_SMOKE_WOBBLE,
  });
  if (mesh) root.add(mesh);
  const material = mesh?.material ?? null;
  const gates = mesh
    ? mesh.geometry.getAttribute("aGate") as InstancedBufferAttribute
    : null;
  const instanceCapacity = mesh?.count ?? 0;

  return {
    root,
    chimneyCount,
    instanceCapacity,
    update({ docks, phase, reducedMotion, timeSeconds, tier }) {
      if (!mesh || !material || !gates) return;
      // One route-owned clock; frozen at the deterministic t=0 pose under
      // reduced motion, like the beacon's own parked puffs.
      uniforms.uTime.value = reducedMotion ? 0 : Math.max(0, timeSeconds);
      material.uniforms.uDayMix!.value = phase.daylight;
      material.uniforms.uOpacity!.value = stationSmokeOpacity(phase);
      // Data gate: smoke while this harbour's cargo tide stands crates.
      let anyActive = false;
      let gateDirty = false;
      for (const [chimney, spec] of specs.entries()) {
        const tide = docks[spec.dockIndex]?.recipe.dock.cargoTide;
        const active = cargoTideCrateCount(tide) > 0 ? 1 : 0;
        anyActive ||= active > 0;
        for (let puff = 0; puff < STATION_SMOKE_PUFFS_PER_CHIMNEY; puff += 1) {
          const index = puff * chimneyCount + chimney;
          if (gates.getX(index) === active) continue;
          gates.setX(index, active);
          gateDirty = true;
        }
      }
      if (gateDirty) gates.needsUpdate = true;
      // Tier ladder mirrors the beacon's smoke: full plume at full, halved at
      // every tier that keeps ambient life (R13), shed at constrained.
      const puffs = tier === "full"
        ? STATION_SMOKE_PUFFS_PER_CHIMNEY
        : tier === "constrained" ? 0 : STATION_SMOKE_PUFFS_PER_CHIMNEY / 2;
      mesh.count = puffs * chimneyCount;
      // The mesh (not the LOD-named group) carries the cold-chimney gate so
      // the overview policy's own visibility lever is never fought.
      mesh.visible = puffs > 0 && anyActive;
    },
    dispose() {
      if (!mesh) return;
      mesh.geometry.dispose();
      mesh.material.dispose();
    },
  };
}
