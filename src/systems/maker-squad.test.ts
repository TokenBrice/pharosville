import { describe, expect, it } from "vitest";
import {
  MAKER_SQUAD,
  SKY_SQUAD,
  STABLECOIN_SQUADS,
  STABLECOIN_SQUAD_MEMBER_IDS,
  isSquadMember,
  squadForMember,
  squadFormationOffsetForPlacement,
  squadRole,
} from "./maker-squad";

describe("stablecoin squads", () => {
  it("defines two squads: Sky (USDS+sUSDS+stUSDS) and Maker (DAI+sDAI)", () => {
    expect(STABLECOIN_SQUADS).toHaveLength(2);
    expect(SKY_SQUAD.id).toBe("sky");
    expect(SKY_SQUAD.flagshipId).toBe("usds-sky");
    expect([...SKY_SQUAD.memberIds].sort()).toEqual(["stusds-sky", "susds-sky", "usds-sky"]);
    expect(MAKER_SQUAD.id).toBe("maker");
    expect(MAKER_SQUAD.flagshipId).toBe("dai-makerdao");
    expect([...MAKER_SQUAD.memberIds].sort()).toEqual(["dai-makerdao", "sdai-sky"]);
    expect(STABLECOIN_SQUAD_MEMBER_IDS).toHaveLength(5);
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
