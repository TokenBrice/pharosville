import { PHAROSVILLE_RELEASE_VERSIONS } from "./pharosville-version";

export interface PharosVilleChangelogEntry {
  id: string;
  version: string;
  date: string;
  title: string;
  summary: string;
  bullets: string[];
  source: string;
}

export const PHAROSVILLE_CHANGELOG: PharosVilleChangelogEntry[] = [
  {
    id: "2026-05-18-curtain-up",
    version: PHAROSVILLE_RELEASE_VERSIONS.curtainUp,
    date: "2026-05-18",
    title: "Curtain Up",
    summary: "PharosVille opens with a cinematic reveal, fleets that move with intent, and a village that finally feels lived-in.",
    bullets: [
      "Added a 1.8-second first-load reveal beat: sky and outer water fade in, the headland slides up, then the lighthouse turns on with a slowed first sweep — reduced-motion users still get the deterministic final frame instantly.",
      "Re-skinned the loading state to the canvas palette, with horizon-ship silhouettes and a warm pulsing halo, so the wait between routes matches the world that follows.",
      "Brought the civic core to life with three procedural chimney-smoke wisps on the central village, reshuffled vegetation to clear the future agora footprint, and retired the redundant selection-strip caption now that the detail panel carries the same load.",
      "Reworked fleet movement: ships in calm waters cycle deterministic 2- or 3-anchor patrol itineraries, squads fan out at sea and pull tight in port with consort headings lagging the flagship by 0.6s, and risk-band changes show as a 3-second tack-out before the next dock cycle.",
      "Stopped harbor pile-ups with a swell-aware sea-room separation pass that nudges crowded ships apart, and added a cue-priority arbiter so active-risk and recent-supply ships win overlay and wake slots first when render budgets bind.",
      "Tightened renderer hot paths: lighthouse god-ray gradients now hit a bucketed sprite cache, titan foam/spray/mooring strokes share a Path2D template cache, the static layer cache moved from array scan to Map lookup, and idle-warmup yields cooperatively to keep zoom gestures smooth.",
    ],
    source: "Collected from commits adf3993 through a585208 (the 2026-05-17 wow-revamp wave). Earlier commits between v0.2.0 and adf3993 executed the smoothness batch already described in v0.2.0's bullets.",
  },
  {
    id: "2026-05-17-need-for-speed",
    version: PHAROSVILLE_RELEASE_VERSIONS.needForSpeed,
    date: "2026-05-17",
    title: "Need For Speed",
    summary: "PharosVille became a smoother, faster maritime observatory with richer motion, steadier camera control, stronger rendering budgets, and a real release-history surface.",
    bullets: [
      "Added continuous follow-camera behavior, keyboard target cycling, time controls, and stricter canvas interaction coverage for zoom, bounds, and selected-ship tracking.",
      "Reworked ship motion sampling with route-path continuity, speed-aware wakes, display velocity, smoother state transitions, map-visibility fades, and reduced heading snap during docking, sailing, and ledger patrols.",
      "Improved live frame pacing with visual-motion smoothing, a single active motion loop guard, browser perf telemetry, longtask checks, and sustained-motion budget documentation.",
      "Raised renderer throughput with pan-tolerant static and dynamic layer caches, backing-store budget metrics, cache eviction accounting, deferred asset loading during idle time, and incremental hit-target updates.",
      "Expanded harbor atmosphere with deterministic sea state, cinematic weather passes, richer lighthouse and ambient drama, water-zone plaques, tighter palette controls, ship identity chrome, and refreshed visual baselines.",
      "Added the in-app changelog panel and footer fleet counter, then aligned local push, visual, CI, and deploy gates so release checks match the Cloudflare Pages workflow.",
    ],
    source: "Collected from commits 009ef1a through a538b9f, plus the 2026-05-17 workspace motion and renderer performance batch.",
  },
  {
    id: "2026-05-17-harbor-motion-atmosphere",
    version: PHAROSVILLE_RELEASE_VERSIONS.harborMotionAtmosphere,
    date: "2026-05-17",
    title: "Harbor motion and atmosphere",
    summary: "The beta map gained a stronger sense of weather, water, and fleet motion while keeping the same stablecoin semantics.",
    bullets: [
      "Added deterministic sea-state signals for water, ship, and atmosphere rendering.",
      "Refined ship heading, docking choreography, lighthouse drama, and harbor life.",
      "Polished named water-zone borders, plaques, palette separation, and cinematic weather passes.",
      "Added keyboard target cycling, session time controls, and the footer fleet counter.",
    ],
    source: "Collected from commits 4940b86 through 800e184.",
  },
  {
    id: "2026-05-04-runtime-hardening",
    version: PHAROSVILLE_RELEASE_VERSIONS.runtimeHardening,
    date: "2026-05-04",
    title: "Runtime hardening and inspection polish",
    summary: "The standalone route became easier to operate, test, and inspect before publishing.",
    bullets: [
      "Improved detail-panel accessibility, touch targets, contrast checks, and pinch-zoom coverage.",
      "Added error-reporting categories, asset-miss telemetry, and stricter lint/doc validation.",
      "Optimized hit testing, terrain rendering, React data churn, and static asset delivery.",
      "Added visual regeneration and swarm-operation runbooks for safer multi-agent work.",
    ],
    source: "Collected from commits 88d6a27 through 2205882.",
  },
  {
    id: "2026-05-03-launch-world-buildout",
    version: PHAROSVILLE_RELEASE_VERSIONS.launchWorldBuildout,
    date: "2026-05-03",
    title: "Launch world buildout",
    summary: "The v0.1 beta surface became a full maritime observatory rather than a prototype canvas.",
    bullets: [
      "Added launch metadata, canary smoke checks, GA/Cloudflare analytics gates, favicon, and OG cards.",
      "Introduced the PharosWatch pigeonnier, Telegram harbor landmark, extra birds, and auto day-night controls.",
      "Expanded the fleet with Ethena squad ships, titan hulls, heritage hulls, route tempo, and supply-change detail facts.",
      "Reworked harbors, water geography, atmospheric labels, and motion performance for dense inspection.",
    ],
    source: "Collected from commits c13d6b2 through d1f8afd.",
  },
  {
    id: "2026-05-02-foundation-and-performance",
    version: PHAROSVILLE_RELEASE_VERSIONS.foundationAndPerformance,
    date: "2026-05-02",
    title: "Foundation, geometry, and performance",
    summary: "The first release-ready PharosVille shell was tightened around desktop gating, asset discipline, and the island layout.",
    bullets: [
      "Added release-readiness gates, response headers, cross-browser accessibility smoke tests, and visual CI controls.",
      "Reshaped the island and seawall routing while preserving DEWS water-zone semantics.",
      "Added Ethereum harbor Yggdrasil, iconographic sail marks, civic vegetation, and logo-colored harbor flags.",
      "Optimized terrain scans, hit testing, static cache behavior, and manifest-driven sprite loading.",
    ],
    source: "Collected from commits 57fdc78 through 3704cc8.",
  },
];
