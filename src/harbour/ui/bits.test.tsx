// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { expect, it } from "vitest";
import { chainLogo, Crest, Logo, stamped } from "./bits";

it("only returns chain logo URLs for existing assets", () => {
  expect(chainLogo("Ethereum")).toBe("/chains/ethereum.svg");
  expect(chainLogo("Hyperliquid L1")).toBe("/chains/hyperliquid-l1.svg");
  for (const chain of ["Pharos", "Pharos Network"]) {
    expect(chainLogo(chain)).toBeNull();
    const { container, unmount } = render(<><Logo src={chainLogo(chain)} label={chain} color="blue" /><Crest chain={chain} color="blue" /></>);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toBe("PhPh");
    unmount();
  }
});

it("keeps a reading's UTC stamp unbreakable without changing the sentence (UI AD N2)", () => {
  const sentence = "Supply (USD): current. Updated 2026-11-09 04:15:46 UTC.";
  const { container } = render(<p>{stamped(sentence)}</p>);
  expect(container.textContent).toBe(sentence);
  const stamps = container.querySelectorAll(".hb-stamp");
  expect([...stamps].map((s) => s.textContent)).toEqual(["2026-11-09 04:15:46 UTC"]);
  expect(stamped("Chain comparisons: unavailable. Source freshness is unverified.")).toBe("Chain comparisons: unavailable. Source freshness is unverified.");
});
