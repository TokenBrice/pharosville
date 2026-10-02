import { hashFixturePayloads } from "./preview-manifest.mjs";

export const PREVIEW_FIXTURES = ["calm", "dense", "stress", "quiet-dense", "mixed-capacity", "quiet-normal"];

/** Date-only fixture clock. Never install a clock shim over performance, RAF, or timers. */
export function installFixedDate(epochMs) {
  const NativeDate = globalThis.Date;
  const now = () => epochMs;
  globalThis.Date = new Proxy(NativeDate, {
    apply: () => new NativeDate(epochMs).toString(),
    construct: (target, args, newTarget) => Reflect.construct(target, args.length ? args : [epochMs], newTarget),
    get: (target, key, receiver) => key === "now" ? now : Reflect.get(target, key, receiver),
  });
}

/** Reuse the visual lane's routes and checked-in payloads; no network fixture copies. */
export async function installPreviewFixture(page, name) {
  if (!PREVIEW_FIXTURES.includes(name)) throw new Error(`Unknown fixture: ${name}`);
  const { require: tsxRequire } = await import("tsx/cjs/api");
  const helpers = tsxRequire("../../tests/helpers/pharosville-debug.ts", import.meta.url);
  const data = tsxRequire("../../src/__fixtures__/pharosville-world.ts", import.meta.url);
  const { PHAROSVILLE_API_ENDPOINT_KEYS: keys } = tsxRequire("../../shared/types/pharosville-endpoint-keys.ts", import.meta.url);
  let sourceEpochMs = data.fixtureGeneratedAt;
  let payloads;
  if (["quiet-dense", "mixed-capacity", "quiet-normal"].includes(name)) {
    const scenarios = tsxRequire("../../src/__fixtures__/data-contract-scenarios.ts", import.meta.url);
    const input = name === "quiet-dense" ? scenarios.denseQuietArtInput()
      : name === "mixed-capacity" ? scenarios.denseMixedCapacityInput() : scenarios.quietNormalInput();
    sourceEpochMs = input.generatedAt;
    payloads = Object.fromEntries(keys.map((key) => {
      if (input[key] == null) throw new Error(`Fixture ${name} is missing endpoint ${key}`);
      return [key, input[key]];
    }));
  } else {
    const dense = name !== "calm";
    payloads = {
      stablecoins: dense ? data.denseFixtureStablecoins : data.fixtureStablecoins,
      chains: dense ? data.denseFixtureChains : data.fixtureChains,
      stability: !dense ? data.fixtureStability : {
        ...data.fixtureStability,
        current: { ...data.fixtureStability.current,
          ...(name === "dense"
            ? { band: "ELEVATED", components: { breadth: 26, severity: 54, trend: 12 }, score: 72 }
            : { score: 12, band: "MELTDOWN", components: { breadth: 85, severity: 95, trend: 80 } }),
        },
      },
      pegSummary: dense ? data.denseFixturePegSummary : data.fixturePegSummary,
      stress: dense ? data.denseFixtureStress : data.fixtureStress,
      safetyGrades: dense ? data.denseFixtureSafetyGrades : data.fixtureSafetyGrades,
      mintBurn: data.fixtureMintBurn,
    };
  }
  const options = { meta: Object.fromEntries(keys.map((key) => [key, {
    updatedAt: sourceEpochMs / 1000, ageSeconds: 60, status: "fresh",
  }])) };
  // Fix Date only: RAF, performance.now and real timers keep measuring hardware.
  await page.addInitScript(installFixedDate, sourceEpochMs + 60_000);
  await helpers.mockPharosVillePayloads(page, payloads, options);
  return { name, sourceEpochMs, payloadHash: hashFixturePayloads(payloads, sourceEpochMs) };
}

/** Projected hit rectangles are a crowding proxy, not sail pixels or occlusion. */
export function analyzeTargetOverlap(targets, selectedDetailId, width, height) {
  const ships = targets.filter(({ kind, rect }) => kind === "ship" && rect
    && [rect.x, rect.y, rect.width, rect.height].every(Number.isFinite))
    .map(({ detailId, rect }) => ({ detailId, rect: {
      x: Math.max(0, rect.x), y: Math.max(0, rect.y),
      width: Math.max(0, Math.min(width, rect.x + rect.width) - Math.max(0, rect.x)),
      height: Math.max(0, Math.min(height, rect.y + rect.height) - Math.max(0, rect.y)),
    } })).filter(({ rect }) => rect.width > 0 && rect.height > 0);
  const overlaps = new Map(ships.map(({ detailId }) => [detailId, []]));
  let pairs = 0;
  // ponytail: offline O(n²) at the 320-ship cap; spatial indexing only if that cap grows substantially.
  for (let i = 0; i < ships.length; i += 1) for (let j = i + 1; j < ships.length; j += 1) {
    const a = ships[i], b = ships[j];
    const area = Math.max(0, Math.min(a.rect.x + a.rect.width, b.rect.x + b.rect.width) - Math.max(a.rect.x, b.rect.x))
      * Math.max(0, Math.min(a.rect.y + a.rect.height, b.rect.y + b.rect.height) - Math.max(a.rect.y, b.rect.y));
    if (area === 0) continue;
    pairs += 1;
    overlaps.get(a.detailId).push({ detailId: b.detailId, fraction: area / (a.rect.width * a.rect.height) });
    overlaps.get(b.detailId).push({ detailId: a.detailId, fraction: area / (b.rect.width * b.rect.height) });
  }
  const describe = (ship) => ({ ...ship, overlaps: overlaps.get(ship.detailId).sort((a, b) => b.fraction - a.fraction) });
  return {
    kind: "projected hit-rectangle overlap; not sail-pixel occlusion",
    visibleShipTargets: ships.length, overlappingPairs: pairs,
    largestTargets: [...ships].sort((a, b) => b.rect.width * b.rect.height - a.rect.width * a.rect.height).slice(0, 10).map(describe),
    selected: ships.find((ship) => ship.detailId === selectedDetailId) ? describe(ships.find((ship) => ship.detailId === selectedDetailId)) : null,
  };
}
