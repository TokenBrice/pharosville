import { describe, expect, it } from "vitest";
import {
  auditShieldLabel,
  auditShieldState,
  cargoTideLabel,
  supplyTideLabel,
  backingDiversityLabel,
  backingDiversitySeverity,
  beamDwellLabel,
  depegHistoryLabel,
  dexCrossCheckLabel,
  highWaterMarkLabel,
  detailForArea,
  detailForDock,
  detailForGrave,
  detailForLighthouse,
  detailForPigeonnier,
  detailForShip,
  dockConcentrationLabel,
  fleetRankLabel,
  flightToQualityLabel,
  harborRankLabel,
  lighthouseBeamWarmCueLabel,
  lighthouseLampStatusLabel,
  PHAROS_WATCH_TELEGRAM_HREF,
  psiCompositionLabel,
  psiTrendLabel,
  priceConfidenceLabel,
  reportCardSafetyLabel,
  priceSignalSeverity,
  quayMasonryLabel,
  shareOfFleetLabel,
  sourceConsensusLabel,
  sourceConsensusRatio,
  stablecoinSupplyShareLabel,
  stressBreakdownLabel,
  supplyMomentumLabel,
  withRiskTransitionFact,
  mastSignalLabel,
  pegDeviationFactLabel,
  pegDeviationLabel,
  placementNarrative,
  shipAgeDetailLabel,
  shipAgeLedgerClause,
} from "./detail-model";
import { UNAVAILABLE_SUPPLY_TIDE } from "./supply-tide";
import { buildDetailFactSections } from "../lib/format-detail";
import type { AreaNode, DockNode, GraveNode, LighthouseNode, PharosVilleWorld, PigeonnierNode, ShipNode } from "./world-types";
import { buildPharosVilleWorld } from "./pharosville-world";
import {
  fixtureWithDepegOn,
  fixtureWithoutAsset,
  makePharosVilleWorldInput,
  makeReportCard,
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
      value: "Beam warms amber when active DEWS reaches ALERT, WARNING, or DANGER; Fleet PSI cue (not a per-zone reading).",
    });
    // The beam-is-fleet-wide caveat must survive every copy pass: it is what
    // stops the beacon being read as a per-zone reading.
    expect(lighthouseDetail.summary).toContain("fleet-wide");
    expect(lighthouseDetail.summary).toContain("never in the beam");

    expect(detailForDock({
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum",
      chainId: "ethereum",
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

  it("carries the observatory signal mast as DOM rows", () => {
    const base = {
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 1, y: 1 },
      psiBand: "NORMAL",
      score: 42,
      color: "#ffffff",
      unavailable: false,
      detailId: "lighthouse",
    } as const satisfies Omit<LighthouseNode, "signalMast">;

    const flying = detailForLighthouse({
      ...base,
      signalMast: {
        activeDepegCount: 12,
        pennantCount: 5,
        capped: true,
        stormCone: true,
        worstBps: -620,
        worstSymbol: "XUSD",
        medianDeviationBps: 4,
        coinsAtPeg: 202,
        totalTracked: 214,
        eventsToday: 2,
        unavailable: false,
      },
    } satisfies LighthouseNode);

    expect(flying.facts).toContainEqual({
      label: "Signal mast",
      value: "5 pennants for 12 coins off peg (hoist caps the count); storm cone hoisted",
    });
    expect(flying.facts).toContainEqual({
      label: "Fleet peg",
      value: "Worst XUSD -6.2%; median +4 bps; 202 of 214 at peg; 2 events today",
    });

    const calm = detailForLighthouse({
      ...base,
      signalMast: {
        activeDepegCount: 0,
        pennantCount: 0,
        capped: false,
        stormCone: false,
        worstBps: null,
        worstSymbol: null,
        medianDeviationBps: 1,
        coinsAtPeg: 214,
        totalTracked: 214,
        eventsToday: 0,
        unavailable: false,
      },
    } satisfies LighthouseNode);

    expect(calm.facts).toContainEqual({ label: "Signal mast", value: "Bare — no coin off peg" });

    // No summary is not a calm fleet: the row says the mast has nothing to go
    // on, and the figures row is omitted rather than filled with zeroes.
    const dark = detailForLighthouse(base satisfies LighthouseNode);
    expect(dark.facts).toContainEqual({
      label: "Signal mast",
      value: "Bare — no peg summary tonight",
    });
    expect(dark.facts.some((fact) => fact.label === "Fleet peg")).toBe(false);
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

  it("lists pigeonnier movers as in-world members and compares the exact roost counts", () => {
    const detail = detailForPigeonnier({
      id: "pigeonnier",
      kind: "pigeonnier",
      label: "Pigeonnier",
      tile: { x: 50, y: 50 },
      detailId: "pigeonnier",
      notableMovers: [{
        change24hPctLabel: "+2.1%",
        change24hUsdLabel: "+$4.2M",
        detailId: "ship.alpha",
        id: "alpha",
        riskWaterLabel: "Watch Breakwater",
        symbol: "ALPHA",
      }],
      roost: {
        capped: false,
        comparison: 2,
        eventsToday: 3,
        eventsYesterday: 1,
        visualCount: 3,
      },
    });
    expect(detail.facts).toContainEqual({
      label: "Depeg roost",
      value: "3 today; 1 yesterday (2 more than yesterday)",
    });
    expect(detail.membersHeading).toBe("Today's notable movers");
    expect(detail.members).toContainEqual(expect.objectContaining({
      id: "alpha",
      inWorldDetailId: "ship.alpha",
      label: "ALPHA",
    }));
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

  it("does not infer active global lightning from an area risk band", () => {
    const detail = detailForArea({
      id: "area.dews.danger",
      kind: "area",
      label: "Danger Strait",
      tile: { x: 1, y: 1 },
      band: "DANGER",
      count: 1,
      detailId: "area.dews.danger",
    } satisfies AreaNode);
    const atmosphere = detail.facts.find((fact) => fact.label === "Atmosphere");

    expect(atmosphere?.value).toContain("lightning possible at the fleet storm peak");
    expect(atmosphere?.value).not.toContain("lightning active");
  });

  it("keeps dock members external-only unless an explicit in-world ship detail exists", () => {
    const dock = {
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum",
      chainId: "ethereum",
      tile: { x: 1, y: 1 },
      totalUsd: 300,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 2,
      concentration: null,
      harboredStablecoins: [
        { id: "usdc-circle", symbol: "USDC", share: 2 / 3, supplyUsd: 200 },
        { id: "ust-terra", symbol: "UST", share: 1 / 3, supplyUsd: 100 },
      ],
      detailId: "dock.ethereum",
    } satisfies DockNode;

    const withoutContext = detailForDock(dock);
    expect(withoutContext.members?.map((member) => member.inWorldDetailId)).toEqual([undefined, undefined]);

    const withContext = detailForDock(dock, {
      inWorldDetailIds: new Set(["ship.usdc-circle", "grave.ust-terra"]),
    });
    expect(withContext.members?.[0]).toMatchObject({
      id: "usdc-circle",
      href: "https://pharos.watch/stablecoin/usdc-circle/",
      inWorldDetailId: "ship.usdc-circle",
    });
    expect(withContext.members?.[1]).toMatchObject({
      id: "ust-terra",
      href: "https://pharos.watch/stablecoin/ust-terra/",
    });
    expect(withContext.members?.[1]?.inWorldDetailId).toBeUndefined();
  });

  it("deepens cemetery details with epitaph summary, obituary fact, peak market cap, cause label, and source link", () => {
    const detail = detailForGrave({
      id: "grave.ust-terra",
      kind: "grave",
      label: "TerraUSD",
      entry: {
        id: "ust-terra",
        name: "TerraUSD",
        symbol: "UST",
        pegCurrency: "USD",
        causeOfDeath: "algorithmic-failure",
        deathDate: "2022-05-12",
        peakMcap: 18_770_471_902,
        epitaph: "Anchor yield could not hold the tide.",
        obituary: "The largest stablecoin collapse in history.",
        sourceUrl: "https://example.com/ust-postmortem",
        sourceLabel: "UST postmortem",
      },
      tile: { x: 1, y: 1 },
      visual: { marker: "broken-keel", scale: 1 },
      detailId: "grave.ust-terra",
    } satisfies GraveNode);

    expect(detail.summary).toBe("Anchor yield could not hold the tide.");
    expect(detail.paragraphs).toEqual(["The largest stablecoin collapse in history."]);
    expect(detail.facts).toEqual(expect.arrayContaining([
      { label: "Cause", value: "Algorithmic Failure" },
      { label: "Peak market cap", value: "$18,770,471,902" },
    ]));
    expect(detail.facts.find((fact) => fact.label === "Obituary")).toBeUndefined();
    const sourceLink = detail.links[1] as (typeof detail.links)[number] & { rel?: string };
    expect(detail.links[0]).toEqual({ label: "Cemetery", href: "https://pharos.watch/cemetery/" });
    expect(sourceLink).toMatchObject({
      label: "UST postmortem",
      href: "https://example.com/ust-postmortem",
      target: "_blank",
      rel: "noopener noreferrer",
    });
  });

  it("suppresses missing grave peak market cap", () => {
    const detail = detailForGrave({
      id: "grave.nbt-nubits",
      kind: "grave",
      label: "NuBits",
      entry: {
        id: "nbt-nubits",
        name: "NuBits",
        symbol: "NBT",
        pegCurrency: "USD",
        causeOfDeath: "abandoned",
        deathDate: "2016-06-01",
        epitaph: "A first lesson in reflexive pegs.",
        obituary: "A pioneering cautionary tale.",
        sourceUrl: "https://example.com/nubits",
        sourceLabel: "NuBits writeup",
      },
      tile: { x: 1, y: 1 },
      visual: { marker: "skeletal", scale: 1 },
      detailId: "grave.nbt-nubits",
    } satisfies GraveNode);

    expect(detail.facts.find((fact) => fact.label === "Peak market cap")).toBeUndefined();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>bad</h1>",
  ])("omits unsafe grave source links for %s", (sourceUrl) => {
    const detail = detailForGrave({
      id: "grave.unsafe",
      kind: "grave",
      label: "Unsafe",
      entry: {
        id: "unsafe",
        name: "Unsafe",
        symbol: "BAD",
        pegCurrency: "USD",
        causeOfDeath: "abandoned",
        deathDate: "2026-06-14",
        epitaph: "Unsafe source URL.",
        obituary: "A fixture for source URL validation.",
        sourceUrl,
        sourceLabel: "Unsafe writeup",
      },
      tile: { x: 1, y: 1 },
      visual: { marker: "skeletal", scale: 1 },
      detailId: "grave.unsafe",
    } satisfies GraveNode);

    expect(detail.links).toEqual([
      { label: "Cemetery", href: "https://pharos.watch/cemetery/" },
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
    expect(cue).toContain("Fleet PSI cue (not a per-zone reading)");
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
        hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
        hull: "treasury-galleon",
        classLabel: "CeFi",
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

  it("exposes a Cycle tempo fact with the per-coin flow intensity", () => {
    const ship: import("./world-types").ShipNode & { flowIntensity: number } = {
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
        hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
        hull: "treasury-galleon",
        classLabel: "CeFi",
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
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      flowIntensity: 64,
      detailId: "ship.usdt-tether",
    };
    const detail = detailForShip(ship);
    const tempoFact = detail.facts.find((fact) => fact.label === "Cycle tempo");
    expect(tempoFact).toBeDefined();
    expect(tempoFact).toEqual({
      label: "Cycle tempo",
      value: "Brisk — 64/100 24h mint/redeem flow intensity",
    });
  });

  it("states the ship's own loading direction and largest issuance event", () => {
    const base = buildPharosVilleWorld(makePharosVilleWorldInput()).ships[0]!;
    const detail = detailForShip({ ...base,
      issuance: {
        direction: "minting",
        flowIntensity: 72,
        netFlow24hUsd: 8_000_000,
        largestEvent24h: { amountUsd: 5_000_000, direction: "mint", timestamp: 1 },
      },
    });
    expect(detail.facts).toContainEqual({
      label: "Issuance work, 24h",
      value: "+$8.0M net minted — loading cargo and riding deeper; flow intensity 72/100; largest event mint $5.0M",
    });
    const { issuance: _issuance, ...withoutIssuance } = base;
    expect(detailForShip(withoutIssuance).facts).toContainEqual({
      label: "Issuance work, 24h",
      value: "Unavailable — neutral draft; no per-coin mint/redeem row",
    });
  });

  it("computes Cycle tempo from each coin's flow intensity regardless of fleet context", () => {
    const baseShip: import("./world-types").ShipNode & { flowIntensity: number } = {
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
        hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
        hull: "treasury-galleon",
        classLabel: "CeFi",
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
        overlay: "none",
        sizeTier: "major",
        sizeLabel: "Major",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      flowIntensity: 0,
      detailId: "ship.base",
    };
    const ships = [
      { ...baseShip, id: "q0", detailId: "ship.q0", marketCapUsd: 1_000, flowIntensity: 0 },
      { ...baseShip, id: "q1", detailId: "ship.q1", marketCapUsd: 10_000, flowIntensity: 25 },
      { ...baseShip, id: "q2", detailId: "ship.q2", marketCapUsd: 100_000, flowIntensity: -50 },
      { ...baseShip, id: "q3", detailId: "ship.q3", marketCapUsd: 1_000_000, flowIntensity: 100 },
    ];
    const tempoLabels = ships.map((ship) => {
      const detail = detailForShip(ship, { allShips: ships });
      const fact = detail.facts.find((f) => f.label === "Cycle tempo");
      return fact?.value;
    });
    expect(tempoLabels).toEqual([
      "Languid — 0/100 24h mint/redeem flow intensity",
      "Steady — 25/100 24h mint/redeem flow intensity",
      "Brisk — 50/100 24h mint/redeem flow intensity",
      "Active — 100/100 24h mint/redeem flow intensity",
    ]);
    const detailWithoutContext = detailForShip(ships[3]!);
    const tempoWithoutContext = detailWithoutContext.facts.find((f) => f.label === "Cycle tempo");
    expect(tempoWithoutContext?.value).toBe("Active — 100/100 24h mint/redeem flow intensity");
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
        hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
        hull: "treasury-galleon",
        classLabel: "CeFi",
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
      { label: "Chain footprint", value: "Single-chain footprint; 1 positive chain deployment, 1 rendered dock stop" },
      { label: "Route source", value: "stablecoins.chainCirculating, pegSummary.coins[], stress.signals[]" },
      { label: "Evidence", value: "meta.flags.navToken, pegSummary.coins[]" },
    ]));
  });
});

describe("W6.4 — lighthouse lamp status parity", () => {
  it("states freshness, stale feeds, and API outage with an as-of time", () => {
    expect(lighthouseLampStatusLabel({}, Date.UTC(2026, 7, 13, 14, 32))).toBe(
      "steady — all feeds fresh as of 14:32",
    );
    expect(lighthouseLampStatusLabel({ pegSummaryStale: true }, Date.UTC(2026, 7, 13, 14, 32))).toBe(
      "cooler and slower — some feeds stale as of 14:32",
    );
    expect(lighthouseLampStatusLabel({
      stablecoinsStale: true,
      chainsStale: true,
      stabilityStale: true,
      pegSummaryStale: true,
      stressStale: true,
      reportCardsStale: true,
      mintBurnStale: true,
    }, Date.UTC(2026, 7, 13, 14, 32))).toBe(
      "dimmed — API unreachable; showing last-good data as of 14:32",
    );
  });

  it("puts Harbor light beside the existing PSI rows", () => {
    const detail = detailForLighthouse({
      id: "lighthouse",
      kind: "lighthouse",
      label: "Pharos lighthouse",
      tile: { x: 1, y: 1 },
      psiBand: "STEADY",
      score: 88,
      color: "#ffffff",
      unavailable: false,
      detailId: "lighthouse",
    }, undefined, undefined, { chainsStale: true }, Date.UTC(2026, 7, 13, 14, 32));

    expect(detail.facts).toContainEqual({
      label: "Harbor light",
      value: "cooler and slower — some feeds stale as of 14:32",
    });
    expect(detail.facts.some((fact) => fact.label === "Band")).toBe(true);
  });
});

describe("detail-model unique tier surfacing", () => {
  it("names the quay masonry condition from the full chain-health decomposition", () => {
    expect(quayMasonryLabel({
      healthFactors: {
        backingDiversity: 0.1,
        chainEnvironment: 0.2,
        concentration: 0.9,
        pegStability: 0.3,
        quality: 0.2,
      },
    })).toContain("cracked stone and a leaning bollard");
  });

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
        hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
        hull: "dao-schooner",
        ...(overrides.uniqueRationale ? { uniqueRationale: overrides.uniqueRationale } : {}),
        classLabel: "DeFi",
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
  it("surfaces launch/tracking age and the neutral failure state in parity text", () => {
    const world = buildPharosVilleWorld(makerSquadFixtureInputs());
    const ship = world.ships[0]!;
    const veteran = {
      ...ship,
      age: {
        ageDays: 2_900,
        era: "veteran" as const,
        patina: 0.8,
        serviceSince: "2018-09-26",
        source: "launch-date" as const,
        trackingSpanDays: 730,
      },
    };
    expect(shipAgeDetailLabel(veteran)).toBe(
      "2018-09-26; tracked 730 days; veteran hull",
    );
    expect(shipAgeLedgerClause(veteran)).toBe(
      "age patina 2018-09-26; tracked 730 days; veteran hull",
    );
    expect(detailForShip(veteran).facts).toContainEqual({
      label: "In service since / tracked",
      value: "2018-09-26; tracked 730 days; veteran hull",
    });

    const neutral = { ...ship, age: undefined } as ShipNode & { age?: undefined };
    expect(shipAgeDetailLabel(neutral)).toBe(
      "Unavailable — neutral finish; no launch or tracking history",
    );
  });

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
        hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
        hull: "treasury-galleon",
        classLabel: "CeFi",
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

    it("rounds before choosing the sign so tiny negatives do not render as negative zero", () => {
      const ship = baseShipNode({ change24hPct: -0.04 });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "24h supply change");
      expect(fact).toBeDefined();
      expect(fact!.value).toBe("0.0%");
    });

    it("shows em-dash when change24hPct is null", () => {
      const ship = baseShipNode({ change24hPct: null });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "24h supply change");
      expect(fact).toBeDefined();
      expect(fact!.value).toBe("—");
    });
  });

  describe("E3 — chain footprint extended dwell label", () => {
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
      const fact = detail.facts.find((f) => f.label === "Chain footprint");
      expect(fact).toBeDefined();
      expect(fact!.value).toContain("Broad footprint");
      expect(fact!.value).toContain("(extended dwell)");
    });

    it("does not append (extended dwell) when chainPresence.length < 4", () => {
      const ship = baseShipNode({
        chainPresence: [
          { chainId: "ethereum", currentUsd: 100, hasRenderedDock: true, share: 1 },
        ],
      });
      const detail = detailForShip(ship);
      const fact = detail.facts.find((f) => f.label === "Chain footprint");
      expect(fact).toBeDefined();
      expect(fact!.value).not.toContain("(extended dwell)");
    });
  });

  describe("T5 — fleet-relative market context", () => {
    it("labels rank and fleet share while suppressing singletons and dust shares", () => {
      const large = baseShipNode({ id: "large", marketCapUsd: 990 });
      const small = baseShipNode({ id: "small", marketCapUsd: 10 });
      const dust = baseShipNode({ id: "dust", marketCapUsd: 0.5 });

      expect(fleetRankLabel(1, 3)).toBe("#1 of 3");
      expect(fleetRankLabel(1, 1)).toBeNull();
      expect(shareOfFleetLabel(large, [large, small])).toBe("99% of fleet");
      expect(shareOfFleetLabel(large, [large])).toBeNull();
      expect(shareOfFleetLabel(dust, [large, dust])).toBeNull();
    });

    it("detailForShip emits fleet rank and share facts when context supplies rank", () => {
      const large = baseShipNode({ id: "large", marketCapUsd: 990 });
      const small = baseShipNode({ id: "small", marketCapUsd: 10 });
      const detail = detailForShip(large, {
        allShips: [large, small],
        fleetRank: { rank: 1, total: 2 },
      });

      expect(detail.facts).toEqual(expect.arrayContaining([
        { label: "Fleet rank", value: "#1 of 2" },
        { label: "Share of fleet", value: "99% of fleet" },
      ]));
    });
  });

  describe("v0.3.0 — peg deviation, mast signals, observatory voice", () => {
    it("formats the live signed peg deviation against its peg currency", () => {
      expect(pegDeviationLabel({ pegDeviationBps: -12.4, pegCurrency: "USD" })).toBe("-12 bps vs USD");
      expect(pegDeviationLabel({ pegDeviationBps: 3, pegCurrency: null })).toBe("+3 bps vs peg");
      expect(pegDeviationLabel({ pegDeviationBps: 0, pegCurrency: "USD" })).toBe("0 bps vs USD");
      expect(pegDeviationLabel({ pegDeviationBps: null, pegCurrency: "USD" })).toBeNull();
    });

    it("says which WAY the coin is off peg, not just how far (Tier 3 #13)", () => {
      const level = { hullForm: { beam: 1, height: 1, length: 1, waterline: 0 } } as ShipNode["visual"];
      expect(pegDeviationFactLabel({ pegDeviationBps: 12, pegCurrency: "USD", visual: level }))
        .toBe("+12 bps vs USD — above peg");
      expect(pegDeviationFactLabel({ pegDeviationBps: -12, pegCurrency: "USD", visual: level }))
        .toBe("-12 bps vs USD — below peg");
      expect(pegDeviationFactLabel({ pegDeviationBps: 0, pegCurrency: "USD", visual: level }))
        .toBe("0 bps vs USD — at peg");
      expect(pegDeviationFactLabel({ pegDeviationBps: null, pegCurrency: "USD", visual: level }))
        .toBeNull();
    });

    it("reads the trim clause off the hull, so a level ship never claims one", () => {
      const withTrim = (waterline: number): ShipNode["visual"] => (
        { hullForm: { beam: 1, height: 1, length: 1, waterline } } as ShipNode["visual"]
      );
      expect(pegDeviationFactLabel({ pegDeviationBps: 260, pegCurrency: "USD", visual: withTrim(0.16) }))
        .toBe("+260 bps vs USD — above peg; hull rides high");
      expect(pegDeviationFactLabel({ pegDeviationBps: -260, pegCurrency: "USD", visual: withTrim(-0.16) }))
        .toBe("-260 bps vs USD — below peg; hull rides low");
      // A stale peg row leaves the hull level; the row must then report the
      // reading without claiming a trim the canvas is not drawing.
      expect(pegDeviationFactLabel({ pegDeviationBps: -260, pegCurrency: "USD", visual: withTrim(0) }))
        .toBe("-260 bps vs USD — below peg");
    });

    it("explains nav and yield mast signals, exclusive with none", () => {
      expect(mastSignalLabel({ visual: { overlay: "nav" } } as ShipNode)).toContain("NAV-priced");
      expect(mastSignalLabel({ visual: { overlay: "yield" } } as ShipNode)).toContain("Yield-bearing");
      expect(mastSignalLabel({ visual: { overlay: "watch" } } as ShipNode)).toBeNull();
      expect(mastSignalLabel({ visual: { overlay: "none" } } as ShipNode)).toBeNull();
    });

    it("tells placement stories in the observatory voice with a raw-reason fallback", () => {
      expect(placementNarrative("Active depeg event")).toContain("storm water");
      expect(placementNarrative("No active peg or DEWS stress")).toContain("Sailing clean");
      expect(placementNarrative("Some future reason")).toBe("Some future reason");
    });
  });

  describe("T6 — lighthouse PSI explanatory rows", () => {
    it("builds observational trend and composition labels plus contributor members", () => {
      const lighthouse = {
        id: "lighthouse",
        kind: "lighthouse",
        label: "Pharos lighthouse",
        tile: { x: 1, y: 1 },
        psiBand: "TREMOR",
        score: 72,
        color: "#ffffff",
        unavailable: false,
        detailId: "lighthouse",
        components: { severity: 0.7, breadth: 0.3, trend: 0.05 },
        avg24h: 68,
        avg24hBand: "FRACTURE",
        contributors: [{ id: "usdt-tether", symbol: "USDT", bps: -12, mcapUsd: 90_000_000_000 }],
      } satisfies LighthouseNode;

      expect(psiTrendLabel(lighthouse)).toContain("Observed 24h drift improving");
      expect(psiCompositionLabel(lighthouse)).toContain("severity 70%");
      const detail = detailForLighthouse(lighthouse);
      expect(detail.facts).toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Trend" }),
        expect.objectContaining({ label: "Composition" }),
      ]));
      expect(detail.membersHeading).toBe("Top PSI contributors");
      expect(detail.members?.[0]).toMatchObject({
        href: "https://pharos.watch/stablecoin/usdt-tether/",
        label: "USDT -12 bps",
        value: "$90.0B",
      });
    });

    it("formats decimal PSI scores consistently in the score fact", () => {
      const detail = detailForLighthouse({
        id: "lighthouse",
        kind: "lighthouse",
        label: "Pharos lighthouse",
        tile: { x: 1, y: 1 },
        psiBand: "WARNING",
        score: 72.25,
        color: "#ffffff",
        unavailable: false,
        detailId: "lighthouse",
      } satisfies LighthouseNode);

      expect(detail.facts.find((fact) => fact.label === "Score")?.value).toBe("72.3");
    });

    describe("Flight to quality row", () => {
      const lighthouse = {
        id: "lighthouse",
        kind: "lighthouse",
        label: "Pharos lighthouse",
        tile: { x: 1, y: 1 },
        psiBand: "CALM",
        score: 91,
        color: "#ffffff",
        unavailable: false,
        detailId: "lighthouse",
      } satisfies LighthouseNode;

      const issuance = (
        overrides: Partial<NonNullable<PharosVilleWorld["fleetIssuance"]>>,
      ): NonNullable<PharosVilleWorld["fleetIssuance"]> => ({
        activeCoins: 36,
        band: "NEUTRAL",
        burnVolumeUsd: 4_000_000,
        direction: "burning",
        flightIntensity: 0,
        flightToQuality: false,
        mintVolumeUsd: 1_000_000,
        netFlowUsd: -3_000_000,
        scopeChainIds: ["ethereum"],
        scopeLabel: "Configured issuance chains",
        score: -7.4,
        trackedCoins: 130,
        ...overrides,
      });

      it("names the tenders and quotes the intensity when the gauge reports flight", () => {
        const label = flightToQualityLabel(issuance({ flightIntensity: 42, flightToQuality: true }));
        expect(label).toContain("Active");
        expect(label).toContain("intensity 42 of 100");
        expect(label).toContain("tenders");

        const facts = detailForLighthouse(
          lighthouse,
          undefined,
          issuance({ flightIntensity: 42, flightToQuality: true }),
        ).facts;
        expect(facts).toEqual(expect.arrayContaining([
          expect.objectContaining({ label: "Flight to quality" }),
        ]));
      });

      it("separates 'no flight' from 'no gauge', which an empty sea cannot", () => {
        // The canvas draws nothing in both cases, so the row carries the whole
        // distinction: it reads plainly for one and is absent for the other.
        expect(flightToQualityLabel(issuance({}))).toBe("None reported — no tenders on the water");
        expect(flightToQualityLabel(null)).toBeNull();
        expect(flightToQualityLabel(undefined)).toBeNull();
        expect(detailForLighthouse(lighthouse, undefined, null).facts
          .some((fact) => fact.label === "Flight to quality")).toBe(false);
      });
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
    expect(depegHistoryLabel({ eventCount: 1, worstDeviationBps: 900, lastEventAt: null }))
      .toBe("1 event on record; worst +9.0%");
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

// P3 metaphor quick-wins: price signal, source consensus, audit shield, dock
// backing diversity.
describe("detail-model P3 metaphor quick-win signals", () => {
  function signalShipNode(overrides: Partial<ShipNode> = {}): ShipNode {
    return {
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
      marketCapUsd: 1_000_000_000,
      riskPlacement: "safe-harbor",
      riskZone: "calm",
      riskWaterLabel: "Calm Anchorage",
      placementEvidence: { reason: "Fresh", sourceFields: [], stale: false },
      visual: {
        hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
        hull: "treasury-galleon",
        classLabel: "CeFi",
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
        overlay: "none",
        sizeTier: "titan",
        sizeLabel: "Titan class",
        scale: 1,
      },
      change24hUsd: null,
      change24hPct: null,
      detailId: "ship.usdt-tether",
      ...overrides,
    };
  }

  it("priceSignalSeverity is zero for healthy or absent confidence and escalates per degraded tier", () => {
    expect(priceSignalSeverity(null)).toBe(0);
    expect(priceSignalSeverity(undefined)).toBe(0);
    expect(priceSignalSeverity({ priceConfidence: null })).toBe(0);
    expect(priceSignalSeverity({ priceConfidence: "high" })).toBe(0);
    const singleSource = priceSignalSeverity({ priceConfidence: "single-source" });
    const low = priceSignalSeverity({ priceConfidence: "low" });
    const fallback = priceSignalSeverity({ priceConfidence: "fallback" });
    expect(singleSource).toBeGreaterThan(0);
    expect(low).toBeGreaterThan(singleSource);
    expect(fallback).toBeGreaterThan(low);
    expect(fallback).toBe(1);
  });

  it("priceConfidenceLabel describes only degraded feeds", () => {
    expect(priceConfidenceLabel({ priceConfidence: "high" })).toBeNull();
    expect(priceConfidenceLabel({ priceConfidence: null })).toBeNull();
    expect(priceConfidenceLabel({ priceConfidence: "single-source" })).toBe("Single-source price feed");
    expect(priceConfidenceLabel({ priceConfidence: "low" })).toBe("Low-confidence price feed");
    expect(priceConfidenceLabel({ priceConfidence: "fallback" })).toBe("Fallback price feed");
  });

  it("sourceConsensusRatio returns counts and a clamped ratio, null without consensus data", () => {
    expect(sourceConsensusRatio(null)).toBeNull();
    expect(sourceConsensusRatio({ consensusSources: [], agreeSources: [] })).toBeNull();
    expect(sourceConsensusRatio({ consensusSources: ["a", "b", "c"], agreeSources: ["a", "b"] }))
      .toEqual({ agree: 2, total: 3, ratio: 2 / 3 });
    // agree ⊆ consensus upstream; a malformed payload must not exceed 1.
    expect(sourceConsensusRatio({ consensusSources: ["a"], agreeSources: ["a", "b"] }))
      .toEqual({ agree: 1, total: 1, ratio: 1 });
  });

  it("sourceConsensusLabel stays silent at full agreement", () => {
    expect(sourceConsensusLabel({ consensusSources: ["a", "b", "c"], agreeSources: ["a", "b", "c"] })).toBeNull();
    expect(sourceConsensusLabel({ consensusSources: [], agreeSources: [] })).toBeNull();
    expect(sourceConsensusLabel({ consensusSources: ["a", "b", "c"], agreeSources: ["a", "b"] }))
      .toBe("2 of 3 price sources agree");
  });

  it("auditShieldState gates on heritage tiers and a Bluechip grade", () => {
    const card = makeReportCard({ id: "usdt-tether", symbol: "USDT" });
    expect(auditShieldState(card, "titan")).toEqual({ grade: "A" });
    expect(auditShieldState(card, "unique")).toEqual({ grade: "A" });
    expect(auditShieldState(card, "major")).toBeNull();
    expect(auditShieldState(null, "titan")).toBeNull();
    expect(auditShieldState({ ...card, rawInputs: { ...card.rawInputs, bluechipGrade: null } }, "titan")).toBeNull();
  });

  it("auditShieldLabel mirrors the shield gate", () => {
    const card = makeReportCard({ id: "usdt-tether", symbol: "USDT" });
    expect(auditShieldLabel(card, "titan")).toBe("Bluechip A");
    expect(auditShieldLabel(card, "major")).toBeNull();
    expect(auditShieldLabel(null, "unique")).toBeNull();
  });

  it("reportCardSafetyLabel emits grade and rounded score but suppresses null and NR cards", () => {
    expect(reportCardSafetyLabel(null)).toBeNull();
    expect(reportCardSafetyLabel(makeReportCard({
      id: "usdt-tether",
      symbol: "USDT",
      overallGrade: "B+",
      overallScore: 78.4,
    }))).toBe("Safety B+ (score 78)");
    expect(reportCardSafetyLabel(makeReportCard({
      id: "usdt-tether",
      symbol: "USDT",
      overallGrade: "C",
      overallScore: null,
    }))).toBe("Safety C");
    expect(reportCardSafetyLabel(makeReportCard({
      id: "usdt-tether",
      symbol: "USDT",
      overallGrade: "NR",
      overallScore: null,
    }))).toBeNull();
  });

  it("detailForShip inserts Safety grade immediately after Cycle tempo and suppresses NR", () => {
    const card = makeReportCard({
      id: "usdt-tether",
      symbol: "USDT",
      overallGrade: "D",
      overallScore: 48,
    });
    const detail = detailForShip(signalShipNode({ reportCard: card }));
    const cycleIndex = detail.facts.findIndex((fact) => fact.label === "Cycle tempo");
    expect(detail.facts[cycleIndex + 1]).toEqual({ label: "Safety grade", value: "Safety D (score 48)" });

    const nrDetail = detailForShip(signalShipNode({
      reportCard: makeReportCard({
        id: "usdt-tether",
        symbol: "USDT",
        overallGrade: "NR",
        overallScore: null,
      }),
    }));
    expect(nrDetail.facts.find((fact) => fact.label === "Safety grade")).toBeUndefined();
  });

  it("surfaces all five report-card seaworthiness dimensions as detail rows", () => {
    const detail = detailForShip(signalShipNode({
      reportCard: makeReportCard({ id: "usdt-tether", symbol: "USDT" }),
    }));

    expect(detail.facts).toEqual(expect.arrayContaining([
      { label: "Peg stability", value: "A (95/100) — fixture" },
      { label: "Liquidity", value: "A (90/100) — fixture" },
      { label: "Resilience", value: "A (90/100) — fixture" },
      { label: "Decentralization", value: "B (80/100) — fixture" },
      { label: "Dependency risk", value: "A (90/100) — fixture" },
    ]));
  });

  it("surfaces redemption, collateral, and customs fittings as report-card facts", () => {
    const detail = detailForShip(signalShipNode({
      fittings: {
        blacklistStatus: true,
        collateralCargo: "sealed",
        collateralQuality: "rwa",
        redemptionCapacityRatio: 0.8,
      },
    }));
    expect(detail.facts).toEqual(expect.arrayContaining([
      { label: "Redemption fitting", value: expect.stringContaining("lifeboats swung fully out") },
      { label: "Collateral cargo", value: expect.stringContaining("sealed treasury chests") },
      { label: "Customs authority", value: expect.stringContaining("customs brand at the plimsoll mark") },
    ]));
  });

  it("detailForShip surfaces price confidence and source consensus only when degraded", () => {
    const degraded = detailForShip(signalShipNode({
      asset: {
        priceConfidence: "low",
        consensusSources: ["a", "b", "c"],
        agreeSources: ["a", "b"],
      } as ShipNode["asset"],
    }));
    expect(degraded.facts).toContainEqual({ label: "Price confidence", value: "Low-confidence price feed" });
    expect(degraded.facts).toContainEqual({ label: "Source consensus", value: "2 of 3 price sources agree" });

    const healthy = detailForShip(signalShipNode({
      asset: {
        priceConfidence: "high",
        consensusSources: ["a", "b"],
        agreeSources: ["a", "b"],
      } as ShipNode["asset"],
    }));
    expect(healthy.facts.find((fact) => fact.label === "Price confidence")).toBeUndefined();
    expect(healthy.facts.find((fact) => fact.label === "Source consensus")).toBeUndefined();
  });

  it("detailForShip surfaces the Bluechip audit fact for heritage tiers only", () => {
    const card = makeReportCard({ id: "usdt-tether", symbol: "USDT" });
    const titan = detailForShip(signalShipNode({ reportCard: card }));
    expect(titan.facts).toContainEqual({ label: "Bluechip audit", value: "Bluechip A" });

    const major = detailForShip(signalShipNode({
      reportCard: card,
      visual: { ...signalShipNode().visual, sizeTier: "major", sizeLabel: "Major" },
    }));
    expect(major.facts.find((fact) => fact.label === "Bluechip audit")).toBeUndefined();
  });

  it("backingDiversitySeverity is zero at or above the healthy floor and rises below it", () => {
    expect(backingDiversitySeverity(null)).toBe(0);
    expect(backingDiversitySeverity(undefined)).toBe(0);
    expect(backingDiversitySeverity(0.7)).toBe(0);
    expect(backingDiversitySeverity(0.5)).toBe(0);
    expect(backingDiversitySeverity(0.25)).toBeCloseTo(0.5);
    expect(backingDiversitySeverity(0)).toBe(1);
  });

  it("backingDiversityLabel wording follows the shared severity", () => {
    expect(backingDiversityLabel(null)).toBeNull();
    expect(backingDiversityLabel(0.7)).toBe("70% diversified");
    expect(backingDiversityLabel(0.3)).toBe("30% narrowing");
    expect(backingDiversityLabel(0.1)).toBe("10% concentrated");
  });

  it("detailForDock surfaces Backing diversity only when the chain reports the factor", () => {
    const dockNode: DockNode = {
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum",
      chainId: "ethereum",
      tile: { x: 1, y: 1 },
      totalUsd: 100,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 1,
      concentration: null,
      backingDiversity: 0.7,
      harboredStablecoins: [],
      detailId: "dock.ethereum",
    };
    expect(detailForDock(dockNode).facts).toContainEqual({ label: "Backing diversity", value: "70% diversified" });

    const withoutFactor = detailForDock({ ...dockNode, backingDiversity: null });
    expect(withoutFactor.facts.find((fact) => fact.label === "Backing diversity")).toBeUndefined();
  });

  it("detailForDock reports whether the harbour is filling or draining (Tier 3 #13)", () => {
    const dockNode: DockNode = {
      id: "dock.solana",
      kind: "dock",
      label: "Solana",
      chainId: "solana",
      tile: { x: 2, y: 2 },
      totalUsd: 100,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 1,
      concentration: null,
      change24hPct: 2.42,
      change7dPct: -5,
      harboredStablecoins: [],
      detailId: "dock.solana",
    };
    const facts = detailForDock(dockNode).facts;
    // "held supply" is load bearing: the Net flow 24h row beside this one counts
    // issuance, and the two readings can point opposite ways.
    expect(facts).toContainEqual({ label: "24h supply change", value: "+2.4% held supply" });
    expect(facts).toContainEqual({ label: "Supply momentum", value: "7d -5.0%" });

    // One row, not two, once the panel's fact sections fold them.
    const sections = buildDetailFactSections(facts);
    expect(sections.identity).toContainEqual({
      key: "cycle24h",
      label: "24h change",
      value: "+2.4% held supply · 7d -5.0%",
    });
  });

  it("says nothing about a harbour whose chain reported no supply change", () => {
    const dockNode: DockNode = {
      id: "dock.tron",
      kind: "dock",
      label: "Tron",
      chainId: "tron",
      tile: { x: 3, y: 3 },
      totalUsd: 100,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 1,
      concentration: null,
      change24hPct: null,
      change7dPct: null,
      harboredStablecoins: [],
      detailId: "dock.tron",
    };
    const labels = detailForDock(dockNode).facts.map((fact) => fact.label);
    expect(labels).not.toContain("24h supply change");
    expect(labels).not.toContain("Supply momentum");
  });

  it("supplyTideLabel names the direction and keeps enough precision to be useful", () => {
    // Two decimals, not one: a ~$330B float moves in hundredths of a percent, and
    // one decimal would round most real weeks to a meaningless "0.0%".
    expect(supplyTideLabel({ change7dPct: 0.0187, offset: 0.1, state: "flood" }))
      .toBe("+0.02% rising — supply grew this week");
    expect(supplyTideLabel({ change7dPct: -0.92, offset: -0.68, state: "ebb" }))
      .toBe("-0.92% falling — supply shrank this week");
    expect(supplyTideLabel({ change7dPct: 0.004, offset: 0, state: "slack" }))
      .toBe("+0.00% slack — supply held flat this week");
  });

  it("supplyTideLabel omits the row entirely rather than reporting a flat tide it never measured", () => {
    expect(supplyTideLabel(UNAVAILABLE_SUPPLY_TIDE)).toBeNull();
    expect(supplyTideLabel(undefined)).toBeNull();
  });

  it("cargoTideLabel names the direction outright rather than leaving it to a sign", () => {
    const base = {
      burnVolumeUsd: 2_000_000,
      coinCount: 1,
      mintVolumeUsd: 10_000_000,
      pressureScore: 66,
      reason: "tracked" as const,
      tracked: true,
    };
    expect(cargoTideLabel({ ...base, direction: "minting", netFlowUsd: 8_000_000 }))
      .toBe("+$8.0M minting — mint $10.0M, burn $2.0M");
    expect(cargoTideLabel({ ...base, direction: "burning", netFlowUsd: -8_000_000 }))
      .toBe("-$8.0M burning — mint $10.0M, burn $2.0M");
  });

  it("cargoTideLabel keeps a balanced quay, an idle one, and an unmeasured one apart", () => {
    const base = { coinCount: 0, pressureScore: null, reason: "tracked" as const, tracked: true };
    expect(cargoTideLabel({ ...base, direction: "flat", netFlowUsd: 0, mintVolumeUsd: 4_000_000, burnVolumeUsd: 4_000_000 }))
      .toBe("Balanced — mint $4.0M, burn $4.0M");
    expect(cargoTideLabel({ ...base, direction: "inactive", netFlowUsd: 0, mintVolumeUsd: 0, burnVolumeUsd: 0 }))
      .toBe("No issuance activity in 24h");
    expect(cargoTideLabel({
      burnVolumeUsd: 0,
      coinCount: 0,
      direction: "inactive",
      mintVolumeUsd: 0,
      netFlowUsd: 0,
      pressureScore: null,
      reason: "chain-not-in-scope",
      tracked: false,
    })).toBe("Not measured on this chain");
    expect(cargoTideLabel(undefined)).toBeNull();
  });

  it("cargoTideLabel says so when a quay's silence could not be verified", () => {
    // An in-scope harbour that received no allocation while the payload carried
    // issuance the fleet could not place. Its reading must not be the same
    // sentence as an observed quiet day.
    const label = cargoTideLabel({
      burnVolumeUsd: 0,
      coinCount: 0,
      direction: "inactive",
      mintVolumeUsd: 0,
      netFlowUsd: 0,
      pressureScore: null,
      reason: "unattributed",
      tracked: false,
    });
    expect(label).toBe("Unavailable — 24h issuance could not be matched to this harbor's coins");
    expect(label).not.toBe("No issuance activity in 24h");
  });

  it("detailForDock surfaces Net flow 24h only when the harbour carries a tide", () => {
    const dockNode: DockNode = {
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum",
      chainId: "ethereum",
      tile: { x: 1, y: 1 },
      totalUsd: 100,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 1,
      concentration: null,
      cargoTide: {
        burnVolumeUsd: 2_000_000,
        coinCount: 1,
        direction: "minting",
        mintVolumeUsd: 10_000_000,
        netFlowUsd: 8_000_000,
        pressureScore: 66,
        reason: "tracked",
        tracked: true,
      },
      harboredStablecoins: [],
      detailId: "dock.ethereum",
    };
    expect(detailForDock(dockNode).facts).toContainEqual({
      label: "Net flow 24h",
      value: "+$8.0M minting — mint $10.0M, burn $2.0M",
    });

    const { cargoTide: _cargoTide, ...withoutTide } = dockNode;
    expect(detailForDock(withoutTide).facts.find((fact) => fact.label === "Net flow 24h"))
      .toBeUndefined();
  });

  it("surfaces stress drivers only when a ship has a material stress breakdown", () => {
    expect(stressBreakdownLabel(signalShipNode())).toBeNull();
    const detail = detailForShip(signalShipNode({
      stressBreakdown: { signals: ["peg deviation", "liquidity depth"], contagionActive: true },
    }));

    expect(stressBreakdownLabel({
      stressBreakdown: { signals: ["peg deviation"], contagionActive: true },
    })).toBe("Driven by: peg deviation; contagion amplifier active");
    expect(detail.facts).toContainEqual({
      label: "Stress driver",
      value: "Driven by: peg deviation; liquidity depth; contagion amplifier active",
    });
  });

  it("formats rendered harbor rank, global supply share, and concentration for docks", () => {
    expect(harborRankLabel(2, 9)).toBe("#2 of 9 rendered harbors");
    expect(harborRankLabel(10, 9)).toBeNull();
    expect(stablecoinSupplyShareLabel(0.1234)).toBe("12.3% of stablecoin supply");
    expect(stablecoinSupplyShareLabel(0)).toBeNull();
    expect(dockConcentrationLabel(0.2)).toBe("diversified (HHI 0.20)");
    expect(dockConcentrationLabel(0.4)).toBe("moderately concentrated (HHI 0.40)");
    expect(dockConcentrationLabel(0.7)).toBe("concentrated (HHI 0.70)");

    const detail = detailForDock({
      id: "dock.ethereum",
      kind: "dock",
      label: "Ethereum",
      chainId: "ethereum",
      tile: { x: 1, y: 1 },
      totalUsd: 100,
      size: 1,
      healthBand: "healthy",
      stablecoinCount: 1,
      concentration: 0.4,
      harborRank: 2,
      harborCount: 9,
      shareOfGlobal: 0.1234,
      harboredStablecoins: [],
      detailId: "dock.ethereum",
    } satisfies DockNode);

    expect(detail.facts).toEqual(expect.arrayContaining([
      { label: "Harbor rank", value: "#2 of 9 rendered harbors" },
      { label: "Share of stablecoin supply", value: "12.3% of stablecoin supply" },
      { label: "Concentration", value: "moderately concentrated (HHI 0.40)" },
    ]));
  });
});

// Round-two metaphor items: the cross-bearing buoy (3b), the lighthouse
// high-water mark (3c), and the beam's dwell on the largest contributor (3d).
describe("detail-model round-two metaphor signals", () => {
  const lighthouse = (overrides: Partial<LighthouseNode> = {}): LighthouseNode => ({
    id: "lighthouse",
    kind: "lighthouse",
    label: "Pharos lighthouse",
    tile: { x: 1, y: 1 },
    psiBand: "STEADY",
    score: 68,
    color: "#ffffff",
    unavailable: false,
    detailId: "lighthouse",
    ...overrides,
  });

  const crossCheck = (
    overrides: Partial<NonNullable<ShipNode["dexCrossCheck"]>> = {},
  ): NonNullable<ShipNode["dexCrossCheck"]> => ({
    dexPrice: 0.9912,
    dexDeviationBps: -88,
    oraclePrice: 0.9998,
    oracleDeviationBps: -2,
    agrees: false,
    sourcePools: 4,
    sourceTvlUsd: 12_300_000,
    ...overrides,
  });

  describe("3b — DEX cross-check", () => {
    it("says nothing at all when no check ran", () => {
      // The absent case is load bearing: silence must never read as agreement,
      // and silence is the normal state for most of the fleet.
      expect(dexCrossCheckLabel(undefined)).toBeNull();
    });

    it("carries both prices, both deviations, and the pool evidence", () => {
      const label = dexCrossCheckLabel(crossCheck())!;

      expect(label).toContain("Bearings cross");
      expect(label).toContain("DEX $0.9912 (-88 bps)");
      expect(label).toContain("feed $0.9998 (-2 bps)");
      // A disagreement drawn from one thin pool is a different thing from one
      // drawn from four deep ones, so the evidence travels with the claim.
      expect(label).toContain("4 pools, $12.3M TVL");
    });

    it("names agreement as agreement, without hedging it into a warning", () => {
      expect(dexCrossCheckLabel(crossCheck({ agrees: true }))).toContain("Both bearings agree");
    });

    it("reports the DEX bearing alone when the feed carries no price", () => {
      const label = dexCrossCheckLabel(crossCheck({ oraclePrice: null, oracleDeviationBps: null }))!;

      expect(label).toContain("DEX $0.9912");
      expect(label).not.toContain("feed");
    });

    it("spends a ship panel row only on a disagreement", () => {
      const ship = (check: ShipNode["dexCrossCheck"]): ShipNode =>
        ({ ...crossBearingShip(), ...(check ? { dexCrossCheck: check } : {}) });

      const crossed = detailForShip(ship(crossCheck())).facts
        .filter((fact) => fact.label === "DEX cross-check");
      expect(crossed).toHaveLength(1);
      expect(crossed[0]!.value).toContain("Bearings cross");

      // Agreement is the fleet's normal state; a row for it would land on
      // nearly every ship and buy nothing. The ledger carries that case.
      expect(detailForShip(ship(crossCheck({ agrees: true }))).facts
        .some((fact) => fact.label === "DEX cross-check")).toBe(false);
      expect(detailForShip(ship(undefined)).facts
        .some((fact) => fact.label === "DEX cross-check")).toBe(false);
    });
  });

  describe("3c — high-water mark", () => {
    it("distinguishes an unstained rock from a rock nothing was read for", () => {
      const bedrock = highWaterMarkLabel({
        band: "BEDROCK",
        severity: 0,
        score: 82,
        at: Date.UTC(2026, 6, 4),
        sampleCount: 30,
        spanDays: 29,
        unavailable: false,
      });
      expect(bedrock).toContain("never rose past the footing");
      expect(bedrock).toContain("29 days on record");

      const missing = highWaterMarkLabel(undefined);
      expect(missing).toContain("no index history to read");
      // The evidence claim and the record claim must never share a sentence:
      // bare stone looks identical either way.
      expect(missing).not.toContain("never rose");
    });

    it("names the band, its score, its date, and how much window there was", () => {
      const label = highWaterMarkLabel({
        band: "FRACTURE",
        severity: 3,
        score: 31,
        at: Date.UTC(2026, 6, 20),
        sampleCount: 9,
        spanDays: 9,
        unavailable: false,
      });

      expect(label).toBe("FRACTURE at PSI 31 on 2026-07-20; 9 days on record");
    });

    it("never claims thirty days it does not have", () => {
      expect(highWaterMarkLabel({
        band: "TREMOR",
        severity: 2,
        score: null,
        at: null,
        sampleCount: 1,
        spanDays: 0,
        unavailable: false,
      })).toContain("a single reading on record");
    });

    it("puts a Worst band, 30d row on the lighthouse in every state", () => {
      for (const node of [lighthouse(), lighthouse({ highWaterMark: {
        band: "CRISIS", severity: 4, score: 12, at: null, sampleCount: 5, spanDays: 5, unavailable: false,
      } })]) {
        expect(detailForLighthouse(node).facts
          .some((fact) => fact.label === "Worst band, 30d")).toBe(true);
      }
    });

    it("puts the slow 30-day garden record on the lighthouse", () => {
      const detail = detailForLighthouse({
        id: "lighthouse",
        kind: "lighthouse",
        label: "Pharos lighthouse",
        tile: { x: 1, y: 1 },
        psiBand: "STEADY",
        score: 82,
        color: "#ffffff",
        unavailable: false,
        detailId: "lighthouse",
        gardenMonthRecord: { averagePsi: 84.5, growth: 1, sampleCount: 30, spanDays: 29, unavailable: false },
      });
      expect(detail.facts).toContainEqual({
        label: "Garden record, 30d",
        value: "Flourishing — blossoms open and moss greens; average PSI 84.5; 29 days on record",
      });
    });
  });

  describe("3d — beam bearing", () => {
    it("has no row when the index named no contributor", () => {
      expect(beamDwellLabel(undefined)).toBeNull();
      expect(detailForLighthouse(lighthouse()).facts
        .some((fact) => fact.label === "Beam bearing")).toBe(false);
    });

    it("states the arithmetic and never an accusation", () => {
      const label = beamDwellLabel({ shipId: "usdx", symbol: "USDX", bps: -412 })!;

      expect(label).toBe("Holding on USDX, largest PSI contributor (-412 bps)");
      // The wording is fixed everywhere: being the largest term in a weighted
      // sum is arithmetic, not fault.
      expect(label).not.toMatch(/\b(blame|fault|culprit|responsible|guilty|worst offender)\b/i);
    });

    it("puts the bearing on the lighthouse panel beside the contributor list", () => {
      const detail = detailForLighthouse(lighthouse({
        beamDwell: { shipId: "usdx", symbol: "USDX", bps: -412 },
        contributors: [{ id: "usdx", symbol: "USDX", bps: -412, mcapUsd: 9e8 }],
      }));

      expect(detail.facts).toContainEqual({
        label: "Beam bearing",
        value: "Holding on USDX, largest PSI contributor (-412 bps)",
      });
      // The existing contributor rows stay the ground truth; the beam only
      // points at the one they already list first.
      expect(detail.members?.[0]?.id).toBe("usdx");
    });
  });
});

function crossBearingShip(): ShipNode {
  return {
    id: "usdx",
    kind: "ship",
    label: "USDX",
    symbol: "USDX",
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
      hullForm: { beam: 1, height: 1, length: 1, waterline: 0 },
      hull: "treasury-galleon",
      classLabel: "CeFi",
      livery: {
        accent: "#27b6a5",
        label: "USDX livery",
        logoMatte: "#f7fffb",
        logoShape: "circle",
        primary: "#009393",
        sailColor: "#d8efe7",
        sailPanel: "center",
        secondary: "#005f61",
        source: "peg-fallback",
        stripePattern: "double",
      },
      sailColor: "#d8efe7",
      overlay: "none",
      sizeTier: "titan",
      sizeLabel: "Titan class",
      scale: 1,
    },
    change24hUsd: null,
    change24hPct: null,
    detailId: "ship.usdx",
  };
}
