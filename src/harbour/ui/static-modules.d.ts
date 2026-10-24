declare module "virtual:pharosville-cemetery" {
  import type { CemeteryScenery } from "@/harbour/ui/static-data";
  const rows: CemeteryScenery[];
  export default rows;
}

declare module "virtual:pharosville-prelaunch" {
  const book: { coins: Array<Record<string, unknown>> };
  export default book;
}
