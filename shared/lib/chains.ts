interface ChainMeta {
  name: string;
  explorerUrl: string;
  evmChainId: number | null;
  type: "evm" | "tron" | "other";
}

export const CHAIN_META: Record<string, ChainMeta> = {
  ethereum:  { name: "Ethereum",  explorerUrl: "https://etherscan.io",              evmChainId: 1,     type: "evm"  },
  arbitrum:  { name: "Arbitrum",  explorerUrl: "https://arbiscan.io",               evmChainId: 42161, type: "evm"  },
  base:      { name: "Base",      explorerUrl: "https://basescan.org",              evmChainId: 8453,  type: "evm"      },
  optimism:  { name: "Optimism",  explorerUrl: "https://optimistic.etherscan.io",   evmChainId: 10,    type: "evm"  },
  polygon:   { name: "Polygon",   explorerUrl: "https://polygonscan.com",           evmChainId: 137,   type: "evm"   },
  avalanche: { name: "Avalanche", explorerUrl: "https://snowscan.xyz",              evmChainId: 43114, type: "evm" },
  bsc:       { name: "BSC",       explorerUrl: "https://bscscan.com",               evmChainId: 56,    type: "evm"       },
  gnosis:    { name: "Gnosis",    explorerUrl: "https://gnosisscan.io",             evmChainId: 100,   type: "evm"    },
  fantom:    { name: "Fantom",    explorerUrl: "https://ftmscan.com",               evmChainId: 250,   type: "evm"    },
  celo:      { name: "Celo",      explorerUrl: "https://celoscan.io",               evmChainId: 42220, type: "evm"      },
  citrea:    { name: "Citrea Mainnet", explorerUrl: "https://explorer.mainnet.citrea.xyz", evmChainId: 4114, type: "evm" },
  zksync:    { name: "zkSync",    explorerUrl: "https://explorer.zksync.io",       evmChainId: 324,   type: "evm"    },
  sonic:     { name: "Sonic",     explorerUrl: "https://sonicscan.org",            evmChainId: 146,   type: "evm"     },
  sei:       { name: "Sei",       explorerUrl: "https://seitrace.com",             evmChainId: 1329,  type: "evm"       },
  worldchain:{ name: "World Chain",explorerUrl: "https://worldscan.org",           evmChainId: 480,   type: "evm"},
  unichain:  { name: "Unichain",  explorerUrl: "https://uniscan.xyz",             evmChainId: 130,   type: "evm"  },
  ink:       { name: "Ink",       explorerUrl: "https://explorer.inkonchain.com",  evmChainId: 57073, type: "evm"       },
  moonriver: { name: "Moonriver", explorerUrl: "https://moonriver.moonscan.io",   evmChainId: 1285,  type: "evm" },
  klaytn:    { name: "Klaytn",    explorerUrl: "https://klaytnscope.com",          evmChainId: 8217,  type: "evm"    },
  plume:     { name: "Plume",     explorerUrl: "https://explorer.plumenetwork.xyz",evmChainId: 98866, type: "evm"     },
  hyperevm:       { name: "HyperEVM",       explorerUrl: "https://purrsec.com",                    evmChainId: 999,   type: "evm"       },
  hyperliquid:      { name: "Hyperliquid L1", explorerUrl: "https://app.hyperliquid.xyz/explorer", evmChainId: null,  type: "other" },
  megaeth:   { name: "MegaETH",   explorerUrl: "https://megaexplorer.xyz",          evmChainId: 6342,  type: "evm" },
  monad:     { name: "Monad",     explorerUrl: "https://explorer.monad.xyz",       evmChainId: 143,   type: "evm"     },
  xdc:       { name: "XDC Network",explorerUrl: "https://xdcscan.io",             evmChainId: 50,    type: "evm"       },
  redbelly:  { name: "Redbelly Network",explorerUrl: "https://redbelly.routescan.io", evmChainId: 151, type: "evm" },
  mantle:    { name: "Mantle",    explorerUrl: "https://mantlescan.xyz",           evmChainId: 5000,  type: "evm"    },
  linea:     { name: "Linea",    explorerUrl: "https://lineascan.build",           evmChainId: 59144, type: "evm"     },
  scroll:    { name: "Scroll",   explorerUrl: "https://scrollscan.com",            evmChainId: 534352,type: "evm"    },
  blast:     { name: "Blast",    explorerUrl: "https://blastscan.io",              evmChainId: 81457, type: "evm"     },
  mode:      { name: "Mode",     explorerUrl: "https://modescan.io",              evmChainId: 34443, type: "evm"      },
  manta:     { name: "Manta",    explorerUrl: "https://pacific-explorer.manta.network", evmChainId: 169, type: "evm"  },
  berachain: { name: "Berachain",explorerUrl: "https://berascan.com",             evmChainId: 80094, type: "evm" },
  bob:       { name: "BOB",     explorerUrl: "https://explorer.gobob.xyz",        evmChainId: 60808, type: "evm"       },
  fraxtal:   { name: "Fraxtal", explorerUrl: "https://fraxscan.com",             evmChainId: 252,   type: "evm"   },
  taiko:     { name: "Taiko",   explorerUrl: "https://taikoscan.io",             evmChainId: 167000,type: "evm"     },
  "polygon-zkevm": { name: "Polygon zkEVM", explorerUrl: "https://zkevm.polygonscan.com", evmChainId: 1101, type: "evm" },
  aurora:    { name: "Aurora",  explorerUrl: "https://explorer.aurora.dev",       evmChainId: 1313161554, type: "evm" },
  moonbeam:  { name: "Moonbeam",explorerUrl: "https://moonbeam.moonscan.io",     evmChainId: 1284,  type: "evm"  },
  boba:      { name: "Boba",    explorerUrl: "https://bobascan.com",              evmChainId: 288,   type: "evm"      },
  soneium:   { name: "Soneium", explorerUrl: "https://soneium.blockscout.com",   evmChainId: 1868,  type: "evm"   },
  zircuit:   { name: "Zircuit", explorerUrl: "https://explorer.zircuit.com",     evmChainId: 48900, type: "evm"   },
  metis:     { name: "Metis",   explorerUrl: "https://andromeda-explorer.metis.io", evmChainId: 1088, type: "evm"   },
  astar:     { name: "Astar",   explorerUrl: "https://astar.blockscout.com",     evmChainId: 592,   type: "evm"     },
  plasma:    { name: "Plasma",  explorerUrl: "https://plasma-explorer.com",       evmChainId: 9745,  type: "evm"    },
  "morph-l2":{ name: "Morph",   explorerUrl: "https://explorer.morphl2.io",      evmChainId: 2818,  type: "evm"  },
  swellchain:{ name: "Swellchain",explorerUrl: "https://explorer.swellnetwork.io",evmChainId: 1923,  type: "evm"},
  xlayer:    { name: "X Layer", explorerUrl: "https://www.oklink.com/xlayer",     evmChainId: 196,   type: "evm"    },
  apechain:  { name: "ApeChain",explorerUrl: "https://apescan.io",               evmChainId: 33139, type: "evm"  },
  bittorrent:{ name: "BitTorrent",explorerUrl: "https://bttcscan.com",           evmChainId: 199,   type: "evm"},
  viction:   { name: "Viction", explorerUrl: "https://tomoscan.io",              evmChainId: 88,    type: "evm"   },
  flare:     { name: "Flare",   explorerUrl: "https://flarescan.com",            evmChainId: 14,    type: "evm"     },
  songbird:  { name: "Songbird",explorerUrl: "https://songbird-explorer.flare.network", evmChainId: 19, type: "evm"},
  bitlayer:  { name: "Bitlayer",explorerUrl: "https://www.btrscan.com",          evmChainId: 200901,type: "evm"  },
  abstract:       { name: "Abstract",        explorerUrl: "https://abscan.org",                           evmChainId: 2741,     type: "evm"       },
  abcore:         { name: "AB Core",         explorerUrl: "https://explorer.core.ab.org",                 evmChainId: 36888,    type: "evm"         },
  bifrost:        { name: "Bifrost Network", explorerUrl: "https://explorer.mainnet.bifrostnetwork.com",  evmChainId: 3068,     type: "evm"        },
  bsquared:       { name: "B² Network",     explorerUrl: "https://explorer.bsquared.network",            evmChainId: 223,      type: "evm"       },
  corn:           { name: "Corn",            explorerUrl: "https://cornscan.io",                          evmChainId: 21000000, type: "evm"           },
  cronos:         { name: "Cronos",          explorerUrl: "https://cronoscan.com",                        evmChainId: 25,       type: "evm"         },
  conflux:        { name: "Conflux",         explorerUrl: "https://evm.confluxscan.org",                  evmChainId: 1030,     type: "evm"        },
  etherlink:      { name: "Etherlink",       explorerUrl: "https://explorer.etherlink.com",               evmChainId: 42793,    type: "evm"      },
  flow:           { name: "Flow",            explorerUrl: "https://evm.flowscan.io",                      evmChainId: 747,      type: "evm"           },
  harmony:        { name: "Harmony",         explorerUrl: "https://explorer.harmony.one",                 evmChainId: 1666600000, type: "evm"        },
  hemi:           { name: "Hemi",            explorerUrl: "https://explorer.hemi.xyz",                    evmChainId: 43111,    type: "evm"           },
  "immutable-zkevm": { name: "Immutable zkEVM", explorerUrl: "https://explorer.immutable.com",           evmChainId: 13371,    type: "evm"},
  katana:         { name: "Katana",          explorerUrl: "https://katanascan.com",                       evmChainId: 747474,   type: "evm"         },
  mezo:           { name: "Mezo",            explorerUrl: "https://explorer.mezo.org",                    evmChainId: 31612,    type: "evm"           },
  nibiru:         { name: "Nibiru",          explorerUrl: "https://explorer.nibiru.fi",                   evmChainId: 6700,     type: "evm"         },
  pulsechain:     { name: "PulseChain",      explorerUrl: "https://scan.pulsechain.com",                  evmChainId: 369,      type: "evm"     },
  sophon:         { name: "Sophon",          explorerUrl: "https://explorer.sophon.xyz",                  evmChainId: 50104,    type: "evm"         },
  tron:      { name: "Tron",      explorerUrl: "https://tronscan.org",              evmChainId: null,  type: "tron"      },
  aptos:     { name: "Aptos",     explorerUrl: "https://explorer.aptoslabs.com",   evmChainId: null,  type: "other" },
  sui:       { name: "Sui",       explorerUrl: "https://suiscan.xyz",              evmChainId: null,  type: "other"       },
  solana:    { name: "Solana",   explorerUrl: "https://solscan.io",               evmChainId: null,  type: "other"    },
  ton:       { name: "TON",       explorerUrl: "https://tonviewer.com",            evmChainId: null,  type: "other"       },
  near:      { name: "NEAR",      explorerUrl: "https://nearblocks.io",            evmChainId: null,  type: "other"      },
  algorand:  { name: "Algorand",  explorerUrl: "https://explorer.perawallet.app",  evmChainId: null,  type: "other"  },
  stellar:   { name: "Stellar",  explorerUrl: "https://stellar.expert",           evmChainId: null,  type: "other"  },
  starknet:  { name: "Starknet",  explorerUrl: "https://starkscan.co",             evmChainId: null,  type: "other"  },
  hedera:    { name: "Hedera",    explorerUrl: "https://hashscan.io",              evmChainId: null,  type: "other"    },
  polkadot:  { name: "Polkadot",  explorerUrl: "https://polkadot.subscan.io",     evmChainId: null,  type: "other"  },
  xrpl:      { name: "XRP Ledger",explorerUrl: "https://xrpscan.com",             evmChainId: null,  type: "other"      },
  kava:      { name: "Kava",     explorerUrl: "https://kavascan.com",             evmChainId: 2222,  type: "evm"      },
  tezos:     { name: "Tezos",   explorerUrl: "https://tzkt.io",                  evmChainId: null,  type: "other"     },
  cardano:   { name: "Cardano", explorerUrl: "https://cardanoscan.io",           evmChainId: null,  type: "other"   },
  icp:       { name: "Internet Computer", explorerUrl: "https://dashboard.internetcomputer.org", evmChainId: null, type: "other" },
  noble:     { name: "Noble",   explorerUrl: "https://www.mintscan.io/noble",    evmChainId: null,  type: "other"     },
  osmosis:   { name: "Osmosis", explorerUrl: "https://www.mintscan.io/osmosis",  evmChainId: null,  type: "other"   },
  mantra:    { name: "MANTRA",  explorerUrl: "https://www.mintscan.io/mantra",   evmChainId: null,  type: "other"    },
  secret:    { name: "Secret Network", explorerUrl: "https://www.mintscan.io/secret", evmChainId: null, type: "other" },
  provenance:{ name: "Provenance",explorerUrl: "https://www.mintscan.io/provenance", evmChainId: null, type: "other" },
  hydration: { name: "Hydration",explorerUrl: "https://hydration.subscan.io",    evmChainId: null,  type: "other" },
  injective:      { name: "Injective",       explorerUrl: "https://explorer.injective.network",           evmChainId: null,     type: "other"      },
  movement:       { name: "Movement",        explorerUrl: "https://explorer.movementnetwork.xyz",         evmChainId: null,     type: "other"       },
  stacks:         { name: "Stacks",          explorerUrl: "https://explorer.hiro.so",                     evmChainId: null,     type: "other"         },
  rootstock:      { name: "Rootstock",       explorerUrl: "https://rootstock.blockscout.com",              evmChainId: 30,       type: "evm"      },
};

/** Alias chains that share a display name. Map alias -> canonical key. */
const CHAIN_ALIASES: Record<string, string> = {
  "hyperliquid-l1": "hyperliquid",
  // DL display names that differ from our CHAIN_META names
  "OP Mainnet": "optimism",
  "Plume Mainnet": "plume",
  "zkSync Era": "zksync",
  "XRPL": "xrpl",
  "Bsquared": "bsquared",
  "Kaia": "klaytn",  // Klaytn rebranded to Kaia
  "Secret": "secret",
  "Redbelly": "redbelly",
};

/**
 * Chain resilience tier — measures the chain's own infrastructure quality,
 * decentralization, and censorship resistance.
 *
 * Tier 1: Highly decentralized, battle-tested, censorship-resistant L1s.
 * Tier 2: Established chains with moderate centralization (default for unlisted).
 * Tier 3: Newer/unproven chains, or chains with known centralization or reputation issues.
 */
export type ChainResilienceTier = 1 | 2 | 3;

export const CHAIN_RESILIENCE_TIER: Partial<Record<string, ChainResilienceTier>> = {
  // Tier 1 — gold standard for decentralization & censorship resistance
  ethereum: 1,

  // Tier 3 — known issues, high centralization, or unproven security
  pulsechain: 3,
  harmony: 3,       // compromised bridge, degraded security
  bittorrent: 3,    // highly centralized
  songbird: 3,      // canary network
  moonriver: 3,     // canary network
  plasma: 3,        // very new, minimal validation
  viction: 3,       // low activity, centralized

  // Everything else defaults to tier 2 via getChainResilienceTier()
};

/** Get the resilience tier for a chain (defaults to 2). */
export function getChainResilienceTier(chainId: string): ChainResilienceTier {
  return CHAIN_RESILIENCE_TIER[chainId] ?? 2;
}

/* ─── DL Chain Name Resolution ─────────────────────────────── */

/** Reverse lookup: DL display name (lowercase) → canonical chain ID. */
const CHAIN_NAME_TO_ID = new Map<string, string>();
for (const [id, meta] of Object.entries(CHAIN_META)) {
  CHAIN_NAME_TO_ID.set(meta.name.toLowerCase(), id);
}

/**
 * Resolve a raw chain key (as it appears in DefiLlama data) to its
 * canonical CHAIN_META id, or null if unknown.
 *
 * Handles: exact ID match, alias resolution, and case-insensitive display-name lookup.
 */
export function resolveChainId(raw: string): string | null {
  // Try as-is first (exact ID match or alias)
  const aliased = CHAIN_ALIASES[raw] ?? raw;
  if (CHAIN_META[aliased]) return aliased;

  // Try case-insensitive name lookup (DL uses "BSC", "Ethereum", etc.)
  const byName = CHAIN_NAME_TO_ID.get(raw.toLowerCase());
  if (byName) {
    const canonical = CHAIN_ALIASES[byName] ?? byName;
    return CHAIN_META[canonical] ? canonical : null;
  }

  return null;
}

/** Chain IDs that have a CHAIN_META entry (all defined chains are potentially active). */
export function getActiveChainIds(): string[] {
  // Return all chains that have metadata defined, as they may have supply data
  // from DefiLlama even without explicit contract tracking
  return Object.keys(CHAIN_META).sort();
}
