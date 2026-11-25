declare module "virtual:pharosville-cemetery" {
  import type { CemeteryScenery } from "@/harbour/ui/static-data";
  const rows: CemeteryScenery[];
  export default rows;
}

declare module "virtual:pharosville-prelaunch" {
  const book: { coins: Array<Record<string, unknown>> };
  export default book;
}

declare module "virtual:pharosville-listing-policy" {
  export interface ListingPolicyFundMeta {
    navToken: boolean;
    pegCurrency: string;
    archetype: string | null;
    backedIds: string[];
    liveAdapterBackedIds?: string[];
  }
  export interface ListingPolicyVariant {
    id: string;
    symbol: string;
    name: string;
    kind: string;
  }
  export interface ListingPolicyData {
    policyVersion: string;
    fundIds: string[];
    reviewHoldIds: string[];
    variantIds: string[];
    excludedIds: string[];
    frozenIds: string[];
    funds: Record<string, ListingPolicyFundMeta>;
    variantsByParent: Record<string, ListingPolicyVariant[]>;
  }
  const policy: ListingPolicyData;
  export default policy;
}
