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

  // The session hour is a key press now. Telling visitors to type a parameter
  // into the address bar is not an affordance, and nothing should reintroduce
  // it — the `t=` link itself still works, undocumented as a thing to hand-edit.
  it("documents the time-of-day keys instead of hand-editing the address", () => {
    expect(PHAROSVILLE_CONTROL_ACTIONS).toContainEqual(
      expect.objectContaining({
        id: "nudge-session-hour",
        inputs: [
          expect.objectContaining({ kind: "keyboard", tokens: ["["] }),
          expect.objectContaining({ kind: "keyboard", tokens: ["]"] }),
        ],
      }),
    );
    for (const action of PHAROSVILLE_CONTROL_ACTIONS) {
      expect(action.summary).not.toContain("t=");
      for (const input of action.inputs) {
        expect(input.label).not.toContain("t=");
      }
    }
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
