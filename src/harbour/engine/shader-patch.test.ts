import { describe, expect, it } from "vitest";
import { patch, ShaderPatchError } from "./shader-patch";

describe("checked shader patches", () => {
  it("rejects missing and duplicated anchors with a named id and cardinality", () => {
    for (const source of ["none", "anchor anchor"]) {
      expect(() => patch(source, "anchor", "new", { id: "fleet.pose" })).toThrow(ShaderPatchError);
      expect(() => patch(source, "anchor", "new", { id: "fleet.pose" })).toThrow(/fleet.pose: expected 1 anchor\(s\), found [02]/);
    }
  });
  it("supports an explicit repeated count and preserves replacement captures", () => {
    expect(patch("a a", "a", "b", { id: "repeated", count: 2 })).toBe("b b");
    expect(patch("a1 a2", /a(\d)/, "b$1", { id: "regex", count: 2 })).toBe("b1 b2");
    expect(() => patch("a1 a2", /a\d/g, "b", { id: "regex" })).toThrow(/found 2/);
  });
});
