// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { stamped } from "./bits";

it("keeps a reading's UTC stamp unbreakable without changing the sentence (UI AD N2)", () => {
  const sentence = "Supply (USD): current. Updated 2026-11-09 04:15:46 UTC.";
  const { container } = render(<p>{stamped(sentence)}</p>);
  expect(container.textContent).toBe(sentence);
  const stamps = container.querySelectorAll(".hb-stamp");
  expect([...stamps].map((s) => s.textContent)).toEqual(["2026-11-09 04:15:46 UTC"]);
  expect(stamped("Chain comparisons: unavailable. Source freshness is unverified.")).toBe("Chain comparisons: unavailable. Source freshness is unverified.");
});
