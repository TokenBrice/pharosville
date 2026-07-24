export const bundleBudgets = {
  entry: {
    label: "entry chunk",
    pattern: /^index-[A-Za-z0-9_-]+\.js$/,
    maxRawBytes: 300 * 1024,
    maxGzipBytes: 90 * 1024,
    required: true,
  },
  desktop: {
    label: "desktop lazy chunk",
    pattern: /^pharosville-desktop-data-[A-Za-z0-9_-]+\.js$/,
    // Includes the generated brand-color table and desktop data orchestration.
    maxRawBytes: 1024 * 1024,
    maxGzipBytes: 290 * 1024,
    required: true,
  },
  world: {
    label: "world lazy chunk",
    pattern: /^pharosville-world-[A-Za-z0-9_-]+\.js$/,
    // 2026-06-14 repo review: measured 391.9 KiB raw / 124.7 KiB gzip.
    // Guard this high-leverage renderer chunk directly instead of relying on
    // the nearly-full aggregate JS budget for diagnostics.
    maxRawBytes: 440 * 1024,
    maxGzipBytes: 145 * 1024,
    required: true,
  },
  renderer: {
    label: "Three.js renderer chunk",
    pattern: /^world-renderer-[A-Za-z0-9_-]+\.js$/,
    // 2026-07-23 one-renderer cutover: measured 692.2 KiB raw / 183.2 KiB
    // gzip after the production Garden Observatory pass.
    // 2026-07-24 Lantern Sea revamp: measured 750.1 KiB raw / 199.9 KiB gzip
    // after the post pipeline, sea/lane shaders, zone redesign, harbor kits,
    // and hero-hull attachment; gzip budget intentionally unchanged.
    // 2026-07-24 Garden Sea P0 (G2, decision D-B1): re-measured after the
    // legacy cleanup at 749.9 KiB raw / 199.4 KiB gzip — only 0.6 KiB gzip
    // headroom remained (< 5 KiB trigger). Raised 770→820 raw / 200→212 gzip
    // with measured cause: the approved Garden Sea workstreams (W1–W7 day
    // sea, L1–L6 lighthouse, S1–S8 fleet) are estimated at +8–15 KiB gzip of
    // new shader/geometry code; this is not free inflation, the headroom is
    // earmarked for those packets and re-baselined as they land.
    // 2026-07-24 Pharos Wonder (decision D7 — measured re-baseline):
    // post-W3 (three-tier Pharos shell + GLB v4) measured 777.0 KiB raw /
    // 209.3 KiB gzip; W4+W5+W7 (beacon fire module, ray fan + nested cone,
    // rim light, bird flock, statue gleam) added +16.3 KiB raw / +4.6 KiB
    // gzip → 793.3 KiB raw / 213.9 KiB gzip, 1.9 KiB over the 212 earmark.
    // Gzip raised 212→218 (raw unchanged at 820); the remaining headroom is
    // earmarked for the W6 water-shader firelight pass still to land.
    maxRawBytes: 820 * 1024,
    maxGzipBytes: 218 * 1024,
    required: true,
  },
  css: {
    label: "entry CSS",
    pattern: /^index-[A-Za-z0-9_-]+\.css$/,
    maxRawBytes: 36 * 1024,
    maxGzipBytes: 8 * 1024,
    required: true,
  },
};

export const aggregateBudgets = {
  // 2026-06-09 ship-identity pass: see desktop chunk note above.
  // 2026-06-11 V2.5 harbor ambient (quay lanterns + gull fishing dives): +~12 KiB raw / +5 KiB gzip.
  // 2026-06-14 T1 endpoint-key split: measured 1,270,683 raw / 376,060 gzip.
  // 2026-06-14 v0.2.2 release notes + visible identity/runtime surface: measured 1,294,295 raw / 383,925 gzip.
  // 2026-07-23 Three.js cutover: measured 1,728.4 KiB raw / 487.3 KiB gzip.
  // 2026-07-24 Garden Sea P0 (G2, D-B1): measured 1,769.8 KiB raw / 498.6 KiB
  // gzip post-cleanup; aggregate raised alongside the renderer-chunk raise so
  // the earmarked Garden Sea headroom (see renderer note above) fits.
  // The renderer is also enforced independently above.
  maxJsRawBytes: 1_860 * 1024,
  maxJsGzipBytes: 530 * 1024,
};
