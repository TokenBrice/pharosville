import { describe, expect, it } from "vitest";
import { validateVariantRelationships } from "@shared/lib/stablecoins/validate-variants";
import type { StablecoinMeta, VariantKind } from "@shared/types";

function meta(input: {
  id: string;
  navToken?: boolean;
  pegReferenceId?: string;
  status?: "active" | "pre-launch" | "frozen";
  variantKind?: VariantKind;
  variantOf?: string;
}): StablecoinMeta {
  return {
    id: input.id,
    flags: {
      navToken: input.navToken ?? false,
    },
    pegReferenceId: input.pegReferenceId,
    status: input.status ?? "active",
    variantKind: input.variantKind,
    variantOf: input.variantOf,
  } as StablecoinMeta;
}

describe("validateVariantRelationships", () => {
  it("accepts active variants with active parents", () => {
    expect(validateVariantRelationships([
      meta({ id: "parent" }),
      meta({
        id: "child",
        navToken: true,
        pegReferenceId: "parent",
        variantKind: "savings-passthrough",
        variantOf: "parent",
      }),
    ])).toEqual([]);
  });

  it("rejects frozen variants because runtime active assets exclude them", () => {
    const errors = validateVariantRelationships([
      meta({ id: "parent" }),
      meta({
        id: "frozen-child",
        navToken: true,
        pegReferenceId: "parent",
        status: "frozen",
        variantKind: "savings-passthrough",
        variantOf: "parent",
      }),
    ]);

    expect(errors).toContain("frozen-child: only active assets may declare variantOf / variantKind");
  });

  it("rejects frozen variant parents", () => {
    const errors = validateVariantRelationships([
      meta({ id: "frozen-parent", status: "frozen" }),
      meta({
        id: "child",
        navToken: true,
        pegReferenceId: "frozen-parent",
        variantKind: "savings-passthrough",
        variantOf: "frozen-parent",
      }),
    ]);

    expect(errors).toContain("child: variantOf must point to an active tracked stablecoin");
  });
});
