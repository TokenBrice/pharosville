const ALREADY_COMPACT = /^\$[\d.]+[KMBT]$/i;

export function compactCurrency(input: string): string {
  if (!input) return input;
  if (ALREADY_COMPACT.test(input)) return input;
  const parsed = Number(input.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(parsed)) return input;
  if (parsed < 1_000_000) return input;
  if (parsed >= 1_000_000_000_000) return `$${(parsed / 1_000_000_000_000).toFixed(1)}T`;
  if (parsed >= 1_000_000_000) return `$${(parsed / 1_000_000_000).toFixed(1)}B`;
  return `$${(parsed / 1_000_000).toFixed(1)}M`;
}

const CALM_ZONE = /^calm/i;
const IDLE_SUFFIX = /\s+idle\s*$/i;

export interface CurrentlyParts {
  position?: string | null;
  area?: string | null;
  zone?: string | null;
}

export function composeCurrently(parts: CurrentlyParts): string {
  const position = parts.position?.trim() ?? "";
  const area = parts.area?.trim() ?? "";
  const zone = parts.zone?.trim() ?? "";

  if (zone && CALM_ZONE.test(zone) && area) {
    const isIdle = position && IDLE_SUFFIX.test(position);
    return isIdle ? `${area} (idle)` : area;
  }

  if (position) return position;
  if (area) return area;
  return "";
}
