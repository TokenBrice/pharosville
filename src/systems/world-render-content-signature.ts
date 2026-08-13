import {
  selectGardenObservatorySlice,
} from "./garden-observatory-slice";
import type { PharosVilleWorld } from "./world-types";

const signatureByWorld = new WeakMap<PharosVilleWorld, string>();
const partHashesByWorld = new WeakMap<PharosVilleWorld, Readonly<Record<string, string>>>();

/**
 * Stable signature of the inputs that are baked into Three.js world content.
 *
 * Live refreshes also replace detail records, freshness metadata, timestamps,
 * and exact market-cap values. None of those require new GPU resources. Keeping
 * them out of this signature lets the renderer retain its existing scene graph
 * while the DOM and motion layers continue to consume the fresh world object.
 *
 * Dock supply is represented by its authored 1–10 size band. Sub-band supply
 * noise moves a quay by less than a pixel at the default camera, while
 * rebuilding every dock and ship for it costs a visible main-thread hitch.
 * Rank, size band, health, cargo, and every other authored dock input remain
 * exact.
 */
export function worldRenderContentSignature(world: PharosVilleWorld): string {
  const cached = signatureByWorld.get(world);
  if (cached !== undefined) return cached;

  const slice = selectGardenObservatorySlice(world, null);
  const docks = world.docks
    .map((dock) => ({
      cargoTide: dock.cargoTide ?? null,
      chainId: dock.chainId,
      change24hPct: dock.change24hPct ?? null,
      detailId: dock.detailId,
      healthBand: dock.healthBand,
      id: dock.id,
      label: dock.label,
      logoPath: dock.logoPath ?? null,
      size: dock.size,
      tile: dock.tile,
    }));
  const ships = slice.ships
    .toSorted((left, right) => left.ship.id.localeCompare(right.ship.id))
    .map(({ displayOffset, representative, ship }) => ({
      dexDisagrees: ship.dexCrossCheck?.agrees === false,
      displayOffset,
      dominantChainId: ship.dominantChainId,
      id: ship.id,
      issuance: ship.issuance ?? null,
      logoSrc: ship.logoSrc,
      overallGrade: ship.reportCard?.overallGrade ?? null,
      representative,
      riskZone: ship.riskZone,
      symbol: ship.symbol,
      tile: ship.tile,
      visual: ship.visual,
    }));
  const heroRank = slice.ships
    .filter(({ ship }) => ship.visual.sizeTier === "titan" || ship.visual.sizeTier === "unique")
    .toSorted((left, right) => (
      right.ship.marketCapUsd - left.ship.marketCapUsd
      || left.ship.id.localeCompare(right.ship.id)
    ))
    .map(({ ship }) => ship.id);

  const signature = JSON.stringify({
    areas: world.areas.map((area) => ({
      band: area.band ?? null,
      count: area.count ?? null,
      detailId: area.detailId,
      id: area.id,
      label: area.label,
      riskPlacement: area.riskPlacement ?? null,
      riskZone: area.riskZone ?? null,
      tile: area.tile,
    })),
    docks,
    fleetIssuance: world.fleetIssuance
      ? {
          flightIntensity: world.fleetIssuance.flightIntensity,
          flightToQuality: world.fleetIssuance.flightToQuality,
        }
      : null,
    graves: world.graves.map((grave) => ({
      detailId: grave.detailId,
      id: grave.id,
      tile: grave.tile,
      visual: grave.visual,
    })),
    heroRank,
    lighthouse: {
      beamDwellShipId: world.lighthouse.beamDwell?.shipId ?? null,
      detailId: world.lighthouse.detailId,
      highWaterSeverity: world.lighthouse.highWaterMark?.severity ?? null,
      signalPennants: world.lighthouse.signalMast?.pennantCount ?? 0,
      stormCone: world.lighthouse.signalMast?.stormCone ?? false,
      tile: world.lighthouse.tile,
    },
    pigeonnier: {
      detailId: world.pigeonnier.detailId,
      moverDetailIds: world.pigeonnier.notableMovers?.map((mover) => mover.detailId) ?? [],
      roostVisualCount: world.pigeonnier.roost?.visualCount ?? 0,
      tile: world.pigeonnier.tile,
    },
    ships,
    supplyTide: world.supplyTide,
  });
  signatureByWorld.set(world, signature);
  return signature;
}

/** Compact debug evidence for which baked content family changed on refresh. */
export function worldRenderContentPartHashes(
  world: PharosVilleWorld,
): Readonly<Record<string, string>> {
  const cached = partHashesByWorld.get(world);
  if (cached) return cached;
  const parts = JSON.parse(worldRenderContentSignature(world)) as Record<string, unknown>;
  const hashes = Object.fromEntries(
    Object.entries(parts).map(([key, value]) => [key, fnv1a(JSON.stringify(value))]),
  );
  partHashesByWorld.set(world, hashes);
  return hashes;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
