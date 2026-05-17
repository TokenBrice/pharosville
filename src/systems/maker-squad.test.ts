import { describe, expect, it } from "vitest";
import {
  ETHENA_SQUAD,
  MAKER_SQUAD,
  SKY_SQUAD,
  STABLECOIN_SQUADS,
  STABLECOIN_SQUAD_MEMBER_IDS,
  SQUAD_CONSORT_HEADING_LAG_TAU_SECONDS,
  SQUAD_FORMATION_GAIN_ARRIVING,
  SQUAD_FORMATION_GAIN_CALM_CRUISING,
  SQUAD_FORMATION_GAIN_DEFAULT,
  formationGain,
  isSquadMember,
  squadConsortHeadingLerpAlpha,
  squadForMember,
  squadFormationOffsetForPlacement,
  squadRole,
} from "./maker-squad";

describe("stablecoin squads", () => {
  it("defines three squads: Sky (USDS+sUSDS+stUSDS), Maker (DAI+sDAI), and Ethena (USDe+sUSDe)", () => {
    expect(STABLECOIN_SQUADS).toHaveLength(3);
    expect(SKY_SQUAD.id).toBe("sky");
    expect(SKY_SQUAD.flagshipId).toBe("usds-sky");
    expect([...SKY_SQUAD.memberIds].sort()).toEqual(["stusds-sky", "susds-sky", "usds-sky"]);
    expect(MAKER_SQUAD.id).toBe("maker");
    expect(MAKER_SQUAD.flagshipId).toBe("dai-makerdao");
    expect([...MAKER_SQUAD.memberIds].sort()).toEqual(["dai-makerdao", "sdai-sky"]);
    expect(ETHENA_SQUAD.id).toBe("ethena");
    expect(ETHENA_SQUAD.flagshipId).toBe("usde-ethena");
    expect([...ETHENA_SQUAD.memberIds].sort()).toEqual(["susde-ethena", "usde-ethena"]);
    expect(STABLECOIN_SQUAD_MEMBER_IDS).toHaveLength(7);
  });

  it("identifies members and non-members", () => {
    expect(isSquadMember("usds-sky")).toBe(true);
    expect(isSquadMember("dai-makerdao")).toBe(true);
    expect(isSquadMember("usdt-tether")).toBe(false);
  });

  it("routes each member to their own squad", () => {
    expect(squadForMember("usds-sky")).toBe(SKY_SQUAD);
    expect(squadForMember("susds-sky")).toBe(SKY_SQUAD);
    expect(squadForMember("stusds-sky")).toBe(SKY_SQUAD);
    expect(squadForMember("dai-makerdao")).toBe(MAKER_SQUAD);
    expect(squadForMember("sdai-sky")).toBe(MAKER_SQUAD);
    expect(squadForMember("usdt-tether")).toBeNull();
  });

  it("assigns flagship/consort roles per squad", () => {
    expect(squadRole("usds-sky")).toBe("flagship");
    expect(squadRole("dai-makerdao")).toBe("flagship");
    expect(squadRole("susds-sky")).toBe("consort");
    expect(squadRole("sdai-sky")).toBe("consort");
    expect(squadRole("usdt-tether")).toBeNull();
  });

  it("returns deterministic, distinct formation offsets within each squad", () => {
    for (const squad of STABLECOIN_SQUADS) {
      const offsets = squad.memberIds.map((id) => squad.formationOffsets[id]!);
      const keys = offsets.map((o) => `${o.dx}.${o.dy}`);
      expect(new Set(keys).size).toBe(squad.memberIds.length);
      expect(squad.formationOffsets[squad.flagshipId]).toEqual({ dx: 0, dy: 0 });
    }
  });

  it("places stUSDS as the Sky-squad forward vanguard (dy < 0, ahead of sUSDS)", () => {
    const stUsds = SKY_SQUAD.formationOffsets["stusds-sky"]!;
    const sUsds = SKY_SQUAD.formationOffsets["susds-sky"]!;
    expect(stUsds.dy).toBeLessThan(0);
    expect(stUsds.dy).toBeLessThan(sUsds.dy);
  });

  it("contracts the formation in tight water placements", () => {
    const baseDai = MAKER_SQUAD.formationOffsets["sdai-sky"]!;
    const tightDai = squadFormationOffsetForPlacement("sdai-sky", MAKER_SQUAD, "storm-shelf");
    expect(tightDai).not.toBeNull();
    expect(Math.abs(tightDai!.dx)).toBeLessThanOrEqual(Math.abs(baseDai.dx));
    expect(Math.abs(tightDai!.dy)).toBeLessThanOrEqual(Math.abs(baseDai.dy));
    // open water passes through unchanged
    expect(squadFormationOffsetForPlacement("sdai-sky", MAKER_SQUAD, "safe-harbor")).toEqual(baseDai);
  });
});

describe("W4.24 formationGain", () => {
  it("fans out the formation while the flagship cruises the calm zone", () => {
    expect(formationGain({
      zone: "calm",
      flagshipSpeed: 0.5,
      flagshipState: "sailing",
      placement: "safe-harbor",
    })).toBe(SQUAD_FORMATION_GAIN_CALM_CRUISING);
    expect(SQUAD_FORMATION_GAIN_CALM_CRUISING).toBeCloseTo(1.4, 6);
  });

  it("tightens the formation into single-file while arriving", () => {
    expect(formationGain({
      zone: "calm",
      flagshipSpeed: 0.3,
      flagshipState: "arriving",
      placement: "safe-harbor",
    })).toBe(SQUAD_FORMATION_GAIN_ARRIVING);
    expect(SQUAD_FORMATION_GAIN_ARRIVING).toBeCloseTo(0.55, 6);
  });

  it("returns the default gain in other zones and states", () => {
    expect(formationGain({
      zone: "warning",
      flagshipSpeed: 0.5,
      flagshipState: "sailing",
      placement: "outer-rough-water",
    })).toBe(SQUAD_FORMATION_GAIN_DEFAULT);
    expect(formationGain({
      zone: "calm",
      flagshipSpeed: 0,
      flagshipState: "moored",
      placement: "safe-harbor",
    })).toBe(SQUAD_FORMATION_GAIN_DEFAULT);
    expect(formationGain({
      zone: "calm",
      flagshipSpeed: 0,
      flagshipState: "departing",
      placement: "safe-harbor",
    })).toBe(SQUAD_FORMATION_GAIN_DEFAULT);
  });

  it("clamps the gain at 1.0 in tight placements so consorts cannot fan beyond their water set", () => {
    // Tight placement keeps the existing halved offset; gain must not push
    // it back outward beyond the cap.
    expect(formationGain({
      zone: "calm",
      flagshipSpeed: 0.5,
      flagshipState: "sailing",
      placement: "storm-shelf",
    })).toBe(SQUAD_FORMATION_GAIN_DEFAULT);
    expect(formationGain({
      zone: "calm",
      flagshipSpeed: 0.5,
      flagshipState: "sailing",
      placement: "harbor-mouth-watch",
    })).toBe(SQUAD_FORMATION_GAIN_DEFAULT);
    // Arriving under tight placement: keep the existing tight cap (1.0) so
    // we never expand and never collapse beyond it either.
    expect(formationGain({
      zone: "calm",
      flagshipSpeed: 0.3,
      flagshipState: "arriving",
      placement: "storm-shelf",
    })).toBeLessThanOrEqual(SQUAD_FORMATION_GAIN_DEFAULT);
  });
});

describe("W4.24 squadConsortHeadingLerpAlpha (lagged heading)", () => {
  it("uses a 0.6s time constant", () => {
    expect(SQUAD_CONSORT_HEADING_LAG_TAU_SECONDS).toBeCloseTo(0.6, 6);
  });

  it("returns 0 for non-positive dt and converges to 1 over long dt", () => {
    expect(squadConsortHeadingLerpAlpha(0)).toBe(0);
    expect(squadConsortHeadingLerpAlpha(-0.1)).toBe(0);
    expect(squadConsortHeadingLerpAlpha(60)).toBe(1);
  });

  it("at dt = TAU returns 1 - 1/e ≈ 0.632", () => {
    expect(squadConsortHeadingLerpAlpha(SQUAD_CONSORT_HEADING_LAG_TAU_SECONDS)).toBeCloseTo(1 - Math.exp(-1), 6);
  });

  it("converges to within 1% after about 5 time constants", () => {
    expect(squadConsortHeadingLerpAlpha(5 * SQUAD_CONSORT_HEADING_LAG_TAU_SECONDS)).toBeGreaterThan(0.99);
  });
});
