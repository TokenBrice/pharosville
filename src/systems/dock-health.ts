import type { DockNode } from "./world-types";

/** W7.8: one renderer-neutral condition score from the reported chain factors. */
export function quayMasonryHealth(node: Pick<DockNode, "healthFactors">): number | null {
  const factors = node.healthFactors;
  if (!factors) return null;
  const values = [
    1 - factors.concentration,
    factors.quality,
    factors.pegStability,
    factors.backingDiversity,
    factors.chainEnvironment,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (values.length === 0) return null;
  return Math.max(0, Math.min(1, values.reduce((sum, value) => sum + value, 0) / values.length));
}

export function quayMasonryLabel(node: Pick<DockNode, "healthFactors">): string | null {
  const health = quayMasonryHealth(node);
  if (health === null) return null;
  const condition = health >= 0.75 ? "dressed granite and trimmed lanterns"
    : health >= 0.5 ? "weathered stone and serviceable fittings"
    : "cracked stone and a leaning bollard";
  return `${Math.round(health * 100)}/100 — ${condition}`;
}
