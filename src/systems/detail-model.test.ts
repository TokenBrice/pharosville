import { describe, expect, it } from "vitest";
import { depegHistoryLabel, detailForArea, detailForDock, detailForLighthouse, detailForPigeonnier, detailForShip, lighthouseBeamWarmCueLabel, PHAROS_WATCH_TELEGRAM_HREF, supplyMomentumLabel, withRiskTransitionFact } from "./detail-model";
import type { AreaNode, DockNode, LighthouseNode, PigeonnierNode, ShipNode } from "./world-types";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  fixtureWithDepegOn,
  fixtureWithoutAsset,
  makerSquadFixtureInputs,
} from "../__fixtures__/pharosville-world";

describe("detail-model analytical links", () => {
  it("points built-in detail links at canonical Pharos Watch routes", () => {
    const lighthouseDetail = detailForLighthouse({
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 1, y: 1 },
      psiBand: "NORMAL",
      score: 42,
      color: "#ffffff",
      unavailable: false,
      detailId: "lighthouse",
    } satisfies LighthouseNode);
    expect(lighthouseDetail.links).toEqual([
      { label: "PSI", href: "https://pharos.watch/stability-index/" },
    ]);
    expect(lighthouseDetail.facts).toContainEqual({
      label: "Beam warmth cue",
      value: "Beam warms amber when active DEWS reaches ALERT, WARNING, or DANGER.",
    });

    expect(detailForDock({
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum",
      chainId: "ethereum",
      logoSrc: "/chains/ethereum.png",
      assetId: "dock.ethereum-civic-cove",
      tile: { x: 1, y: 1 },
      totalUsd: 100,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 1,
      concentration: null,
      harboredStablecoins: [{ id: "usdt-tether", symbol: "USDT", share: 1, supplyUsd: 100 }],
      detailId: "dock.ethereum",
    } satisfies DockNode).links[0]).toEqual({
      label: "Chain",
      href: "https://pharos.watch/chains/ethereum/",
    });
  });

  it("opens the pigeonnier Telegram link in a new tab", () => {
    const detail = detailForPigeonnier({
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      tile: { x: 50, y: 50 },
      detailId: "pigeonnier",
    } satisfies PigeonnierNode);
    expect(detail.links).toEqual([
      { label: "Subscribe on Telegram", href: PHAROS_WATCH_TELEGRAM_HREF, target: "_blank" },
    ]);
    expect(PHAROS_WATCH_TELEGRAM_HREF).toBe("https://pharos.watch/telegram/");
  });

  it("rewrites member and custom area analytical links", () => {
    expect(detailForArea({
      id: "area.dews.danger",
      kind: "area",
      label: "Danger Strait",
      tile: { x: 1, y: 1 },
      detailId: "area.dews.danger",
      links: [{ label: "Custom DEWS", href: "/depeg/" }],
    } satisfies AreaNode).links).toEqual([
      { label: "Custom DEWS", href: "https://pharos.watch/depeg/" },
    ]);
  });

  it("describes active elevated DEWS as the lighthouse warm-beam cue", () => {
    const cue = lighthouseBeamWarmCueLabel([
      {
        id: "area.dews.alert",
        kind: "area",
        label: "Alert Channel",
        tile: { x: 1, y: 1 },
        band: "ALERT",
        count: 2,
        detailId: "area.dews.alert",
      },
      {
        id: "area.dews.watch",
        kind: "area",
        label: "Watch Breakwater",
        tile: { x: 1, y: 1 },
        band: "WATCH",
        count: 8,
        detailId: "area.dews.watch",
      },
    ]);

    expect(cue).toContain("Beam warming amber under elevated DEWS");
    expect(cue).toContain("Alert Channel ALERT (2 stablecoins)");
    expect(cue).not.toContain("Watch Breakwater");
  });

  it("points ship detail links at canonical stablecoin pages", () => {
    const detail = detailForShip({
      id: "usdt-tether",
      kind: "ship",
      label: "Tether",
      symbol: "USDT",
      asset: {} as ShipNode["asset"],
      meta: {} as ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 2, y: 2 },
      chainPresence: [],
      dockVisits: [],
      dominantChainId: null,
      homeDockChainId: null,
      dockChainId: null,
      marketCapUsd: 100,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      riskWaterLabel: "Calm Anchorage",
      placementEvidence: { reason: "Fresh", sourceFields: ["pegSummary.coins[]"], stale: false },
      visual: {
        hull: "treasury-galleon",
        shipClass: "cefi",
        classLabel: "CeFi",
        rigging: "issuer-rig",
        livery: {
          accent: "#27b6a5",
          label: "Tether logo livery",
          logoMatte: "#f7fffb",
          logoShape: "circle",
          primary: "#009393",
          sailColor: "#d8efe7",
          sailPanel: "center",
          secondary: "#005f61",
          source: "stablecoin-logo",
          stripePattern: "double",
        },
        sailColor: "#d8efe7",
        sailStripeColor: "#009393",
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.usdt-tether",
    } satisfies ShipNode);

    expect(detail.links).toEqual([
      { label: "Stablecoin", href: "https://pharos.watch/stablecoin/usdt-tether/" },
    ]);
  });

  it("exposes a Cycle tempo fact with one of the four canonical labels", () => {
    const ship: import("./world-types").ShipNode = {
      id: "usdt-tether",
      kind: "ship",
      label: "Tether",
      symbol: "USDT",
      asset: {} as import("./world-types").ShipNode["asset"],
      meta: {} as import("./world-types").ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 2, y: 2 },
      chainPresence: [],
      dockVisits: [],
      dominantChainId: null,
      homeDockChainId: null,
      dockChainId: null,
      marketCapUsd: 1_000_000_000,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      riskWaterLabel: "Calm Anchorage",
      placementEvidence: { reason: "Fresh", sourceFields: [], stale: false },
      visual: {
        hull: "treasury-galleon",
        shipClass: "cefi",
        classLabel: "CeFi",
        rigging: "issuer-rig",
        livery: {
          accent: "#27b6a5",
          label: "Tether logo livery",
          logoMatte: "#f7fffb",
          logoShape: "circle",
          primary: "#009393",
          sailColor: "#d8efe7",
          sailPanel: "center",
          secondary: "#005f61",
          source: "stablecoin-logo",
          stripePattern: "double",
        },
        sailColor: "#d8efe7",
        sailStripeColor: "#009393",
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.usdt-tether",
    };
    const detail = detailForShip(ship);
    const tempoFact = detail.facts.find((fact) => fact.label === "Cycle tempo");
    expect(tempoFact).toBeDefined();
    expect(["Languid", "Steady", "Brisk", "Active"]).toContain(tempoFact!.value);
  });

  it("computes Cycle tempo per quartile when allShips context is supplied (BLOCKER fix from DOM-parity review)", () => {
    // Without `allShips` the helper falls back to a 1-ship fleet that always
    // returns Q0 / "Languid". This test exercises the multi-ship path through
    // `detailForShip` so the Q1/Q2/Q3 paths are not silently untested.
    const baseShip: import("./world-types").ShipNode = {
      id: "base",
      kind: "ship",
      label: "Base",
      symbol: "BASE",
      asset: {} as import("./world-types").ShipNode["asset"],
      meta: {} as import("./world-types").ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 2, y: 2 },
      chainPresence: [],
      dockVisits: [],
      dominantChainId: null,
      homeDockChainId: null,
      dockChainId: null,
      marketCapUsd: 0,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      riskWaterLabel: "Calm Anchorage",
      placementEvidence: { reason: "Fresh", sourceFields: [], stale: false },
      visual: {
        hull: "treasury-galleon",
        shipClass: "cefi",
        classLabel: "CeFi",
        rigging: "issuer-rig",
        livery: {
          accent: "#000",
          label: "test",
          logoMatte: "#fff",
          logoShape: "circle",
          primary: "#000",
          sailColor: "#fff",
          sailPanel: "center",
          secondary: "#000",
          source: "stablecoin-logo",
          stripePattern: "double",
        },
        sailColor: "#fff",
        sailStripeColor: "#000",
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.base",
    };
    const ships = [
      { ...baseShip, id: "q0", detailId: "ship.q0", marketCapUsd: 1_000 },
      { ...baseShip, id: "q1", detailId: "ship.q1", marketCapUsd: 10_000 },
      { ...baseShip, id: "q2", detailId: "ship.q2", marketCapUsd: 100_000 },
      { ...baseShip, id: "q3", detailId: "ship.q3", marketCapUsd: 1_000_000 },
    ];
    const tempoLabels = ships.map((ship) => {
      const detail = detailForShip(ship, { allShips: ships });
      const fact = detail.facts.find((f) => f.label === "Cycle tempo");
      return fact?.value;
    });
    // Each quartile path must be exercised — all four labels must appear.
    expect(tempoLabels).toContain("Languid");
    expect(tempoLabels).toContain("Steady");
    expect(tempoLabels).toContain("Brisk");
    expect(tempoLabels).toContain("Active");
    // Without context the helper degrades to Q0 — guard against silent regression.
    const detailWithoutContext = detailForShip(ships[3]!);
    const tempoWithoutContext = detailWithoutContext.facts.find((f) => f.label === "Cycle tempo");
    expect(tempoWithoutContext?.value).toBe("Languid");
  });

  it("exposes ship route and Ledger Mooring placement facts", () => {
    const detail = detailForShip({
      id: "susde-ethena",
      kind: "ship",
      label: "Staked USDe",
      symbol: "sUSDe",
      asset: {} as ShipNode["asset"],
      meta: {} as ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 30, y: 52 },
      chainPresence: [{ chainId: "ethereum", currentUsd: 100, hasRenderedDock: true, share: 1 }],
      dockVisits: [{ chainId: "ethereum", dockId: "dock.ethereum", weight: 1, mooringTile: { x: 28, y: 44 } }],
      dominantChainId: "ethereum",
      homeDockChainId: "ethereum",
      dockChainId: "ethereum",
      marketCapUsd: 100,
      riskPlacement: "ledger-mooring",
      riskZone: "ledger",
      riskWaterLabel: "Ledger Mooring",
      placementEvidence: { reason: "NAV token Ledger Mooring idle preference", sourceFields: ["meta.flags.navToken", "pegSummary.coins[]"], stale: false },
      visual: {
        hull: "treasury-galleon",
        shipClass: "cefi",
        classLabel: "CeFi",
        rigging: "issuer-rig",
        livery: {
          accent: "#a9a68e",
          label: "Ethena staked livery",
          logoMatte: "#f7f4e8",
          logoShape: "pill",
          primary: "#686963",
          sailColor: "#e8e6dc",
          sailPanel: "hoist",
          secondary: "#34352f",
          source: "stablecoin-logo",
          stripePattern: "diagonal",
        },
        sailColor: "#e8e6dc",
        sailStripeColor: "#686963",
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.susde-ethena",
    } satisfies ShipNode);

    expect(detail.facts).toEqual(expect.arrayContaining([
      { label: "Representative position", value: "Ledger Mooring idle" },
      { label: "Ship livery", value: "Ethena staked livery; pill logo shape, hoist sail panel, diagonal brand stripe" },
      { label: "Risk water area", value: "Ledger Mooring" },
      { label: "Risk water zone", value: "ledger" },
      { label: "Risk placement key", value: "ledger-mooring" },
      { label: "Home dock", value: "Ethereum" },
      { label: "Docking cadence", value: "Occasional; 1 positive chain deployment, 1 rendered dock stop" },
      { label: "Route source", value: "stablecoins.chainCirculating, pegSummary.coins[], stress.signals[]" },
      { label: "Evidence", value: "meta.flags.navToken, pegSummary.coins[]" },
    ]));
  });
});

describe("detail-model unique tier surfacing", () => {
  function makeShipNode(overrides: { uniqueRationale?: string }): ShipNode {
    return {
      id: "crvusd-curve",
      kind: "ship",
      label: "Curve",
      symbol: "crvUSD",
      asset: {} as ShipNode["asset"],
      meta: {} as ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 2, y: 2 },
      chainPresence: [],
      dockVisits: [],
      dominantChainId: null,
      homeDockChainId: null,
      dockChainId: null,
      marketCapUsd: 100,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      riskWaterLabel: "Calm Anchorage",
      placementEvidence: { reason: "Fresh", sourceFields: [], stale: false },
      visual: {
        hull: "dao-schooner",
        spriteAssetId: "ship.crvusd-unique",
        ...(overrides.uniqueRationale ? { uniqueRationale: overrides.uniqueRationale } : {}),
        shipClass: "defi",
        classLabel: "DeFi",
        rigging: "dao-rig",
        livery: {
          accent: "#8bbf72",
          label: "Curve logo livery",
          logoMatte: "#f7fff5",
          logoShape: "ring",
          primary: "#41956b",
          sailColor: "#d9ecdf",
          sailPanel: "quartered",
          secondary: "#27543e",
          source: "stablecoin-logo",
          stripePattern: "wave",
        },
        sailColor: "#d9ecdf",
        sailStripeColor: "#41956b",
        overlay: "none",
        sizeTier: overrides.uniqueRationale ? "unique" : "major",
        sizeLabel: overrides.uniqueRationale ? "Heritage hull" : "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.crvusd-curve",
    };
  }

  it("exposes a Cultural significance fact for unique ships", () => {
    const detail = detailForShip(makeShipNode({
      uniqueRationale: "Sails under Curve's llama mascot — the DEX that defined stablecoin AMM curves.",
    }));
    const culturalFact = detail.facts.find((fact) => fact.label === "Cultural significance");
    expect(culturalFact).toBeDefined();
    expect(culturalFact!.value).toContain("Curve");
  });

  it("does not expose a Cultural significance fact for non-unique ships", () => {
    const detail = detailForShip(makeShipNode({}));
    const culturalFact = detail.facts.find((fact) => fact.label === "Cultural significance");
    expect(culturalFact).toBeUndefined();
  });
});

describe("detail-model squad surfacing", () => {
  it("Sky squad detail panel surfaces flagship + vanguard + savings cutter", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const susds = world.ships.find((ship) => ship.id === "susds-sky")!;
    const detail = world.detailIndex[susds.detailId]!;

    const formationFact = detail.facts.find((fact) => fact.label === "Sailing in formation");
    expect(formationFact).toBeDefined();
    expect(formationFact!.value).toContain("USDS (flagship)");
    expect(formationFact!.value).toContain("stUSDS (vanguard)");
    expect(formationFact!.value).toContain("sUSDS");
    // DAI/sDAI are in the Maker squad and must NOT appear in the Sky detail.
    expect(formationFact!.value).not.toContain("DAI");
    expect(detail.summary).toContain("inherits flagship placement");
  });

  it("Maker squad detail panel surfaces flagship + sDAI", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const sdai = world.ships.find((ship) => ship.id === "sdai-sky")!;
    const detail = world.detailIndex[sdai.detailId]!;

    const formationFact = detail.facts.find((fact) => fact.label === "Sailing in formation");
    expect(formationFact).toBeDefined();
    expect(formationFact!.value).toContain("DAI (flagship)");
    expect(formationFact!.value).toContain("sDAI");
    // Sky members must NOT appear in the Maker detail.
    expect(formationFact!.value).not.toContain("USDS");
    expect(formationFact!.value).not.toContain("stUSDS");
  });

  it("squad detail panel surfaces the override banner when a Sky consort outpaces its flagship", () => {
    const world = buildPharosVilleWorld(fixtureWithDepegOn(makerSquadFixtureInputs(), "susds-sky"));
    const susds = world.ships.find((ship) => ship.id === "susds-sky")!;
    expect(susds.placementEvidence.squadOverride).toBeDefined();
    expect(susds.placementEvidence.squadOverride?.ownPlacement).toBeDefined();
    expect(susds.placementEvidence.squadOverride?.ownReason).toBeTruthy();

    const detail = world.detailIndex[susds.detailId]!;
    const overrideFact = detail.facts.find((fact) => fact.label === "Squad override");
    expect(overrideFact).toBeDefined();
    expect(overrideFact!.value).toContain("sUSDS in distress");
    expect(overrideFact!.value).toContain("squad sheltering at flagship's position");
  });

  it("Sky squad goes silent on its members when its flagship is missing; Maker squad continues", () => {
    const inputs = fixtureWithoutAsset(makerSquadFixtureInputs(), "usds-sky");
    const world = buildPharosVilleWorld(inputs);
    // Sky-side: stUSDS no longer in a squad, no formation/override facts.
    const stusds = world.ships.find((ship) => ship.id === "stusds-sky")!;
    const stusdsDetail = world.detailIndex[stusds.detailId]!;
    expect(stusdsDetail.facts.find((fact) => fact.label === "Sailing in formation")).toBeUndefined();
    expect(stusdsDetail.facts.find((fact) => fact.label === "Squad override")).toBeUndefined();
    expect(stusdsDetail.summary).not.toContain("inherits flagship placement");

    // Maker-side: still active.
    const sdai = world.ships.find((ship) => ship.id === "sdai-sky")!;
    const sdaiDetail = world.detailIndex[sdai.detailId]!;
    const formationFact = sdaiDetail.facts.find((fact) => fact.label === "Sailing in formation");
    expect(formationFact).toBeDefined();
    expect(formationFact!.value).toContain("DAI (flagship)");
  });
});

// E2/E3 DOM parity tests
describe("detail-model E2/E3 behavioral richness facts", () => {
  function baseShipNode(overrides: Partial<ShipNode> = {}): ShipNode {
    return {
      id: "usdc-circle",
      kind: "ship",
      label: "USD Coin",
      symbol: "USDC",
      asset: {} as ShipNode["asset"],
      meta: {} as ShipNode["meta"],
      reportCard: null,
      logoSrc: null,
      tile: { x: 1, y: 1 },
      riskTile: { x: 2, y: 2 },
      chainPresence: [],
      dockVisits: [],
      dominantChainId: null,
      homeDockChainId: null,
      dockChainId: null,
      marketCapUsd: 1_000_000_000,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      riskWaterLabel: "Calm Anchorage",
      placementEvidence: { reason: "Fresh", sourceFields: [], stale: false },
      visual: {
        hull: "treasury-galleon",
        shipClass: "cefi",
        classLabel: "CeFi",
        rigging: "issuer-rig",
        livery: {
          accent: "#2775ca",
          label: "USDC logo livery",
          logoMatte: "#f0f4ff",
          logoShape: "circle",
          primary: "#2775ca",
          sailColor: "#dce8f5",
          sailPanel: "center",
          secondary: "#1a4f8a",
          source: "stablecoin-logo",
          stripePattern: "single",
        },
        sailColor: "#dce8f5",
        sailStripeColor: "#2775ca",
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.usdc-circle",
      ...overrides,
    };
  }

  describe("E2 — 24h supply change fact", () => {
    it("shows formatted positive percentage when change24hPct is positive", () => {
      const ship = baseShipNode({ change24hPct: 5.4 });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "24h supply change");
      expect(fact).toBeDefined();
      expect(fact!.value).toBe("+5.4%");
    });

    it("shows formatted negative percentage when change24hPct is negative", () => {
      const ship = baseShipNode({ change24hPct: -3.2 });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "24h supply change");
      expect(fact).toBeDefined();
      expect(fact!.value).toBe("-3.2%");
    });

    it("shows em-dash when change24hPct is null", () => {
      const ship = baseShipNode({ change24hPct: null });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "24h supply change");
      expect(fact).toBeDefined();
      expect(fact!.value).toBe("—");
    });
  });

  describe("E3 — docking cadence extended dwell label", () => {
    it("appends (extended dwell) suffix when chainPresence.length ≥ 4", () => {
      const ship = baseShipNode({
        chainPresence: [
          { chainId: "ethereum", currentUsd: 100, hasRenderedDock: true, share: 0.4 },
          { chainId: "tron", currentUsd: 80, hasRenderedDock: false, share: 0.3 },
          { chainId: "solana", currentUsd: 60, hasRenderedDock: false, share: 0.2 },
          { chainId: "bsc", currentUsd: 30, hasRenderedDock: false, share: 0.1 },
        ],
      });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "Docking cadence");
      expect(fact).toBeDefined();
      expect(fact!.value).toContain("(extended dwell)");
    });

    it("does not append (extended dwell) when chainPresence.length < 4", () => {
      const ship = baseShipNode({
        chainPresence: [
          { chainId: "ethereum", currentUsd: 100, hasRenderedDock: true, share: 1 },
        ],
      });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "Docking cadence");
      expect(fact).toBeDefined();
      expect(fact!.value).not.toContain("(extended dwell)");
    });
  });

  describe("W5.01 — Tracking new risk band fact", () => {
    it("surfaces 'Tracking new risk band' when riskTransition is active (progress < 1)", () => {
      const ship = baseShipNode();
      const detail = detailForShip(ship, {
        riskTransition: { fromLabel: "Calm Anchorage", toLabel: "Alert Channel", progress: 0.5 },
      });
      const fact = detail.facts.find((f) => f.label === "Tracking new risk band");
      expect(fact).toBeDefined();
      expect(fact!.value).toBe("from Calm Anchorage to Alert Channel");
    });

    it("suppresses the row when riskTransition.progress is 1.0", () => {
      const ship = baseShipNode();
      const detail = detailForShip(ship, {
        riskTransition: { fromLabel: "Calm Anchorage", toLabel: "Alert Channel", progress: 1.0 },
      });
      const fact = detail.facts.find((f) => f.label === "Tracking new risk band");
      expect(fact).toBeUndefined();
    });

    it("suppresses the row when riskTransition is null", () => {
      const ship = baseShipNode();
      const detail = detailForShip(ship, { riskTransition: null });
      const fact = detail.facts.find((f) => f.label === "Tracking new risk band");
      expect(fact).toBeUndefined();
    });
  });

  describe("W5.01 — withRiskTransitionFact (React-render-time patcher)", () => {
    it("injects the row after 'Risk placement key' on an existing detail", () => {
      const ship = baseShipNode();
      const baseDetail = detailForShip(ship);
      const patched = withRiskTransitionFact(baseDetail, {
        fromLabel: "Calm Anchorage",
        toLabel: "Warning Shoals",
        progress: 0.25,
      });
      const placementIdx = patched.facts.findIndex((f) => f.label === "Risk placement key");
      const trackingIdx = patched.facts.findIndex((f) => f.label === "Tracking new risk band");
      expect(placementIdx).toBeGreaterThanOrEqual(0);
      expect(trackingIdx).toBe(placementIdx + 1);
      expect(patched.facts[trackingIdx]!.value).toBe("from Calm Anchorage to Warning Shoals");
    });

    it("returns the detail unchanged when transition is null", () => {
      const ship = baseShipNode();
      const baseDetail = detailForShip(ship);
      const patched = withRiskTransitionFact(baseDetail, null);
      expect(patched).toBe(baseDetail);
    });

    it("returns the detail unchanged when progress >= 1", () => {
      const ship = baseShipNode();
      const baseDetail = detailForShip(ship);
      const patched = withRiskTransitionFact(baseDetail, {
        fromLabel: "Calm Anchorage",
        toLabel: "Alert Channel",
        progress: 1.0,
      });
      expect(patched).toBe(baseDetail);
    });
  });
});

describe("detail-model depeg history and supply momentum", () => {
  it("labels depeg history with count, worst deviation, and last date", () => {
    expect(depegHistoryLabel({
      eventCount: 3,
      worstDeviationBps: -820,
      lastEventAt: Date.UTC(2026, 4, 30),
    })).toBe("3 events on record; worst -8.2%; last 2026-05-30");
    // Below the shared significance gate (3+ events or worst <= -3%) the
    // record stays silent — matching the absent hull weathering.
    expect(depegHistoryLabel({ eventCount: 1, worstDeviationBps: -120, lastEventAt: null })).toBeNull();
    expect(depegHistoryLabel({ eventCount: 1, worstDeviationBps: -900, lastEventAt: null }))
      .toBe("1 event on record; worst -9.0%");
    expect(depegHistoryLabel(null)).toBeNull();
    expect(depegHistoryLabel({ eventCount: 0, worstDeviationBps: -500, lastEventAt: null })).toBeNull();
  });

  it("labels supply momentum only when a longer window has data", () => {
    expect(supplyMomentumLabel({ change7dPct: 2.42, change30dPct: -5.1 })).toBe("7d +2.4%, 30d -5.1%");
    expect(supplyMomentumLabel({ change7dPct: null, change30dPct: 3 })).toBe("30d +3.0%");
    expect(supplyMomentumLabel({ change7dPct: null, change30dPct: null })).toBeNull();
  });

  it("surfaces lighthouse last fleet depeg with a none fallback", () => {
    const base: LighthouseNode = {
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 18, y: 28 },
      psiBand: "BEDROCK",
      score: 92,
      color: "#3aa76d",
      unavailable: false,
      detailId: "lighthouse",
      lastFleetDepegAt: Date.UTC(2026, 5, 2),
    };
    const withDate = detailForLighthouse(base);
    expect(withDate.facts.find((fact) => fact.label === "Last fleet depeg")?.value).toBe("2026-06-02");
    const without = detailForLighthouse({ ...base, lastFleetDepegAt: null });
    expect(without.facts.find((fact) => fact.label === "Last fleet depeg")?.value).toBe("None on record");
  });
});
