// 2026-05-02: bumped for village-decor overlays and first-render scene density.
// 2026-05-02: bumped 55 -> 56 for landmark.yggdrasil (Ethereum harbor world-tree).
// 2026-05-03: bumped 56 -> 61 for harbor-life decor (lighthouse-pyre, moored-dinghy
// north/east, harbor-bell, cargo-stack).
// 2026-05-03: bumped 61 -> 62 for landmark.pigeonnier (PharosWatch Telegram dispatch islet).
// 2026-05-03: bumped 62 -> 63 for dock.ton-pigeonnier-pier (Telegram TON wharf attached to the pigeonnier islet).
// 2026-05-03: bumped 63 -> 69 for new first-render stablecoin squad additions (Ethena + USYC/USD1/BUIDL/BUIDL).
// 2026-05-18: bumped 69 -> 75 for Wave 6 identity-pass additions
//   (W6.06 FRAX + GHO heritage hulls; W6.08 Hyperliquid dock;
//    W6.12 dock-awning + dock-figures + lantern-string ambient prop kinds).
//   WebP twins (W6.13) cost zero manifest entries since they live on the
//   same entry via `webpPath` / `animation.webpFrameSource`.
export const maxManifestAssets = 75;

export const firstRenderBudgets = {
  // 2026-05-01: bumped for Maker squad titans (USDS, DAI, sUSDS, sDAI, stUSDS)
  maxCount: 33,
  maxBytes: 575 * 1024,
  maxDecodedPixels: 875_000,
};

// NFS4 #16: tighter sub-budgets for the world-silhouette shell so the canvas
// can paint a coherent first frame before the rest of the critical bucket
// finishes loading. visibleCritical absorbs whatever is left from the overall
// first-render envelope above.
export const shellCriticalBudgets = {
  maxCount: 10,
  maxBytes: 120 * 1024,
  // 256x256 lighthouse + 384x192 headland + 4x 160x96 seawalls leaves a
  // small headroom for one extra silhouette asset.
  maxDecodedPixels: 220_000,
};

export const visibleCriticalBudgets = {
  maxCount: firstRenderBudgets.maxCount,
  maxBytes: firstRenderBudgets.maxBytes,
  maxDecodedPixels: firstRenderBudgets.maxDecodedPixels,
};

export const totalAssetBudgets = {
  // 2026-05-18: Wave 6 identity-pass bumps the byte + decoded-pixel ceilings
  // to absorb the Solana scale-up (192x136 -> 280x180), the new Hyperliquid
  // dock, the FRAX + GHO heritage hulls, and 3 new ambient prop kinds.
  // WebP twins ride alongside; counted separately as `webpPath` doesn't add
  // a manifest entry.
  maxBytes: 1100 * 1024,
  maxDecodedPixels: 1_440_000,
};

export const imageBudgetsByCategory = {
  dock: { maxBytes: 128 * 1024, maxDecodedPixels: 150_000 },
  landmark: { maxBytes: 96 * 1024, maxDecodedPixels: 131_072 },
  overlay: { maxBytes: 96 * 1024, maxDecodedPixels: 150_000 },
  prop: { maxBytes: 24 * 1024, maxDecodedPixels: 30_000 },
  ship: { maxBytes: 32 * 1024, maxDecodedPixels: 50_000 },
  terrain: { maxBytes: 8 * 1024, maxDecodedPixels: 8_192 },
};

export const displayScaleWarningThreshold = 0.8;
export const displayScaleWarningMinPixels = 50_000;
export const displayScaleFailureWasteRatio = 4;
