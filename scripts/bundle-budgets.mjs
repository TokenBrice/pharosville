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
    maxRawBytes: 640 * 1024,
    maxGzipBytes: 212 * 1024,
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
    maxRawBytes: 28 * 1024,
    maxGzipBytes: 7 * 1024,
    required: true,
  },
};

export const aggregateBudgets = {
  // 2026-10-14 Harbour cutover: the Garden Observatory world (974 KiB gzip at
  // its last measurement, cap 1,024) is deleted. The Harbour measured
  // 1,582.4 KiB raw / 484.4 KiB gzip of JS in total (entry + vendor-react +
  // harbour-app + vendor-rendering). Cap = measured + ~20%, earmarked for the
  // remaining P3/P4 polish; the per-chunk caps above are enforced independently.
  maxJsRawBytes: 1_900 * 1024,
  maxJsGzipBytes: 580 * 1024,
};

export const forbiddenBundleChunks = [
  {
    label: "WebGPU renderer chunk",
    pattern: /^(?:three[.-]webgpu|world-renderer-webgpu|garden-beacon-fire-tsl)-[A-Za-z0-9_-]+\.js$/,
  },
];
