import { extrasMatrix, EXTRA_STATES } from "../../scripts/perf/extras-budget.mjs";
import { SUPERSAMPLE_VIEWS } from "../../scripts/perf/supersample-receipt.mjs";
import { V180_ASSERTIONS } from "../../scripts/pharosville/release-receipt.mjs";

export const provenance = () => ({ buildHash: "build-a", fixtureHash: "fixture-a", gpu: "ANGLE (NVIDIA GeForce RTX 5070 Ti, Vulkan)",
  browser: "Chrome/142", backend: "Vulkan", driver: "test", device: { platform: "Linux x86_64" },
  viewport: { width: 1600, height: 1000 }, dpr: 1, effectiveState: {},
  deliveryIdentity: { documentHash: "document", assetRegistryHash: "registry" } });

export function extrasEvidence() {
  return { captures: extrasMatrix().map((spec) => {
    const state = EXTRA_STATES.find((s) => s.id === spec.state), dpr = Math.sqrt(4_000_000 / (2560 * 1600));
    const origin = new URL("http://127.0.0.1:4180/");
    origin.searchParams.set("extras", spec.extras);
    for (const [k, v] of new URLSearchParams(state.stage)) origin.searchParams.set(k, v);
    return { id: spec.id, file: `${spec.id}/summary.json`, data: { meta: { origin: origin.href, quality: spec.quality,
      machine: "quiet", contended: false, prof: "gpu", uncapped: true, apiLatency: "replayed", warmupMs: 3500 },
    scenarios: [{ view: "heart", displayDpr: 2, hour: state.hour, requestedWeather: state.weather, season: state.season, runs: [0, 0.01, -0.01].map((jitter) => ({
      provenance: { ...provenance(), viewport: { width: 2560, height: 1600, backingWidth: Math.floor(2560 * dpr), backingHeight: Math.floor(1600 * dpr) }, dpr,
        effectiveState: { quality: spec.quality, hour: state.hour, weather: { band: state.weather }, season: { season: state.season } } },
      setup: { quality: spec.quality, effectiveDpr: dpr }, stats: { quality: spec.quality, dpr },
      steadyProgramsCreated: 0, pendingQueries: 0, disjointPolls: 0, consoleErrors: [],
      timing: { elapsedMs: 30_001, deltas: Array(100).fill(16), states: [`${spec.quality}|${dpr}`] },
      extraActivity: state.stage ? Array.from({ length: 100 }, (_, frame) => ({ frame, recognized: true, stage: new URLSearchParams(state.stage).get("score") ?? "doves", active: spec.extras !== "none" })) : null,
      rawGpuSamples: Array.from({ length: 100 }, (_, frame) => ({ frame, ms: 4 + jitter + (spec.arm === "medium-on" ? 0.2 : spec.arm === "high-on" ? 0.4 : 0) })),
    })) }] } };
  }) };
}
export function supersampleEvidence() {
  return { machine: "quiet", contended: false, crispness: { status: "PASS", reviewer: "art director", evidence: ["native-1080.png", "native-1440.png"] },
    captures: SUPERSAMPLE_VIEWS.flatMap((view) => [1, 2, 3].flatMap((repeat) => ["off", "on"].map((arm) => {
      const id = `${view.width}x${view.height}/${repeat}/${arm}`, dpr = arm === "on" ? 1.5 : 1;
      const snapshot = (atMs, dpr) => ({ atMs, dpr, rung: dpr === 1 ? 3 : 4, tier: "high", width: view.width * dpr, height: view.height * dpr,
        pixels: view.width * view.height * dpr ** 2, composerPairBytes: view.width * view.height * dpr ** 2 * 16 });
      return { id, file: `${id}.json`, data: { provenance: { ...provenance(), viewport: view, dpr, effectiveState: { hour: 12.5, weather: { band: "CALM" }, season: { season: "summer" } } }, paced: false,
        url: `http://127.0.0.1:4180/?intro=0${arm === "off" ? "&extras=-supersample" : ""}`, consoleErrors: [],
        evalResult: { auto: true, displayDpr: 1, elapsedMs: 45_000, gpuDropped: 0, disjoint: 0,
          trace: [snapshot(0, 1), snapshot(16_000, dpr), snapshot(45_000, dpr)],
          deltas: Array(100).fill(16), gpuSamples: Array.from({ length: 100 }, (_, frame) => ({ frame, ms: 4 })) } } };
    }))) };
}
export function linksEvidence() {
  const canonical = "https://pharosville.pharos.watch/?sel=ship.usdc-circle";
  return { status: "PASS", provenance: provenance(), consoleErrors: [], observation: { canonical,
    ...Object.fromEntries(["initial", "back", "reopened"].map((key) => [key, { pass: true, subject: "ship.usdc-circle", title: "USDC", url: "http://127.0.0.1:4180/?sel=ship.usdc-circle" }])),
    second: { pass: true, subject: "place.pharos", title: "The Pharos", url: "http://127.0.0.1:4180/?sel=place.pharos", historyBefore: 2, historyAfter: 3 },
    forward: { pass: true, subject: "place.pharos", title: "The Pharos", url: "http://127.0.0.1:4180/?sel=place.pharos" },
    closed: { pass: true, url: "http://127.0.0.1:4180/" }, copied: { pass: true, url: canonical } } };
}
export function acceptanceChecks() {
  return [
    { id: "links", file: "links.json", data: linksEvidence() },
    { id: "extras", file: "extras.json", data: extrasEvidence() },
    { id: "supersample", file: "supersample.json", data: supersampleEvidence() },
    ...Object.entries(V180_ASSERTIONS).map(([id, keys]) => ({ id, file: `${id}.json`, data: { status: "PASS", buildHash: "build-a",
      assertions: keys.map((key) => ({ id: key, status: "PASS", evidence: `${id}/${key}.json` })) } })),
  ];
}
