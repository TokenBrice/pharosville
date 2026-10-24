export const bundleBudgets = {
  entry: {
    label: "entry chunk",
    pattern: /^index-[A-Za-z0-9_-]+\.js$/,
    // 2026-10-14 Harbour cutover: the shell is now only the gate, the arrival
    // card and the error reporter — measured 10.4 KiB raw / 3.9 KiB gzip.
    maxRawBytes: 64 * 1024,
    maxGzipBytes: 24 * 1024,
    required: true,
  },
  desktop: {
    label: "Harbour lazy chunk",
    pattern: /^harbour-app-[A-Za-z0-9_-]+\.js$/,
    // 2026-10-14 Harbour cutover (agents/2026-10-13-pharosville-reboot P5 prep):
    // Engine, the ten world systems, data feed + model + sim, the chart UI and
    // the brand-colour/logo/dead-coin tables, loaded only past the viewport
    // gate. Measured 520.5 KiB raw / 172.5 KiB gzip while the P3/P4 polish
    // passes were still landing; the cap is measured + ~23% for that work, not
    // a licence to grow past it without a measured re-baseline.
    // Re-baselined 2026-10-14 after the operator's P6-P8 rounds (civic quarter,
    // chain identity and chart lettering, procedural audio, Titan ships, Wreck
    // Cove v2, the 43-coin pre-launch book): measured 1,319.7 KiB raw /
    // 400.4 KiB gzip. Cap = measured + ~14%.
    // Tightened 2026-10-15 after the need-for-speed pass moved the registry,
    // zod and the pre-launch book out of the chunk: measured 904.3 KiB raw /
    // 312.9 KiB gzip. Cap = measured + ~12%.
    // Re-baselined 2026-10-24 after the prettier sweep (agents/claudeville-prettier:
    // beam light, lamp wave, gust field, sky/weather fronts, moon and meteors,
    // events + Day book, signals, moments, life, camera glides, postcard):
    // measured 1,066.7 KiB raw / 371.0 KiB gzip. Cap = measured + ~10%.
    maxRawBytes: 1_175 * 1024,
    maxGzipBytes: 408 * 1024,
    required: true,
  },
  renderer: {
    label: "Three.js renderer chunk",
    pattern: /^vendor-rendering-[A-Za-z0-9_-]+\.js$/,
    // 2026-10-14 Harbour cutover: three r186 + postprocessing (bloom, AgX
    // tone mapping, SMAA). Measured 837.3 KiB raw / 241.2 KiB gzip; the
    // Garden-era 1,600/454 cap is retired. Cap = measured + ~14%.
    maxRawBytes: 960 * 1024,
    maxGzipBytes: 276 * 1024,
    required: true,
  },
  css: {
    label: "Harbour CSS",
    pattern: /^harbour-app-[A-Za-z0-9_-]+\.css$/,
    // 2026-10-14 Harbour cutover: the chart-paper UI (D12), loaded with the
    // lazy chunk. First-paint CSS is the static public/arrival-shell.css.
    // Measured 18.3 KiB raw / 4.8 KiB gzip.
    // 2026-10-24 prettier sweep (postcard, sound menu, Day book, chart-paper
    // unroll, tide/storm panels): measured 29.1 KiB raw / 6.8 KiB gzip.
    maxRawBytes: 34 * 1024,
    maxGzipBytes: 8.5 * 1024,
    required: true,
  },
};

export const aggregateBudgets = {
  // 2026-10-14 Harbour cutover: the Garden Observatory world (974 KiB gzip at
  // its last measurement, cap 1,024) is deleted. The Harbour measured
  // 1,582.4 KiB raw / 484.4 KiB gzip of JS in total (entry + vendor-react +
  // harbour-app + vendor-rendering). Cap = measured + ~20%, earmarked for the
  // remaining P3/P4 polish; the per-chunk caps above are enforced independently.
  // Re-baselined 2026-10-14 after P6-P8: measured 2,444.1 KiB raw / 736.9 KiB
  // gzip in total. Cap = measured + ~11%.
  // Tightened 2026-10-15 (need-for-speed): measured 2,055.2 KiB raw / 658.8 KiB
  // gzip in total. Cap = measured + ~10%.
  // Re-baselined 2026-10-24 after the prettier sweep: measured 2,254.6 KiB raw /
  // 730.4 KiB gzip in total (incl. the lazy sound chunks). Cap = measured + ~10%.
  maxJsRawBytes: 2_480 * 1024,
  maxJsGzipBytes: 804 * 1024,
};

export const forbiddenBundleChunks = [
  {
    label: "WebGPU renderer chunk",
    pattern: /^(?:three[.-]webgpu|world-renderer-webgpu|garden-beacon-fire-tsl)-[A-Za-z0-9_-]+\.js$/,
  },
];
