import { describe, expect, it } from "vitest";
import { renderedPresentation } from "./presentation";

const ready = { revision: 3, boats: 657, prepared: true };

describe("A17 display completeness", () => {
  it("treats view culling after the full pose as a complete display", () => {
    expect(renderedPresentation({ revision: 3, boats: 282, drawn: 657 }, ready, false))
      .toEqual({ status: "complete", revision: 3, displayed: 657, expected: 657 });
  });
  it("reports a revision whose drawable fleet is short as partial", () => {
    expect(renderedPresentation({ revision: 3, boats: 280, drawn: 640 }, ready, false).status).toBe("partial");
  });
  it("falls back to submissions without a drawable count and waits for the matching revision", () => {
    expect(renderedPresentation({ revision: 3, boats: 657 }, ready, false).status).toBe("complete");
    expect(renderedPresentation({ revision: 2, boats: 657, drawn: 657 }, ready, false).status).toBe("pending");
    expect(renderedPresentation({ revision: 3, boats: 657, drawn: 657 }, ready, true).status).toBe("failed");
  });
});
