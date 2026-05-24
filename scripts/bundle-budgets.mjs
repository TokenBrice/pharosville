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
    maxRawBytes: 973 * 1024,
    maxGzipBytes: 279 * 1024,
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
  maxJsRawBytes: 1_282 * 1024,
  maxJsGzipBytes: 378 * 1024,
};
