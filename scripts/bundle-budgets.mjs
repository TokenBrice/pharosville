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
  css: {
    label: "entry CSS",
    pattern: /^index-[A-Za-z0-9_-]+\.css$/,
    maxRawBytes: 32 * 1024,
    maxGzipBytes: 8 * 1024,
    required: true,
  },
};

export const aggregateBudgets = {
  // 2026-06-09 ship-identity pass: see desktop chunk note above.
  maxJsRawBytes: 1_315 * 1024,
  maxJsGzipBytes: 388 * 1024,
};
