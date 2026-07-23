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
    // 2026-06-09 ship-identity pass: +~10 KiB raw for the generated
    // brand-color table (data/brand-colors.json) + emblem/nameplate drawers.
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
    maxRawBytes: 740 * 1024,
    maxGzipBytes: 200 * 1024,
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
  // The renderer is also enforced independently above.
  maxJsRawBytes: 1_800 * 1024,
  maxJsGzipBytes: 515 * 1024,
};
