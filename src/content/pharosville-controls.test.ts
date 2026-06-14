import { describe, expect, it } from "vitest";
import { PHAROSVILLE_CONTROL_ACTIONS, PHAROSVILLE_CONTROL_GROUPS } from "./pharosville-controls";

describe("PharosVille controls content", () => {
  it("exports stable, appendable control groups", () => {
    expect(PHAROSVILLE_CONTROL_GROUPS.map((group) => group.id)).toEqual([
      "inspect",
      "camera",
      "time",
      "panels",
    ]);
    expect(PHAROSVILLE_CONTROL_ACTIONS.length).toBeGreaterThan(10);
  });

  it("keeps action ids unique for later palette wiring", () => {
    const ids = PHAROSVILLE_CONTROL_ACTIONS.map((action) => action.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("describes keyboard and mouse world actions as structured inputs", () => {
    expect(PHAROSVILLE_CONTROL_ACTIONS).toContainEqual(
      expect.objectContaining({
        id: "focus-next-target",
        inputs: [expect.objectContaining({ kind: "keyboard", tokens: ["Tab"] })],
      }),
    );
    expect(PHAROSVILLE_CONTROL_ACTIONS).toContainEqual(
      expect.objectContaining({
        id: "zoom-map",
        inputs: expect.arrayContaining([
          expect.objectContaining({ kind: "mouse", label: "Mouse wheel" }),
          expect.objectContaining({ kind: "keyboard", tokens: ["+", "="] }),
          expect.objectContaining({ kind: "keyboard", tokens: ["-", "_"] }),
        ]),
      }),
    );
  });
});
