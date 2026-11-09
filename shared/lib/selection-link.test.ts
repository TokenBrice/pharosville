import { describe, expect, it } from "vitest";
import { canonicalSubjectUrl, formatSubject, parseSubject, parseSubjectUrl, pickToSubject, subjectToPick, type SubjectKind } from "./selection-link";

describe("durable subject codec", () => {
  for (const kind of ["ship", "chain", "yard", "wreck", "place"] as SubjectKind[]) {
    it(`round trips ${kind} without resolving membership`, () => {
      const subject = { kind, id: "not-in-a-registry" };
      expect(parseSubject(formatSubject(subject))).toEqual(subject);
      expect(pickToSubject(subjectToPick(subject))).toEqual(subject);
      expect(parseSubjectUrl(new URL(canonicalSubjectUrl(subject, true)))).toEqual({ subject, chart: true, obsolete: false, invalid: false });
    });
  }
  it.each([
    ["", null, false],
    ["?chart=1", null, false],
    ["?sel=bogus", null, true],
    ["?sel=", null, true],
    ["#sel=bogus", null, true],
    ["?sel=bogus#sel=ship.usdc-circle", null, true],
    ["?sel=ship.usdc-circle", { kind: "ship", id: "usdc-circle" }, false],
  ])("distinguishes absent, invalid and valid intent in %s", (tail, subject, invalid) => {
    expect(parseSubjectUrl(new URL(`https://example.org/${tail}`))).toMatchObject({ subject, invalid });
  });
  it("keeps legacy ships and the lighthouse, and marks the removed pigeonnier", () => {
    expect(parseSubject("ship.usdc-circle")).toEqual({ kind: "ship", id: "usdc-circle" });
    expect(canonicalSubjectUrl(parseSubject("lighthouse"))).toBe("https://pharosville.pharos.watch/?sel=place.pharos");
    expect(parseSubjectUrl(new URL("https://example.org/#sel=pigeonnier"))).toMatchObject({ subject: null, obsolete: true });
  });
  it("reads the legacy hash only when the query has no sel", () => {
    const read = (tail: string) => parseSubjectUrl(new URL(`https://example.org/${tail}`));
    expect(read("#sel=ship.usdc-circle&chart=1")).toMatchObject({ subject: { kind: "ship", id: "usdc-circle" }, chart: true });
    expect(read("?sel=chain.ethereum#sel=ship.usdc-circle").subject?.kind).toBe("chain");
    expect(read("?sel=#sel=ship.usdc-circle").subject).toBeNull();
    expect(read("?sel=bogus#sel=ship.usdc-circle").subject).toBeNull();
    expect(read("?chart=0#sel=ship.usdc-circle&chart=1").chart).toBe(false);
  });
  it("rejects case, unbounded, unknown-kind, escaped and markup-shaped inputs", () => {
    expect(parseSubject(`ship.${"a".repeat(123)}`)).not.toBeNull();
    for (const raw of [null, "", `ship.${"a".repeat(124)}`, "SHIP.usdc", "ship.USDC", "boat.usdc", "dock.ethereum", "ship..usdc", "ship.usdc-", "ship.usdc\n", "ship.usdc%2Dcircle", "ship.%253Cscript%253E", '<img src=x>', 'ship.usdc"', "ship.a/b", "chain.OP Mainnet", "ship.a+b"]) {
      expect(parseSubject(raw), String(raw)).toBeNull();
    }
    expect(parseSubjectUrl(new URL("https://example.org/?sel=ship.%75sdc-circle")).subject?.id).toBe("usdc-circle");
    expect(parseSubjectUrl(new URL("https://example.org/?sel=ship.%3Cscript%3E")).subject).toBeNull();
  });
  it("emits only subject and optional chart at the canonical origin", () => {
    const link = parseSubjectUrl(new URL("https://evil.example/?sel=ship.usdc-circle&chart=1&cam=bad&t=22&quality=low&view=all#other"));
    expect(canonicalSubjectUrl(link.subject, link.chart)).toBe("https://pharosville.pharos.watch/?sel=ship.usdc-circle&chart=1");
    expect(canonicalSubjectUrl(null)).toBe("https://pharosville.pharos.watch/");
  });
});
