import { expect, it } from "vitest";
import { makeCoins } from "./test-fixtures";

it("extends the existing fleet with deterministic small hulls for a 657-boat benchmark", () => {
  const base = makeCoins(), full = makeCoins({ n: 657 });
  expect(base).toHaveLength(625);
  expect(full).toHaveLength(657);
  expect(full.slice(0, base.length)).toEqual(base);
  expect(new Set(full.map((coin) => coin.id)).size).toBe(657);
  expect(full).toEqual(makeCoins({ n: 657 }));
});
