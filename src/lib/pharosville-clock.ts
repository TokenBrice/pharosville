export const PHAROSVILLE_DAY_HOUR = 12;
export const PHAROSVILLE_NIGHT_HOUR = 22;

export function normalizeHour(hour: number | null | undefined, fallback = PHAROSVILLE_DAY_HOUR): number {
  const value = typeof hour === "number" && Number.isFinite(hour) ? hour : fallback;
  return ((value % 24) + 24) % 24;
}

export function formatHourLabel(hour: number): string {
  const totalMinutes = Math.round(normalizeHour(hour) * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function readTestWallClockOverrideHour(): number | null {
  const override = globalThis.__pharosVilleTestWallClockHour;
  if (typeof override !== "number" || !Number.isFinite(override)) return null;
  return normalizeHour(override);
}

export function writeTestWallClockOverrideHour(hour: number): void {
  globalThis.__pharosVilleTestWallClockHour = normalizeHour(hour);
}

export function clearTestWallClockOverrideHour(): void {
  delete (globalThis as { __pharosVilleTestWallClockHour?: number }).__pharosVilleTestWallClockHour;
}

export function restoreTestWallClockOverrideHour(previous: number | undefined): void {
  if (previous === undefined) {
    clearTestWallClockOverrideHour();
    return;
  }
  writeTestWallClockOverrideHour(previous);
}

export function resolveWallClockHour(input: {
  manualTimeOverrideHour?: number | null;
  nightMode?: boolean;
} = {}): number {
  return normalizeHour(
    input.manualTimeOverrideHour
      ?? readTestWallClockOverrideHour()
      ?? (input.nightMode ? PHAROSVILLE_NIGHT_HOUR : PHAROSVILLE_DAY_HOUR),
  );
}
