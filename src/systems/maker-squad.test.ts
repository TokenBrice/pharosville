import { describe, expect, it } from "vitest";
import {
  MAKER_SQUAD_FLAGSHIP_ID,
  MAKER_SQUAD_MEMBER_IDS,
  isMakerSquadMember,
  makerSquadFormationOffset,
  makerSquadFormationOffsetForPlacement,
  makerSquadRole,
} from "./maker-squad";

describe("maker-squad", () => {
  it("has USDS as flagship and four consorts", () => {
    expect(MAKER_SQUAD_FLAGSHIP_ID).toBe("usds-sky");
    expect(MAKER_SQUAD_MEMBER_IDS).toHaveLength(5);
    expect(MAKER_SQUAD_MEMBER_IDS).toEqual(
      expect.arrayContaining(["usds-sky", "dai-makerdao", "susds-sky", "sdai-sky", "stusds-sky"]),
    );
  });

  it("identifies members and non-members", () => {
    expect(isMakerSquadMember("usds-sky")).toBe(true);
    expect(isMakerSquadMember("dai-makerdao")).toBe(true);
    expect(isMakerSquadMember("usdt-tether")).toBe(false);
  });

  it("assigns flagship/consort roles", () => {
    expect(makerSquadRole("usds-sky")).toBe("flagship");
    expect(makerSquadRole("dai-makerdao")).toBe("consort");
    expect(makerSquadRole("usdt-tether")).toBeNull();
  });

  it("returns deterministic, distinct formation offsets per member", () => {
    const offsets = MAKER_SQUAD_MEMBER_IDS.map((id) => makerSquadFormationOffset(id));
    const keys = offsets.map((o) => `${o.dx}.${o.dy}`);
    expect(new Set(keys).size).toBe(MAKER_SQUAD_MEMBER_IDS.length);
    expect(makerSquadFormationOffset("usds-sky")).toEqual({ dx: 0, dy: 0 });
  });

  it("places stUSDS as the forward vanguard (dy < 0)", () => {
    const stUsds = makerSquadFormationOffset("stusds-sky");
    expect(stUsds.dy).toBeLessThan(0);
    expect(stUsds.dy).toBeLessThan(makerSquadFormationOffset("susds-sky").dy);
    expect(stUsds.dy).toBeLessThan(makerSquadFormationOffset("sdai-sky").dy);
  });

  it("contracts the formation in tight water placements", () => {
    const baseDai = makerSquadFormationOffset("dai-makerdao");
    const tightDai = makerSquadFormationOffsetForPlacement("dai-makerdao", "storm-shelf");
    expect(Math.abs(tightDai.dx)).toBeLessThanOrEqual(Math.abs(baseDai.dx));
    expect(Math.abs(tightDai.dy)).toBeLessThanOrEqual(Math.abs(baseDai.dy));
    expect(makerSquadFormationOffsetForPlacement("dai-makerdao", "safe-harbor")).toEqual(baseDai);
  });
});
