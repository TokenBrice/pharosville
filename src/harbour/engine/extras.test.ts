import { afterEach, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

it.each([
  ["", ["mirror"]],
  ["?extras=none", ["crowns", "twilight", "nightsky", "storm", "precip", "score", "mirror", "supersample"]],
  ["?extras=all", []],
  ["?extras=-crowns,+mirror,-score,+score", ["crowns"]],
  ["?extras=-unknown,+unknown,crowns", ["mirror"]],
  ["?extras=-mirror,+mirror,-mirror", ["mirror"]],
  ["?extras=%2Bmirror,-precip", ["precip"]],
])("reads %s once per boot, including in production", async (search, disabled) => {
  vi.stubEnv("PROD", true);
  vi.stubGlobal("location", { search });
  vi.resetModules();
  const { EXTRA_NAMES, extraEnabled } = await import("./extras");
  expect(EXTRA_NAMES.filter((name) => !extraEnabled(name))).toEqual(disabled);
  location.search = "?extras=none";
  expect(EXTRA_NAMES.filter((name) => !extraEnabled(name))).toEqual(disabled);
});
