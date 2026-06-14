import { describe, expect, it } from "vitest";
import { LaunchMilestoneSchema } from "@shared/types/stablecoin-meta-schemas";

describe("stablecoin metadata URL schemas", () => {
  const baseMilestone = {
    date: "2026-06-14",
    type: "announcement",
    title: "Milestone",
  } as const;

  it.each([
    "https://example.com/postmortem",
    "http://example.com/postmortem",
  ])("accepts http(s) sourceUrl values: %s", (sourceUrl) => {
    expect(LaunchMilestoneSchema.safeParse({ ...baseMilestone, sourceUrl }).success).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<h1>bad</h1>",
    "not a url",
  ])("rejects non-http(s) sourceUrl values: %s", (sourceUrl) => {
    expect(LaunchMilestoneSchema.safeParse({ ...baseMilestone, sourceUrl }).success).toBe(false);
  });
});
