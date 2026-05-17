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
